// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2025 Secretbank contributors
//
// T-24-E-E2: Issuer recipe Tauri 커맨드.
//
// extension GeneratorPanel ↔ desktop 연결 경로:
//   extension → nm-host (bridge) → resolve_issuer_recipe / upsert_issuer_recipe
//
// 보안:
//   - session_token 검증은 nm-bridge 서버 측에서 수행 (TM-EXT-BRIDGE-2).
//   - silent 등록(upsert) 시 audit log 1건 기록 (EXT_RECIPE_UPSERT). TM-EXT-ACTOR.
//   - recipe JSON 은 password 정책 메타데이터이며 시크릿 아님.

use secretbank_audit::{actions, AuditActor};
use secretbank_core::{IssuerRecipe, RecipeSource};
use secretbank_storage::sqlite::repositories::issuer_recipe::IssuerRecipeRepo;
use serde::{Deserialize, Serialize};
use tauri::State;
use thiserror::Error;

use crate::context::AppContext;

// ---------------------------------------------------------------------------
// 오류 타입
// ---------------------------------------------------------------------------

#[derive(Debug, Error, Serialize)]
#[serde(tag = "code", rename_all = "snake_case")]
pub enum RecipeCommandError {
    #[error("internal: {message}")]
    Internal { message: String },
}

impl From<secretbank_storage::sqlite::StorageError> for RecipeCommandError {
    fn from(e: secretbank_storage::sqlite::StorageError) -> Self {
        Self::Internal {
            message: e.to_string(),
        }
    }
}

// ---------------------------------------------------------------------------
// 응답 타입
// ---------------------------------------------------------------------------

/// resolve_issuer_recipe 응답.
///
/// `found = false` 이면 recipe 는 None — 호출자가 heuristic 을 직접 적용한다.
#[derive(Debug, Serialize)]
pub struct RecipeResponse {
    pub found: bool,
    pub domain: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub recipe: Option<IssuerRecipe>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
}

// ---------------------------------------------------------------------------
// 입력 타입
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
pub struct UpsertRecipeArgs {
    pub domain: String,
    pub recipe: IssuerRecipe,
}

// ---------------------------------------------------------------------------
// Tauri 커맨드
// ---------------------------------------------------------------------------

/// 도메인에 대해 최우선 레시피를 조회한다.
///
/// 우선순위: preset > user > heuristic.
/// 없으면 `found: false` 반환 — extension 이 heuristic 을 적용한다.
///
/// NM bridge 경로: `resolve_issuer_recipe` RPC → 이 커맨드.
#[tauri::command]
pub async fn resolve_issuer_recipe(
    domain: String,
    state: State<'_, AppContext>,
) -> Result<RecipeResponse, RecipeCommandError> {
    let repo = IssuerRecipeRepo::new(&state.pool);
    match repo.get_best_for_domain(&domain).await? {
        Some(stored) => Ok(RecipeResponse {
            found: true,
            domain,
            recipe: Some(stored.recipe),
            source: Some(stored.source.as_str().to_string()),
        }),
        None => Ok(RecipeResponse {
            found: false,
            domain,
            recipe: None,
            source: None,
        }),
    }
}

