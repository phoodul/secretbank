//! Kill Switch commands — two-step credential revocation.
//!
//! # Flow
//!
//! 1. `kill_switch_request_confirm(cred_id)` — validates the credential exists,
//!    issues a 16-byte random hex token with a 5-minute TTL, and returns it.
//! 2. `kill_switch_revoke(cred_id, token, also_delete_value)` — consumes the
//!    token, updates credential status to `Revoked`, optionally deletes the
//!    age-vault secret, and records an audit entry.
//!
//! # Token consumption semantics
//!
//! `consume()` returns `false` if the token is unknown, expired, or belongs to
//! a *different* credential ID. Importantly, a wrong-cred-id mismatch does
//! **not** remove the token from the store — a typo in the ID field must not
//! silently burn the user's one-shot confirmation token.

use std::collections::HashMap;
use std::time::{Duration, Instant};

use api_vault_audit::AuditActor;
use api_vault_core::{CredentialId, CredentialPatch, CredentialStatus};
use api_vault_storage::sqlite::repositories::credential::CredentialRepo;
use api_vault_storage::vault::VaultError;
use rand::Rng;
use serde::{Deserialize, Serialize};
use tauri::State;
use thiserror::Error;
use tokio::sync::Mutex;

use crate::context::AppContext;

// ---------------------------------------------------------------------------
// Token store
// ---------------------------------------------------------------------------

/// Short-lived confirmation token with TTL.
#[derive(Debug, Clone)]
pub struct ConfirmToken {
    pub token: String,
    pub cred_id: CredentialId,
    pub expires_at: Instant,
}

/// In-memory TTL store keyed by token hex string.
///
/// Wrap in `Arc` so it can be shared through `AppContext`.
#[derive(Default)]
pub struct ConfirmTokenStore {
    inner: Mutex<HashMap<String, ConfirmToken>>,
}

impl ConfirmTokenStore {
    /// Issue a new random 16-byte hex token for `cred_id`, valid for `ttl`.
    ///
    /// Expired tokens are purged on every call (lazy GC).
    pub async fn issue(&self, cred_id: CredentialId, ttl: Duration) -> String {
        let bytes: [u8; 16] = rand::thread_rng().gen();
        let hex: String = bytes.iter().map(|b| format!("{:02x}", b)).collect();

        let mut guard = self.inner.lock().await;
        // Lazy GC: purge entries whose TTL has already elapsed.
        guard.retain(|_, v| v.expires_at > Instant::now());
        guard.insert(
            hex.clone(),
            ConfirmToken {
                token: hex.clone(),
                cred_id,
                expires_at: Instant::now() + ttl,
            },
        );
        hex
    }

    /// Consume the token, returning `true` if it was valid and matched `cred_id`.
    ///
    /// - Returns `false` (without removing the entry) if the token exists but
    ///   belongs to a different credential ID — a typo must not burn a valid token.
    /// - Returns `false` if the token is unknown or has expired.
    pub async fn consume(&self, token: &str, cred_id: &CredentialId) -> bool {
        let mut guard = self.inner.lock().await;

        // Check existence first.
        let entry = match guard.get(token) {
            Some(e) => e.clone(),
            None => return false,
        };

        // Expired?
        if entry.expires_at <= Instant::now() {
            guard.remove(token);
            return false;
        }

        // Wrong credential?
        if &entry.cred_id != cred_id {
            // Leave the entry in place — the caller may retry with the correct cred_id.
            return false;
        }

        // Valid — consume (one-shot).
        guard.remove(token);
        true
    }
}

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

#[derive(Debug, Error, Serialize)]
#[serde(tag = "code", rename_all = "snake_case")]
pub enum KillSwitchError {
    #[error("invalid credential id")]
    InvalidCredId,

    #[error("credential not found")]
    NotFound,

    #[error("invalid or expired confirmation token")]
    InvalidToken,

    #[error("vault locked")]
    VaultLocked,

    #[error("storage error: {message}")]
    Storage { message: String },

    #[error("internal: {message}")]
    Internal { message: String },
}

