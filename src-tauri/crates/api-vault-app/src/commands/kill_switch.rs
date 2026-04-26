//! Kill Switch commands — two-step credential and bulk issuer revocation.
//!
//! # Single-credential flow
//!
//! 1. `kill_switch_request_confirm(cred_id)` — validates the credential exists,
//!    issues a 16-byte random hex token with a 5-minute TTL, and returns it.
//! 2. `kill_switch_revoke(cred_id, token, also_delete_value)` — consumes the
//!    token, updates credential status to `Revoked`, optionally deletes the
//!    age-vault secret, and records an audit entry.
//!
//! # Bulk issuer flow (T078)
//!
//! 1. `kill_switch_request_confirm_issuer(issuer_id)` — validates the issuer
//!    exists, issues a token stored in a separate `IssuerConfirmTokenStore`.
//! 2. `kill_switch_revoke_issuer(input)` — consumes the issuer token, fetches
//!    all credentials for the issuer, optionally validates expected count, and
//!    revokes each sequentially. Emits `kill-switch:progress` events.
//!
//! # Token consumption semantics
//!
//! `consume()` returns `false` if the token is unknown, expired, or belongs to
//! a *different* subject ID. Importantly, a wrong-id mismatch does
//! **not** remove the token from the store — a typo in the ID field must not
//! silently burn the user's one-shot confirmation token.

use std::collections::HashMap;
use std::time::{Duration, Instant};

use api_vault_audit::AuditActor;
use api_vault_core::{CredentialFilter, CredentialId, CredentialPatch, CredentialStatus, IssuerId};
use api_vault_storage::sqlite::repositories::credential::CredentialRepo;
use api_vault_storage::sqlite::repositories::issuer::IssuerRepo;
use api_vault_storage::vault::VaultError;
use rand::Rng;
use serde::{Deserialize, Serialize};
use tauri::{Emitter, State};
use thiserror::Error;
use tokio::sync::Mutex;

use crate::context::AppContext;
use crate::entitlement::EntitlementError;

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
// Issuer token store (T078)
// ---------------------------------------------------------------------------

/// Short-lived confirmation token keyed by issuer.
#[derive(Debug, Clone)]
pub struct IssuerConfirmToken {
    pub token: String,
    pub issuer_id: IssuerId,
    pub expires_at: Instant,
}

/// Separate TTL store for issuer-scoped bulk-revoke tokens.
///
/// Kept separate from `ConfirmTokenStore` to avoid any cross-contamination
/// between single-credential and bulk-issuer tokens.
#[derive(Default)]
pub struct IssuerConfirmTokenStore {
    inner: Mutex<HashMap<String, IssuerConfirmToken>>,
}

impl IssuerConfirmTokenStore {
    pub async fn issue(&self, issuer_id: IssuerId, ttl: Duration) -> String {
        let bytes: [u8; 16] = rand::thread_rng().gen();
        let hex: String = bytes.iter().map(|b| format!("{:02x}", b)).collect();

        let mut guard = self.inner.lock().await;
        guard.retain(|_, v| v.expires_at > Instant::now());
        guard.insert(
            hex.clone(),
            IssuerConfirmToken {
                token: hex.clone(),
                issuer_id,
                expires_at: Instant::now() + ttl,
            },
        );
        hex
    }

