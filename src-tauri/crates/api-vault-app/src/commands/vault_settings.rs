//! Tauri commands for reading/writing settings that must be encrypted in the
//! age vault (e.g. NVD API key, GitHub token). These differ from the plain
//! SQLite settings in `commands/settings.rs`.
//!
//! Vault path convention: `"settings/{key}"`
//! Key whitelist: `["nvd_api_key", "ghsa_token"]`

use serde::Serialize;
use tauri::{AppHandle, State};
use thiserror::Error;

use api_vault_storage::vault::{ExposeSecret, SecretBytes, VaultError};

use crate::context::AppContext;
use crate::services::feed_scheduler::{FeedSchedulerConfig, TauriEmitter};

// ---------------------------------------------------------------------------
// Key whitelist
// ---------------------------------------------------------------------------

/// 허용된 vault settings 키 목록.
const ALLOWED_KEYS: &[&str] = &["nvd_api_key", "ghsa_token"];

fn validate_key(key: &str) -> Result<(), VaultSettingError> {
    if ALLOWED_KEYS.contains(&key) {
        Ok(())
    } else {
        Err(VaultSettingError::UnknownKey {
            key: key.to_owned(),
        })
    }
}

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

#[derive(Debug, Error, Serialize)]
#[serde(tag = "code", rename_all = "snake_case")]
pub enum VaultSettingError {
    /// 볼트가 잠겨 있어 읽기/쓰기가 불가능하다.
    #[error("vault is locked")]
    VaultLocked,

    /// 허용 목록에 없는 키를 요청했다.
    #[error("unknown vault setting key: {key}")]
    UnknownKey { key: String },

    /// 내부 오류.
    #[error("internal error: {message}")]
    Internal { message: String },

    /// 스케줄러 재시작 오류.
    #[error("scheduler restart failed: {message}")]
    SchedulerRestart { message: String },
}

impl From<VaultError> for VaultSettingError {
    fn from(e: VaultError) -> Self {
        match e {
            VaultError::NotUnlocked => Self::VaultLocked,
            other => Self::Internal {
                message: other.to_string(),
            },
        }
    }
}

// ---------------------------------------------------------------------------
// Scheduler reconfigure helper
// ---------------------------------------------------------------------------

