// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2025 Secretbank contributors
//
// B-7: Extension session token Tauri 커맨드.
//
// # 흐름
//   1. `extension_session_issue`: vault 에서 secret_key 읽기 (없으면 CSPRNG 생성 후 저장)
//      → session.rs `issue_token` 호출 → base64url 토큰 반환.
//   2. `extension_session_verify`: vault 에서 secret_key 읽기 → verify_token → bool 반환.
//   3. `extension_session_settings_get`: vault_setting "extension_session_ttl" 조회.
//   4. `extension_session_settings_set`: 설정 저장 + secret_key 회전 (기존 token 즉시 무효화).
//
// # vault path 규칙
//   `device/extension/{ext_id}/session_secret` — 32-byte CSPRNG
//
// # 보안
//   - SecretBytes 래핑 — IPC 평문 미통과
//   - secret_key 회전 시 기존 token 모두 즉시 무효화

use rand::RngCore as _;
use secretbank_audit::{actions, AuditActor};
use secretbank_nm_host::session;
use secretbank_storage::vault::SecretBytes;
use serde::{Deserialize, Serialize};
use tauri::State;
use thiserror::Error;

use crate::context::AppContext;

// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------

/// 허용되는 세션 만료 TTL 옵션 (초 단위).
///
/// `until_lock` = 사용자가 직접 잠금할 때까지 (최대 24시간 = 86400).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum SessionTtlOption {
    /// 30분
    Mins30,
    /// 1시간
    Hour1,
    /// 4시간 (기본값, Q4 결정)
    #[default]
    Hours4,
    /// 8시간
    Hours8,
    /// 사용자가 직접 잠금할 때까지 (= 24시간 max)
    UntilLock,
}

impl SessionTtlOption {
    /// TTL 옵션을 초 단위로 변환한다.
    pub fn to_secs(self) -> u64 {
        match self {
            Self::Mins30 => 30 * 60,
            Self::Hour1 => 60 * 60,
            Self::Hours4 => 4 * 60 * 60,
            Self::Hours8 => 8 * 60 * 60,
            Self::UntilLock => 24 * 60 * 60, // 최대 24시간
        }
    }

    /// vault_setting 저장 문자열 키
    fn as_str(self) -> &'static str {
        match self {
            Self::Mins30 => "mins30",
            Self::Hour1 => "hour1",
            Self::Hours4 => "hours4",
            Self::Hours8 => "hours8",
            Self::UntilLock => "until_lock",
        }
    }

    /// vault_setting 저장 문자열에서 복원
    fn from_str(s: &str) -> Option<Self> {
        match s {
            "mins30" => Some(Self::Mins30),
            "hour1" => Some(Self::Hour1),
            "hours4" => Some(Self::Hours4),
            "hours8" => Some(Self::Hours8),
            "until_lock" => Some(Self::UntilLock),
            _ => None,
        }
    }
}

/// extension_session_settings_get/set 페이로드.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SessionSettings {
    /// 세션 만료 TTL 옵션.
    pub ttl: SessionTtlOption,
}

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

#[derive(Debug, Error, Serialize)]
#[serde(tag = "code", rename_all = "snake_case")]
pub enum ExtSessionError {
    /// vault 가 잠겨 있어 작업 불가.
    #[error("vault is locked")]
    VaultLocked,

    /// vault put/get/flush 오류.
    #[error("vault storage error")]
    VaultStorage,

    /// vault_setting 읽기/쓰기 오류.
    #[error("setting storage error")]
    SettingStorage,

    /// 내부 오류.
    #[error("internal error: {message}")]
    Internal { message: String },
}

impl From<secretbank_storage::vault::VaultError> for ExtSessionError {
    fn from(e: secretbank_storage::vault::VaultError) -> Self {
        match e {
            secretbank_storage::vault::VaultError::NotUnlocked => Self::VaultLocked,
            _ => Self::VaultStorage,
        }
    }
}

// ---------------------------------------------------------------------------
// vault_setting 키 (TTL 설정 저장용)
// ---------------------------------------------------------------------------

const SETTING_KEY_TTL: &str = "extension_session_ttl";

// ---------------------------------------------------------------------------
// 내부 헬퍼 — session_secret 읽기 (없으면 CSPRNG 생성 후 저장)
// ---------------------------------------------------------------------------

