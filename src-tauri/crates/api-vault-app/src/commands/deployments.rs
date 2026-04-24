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

    state
        .audit
        .record(
            AuditActor::LocalUser,
            "deployment.create",
            "deployment",
            id.to_string(),
            Some(serde_json::json!({"url": input.url}).to_string()),
        )
        .await;

    Ok(id)
}

#[tauri::command]
pub async fn deployment_list_for_project(
    project_id: ProjectId,
    state: State<'_, AppContext>,
) -> Result<Vec<Deployment>, DeploymentCommandError> {
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

    state
        .audit
        .record(
            AuditActor::LocalUser,
            "deployment.update",
            "deployment",
            id.to_string(),
            None,
        )
        .await;

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

    Ok(())
}
