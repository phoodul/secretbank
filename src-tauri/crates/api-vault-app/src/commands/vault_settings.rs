//! Tauri commands for reading/writing settings that must be encrypted in the
//! age vault (e.g. NVD API key, GitHub token). These differ from the plain
//! SQLite settings in `commands/settings.rs`.
//!
//! Vault path convention: `"settings/{key}"`
//! Key whitelist: `["nvd_api_key", "ghsa_token"]`

use api_vault_audit::AuditActor;
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
const ALLOWED_KEYS: &[&str] = &["nvd_api_key", "ghsa_token", "github_installations", "pro_until"];

/// 일반 설정 최대 바이트 길이 (API 키 등).
const DEFAULT_MAX_VALUE_LEN: usize = 256;

/// `github_installations` 키의 최대 바이트 길이.
/// installation 메타데이터가 길어질 수 있으므로 16 KB 로 상향.
const GITHUB_INSTALLATIONS_MAX_LEN: usize = 16384;

/// `pro_until` 키의 최대 바이트 길이.
/// 13자리 Unix ms timestamp 십진수 문자열 — 64B 이면 충분하다.
const PRO_UNTIL_MAX_LEN: usize = 64;

/// 키별 최대 값 길이를 반환한다.
fn max_value_len_for(key: &str) -> usize {
    match key {
        "github_installations" => GITHUB_INSTALLATIONS_MAX_LEN,
        "pro_until" => PRO_UNTIL_MAX_LEN,
        _ => DEFAULT_MAX_VALUE_LEN,
    }
}

fn validate_key(key: &str) -> Result<(), VaultSettingError> {
    if ALLOWED_KEYS.contains(&key) {
        Ok(())
    } else {
        Err(VaultSettingError::UnknownKey {
            key: key.to_owned(),
        })
    }
}

fn validate_value(key: &str, value: &str) -> Result<(), VaultSettingError> {
    let max = max_value_len_for(key);
    if value.len() > max {
        Err(VaultSettingError::ValueTooLong { max })
    } else {
        Ok(())
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

    /// 값이 허용 최대 길이를 초과한다.
    #[error("value exceeds maximum length of {max} bytes")]
    ValueTooLong { max: usize },

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
    if let Some(ref v) = value {
        validate_value(&key, v)?;
    }

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

    // subject_id already carries the key name; no extra payload needed.
    state
        .audit
        .record(
            AuditActor::LocalUser,
            "vault_setting.set",
            "vault_setting",
            key.clone(),
            None,
        )
        .await;

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
    // 6. validate_value: 257 byte value → ValueTooLong
    // -----------------------------------------------------------------------
    #[test]
    fn validate_value_too_long_returns_error() {
        let long_value = "x".repeat(DEFAULT_MAX_VALUE_LEN + 1);
        let err = validate_value("nvd_api_key", &long_value).unwrap_err();
        assert!(
            matches!(err, VaultSettingError::ValueTooLong { max: 256 }),
            "257-byte value must return ValueTooLong, got: {err:?}"
        );
    }

    // -----------------------------------------------------------------------
    // 7. validate_value: exactly DEFAULT_MAX_VALUE_LEN bytes → Ok
    // -----------------------------------------------------------------------
    #[test]
    fn validate_value_at_max_len_passes() {
        let max_value = "x".repeat(DEFAULT_MAX_VALUE_LEN);
        assert!(
            validate_value("nvd_api_key", &max_value).is_ok(),
            "value at exactly DEFAULT_MAX_VALUE_LEN must be accepted"
        );
    }

    // -----------------------------------------------------------------------
    // 8. validate_value: github_installations 는 16384 바이트 허용
    // -----------------------------------------------------------------------
    #[test]
    fn validate_value_github_installations_allows_large_value() {
        let large_value = "x".repeat(GITHUB_INSTALLATIONS_MAX_LEN);
        assert!(
            validate_value("github_installations", &large_value).is_ok(),
            "16384-byte github_installations value must pass"
        );
        let too_large = "x".repeat(GITHUB_INSTALLATIONS_MAX_LEN + 1);
        let err = validate_value("github_installations", &too_large).unwrap_err();
        assert!(
            matches!(err, VaultSettingError::ValueTooLong { max: 16384 }),
            "got: {err:?}"
        );
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
