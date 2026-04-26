//! Entitlement / subscription tier logic.
//!
//! # Stub mode (M0–M9)
//!
//! Entitlement is determined by reading `settings/pro_until` from the vault.
//! The value is a Unix millisecond timestamp stored as a decimal string.
//! If the timestamp is in the future, the user is considered Pro; otherwise Free.
//!
//! # TODO (M10 Payments integration)
//!
//! Replace the local vault lookup with a call to the relay `/me` endpoint that
//! returns the user's subscription status, caching the result in a local KV store
//! with a 5-minute TTL. The vault `pro_until` key will remain as an offline
//! fallback for graceful degradation.

use serde::Serialize;
use thiserror::Error;
use time::OffsetDateTime;

use api_vault_storage::vault::VaultError;

use crate::context::AppContext;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/// Subscription tier.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Tier {
    Free,
    Pro,
}

/// Current entitlement state.
#[derive(Debug, Clone, Serialize)]
pub struct Entitlement {
    pub tier: Tier,
    /// `Some(unix_ms)` when tier = Pro, `None` when Free.
    pub pro_until: Option<i64>,
    /// `true` if the result comes from a local cache (vs freshly resolved).
    ///
    /// Always `false` in the current stub implementation; will be `true` when
    /// the M10 relay KV cache is active.
    pub from_cache: bool,
}

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

#[derive(Debug, Error, Serialize)]
#[serde(tag = "code", rename_all = "snake_case")]
pub enum EntitlementError {
    /// Vault is locked — caller must unlock first.
    #[error("vault locked — unlock to read entitlement")]
    VaultLocked,

    /// Persistent storage error.
    #[error("storage: {message}")]
    Storage { message: String },

    /// Relay call failed (reserved for M10).
    #[error("relay error: {message}")]
    Relay { message: String },

    /// The requested feature requires a Pro subscription.
    #[error("not pro — this feature requires Pro subscription")]
    NotPro,
}

impl From<VaultError> for EntitlementError {
    fn from(e: VaultError) -> Self {
        match e {
            VaultError::NotUnlocked => EntitlementError::VaultLocked,
            other => EntitlementError::Storage {
                message: other.to_string(),
            },
        }
    }
}

// ---------------------------------------------------------------------------
// Vault key
// ---------------------------------------------------------------------------

/// Vault key used to persist the Pro expiry timestamp (decimal Unix ms).
pub const VAULT_KEY_PRO_UNTIL: &str = "settings/pro_until";

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

/// Resolve the current entitlement from the vault.
///
/// 1. Read `settings/pro_until` from the age vault.
/// 2. If the key is absent → Free tier.
/// 3. Parse as `i64` Unix milliseconds; compare to `now_utc`.
/// 4. Future → Pro, past → Free (expired).
///
/// Returns `VaultLocked` if the vault has not been unlocked.
pub async fn current_entitlement(ctx: &AppContext) -> Result<Entitlement, EntitlementError> {
    use api_vault_storage::vault::ExposeSecret;

    let vault = ctx.vault.read().await;

    let pro_until_ms: Option<i64> = match vault.get_secret(VAULT_KEY_PRO_UNTIL).await {
        Ok(bytes) => {
            let s = String::from_utf8(bytes.expose_secret().clone()).map_err(|e| {
                EntitlementError::Storage {
                    message: format!("pro_until UTF-8 decode: {e}"),
                }
            })?;
            let ts = s.trim().parse::<i64>().map_err(|e| EntitlementError::Storage {
                message: format!("pro_until parse i64: {e}"),
            })?;
            Some(ts)
        }
        Err(VaultError::NotFound { .. }) => None,
        Err(VaultError::NotUnlocked) => return Err(EntitlementError::VaultLocked),
        Err(e) => {
            return Err(EntitlementError::Storage {
                message: e.to_string(),
            })
        }
    };

    let now_ms = OffsetDateTime::now_utc().unix_timestamp() * 1000;

    let (tier, stored_ms) = match pro_until_ms {
        Some(ts) if ts > now_ms => (Tier::Pro, Some(ts)),
        Some(_) => (Tier::Free, None), // expired
        None => (Tier::Free, None),
    };

    Ok(Entitlement {
        tier,
        pro_until: stored_ms,
        from_cache: false,
    })
}

