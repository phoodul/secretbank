//! Tauri commands for vault state management (T021).
//!
//! Each command delegates to a pure helper function so unit tests
//! can exercise logic without a running Tauri app.

use api_vault_audit::AuditActor;
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
        .map_err(VaultCommandError::from)?;

    state
        .audit
        .record(
            AuditActor::System,
            "vault.init",
            "vault",
            state.user_id.clone(),
            None,
        )
        .await;

    Ok(())
}

#[tauri::command]
pub async fn vault_unlock(
    password: String,
    state: State<'_, AppContext>,
    app_handle: tauri::AppHandle,
) -> Result<(), VaultCommandError> {
    {
        let mut vault = state.vault.write().await;
        do_vault_unlock(vault.as_mut(), &password).await?;
    }
    // M9 Phase B-1: stash the master passphrase so the M8 verify flow and
    // M9 sync's `derive_session_keys` can reproduce `enc_key` without
    // re-prompting the user. Cleared in `vault_lock` (Drop auto-zeroize).
    //
    // Security note: see `AppContext::master_passphrase` doc — vault unlocked
    // already keeps the X25519 Identity in memory, so this does not widen the
    // attack surface. Decision: project-decisions.md [2026-04-28] B.
    {
        let mut guard = state.master_passphrase.write().await;
        *guard = Some(secrecy::SecretString::new(password.clone().into()));
    }
    // 볼트가 열렸으므로 저장된 API 키로 스케줄러를 재구성한다.
    if let Err(e) =
        crate::commands::vault_settings::reconfigure_feed_scheduler(&state, &app_handle).await
    {
        tracing::warn!(error = %e, "vault_unlock 후 스케줄러 재구성 실패 (비치명적)");
    }
    // 디바이스 서명 키 보장 — 실패해도 unlock 자체를 막지 않는다.
    {
        use crate::services::device_identity::{detect_platform, ensure_device_keys};
        let platform = detect_platform();
        match ensure_device_keys(
            state.vault.clone(),
            &state.pool,
            hostname_or_default(),
            platform,
        )
        .await
        {
            Ok(identity) => {
                let mut guard = state.device_identity.write().await;
                *guard = Some(identity);
            }
            Err(e) => {
                tracing::warn!(error = %e, "device identity 초기화 실패 (비치명적)");
            }
        }
    }

    // M8: 볼트가 열렸으니 영속된 인증 세션을 메모리로 끌어올린다.
    // 실패는 세션 없음으로 처리(사용자가 다시 sign-in 하도록).
    if let Err(e) = crate::commands::auth::hydrate_session_from_vault(&state).await {
        tracing::warn!(error = %e, "auth session hydrate 실패 (비치명적)");
    }

    state
        .audit
        .record(
            AuditActor::LocalUser,
            "vault.unlock",
            "vault",
            state.user_id.clone(),
            None,
        )
        .await;

    Ok(())
}

/// 호스트명 또는 기본값 `"this-device"` 를 반환한다.
fn hostname_or_default() -> String {
    std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .unwrap_or_else(|_| "this-device".to_owned())
}

#[tauri::command]
pub async fn vault_lock(state: State<'_, AppContext>) -> Result<(), VaultCommandError> {
    // 잠금 전에 먼저 audit 기록 (identity 가 있는 동안)
    state
        .audit
        .record(
            AuditActor::LocalUser,
            "vault.lock",
            "vault",
            state.user_id.clone(),
            None,
        )
        .await;

    // 디바이스 identity 클리어 (서명 키를 메모리에서 제거)
    {
        let mut guard = state.device_identity.write().await;
        *guard = None;
    }
    // M8: auth_session 메모리 캐시도 비운다 (영속본은 보존 — 다음 unlock 시
    // hydrate_session_from_vault 가 다시 끌어올린다). enc_key 는 AuthSession
    // 내부 필드이므로 자동 zeroize 된다.
    {
        let mut guard = state.auth_session.write().await;
        *guard = None;
    }
    // M9 Phase B-1: master_passphrase zeroize (SecretString Drop).
    {
        let mut guard = state.master_passphrase.write().await;
        *guard = None;
    }
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