impl From<api_vault_storage::sqlite::StorageError> for KillSwitchError {
    fn from(e: api_vault_storage::sqlite::StorageError) -> Self {
        Self::Storage {
            message: e.to_string(),
        }
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Parse a ULID string into `CredentialId`, mapping errors to `InvalidCredId`.
fn parse_cred_id(s: &str) -> Result<CredentialId, KillSwitchError> {
    s.parse().map_err(|_| KillSwitchError::InvalidCredId)
}

/// Core revoke logic extracted so tests can call it without `State<>`.
pub async fn do_revoke(
    ctx: &AppContext,
    cred_id: CredentialId,
    token: &str,
    also_delete_value: bool,
) -> Result<(), KillSwitchError> {
    // 1. Validate token.
    let valid = ctx.kill_switch_tokens.consume(token, &cred_id).await;
    if !valid {
        return Err(KillSwitchError::InvalidToken);
    }

    // 2. Update credential status → Revoked.
    let repo = CredentialRepo::new(&ctx.pool);
    let patch = CredentialPatch {
        status: Some(CredentialStatus::Revoked),
        ..Default::default()
    };
    repo.update(cred_id, &patch).await?;

    // 3. Optionally delete vault secret.
    if also_delete_value {
        let vault_ref = format!("credentials/{cred_id}");
        let mut vault = ctx.vault.write().await;

        if !vault.is_unlocked().await {
            return Err(KillSwitchError::VaultLocked);
        }

        match vault.delete_secret(&vault_ref).await {
            Ok(()) => {}
            // If the secret was already gone, treat it as a no-op.
            Err(VaultError::NotFound { .. }) => {}
            Err(VaultError::NotUnlocked) => return Err(KillSwitchError::VaultLocked),
            Err(e) => {
                return Err(KillSwitchError::Storage {
                    message: e.to_string(),
                })
            }
        }

        vault.flush().await.map_err(|e| KillSwitchError::Storage {
            message: e.to_string(),
        })?;
    }

    // 4. Audit.
    let payload = serde_json::json!({ "also_delete_value": also_delete_value }).to_string();
    ctx.audit
        .record(
            AuditActor::LocalUser,
            "credential.revoke",
            "credential",
            cred_id.to_string(),
            Some(payload),
        )
        .await;

    Ok(())
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

/// Step 1 — request a one-time confirmation token.
///
/// Validates that the credential exists, then returns a 32-hex-char token
/// that is valid for 5 minutes.
#[tauri::command]
pub async fn kill_switch_request_confirm(
    cred_id: String,
    state: State<'_, AppContext>,
) -> Result<String, KillSwitchError> {
    let id = parse_cred_id(&cred_id)?;

    // Verify the credential exists.
    let repo = CredentialRepo::new(&state.pool);
    repo.get_by_id(id)
        .await
        .map_err(KillSwitchError::from)?
        .ok_or(KillSwitchError::NotFound)?;

    let token = state
        .kill_switch_tokens
        .issue(id, Duration::from_secs(300))
        .await;

    Ok(token)
}

/// Input payload for `kill_switch_revoke`.
#[derive(Debug, Deserialize)]
pub struct KillSwitchRevokeInput {
    pub cred_id: String,
    pub token: String,
    pub also_delete_value: bool,
}

/// Step 2 — consume the token and revoke the credential.
#[tauri::command]
pub async fn kill_switch_revoke(
    input: KillSwitchRevokeInput,
    state: State<'_, AppContext>,
) -> Result<(), KillSwitchError> {
    let id = parse_cred_id(&input.cred_id)?;
    do_revoke(&state, id, &input.token, input.also_delete_value).await
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use api_vault_core::{CredentialInput, CredentialStatus, Env, IssuerInput, IssuerId};
    use api_vault_storage::sqlite::repositories::credential::CredentialRepo;
    use api_vault_storage::sqlite::repositories::issuer::IssuerRepo;
    use api_vault_storage::vault::mock::MockVaultStorage;
    use api_vault_storage::vault::{SecretBytes, VaultStorage as _};
    use secrecy::SecretString;
    use tokio::sync::RwLock;
    use tokio::time::sleep;

    use crate::audit_ctx::AuditCtx;
    use crate::services::device_identity::DeviceIdentity;

    use super::*;

    // -----------------------------------------------------------------------
    // Test helpers
    // -----------------------------------------------------------------------

    async fn make_pool() -> (tempfile::TempDir, sqlx::SqlitePool) {
        let dir = tempfile::tempdir().expect("tempdir");
        let db_path = dir.path().join("test.db");
        let pool = api_vault_storage::sqlite::init_pool(&db_path)
            .await
            .expect("init_pool");
        (dir, pool)
    }

    async fn make_unlocked_vault() -> MockVaultStorage {
        let mut v = MockVaultStorage::new("pw");
        v.unlock(SecretString::from("pw".to_owned())).await.unwrap();
        v
    }

    /// Seed an issuer row (required by credential FK) and return its id.
    async fn seed_issuer(pool: &sqlx::SqlitePool) -> IssuerId {
        let repo = IssuerRepo::new(pool);
        repo.insert(&IssuerInput {
            slug: "test-issuer".to_string(),
            display_name: "Test Issuer".to_string(),
            docs_url: None,
            issue_url: None,
            status_url: None,
            security_feed_url: None,
            connector_id: None,
            icon_key: None,
        })
        .await
        .expect("issuer insert")
    }

    async fn seed_credential(pool: &sqlx::SqlitePool) -> CredentialId {
        let issuer_id = seed_issuer(pool).await;
        let repo = CredentialRepo::new(pool);
        let cred_id = CredentialId::new();
        let input = CredentialInput {
            issuer_id,
            name: "Test Key".to_string(),
            env: Env::Dev,
            scope: Some("read".to_string()),
            owner: None,
            rotation_policy_days: None,
            rotation_runbook_id: None,
            expires_at: None,
            hash_hint: None,
        };
        repo.insert_with_id(Some(cred_id), &input, format!("credentials/{cred_id}"))
            .await
            .expect("credential insert")
    }

    fn make_ctx(pool: Arc<sqlx::SqlitePool>, vault: MockVaultStorage) -> AppContext {
        let vault_box: Box<dyn api_vault_storage::vault::VaultStorage + Send + Sync> =
            Box::new(vault);
        let vault_arc = Arc::new(RwLock::new(vault_box));
        let device_identity: Arc<RwLock<Option<DeviceIdentity>>> =
            Arc::new(RwLock::new(None));
        let audit = Arc::new(AuditCtx::new(pool.clone(), device_identity.clone()));
        AppContext {
            vault: vault_arc,
            pool,
            data_dir: std::path::PathBuf::from("/tmp/test"),
            user_id: "test".to_string(),
            clipboard_controller: Arc::new(Mutex::new(None)),
            feed_scheduler: Arc::new(Mutex::new(None)),
            device_identity,
            audit,
            kill_switch_tokens: Arc::new(ConfirmTokenStore::default()),
        }
    }

    // -----------------------------------------------------------------------
    // T1: issue → consume immediately → true; second consume → false (one-shot)
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn token_store_issue_and_consume() {
        let store = ConfirmTokenStore::default();
        let cred_id = CredentialId::new();

        let token = store.issue(cred_id, Duration::from_secs(300)).await;

        // First consume: valid
        assert!(
            store.consume(&token, &cred_id).await,
            "first consume should succeed"
        );
        // Second consume: one-shot, must fail
        assert!(
            !store.consume(&token, &cred_id).await,
            "second consume should fail (one-shot)"
        );
    }

    // -----------------------------------------------------------------------
    // T2: consume with wrong cred_id → false, entry remains intact
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn token_store_consume_wrong_cred_id_leaves_entry() {
        let store = ConfirmTokenStore::default();
        let cred_a = CredentialId::new();
        let cred_b = CredentialId::new();

        let token = store.issue(cred_a, Duration::from_secs(300)).await;

        // Consume with wrong cred_id → must return false
        assert!(
            !store.consume(&token, &cred_b).await,
            "wrong cred_id should return false"
        );

        // Entry must still be there — consume with correct id must succeed
        assert!(
            store.consume(&token, &cred_a).await,
            "correct cred_id should succeed after wrong-id attempt"
        );
    }

    // -----------------------------------------------------------------------
    // T3: token expires after TTL
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn token_store_expires_after_ttl() {
        let store = ConfirmTokenStore::default();
        let cred_id = CredentialId::new();

        let token = store.issue(cred_id, Duration::from_millis(1)).await;

        sleep(Duration::from_millis(5)).await;

        assert!(
            !store.consume(&token, &cred_id).await,
            "expired token should return false"
        );
    }

    // -----------------------------------------------------------------------
    // T4: revoke updates credential status to Revoked
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn revoke_updates_status() {
        let (_dir, pool) = make_pool().await;
        let pool = Arc::new(pool);
        let vault = make_unlocked_vault().await;
        let ctx = make_ctx(pool.clone(), vault);

        let cred_id = seed_credential(&pool).await;
        let repo = CredentialRepo::new(&pool);

        // Issue a real token via the store.
        let token = ctx
            .kill_switch_tokens
            .issue(cred_id, Duration::from_secs(300))
            .await;

        do_revoke(&ctx, cred_id, &token, false)
            .await
            .expect("revoke should succeed");

        let updated = repo.get_by_id(cred_id).await.unwrap().unwrap();
        assert_eq!(
            updated.status,
            CredentialStatus::Revoked,
            "status must be Revoked after do_revoke"
        );
    }

    // -----------------------------------------------------------------------
    // T5: revoke with missing/wrong token → InvalidToken, status stays Active
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn revoke_without_valid_token_rejects() {
        let (_dir, pool) = make_pool().await;
        let pool = Arc::new(pool);
        let vault = make_unlocked_vault().await;
        let ctx = make_ctx(pool.clone(), vault);

        let cred_id = seed_credential(&pool).await;
        let repo = CredentialRepo::new(&pool);

        let err = do_revoke(&ctx, cred_id, "deadbeefdeadbeef", false)
            .await
            .expect_err("should fail without valid token");

        assert!(
            matches!(err, KillSwitchError::InvalidToken),
            "expected InvalidToken, got {:?}",
            err
        );

        // Credential must remain Active.
        let unchanged = repo.get_by_id(cred_id).await.unwrap().unwrap();
        assert_eq!(unchanged.status, CredentialStatus::Active);
    }

    // -----------------------------------------------------------------------
    // T6: also_delete_value=true removes vault secret
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn revoke_with_also_delete_removes_vault_secret() {
        let (_dir, pool) = make_pool().await;
        let pool = Arc::new(pool);
        let mut raw_vault = MockVaultStorage::new("pw");
        raw_vault
            .unlock(SecretString::from("pw".to_owned()))
            .await
            .unwrap();

        // Pre-seed issuer (FK dependency).
        let issuer_id = seed_issuer(&pool).await;

        // Pre-seed a specific credential id (so vault_ref and DB row match).
        let cred_id = CredentialId::new();
        let vault_ref = format!("credentials/{cred_id}");
        raw_vault
            .put_secret(&vault_ref, SecretBytes::new(b"super-secret".to_vec()))
            .await
            .unwrap();

        let ctx = make_ctx(pool.clone(), raw_vault);

        // Seed the DB row for this specific id.
        let input = CredentialInput {
            issuer_id,
            name: "Delete Me".to_string(),
            env: Env::Prod,
            scope: None,
            owner: None,
            rotation_policy_days: None,
            rotation_runbook_id: None,
            expires_at: None,
            hash_hint: None,
        };
        let repo = CredentialRepo::new(&pool);
        repo.insert_with_id(Some(cred_id), &input, vault_ref.clone())
            .await
            .expect("insert");

        let token = ctx
            .kill_switch_tokens
            .issue(cred_id, Duration::from_secs(300))
            .await;

        do_revoke(&ctx, cred_id, &token, true)
            .await
            .expect("revoke with delete should succeed");

        // Secret must be gone from vault.
        let vault_guard = ctx.vault.read().await;
        let result = vault_guard.get_secret(&vault_ref).await;
        assert!(
            matches!(
                result,
                Err(api_vault_storage::vault::VaultError::NotFound { .. })
            ),
            "vault secret should be deleted after revoke with also_delete_value=true"
        );
    }
}
