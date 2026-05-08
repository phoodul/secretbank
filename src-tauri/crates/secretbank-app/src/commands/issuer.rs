//! Tauri commands for issuer metadata (T028).

use secretbank_core::{Issuer, IssuerId};
use secretbank_storage::sqlite::repositories::issuer::IssuerRepo;
use serde::Serialize;
use tauri::State;

use crate::context::AppContext;

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

#[derive(Debug, thiserror::Error, Serialize)]
#[serde(tag = "code", rename_all = "snake_case")]
pub enum IssuerCommandError {
    #[error("issuer not found")]
    NotFound,

    #[error("internal: {message}")]
    Internal { message: String },
}

impl From<secretbank_storage::sqlite::StorageError> for IssuerCommandError {
    fn from(e: secretbank_storage::sqlite::StorageError) -> Self {
        Self::Internal {
            message: e.to_string(),
        }
    }
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn issuer_list(state: State<'_, AppContext>) -> Result<Vec<Issuer>, IssuerCommandError> {
    let repo = IssuerRepo::new(&state.pool);
    Ok(repo.list().await?)
}

#[tauri::command]
pub async fn issuer_get(
    id: IssuerId,
    state: State<'_, AppContext>,
) -> Result<Issuer, IssuerCommandError> {
    let repo = IssuerRepo::new(&state.pool);
    repo.get_by_id(id)
        .await?
        .ok_or(IssuerCommandError::NotFound)
}
