//! Shared application context injected into Tauri commands via `State<AppContext>`.

use std::path::PathBuf;
use std::sync::Arc;

use secrecy::SecretString;
use tokio::sync::{Mutex, RwLock};
use tokio::task::JoinHandle;

use secretbank_storage::age_vault::AgeVaultStorage;
use secretbank_storage::sqlite::{init_pool, SqlitePool};
use secretbank_storage::vault::{VaultError, VaultStorage};

use crate::audit_ctx::AuditCtx;
use crate::commands::kill_switch::{ConfirmTokenStore, IssuerConfirmTokenStore};
use crate::import::{EnvScanSessionStore, ImportSessionStore};
use crate::services::device_identity::DeviceIdentity;
use crate::services::feed_scheduler::FeedSchedulerHandle;
use crate::services::nm_bridge::NmBridgeHandle;
use crate::services::pairing::PairingSessionLock;
use crate::services::relay_client::RelayClient;
use crate::services::session::AuthSession;
use crate::services::sync_emit::SharedDbChangeEmitter;

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

    /// 현재 디바이스의 ed25519 서명 키 페어.
    ///
    /// 볼트 잠금 해제(`vault_unlock`) 후 `ensure_device_keys` 가 성공하면 채워진다.
    /// 볼트 잠금(`vault_lock`) 시 `None` 으로 초기화된다.
    /// `None` 상태에서 감사 로그 서명은 불가능하다.
    pub device_identity: Arc<RwLock<Option<DeviceIdentity>>>,

    /// Best-effort audit context.
    ///
    /// 모든 뮤테이팅 커맨드가 이 헬퍼를 통해 감사 항목을 기록한다.
    /// vault 가 잠겨 있으면 경고를 기록하고 skip — 호출자의 작업은 계속 진행된다.
    pub audit: Arc<AuditCtx>,

    /// Kill Switch용 단기 토큰 저장소 (단일 credential).
    ///
    /// `kill_switch_request_confirm` 이 발급한 16바이트 랜덤 토큰(32 hex char)을
    /// 5분 TTL 로 보관한다. `kill_switch_revoke` 가 소비(one-shot)하여 유효성을 검증한다.
    pub kill_switch_tokens: Arc<ConfirmTokenStore>,

    /// Kill Switch용 단기 토큰 저장소 (Issuer 단위 bulk revoke, T078).
    ///
    /// `kill_switch_request_confirm_issuer` 가 발급하고
    /// `kill_switch_revoke_issuer` 가 소비(one-shot)한다.
    pub issuer_kill_switch_tokens: Arc<IssuerConfirmTokenStore>,

    /// CSV import 세션 저장소 (M24 Phase 2-3-a).
    ///
    /// `import_csv_prepare` 가 평문 DetectedFromCsv 행을 5분 TTL 로 보관한다.
    /// `import_csv_commit` 이 session_id 로 꺼내서 vault 에 저장한다.
    /// SecretBox<String> 들은 세션 drop 시 자동 zeroize.
    pub import_sessions: Arc<ImportSessionStore>,

    /// `env_scan_prepare` 가 폴더 스캔 결과 (평문 + 메타데이터) 를 보관한다.
    /// `env_scan_commit` 이 session_id 로 꺼내서 vault 에 저장한다.
    /// SecretBox<String> 들은 세션 drop 시 자동 zeroize.
    pub env_scan_sessions: Arc<EnvScanSessionStore>,

    /// Cloudflare Workers 릴레이 HTTP 클라이언트 (M8 Auth · M9 Sync 공유).
    ///
    /// 앱 시작 시 SQLite settings 의 `relay_url` override 또는 빌드 프로필
    /// 기본값(dev=localhost:8787, release=https://secretbank.app)으로 1회 초기화.
    /// `reqwest::Client` 가 내부적으로 connection pool 을 가지므로 재생성하지
    /// 않고 모든 `auth_*` / `sync_*` 커맨드가 같은 인스턴스를 공유한다.
    pub relay_client: Arc<RelayClient>,

    /// 인증된 사용자 세션 (M8 Auth — T083).
    ///
    /// `auth_passkey_*` / `auth_oauth_*` 성공 시 채워지고,
    /// `auth_signout` 또는 `vault_lock` 시 `None` 으로 초기화된다.
    /// 영속 사본은 age 볼트의 `auth/*` 키 (services/session.rs 참조).
    pub auth_session: Arc<RwLock<Option<AuthSession>>>,

    /// 사용자의 마스터 passphrase — `vault_unlock` 시점에 채워지고,
    /// `vault_lock` 시 `None` 으로 초기화된다 (M9 Phase B-1).
    ///
    /// **왜 메모리에 보관하는가**: M8 Auth verify 흐름 + M9 Sync 가 enc_key 파생을 위해
    /// passphrase + 릴레이 발급 salts 를 함께 필요로 한다. AgeVaultStorage 는 unlock 후
    /// passphrase 를 보관하지 않고 Identity 만 보관하므로, AppContext 가 별도로 보유한다.
    ///
    /// **보안 등가성**: vault unlocked 동안 Identity (StaticSecret) 가 어차피 메모리에
    /// 있으므로, attacker 가 process memory 접근 권한을 얻으면 양쪽 모두 노출된다.
    /// passphrase 추가가 attack surface 를 늘리지 않는다.
    /// `SecretString` 의 자동 zeroize 가 lock 시 즉시 메모리에서 wipe.
    ///
    /// **Zero-Knowledge 준수**: 본 필드는 절대 영속(vault file) 또는 외부(릴레이) 에
    /// 노출하지 않는다 — 메모리에서 derive 결과만 외부로 나간다 (auth_hash 만 송신).
    pub master_passphrase: Arc<RwLock<Option<SecretString>>>,

    /// M9 Phase D-2 — `db:changed` Tauri 이벤트 emitter.
    ///
    /// 모든 mutating 커맨드가 SQLite 변경 후 호출. 프런트엔드의 `SyncProvider`
    /// 가 받아 Y.Doc 의 해당 Y.Map 을 갱신 (Phase D-3 의 origin guard 로
    /// 무한 루프 방지).
    ///
    /// 테스트 fixture 는 `noop_emitter()` 를 사용해 emit 을 무력화.
    /// Production lib.rs setup 은 `app.handle()` 로 만든 `TauriDbChangeEmitter`
    /// 를 [`AppContext::new`] 에 주입한다.
    pub db_change_emitter: SharedDbChangeEmitter,

    /// D-6: nm-host ↔ Tauri IPC 브리지 핸들.
    ///
    /// vault unlock 시 `start_bridge` 로 생성. vault lock 시 drop 으로 자동 종료.
    /// `SECRETBANK_BRIDGE_PORT` ENV var 를 통해 nm-host 에 포트 전달.
    /// TM-EXT-BRIDGE-1: 127.0.0.1 전용 bind.
    pub nm_bridge: Arc<Mutex<Option<NmBridgeHandle>>>,

    /// M9 Phase G T092 — in-flight device pairing state.
    ///
    /// 한 시점에 한 페어링만 허용 (initiator 또는 joiner 역할 둘 중 하나).
    /// 새 start/join 호출 시 이전 state 는 덮어써짐. 5분 TTL 은 relay 측 KV
    /// 에서 enforce — 클라이언트 메모리 자체는 명시 cancel 또는 finalize/apply
    /// 까지 유지.
    pub pairing_session: Arc<PairingSessionLock>,
}

