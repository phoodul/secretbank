//! Charter cooldown UI 커맨드 (M23-E).
//!
//! 사용자는 vault 가 unlocked 인 상태에서 settings 토글로 cooldown 활성/비활성 변경.
//! `clear` 는 active cooldown 을 사용자가 명시적으로 해제 (vault 가 열려있으니
//! 본인 인증된 상태). 모든 read 는 잠금/해제 무관하게 가능.

use serde::Serialize;
use tauri::State;

use crate::context::AppContext;
use crate::services::charter_cooldown;

#[derive(Debug, thiserror::Error, Serialize)]
#[serde(tag = "code", rename_all = "snake_case")]
pub enum CharterCooldownError {
    #[error("vault not unlocked")]
    NotUnlocked,

    #[error("internal: {message}")]
    Internal { message: String },
}

impl From<charter_cooldown::CooldownError> for CharterCooldownError {
    fn from(e: charter_cooldown::CooldownError) -> Self {
        Self::Internal {
            message: e.to_string(),
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "snake_case")]
pub struct CharterCooldownStatusDto {
    pub enabled: bool,
    pub cooldown_until_unix_ms: Option<u64>,
    pub last_recovery_unix_ms: Option<u64>,
    /// 0 = no active cooldown; otherwise the remaining seconds until unlock allowed.
    pub seconds_remaining: u64,
}

#[tauri::command]
pub async fn charter_cooldown_status(
    state: State<'_, AppContext>,
) -> Result<CharterCooldownStatusDto, CharterCooldownError> {
    let s = charter_cooldown::read(&state.data_dir)?;
    let seconds_remaining = charter_cooldown::check_active(&state.data_dir)?.unwrap_or(0);
    Ok(CharterCooldownStatusDto {
        enabled: s.enabled,
        cooldown_until_unix_ms: s.cooldown_until_unix_ms,
        last_recovery_unix_ms: s.last_recovery_unix_ms,
        seconds_remaining,
    })
}

#[tauri::command]
pub async fn charter_cooldown_set_enabled(
    enabled: bool,
    state: State<'_, AppContext>,
) -> Result<CharterCooldownStatusDto, CharterCooldownError> {
    // 토글은 vault 가 unlocked 일 때만 허용 (본인 확인).
    {
        let vault = state.vault.read().await;
        if !vault.is_unlocked().await {
            return Err(CharterCooldownError::NotUnlocked);
        }
    }
    let s = charter_cooldown::set_enabled(&state.data_dir, enabled)?;
    let seconds_remaining = charter_cooldown::check_active(&state.data_dir)?.unwrap_or(0);
    Ok(CharterCooldownStatusDto {
        enabled: s.enabled,
        cooldown_until_unix_ms: s.cooldown_until_unix_ms,
        last_recovery_unix_ms: s.last_recovery_unix_ms,
        seconds_remaining,
    })
}

#[tauri::command]
pub async fn charter_cooldown_clear(
    state: State<'_, AppContext>,
) -> Result<CharterCooldownStatusDto, CharterCooldownError> {
    {
        let vault = state.vault.read().await;
        if !vault.is_unlocked().await {
            return Err(CharterCooldownError::NotUnlocked);
        }
    }
    let s = charter_cooldown::clear_cooldown(&state.data_dir)?;
    Ok(CharterCooldownStatusDto {
        enabled: s.enabled,
        cooldown_until_unix_ms: s.cooldown_until_unix_ms,
        last_recovery_unix_ms: s.last_recovery_unix_ms,
        seconds_remaining: 0,
    })
}
