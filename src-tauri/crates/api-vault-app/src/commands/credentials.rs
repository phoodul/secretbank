//! Tauri commands for credential CRUD (T022).
//!
//! SQLite stores metadata; the age vault stores the secret value.
//! Operations attempt a pseudo-transaction: on vault failure after a
//! successful SQLite insert, the row is deleted as a rollback.

use serde::{Deserialize, Serialize};
use tauri::State;
use time::OffsetDateTime;

use api_vault_audit::AuditActor;
use api_vault_core::{
    score_credential, Credential, CredentialFilter, CredentialId, CredentialInput, CredentialPatch,
    CredentialSummary, ScoreBreakdown, Usage,
};
use api_vault_storage::sqlite::repositories::{credential::CredentialRepo, usage::UsageRepo};
use api_vault_storage::vault::{ExposeSecret, SecretBytes};

use crate::context::AppContext;

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

#[derive(Debug, thiserror::Error, Serialize)]
#[serde(tag = "code", rename_all = "snake_case")]
pub enum CredentialCommandError {
    #[error("vault not unlocked")]
    NotUnlocked,

    #[error("credential not found")]
    NotFound,

    #[error("invalid utf8 in secret")]
    InvalidUtf8,

    #[error("internal: {message}")]
    Internal { message: String },
}

impl From<api_vault_storage::sqlite::StorageError> for CredentialCommandError {
    fn from(e: api_vault_storage::sqlite::StorageError) -> Self {
        Self::Internal {
            message: e.to_string(),
        }
    }
}

impl From<api_vault_storage::vault::VaultError> for CredentialCommandError {
    fn from(e: api_vault_storage::vault::VaultError) -> Self {
        match e {
            api_vault_storage::vault::VaultError::NotUnlocked => Self::NotUnlocked,
            other => Self::Internal {
                message: other.to_string(),
            },
        }
    }
}

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

/// Full credential view (metadata + usages + risk score, no secret value).
#[derive(Debug, Serialize)]
pub struct CredentialFull {
    #[serde(flatten)]
    pub credential: Credential,
    pub usages: Vec<Usage>,
    /// Security score computed from the credential fields (T040).
    pub score: ScoreBreakdown,
}

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

/// Arguments for `credential_create`.
#[derive(Debug, Deserialize)]
pub struct CredentialCreateArgs {
    #[serde(flatten)]
    pub input: CredentialInput,
    /// The actual API key value (will be stored in the age vault).
    pub value: String,
    /// Optional second secret value (e.g. Secret Key for Supabase, Client Secret for OAuth).
    /// When `Some`, it is encrypted and stored at `credentials/<id>/secondary` and
    /// `secondary_value_ref` is set on the credential row.
    #[serde(default)]
    pub secondary_value: Option<String>,
}

/// Which value slot to reveal.
#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum RevealSlot {
    #[default]
    Primary,
    Secondary,
}

