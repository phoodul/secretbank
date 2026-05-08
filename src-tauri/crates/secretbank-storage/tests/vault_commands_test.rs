//! Unit tests for vault command logic.
//!
//! These tests mirror the logic in `secretbank-app::commands::vault`
//! using `MockVaultStorage`.
//!
//! Compiled only when the `mock` feature is enabled.
#![cfg(feature = "mock")]

use secrecy::SecretString;
use secretbank_storage::vault::{mock::MockVaultStorage, VaultError, VaultStorage};

// ---------------------------------------------------------------------------
// Error type (mirrors VaultCommandError)
// ---------------------------------------------------------------------------

#[derive(Debug, PartialEq)]
enum VaultCmdError {
    WrongPassword,
    NotUnlocked,
    NotInitialized,
    AlreadyInitialized,
    Internal(String),
}

impl From<VaultError> for VaultCmdError {
    fn from(e: VaultError) -> Self {
        match e {
            VaultError::WrongPassword => Self::WrongPassword,
            VaultError::NotUnlocked => Self::NotUnlocked,
            VaultError::Crypto(msg) if msg.contains("not initialized") => Self::NotInitialized,
            VaultError::Crypto(msg) if msg.contains("already initialized") => {
                Self::AlreadyInitialized
            }
            other => Self::Internal(other.to_string()),
        }
    }
}

// ---------------------------------------------------------------------------
// Helpers (mirrors vault command logic)
// ---------------------------------------------------------------------------

async fn do_vault_unlock(
    vault: &mut dyn VaultStorage,
    password: &str,
) -> Result<(), VaultCmdError> {
    let secret = SecretString::new(password.to_owned().into());
    vault.unlock(secret).await.map_err(VaultCmdError::from)
}

async fn do_vault_lock(vault: &mut dyn VaultStorage) -> Result<(), VaultCmdError> {
    vault.lock().await.map_err(VaultCmdError::from)
}

// VaultStatus equivalent
#[derive(Debug, PartialEq)]
enum VaultStatus {
    Uninitialized,
    Locked,
    Unlocked,
}

async fn do_vault_status(vault: &dyn VaultStorage, file_exists: bool) -> VaultStatus {
    if !file_exists {
        return VaultStatus::Uninitialized;
    }
    if vault.is_unlocked().await {
        VaultStatus::Unlocked
    } else {
        VaultStatus::Locked
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[tokio::test]
async fn init_then_unlock() {
    let mut vault = MockVaultStorage::new("secret123");
    let result = do_vault_unlock(&mut vault, "secret123").await;
    assert!(result.is_ok(), "unlock should succeed");
    assert!(vault.is_unlocked().await);
}

#[tokio::test]
async fn unlock_wrong_password_maps_to_error_variant() {
    let mut vault = MockVaultStorage::new("correct");
    let err = do_vault_unlock(&mut vault, "wrong")
        .await
        .expect_err("should fail");
    assert_eq!(err, VaultCmdError::WrongPassword);
}

#[tokio::test]
async fn lock_after_unlock() {
    let mut vault = MockVaultStorage::new("pass");
    do_vault_unlock(&mut vault, "pass").await.unwrap();

    let status = do_vault_status(&vault, true).await;
    assert_eq!(status, VaultStatus::Unlocked);

    do_vault_lock(&mut vault).await.unwrap();

    let status_after = do_vault_status(&vault, true).await;
    assert_eq!(status_after, VaultStatus::Locked);
}

#[tokio::test]
async fn uninitialized_when_file_absent() {
    let vault = MockVaultStorage::new("pass");
    let status = do_vault_status(&vault, false).await;
    assert_eq!(status, VaultStatus::Uninitialized);
}
