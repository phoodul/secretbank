//! Tauri commands for vault state management (T021).
//!
//! Each command delegates to a pure helper function so unit tests
//! can exercise logic without a running Tauri app.

use serde::Serialize;
use tauri::State;

use api_vault_storage::vault::{VaultError, VaultStorage};

use crate::context::AppContext;

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

#[derive(Debug, thiserror::Error, Serialize)]
#[serde(tag = "code", rename_all = "snake_case")]
pub enum VaultCommandError {
    #[error("vault already initialized")]
    AlreadyInitialized,

    #[error("vault not initialized")]
    NotInitialized,

    #[error("wrong password")]
    WrongPassword,

    #[error("vault not unlocked")]
    NotUnlocked,

    #[error("internal error: {message}")]
    Internal { message: String },
}

impl From<VaultError> for VaultCommandError {
    fn from(e: VaultError) -> Self {
        match e {
            VaultError::WrongPassword => Self::WrongPassword,
            VaultError::NotUnlocked => Self::NotUnlocked,
            VaultError::Crypto(msg) if msg.contains("not initialized") => Self::NotInitialized,
            VaultError::Crypto(msg) if msg.contains("already initialized") => {
                Self::AlreadyInitialized
            }
            other => Self::Internal {
                message: other.to_string(),
            },
        }
    }
}

impl From<std::io::Error> for VaultCommandError {
    fn from(e: std::io::Error) -> Self {
        Self::Internal {
            message: e.to_string(),
        }
    }
}

impl From<api_vault_storage::sqlite::StorageError> for VaultCommandError {
    fn from(e: api_vault_storage::sqlite::StorageError) -> Self {
        Self::Internal {
            message: e.to_string(),
        }
    }
}

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

/// Serializable vault status returned by [`vault_status`].
#[derive(Debug, Serialize)]
#[serde(rename_all = "snake_case", tag = "state")]
pub enum VaultStatus {
    Uninitialized,
    Locked,
    Unlocked,
}

// ---------------------------------------------------------------------------
// Pure logic helpers (unit-testable without Tauri)
// ---------------------------------------------------------------------------

pub async fn do_vault_unlock(
    vault: &mut dyn VaultStorage,
    password: &str,
) -> Result<(), VaultCommandError> {
    let secret = secrecy::SecretString::new(password.to_owned().into());
    vault.unlock(secret).await.map_err(VaultCommandError::from)
}

pub async fn do_vault_lock(vault: &mut dyn VaultStorage) -> Result<(), VaultCommandError> {
    vault.lock().await.map_err(VaultCommandError::from)
}

pub async fn do_vault_status(vault: &dyn VaultStorage, vault_file_exists: bool) -> VaultStatus {
    if !vault_file_exists {
        return VaultStatus::Uninitialized;
    }
    if vault.is_unlocked().await {
        VaultStatus::Unlocked
    } else {
        VaultStatus::Locked
    }
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn vault_init(
    password: String,
    state: State<'_, AppContext>,
) -> Result<(), VaultCommandError> {
    let vault_path = state.data_dir.join("vault.age");
    if vault_path.exists() {
        return Err(VaultCommandError::AlreadyInitialized);
    }

    let secret = secrecy::SecretString::new(password.into());
    state
        .initialize_vault(&secret)
        .await
        .map_err(VaultCommandError::from)
}

#[tauri::command]
pub async fn vault_unlock(
    password: String,
    state: State<'_, AppContext>,
) -> Result<(), VaultCommandError> {
    let mut vault = state.vault.write().await;
    do_vault_unlock(vault.as_mut(), &password).await
}

#[tauri::command]
pub async fn vault_lock(state: State<'_, AppContext>) -> Result<(), VaultCommandError> {
    let mut vault = state.vault.write().await;
    do_vault_lock(vault.as_mut()).await
}

#[tauri::command]
pub async fn vault_status(state: State<'_, AppContext>) -> Result<VaultStatus, VaultCommandError> {
    let vault = state.vault.read().await;
    let vault_path = state.data_dir.join("vault.age");
    Ok(do_vault_status(vault.as_ref(), vault_path.exists()).await)
}

// Vault command unit tests have been moved to
// `api-vault-storage/tests/vault_commands_test.rs`
// to run within the already-compiled storage crate context.