/// Assert Pro tier; return `NotPro` error if the user is on the Free tier.
pub async fn require_pro(ctx: &AppContext) -> Result<(), EntitlementError> {
    let ent = current_entitlement(ctx).await?;
    if ent.tier == Tier::Pro {
        Ok(())
    } else {
        Err(EntitlementError::NotPro)
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use std::sync::Arc;
    use tokio::sync::{Mutex, RwLock};

    use api_vault_storage::vault::{mock::MockVaultStorage, SecretBytes, VaultStorage as _};
    use secrecy::SecretString;
    use time::OffsetDateTime;

    use super::*;
    use crate::context::AppContext;

    // Minimal context helper: only vault is needed for entitlement tests.
    async fn ctx_with_vault(vault: MockVaultStorage) -> AppContext {
        use std::path::PathBuf;
        use crate::audit_ctx::AuditCtx;
        use crate::commands::kill_switch::{ConfirmTokenStore, IssuerConfirmTokenStore};
        use crate::services::device_identity::DeviceIdentity;
        use api_vault_storage::sqlite::init_pool;

        // Use an in-memory SQLite database for tests.
        let pool = init_pool(&PathBuf::from(":memory:")).await.expect("in-memory pool");
        let pool = Arc::new(pool);
        let device_identity: Arc<RwLock<Option<DeviceIdentity>>> = Arc::new(RwLock::new(None));
        let audit = Arc::new(AuditCtx::new(pool.clone(), device_identity.clone()));

        AppContext {
            vault: Arc::new(RwLock::new(Box::new(vault))),
            pool,
            data_dir: PathBuf::from("/tmp/entitlement-test"),
            user_id: "test".to_owned(),
            clipboard_controller: Arc::new(Mutex::new(None)),
            feed_scheduler: Arc::new(Mutex::new(None)),
            device_identity,
            audit,
            kill_switch_tokens: Arc::new(ConfirmTokenStore::default()),
            issuer_kill_switch_tokens: Arc::new(IssuerConfirmTokenStore::default()),
        }
    }

    // -----------------------------------------------------------------------
    // 1. No key in vault → tier = Free
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn no_key_returns_free() {
        let mut vault = MockVaultStorage::new("pw");
        vault.unlock(SecretString::from("pw".to_owned())).await.unwrap();
        let ctx = ctx_with_vault(vault).await;

        let ent = current_entitlement(&ctx).await.expect("ok");
        assert_eq!(ent.tier, Tier::Free);
        assert!(ent.pro_until.is_none());
    }

    // -----------------------------------------------------------------------
    // 2. Future timestamp → tier = Pro
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn future_timestamp_returns_pro() {
        let mut vault = MockVaultStorage::new("pw");
        vault.unlock(SecretString::from("pw".to_owned())).await.unwrap();

        let future_ms = OffsetDateTime::now_utc().unix_timestamp() * 1000 + 86_400_000; // +1 day
        vault
            .put_secret(
                VAULT_KEY_PRO_UNTIL,
                SecretBytes::new(future_ms.to_string().into_bytes()),
            )
            .await
            .unwrap();

        let ctx = ctx_with_vault(vault).await;
        let ent = current_entitlement(&ctx).await.expect("ok");
        assert_eq!(ent.tier, Tier::Pro);
        assert_eq!(ent.pro_until, Some(future_ms));
    }

    // -----------------------------------------------------------------------
    // 3. Past timestamp → tier = Free (expired)
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn past_timestamp_returns_free() {
        let mut vault = MockVaultStorage::new("pw");
        vault.unlock(SecretString::from("pw".to_owned())).await.unwrap();

        let past_ms = OffsetDateTime::now_utc().unix_timestamp() * 1000 - 86_400_000; // -1 day
        vault
            .put_secret(
                VAULT_KEY_PRO_UNTIL,
                SecretBytes::new(past_ms.to_string().into_bytes()),
            )
            .await
            .unwrap();

        let ctx = ctx_with_vault(vault).await;
        let ent = current_entitlement(&ctx).await.expect("ok");
        assert_eq!(ent.tier, Tier::Free);
        assert!(ent.pro_until.is_none());
    }

    // -----------------------------------------------------------------------
    // 4. Vault locked → VaultLocked error
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn locked_vault_returns_vault_locked() {
        let vault = MockVaultStorage::new("pw"); // NOT unlocked
        let ctx = ctx_with_vault(vault).await;

        let result = current_entitlement(&ctx).await;
        assert!(
            matches!(result, Err(EntitlementError::VaultLocked)),
            "locked vault must return VaultLocked, got: {result:?}"
        );
    }

    // -----------------------------------------------------------------------
    // 5. require_pro with Free tier → NotPro
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn require_pro_free_returns_not_pro() {
        let mut vault = MockVaultStorage::new("pw");
        vault.unlock(SecretString::from("pw".to_owned())).await.unwrap();
        let ctx = ctx_with_vault(vault).await;

        let result = require_pro(&ctx).await;
        assert!(
            matches!(result, Err(EntitlementError::NotPro)),
            "Free tier must return NotPro, got: {result:?}"
        );
    }

    // -----------------------------------------------------------------------
    // 6. require_pro with Pro tier → Ok
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn require_pro_pro_returns_ok() {
        let mut vault = MockVaultStorage::new("pw");
        vault.unlock(SecretString::from("pw".to_owned())).await.unwrap();

        let future_ms = OffsetDateTime::now_utc().unix_timestamp() * 1000 + 86_400_000;
        vault
            .put_secret(
                VAULT_KEY_PRO_UNTIL,
                SecretBytes::new(future_ms.to_string().into_bytes()),
            )
            .await
            .unwrap();

        let ctx = ctx_with_vault(vault).await;
        let result = require_pro(&ctx).await;
        assert!(result.is_ok(), "Pro tier must pass require_pro, got: {result:?}");
    }
}
