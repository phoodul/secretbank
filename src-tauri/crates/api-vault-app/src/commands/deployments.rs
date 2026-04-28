//! Tauri commands for deployment CRUD (T038).

use api_vault_audit::AuditActor;
use api_vault_core::{Deployment, DeploymentId, DeploymentInput, DeploymentPatch, ProjectId};
use api_vault_storage::sqlite::repositories::deployment::DeploymentRepo;
use serde::Serialize;
use tauri::State;

use crate::context::AppContext;

#[derive(Debug, thiserror::Error, Serialize)]
#[serde(tag = "code", rename_all = "snake_case")]
pub enum DeploymentCommandError {
    #[error("deployment not found")]
    NotFound,

    #[error("internal: {message}")]
    Internal { message: String },
}

impl From<api_vault_storage::sqlite::StorageError> for DeploymentCommandError {
    fn from(e: api_vault_storage::sqlite::StorageError) -> Self {
        Self::Internal {
            message: e.to_string(),
        }
    }
}

#[tauri::command]
pub async fn deployment_create(
    input: DeploymentInput,
    state: State<'_, AppContext>,
) -> Result<DeploymentId, DeploymentCommandError> {
    let repo = DeploymentRepo::new(&state.pool);
    let id = repo.insert(&input).await?;

    // url is a PII-adjacent label; keep only the environment tier for audit value.
    let env_str = serde_json::to_value(input.env)
        .ok()
        .and_then(|v| v.as_str().map(str::to_owned))
        .unwrap_or_default();
    state
        .audit
        .record(
            AuditActor::LocalUser,
            "deployment.create",
            "deployment",
            id.to_string(),
            Some(serde_json::json!({"environment": env_str}).to_string()),
        )
        .await;

    state
        .db_change_emitter
        .emit_db_changed(&crate::services::sync_emit::DbChangePayload::upsert(
            crate::services::sync_emit::DbChangeEntity::Deployment,
            id.to_string(),
        ));

    Ok(id)
}

#[tauri::command]
pub async fn deployment_list_for_project(
    project_id: ProjectId,
    state: State<'_, AppContext>,
) -> Result<Vec<Deployment>, DeploymentCommandError> {
    // Defense-in-depth: vault locked → return empty list (label leakage guard).
    {
        let vault = state.vault.read().await;
        if !vault.is_unlocked().await {
            return Ok(vec![]);
        }
    }
    let repo = DeploymentRepo::new(&state.pool);
    Ok(repo.list_for_project(project_id).await?)
}

#[tauri::command]
pub async fn deployment_update(
    id: DeploymentId,
    patch: DeploymentPatch,
    state: State<'_, AppContext>,
) -> Result<Deployment, DeploymentCommandError> {
    let repo = DeploymentRepo::new(&state.pool);
    repo.update(id, &patch).await?;

    let mut updated_fields: Vec<&str> = Vec::new();
    if patch.url.is_some() { updated_fields.push("url"); }
    if patch.platform.is_some() { updated_fields.push("platform"); }
    if patch.env.is_some() { updated_fields.push("env"); }
    let payload = if updated_fields.is_empty() {
        None
    } else {
        Some(serde_json::json!({ "updated_fields": updated_fields }).to_string())
    };

    state
        .audit
        .record(
            AuditActor::LocalUser,
            "deployment.update",
            "deployment",
            id.to_string(),
            payload,
        )
        .await;

    state
        .db_change_emitter
        .emit_db_changed(&crate::services::sync_emit::DbChangePayload::upsert(
            crate::services::sync_emit::DbChangeEntity::Deployment,
            id.to_string(),
        ));

    repo.get_by_id(id)
        .await?
        .ok_or(DeploymentCommandError::NotFound)
}

#[tauri::command]
pub async fn deployment_delete(
    id: DeploymentId,
    state: State<'_, AppContext>,
) -> Result<(), DeploymentCommandError> {
    let repo = DeploymentRepo::new(&state.pool);
    repo.delete(id).await?;

    state
        .audit
        .record(
            AuditActor::LocalUser,
            "deployment.delete",
            "deployment",
            id.to_string(),
            None,
        )
        .await;

    state
        .db_change_emitter
        .emit_db_changed(&crate::services::sync_emit::DbChangePayload::delete(
            crate::services::sync_emit::DbChangeEntity::Deployment,
            id.to_string(),
        ));

    Ok(())
}
