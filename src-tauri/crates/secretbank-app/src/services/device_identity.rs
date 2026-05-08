//! Device identity service — ensures each app install has a persistent
//! ed25519 signing keypair stored in the age vault.
//!
//! ## First-run flow
//! 1. Vault is unlocked.
//! 2. Neither `device/signing_key` nor `device/id` exist in the vault.
//! 3. Generate a fresh `SigningKey`.
//! 4. Insert a new row into the `device` SQLite table.
//! 5. Write signing key bytes + ULID string to the vault, then flush.
//!
//! ## Subsequent runs
//! Both vault paths exist. Load them, verify SQLite consistency, return.
//!
//! ## Partial-state recovery
//! If exactly one of the two paths exists (e.g. after a crash mid-write),
//! the inconsistent state is logged and wiped before regenerating from scratch.

use std::sync::Arc;

use secretbank_core::{DeviceId, DeviceInput, DevicePlatform};
use secretbank_storage::sqlite::{repositories::device::DeviceRepo, SqlitePool};
use secretbank_storage::vault::{ExposeSecret, SecretBytes, VaultError, VaultStorage};
use ed25519_dalek::SigningKey;
use rand_core::OsRng;
use thiserror::Error;
use tokio::sync::RwLock;

const VAULT_PATH_SIGNING_KEY: &str = "device/signing_key";
const VAULT_PATH_DEVICE_ID: &str = "device/id";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/// The stable identity for this app installation.
#[derive(Debug, Clone)]
pub struct DeviceIdentity {
    pub device_id: DeviceId,
    pub signing_key: SigningKey,
}

impl DeviceIdentity {
    pub fn verifying_key(&self) -> ed25519_dalek::VerifyingKey {
        self.signing_key.verifying_key()
    }
}

#[derive(Debug, Error)]
pub enum DeviceIdentityError {
    #[error("vault locked — unlock before calling ensure_device_keys")]
    VaultLocked,

    #[error("vault error: {0}")]
    Vault(String),

    #[error("storage error: {0}")]
    Storage(String),

    #[error("corrupt signing key stored in vault (expected 32 bytes)")]
    CorruptKey,

    #[error(
        "inconsistent: vault has device_id {vault_id} but SQLite has no matching active device"
    )]
    InconsistentDevice { vault_id: String },
}

impl From<VaultError> for DeviceIdentityError {
    fn from(e: VaultError) -> Self {
        match e {
            VaultError::NotUnlocked => Self::VaultLocked,
            other => Self::Vault(other.to_string()),
        }
    }
}

impl From<secretbank_storage::sqlite::StorageError> for DeviceIdentityError {
    fn from(e: secretbank_storage::sqlite::StorageError) -> Self {
        Self::Storage(e.to_string())
    }
}

// ---------------------------------------------------------------------------
// Platform detection
// ---------------------------------------------------------------------------

/// Infer the current device's [`DevicePlatform`] from `std::env::consts::OS`.
pub fn detect_platform() -> DevicePlatform {
    match std::env::consts::OS {
        "windows" => DevicePlatform::DesktopWin,
        "macos" => DevicePlatform::Mac,
        "linux" => DevicePlatform::Linux,
        "ios" => DevicePlatform::Ios,
        "android" => DevicePlatform::Android,
        other => {
            tracing::warn!(
                os = other,
                "unknown OS — defaulting DevicePlatform to Linux"
            );
            DevicePlatform::Linux
        }
    }
}

// ---------------------------------------------------------------------------
// Core function
// ---------------------------------------------------------------------------

