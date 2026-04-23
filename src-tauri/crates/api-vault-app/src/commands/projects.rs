//! Tauri commands for project CRUD (T035).
//!
//! Projects group credentials by the repository/folder that consumes them.
//! Used by the drop-scan import flow to auto-create a project from the scanned
//! folder name before registering detected credentials.

use api_vault_core::{Project, ProjectId, ProjectInput, ProjectPatch};
use api_vault_storage::sqlite::repositories::project::ProjectRepo;
use serde::Serialize;
use tauri::State;

use crate::context::AppContext;

#[derive(Debug, thiserror::Error, Serialize)]
#[serde(tag = "code", rename_all = "snake_case")]
pub enum ProjectCommandError {
    #[error("project not found")]
    NotFound,

    #[error("internal: {message}")]
    Internal { message: String },
}

impl From<api_vault_storage::sqlite::StorageError> for ProjectCommandError {
    fn from(e: api_vault_storage::sqlite::StorageError) -> Self {
        Self::Internal {
            message: e.to_string(),
        }
    }
}

#[tauri::command]
pub async fn project_create(
    input: ProjectInput,
    state: State<'_, AppContext>,
) -> Result<ProjectId, ProjectCommandError> {
    let repo = ProjectRepo::new(&state.pool);
    Ok(repo.insert(&input).await?)
}

#[tauri::command]
pub async fn project_list(
    state: State<'_, AppContext>,
) -> Result<Vec<Project>, ProjectCommandError> {
    let repo = ProjectRepo::new(&state.pool);
    Ok(repo.list().await?)
}

#[tauri::command]
pub async fn project_get(
    id: ProjectId,
    state: State<'_, AppContext>,
) -> Result<Project, ProjectCommandError> {
    let repo = ProjectRepo::new(&state.pool);
    repo.get_by_id(id).await?.ok_or(ProjectCommandError::NotFound)
}

#[tauri::command]
pub async fn project_update(
    id: ProjectId,
    patch: ProjectPatch,
    state: State<'_, AppContext>,
) -> Result<Project, ProjectCommandError> {
    let repo = ProjectRepo::new(&state.pool);
    repo.update(id, &patch).await?;
    repo.get_by_id(id).await?.ok_or(ProjectCommandError::NotFound)
}

#[tauri::command]
pub async fn project_delete(
    id: ProjectId,
    state: State<'_, AppContext>,
) -> Result<(), ProjectCommandError> {
    let repo = ProjectRepo::new(&state.pool);
    repo.delete(id).await?;
    Ok(())
}