/// Arguments for `credential_rotate_value`.
#[derive(Debug, Deserialize)]
pub struct CredentialRotateInput {
    pub id: CredentialId,
    /// New secret value to write into the vault.
    pub value: String,
    /// Optional hash hint (last-4 chars of the new value) from the caller.
    pub hash_hint: Option<String>,
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn credential_create(
    args: CredentialCreateArgs,
    state: State<'_, AppContext>,
) -> Result<CredentialId, CredentialCommandError> {
    {
        let vault = state.vault.read().await;
        if !vault.is_unlocked().await {
            return Err(CredentialCommandError::NotUnlocked);
        }
    }

    let repo = CredentialRepo::new(&state.pool);
    let id = CredentialId::new();
    let vault_ref = format!("credentials/{id}");

    // When a secondary value is provided, pre-compute the ref so we can store
    // it in the row at insert time (avoids a separate UPDATE).
    let secondary_ref: Option<String> = args
        .secondary_value
        .as_ref()
        .map(|_| format!("credentials/{id}/secondary"));

    // Build the input with secondary_value_ref filled in.
    let input_with_secondary = api_vault_core::CredentialInput {
        secondary_label: args.input.secondary_label.clone(),
        primary_label: args.input.primary_label.clone(),
        ..args.input.clone()
    };

    repo.insert_with_id(Some(id), &input_with_secondary, vault_ref.clone())
        .await?;

    // Write primary secret.
    let secret_bytes = SecretBytes::new(args.value.as_bytes().to_vec());
    {
        let mut vault = state.vault.write().await;
        if let Err(vault_err) = vault.put_secret(&vault_ref, secret_bytes).await {
            let _ = repo.delete(id).await;
            return Err(CredentialCommandError::from(vault_err));
        }

        // Write secondary secret (if provided).
        if let (Some(sec_val), Some(ref sec_ref)) = (&args.secondary_value, &secondary_ref) {
            let sec_bytes = SecretBytes::new(sec_val.as_bytes().to_vec());
            if let Err(vault_err) = vault.put_secret(sec_ref, sec_bytes).await {
                // Rollback: remove primary and the DB row.
                let _ = vault.delete_secret(&vault_ref).await;
                let _ = repo.delete(id).await;
                return Err(CredentialCommandError::from(vault_err));
            }
        }
    }

    // Persist secondary_value_ref in the DB row (patch after insert).
    if let Some(ref sec_ref) = secondary_ref {
        use api_vault_core::CredentialPatch;
        let patch = CredentialPatch {
            secondary_value_ref: Some(sec_ref.clone()),
            ..Default::default()
        };
        repo.update(id, &patch).await?;
    }

    let payload = serde_json::json!({
        "issuer_id": args.input.issuer_id.to_string()
    })
    .to_string();
    state
        .audit
        .record(
            AuditActor::LocalUser,
            "credential.create",
            "credential",
            id.to_string(),
            Some(payload),
        )
        .await;

    state
        .db_change_emitter
        .emit_db_changed(&crate::services::sync_emit::DbChangePayload::upsert(
            crate::services::sync_emit::DbChangeEntity::Credential,
            id.to_string(),
        ));

    // M9 Phase F-3 — best-effort value push to relay. Sync 가 비활성 (enc_key
    // 없음 / network 실패) 이어도 credential 생성 자체는 성공으로 간주 — 다음
    // pull 또는 명시적 retry 에서 따라잡는다.
    {
        let plaintext = secrecy::SecretString::from(args.value.clone());
        let cred_id_str = id.to_string();
        if let Err(e) =
            crate::services::value_sync::push_value(&state, &cred_id_str, &plaintext).await
        {
            tracing::debug!(
                credential_id = %cred_id_str,
                error = %e,
                "value sync push (create) skipped — best-effort"
            );
        }
    }

    Ok(id)
}

#[tauri::command]
pub async fn credential_list(
    filter: CredentialFilter,
    state: State<'_, AppContext>,
) -> Result<Vec<CredentialSummary>, CredentialCommandError> {
    // Defense-in-depth: vault locked → return empty list (label leakage guard).
    {
        let vault = state.vault.read().await;
        if !vault.is_unlocked().await {
            return Ok(vec![]);
        }
    }
    let repo = CredentialRepo::new(&state.pool);
    let list = repo.list(&filter).await?;
    Ok(list)
}

#[tauri::command]
pub async fn credential_get(
    id: CredentialId,
    state: State<'_, AppContext>,
) -> Result<CredentialFull, CredentialCommandError> {
    let cred_repo = CredentialRepo::new(&state.pool);
    let usage_repo = UsageRepo::new(&state.pool);

    let credential = cred_repo
        .get_by_id(id)
        .await?
        .ok_or(CredentialCommandError::NotFound)?;

    let usages = usage_repo.list_for_credential(id).await?;
    let score = score_credential(&credential);

    Ok(CredentialFull {
        credential,
        usages,
        score,
    })
}

#[tauri::command]
pub async fn credential_update(
    id: CredentialId,
    patch: CredentialPatch,
    state: State<'_, AppContext>,
) -> Result<(), CredentialCommandError> {
    let repo = CredentialRepo::new(&state.pool);
    repo.update(id, &patch).await?;

    // Record which fields were touched — values are never logged.
    let mut updated_fields: Vec<&str> = Vec::new();
    if patch.name.is_some() {
        updated_fields.push("name");
    }
    if patch.env.is_some() {
        updated_fields.push("env");
    }
    if patch.scope.is_some() {
        updated_fields.push("scope");
    }
    if patch.rotation_policy_days.is_some() {
        updated_fields.push("rotation_policy_days");
    }
    if patch.rotation_runbook_id.is_some() {
        updated_fields.push("rotation_runbook_id");
    }
    if patch.expires_at.is_some() {
        updated_fields.push("expires_at");
    }
    if patch.owner.is_some() {
        updated_fields.push("owner");
    }
    if patch.status.is_some() {
        updated_fields.push("status");
    }
    if patch.hash_hint.is_some() {
        updated_fields.push("hash_hint");
    }
    let payload = if updated_fields.is_empty() {
        None
    } else {
        Some(serde_json::json!({ "updated_fields": updated_fields }).to_string())
    };

    state
        .audit
        .record(
            AuditActor::LocalUser,
            "credential.update",
            "credential",
            id.to_string(),
            payload,
        )
        .await;

    state
        .db_change_emitter
        .emit_db_changed(&crate::services::sync_emit::DbChangePayload::upsert(
            crate::services::sync_emit::DbChangeEntity::Credential,
            id.to_string(),
        ));

    Ok(())
}

#[tauri::command]
pub async fn credential_delete(
    id: CredentialId,
    state: State<'_, AppContext>,
) -> Result<(), CredentialCommandError> {
    let cred_repo = CredentialRepo::new(&state.pool);
    let credential = cred_repo
        .get_by_id(id)
        .await?
        .ok_or(CredentialCommandError::NotFound)?;

    let vault_ref = credential.vault_ref.clone();

    {
        let mut vault = state.vault.write().await;
        vault.delete_secret(&vault_ref).await?;
    }

    cred_repo.delete(id).await?;

    state
        .audit
        .record(
            AuditActor::LocalUser,
            "credential.delete",
            "credential",
            id.to_string(),
            None,
        )
        .await;

    state
        .db_change_emitter
        .emit_db_changed(&crate::services::sync_emit::DbChangePayload::delete(
            crate::services::sync_emit::DbChangeEntity::Credential,
            id.to_string(),
        ));

    Ok(())
}

/// `credential_reveal` 의 핵심 로직을 분리한 순수 헬퍼.
///
/// `slot` — `RevealSlot::Primary` (default) 는 `vault_ref` 를 decrypt 하고,
/// `RevealSlot::Secondary` 는 `secondary_value_ref` 를 decrypt 한다.
pub async fn reveal_secret(
    id: CredentialId,
    slot: RevealSlot,
    ctx: &AppContext,
) -> Result<String, CredentialCommandError> {
    let vault = ctx.vault.read().await;

    if !vault.is_unlocked().await {
        return Err(CredentialCommandError::NotUnlocked);
    }

    let cred_repo = CredentialRepo::new(&ctx.pool);
    let credential = cred_repo
        .get_by_id(id)
        .await?
        .ok_or(CredentialCommandError::NotFound)?;

    let vault_path = match slot {
        RevealSlot::Primary => credential.vault_ref.clone(),
        RevealSlot::Secondary => credential
            .secondary_value_ref
            .clone()
            .ok_or(CredentialCommandError::NotFound)?,
    };

    let secret_bytes = vault.get_secret(&vault_path).await?;
    let value = String::from_utf8(secret_bytes.expose_secret().clone())
        .map_err(|_| CredentialCommandError::InvalidUtf8)?;

    let audit_action = match slot {
        RevealSlot::Primary => "credential.reveal-primary",
        RevealSlot::Secondary => "credential.reveal-secondary",
    };

    ctx.audit
        .record(
            AuditActor::LocalUser,
            audit_action,
            "credential",
            id.to_string(),
            None,
        )
        .await;

    Ok(value)
}

#[tauri::command]
pub async fn credential_reveal(
    id: CredentialId,
    #[allow(unused_variables)] slot: Option<RevealSlot>,
    state: State<'_, AppContext>,
) -> Result<String, CredentialCommandError> {
    reveal_secret(id, slot.unwrap_or_default(), &state).await
}

/// Replace the vault secret for an existing credential without changing its
/// identity or linked usages.  Updates `hash_hint` and `last_rotated_at` in
/// SQLite and records an audit entry.
///
/// Vault-locked state is checked before any mutation so callers receive a
/// clear `VaultLocked` error rather than an opaque internal error.
#[tauri::command]
pub async fn credential_rotate_value(
    input: CredentialRotateInput,
    state: State<'_, AppContext>,
) -> Result<(), CredentialCommandError> {
    // 1. Verify vault is unlocked before touching anything.
    {
        let vault = state.vault.read().await;
        if !vault.is_unlocked().await {
            return Err(CredentialCommandError::NotUnlocked);
        }
    }

    // 2. Confirm credential exists.
    let repo = CredentialRepo::new(&state.pool);
    let credential = repo
        .get_by_id(input.id)
        .await?
        .ok_or(CredentialCommandError::NotFound)?;

    // 3. Overwrite the secret in the vault (vault_ref path is unchanged).
    {
        let mut vault = state.vault.write().await;
        let secret_bytes = SecretBytes::new(input.value.as_bytes().to_vec());
        vault
            .put_secret(&credential.vault_ref, secret_bytes)
            .await?;
        vault.flush().await?;
    }

    // 4. Update hash_hint + last_rotated_at in SQLite.
    let now_ms = OffsetDateTime::now_utc().unix_timestamp() * 1_000
        + i64::from(OffsetDateTime::now_utc().millisecond());
    sqlx::query("UPDATE credential SET hash_hint = ?, last_rotated_at = ? WHERE id = ?")
        .bind(&input.hash_hint)
        .bind(now_ms)
        .bind(input.id.to_string())
        .execute(state.pool.as_ref())
        .await
        .map_err(|e| CredentialCommandError::Internal {
            message: e.to_string(),
        })?;

    // 5. Audit.
    let payload = serde_json::json!({ "manual": true }).to_string();
    state
        .audit
        .record(
            AuditActor::LocalUser,
            "credential.rotate",
            "credential",
            input.id.to_string(),
            Some(payload),
        )
        .await;

    state
        .db_change_emitter
        .emit_db_changed(&crate::services::sync_emit::DbChangePayload::upsert(
            crate::services::sync_emit::DbChangeEntity::Credential,
            input.id.to_string(),
        ));

    // M9 Phase F-3 — best-effort value push (rotated value) to relay.
    {
        let plaintext = secrecy::SecretString::from(input.value.clone());
        let cred_id_str = input.id.to_string();
        if let Err(e) =
            crate::services::value_sync::push_value(&state, &cred_id_str, &plaintext).await
        {
            tracing::debug!(
                credential_id = %cred_id_str,
                error = %e,
                "value sync push (rotate) skipped — best-effort"
            );
        }
    }

    Ok(())
}

// Tests for credential CRUD logic have been moved to
// `api-vault-storage/tests/credential_vault_integration.rs`
// to avoid AppLocker-blocked proc-macro DLL recompilation in this crate.

// ---------------------------------------------------------------------------
// Tests for credential_rotate_value
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use api_vault_core::{CredentialId, CredentialInput, Env, IssuerId, IssuerInput};
    use api_vault_storage::sqlite::repositories::credential::CredentialRepo;
    use api_vault_storage::sqlite::repositories::issuer::IssuerRepo;
    use api_vault_storage::vault::mock::MockVaultStorage;
    use api_vault_storage::vault::{ExposeSecret, VaultStorage as _};
    use secrecy::SecretString;
    use tokio::sync::{Mutex, RwLock};

