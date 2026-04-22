//! Tauri commands for credential CRUD (T022).
//!
//! SQLite stores metadata; the age vault stores the secret value.
//! Operations attempt a pseudo-transaction: on vault failure after a
//! successful SQLite insert, the row is deleted as a rollback.

use serde::{Deserialize, Serialize};
use tauri::State;

use api_vault_core::{
    AuditAction, AuditActor, AuditLog, AuditLogId, Credential, CredentialFilter, CredentialId,
    CredentialInput, CredentialPatch, CredentialSummary, Usage,
};
use api_vault_storage::sqlite::repositories::{
    audit::AuditRepo, credential::CredentialRepo, usage::UsageRepo,
};
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

/// Full credential view (metadata + usages, no secret value).
#[derive(Debug, Serialize)]
pub struct CredentialFull {
    #[serde(flatten)]
    pub credential: Credential,
    pub usages: Vec<Usage>,
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
// Audit helpers
// ---------------------------------------------------------------------------

fn make_audit_entry(
    action: AuditAction,
    subject_id: impl Into<String>,
    _user_id: &str,
) -> AuditLog {
    AuditLog {
        id: AuditLogId::new(),
        seq: 0,
        device_id: None,
        actor: AuditActor::LocalUser,
        action,
        subject_kind: "credential".to_owned(),
        subject_id: subject_id.into(),
        payload_json: None,
        prev_hash: None,
        entry_hash: None,
        signature: None,
        created_at: time::OffsetDateTime::now_utc(),
    }
}

// ---------------------------------------------------------------------------
// Pure logic helpers (unit-testable)
// ---------------------------------------------------------------------------

/// Core create logic shared between the command and tests.
pub async fn do_credential_create(
    pool: &api_vault_storage::sqlite::SqlitePool,
    vault: &mut dyn api_vault_storage::vault::VaultStorage,
    input: &CredentialInput,
    value: &str,
    user_id: &str,
) -> Result<CredentialId, CredentialCommandError> {
    if !vault.is_unlocked().await {
        return Err(CredentialCommandError::NotUnlocked);
    }

    let repo = CredentialRepo::new(pool);

    // Pre-generate id so vault_ref can include it deterministically.
    let id = CredentialId::new();
    let vault_ref = format!("credentials/{id}");

    // SQLite insert using caller-supplied id.
    repo.insert_with_id(Some(id), input, vault_ref.clone())
        .await?;

    // Vault put_secret.
    let secret_bytes = SecretBytes::new(value.as_bytes().to_vec());
    if let Err(vault_err) = vault.put_secret(&vault_ref, secret_bytes).await {
        // Pseudo-rollback: delete the SQLite row.
        let _ = repo.delete(id).await;
        return Err(CredentialCommandError::from(vault_err));
    }

    // Audit log.
    let audit = make_audit_entry(AuditAction::CredentialCreate, id.to_string(), user_id);
    let _ = AuditRepo::new(pool).insert(&audit).await;

    Ok(id)
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn credential_create(
    args: CredentialCreateArgs,
    state: State<'_, AppContext>,
) -> Result<CredentialId, CredentialCommandError> {
    let mut vault = state.vault.write().await;
    do_credential_create(
        &state.pool,
        vault.as_mut(),
        &args.input,
        &args.value,
        &state.user_id,
    )
    .await
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

    Ok(CredentialFull { credential, usages })
}

#[tauri::command]
pub async fn credential_update(
    id: CredentialId,
    patch: CredentialPatch,
    state: State<'_, AppContext>,
) -> Result<(), CredentialCommandError> {
    let repo = CredentialRepo::new(&state.pool);
    repo.update(id, &patch).await?;

    let audit = make_audit_entry(
        AuditAction::CredentialUpdate,
        id.to_string(),
        &state.user_id,
    );
    let _ = AuditRepo::new(&state.pool).insert(&audit).await;

    Ok(())
}

#[tauri::command]
pub async fn credential_delete(
    id: CredentialId,
    state: State<'_, AppContext>,
) -> Result<(), CredentialCommandError> {
    // First resolve vault_ref from DB.
    let cred_repo = CredentialRepo::new(&state.pool);
    let credential = cred_repo
        .get_by_id(id)
        .await?
        .ok_or(CredentialCommandError::NotFound)?;

    let vault_ref = credential.vault_ref.clone();

    // Delete from vault first; if it fails, leave SQLite untouched.
    {
        let mut vault = state.vault.write().await;
        vault.delete_secret(&vault_ref).await?;
    }

    // Then delete from SQLite.
    cred_repo.delete(id).await?;

    let audit = make_audit_entry(
        AuditAction::CredentialDelete,
        id.to_string(),
        &state.user_id,
    );
    let _ = AuditRepo::new(&state.pool).insert(&audit).await;

    Ok(())
}

#[tauri::command]
pub async fn credential_reveal(
    id: CredentialId,
    state: State<'_, AppContext>,
) -> Result<String, CredentialCommandError> {
    let vault = state.vault.read().await;

    if !vault.is_unlocked().await {
        return Err(CredentialCommandError::NotUnlocked);
    }

    let cred_repo = CredentialRepo::new(&state.pool);
    let credential = cred_repo
        .get_by_id(id)
        .await?
        .ok_or(CredentialCommandError::NotFound)?;

    let secret_bytes = vault.get_secret(&credential.vault_ref).await?;
    let value = String::from_utf8(secret_bytes.expose_secret().clone())
        .map_err(|_| CredentialCommandError::InvalidUtf8)?;

    let audit = make_audit_entry(
        AuditAction::CredentialReveal,
        id.to_string(),
        &state.user_id,
    );
    let _ = AuditRepo::new(&state.pool).insert(&audit).await;

    Ok(value)
}

// Tests for credential CRUD logic have been moved to
// `api-vault-storage/tests/credential_vault_integration.rs`
// to avoid AppLocker-blocked proc-macro DLL recompilation in this crate.