    /// Returns `Ok(issuer_id)` if token is valid, `Err` otherwise.
    ///
    /// Wrong-issuer-id mismatch does NOT consume the token.
    pub async fn consume(
        &self,
        token: &str,
        issuer_id: &IssuerId,
    ) -> Result<IssuerId, ()> {
        let mut guard = self.inner.lock().await;

        let entry = match guard.get(token) {
            Some(e) => e.clone(),
            None => return Err(()),
        };

        if entry.expires_at <= Instant::now() {
            guard.remove(token);
            return Err(());
        }

        if &entry.issuer_id != issuer_id {
            // Leave entry — wrong issuer id doesn't burn the token.
            return Err(());
        }

        guard.remove(token);
        Ok(entry.issuer_id)
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

    #[error("invalid issuer id")]
    InvalidIssuerId,

    #[error("credential not found")]
    NotFound,

    #[error("issuer not found")]
    IssuerNotFound,

    #[error("invalid or expired confirmation token")]
    InvalidToken,

    #[error("expected {expected} credentials but found {actual}")]
    ExpectedCountMismatch { expected: u32, actual: u32 },

    #[error("vault locked")]
    VaultLocked,

    #[error("storage error: {message}")]
    Storage { message: String },

    #[error("vault flush failed: {message}")]
    VaultFlushFailed { message: String },

    #[error("internal: {message}")]
    Internal { message: String },

    #[error("pro feature — bulk revoke requires Pro subscription")]
    NotPro,
}

impl From<EntitlementError> for KillSwitchError {
    fn from(e: EntitlementError) -> Self {
        match e {
            EntitlementError::VaultLocked => Self::VaultLocked,
            EntitlementError::NotPro => Self::NotPro,
            other => Self::Internal {
                message: other.to_string(),
            },
        }
    }
}

// ---------------------------------------------------------------------------
// Bulk result types (T078)
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize)]
pub struct KillSwitchBulkResult {
    pub revoked: u32,
    pub failed: Vec<FailedRevoke>,
}

#[derive(Debug, Serialize)]
pub struct FailedRevoke {
    pub credential_id: String,
    pub message: String,
}