impl AppContext {
    /// Initialise the context asynchronously.
    ///
    /// Creates `data_dir` if it does not exist, opens the SQLite pool,
    /// and opens (or creates) the age vault.
    pub async fn new(
        data_dir: PathBuf,
        db_change_emitter: SharedDbChangeEmitter,
    ) -> Result<Self, Box<dyn std::error::Error>> {
        // Ensure data directory exists.
        tokio::fs::create_dir_all(&data_dir).await?;

        // SQLite pool.
        let db_path = data_dir.join("vault.db");
        let pool = init_pool(&db_path).await?;
        let pool = Arc::new(pool);

        // Age vault (open in Locked or NotInitialized state).
        let vault_path = data_dir.join("vault.age");
        let age_vault = AgeVaultStorage::open(&vault_path).await?;
        let vault: Box<dyn VaultStorage + Send + Sync> = Box::new(age_vault);

        // Device identity starts as None — populated after vault_unlock.
        let device_identity: Arc<RwLock<Option<DeviceIdentity>>> = Arc::new(RwLock::new(None));

        // Audit context — shares pool and device_identity.
        let audit = Arc::new(AuditCtx::new(pool.clone(), device_identity.clone()));

        // Relay HTTP client — resolved from SQLite settings + build-profile default.
        // Treat lookup failure as fatal: without a relay we can't sign in or sync.
        let relay_client = Arc::new(RelayClient::from_settings(&pool).await?);

        Ok(Self {
            vault: Arc::new(RwLock::new(vault)),
            pool,
            data_dir,
            user_id: "default".to_owned(),
            clipboard_controller: Arc::new(Mutex::new(None)),
            feed_scheduler: Arc::new(Mutex::new(None)),
            device_identity,
            audit,
            kill_switch_tokens: Arc::new(ConfirmTokenStore::default()),
            issuer_kill_switch_tokens: Arc::new(IssuerConfirmTokenStore::default()),
            import_sessions: Arc::new(ImportSessionStore::new()),
            env_scan_sessions: Arc::new(EnvScanSessionStore::new()),
            relay_client,
            auth_session: Arc::new(RwLock::new(None)),
            master_passphrase: Arc::new(RwLock::new(None)),
            db_change_emitter,
            nm_bridge: Arc::new(Mutex::new(None)),
            pairing_session: Arc::new(RwLock::new(None)),
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

    /// Initialize the vault and simultaneously issue a Vault Charter.
    ///
    /// Returns `CharterIssuance` so the calling command can serialize it for the UI
    /// (1 회 화면 표시 후 폐기).
    pub async fn initialize_vault_with_charter(
        &self,
        password: &SecretString,
        mode: secretbank_storage::age_vault::CharterMode,
    ) -> Result<secretbank_storage::age_vault::CharterIssuance, VaultError> {
        let vault_path = self.data_dir.join("vault.age");
        let mut age_vault = AgeVaultStorage::open(&vault_path).await?;
        let issuance = age_vault.initialize_with_charter(password, mode).await?;
        let mut guard = self.vault.write().await;
        *guard = Box::new(age_vault);
        Ok(issuance)
    }

    /// Recover the vault using a `CharterSecret` and reissue with `new_password`.
    ///
    /// Returns the optional new `CharterIssuance` (if `new_charter_mode != None`).
    pub async fn recover_vault_with_charter(
        &self,
        charter_secret: secretbank_charter::CharterSecret,
        new_password: &SecretString,
        new_charter_mode: secretbank_storage::age_vault::CharterMode,
    ) -> Result<secretbank_storage::age_vault::CharterIssuance, VaultError> {
        let vault_path = self.data_dir.join("vault.age");
        let mut age_vault = AgeVaultStorage::open(&vault_path).await?;
        let issuance = age_vault
            .recover_with_charter(charter_secret, new_password, new_charter_mode)
            .await?;
        let mut guard = self.vault.write().await;
        *guard = Box::new(age_vault);
        Ok(issuance)
    }
}
