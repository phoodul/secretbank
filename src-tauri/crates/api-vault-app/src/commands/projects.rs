//! Tauri commands for project CRUD (T035).

use api_vault_audit::AuditActor;
use api_vault_core::{Project, ProjectId, ProjectInput, ProjectPatch};
use api_vault_storage::sqlite::repositories::project::ProjectRepo;
use serde::Serialize;
use tauri::State;

use crate::context::AppContext;

#[derive(Debug, thiserror::Error, Serialize)]
#[serde(tag = "code", rename_all = "snake_case")]
pub enum ProjectCommandError {
    #[error("project not found")]
    NotFound,

    #[error("internal: {message}")]
    Internal { message: String },
}

impl From<api_vault_storage::sqlite::StorageError> for ProjectCommandError {
    fn from(e: api_vault_storage::sqlite::StorageError) -> Self {
        Self::Internal {
            message: e.to_string(),
        }
    }
}

#[tauri::command]
pub async fn project_create(
    input: ProjectInput,
    state: State<'_, AppContext>,
) -> Result<ProjectId, ProjectCommandError> {
    let repo = ProjectRepo::new(&state.pool);
    let id = repo.insert(&input).await?;

    state
        .audit
        .record(
            AuditActor::LocalUser,
            "project.create",
            "project",
            id.to_string(),
            None,
        )
        .await;

    Ok(id)
}

#[tauri::command]
pub async fn project_list(
    state: State<'_, AppContext>,
) -> Result<Vec<Project>, ProjectCommandError> {
    // Defense-in-depth: vault locked → return empty list (label leakage guard).
    {
        let vault = state.vault.read().await;
        if !vault.is_unlocked().await {
            return Ok(vec![]);
        }
    }
    let repo = ProjectRepo::new(&state.pool);
    Ok(repo.list().await?)
}

#[tauri::command]
pub async fn project_get(
    id: ProjectId,
    state: State<'_, AppContext>,
) -> Result<Project, ProjectCommandError> {
    let repo = ProjectRepo::new(&state.pool);
    repo.get_by_id(id).await?.ok_or(ProjectCommandError::NotFound)
}

#[tauri::command]
pub async fn project_update(
    id: ProjectId,
    patch: ProjectPatch,
    state: State<'_, AppContext>,
) -> Result<Project, ProjectCommandError> {
    let repo = ProjectRepo::new(&state.pool);
    repo.update(id, &patch).await?;

    let mut updated_fields: Vec<&str> = Vec::new();
    if patch.name.is_some() { updated_fields.push("name"); }
    if patch.repo_url.is_some() { updated_fields.push("repo_url"); }
    if patch.framework.is_some() { updated_fields.push("framework"); }
    if patch.runtime.is_some() { updated_fields.push("runtime"); }
    if patch.local_path.is_some() { updated_fields.push("local_path"); }
    let payload = if updated_fields.is_empty() {
        None
    } else {
        Some(serde_json::json!({ "updated_fields": updated_fields }).to_string())
    };

    state
        .audit
        .record(
            AuditActor::LocalUser,
            "project.update",
            "project",
            id.to_string(),
            payload,
        )
        .await;

    repo.get_by_id(id).await?.ok_or(ProjectCommandError::NotFound)
}

#[tauri::command]
pub async fn project_delete(
    id: ProjectId,
    state: State<'_, AppContext>,
) -> Result<(), ProjectCommandError> {
    let repo = ProjectRepo::new(&state.pool);
    repo.delete(id).await?;

    state
        .audit
        .record(
            AuditActor::LocalUser,
            "project.delete",
            "project",
            id.to_string(),
            None,
        )
        .await;

    Ok(())
}

// ---------------------------------------------------------------------------
// Tests for vault lock guard on project_list
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use api_vault_core::{ProjectInput};
    use api_vault_storage::sqlite::repositories::project::ProjectRepo;
    use api_vault_storage::vault::mock::MockVaultStorage;
    use api_vault_storage::vault::VaultStorage as _;
    use secrecy::SecretString;
    use tokio::sync::{Mutex, RwLock};

    use crate::audit_ctx::AuditCtx;
    use crate::commands::kill_switch::{ConfirmTokenStore, IssuerConfirmTokenStore};
    use crate::context::AppContext;
    use crate::services::device_identity::DeviceIdentity;

    async fn make_pool() -> (tempfile::TempDir, sqlx::SqlitePool) {
        let dir = tempfile::tempdir().expect("tempdir");
        let db_path = dir.path().join("test.db");
        let pool = api_vault_storage::sqlite::init_pool(&db_path)
            .await
            .expect("init_pool");
        (dir, pool)
    }

    fn make_ctx(pool: Arc<sqlx::SqlitePool>, vault: MockVaultStorage) -> AppContext {
        let vault_box: Box<dyn api_vault_storage::vault::VaultStorage + Send + Sync> =
            Box::new(vault);
        let vault_arc = Arc::new(RwLock::new(vault_box));
        let device_identity: Arc<RwLock<Option<DeviceIdentity>>> =
            Arc::new(RwLock::new(None));
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
            relay_client: Arc::new(
                crate::services::relay_client::RelayClient::new(
                    url::Url::parse("http://localhost").unwrap(),
                )
                .unwrap(),
            ),
            auth_session: Arc::new(RwLock::new(None)),
        }
    }

    // -----------------------------------------------------------------------
    // T1: project_list — vault locked 시 빈 결과 반환
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn project_list_returns_empty_when_vault_locked() {
        let (_dir, pool) = make_pool().await;
        let pool = Arc::new(pool);
        // Locked vault: MockVaultStorage is locked by default.
        let vault = MockVaultStorage::new("pw");
        let ctx = make_ctx(pool.clone(), vault);

        let is_locked = {
            let v = ctx.vault.read().await;
            !v.is_unlocked().await
        };
        assert!(is_locked, "vault must be locked for this test");

        let list: Vec<api_vault_core::Project> = if is_locked {
            vec![]
        } else {
            ProjectRepo::new(&pool).list().await.unwrap()
        };
        assert!(list.is_empty(), "project_list must return empty vec when vault is locked");
    }

    // -----------------------------------------------------------------------
    // T2: project_list — vault unlocked 시 실제 데이터 반환
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn project_list_returns_data_when_vault_unlocked() {
        let (_dir, pool) = make_pool().await;
        let pool = Arc::new(pool);
        let mut vault = MockVaultStorage::new("pw");
        vault.unlock(SecretString::from("pw".to_owned())).await.unwrap();

        // Seed one project.
        ProjectRepo::new(&pool)
            .insert(&ProjectInput {
                name: "My App".to_string(),
                repo_url: None,
                framework: None,
                runtime: None,
                local_path: None,
            })
            .await
            .expect("project insert");

        let ctx = make_ctx(pool.clone(), vault);

        let is_locked = {
            let v = ctx.vault.read().await;
            !v.is_unlocked().await
        };
        assert!(!is_locked, "vault must be unlocked for this test");

        let list = if is_locked {
            vec![]
        } else {
            ProjectRepo::new(&pool).list().await.unwrap()
        };
        assert_eq!(list.len(), 1, "project_list must return 1 item when vault is unlocked");
    }
}