/// 볼트에서 `nvd_api_key` / `ghsa_token` 을 읽어 스케줄러를 재시작한다.
///
/// 이미 실행 중인 스케줄러를 shutdown 후 새 설정으로 spawn 한다.
pub(crate) async fn reconfigure_feed_scheduler(
    ctx: &AppContext,
    app_handle: &AppHandle,
) -> Result<(), VaultSettingError> {
    // 볼트에서 키 읽기 (잠겨 있으면 None 으로 처리)
    let (nvd_key, ghsa_token) = {
        let vault = ctx.vault.read().await;
        let nvd = match vault.get_secret("settings/nvd_api_key").await {
            Ok(v) => Some(
                String::from_utf8(v.expose_secret().clone()).map_err(|e| {
                    VaultSettingError::Internal {
                        message: format!("nvd_api_key UTF-8 decode: {e}"),
                    }
                })?,
            ),
            Err(VaultError::NotFound { .. }) | Err(VaultError::NotUnlocked) => None,
            Err(e) => {
                return Err(VaultSettingError::Internal {
                    message: e.to_string(),
                })
            }
        };
        let ghsa = match vault.get_secret("settings/ghsa_token").await {
            Ok(v) => Some(
                String::from_utf8(v.expose_secret().clone()).map_err(|e| {
                    VaultSettingError::Internal {
                        message: format!("ghsa_token UTF-8 decode: {e}"),
                    }
                })?,
            ),
            Err(VaultError::NotFound { .. }) | Err(VaultError::NotUnlocked) => None,
            Err(e) => {
                return Err(VaultSettingError::Internal {
                    message: e.to_string(),
                })
            }
        };
        (nvd, ghsa)
    };

    // 새 스케줄러 설정 빌드
    let config = FeedSchedulerConfig {
        nvd_api_key: nvd_key,
        ghsa_token,
        emitter: Some(std::sync::Arc::new(TauriEmitter::new(app_handle.clone()))),
        ..Default::default()
    };

    // 기존 스케줄러 shutdown 후 새 handle 저장
    let mut guard = ctx.feed_scheduler.lock().await;
    if let Some(old) = guard.take() {
        old.shutdown().await;
    }

    let new_handle = crate::services::feed_scheduler::spawn_feed_scheduler(ctx.pool.clone(), config);
    *guard = Some(new_handle);

    Ok(())
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

/// age vault 에 저장된 설정 값을 읽는다.
///
/// - `key`: 허용 목록 중 하나 (`nvd_api_key`, `ghsa_token`).
/// - 존재하지 않으면 `None` 반환.
/// - 볼트가 잠겨 있으면 `VaultSettingError::VaultLocked`.
#[tauri::command]
pub async fn vault_setting_get(
    key: String,
    state: State<'_, AppContext>,
) -> Result<Option<String>, VaultSettingError> {
    validate_key(&key)?;

    let vault_path = format!("settings/{key}");
    let vault = state.vault.read().await;

    match vault.get_secret(&vault_path).await {
        Ok(bytes) => {
            let s = String::from_utf8(bytes.expose_secret().clone()).map_err(|e| {
                VaultSettingError::Internal {
                    message: format!("UTF-8 decode error: {e}"),
                }
            })?;
            Ok(Some(s))
        }
        Err(VaultError::NotFound { .. }) => Ok(None),
        Err(VaultError::NotUnlocked) => Err(VaultSettingError::VaultLocked),
        Err(e) => Err(VaultSettingError::Internal {
            message: e.to_string(),
        }),
    }
}

/// age vault 에 설정 값을 저장하고 스케줄러를 재구성한다.
///
/// - `value = Some(s)`: `s` 를 vault 에 저장 후 flush.
/// - `value = None`: vault 에서 해당 키 삭제 후 flush.
/// - 성공 시 feed scheduler 를 재구성한다.
#[tauri::command]
pub async fn vault_setting_set(
    key: String,
    value: Option<String>,
    state: State<'_, AppContext>,
    app_handle: AppHandle,
) -> Result<(), VaultSettingError> {
    validate_key(&key)?;

    let vault_path = format!("settings/{key}");

    // vault 쓰기 (write lock 획득 후 해제)
    {
        let mut vault = state.vault.write().await;

        match value {
            Some(ref v) => {
                let bytes = SecretBytes::new(v.as_bytes().to_vec());
                vault.put_secret(&vault_path, bytes).await?;
            }
            None => {
                match vault.delete_secret(&vault_path).await {
                    Ok(()) => {}
                    Err(VaultError::NotFound { .. }) => {
                        // 이미 없는 키 삭제 → 정상 처리
                    }
                    Err(e) => return Err(VaultSettingError::from(e)),
                }
            }
        }

        // 즉시 디스크에 flush (크래시 안전)
        vault.flush().await?;
    } // vault write lock 해제

    // 스케줄러 재구성 (nvd_api_key 또는 ghsa_token 변경 시)
    reconfigure_feed_scheduler(&state, &app_handle)
        .await
        .map_err(|e| VaultSettingError::SchedulerRestart {
            message: e.to_string(),
        })?;

    Ok(())
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use api_vault_storage::vault::{mock::MockVaultStorage, SecretBytes, VaultError, VaultStorage as _};
    use secrecy::ExposeSecret;

    use super::*;

    // -----------------------------------------------------------------------
    // 1. validate_key: 허용 키 → Ok
    // -----------------------------------------------------------------------
    #[test]
    fn validate_allowed_keys_pass() {
        assert!(validate_key("nvd_api_key").is_ok());
        assert!(validate_key("ghsa_token").is_ok());
    }

    // -----------------------------------------------------------------------
    // 2. validate_key: 허용 목록 외 키 → UnknownKey
    // -----------------------------------------------------------------------
    #[test]
    fn validate_unknown_key_returns_error() {
        let err = validate_key("master_password").unwrap_err();
        assert!(
            matches!(err, VaultSettingError::UnknownKey { .. }),
            "허용 목록 외 키 → UnknownKey, got: {err:?}"
        );
    }

    // -----------------------------------------------------------------------
    // 3. get/set round-trip via MockVaultStorage (locked state → VaultLocked)
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn locked_vault_get_returns_vault_locked() {
        let mock = MockVaultStorage::new("pw");
        // 잠금 상태 (unlock 호출 안 함)
        let result = mock.get_secret("settings/nvd_api_key").await;
        assert!(matches!(result, Err(VaultError::NotUnlocked)));

        // VaultError::NotUnlocked → VaultSettingError::VaultLocked
        let converted: VaultSettingError = VaultError::NotUnlocked.into();
        assert!(matches!(converted, VaultSettingError::VaultLocked));
    }

    // -----------------------------------------------------------------------
    // 4. set → flush → get round-trip via MockVaultStorage
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn set_then_get_via_mock() {
        let mut mock = MockVaultStorage::new("pw");
        mock.unlock(secrecy::SecretString::from("pw".to_owned()))
            .await
            .unwrap();

        // put_secret + flush
        let bytes = SecretBytes::new(b"test-nvd-key-value".to_vec());
        mock.put_secret("settings/nvd_api_key", bytes).await.unwrap();
        mock.flush().await.unwrap(); // mock no-op, should succeed

        // get_secret → 값 확인
        let retrieved = mock.get_secret("settings/nvd_api_key").await.unwrap();
        assert_eq!(retrieved.expose_secret(), b"test-nvd-key-value");
    }

    // -----------------------------------------------------------------------
    // 5. delete → flush → get returns NotFound
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn delete_then_get_returns_not_found() {
        let mut mock = MockVaultStorage::new("pw");
        mock.unlock(secrecy::SecretString::from("pw".to_owned()))
            .await
            .unwrap();

        let bytes = SecretBytes::new(b"value".to_vec());
        mock.put_secret("settings/ghsa_token", bytes).await.unwrap();

        mock.delete_secret("settings/ghsa_token").await.unwrap();
        mock.flush().await.unwrap();

        let result = mock.get_secret("settings/ghsa_token").await;
        assert!(matches!(result, Err(VaultError::NotFound { .. })));
    }
}