/// vault 에서 `device/extension/{ext_id}/session_secret` (32 bytes) 를 읽는다.
/// 없으면 CSPRNG 32 bytes 생성 후 저장하고 반환.
///
/// 반환: 32-byte secret key
async fn get_or_create_session_secret(
    ctx: &AppContext,
    ext_id: &str,
) -> Result<[u8; 32], ExtSessionError> {
    let secret_path = session_secret_path(ext_id);

    // 1. 읽기 시도
    {
        let vault = ctx.vault.read().await;
        if !vault.is_unlocked().await {
            return Err(ExtSessionError::VaultLocked);
        }

        match vault.get_secret(&secret_path).await {
            Ok(stored) => {
                use secretbank_storage::vault::ExposeSecret as _;
                let bytes = stored.expose_secret();
                if bytes.len() == 32 {
                    let mut key = [0u8; 32];
                    key.copy_from_slice(bytes.as_slice());
                    return Ok(key);
                }
                // 길이 불일치 → 재생성 (아래에서 처리)
            }
            Err(secretbank_storage::vault::VaultError::NotFound { .. }) => {
                // 없으면 생성
            }
            Err(e) => return Err(e.into()),
        }
    }

    // 2. CSPRNG 32 bytes 생성 후 저장
    let mut key = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut key);

    {
        let mut vault = ctx.vault.write().await;
        vault
            .put_secret(&secret_path, SecretBytes::new(key.to_vec()))
            .await?;
        vault.flush().await?;
    }

    Ok(key)
}

/// `device/extension/{ext_id}/session_secret` vault path 생성
fn session_secret_path(ext_id: &str) -> String {
    format!("device/extension/{ext_id}/session_secret")
}

/// session_secret 를 회전 (CSPRNG 새 값으로 덮어쓰기).
/// 기존 token 모두 즉시 무효화.
/// 회전 완료 후 `extension.session.revoke` audit 를 기록한다.
async fn rotate_session_secret(ctx: &AppContext, ext_id: &str) -> Result<(), ExtSessionError> {
    let secret_path = session_secret_path(ext_id);

    let mut new_key = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut new_key);

    {
        let mut vault = ctx.vault.write().await;
        if !vault.is_unlocked().await {
            return Err(ExtSessionError::VaultLocked);
        }
        vault
            .put_secret(&secret_path, SecretBytes::new(new_key.to_vec()))
            .await?;
        vault.flush().await?;
    }

    // session_secret 회전 = 기존 세션 전체 무효화 audit.
    // ext_id 가 payload 에 포함되어 다중 확장 환경에서 분리 조회 가능.
    ctx.audit
        .record(
            AuditActor::System,
            actions::EXT_SESSION_REVOKE,
            "extension",
            ext_id,
            Some(format!(
                r#"{{"ext_id":"{ext_id}","reason":"secret_rotation"}}"#
            )),
        )
        .await;

    Ok(())
}

/// TTL 설정 읽기 (SQLite settings 테이블).
async fn read_ttl_setting(ctx: &AppContext) -> Result<SessionTtlOption, ExtSessionError> {
    use secretbank_storage::sqlite::repositories::settings::SettingsRepo;
    let repo = SettingsRepo::new(ctx.pool.as_ref());
    match repo.get(SETTING_KEY_TTL).await {
        Ok(Some(val)) => Ok(SessionTtlOption::from_str(&val).unwrap_or_default()),
        Ok(None) => Ok(SessionTtlOption::default()),
        Err(_) => Err(ExtSessionError::SettingStorage),
    }
}

/// TTL 설정 저장 (SQLite settings 테이블).
async fn write_ttl_setting(ctx: &AppContext, opt: SessionTtlOption) -> Result<(), ExtSessionError> {
    use secretbank_storage::sqlite::repositories::settings::SettingsRepo;
    let repo = SettingsRepo::new(ctx.pool.as_ref());
    repo.set(SETTING_KEY_TTL, Some(opt.as_str()))
        .await
        .map_err(|_| ExtSessionError::SettingStorage)
}

// ---------------------------------------------------------------------------
// Tauri 커맨드
// ---------------------------------------------------------------------------

