//! Tauri commands for usage records (T035).

use api_vault_audit::AuditActor;
use api_vault_core::{CredentialId, ProjectId, Usage, UsageId, UsageInput};
use api_vault_storage::sqlite::repositories::usage::UsageRepo;
use serde::Serialize;
use tauri::State;

use crate::context::AppContext;

#[derive(Debug, thiserror::Error, Serialize)]
#[serde(tag = "code", rename_all = "snake_case")]
pub enum UsageCommandError {
    #[error("internal: {message}")]
    Internal { message: String },
}

impl From<api_vault_storage::sqlite::StorageError> for UsageCommandError {
    fn from(e: api_vault_storage::sqlite::StorageError) -> Self {
        Self::Internal {
            message: e.to_string(),
        }
    }
}

#[tauri::command]
pub async fn usage_create(
    input: UsageInput,
    state: State<'_, AppContext>,
) -> Result<UsageId, UsageCommandError> {
    let repo = UsageRepo::new(&state.pool);
    let id = repo.insert(&input).await?;

    // subject_id = credential that gains a new usage; project_id links the two.
    // Both are opaque IDs — no label leakage.
    state
        .audit
        .record(
            AuditActor::LocalUser,
            "usage.create",
            "credential",
            input.credential_id.to_string(),
            Some(serde_json::json!({ "project_id": input.project_id.to_string() }).to_string()),
        )
        .await;

    Ok(id)
}

#[tauri::command]
pub async fn usage_list_for_credential(
    credential_id: CredentialId,
    state: State<'_, AppContext>,
) -> Result<Vec<Usage>, UsageCommandError> {
    // Defense-in-depth: vault locked → return empty list (label leakage guard).
    {
        let vault = state.vault.read().await;
        if !vault.is_unlocked().await {
            return Ok(vec![]);
        }
    }
    let repo = UsageRepo::new(&state.pool);
    Ok(repo.list_for_credential(credential_id).await?)
}

#[tauri::command]
pub async fn usage_list_for_project(
    project_id: ProjectId,
    state: State<'_, AppContext>,
) -> Result<Vec<Usage>, UsageCommandError> {
    // Defense-in-depth: vault locked → return empty list (label leakage guard).
    {
        let vault = state.vault.read().await;
        if !vault.is_unlocked().await {
            return Ok(vec![]);
        }
    }
    let repo = UsageRepo::new(&state.pool);
    Ok(repo.list_for_project(project_id).await?)
}

#[tauri::command]
pub async fn usage_delete(
    id: UsageId,
    state: State<'_, AppContext>,
) -> Result<(), UsageCommandError> {
    let repo = UsageRepo::new(&state.pool);
    repo.delete(id).await?;

    state
        .audit
        .record(
            AuditActor::LocalUser,
            "usage.delete",
            "usage",
            id.to_string(),
            None,
        )
        .await;

    Ok(())
}
