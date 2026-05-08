//! Tauri commands for key-value app settings (T030).

use secretbank_audit::AuditActor;
use serde::Serialize;
use tauri::State;

use secretbank_storage::sqlite::repositories::settings::SettingsRepo;

use crate::context::AppContext;

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

#[derive(Debug, thiserror::Error, Serialize)]
#[serde(tag = "code", rename_all = "snake_case")]
pub enum SettingsCommandError {
    #[error("internal: {message}")]
    Internal { message: String },
}

impl From<secretbank_storage::sqlite::StorageError> for SettingsCommandError {
    fn from(e: secretbank_storage::sqlite::StorageError) -> Self {
        Self::Internal {
            message: e.to_string(),
        }
    }
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn settings_get(
    key: String,
    state: State<'_, AppContext>,
) -> Result<Option<String>, SettingsCommandError> {
    Ok(SettingsRepo::new(&state.pool).get(&key).await?)
}

#[tauri::command]
pub async fn settings_set(
    key: String,
    value: Option<String>,
    state: State<'_, AppContext>,
) -> Result<(), SettingsCommandError> {
    SettingsRepo::new(&state.pool)
        .set(&key, value.as_deref())
        .await?;

    // subject_id already carries the key name; no extra payload needed.
    state
        .audit
        .record(
            AuditActor::LocalUser,
            "settings.set",
            "settings",
            key.clone(),
            None,
        )
        .await;

    // M9 Phase D-2 — propagate to sync. value=None 은 row 삭제 (Y.Map delete),
    // value=Some(...) 은 upsert. Frontend 의 화이트리스트 (SYNC_SETTING_KEYS)
    // 가 추가 필터 — 백엔드는 모든 키를 emit 하고 mapping layer 가 결정.
    let op = if value.is_some() {
        crate::services::sync_emit::DbChangeOp::Upsert
    } else {
        crate::services::sync_emit::DbChangeOp::Delete
    };
    state
        .db_change_emitter
        .emit_db_changed(&crate::services::sync_emit::DbChangePayload {
            entity: crate::services::sync_emit::DbChangeEntity::Settings,
            op,
            id: key,
        });

    Ok(())
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use secretbank_storage::sqlite::{init_pool, SqlitePool};

    use super::*;

    async fn make_pool() -> (SqlitePool, tempfile::TempDir) {
        let dir = tempfile::tempdir().expect("tempdir");
        let db_path = dir.path().join("test.db");
        let pool = init_pool(&db_path).await.expect("init_pool");
        (pool, dir)
    }

    #[tokio::test]
    async fn set_then_get_roundtrip() {
        let (pool, _dir) = make_pool().await;
        let repo = SettingsRepo::new(&pool);

        assert_eq!(repo.get("k1").await.unwrap(), None);

        repo.set("k1", Some("v1")).await.unwrap();
        assert_eq!(repo.get("k1").await.unwrap(), Some("v1".to_string()));

        repo.set("k1", Some("v2")).await.unwrap();
        assert_eq!(repo.get("k1").await.unwrap(), Some("v2".to_string()));

        repo.set("k1", None).await.unwrap();
        assert_eq!(repo.get("k1").await.unwrap(), None);
    }
}