/// Extension session token 발급.
///
/// vault 에서 session_secret 를 읽거나 생성한 뒤 HMAC-SHA256 token 을 반환한다.
/// TTL 는 현재 설정 (기본 4시간) 을 사용한다.
///
/// # 보안
/// - session_secret 는 vault 에서만 읽혀 평문 IPC 미통과.
/// - token 은 ext_id-bound HMAC 서명 포함 — 다른 ext_id 에서 재사용 불가.
#[tauri::command]
pub async fn extension_session_issue(
    state: State<'_, AppContext>,
    ext_id: String,
) -> Result<String, ExtSessionError> {
    let key = get_or_create_session_secret(&state, &ext_id).await?;
    let ttl_opt = read_ttl_setting(&state).await?;
    let token = session::issue_token(&key, &ext_id, ttl_opt.to_secs());
    Ok(token)
}

/// Extension session token 검증.
///
/// 유효하면 `true`, 서명 오류·만료·형식 오류 시 `false` 반환.
/// 내부 에러 (vault locked 등) 는 `Err` 로 전파.
#[tauri::command]
pub async fn extension_session_verify(
    state: State<'_, AppContext>,
    ext_id: String,
    token: String,
) -> Result<bool, ExtSessionError> {
    let key = get_or_create_session_secret(&state, &ext_id).await?;
    let ttl_opt = read_ttl_setting(&state).await?;
    let valid = session::verify_token(&key, &token, &ext_id, ttl_opt.to_secs()).is_ok();
    Ok(valid)
}

/// Extension session 설정 조회.
///
/// vault_settings DB 에서 현재 TTL 옵션을 읽는다.
/// 설정이 없으면 기본값 (4시간) 반환.
#[tauri::command]
pub async fn extension_session_settings_get(
    state: State<'_, AppContext>,
) -> Result<SessionSettings, ExtSessionError> {
    let ttl = read_ttl_setting(&state).await?;
    Ok(SessionSettings { ttl })
}

/// Extension session 설정 변경.
///
/// 설정 저장 후 **등록된 모든 extension 의 session_secret 를 즉시 회전** →
/// 기존 token 모두 무효화.
///
/// vault 잠금 상태에서는 secret 회전이 불가능하므로 `VaultLocked` 에러.
#[tauri::command]
pub async fn extension_session_settings_set(
    state: State<'_, AppContext>,
    settings: SessionSettings,
) -> Result<(), ExtSessionError> {
    // 1. TTL 설정 저장
    write_ttl_setting(&state, settings.ttl).await?;

    // 2. 등록된 extension 목록 조회 (vault 필요)
    let ext_ids: Vec<String> = {
        let vault = state.vault.read().await;
        if !vault.is_unlocked().await {
            return Err(ExtSessionError::VaultLocked);
        }

        let paths = vault
            .list_secrets("device/extension/")
            .await
            .map_err(|_| ExtSessionError::VaultStorage)?;

        // `device/extension/{ext_id}/session_secret` 또는 `priv` → ext_id 추출 (중복 제거)
        let ids: std::collections::HashSet<String> = paths
            .into_iter()
            .filter_map(|p| {
                let parts: Vec<&str> = p.splitn(4, '/').collect();
                if parts.len() == 4 && parts[0] == "device" && parts[1] == "extension" {
                    Some(parts[2].to_string())
                } else {
                    None
                }
            })
            .collect();

        let mut v: Vec<String> = ids.into_iter().collect();
        v.sort();
        v
    };

    // 3. 각 ext_id 의 session_secret 회전 → 기존 token 즉시 무효화
    for ext_id in ext_ids {
        rotate_session_secret(&state, &ext_id).await?;
    }

    Ok(())
}

