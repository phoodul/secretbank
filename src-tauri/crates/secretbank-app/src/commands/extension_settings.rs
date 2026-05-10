// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2025 Secretbank contributors
//
// G-4-1: MCP context push opt-in 설정 커맨드.
//
// # 흐름
//   1. `ext_settings_get_mcp_opt_in`: SQLite settings 테이블에서
//      "extension_mcp_context_opt_in" 키를 읽어 bool 반환.
//      없으면 기본값 false (privacy 우선 — opt-in OFF).
//   2. `ext_settings_set_mcp_opt_in(enabled: bool)`: 설정 저장.
//
// # 저장 위치
//   SQLite settings 테이블 (B-7 패턴 — `extension_session_ttl` 와 동일 레이어).
//   "1" = ON, "0" = OFF.
//
// # 보안
//   - 기본값 OFF — 명시 동의 없이 MCP push 작동 금지.
//   - 값 변경 시 별도 audit log 없음 (설정 변경 자체는 낮은 위험도).

use serde::Serialize;
use tauri::State;
use thiserror::Error;

use crate::context::AppContext;

// ---------------------------------------------------------------------------
// 상수
// ---------------------------------------------------------------------------

const SETTING_KEY_MCP_OPT_IN: &str = "extension_mcp_context_opt_in";

// ---------------------------------------------------------------------------
// Error 타입
// ---------------------------------------------------------------------------

#[derive(Debug, Error, Serialize)]
#[serde(tag = "code", rename_all = "snake_case")]
pub enum ExtSettingsError {
    /// settings 테이블 읽기/쓰기 오류.
    #[error("setting storage error")]
    SettingStorage,
}

// ---------------------------------------------------------------------------
// 내부 헬퍼
// ---------------------------------------------------------------------------

/// SQLite settings 테이블에서 MCP opt-in 값을 읽는다.
///
/// 없으면 false 반환 (기본값 OFF).
pub async fn read_mcp_opt_in(ctx: &AppContext) -> Result<bool, ExtSettingsError> {
    use secretbank_storage::sqlite::repositories::settings::SettingsRepo;
    let repo = SettingsRepo::new(ctx.pool.as_ref());
    match repo.get(SETTING_KEY_MCP_OPT_IN).await {
        Ok(Some(val)) => Ok(val == "1"),
        Ok(None) => Ok(false),
        Err(_) => Err(ExtSettingsError::SettingStorage),
    }
}

/// SQLite settings 테이블에 MCP opt-in 값을 저장한다.
async fn write_mcp_opt_in(ctx: &AppContext, enabled: bool) -> Result<(), ExtSettingsError> {
    use secretbank_storage::sqlite::repositories::settings::SettingsRepo;
    let repo = SettingsRepo::new(ctx.pool.as_ref());
    let val = if enabled { "1" } else { "0" };
    repo.set(SETTING_KEY_MCP_OPT_IN, Some(val))
        .await
        .map_err(|_| ExtSettingsError::SettingStorage)
}

// ---------------------------------------------------------------------------
// Tauri 커맨드
// ---------------------------------------------------------------------------

/// MCP context push opt-in 설정 조회.
///
/// 기본값 false (OFF). 명시 동의 없이는 MCP push 작동하지 않음.
#[tauri::command]
pub async fn ext_settings_get_mcp_opt_in(
    state: State<'_, AppContext>,
) -> Result<bool, ExtSettingsError> {
    read_mcp_opt_in(&state).await
}

/// MCP context push opt-in 설정 변경.
///
/// `enabled = true` 로 설정하면 extension 이 현재 사이트 컨텍스트를
/// MCP server queue 에 push 하고 AI 에디터가 조회할 수 있게 된다.
/// privacy 영향 있음 — UI 에서 반드시 alert 표시 후 호출.
#[tauri::command]
pub async fn ext_settings_set_mcp_opt_in(
    state: State<'_, AppContext>,
    enabled: bool,
) -> Result<(), ExtSettingsError> {
    write_mcp_opt_in(&state, enabled).await
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
    use secretbank_storage::vault::VaultStorage;
    use tokio::sync::{Mutex, RwLock};

    use crate::audit_ctx::AuditCtx;
    use crate::commands::kill_switch::{ConfirmTokenStore, IssuerConfirmTokenStore};
    use crate::context::AppContext;
    use crate::services::device_identity::{ensure_device_keys, DeviceIdentity};

    use super::*;

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

    async fn make_ctx(pool: Arc<sqlx::SqlitePool>, vault: MockVaultStorage) -> AppContext {
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

        let vault_box: Box<dyn secretbank_storage::vault::VaultStorage + Send + Sync> =
            Box::new(vault);
        let vault_arc = Arc::new(RwLock::new(vault_box));
        let device_identity = Arc::new(RwLock::new(Some(identity) as Option<DeviceIdentity>));
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
            nm_bridge: Arc::new(Mutex::new(None)),
            pairing_session: Arc::new(RwLock::new(None)),
        }
    }

    // ES1: 기본값 = false (OFF)
    #[tokio::test]
    async fn es1_default_is_false() {
        let (_dir, pool) = make_pool().await;
        let pool = Arc::new(pool);
        let vault = make_unlocked_vault().await;
        let ctx = make_ctx(pool, vault).await;

        let val = read_mcp_opt_in(&ctx).await.unwrap();
        assert!(!val, "기본값은 false (opt-in OFF)");
    }

    // ES2: write true → read true
    #[tokio::test]
    async fn es2_set_true_and_read() {
        let (_dir, pool) = make_pool().await;
        let pool = Arc::new(pool);
        let vault = make_unlocked_vault().await;
        let ctx = make_ctx(pool, vault).await;

        write_mcp_opt_in(&ctx, true).await.unwrap();
        let val = read_mcp_opt_in(&ctx).await.unwrap();
        assert!(val, "write true → read true");
    }

    // ES3: write true → write false → read false
    #[tokio::test]
    async fn es3_toggle_off() {
        let (_dir, pool) = make_pool().await;
        let pool = Arc::new(pool);
        let vault = make_unlocked_vault().await;
        let ctx = make_ctx(pool, vault).await;

        write_mcp_opt_in(&ctx, true).await.unwrap();
        write_mcp_opt_in(&ctx, false).await.unwrap();
        let val = read_mcp_opt_in(&ctx).await.unwrap();
        assert!(!val, "write false → read false");
    }
}