/// Progress event payload emitted during bulk revoke.
#[derive(Debug, Serialize, Clone)]
pub struct KillSwitchProgress {
    pub revoked: u32,
    pub total: u32,
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

/// Parse a ULID string into `IssuerId`, mapping errors to `InvalidIssuerId`.
fn parse_issuer_id(s: &str) -> Result<IssuerId, KillSwitchError> {
    s.parse().map_err(|_| KillSwitchError::InvalidIssuerId)
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

    do_revoke_internal(ctx, cred_id, also_delete_value).await
}

/// Revoke a single credential without consuming a token.
///
/// Called internally by bulk revoke (which already validated the issuer token).
pub async fn do_revoke_internal(
    ctx: &AppContext,
    cred_id: CredentialId,
    also_delete_value: bool,
) -> Result<(), KillSwitchError> {
    // 1. Verify the credential still exists (guard against race where the
    //    credential is deleted between request_confirm and do_revoke).
    let repo = CredentialRepo::new(&ctx.pool);
    repo.get_by_id(cred_id)
        .await
        .map_err(KillSwitchError::from)?
        .ok_or(KillSwitchError::NotFound)?;

    // 2. Update credential status → Revoked.
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

        vault.flush().await.map_err(|e| KillSwitchError::VaultFlushFailed {
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
///
/// Tauri auto-converts top-level command arguments between camelCase (JS) and
/// snake_case (Rust), but **nested struct fields are deserialized by serde
/// using the field names as written**. The frontend sends camelCase keys
/// (`credId`, `alsoDeleteValue`), so this struct must opt into camelCase
/// deserialization to match.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
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
// Bulk issuer commands (T078)
// ---------------------------------------------------------------------------

/// Step 1 (issuer) — request a confirmation token for bulk-revoking all
/// credentials under a given issuer.
#[tauri::command]
pub async fn kill_switch_request_confirm_issuer(
    issuer_id: String,
    state: State<'_, AppContext>,
) -> Result<String, KillSwitchError> {
    let id = parse_issuer_id(&issuer_id)?;

    // Verify the issuer exists.
    let repo = IssuerRepo::new(&state.pool);
    repo.get_by_id(id)
        .await
        .map_err(|e| KillSwitchError::Storage {
            message: e.to_string(),
        })?
        .ok_or(KillSwitchError::IssuerNotFound)?;

    let token = state
        .issuer_kill_switch_tokens
        .issue(id, Duration::from_secs(300))
        .await;

    Ok(token)
}

/// Input payload for `kill_switch_revoke_issuer`.
///
/// See `KillSwitchRevokeInput` for the rationale behind `rename_all = "camelCase"`.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KillSwitchRevokeIssuerInput {
    pub issuer_id: String,
    pub token: String,
    pub also_delete_values: bool,
    pub expected_count: Option<u32>,
}

/// Step 2 (issuer) — consume the issuer token and bulk-revoke all credentials.
///
/// Emits `kill-switch:progress` events after each credential revocation.
/// Returns `KillSwitchBulkResult` with revoked count and any per-credential failures.
///
/// **Pro gate**: bulk revoke is a Pro-only feature.
#[tauri::command]
pub async fn kill_switch_revoke_issuer(
    input: KillSwitchRevokeIssuerInput,
    state: State<'_, AppContext>,
    app_handle: tauri::AppHandle,
) -> Result<KillSwitchBulkResult, KillSwitchError> {
    // Pro gate: bulk revoke requires Pro subscription.
    crate::entitlement::require_pro(&state).await.map_err(KillSwitchError::from)?;

    let issuer_id = parse_issuer_id(&input.issuer_id)?;

    // 1. Consume issuer token.
    state
        .issuer_kill_switch_tokens
        .consume(&input.token, &issuer_id)
        .await
        .map_err(|_| KillSwitchError::InvalidToken)?;

    // 2. Fetch all *active* credentials for this issuer.
    //
    // I5 hotfix: previously this filter omitted `status`, so already-revoked
    // credentials were returned and counted alongside active ones.  When the
    // frontend passed `expected_count = active_count`, this always tripped
    // `ExpectedCountMismatch` once the issuer had any revoked credential in
    // its history.  Restricting to Active also avoids re-revoking the same
    // credential (which would emit duplicate audit entries) and makes the
    // emitted progress total match the user's mental model.
    let cred_repo = CredentialRepo::new(&state.pool);
    let filter = CredentialFilter {
        issuer_id: Some(issuer_id),
        status: Some(CredentialStatus::Active),
        ..Default::default()
    };
    let credentials = cred_repo
        .list(&filter)
        .await
        .map_err(KillSwitchError::from)?;

    // 3. Optional expected-count safety check.
    if let Some(expected) = input.expected_count {
        let actual = credentials.len() as u32;
        if expected != actual {
            return Err(KillSwitchError::ExpectedCountMismatch { expected, actual });
        }
    }

    let total = credentials.len() as u32;
    let mut revoked: u32 = 0;
    let mut failed: Vec<FailedRevoke> = Vec::new();

    // 4. Sequentially revoke each credential.
    for cred in &credentials {
        match do_revoke_internal(&state, cred.id, input.also_delete_values).await {
            Ok(()) => {
                revoked += 1;
            }
            Err(e) => {
                failed.push(FailedRevoke {
                    credential_id: cred.id.to_string(),
                    message: e.to_string(),
                });
            }
        }

        // Emit progress after each attempt.
        let progress = KillSwitchProgress { revoked, total };
        let _ = app_handle.emit("kill-switch:progress", &progress);
    }

    Ok(KillSwitchBulkResult { revoked, failed })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use api_vault_core::{CredentialFilter, CredentialInput, CredentialStatus, Env, IssuerInput, IssuerId};
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
    // Wire-format regression tests — locks the FE↔Rust contract.
    //
    // Tauri auto-converts top-level command args between camelCase (JS) and
    // snake_case (Rust), but **does not touch nested struct fields**.  The
    // frontend (`use-kill-switch.ts`) sends camelCase keys, so these inputs
    // must opt in via `#[serde(rename_all = "camelCase")]`.  These tests
    // assert the wire shape so that a future field rename or a missing
    // serde attribute is caught immediately rather than at runtime in the
    // UI.
    // -----------------------------------------------------------------------

    #[test]
    fn revoke_input_deserializes_from_camel_case_json() {
        let json = serde_json::json!({
            "credId": "01HXXX0000000000000000000A",
            "token": "deadbeefdeadbeefdeadbeefdeadbeef",
            "alsoDeleteValue": true,
        });
        let parsed: KillSwitchRevokeInput =
            serde_json::from_value(json).expect("camelCase JSON must deserialize");
        assert_eq!(parsed.cred_id, "01HXXX0000000000000000000A");
        assert_eq!(parsed.token, "deadbeefdeadbeefdeadbeefdeadbeef");
        assert!(parsed.also_delete_value);
    }

    #[test]
    fn revoke_issuer_input_deserializes_from_camel_case_json() {
        let json = serde_json::json!({
            "issuerId": "01HYYY0000000000000000000B",
            "token": "cafebabecafebabecafebabecafebabe",
            "alsoDeleteValues": false,
            "expectedCount": 3,
        });
        let parsed: KillSwitchRevokeIssuerInput =
            serde_json::from_value(json).expect("camelCase JSON must deserialize");
        assert_eq!(parsed.issuer_id, "01HYYY0000000000000000000B");
        assert_eq!(parsed.token, "cafebabecafebabecafebabecafebabe");
        assert!(!parsed.also_delete_values);
        assert_eq!(parsed.expected_count, Some(3));
    }

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
            issuer_kill_switch_tokens: Arc::new(IssuerConfirmTokenStore::default()),
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
    // T7 (T078): IssuerConfirmTokenStore — issue/consume/wrong-subject
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn issuer_token_store_issue_and_consume() {
        let store = IssuerConfirmTokenStore::default();
        let issuer_id: IssuerId = IssuerId::new();

        let token = store.issue(issuer_id, Duration::from_secs(300)).await;

        // First consume: valid
        let result = store.consume(&token, &issuer_id).await;
        assert!(result.is_ok(), "first consume should succeed");
        assert_eq!(result.unwrap(), issuer_id);

        // Second consume: one-shot, must fail
        let result2 = store.consume(&token, &issuer_id).await;
        assert!(result2.is_err(), "second consume should fail (one-shot)");
    }

    #[tokio::test]
    async fn issuer_token_store_wrong_subject_does_not_consume() {
        let store = IssuerConfirmTokenStore::default();
        let issuer_a: IssuerId = IssuerId::new();
        let issuer_b: IssuerId = IssuerId::new();

        let token = store.issue(issuer_a, Duration::from_secs(300)).await;

        // Wrong issuer — must not consume
        assert!(
            store.consume(&token, &issuer_b).await.is_err(),
            "wrong issuer_id should return Err"
        );

        // Correct issuer — must still work
        assert!(
            store.consume(&token, &issuer_a).await.is_ok(),
            "correct issuer_id should succeed after wrong-id attempt"
        );
    }

    // -----------------------------------------------------------------------
    // T8 (T078): Bulk revoke — 3 under issuer A, 2 under issuer B
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn bulk_revoke_revokes_only_issuer_a_credentials() {
        let (_dir, pool) = make_pool().await;
        let pool = Arc::new(pool);
        let vault = make_unlocked_vault().await;
        let ctx = make_ctx(pool.clone(), vault);

        let issuer_repo = api_vault_storage::sqlite::repositories::issuer::IssuerRepo::new(&pool);

        // Issuer A
        let issuer_a = issuer_repo
            .insert(&IssuerInput {
                slug: "issuer-a".to_string(),
                display_name: "Issuer A".to_string(),
                docs_url: None,
                issue_url: None,
                status_url: None,
                security_feed_url: None,
                connector_id: None,
                icon_key: None,
            })
            .await
            .expect("issuer A insert");

        // Issuer B
        let issuer_b = issuer_repo
            .insert(&IssuerInput {
                slug: "issuer-b".to_string(),
                display_name: "Issuer B".to_string(),
                docs_url: None,
                issue_url: None,
                status_url: None,
                security_feed_url: None,
                connector_id: None,
                icon_key: None,
            })
            .await
            .expect("issuer B insert");

        let cred_repo = CredentialRepo::new(&pool);

        // Seed 3 under issuer A
        let mut cred_a_ids = Vec::new();
        for i in 0..3 {
            let cred_id = CredentialId::new();
            let input = CredentialInput {
                issuer_id: issuer_a,
                name: format!("Key A{i}"),
                env: Env::Dev,
                scope: None,
                owner: None,
                rotation_policy_days: None,
                rotation_runbook_id: None,
                expires_at: None,
                hash_hint: None,
            };
            cred_repo
                .insert_with_id(Some(cred_id), &input, format!("credentials/{cred_id}"))
                .await
                .expect("insert cred A");
            cred_a_ids.push(cred_id);
        }

        // Seed 2 under issuer B
        let mut cred_b_ids = Vec::new();
        for i in 0..2 {
            let cred_id = CredentialId::new();
            let input = CredentialInput {
                issuer_id: issuer_b,
                name: format!("Key B{i}"),
                env: Env::Dev,
                scope: None,
                owner: None,
                rotation_policy_days: None,
                rotation_runbook_id: None,
                expires_at: None,
                hash_hint: None,
            };
            cred_repo
                .insert_with_id(Some(cred_id), &input, format!("credentials/{cred_id}"))
                .await
                .expect("insert cred B");
            cred_b_ids.push(cred_id);
        }

        // Run bulk revoke for issuer A using do_revoke_internal directly
        let filter = CredentialFilter {
            issuer_id: Some(issuer_a),
            ..Default::default()
        };
        let creds_a = cred_repo.list(&filter).await.expect("list A");
        assert_eq!(creds_a.len(), 3, "should find 3 credentials under issuer A");

        let mut revoked_count = 0u32;
        for cred in &creds_a {
            do_revoke_internal(&ctx, cred.id, false)
                .await
                .expect("revoke internal");
            revoked_count += 1;
        }
        assert_eq!(revoked_count, 3);

        // Verify issuer A credentials are all Revoked
        for cred_id in &cred_a_ids {
            let updated = cred_repo
                .get_by_id(*cred_id)
                .await
                .unwrap()
                .unwrap();
            assert_eq!(
                updated.status,
                CredentialStatus::Revoked,
                "cred A{} should be revoked",
                cred_id
            );
        }

        // Verify issuer B credentials remain Active
        for cred_id in &cred_b_ids {
            let unchanged = cred_repo
                .get_by_id(*cred_id)
                .await
                .unwrap()
                .unwrap();
            assert_eq!(
                unchanged.status,
                CredentialStatus::Active,
                "cred B{} should still be active",
                cred_id
            );
        }
    }

    // -----------------------------------------------------------------------
    // I5 regression: bulk revoke must filter to Active only.
    //
    // Without `status=Active`, the issuer-scoped filter returns revoked rows
    // alongside active ones, breaking the FE's `expected_count` invariant
    // (FE counts active only, backend counted everything → ExpectedCountMismatch).
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn bulk_revoke_filter_excludes_already_revoked_credentials() {
        let (_dir, pool) = make_pool().await;
        let pool = Arc::new(pool);

        let issuer_repo = api_vault_storage::sqlite::repositories::issuer::IssuerRepo::new(&pool);
        let issuer_id = issuer_repo
            .insert(&IssuerInput {
                slug: "mixed".to_string(),
                display_name: "Mixed Issuer".to_string(),
                docs_url: None,
                issue_url: None,
                status_url: None,
                security_feed_url: None,
                connector_id: None,
                icon_key: None,
            })
            .await
            .expect("issuer insert");

        let cred_repo = CredentialRepo::new(&pool);

        // Seed 3 credentials: 1 revoked, 2 active
        let mut cred_ids = Vec::new();
        for i in 0..3 {
            let cred_id = CredentialId::new();
            cred_repo
                .insert_with_id(
                    Some(cred_id),
                    &CredentialInput {
                        issuer_id,
                        name: format!("Cred {i}"),
                        env: Env::Dev,
                        scope: None,
                        owner: None,
                        rotation_policy_days: None,
                        rotation_runbook_id: None,
                        expires_at: None,
                        hash_hint: None,
                    },
                    format!("credentials/{cred_id}"),
                )
                .await
                .expect("insert cred");
            cred_ids.push(cred_id);
        }
        // Mark first as revoked
        let revoked_patch = CredentialPatch {
            status: Some(CredentialStatus::Revoked),
            ..Default::default()
        };
        cred_repo
            .update(cred_ids[0], &revoked_patch)
            .await
            .expect("revoke first");

        // The post-fix filter (issuer + status=Active) must return only the
        // remaining 2 active credentials — this is what `expected_count`
        // from the FE relies on.
        let filter = CredentialFilter {
            issuer_id: Some(issuer_id),
            status: Some(CredentialStatus::Active),
            ..Default::default()
        };
        let listed = cred_repo.list(&filter).await.expect("list active");
        assert_eq!(listed.len(), 2, "filter must exclude already-revoked rows");
        assert!(
            listed.iter().all(|c| c.status == CredentialStatus::Active),
            "all returned rows must be Active"
        );
    }

    // -----------------------------------------------------------------------
    // T9: also_delete_value=true + vault flush fails → VaultFlushFailed
    // -----------------------------------------------------------------------

    /// Vault that always fails flush.
    struct FailingFlushVault {
        inner: MockVaultStorage,
    }

    impl FailingFlushVault {
        async fn new_unlocked() -> Self {
            let mut inner = MockVaultStorage::new("pw");
            inner
                .unlock(SecretString::from("pw".to_owned()))
                .await
                .unwrap();
            Self { inner }
        }
    }

    #[async_trait::async_trait]
    impl api_vault_storage::vault::VaultStorage for FailingFlushVault {
        async fn unlock(&mut self, pw: secrecy::SecretString) -> Result<(), api_vault_storage::vault::VaultError> {
            self.inner.unlock(pw).await
        }
        async fn is_unlocked(&self) -> bool {
            self.inner.is_unlocked().await
        }
        async fn lock(&mut self) -> Result<(), api_vault_storage::vault::VaultError> {
            self.inner.lock().await
        }
        async fn put_secret(
            &mut self,
            path: &str,
            value: api_vault_storage::vault::SecretBytes,
        ) -> Result<(), api_vault_storage::vault::VaultError> {
            self.inner.put_secret(path, value).await
        }
        async fn get_secret(
            &self,
            path: &str,
        ) -> Result<api_vault_storage::vault::SecretBytes, api_vault_storage::vault::VaultError> {
            self.inner.get_secret(path).await
        }
        async fn delete_secret(
            &mut self,
            path: &str,
        ) -> Result<(), api_vault_storage::vault::VaultError> {
            self.inner.delete_secret(path).await
        }
        async fn list_secrets(
            &self,
            prefix: &str,
        ) -> Result<Vec<String>, api_vault_storage::vault::VaultError> {
            self.inner.list_secrets(prefix).await
        }
        async fn flush(&mut self) -> Result<(), api_vault_storage::vault::VaultError> {
            Err(api_vault_storage::vault::VaultError::Io(
                std::io::Error::other("simulated flush failure"),
            ))
        }
    }

    #[tokio::test]
    async fn revoke_with_also_delete_flush_failure_returns_vault_flush_failed() {
        let (_dir, pool) = make_pool().await;
        let pool = Arc::new(pool);

        let failing_vault = FailingFlushVault::new_unlocked().await;
        let vault_box: Box<dyn api_vault_storage::vault::VaultStorage + Send + Sync> =
            Box::new(failing_vault);
        let vault_arc = Arc::new(RwLock::new(vault_box));
        let device_identity: Arc<RwLock<Option<DeviceIdentity>>> = Arc::new(RwLock::new(None));
        let audit = Arc::new(AuditCtx::new(pool.clone(), device_identity.clone()));

        let issuer_id = seed_issuer(&pool).await;
        let cred_id = {
            let repo = CredentialRepo::new(&pool);
            let c = CredentialId::new();
            let input = CredentialInput {
                issuer_id,
                name: "FlushFail Key".to_string(),
                env: Env::Prod,
                scope: None,
                owner: None,
                rotation_policy_days: None,
                rotation_runbook_id: None,
                expires_at: None,
                hash_hint: None,
            };
            repo.insert_with_id(Some(c), &input, format!("credentials/{c}"))
                .await
                .expect("insert");
            // Pre-seed the secret in vault so delete_secret succeeds
            {
                let mut vg = vault_arc.write().await;
                vg.put_secret(&format!("credentials/{c}"), SecretBytes::new(b"secret".to_vec()))
                    .await
                    .unwrap();
            }
            c
        };

        let ctx = AppContext {
            vault: vault_arc,
            pool,
            data_dir: std::path::PathBuf::from("/tmp/test"),
            user_id: "test".to_string(),
            clipboard_controller: Arc::new(Mutex::new(None)),
            feed_scheduler: Arc::new(Mutex::new(None)),
            device_identity,
            audit,
            kill_switch_tokens: Arc::new(ConfirmTokenStore::default()),
            issuer_kill_switch_tokens: Arc::new(IssuerConfirmTokenStore::default()),
        };

        let err = do_revoke_internal(&ctx, cred_id, true)
            .await
            .expect_err("should fail due to vault flush error");

        assert!(
            matches!(err, KillSwitchError::VaultFlushFailed { .. }),
            "expected VaultFlushFailed, got {:?}",
            err
        );
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