/// Ensure the current device has a persistent ed25519 signing keypair.
///
/// Must be called **after** the vault has been unlocked.
///
/// # Errors
/// - [`DeviceIdentityError::VaultLocked`] if the vault is not unlocked.
/// - [`DeviceIdentityError::InconsistentDevice`] if the vault contains a
///   device_id that is no longer present (and active) in SQLite.
pub async fn ensure_device_keys(
    vault: Arc<RwLock<Box<dyn VaultStorage + Send + Sync>>>,
    pool: &SqlitePool,
    device_name: impl Into<String>,
    platform: DevicePlatform,
) -> Result<DeviceIdentity, DeviceIdentityError> {
    let device_name = device_name.into();
    let mut vault_guard = vault.write().await;

    // Read both vault paths — None means NotFound, Err for other failures.
    let key_result = vault_guard.get_secret(VAULT_PATH_SIGNING_KEY).await;
    let id_result = vault_guard.get_secret(VAULT_PATH_DEVICE_ID).await;

    // Classify each result: Some(bytes) | None (NotFound) | Err
    let key_bytes_opt = match key_result {
        Ok(b) => Some(b),
        Err(VaultError::NotFound { .. }) => None,
        Err(e) => return Err(DeviceIdentityError::from(e)),
    };
    let id_bytes_opt = match id_result {
        Ok(b) => Some(b),
        Err(VaultError::NotFound { .. }) => None,
        Err(e) => return Err(DeviceIdentityError::from(e)),
    };

    match (key_bytes_opt, id_bytes_opt) {
        // --- Happy path: both exist ---
        (Some(key_bytes), Some(id_bytes)) => {
            let key_raw = key_bytes.expose_secret();
            if key_raw.len() != 32 {
                return Err(DeviceIdentityError::CorruptKey);
            }
            let key_arr: [u8; 32] = key_raw[..32].try_into().unwrap();
            let signing_key = SigningKey::from_bytes(&key_arr);

            let id_str = String::from_utf8(id_bytes.expose_secret().clone())
                .map_err(|e| DeviceIdentityError::Vault(format!("device/id UTF-8: {e}")))?;
            let device_id: DeviceId =
                id_str
                    .parse()
                    .map_err(|e: <DeviceId as std::str::FromStr>::Err| {
                        DeviceIdentityError::Vault(e.to_string())
                    })?;

            // Verify SQLite consistency
            let repo = DeviceRepo::new(pool);
            match repo.get_by_id(device_id).await? {
                Some(d) if d.status == secretbank_core::DeviceStatus::Active => {
                    return Ok(DeviceIdentity {
                        device_id,
                        signing_key,
                    });
                }
                _ => {
                    return Err(DeviceIdentityError::InconsistentDevice { vault_id: id_str });
                }
            }
        }

        // --- Partial state: inconsistent — wipe and regenerate ---
        (Some(_), None) | (None, Some(_)) => {
            tracing::warn!(
                "device identity in vault is in a partial state — wiping and regenerating"
            );
            // Best-effort cleanup; ignore NotFound errors on delete.
            let _ = vault_guard.delete_secret(VAULT_PATH_SIGNING_KEY).await;
            let _ = vault_guard.delete_secret(VAULT_PATH_DEVICE_ID).await;
            // Flush immediately so the wipe is persisted before we regenerate.
            // This is best-effort: if flush fails we log a warning and continue —
            // the partial-state wipe is idempotent and will be retried on next start.
            if let Err(e) = vault_guard.flush().await {
                tracing::warn!(
                    error = %e,
                    "device identity: partial-state wipe flush failed (will retry on next start)"
                );
            }
            // Fall through to first-run path below.
        }

        // --- First run: neither exists ---
        (None, None) => {}
    }

    // First-run (or post-wipe) path: generate + persist
    let signing_key = SigningKey::generate(&mut OsRng);
    let verifying_bytes = signing_key.verifying_key().to_bytes().to_vec();

    let repo = DeviceRepo::new(pool);
    let device_id = repo
        .insert(&DeviceInput {
            name: device_name,
            platform,
            public_key: verifying_bytes,
        })
        .await?;

    // Persist to vault
    let key_secret = SecretBytes::new(signing_key.to_bytes().to_vec());
    vault_guard
        .put_secret(VAULT_PATH_SIGNING_KEY, key_secret)
        .await?;

    let id_secret = SecretBytes::new(device_id.to_string().into_bytes());
    vault_guard
        .put_secret(VAULT_PATH_DEVICE_ID, id_secret)
        .await?;

    vault_guard.flush().await?;

    Ok(DeviceIdentity {
        device_id,
        signing_key,
    })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use secretbank_storage::sqlite::init_pool;
    use secretbank_storage::vault::mock::MockVaultStorage;
    use secretbank_storage::vault::{ExposeSecret, VaultStorage as _};
    use tokio::sync::RwLock;

    use super::*;

    /// Helper: build an unlocked MockVaultStorage wrapped in Arc<RwLock<Box<dyn…>>>.
    async fn unlocked_vault() -> Arc<RwLock<Box<dyn VaultStorage + Send + Sync>>> {
        let mut mock = MockVaultStorage::new("pw");
        mock.unlock(secrecy::SecretString::from("pw".to_owned()))
            .await
            .unwrap();
        Arc::new(RwLock::new(Box::new(mock)))
    }

    /// Helper: create a temp-dir SQLite pool with migrations applied.
    async fn make_pool() -> (tempfile::TempDir, sqlx::SqlitePool) {
        let dir = tempfile::tempdir().expect("tempdir");
        let db_path = dir.path().join("test.db");
        let pool = init_pool(&db_path).await.expect("init_pool");
        (dir, pool)
    }

    // -----------------------------------------------------------------------
    // 1. First call creates a new identity
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn ensure_creates_new_identity_on_first_call() {
        let vault = unlocked_vault().await;
        let (_dir, pool) = make_pool().await;

        let identity =
            ensure_device_keys(vault.clone(), &pool, "test-device", DevicePlatform::Linux)
                .await
                .expect("ensure_device_keys should succeed");

        // DeviceId is a valid ULID
        let id_str = identity.device_id.to_string();
        assert!(!id_str.is_empty(), "device_id must not be empty");

        // SQLite has exactly one active device row
        let repo = DeviceRepo::new(&pool);
        let active = repo.list_active().await.unwrap();
        assert_eq!(active.len(), 1, "expected 1 active device");

        let stored = &active[0];
        // Public key in SQLite matches the verifying key derived from signing key
        let expected_vk = identity.verifying_key().to_bytes().to_vec();
        assert_eq!(
            stored.public_key, expected_vk,
            "public_key must match verifying key"
        );

        // Vault has both paths
        let vault_guard = vault.read().await;
        let key_bytes = vault_guard
            .get_secret(VAULT_PATH_SIGNING_KEY)
            .await
            .expect("signing key must be in vault");
        assert_eq!(
            key_bytes.expose_secret().len(),
            32,
            "signing key must be 32 bytes"
        );

        let id_bytes = vault_guard
            .get_secret(VAULT_PATH_DEVICE_ID)
            .await
            .expect("device/id must be in vault");
        let stored_id_str = String::from_utf8(id_bytes.expose_secret().clone()).unwrap();
        assert_eq!(
            stored_id_str, id_str,
            "vault device/id must match returned device_id"
        );
    }

    // -----------------------------------------------------------------------
    // 2. Second call returns the same identity
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn ensure_returns_same_identity_on_second_call() {
        let vault = unlocked_vault().await;
        let (_dir, pool) = make_pool().await;

        let first = ensure_device_keys(vault.clone(), &pool, "device", DevicePlatform::Linux)
            .await
            .expect("first call");

        let second = ensure_device_keys(vault.clone(), &pool, "device", DevicePlatform::Linux)
            .await
            .expect("second call");

        assert_eq!(
            first.device_id.to_string(),
            second.device_id.to_string(),
            "device_id must be stable across calls"
        );
        assert_eq!(
            first.signing_key.to_bytes(),
            second.signing_key.to_bytes(),
            "signing_key bytes must be identical"
        );

        // Still exactly one device in SQLite
        let repo = DeviceRepo::new(&pool);
        let active = repo.list_active().await.unwrap();
        assert_eq!(
            active.len(),
            1,
            "second call must not create a duplicate device row"
        );
    }

    // -----------------------------------------------------------------------
    // 3. Locked vault returns VaultLocked error
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn ensure_fails_when_vault_locked() {
        // Vault is NOT unlocked
        let mock = MockVaultStorage::new("pw");
        let vault: Arc<RwLock<Box<dyn VaultStorage + Send + Sync>>> =
            Arc::new(RwLock::new(Box::new(mock)));

        let (_dir, pool) = make_pool().await;

        let result =
            ensure_device_keys(vault.clone(), &pool, "device", DevicePlatform::Linux).await;

        assert!(
            matches!(result, Err(DeviceIdentityError::VaultLocked)),
            "locked vault must return VaultLocked, got: {result:?}"
        );
    }
}
