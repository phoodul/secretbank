//! Tauri commands for project CRUD (T035).

use api_vault_audit::AuditActor;
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
    let id = repo.insert(&input).await?;

    state
        .audit
        .record(
            AuditActor::LocalUser,
            "project.create",
            "project",
            id.to_string(),
            Some(serde_json::json!({"name": input.name}).to_string()),
        )
        .await;

    Ok(id)
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

    state
        .audit
        .record(
            AuditActor::LocalUser,
            "project.update",
            "project",
            id.to_string(),
            None,
        )
        .await;

    repo.get_by_id(id).await?.ok_or(ProjectCommandError::NotFound)
}

#[tauri::command]
pub async fn project_delete(
    id: ProjectId,
    state: State<'_, AppContext>,
) -> Result<(), ProjectCommandError> {
    let repo = ProjectRepo::new(&state.pool);
    repo.delete(id).await?;

    state
        .audit
        .record(
            AuditActor::LocalUser,
            "project.delete",
            "project",
            id.to_string(),
            None,
        )
        .await;

    Ok(())
}