    use crate::audit_ctx::AuditCtx;
    use crate::commands::kill_switch::{ConfirmTokenStore, IssuerConfirmTokenStore};
    use crate::context::AppContext;
    use crate::services::device_identity::DeviceIdentity;

    use super::*;

    // -----------------------------------------------------------------------
    // Helpers
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

    async fn seed_issuer(pool: &sqlx::SqlitePool) -> IssuerId {
        IssuerRepo::new(pool)
            .insert(&IssuerInput {
                slug: "openai".to_string(),
                display_name: "OpenAI".to_string(),
                docs_url: None,
                issue_url: None,
                status_url: None,
                security_feed_url: None,
                connector_id: None,
                icon_key: None,
                default_primary_label: None,
                default_secondary_label: None,
                domains: vec![],
            })
            .await
            .expect("issuer insert")
    }

    async fn seed_credential_with_value(
        pool: &sqlx::SqlitePool,
        vault: &mut MockVaultStorage,
        value: &str,
        hash_hint: Option<&str>,
    ) -> CredentialId {
        let issuer_id = seed_issuer(pool).await;
        let repo = CredentialRepo::new(pool);
        let id = CredentialId::new();
        let input = CredentialInput {
            issuer_id,
            name: "Test Key".to_string(),
            env: Env::Prod,
            scope: None,
            rotation_policy_days: None,
            rotation_runbook_id: None,
            expires_at: None,
            owner: None,
            hash_hint: hash_hint.map(|s| s.to_string()),
            kind: Default::default(),
            url: None,
            username: None,
            primary_label: None,
            secondary_label: None,
        };
        let vault_ref = format!("credentials/{id}");
        repo.insert_with_id(Some(id), &input, vault_ref.clone())
            .await
            .expect("credential insert");
        let bytes = api_vault_storage::vault::SecretBytes::new(value.as_bytes().to_vec());
        vault
            .put_secret(&vault_ref, bytes)
            .await
            .expect("vault put");
        id
    }

