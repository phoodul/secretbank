//! Tauri commands for credential CRUD (T022).
//!
//! SQLite stores metadata; the age vault stores the secret value.
//! Operations attempt a pseudo-transaction: on vault failure after a
//! successful SQLite insert, the row is deleted as a rollback.

use serde::{Deserialize, Serialize};
use tauri::State;

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

    repo.insert_with_id(Some(id), &args.input, vault_ref.clone()).await?;

    let secret_bytes = SecretBytes::new(args.value.as_bytes().to_vec());
    {
        let mut vault = state.vault.write().await;
        if let Err(vault_err) = vault.put_secret(&vault_ref, secret_bytes).await {
            let _ = repo.delete(id).await;
            return Err(CredentialCommandError::from(vault_err));
        }
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

    Ok(id)
}

#[tauri::command]
pub async fn credential_list(
    filter: CredentialFilter,
    state: State<'_, AppContext>,
) -> Result<Vec<CredentialSummary>, CredentialCommandError> {
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
    if patch.name.is_some() { updated_fields.push("name"); }
    if patch.env.is_some() { updated_fields.push("env"); }
    if patch.scope.is_some() { updated_fields.push("scope"); }
    if patch.rotation_policy_days.is_some() { updated_fields.push("rotation_policy_days"); }
    if patch.rotation_runbook_id.is_some() { updated_fields.push("rotation_runbook_id"); }
    if patch.expires_at.is_some() { updated_fields.push("expires_at"); }
    if patch.owner.is_some() { updated_fields.push("owner"); }
    if patch.status.is_some() { updated_fields.push("status"); }
    if patch.hash_hint.is_some() { updated_fields.push("hash_hint"); }
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

    Ok(())
}

/// `credential_reveal` 의 핵심 로직을 분리한 순수 헬퍼.
pub async fn reveal_secret(
    id: CredentialId,
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

    let secret_bytes = vault.get_secret(&credential.vault_ref).await?;
    let value = String::from_utf8(secret_bytes.expose_secret().clone())
        .map_err(|_| CredentialCommandError::InvalidUtf8)?;

    ctx.audit
        .record(
            AuditActor::LocalUser,
            "credential.reveal",
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
    state: State<'_, AppContext>,
) -> Result<String, CredentialCommandError> {
    reveal_secret(id, &state).await
}

// Tests for credential CRUD logic have been moved to
// `api-vault-storage/tests/credential_vault_integration.rs`
// to avoid AppLocker-blocked proc-macro DLL recompilation in this crate.
