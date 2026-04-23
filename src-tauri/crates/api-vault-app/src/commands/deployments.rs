//! Tauri commands for deployment CRUD (T038).
//!
//! A `Deployment` is a specific environment of a project (e.g. vercel staging
//! URL). Usages may reference a deployment to disambiguate which instance of a
//! credential is used where.

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
    Ok(repo.insert(&input).await?)
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
    Ok(())
}
