//! Shared application context injected into Tauri commands via `State<AppContext>`.

use std::path::PathBuf;
use std::sync::Arc;

use secrecy::SecretString;
use tokio::sync::{Mutex, RwLock};
use tokio::task::JoinHandle;

use api_vault_storage::age_vault::AgeVaultStorage;
use api_vault_storage::sqlite::{init_pool, SqlitePool};
use api_vault_storage::vault::{VaultError, VaultStorage};

use crate::services::feed_scheduler::FeedSchedulerHandle;

/// Application-wide shared state, managed by Tauri.
///
/// Access via `State<'_, AppContext>` in command handlers.
pub struct AppContext {
    /// The encrypted vault. `Arc<RwLock<…>>` so commands can take
    /// read/write guards independently.
    pub vault: Arc<RwLock<Box<dyn VaultStorage + Send + Sync>>>,

    /// SQLite connection pool.
    pub pool: Arc<SqlitePool>,

    /// Application data directory (platform-specific).
    pub data_dir: PathBuf,

    /// Current user identifier (single-user for now).
    pub user_id: String,

    /// 클립보드 자동 만료 타이머 핸들.
    ///
    /// 새 복사 요청이 오면 이전 핸들을 `.abort()` 하여 타이머를 취소한다.
    /// `None` = 타이머 없음 (앱 초기 상태 또는 만료 완료 후).
    pub clipboard_controller: Arc<Mutex<Option<JoinHandle<()>>>>,

    /// 피드 스케줄러 핸들.
    ///
    /// 앱 시작 시 `spawn_feed_scheduler` 로 생성하여 저장한다.
    /// 앱 종료 시 `RunEvent::Exit` 훅에서 `block_on(handle.shutdown())` 으로 호출 — 프로세스
    /// 종료 전에 cancellation token + JoinSet drain 이 완료되는 것을 보장한다.
    pub feed_scheduler: Arc<Mutex<Option<FeedSchedulerHandle>>>,
}

impl AppContext {
    /// Initialise the context asynchronously.
    ///
    /// Creates `data_dir` if it does not exist, opens the SQLite pool,
    /// and opens (or creates) the age vault.
    pub async fn new(data_dir: PathBuf) -> Result<Self, Box<dyn std::error::Error>> {
        // Ensure data directory exists.
        tokio::fs::create_dir_all(&data_dir).await?;

        // SQLite pool.
        let db_path = data_dir.join("vault.db");
        let pool = init_pool(&db_path).await?;

        // Age vault (open in Locked or NotInitialized state).
        let vault_path = data_dir.join("vault.age");
        let age_vault = AgeVaultStorage::open(&vault_path).await?;
        let vault: Box<dyn VaultStorage + Send + Sync> = Box::new(age_vault);

        Ok(Self {
            vault: Arc::new(RwLock::new(vault)),
            pool: Arc::new(pool),
            data_dir,
            user_id: "default".to_owned(),
            // 초기 상태: 타이머 없음
            clipboard_controller: Arc::new(Mutex::new(None)),
            // 초기 상태: 스케줄러 없음 (setup 에서 채워짐)
            feed_scheduler: Arc::new(Mutex::new(None)),
        })
    }

    /// Initialize the vault file with the given password.
    ///
    /// Called by `vault_init` command. Replaces the inner vault with a
    /// newly-initialized `AgeVaultStorage`.
    pub async fn initialize_vault(&self, password: &SecretString) -> Result<(), VaultError> {
        let vault_path = self.data_dir.join("vault.age");
        let mut age_vault = AgeVaultStorage::open(&vault_path).await?;
        age_vault.initialize(password).await?;

        // Replace the inner vault with the newly-initialized one.
        let mut guard = self.vault.write().await;
        *guard = Box::new(age_vault);
        Ok(())
    }
}