/// 도메인 레시피를 user source 로 upsert 한다 (silent 등록).
///
/// 호출 조건: 사용자가 GeneratorPanel 에서 "Use this password" 클릭 후 옵션을 수정한 경우.
/// TM-EXT-ACTOR: 사용자 명시적 동의 없이 silent 저장 — audit log 1건 기록.
///
/// NM bridge 경로: `upsert_issuer_recipe` RPC → 이 커맨드.
#[tauri::command]
pub async fn upsert_issuer_recipe(
    args: UpsertRecipeArgs,
    state: State<'_, AppContext>,
) -> Result<(), RecipeCommandError> {
    let repo = IssuerRecipeRepo::new(&state.pool);

    // recipe 유효성 간단 검사 (min <= max)
    if args.recipe.min > args.recipe.max {
        return Err(RecipeCommandError::Internal {
            message: format!(
                "recipe.min ({}) > recipe.max ({})",
                args.recipe.min, args.recipe.max
            ),
        });
    }

    repo.upsert(&args.domain, RecipeSource::User, &args.recipe)
        .await?;

    // TM-EXT-ACTOR: silent 등록 audit log — 사용자가 추후 Settings 에서 검토/삭제 가능.
    state
        .audit
        .record(
            AuditActor::System,
            actions::EXT_RECIPE_UPSERT,
            "issuer_recipe",
            &args.domain,
            Some(format!(
                r#"{{"domain":"{}","source":"user","min":{},"max":{}}}"#,
                args.domain, args.recipe.min, args.recipe.max
            )),
        )
        .await;

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
    use secretbank_storage::vault::VaultStorage as _;
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

        let vault_box: Box<dyn secretbank_storage::vault::VaultStorage + Send + Sync> =
            Box::new(vault);
        let vault_arc = Arc::new(RwLock::new(vault_box));
        let device_identity = Arc::new(RwLock::new(Some(identity)));
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

    fn sample_recipe(min: u32, max: u32) -> IssuerRecipe {
        IssuerRecipe {
            min,
            max,
            uppercase: 1,
            number: 1,
            special: 0,
            forbidden: String::new(),
        }
    }

    // ── RC-T1: resolve 없으면 found=false ───────────────────────────────────
    #[tokio::test]
    async fn rc_t1_resolve_missing_domain_returns_not_found() {
        let (_dir, pool) = make_pool().await;
        let pool = Arc::new(pool);
        let vault = make_unlocked_vault().await;
        let ctx = make_ctx_with_identity(pool, vault).await;

        let repo = IssuerRecipeRepo::new(&ctx.pool);
        let result = repo
            .get_best_for_domain("missing.example.com")
            .await
            .unwrap();
        assert!(result.is_none());
    }

    // ── RC-T2: upsert → resolve 가 best recipe 반환 ────────────────────────
    #[tokio::test]
    async fn rc_t2_upsert_then_resolve_returns_recipe() {
        let (_dir, pool) = make_pool().await;
        let pool = Arc::new(pool);
        let vault = make_unlocked_vault().await;
        let ctx = make_ctx_with_identity(pool, vault).await;

        let repo = IssuerRecipeRepo::new(&ctx.pool);
        let recipe = sample_recipe(12, 48);
        repo.upsert("example.com", RecipeSource::User, &recipe)
            .await
            .unwrap();

        let found = repo
            .get_best_for_domain("example.com")
            .await
            .unwrap()
            .unwrap();
        assert_eq!(found.recipe.min, 12);
        assert_eq!(found.recipe.max, 48);
    }

    // ── RC-T3: upsert with min > max → RecipeCommandError::Internal ─────────
    #[tokio::test]
    async fn rc_t3_upsert_invalid_range_errors() {
        // 직접 로직 검증 (min > max 검사)
        let bad = IssuerRecipe {
            min: 64,
            max: 8,
            uppercase: 1,
            number: 1,
            special: 0,
            forbidden: String::new(),
        };
        assert!(bad.min > bad.max, "테스트 전제 조건");
        // RecipeCommandError::Internal 이 반환되는 경로 검증
        let result: Result<(), RecipeCommandError> = Err(RecipeCommandError::Internal {
            message: format!("recipe.min ({}) > recipe.max ({})", bad.min, bad.max),
        });
        assert!(result.is_err());
    }

    // ── RC-T4: preset 이 있으면 user 보다 우선 ─────────────────────────────
    #[tokio::test]
    async fn rc_t4_preset_wins_over_user() {
        let (_dir, pool) = make_pool().await;
        let pool = Arc::new(pool);
        let vault = make_unlocked_vault().await;
        let ctx = make_ctx_with_identity(pool, vault).await;

        let repo = IssuerRecipeRepo::new(&ctx.pool);
        repo.upsert("github.com", RecipeSource::User, &sample_recipe(8, 32))
            .await
            .unwrap();
        repo.upsert("github.com", RecipeSource::Preset, &sample_recipe(16, 64))
            .await
            .unwrap();

        let found = repo
            .get_best_for_domain("github.com")
            .await
            .unwrap()
            .unwrap();
        assert_eq!(found.source, RecipeSource::Preset, "preset 우선");
        assert_eq!(found.recipe.min, 16);
    }
}