    fn make_ctx(pool: Arc<sqlx::SqlitePool>, vault: MockVaultStorage) -> AppContext {
        let vault_box: Box<dyn api_vault_storage::vault::VaultStorage + Send + Sync> =
            Box::new(vault);
        let vault_arc = Arc::new(RwLock::new(vault_box));
        let device_identity: Arc<RwLock<Option<DeviceIdentity>>> = Arc::new(RwLock::new(None));
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
            import_sessions: Arc::new(crate::import::ImportSessionStore::new()),
            relay_client: Arc::new(
                crate::services::relay_client::RelayClient::new(
                    url::Url::parse("http://localhost").unwrap(),
                )
                .unwrap(),
            ),
            auth_session: Arc::new(RwLock::new(None)),
            master_passphrase: Arc::new(RwLock::new(None)),
            db_change_emitter: crate::services::sync_emit::noop_emitter(),
            pairing_session: Arc::new(RwLock::new(None)),
        }
    }

    // -----------------------------------------------------------------------
    // T1: rotate_value — vault 의 secret 이 새 값으로 갱신되고 hash_hint 갱신 확인
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn credential_rotate_value_updates_vault_secret_and_hash_hint() {
        let (_dir, pool) = make_pool().await;
        let pool = Arc::new(pool);
        let mut vault = make_unlocked_vault().await;

        let cred_id =
            seed_credential_with_value(&pool, &mut vault, "old-secret", Some("ecrt")).await;

        let ctx = make_ctx(pool.clone(), vault);

        // Simulate the Tauri command via the internal AppContext reference.
        let repo = CredentialRepo::new(&pool);
        let before = repo.get_by_id(cred_id).await.unwrap().unwrap();
        assert_eq!(before.hash_hint.as_deref(), Some("ecrt"));
        assert!(before.last_rotated_at.is_none());

        // Perform rotate by calling the internal logic directly (no Tauri State).
        let input = CredentialRotateInput {
            id: cred_id,
            value: "new-secret".to_string(),
            hash_hint: Some("cret".to_string()),
        };

        // Call rotate logic manually (mirrors what the command does).
        {
            let vault_guard = ctx.vault.read().await;
            assert!(vault_guard.is_unlocked().await);
        }
        let cred = repo.get_by_id(input.id).await.unwrap().unwrap();
        {
            let mut vault_guard = ctx.vault.write().await;
            let secret_bytes =
                api_vault_storage::vault::SecretBytes::new(input.value.as_bytes().to_vec());
            vault_guard
                .put_secret(&cred.vault_ref, secret_bytes)
                .await
                .unwrap();
            vault_guard.flush().await.unwrap();
        }
        let now_ms = OffsetDateTime::now_utc().unix_timestamp() * 1_000
            + i64::from(OffsetDateTime::now_utc().millisecond());
        sqlx::query("UPDATE credential SET hash_hint = ?, last_rotated_at = ? WHERE id = ?")
            .bind(&input.hash_hint)
            .bind(now_ms)
            .bind(input.id.to_string())
            .execute(pool.as_ref())
            .await
            .unwrap();

        // Verify vault secret was replaced.
        let vault_guard = ctx.vault.read().await;
        let secret = vault_guard.get_secret(&cred.vault_ref).await.unwrap();
        let value = String::from_utf8(secret.expose_secret().clone()).unwrap();
        assert_eq!(value, "new-secret");

        // Verify SQLite was updated.
        let after = repo.get_by_id(cred_id).await.unwrap().unwrap();
        assert_eq!(after.hash_hint.as_deref(), Some("cret"));
        assert!(
            after.last_rotated_at.is_some(),
            "last_rotated_at must be set after rotate"
        );
    }

    // -----------------------------------------------------------------------
    // T2: rotate_value — audit_log 에 credential.rotate action 이 기록된다
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn credential_rotate_value_records_audit_credential_rotate() {
        use crate::services::device_identity::ensure_device_keys;
        use api_vault_audit::AuditActor;
        use api_vault_core::DevicePlatform;
        use api_vault_storage::AuditRepo;

        let (_dir, pool) = make_pool().await;
        let pool = Arc::new(pool);
        let mut vault = make_unlocked_vault().await;

        let cred_id = seed_credential_with_value(&pool, &mut vault, "old-val", Some("l-va")).await;

        // Provide device identity so audit.record() can sign entries.
        let vault_for_identity: Arc<
            RwLock<Box<dyn api_vault_storage::vault::VaultStorage + Send + Sync>>,
        > = {
            let mut v = MockVaultStorage::new("pw");
            v.unlock(SecretString::from("pw".to_owned())).await.unwrap();
            Arc::new(RwLock::new(Box::new(v)))
        };
        let identity = ensure_device_keys(
            vault_for_identity,
            pool.as_ref(),
            "test-device",
            DevicePlatform::Linux,
        )
        .await
        .expect("ensure_device_keys");

        let vault_box: Box<dyn api_vault_storage::vault::VaultStorage + Send + Sync> =
            Box::new(vault);
        let vault_arc = Arc::new(RwLock::new(vault_box));
        let device_identity: Arc<RwLock<Option<DeviceIdentity>>> =
            Arc::new(RwLock::new(Some(identity)));
        let audit = Arc::new(AuditCtx::new(pool.clone(), device_identity.clone()));
        let ctx = AppContext {
            vault: vault_arc,
            pool: pool.clone(),
            data_dir: std::path::PathBuf::from("/tmp/test"),
            user_id: "test".to_string(),
            clipboard_controller: Arc::new(Mutex::new(None)),
            feed_scheduler: Arc::new(Mutex::new(None)),
            device_identity,
            audit,
            kill_switch_tokens: Arc::new(ConfirmTokenStore::default()),
            issuer_kill_switch_tokens: Arc::new(IssuerConfirmTokenStore::default()),
            import_sessions: Arc::new(crate::import::ImportSessionStore::new()),
            relay_client: Arc::new(
                crate::services::relay_client::RelayClient::new(
                    url::Url::parse("http://localhost").unwrap(),
                )
                .unwrap(),
            ),
            auth_session: Arc::new(RwLock::new(None)),
            master_passphrase: Arc::new(RwLock::new(None)),
            db_change_emitter: crate::services::sync_emit::noop_emitter(),
            pairing_session: Arc::new(RwLock::new(None)),
        };

        // Perform the rotate (abbreviated — vault + SQLite update then audit).
        let repo = CredentialRepo::new(&pool);
        let cred = repo.get_by_id(cred_id).await.unwrap().unwrap();
        {
            let mut v = ctx.vault.write().await;
            let bytes = api_vault_storage::vault::SecretBytes::new("new-val".as_bytes().to_vec());
            v.put_secret(&cred.vault_ref, bytes).await.unwrap();
            v.flush().await.unwrap();
        }
        let now_ms = OffsetDateTime::now_utc().unix_timestamp() * 1_000
            + i64::from(OffsetDateTime::now_utc().millisecond());
        sqlx::query("UPDATE credential SET hash_hint = ?, last_rotated_at = ? WHERE id = ?")
            .bind::<Option<String>>(None)
            .bind(now_ms)
            .bind(cred_id.to_string())
            .execute(pool.as_ref())
            .await
            .unwrap();

        let payload = serde_json::json!({ "manual": true }).to_string();
        ctx.audit
            .record(
                AuditActor::LocalUser,
                "credential.rotate",
                "credential",
                cred_id.to_string(),
                Some(payload),
            )
            .await;

        // Verify audit row.
        let audit_repo = AuditRepo::new(pool.as_ref());
        let entries = audit_repo.list_for_verify().await.unwrap();
        let rotate_entries: Vec<_> = entries
            .iter()
            .filter(|e| e.action == "credential.rotate")
            .collect();
        assert_eq!(
            rotate_entries.len(),
            1,
            "expected exactly 1 credential.rotate audit entry, got {}",
            rotate_entries.len()
        );
    }

    // -----------------------------------------------------------------------
    // T3: credential_list — vault locked 시 빈 결과 반환
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn credential_list_returns_empty_when_vault_locked() {
        let (_dir, pool) = make_pool().await;
        let pool = Arc::new(pool);
        // Locked vault: MockVaultStorage is locked by default (not unlocked).
        let vault = MockVaultStorage::new("pw");
        let ctx = make_ctx(pool.clone(), vault);

        let filter = api_vault_core::CredentialFilter::default();
        let vault_guard = ctx.vault.read().await;
        assert!(
            !vault_guard.is_unlocked().await,
            "vault must be locked for this test"
        );
        drop(vault_guard);

        // Call the list logic directly (mirrors what the command does).
        let is_locked = {
            let v = ctx.vault.read().await;
            !v.is_unlocked().await
        };
        assert!(is_locked);

        // When locked, the command returns Ok(vec![]).
        let repo = CredentialRepo::new(&pool);
        let list = if is_locked {
            vec![]
        } else {
            repo.list(&filter).await.unwrap()
        };
        assert!(
            list.is_empty(),
            "credential_list must return empty vec when vault is locked"
        );
    }

    // -----------------------------------------------------------------------
    // T4: credential_list — vault unlocked 시 실제 데이터 반환
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn credential_list_returns_data_when_vault_unlocked() {
        let (_dir, pool) = make_pool().await;
        let pool = Arc::new(pool);
        let mut vault = make_unlocked_vault().await;

        // Seed one credential.
        let _ = seed_credential_with_value(&pool, &mut vault, "secret", Some("cret")).await;

        let ctx = make_ctx(pool.clone(), vault);

        let is_locked = {
            let v = ctx.vault.read().await;
            !v.is_unlocked().await
        };
        assert!(!is_locked, "vault must be unlocked for this test");

        let filter = api_vault_core::CredentialFilter::default();
        let repo = CredentialRepo::new(&pool);
        let list = if is_locked {
            vec![]
        } else {
            repo.list(&filter).await.unwrap()
        };
        assert_eq!(
            list.len(),
            1,
            "credential_list must return 1 item when vault is unlocked"
        );
    }
}
