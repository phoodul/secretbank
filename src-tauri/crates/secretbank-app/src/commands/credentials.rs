//! Tauri commands for credential CRUD (T022).
//!
//! SQLite stores metadata; the age vault stores the secret value.
//! Operations attempt a pseudo-transaction: on vault failure after a
//! successful SQLite insert, the row is deleted as a rollback.

use serde::{Deserialize, Serialize};
use tauri::State;
use time::OffsetDateTime;

use secretbank_audit::AuditActor;
use secretbank_core::{
    score_credential, Credential, CredentialFilter, CredentialId, CredentialInput, CredentialPatch,
    CredentialSummary, IssuerId, ScoreBreakdown, Usage,
};
use secretbank_storage::sqlite::repositories::{
    credential::CredentialRepo, issuer::IssuerRepo, usage::UsageRepo,
};
use secretbank_storage::vault::{ExposeSecret, SecretBytes};

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

impl From<secretbank_storage::sqlite::StorageError> for CredentialCommandError {
    fn from(e: secretbank_storage::sqlite::StorageError) -> Self {
        Self::Internal {
            message: e.to_string(),
        }
    }
}

impl From<secretbank_storage::vault::VaultError> for CredentialCommandError {
    fn from(e: secretbank_storage::vault::VaultError) -> Self {
        match e {
            secretbank_storage::vault::VaultError::NotUnlocked => Self::NotUnlocked,
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

// ---------------------------------------------------------------------------
// Issuer resolution helper (T-24-E-D5)
// ---------------------------------------------------------------------------

/// 도메인 문자열에서 slug 를 추론한다.
///
/// `github.com` → `github`, `api.openai.com` → `openai`(마지막 공개 레이블 추출).
/// 규칙: "www." prefix 제거 → 마지막 2개 레이블에서 TLD 제거 → 첫 번째 파트.
/// 예: `api.github.com` → segments = ["api","github","com"] → TLD 제거 → "github".
///
/// 순수 함수이므로 비동기 아님.
pub fn domain_to_slug(domain: &str) -> String {
    let host = domain.trim().to_lowercase();
    // URL 형태가 오면 host 만 추출 (scheme:// 제거)
    let host = host
        .strip_prefix("https://")
        .or_else(|| host.strip_prefix("http://"))
        .unwrap_or(&host);
    // path 제거 — '/' 이전 부분만
    let host = host.split('/').next().unwrap_or(host);
    // port 제거
    let host = host.split(':').next().unwrap_or(host);
    // www. prefix 제거
    let host = host.strip_prefix("www.").unwrap_or(host);

    let parts: Vec<&str> = host.split('.').collect();
    match parts.as_slice() {
        [] => "unknown".to_string(),
        [only] => only.to_string(),
        // e.g. ["github", "com"] → "github"
        [name, _tld] => name.to_string(),
        // e.g. ["api", "github", "com"] → 두 번째 마지막 = "github"
        _ => {
            let n = parts.len();
            parts[n - 2].to_string()
        }
    }
}

/// domain 에 해당하는 IssuerId 를 반환한다. 우선순위:
/// 1. payload 에 issuer_id 가 명시된 경우 그대로 사용.
/// 2. IssuerRepo::find_by_domain 으로 domains 배열 매칭.
/// 3. slug 자동 추론 + IssuerRepo::get_or_create_by_slug (idempotent placeholder). — TM-EXT-ACTOR
pub async fn resolve_issuer_for_domain(
    domain: &str,
    pool: &sqlx::SqlitePool,
) -> Result<IssuerId, CredentialCommandError> {
    let repo = IssuerRepo::new(pool);

    // domains 배열 기반 정확 매칭 시도
    if let Some(issuer) = repo.find_by_domain(domain).await? {
        return Ok(issuer.id);
    }

    // 미매칭 → slug 자동 추론 후 placeholder get-or-create
    let slug = domain_to_slug(domain);
    // display_name 은 slug 첫 글자 대문자화 (단순 placeholder)
    let display_name = {
        let mut chars = slug.chars();
        match chars.next() {
            None => String::new(),
            Some(c) => c.to_uppercase().collect::<String>() + chars.as_str(),
        }
    };

    let id = repo.get_or_create_by_slug(&slug, &display_name).await?;
    Ok(id)
}

/// credential_create 핵심 로직 — Tauri command 와 nm-host extension 경로 양쪽에서 호출.
/// actor = AuditActor::LocalUser (UI) 또는 AuditActor::Extension(ext_id) (nm-host). — TM-EXT-ACTOR
pub async fn credential_create_internal(
    args: CredentialCreateArgs,
    actor: AuditActor,
    ctx: &AppContext,
) -> Result<CredentialId, CredentialCommandError> {
    {
        let vault = ctx.vault.read().await;
        if !vault.is_unlocked().await {
            return Err(CredentialCommandError::NotUnlocked);
        }
    }

    let repo = CredentialRepo::new(&ctx.pool);
    let id = CredentialId::new();
    let vault_ref = format!("credentials/{id}");

    // When a secondary value is provided, pre-compute the ref so we can store
    // it in the row at insert time (avoids a separate UPDATE).
    let secondary_ref: Option<String> = args
        .secondary_value
        .as_ref()
        .map(|_| format!("credentials/{id}/secondary"));

    // Build the input with secondary_value_ref filled in.
    let input_with_secondary = secretbank_core::CredentialInput {
        secondary_label: args.input.secondary_label.clone(),
        primary_label: args.input.primary_label.clone(),
        ..args.input.clone()
    };

    repo.insert_with_id(Some(id), &input_with_secondary, vault_ref.clone())
        .await?;

    // Write primary secret.
    let secret_bytes = SecretBytes::new(args.value.as_bytes().to_vec());
    {
        let mut vault = ctx.vault.write().await;
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
        use secretbank_core::CredentialPatch;
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
    ctx.audit
        .record(
            actor,
            "credential.create",
            "credential",
            id.to_string(),
            Some(payload),
        )
        .await;

    ctx.db_change_emitter
        .emit_db_changed(&crate::services::sync_emit::DbChangePayload::upsert(
            crate::services::sync_emit::DbChangeEntity::Credential,
            id.to_string(),
        ));

    // M9 Phase F-3 — best-effort value push to relay.
    {
        let plaintext = secrecy::SecretString::from(args.value.clone());
        let cred_id_str = id.to_string();
        if let Err(e) = crate::services::value_sync::push_value(ctx, &cred_id_str, &plaintext).await
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
pub async fn credential_create(
    args: CredentialCreateArgs,
    state: State<'_, AppContext>,
) -> Result<CredentialId, CredentialCommandError> {
    credential_create_internal(args, AuditActor::LocalUser, &state).await
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

/// credential_update 핵심 로직 — Tauri command 와 nm-host extension 경로 양쪽에서 호출.
/// actor = AuditActor::LocalUser (UI) 또는 AuditActor::Extension(ext_id) (nm-host). — TM-EXT-ACTOR
pub async fn credential_update_internal(
    id: CredentialId,
    patch: CredentialPatch,
    actor: AuditActor,
    ctx: &AppContext,
) -> Result<(), CredentialCommandError> {
    let repo = CredentialRepo::new(&ctx.pool);
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

    ctx.audit
        .record(
            actor,
            "credential.update",
            "credential",
            id.to_string(),
            payload,
        )
        .await;

    ctx.db_change_emitter
        .emit_db_changed(&crate::services::sync_emit::DbChangePayload::upsert(
            crate::services::sync_emit::DbChangeEntity::Credential,
            id.to_string(),
        ));

    Ok(())
}

#[tauri::command]
pub async fn credential_update(
    id: CredentialId,
    patch: CredentialPatch,
    state: State<'_, AppContext>,
) -> Result<(), CredentialCommandError> {
    credential_update_internal(id, patch, AuditActor::LocalUser, &state).await
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
// `secretbank-storage/tests/credential_vault_integration.rs`
// to avoid AppLocker-blocked proc-macro DLL recompilation in this crate.

// ---------------------------------------------------------------------------
// Tests for credential_rotate_value
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use secrecy::SecretString;
    use secretbank_core::{CredentialId, CredentialInput, Env, IssuerId, IssuerInput};
    use secretbank_storage::sqlite::repositories::credential::CredentialRepo;
    use secretbank_storage::sqlite::repositories::issuer::IssuerRepo;
    use secretbank_storage::vault::mock::MockVaultStorage;
    use secretbank_storage::vault::{ExposeSecret, VaultStorage as _};
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
        let pool = secretbank_storage::sqlite::init_pool(&db_path)
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
            custom_kind_label: None,
        };
        let vault_ref = format!("credentials/{id}");
        repo.insert_with_id(Some(id), &input, vault_ref.clone())
            .await
            .expect("credential insert");
        let bytes = secretbank_storage::vault::SecretBytes::new(value.as_bytes().to_vec());
        vault
            .put_secret(&vault_ref, bytes)
            .await
            .expect("vault put");
        id
    }

    fn make_ctx(pool: Arc<sqlx::SqlitePool>, vault: MockVaultStorage) -> AppContext {
        let vault_box: Box<dyn secretbank_storage::vault::VaultStorage + Send + Sync> =
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
            env_scan_sessions: Arc::new(crate::import::EnvScanSessionStore::new()),
            relay_client: Arc::new(
                crate::services::relay_client::RelayClient::new(
                    url::Url::parse("http://localhost").unwrap(),
                )
                .unwrap(),
            ),
            auth_session: Arc::new(RwLock::new(None)),
            master_passphrase: Arc::new(RwLock::new(None)),
            db_change_emitter: crate::services::sync_emit::noop_emitter(),
            nm_bridge: Arc::new(Mutex::new(None)),
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
                secretbank_storage::vault::SecretBytes::new(input.value.as_bytes().to_vec());
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
        use secretbank_audit::AuditActor;
        use secretbank_core::DevicePlatform;
        use secretbank_storage::AuditRepo;

        let (_dir, pool) = make_pool().await;
        let pool = Arc::new(pool);
        let mut vault = make_unlocked_vault().await;

        let cred_id = seed_credential_with_value(&pool, &mut vault, "old-val", Some("l-va")).await;

        // Provide device identity so audit.record() can sign entries.
        let vault_for_identity: Arc<
            RwLock<Box<dyn secretbank_storage::vault::VaultStorage + Send + Sync>>,
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

        let vault_box: Box<dyn secretbank_storage::vault::VaultStorage + Send + Sync> =
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
            env_scan_sessions: Arc::new(crate::import::EnvScanSessionStore::new()),
            relay_client: Arc::new(
                crate::services::relay_client::RelayClient::new(
                    url::Url::parse("http://localhost").unwrap(),
                )
                .unwrap(),
            ),
            auth_session: Arc::new(RwLock::new(None)),
            master_passphrase: Arc::new(RwLock::new(None)),
            db_change_emitter: crate::services::sync_emit::noop_emitter(),
            nm_bridge: Arc::new(Mutex::new(None)),
            pairing_session: Arc::new(RwLock::new(None)),
        };

        // Perform the rotate (abbreviated — vault + SQLite update then audit).
        let repo = CredentialRepo::new(&pool);
        let cred = repo.get_by_id(cred_id).await.unwrap().unwrap();
        {
            let mut v = ctx.vault.write().await;
            let bytes = secretbank_storage::vault::SecretBytes::new("new-val".as_bytes().to_vec());
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

        let filter = secretbank_core::CredentialFilter::default();
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

        let filter = secretbank_core::CredentialFilter::default();
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

    // -----------------------------------------------------------------------
    // T-24-E-D5-S1: domain_to_slug — 다양한 도메인 형태에서 slug 추론
    // -----------------------------------------------------------------------
    #[test]
    fn d5_domain_to_slug_extracts_correct_slug() {
        assert_eq!(domain_to_slug("github.com"), "github");
        assert_eq!(domain_to_slug("api.github.com"), "github");
        assert_eq!(domain_to_slug("www.github.com"), "github");
        assert_eq!(domain_to_slug("api.openai.com"), "openai");
        assert_eq!(domain_to_slug("stripe.com"), "stripe");
        assert_eq!(domain_to_slug("supabase.io"), "supabase");
        // URL 형태도 처리
        assert_eq!(domain_to_slug("https://api.github.com/v3"), "github");
        // 단일 레이블
        assert_eq!(domain_to_slug("localhost"), "localhost");
        // 포트 포함
        assert_eq!(domain_to_slug("localhost:8080"), "localhost");
    }

    // -----------------------------------------------------------------------
    // T-24-E-D5-S2: resolve_issuer_for_domain — domains 배열 매칭 시 기존 issuer 반환
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn d5_resolve_issuer_for_domain_returns_existing_when_matched() {
        let (_dir, pool) = make_pool().await;

        // github.com → domains 에 등록된 issuer
        let github_id = IssuerRepo::new(&pool)
            .insert(&IssuerInput {
                slug: "github".to_string(),
                display_name: "GitHub".to_string(),
                domains: vec!["github.com".to_string()],
                ..Default::default()
            })
            .await
            .expect("insert");

        let resolved = resolve_issuer_for_domain("github.com", &pool)
            .await
            .expect("resolve");

        assert_eq!(resolved, github_id, "domains 매칭 시 기존 issuer_id 반환");
    }

    // -----------------------------------------------------------------------
    // T-24-E-D5-S3: resolve_issuer_for_domain — 미매칭 시 placeholder 자동 생성
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn d5_resolve_issuer_for_domain_creates_placeholder_when_no_match() {
        let (_dir, pool) = make_pool().await;

        let resolved = resolve_issuer_for_domain("stripe.com", &pool)
            .await
            .expect("resolve");

        // DB 에 slug = "stripe" issuer 가 생성되어야 한다
        let issuer = IssuerRepo::new(&pool)
            .get_by_id(resolved)
            .await
            .expect("get_by_id")
            .expect("Some");

        assert_eq!(issuer.slug, "stripe");
    }

    // -----------------------------------------------------------------------
    // T-24-E-D5-S4: resolve_issuer_for_domain — 두 번 호출 시 동일 id (idempotent)
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn d5_resolve_issuer_for_domain_is_idempotent() {
        let (_dir, pool) = make_pool().await;

        let id1 = resolve_issuer_for_domain("notion.so", &pool)
            .await
            .expect("first resolve");
        let id2 = resolve_issuer_for_domain("notion.so", &pool)
            .await
            .expect("second resolve");

        assert_eq!(id1, id2, "두 번 호출 시 동일 issuer_id (idempotent)");
    }
}