// ---------------------------------------------------------------------------
// 단위 테스트
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use secrecy::SecretString;
    use secretbank_core::DevicePlatform;
    use secretbank_storage::sqlite::init_pool;
    use secretbank_storage::vault::mock::MockVaultStorage;
    use secretbank_storage::vault::{ExposeSecret, VaultStorage as _};
    use tokio::sync::{Mutex, RwLock};

    use crate::audit_ctx::AuditCtx;
    use crate::commands::kill_switch::{ConfirmTokenStore, IssuerConfirmTokenStore};
    use crate::context::AppContext;
    use crate::services::device_identity::{ensure_device_keys, DeviceIdentity};

    use super::*;

    // ── helpers ──────────────────────────────────────────────────────────────

    async fn make_pool() -> (tempfile::TempDir, sqlx::SqlitePool) {
        let dir = tempfile::tempdir().expect("tempdir");
        let db_path = dir.path().join("test.db");
        let pool = init_pool(&db_path).await.expect("init_pool");
        (dir, pool)
    }

    async fn make_unlocked_vault() -> MockVaultStorage {
        let mut v = MockVaultStorage::new("pw");
        v.unlock(SecretString::from("pw".to_owned())).await.unwrap();
        v
    }

    async fn make_ctx_with_identity(
        pool: Arc<sqlx::SqlitePool>,
        vault: MockVaultStorage,
    ) -> AppContext {
        let vault_for_id: Arc<
            RwLock<Box<dyn secretbank_storage::vault::VaultStorage + Send + Sync>>,
        > = {
            let mut v = MockVaultStorage::new("pw");
            v.unlock(SecretString::from("pw".to_owned())).await.unwrap();
            Arc::new(RwLock::new(Box::new(v)))
        };
        let identity = ensure_device_keys(
            vault_for_id,
            pool.as_ref(),
            "test-device",
            DevicePlatform::Linux,
        )
        .await
        .expect("ensure_device_keys");

        make_ctx_inner(pool, vault, Some(identity))
    }

    fn make_ctx_inner(
        pool: Arc<sqlx::SqlitePool>,
        vault: MockVaultStorage,
        identity: Option<DeviceIdentity>,
    ) -> AppContext {
        let vault_box: Box<dyn secretbank_storage::vault::VaultStorage + Send + Sync> =
            Box::new(vault);
        let vault_arc = Arc::new(RwLock::new(vault_box));
        let device_identity = Arc::new(RwLock::new(identity));
        let audit = Arc::new(AuditCtx::new(pool.clone(), device_identity.clone()));
        AppContext {
            vault: vault_arc,
            pool,
            data_dir: std::path::PathBuf::from("/tmp/test"),
            user_id: "test".to_string(),
            clipboard_controller: Arc::new(Mutex::new(None)),
            feed_scheduler: Arc::new(Mutex::new(None)),
            device_identity,
            audit,
            kill_switch_tokens: Arc::new(ConfirmTokenStore::default()),
            issuer_kill_switch_tokens: Arc::new(IssuerConfirmTokenStore::default()),
            import_sessions: Arc::new(crate::import::ImportSessionStore::new()),
            relay_client: Arc::new(
                crate::services::relay_client::RelayClient::new(
                    url::Url::parse("http://localhost").unwrap(),
                )
                .unwrap(),
            ),
            auth_session: Arc::new(RwLock::new(None)),
            master_passphrase: Arc::new(RwLock::new(None)),
            db_change_emitter: crate::services::sync_emit::noop_emitter(),
            pairing_session: Arc::new(RwLock::new(None)),
        }
    }

    // ── EX1: session_secret 자동 생성 및 vault round-trip ───────────────────

    #[tokio::test]
    async fn ex1_secret_auto_created_and_stored() {
        let (_dir, pool) = make_pool().await;
        let pool = Arc::new(pool);
        let vault = make_unlocked_vault().await;
        let ctx = make_ctx_with_identity(pool.clone(), vault).await;

        let ext_id = "chrome_session_test";

        // 첫 호출 → secret 자동 생성
        let key1 = get_or_create_session_secret(&ctx, ext_id).await.unwrap();
        // 두 번째 호출 → 동일한 secret 반환 (vault 에서 읽음)
        let key2 = get_or_create_session_secret(&ctx, ext_id).await.unwrap();
        assert_eq!(key1, key2, "같은 ext_id 에 동일한 secret 반환");

        // vault 에 32-byte secret 저장 확인
        let path = session_secret_path(ext_id);
        let vault_guard = ctx.vault.read().await;
        let stored = vault_guard.get_secret(&path).await.expect("저장된 secret");
        assert_eq!(stored.expose_secret().len(), 32, "32-byte secret");
    }

    // ── EX2: issue + verify round-trip (Tauri 커맨드 로직 직접 호출) ─────────

    #[tokio::test]
    async fn ex2_issue_verify_round_trip() {
        let (_dir, pool) = make_pool().await;
        let pool = Arc::new(pool);
        let vault = make_unlocked_vault().await;
        let ctx = make_ctx_with_identity(pool.clone(), vault).await;

        let ext_id = "edge_session_test";

        // session_secret 생성
        let key = get_or_create_session_secret(&ctx, ext_id).await.unwrap();
        // 기본 TTL (Hours4)
        let ttl = SessionTtlOption::Hours4.to_secs();

        let token = session::issue_token(&key, ext_id, ttl);
        let result = session::verify_token(&key, &token, ext_id, ttl);
        assert!(result.is_ok(), "round-trip 검증 실패: {result:?}");
    }

    // ── EX3: secret 회전 후 기존 token 무효화 ───────────────────────────────

    #[tokio::test]
    async fn ex3_secret_rotation_invalidates_old_token() {
        let (_dir, pool) = make_pool().await;
        let pool = Arc::new(pool);
        let vault = make_unlocked_vault().await;
        let ctx = make_ctx_with_identity(pool.clone(), vault).await;

        let ext_id = "firefox_rotation_test";
        let ttl = SessionTtlOption::Hours4.to_secs();

        // 1. 원래 secret 으로 token 발급
        let key_before = get_or_create_session_secret(&ctx, ext_id).await.unwrap();
        let token = session::issue_token(&key_before, ext_id, ttl);
        assert!(session::verify_token(&key_before, &token, ext_id, ttl).is_ok());

        // 2. secret 회전
        rotate_session_secret(&ctx, ext_id).await.unwrap();

        // 3. 새 secret 으로 기존 token 검증 → 실패 (InvalidSignature)
        let key_after = get_or_create_session_secret(&ctx, ext_id).await.unwrap();
        assert_ne!(key_before, key_after, "회전 후 secret 달라야 함");
        let result = session::verify_token(&key_after, &token, ext_id, ttl);
        assert!(result.is_err(), "회전 후 기존 token 무효화");
    }

    // ── EX4: TTL 설정 get/set 기본값 확인 ────────────────────────────────────

    #[tokio::test]
    async fn ex4_settings_default_is_hours4() {
        let (_dir, pool) = make_pool().await;
        let pool = Arc::new(pool);
        let vault = make_unlocked_vault().await;
        let ctx = make_ctx_inner(pool, vault, None);

        let settings = read_ttl_setting(&ctx).await.unwrap();
        assert_eq!(settings, SessionTtlOption::Hours4, "기본값 = Hours4");
    }

    // ── EX5: TTL 설정 저장/로드 round-trip ───────────────────────────────────

    #[tokio::test]
    async fn ex5_settings_save_and_load() {
        let (_dir, pool) = make_pool().await;
        let pool = Arc::new(pool);
        let vault = make_unlocked_vault().await;
        let ctx = make_ctx_inner(pool, vault, None);

        // Mins30 저장
        write_ttl_setting(&ctx, SessionTtlOption::Mins30)
            .await
            .unwrap();
        let loaded = read_ttl_setting(&ctx).await.unwrap();
        assert_eq!(loaded, SessionTtlOption::Mins30);

        // UntilLock 저장
        write_ttl_setting(&ctx, SessionTtlOption::UntilLock)
            .await
            .unwrap();
        let loaded2 = read_ttl_setting(&ctx).await.unwrap();
        assert_eq!(loaded2, SessionTtlOption::UntilLock);
    }

    // ── EX6: SessionTtlOption::to_secs 값 검증 ───────────────────────────────

    #[test]
    fn ex6_ttl_option_to_secs() {
        assert_eq!(SessionTtlOption::Mins30.to_secs(), 1800);
        assert_eq!(SessionTtlOption::Hour1.to_secs(), 3600);
        assert_eq!(SessionTtlOption::Hours4.to_secs(), 14400);
        assert_eq!(SessionTtlOption::Hours8.to_secs(), 28800);
        assert_eq!(SessionTtlOption::UntilLock.to_secs(), 86400);
    }

    // ── EX7: vault locked 시 issue → VaultLocked ─────────────────────────────

    #[tokio::test]
    async fn ex7_vault_locked_returns_error() {
        let (_dir, pool) = make_pool().await;
        let pool = Arc::new(pool);
        // 잠긴 vault (unlock 안 함)
        let locked_vault = MockVaultStorage::new("pw");
        let ctx = make_ctx_inner(pool, locked_vault, None);

        let result = get_or_create_session_secret(&ctx, "some_ext").await;
        assert!(
            matches!(result, Err(ExtSessionError::VaultLocked)),
            "vault locked → VaultLocked"
        );
    }

    // ── EX8: settings_set 시 ext_id 별 secret 회전 ───────────────────────────

    #[tokio::test]
    async fn ex8_settings_set_rotates_all_secrets() {
        let (_dir, pool) = make_pool().await;
        let pool = Arc::new(pool);
        let vault = make_unlocked_vault().await;
        let ctx = make_ctx_with_identity(pool.clone(), vault).await;

        let ext_ids = ["chrome_a", "firefox_b"];
        let ttl = SessionTtlOption::Hours4.to_secs();

        // 각 ext_id 에 session_secret 생성 + token 발급
        let mut tokens: Vec<(String, [u8; 32])> = Vec::new();
        for ext_id in &ext_ids {
            let key = get_or_create_session_secret(&ctx, ext_id).await.unwrap();
            let token = session::issue_token(&key, ext_id, ttl);
            tokens.push((token, key));
        }

        // settings_set → 모든 secret 회전
        let new_settings = SessionSettings {
            ttl: SessionTtlOption::Hour1,
        };
        // 직접 로직 호출 (Tauri State 없이)
        write_ttl_setting(&ctx, new_settings.ttl).await.unwrap();
        for ext_id in &ext_ids {
            rotate_session_secret(&ctx, ext_id).await.unwrap();
        }

        // 기존 token 은 모두 무효화
        for (i, ext_id) in ext_ids.iter().enumerate() {
            let new_key = get_or_create_session_secret(&ctx, ext_id).await.unwrap();
            let (old_token, old_key) = &tokens[i];
            assert_ne!(new_key, *old_key, "회전 후 {ext_id} secret 달라야 함");
            let result = session::verify_token(&new_key, old_token, ext_id, ttl);
            assert!(result.is_err(), "{ext_id} 기존 token 무효화 확인");
        }
    }

    // ── EX9: rotate_session_secret 시 extension.session.revoke audit 기록 ────

    #[tokio::test]
    async fn ex9_rotate_records_session_revoke_audit() {
        use secretbank_storage::AuditRepo;

        let (_dir, pool) = make_pool().await;
        let pool = Arc::new(pool);
        let vault = make_unlocked_vault().await;
        let ctx = make_ctx_with_identity(pool.clone(), vault).await;

        let ext_ids = ["chrome_audit_a", "firefox_audit_b"];

        // 각 ext_id secret 초기화 후 회전 — 회전마다 audit 1건 기록되어야 한다
        for ext_id in &ext_ids {
            get_or_create_session_secret(&ctx, ext_id)
                .await
                .expect("secret 초기화 성공");
            rotate_session_secret(&ctx, ext_id)
                .await
                .expect("회전 성공");
        }

        let repo = AuditRepo::new(pool.as_ref());
        let all = repo
            .list(&secretbank_storage::AuditFilter {
                limit: 100,
                ..Default::default()
            })
            .await
            .unwrap();

        // extension.session.revoke 가 ext_id 수만큼 기록되어야 한다
        let revoke_entries: Vec<_> = all
            .iter()
            .filter(|e| e.action == secretbank_audit::actions::EXT_SESSION_REVOKE)
            .collect();
        assert_eq!(
            revoke_entries.len(),
            ext_ids.len(),
            "각 ext_id 마다 session.revoke audit 1건"
        );

        // ext_id 가 subject_id 에 포함되어 분리 조회 가능
        for ext_id in &ext_ids {
            let found = revoke_entries.iter().any(|e| e.subject_id == *ext_id);
            assert!(found, "{ext_id} 의 session.revoke audit 가 있어야 한다");
        }
    }
}
