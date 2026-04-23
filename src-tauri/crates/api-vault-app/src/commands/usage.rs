//! Tauri commands for usage records (T035).
//!
//! A `Usage` links a credential to a project (optionally a deployment) and
//! records where the key is referenced — typically an env var name or file
//! path discovered during a folder scan.

use api_vault_core::{CredentialId, Usage, UsageId, UsageInput};
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
    Ok(repo.insert(&input).await?)
}

#[tauri::command]
pub async fn usage_list_for_credential(
    credential_id: CredentialId,
    state: State<'_, AppContext>,
) -> Result<Vec<Usage>, UsageCommandError> {
    let repo = UsageRepo::new(&state.pool);
    Ok(repo.list_for_credential(credential_id).await?)
}
