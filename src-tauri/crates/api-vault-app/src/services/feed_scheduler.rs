//! 주기적 incident 폴링 스케줄러.
//!
//! `spawn_feed_scheduler` 를 앱 시작 시 호출하면 RSS(5분)/NVD(2h)/GHSA(24h) 폴러가
//! 각각 독립 tokio task 로 실행된다. `FeedSchedulerHandle::shutdown()` 으로 graceful cancel.
//!
//! # API key gate
//! NVD / GHSA 는 `FeedSchedulerConfig` 에 key/token 이 Some 일 때만 spawn 된다.
//! 현재 기본값(`Default::default()`)은 전부 None → RSS 만 동작.

use std::sync::Arc;
use std::time::Duration;

use api_vault_feeds::{
    default_presets, match_incident, GhsaClient, HibpClient, NvdClient, RssClient,
};
use api_vault_storage::sqlite::repositories::credential::CredentialRepo;
use api_vault_storage::sqlite::repositories::incident::IncidentRepo;
use api_vault_storage::sqlite::repositories::issuer::IssuerRepo;
use api_vault_storage::sqlite::SqlitePool;
use time::OffsetDateTime;
use tokio::task::JoinSet;
use tokio_util::sync::CancellationToken;

use crate::services::feed_normalize::{
    build_issuer_index, normalize_ghsa, normalize_hibp_breach, normalize_nvd, normalize_rss,
};

// ---------------------------------------------------------------------------
// Event emitter abstraction (테스트 가능성을 위해 trait 로 분리)
// ---------------------------------------------------------------------------

/// Tauri 이벤트 `incidents:updated` 를 방출하는 추상 인터페이스.
///
/// 프로덕션: `TauriEmitter` (AppHandle 래퍼).
/// 테스트: `NoopEmitter`.
pub trait IncidentEventEmitter: Send + Sync + 'static {
    fn emit_incidents_updated(&self);
}

/// 프로덕션 구현 — Tauri `AppHandle` 로 전체 창에 이벤트를 방출한다.
pub struct TauriEmitter {
    app_handle: tauri::AppHandle,
}

impl TauriEmitter {
    pub fn new(app_handle: tauri::AppHandle) -> Self {
        Self { app_handle }
    }
}

impl IncidentEventEmitter for TauriEmitter {
    fn emit_incidents_updated(&self) {
        use tauri::Emitter as _;
        if let Err(e) = self.app_handle.emit("incidents:updated", ()) {
            tracing::warn!(error = %e, "incidents:updated 이벤트 방출 실패");
        }
    }
}

/// 테스트 전용 — 이벤트를 방출하지 않는다.
pub struct NoopEmitter;

impl IncidentEventEmitter for NoopEmitter {
    fn emit_incidents_updated(&self) {}
}

// ---------------------------------------------------------------------------
// 에러 모델
// ---------------------------------------------------------------------------

#[derive(Debug, thiserror::Error)]
pub enum FeedSchedulerError {
    #[error("Storage error: {0}")]
    Storage(#[from] api_vault_storage::sqlite::StorageError),

    #[error("Nvd feed error: {0}")]
    Nvd(#[from] api_vault_feeds::NvdError),

    #[error("Ghsa feed error: {0}")]
    Ghsa(#[from] api_vault_feeds::GhsaError),

    #[error("Hibp feed error: {0}")]
    Hibp(#[from] api_vault_feeds::HibpError),
}

// ---------------------------------------------------------------------------
// Circuit Breaker
// ---------------------------------------------------------------------------

/// 연속 실패 횟수를 추적하고 3회 이상이면 1시간 cooldown 을 적용한다.
#[derive(Debug)]
pub(crate) struct Breaker {
    consecutive_failures: u32,
    cooldown_until: Option<tokio::time::Instant>,
}

impl Breaker {
    pub(crate) fn new() -> Self {
        Self {
            consecutive_failures: 0,
            cooldown_until: None,
        }
    }

    /// 현재 시각 기준으로 breaker 가 열려 있으면 true (폴 생략해야 함).
    pub(crate) fn is_open(&self, now: tokio::time::Instant) -> bool {
        self.cooldown_until.is_some_and(|until| now < until)
    }

    pub(crate) fn on_success(&mut self) {
        self.consecutive_failures = 0;
        self.cooldown_until = None;
    }

    pub(crate) fn on_failure(&mut self, now: tokio::time::Instant) {
        self.consecutive_failures += 1;
        if self.consecutive_failures >= 3 {
            self.cooldown_until = Some(now + Duration::from_secs(3600));
        }
    }
}

// ---------------------------------------------------------------------------
// 스케줄러 설정
// ---------------------------------------------------------------------------

/// 폴링 주기 및 API 키 설정.
///
/// `Default::default()` = NVD/GHSA 비활성, RSS + HIBP Breaches 활성.
/// `emitter` 는 폴러가 새 incident 를 저장한 후 이벤트를 방출하는 데 사용된다.
#[derive(Clone)]
pub struct FeedSchedulerConfig {
    /// NVD CVE API 키. None 이면 NVD 폴러를 spawn 하지 않는다.
    pub nvd_api_key: Option<String>,
    /// GitHub PAT (GHSA 조회). None 이면 GHSA 폴러를 spawn 하지 않는다.
    pub ghsa_token: Option<String>,
    pub nvd_interval: Duration,
    pub ghsa_interval: Duration,
    pub rss_interval: Duration,
    /// HIBP `/breaches` 엔드포인트 폴러 활성화 여부 (default `true`).
    /// 키 없이도 동작하는 공개 엔드포인트.
    pub hibp_breaches_enabled: bool,
    /// HIBP breaches 폴링 주기 (default 24시간).
    pub hibp_breaches_interval: Duration,
    /// 새 incident 가 저장될 때 방출할 이벤트 에미터. None 이면 이벤트 없음.
    pub emitter: Option<Arc<dyn IncidentEventEmitter>>,
}

impl Default for FeedSchedulerConfig {
    fn default() -> Self {
        Self {
            nvd_api_key: None,
            ghsa_token: None,
            nvd_interval: Duration::from_secs(2 * 60 * 60),
            ghsa_interval: Duration::from_secs(24 * 60 * 60),
            rss_interval: Duration::from_secs(5 * 60),
            hibp_breaches_enabled: true,
            hibp_breaches_interval: Duration::from_secs(24 * 60 * 60),
            emitter: None,
        }
    }
}

// ---------------------------------------------------------------------------
// 스케줄러 핸들
// ---------------------------------------------------------------------------

/// `spawn_feed_scheduler` 가 반환하는 핸들. Graceful shutdown 을 제공한다.
pub struct FeedSchedulerHandle {
    cancel: CancellationToken,
    join_set: JoinSet<()>,
    pool: Arc<SqlitePool>,
    config: FeedSchedulerConfig,
    emitter: Option<Arc<dyn IncidentEventEmitter>>,
}

impl FeedSchedulerHandle {
    /// 모든 폴러 태스크를 취소하고 완료를 기다린다.
    pub async fn shutdown(mut self) {
        self.cancel.cancel();
        while self.join_set.join_next().await.is_some() {}
    }

    /// 모든 활성화된 소스에 대해 즉시 1회 폴링을 실행한다.
    ///
    /// 정기 스케줄과 독립적으로 동작 (interval bypass).
    /// 반환값 = 전체 소스 합산 저장된 incident 개수.
    /// 1개 이상 저장되면 `incidents:updated` 이벤트를 방출한다.
    pub async fn trigger_once(&self) -> Result<usize, FeedSchedulerError> {
        let mut total = 0usize;

        // RSS 는 항상 실행
        let rss_client = RssClient::new();
        total += poll_rss_once(&self.pool, &rss_client).await?;

        // NVD 는 key 있을 때만
        if let Some(key) = self.config.nvd_api_key.as_ref() {
            let nvd_client = NvdClient::new(Some(key.clone()));
            let since = OffsetDateTime::now_utc() - time::Duration::hours(2);
            total += poll_nvd_once(&self.pool, &nvd_client, since).await?;
        }

        // GHSA 는 token 있을 때만
        if let Some(token) = self.config.ghsa_token.as_ref() {
            let ghsa_client = GhsaClient::new(token.clone());
            let since = OffsetDateTime::now_utc() - time::Duration::hours(24);
            total += poll_ghsa_once(&self.pool, &ghsa_client, since).await?;
        }

        // HIBP breaches 는 enabled 일 때 (키 불필요)
        if self.config.hibp_breaches_enabled {
            let hibp_client = build_hibp_client_for_breaches();
            total += poll_hibp_breaches_once(&self.pool, &hibp_client).await?;
        }

        if total > 0 {
            if let Some(emitter) = self.emitter.as_ref() {
                emitter.emit_incidents_updated();
            }
        }

        Ok(total)
    }
}

// ---------------------------------------------------------------------------
// 스케줄러 spawn
// ---------------------------------------------------------------------------

/// 피드 폴러 태스크들을 spawn 하고 핸들을 반환한다.
///
/// RSS 는 항상 spawn. NVD/GHSA 는 config 에 key 가 있을 때만.
pub fn spawn_feed_scheduler(
    pool: Arc<SqlitePool>,
    config: FeedSchedulerConfig,
) -> FeedSchedulerHandle {
    let cancel = CancellationToken::new();
    let mut join_set = JoinSet::new();
    let emitter = config.emitter.clone();

    // RSS 는 항상 활성
    join_set.spawn(run_rss_poller(
        pool.clone(),
        config.rss_interval,
        cancel.clone(),
        emitter.clone(),
    ));

    // NVD 는 key 있을 때만
    if let Some(key) = config.nvd_api_key.clone() {
        join_set.spawn(run_nvd_poller(
            pool.clone(),
            key,
            config.nvd_interval,
            cancel.clone(),
            emitter.clone(),
        ));
    }

    // GHSA 는 token 있을 때만
    if let Some(token) = config.ghsa_token.clone() {
        join_set.spawn(run_ghsa_poller(
            pool.clone(),
            token,
            config.ghsa_interval,
            cancel.clone(),
            emitter.clone(),
        ));
    }

    // HIBP breaches 는 enabled 일 때 (키 불필요)
    if config.hibp_breaches_enabled {
        join_set.spawn(run_hibp_breaches_poller(
            pool.clone(),
            config.hibp_breaches_interval,
            cancel.clone(),
            emitter.clone(),
        ));
    }

    FeedSchedulerHandle {
        cancel,
        join_set,
        pool,
        config,
        emitter,
    }
}

// ---------------------------------------------------------------------------
// RSS 폴러
// ---------------------------------------------------------------------------

async fn run_rss_poller(
    pool: Arc<SqlitePool>,
    interval: Duration,
    cancel: CancellationToken,
    emitter: Option<Arc<dyn IncidentEventEmitter>>,
) {
    let mut ticker = tokio::time::interval(interval);
    ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
    let mut breaker = Breaker::new();
    let rss_client = RssClient::new();

    loop {
        tokio::select! {
            _ = cancel.cancelled() => break,
            _ = ticker.tick() => {
                let now = tokio::time::Instant::now();
                if breaker.is_open(now) {
                    tracing::debug!("rss poller breaker open, skipping tick");
                    continue;
                }
                match poll_rss_once(&pool, &rss_client).await {
                    Ok(count) => {
                        tracing::info!(count, "rss poll complete");
                        breaker.on_success();
                        if count > 0 {
                            if let Some(e) = emitter.as_ref() {
                                e.emit_incidents_updated();
                            }
                        }
                    }
                    Err(e) => {
                        tracing::warn!(error = %e, "rss poll failed");
                        breaker.on_failure(now);
                    }
                }
            }
        }
    }
}

async fn poll_rss_once(
    pool: &Arc<SqlitePool>,
    rss_client: &RssClient,
) -> Result<usize, FeedSchedulerError> {
    let issuer_repo = IssuerRepo::new(pool);
    let credential_repo = CredentialRepo::new(pool);
    let incident_repo = IncidentRepo::new(pool);

    let issuers = issuer_repo.list().await?;
    let credentials = credential_repo.list_all().await?;
    let index = build_issuer_index(&issuers);

    let entries = rss_client.fetch_all(&default_presets()).await;
    let now = OffsetDateTime::now_utc();

    let mut stored = 0usize;
    for entry in &entries {
        let incident = normalize_rss(entry, &index, now);
        let canonical_id = match incident_repo.insert(&incident).await {
            Ok(id) => id,
            Err(e) => {
                tracing::warn!(?e, source_id = %incident.source_id, "rss incident insert failed");
                continue;
            }
        };
        // Count only newly-inserted rows (canonical_id == incident.id).
        if canonical_id == incident.id {
            stored += 1;
        }

        // Associate matches with the canonical incident id.
        let matches = match_incident(&incident, &credentials, &issuers);
        for m in matches {
            if let Err(e) = incident_repo
                .insert_match(canonical_id, m.credential_id, m.reason)
                .await
            {
                tracing::debug!(?e, "rss incident_match insert skipped");
            }
        }
    }

    Ok(stored)
}

// ---------------------------------------------------------------------------
// NVD 폴러
// ---------------------------------------------------------------------------

async fn run_nvd_poller(
    pool: Arc<SqlitePool>,
    api_key: String,
    interval: Duration,
    cancel: CancellationToken,
    emitter: Option<Arc<dyn IncidentEventEmitter>>,
) {
    let mut ticker = tokio::time::interval(interval);
    ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
    let mut breaker = Breaker::new();
    let nvd_client = NvdClient::new(Some(api_key));

    loop {
        tokio::select! {
            _ = cancel.cancelled() => break,
            _ = ticker.tick() => {
                let now_instant = tokio::time::Instant::now();
                if breaker.is_open(now_instant) {
                    tracing::debug!("nvd poller breaker open, skipping tick");
                    continue;
                }
                let since = OffsetDateTime::now_utc() - time::Duration::hours(2);
                match poll_nvd_once(&pool, &nvd_client, since).await {
                    Ok(count) => {
                        tracing::info!(count, "nvd poll complete");
                        breaker.on_success();
                        if count > 0 {
                            if let Some(e) = emitter.as_ref() {
                                e.emit_incidents_updated();
                            }
                        }
                    }
                    Err(e) => {
                        tracing::warn!(error = %e, "nvd poll failed");
                        breaker.on_failure(now_instant);
                    }
                }
            }
        }
    }
}

async fn poll_nvd_once(
    pool: &Arc<SqlitePool>,
    nvd_client: &NvdClient,
    since: OffsetDateTime,
) -> Result<usize, FeedSchedulerError> {
    let issuer_repo = IssuerRepo::new(pool);
    let credential_repo = CredentialRepo::new(pool);
    let incident_repo = IncidentRepo::new(pool);

    let issuers = issuer_repo.list().await?;
    let credentials = credential_repo.list_all().await?;

    let cves = nvd_client.fetch_incremental(since).await?;
    let now = OffsetDateTime::now_utc();

    let mut stored = 0usize;
    for cve in &cves {
        let incident = normalize_nvd(cve, now);
        let canonical_id = match incident_repo.insert(&incident).await {
            Ok(id) => id,
            Err(e) => {
                tracing::warn!(?e, source_id = %incident.source_id, "nvd incident insert failed");
                continue;
            }
        };
        if canonical_id == incident.id {
            stored += 1;
        }

        let matches = match_incident(&incident, &credentials, &issuers);
        for m in matches {
            if let Err(e) = incident_repo
                .insert_match(canonical_id, m.credential_id, m.reason)
                .await
            {
                tracing::debug!(?e, "nvd incident_match insert skipped");
            }
        }
    }

    Ok(stored)
}

// ---------------------------------------------------------------------------
// GHSA 폴러
// ---------------------------------------------------------------------------

async fn run_ghsa_poller(
    pool: Arc<SqlitePool>,
    token: String,
    interval: Duration,
    cancel: CancellationToken,
    emitter: Option<Arc<dyn IncidentEventEmitter>>,
) {
    let mut ticker = tokio::time::interval(interval);
    ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
    let mut breaker = Breaker::new();
    let ghsa_client = GhsaClient::new(token);

    loop {
        tokio::select! {
            _ = cancel.cancelled() => break,
            _ = ticker.tick() => {
                let now_instant = tokio::time::Instant::now();
                if breaker.is_open(now_instant) {
                    tracing::debug!("ghsa poller breaker open, skipping tick");
                    continue;
                }
                let since = OffsetDateTime::now_utc() - time::Duration::hours(24);
                match poll_ghsa_once(&pool, &ghsa_client, since).await {
                    Ok(count) => {
                        tracing::info!(count, "ghsa poll complete");
                        breaker.on_success();
                        if count > 0 {
                            if let Some(e) = emitter.as_ref() {
                                e.emit_incidents_updated();
                            }
                        }
                    }
                    Err(e) => {
                        tracing::warn!(error = %e, "ghsa poll failed");
                        breaker.on_failure(now_instant);
                    }
                }
            }
        }
    }
}

async fn poll_ghsa_once(
    pool: &Arc<SqlitePool>,
    ghsa_client: &GhsaClient,
    since: OffsetDateTime,
) -> Result<usize, FeedSchedulerError> {
    let issuer_repo = IssuerRepo::new(pool);
    let credential_repo = CredentialRepo::new(pool);
    let incident_repo = IncidentRepo::new(pool);

    let issuers = issuer_repo.list().await?;
    let credentials = credential_repo.list_all().await?;

    let advisories = ghsa_client.fetch_advisories(since).await?;
    let now = OffsetDateTime::now_utc();

    let mut stored = 0usize;
    for adv in &advisories {
        let incident = normalize_ghsa(adv, now);
        let canonical_id = match incident_repo.insert(&incident).await {
            Ok(id) => id,
            Err(e) => {
                tracing::warn!(?e, source_id = %incident.source_id, "ghsa incident insert failed");
                continue;
            }
        };
        if canonical_id == incident.id {
            stored += 1;
        }

        let matches = match_incident(&incident, &credentials, &issuers);
        for m in matches {
            if let Err(e) = incident_repo
                .insert_match(canonical_id, m.credential_id, m.reason)
                .await
            {
                tracing::debug!(?e, "ghsa incident_match insert skipped");
            }
        }
    }

    Ok(stored)
}

// ---------------------------------------------------------------------------
// HIBP Breaches 폴러
// ---------------------------------------------------------------------------

/// `/breaches` 엔드포인트는 인증 키 없이도 동작한다.
/// 빈 키를 전달해 HibpClient를 생성하는 모듈 전용 헬퍼.
fn build_hibp_client_for_breaches() -> HibpClient {
    HibpClient::new(String::new())
}

async fn run_hibp_breaches_poller(
    pool: Arc<SqlitePool>,
    interval: Duration,
    cancel: CancellationToken,
    emitter: Option<Arc<dyn IncidentEventEmitter>>,
) {
    let mut ticker = tokio::time::interval(interval);
    ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
    let mut breaker = Breaker::new();
    let hibp_client = build_hibp_client_for_breaches();

    loop {
        tokio::select! {
            _ = cancel.cancelled() => break,
            _ = ticker.tick() => {
                let now_instant = tokio::time::Instant::now();
                if breaker.is_open(now_instant) {
                    tracing::debug!("hibp breaches poller breaker open, skipping tick");
                    continue;
                }
                match poll_hibp_breaches_once(&pool, &hibp_client).await {
                    Ok(count) => {
                        tracing::info!(count, "hibp breaches poll complete");
                        breaker.on_success();
                        if count > 0 {
                            if let Some(e) = emitter.as_ref() {
                                e.emit_incidents_updated();
                            }
                        }
                    }
                    Err(e) => {
                        tracing::warn!(error = %e, "hibp breaches poll failed");
                        breaker.on_failure(now_instant);
                    }
                }
            }
        }
    }
}

pub(crate) async fn poll_hibp_breaches_once(
    pool: &Arc<SqlitePool>,
    hibp_client: &HibpClient,
) -> Result<usize, FeedSchedulerError> {
    let issuer_repo = IssuerRepo::new(pool);
    let credential_repo = CredentialRepo::new(pool);
    let incident_repo = IncidentRepo::new(pool);

    let issuers = issuer_repo.list().await?;
    let credentials = credential_repo.list_all().await?;

    let breaches = hibp_client.list_breaches().await?;
    let now = OffsetDateTime::now_utc();

    let mut stored = 0usize;
    for breach in &breaches {
        let incident = normalize_hibp_breach(breach, now);
        let canonical_id = match incident_repo.insert(&incident).await {
            Ok(id) => id,
            Err(e) => {
                tracing::warn!(?e, source_id = %incident.source_id, "hibp breach incident insert failed");
                continue;
            }
        };
        if canonical_id == incident.id {
            stored += 1;
        }

        let matches = match_incident(&incident, &credentials, &issuers);
        for m in matches {
            if let Err(e) = incident_repo
                .insert_match(canonical_id, m.credential_id, m.reason)
                .await
            {
                tracing::debug!(?e, "hibp breach incident_match insert skipped");
            }
        }
    }

    Ok(stored)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn instant_minus_secs(secs: u64) -> tokio::time::Instant {
        // tokio::time::Instant 는 Duration 뺄셈을 지원하지 않으므로
        // now() 를 기준으로 과거를 표현하기 위해 cooldown_until 직접 조작 불가.
        // 대신 now + very_small 으로 대략 동일 시각을 표현한다.
        // 실제로 "이미 지난 cooldown" 을 테스트하려면 cooldown_until 을 now() 보다 과거로 설정해야 하므로
        // Instant::now() - Duration 이 필요한데, tokio Instant 는 checked_sub 로 처리 가능.
        let base = tokio::time::Instant::now();
        // saturating sub: 언더플로우 방지
        base.checked_sub(Duration::from_secs(secs)).unwrap_or(base)
    }

    // -----------------------------------------------------------------------
    // Test 1: 연속 3회 실패 → breaker 열림
    // -----------------------------------------------------------------------
    #[test]
    fn test_breaker_opens_after_3_failures() {
        let mut b = Breaker::new();
        let now = tokio::time::Instant::now();

        b.on_failure(now);
        b.on_failure(now);
        assert!(!b.is_open(now), "2회 실패 후에는 아직 닫혀 있어야 함");

        b.on_failure(now);
        // cooldown_until = now + 1h → is_open(now) == true
        assert!(b.is_open(now), "3회 실패 후 breaker 가 열려야 함");
    }

    // -----------------------------------------------------------------------
    // Test 2: on_success → 실패 카운터 초기화
    // -----------------------------------------------------------------------
    #[test]
    fn test_breaker_clears_on_success() {
        let mut b = Breaker::new();
        let now = tokio::time::Instant::now();

        b.on_failure(now);
        b.on_failure(now);
        assert_eq!(b.consecutive_failures, 2);

        b.on_success();
        assert_eq!(b.consecutive_failures, 0);
        assert!(b.cooldown_until.is_none());
        assert!(!b.is_open(now));
    }

    // -----------------------------------------------------------------------
    // Test 3: cooldown_until 이 과거 → is_open = false
    // -----------------------------------------------------------------------
    #[test]
    fn test_breaker_closed_when_cooldown_expired() {
        let mut b = Breaker::new();
        // cooldown_until 을 현재 시각보다 1초 이전으로 직접 설정
        let past = instant_minus_secs(1);
        b.cooldown_until = Some(past);

        let now = tokio::time::Instant::now();
        // past < now 이므로 is_open == false
        assert!(!b.is_open(now), "cooldown 만료 후에는 breaker 가 닫혀야 함");
    }

    // -----------------------------------------------------------------------
    // Test 4: 2회 실패 → is_open = false (3회 미만)
    // -----------------------------------------------------------------------
    #[test]
    fn test_breaker_not_open_before_3_failures() {
        let mut b = Breaker::new();
        let now = tokio::time::Instant::now();

        b.on_failure(now);
        b.on_failure(now);

        assert!(!b.is_open(now));
    }

    // -----------------------------------------------------------------------
    // Test: FeedSchedulerConfig::default() — NVD/GHSA 키 없음, HIBP 활성
    // -----------------------------------------------------------------------
    #[test]
    fn test_feed_scheduler_config_default_has_no_keys() {
        let cfg = FeedSchedulerConfig::default();
        assert!(cfg.nvd_api_key.is_none());
        assert!(cfg.ghsa_token.is_none());
        assert_eq!(cfg.rss_interval, Duration::from_secs(5 * 60));
        assert_eq!(cfg.nvd_interval, Duration::from_secs(2 * 60 * 60));
        assert_eq!(cfg.ghsa_interval, Duration::from_secs(24 * 60 * 60));
        assert!(cfg.hibp_breaches_enabled);
        assert_eq!(
            cfg.hibp_breaches_interval,
            Duration::from_secs(24 * 60 * 60)
        );
    }

    // -----------------------------------------------------------------------
    // Test: spawn + immediate shutdown (RSS + HIBP 활성, 실제 HTTP 없음)
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn test_scheduler_spawn_and_shutdown_immediately() {
        // 실제 DB 없이 종료 경로만 검증한다.
        // interval 을 매우 길게 설정해 tick 이 안 오도록 함.
        use api_vault_storage::sqlite::init_pool;
        use tempfile::tempdir;

        let dir = tempdir().unwrap();
        let db_path = dir.path().join("test.db");
        let pool = init_pool(&db_path).await.unwrap();
        let pool_arc = Arc::new(pool);

        let config = FeedSchedulerConfig {
            nvd_api_key: None,
            ghsa_token: None,
            rss_interval: Duration::from_secs(9999),
            nvd_interval: Duration::from_secs(9999),
            ghsa_interval: Duration::from_secs(9999),
            hibp_breaches_enabled: false, // 실제 네트워크 차단
            hibp_breaches_interval: Duration::from_secs(9999),
            emitter: Some(Arc::new(NoopEmitter)),
        };

        let handle = spawn_feed_scheduler(pool_arc, config);
        // 즉시 shutdown → deadlock 없이 완료되어야 함
        handle.shutdown().await;
    }

    // -----------------------------------------------------------------------
    // Test: poll_hibp_breaches_once — 2건 삽입
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn test_poll_hibp_breaches_once_persists_incidents() {
        use api_vault_feeds::HibpClient;
        use api_vault_storage::sqlite::init_pool;
        use tempfile::tempdir;
        use wiremock::matchers::{method, path};
        use wiremock::{Mock, MockServer, ResponseTemplate};

        let mock_server = MockServer::start().await;

        let breach_json = serde_json::json!([
            {
                "Name": "Adobe",
                "Title": "Adobe",
                "Domain": "adobe.com",
                "BreachDate": "2013-10-04",
                "AddedDate": "2013-12-04T00:00:00Z",
                "ModifiedDate": "2022-05-15T23:52:49Z",
                "PwnCount": 152445165u64,
                "Description": "In October 2013, Adobe suffered a massive data breach.",
                "DataClasses": ["Email addresses", "Password hints", "Passwords"],
                "IsVerified": true,
                "IsFabricated": false,
                "IsSensitive": false,
                "IsRetired": false,
                "IsSpamList": false,
                "IsMalware": false,
                "IsSubscriptionFree": false,
                "IsStealerLog": false,
                "LogoPath": "https://logos.haveibeenpwned.com/Adobe.png",
                "Attribution": null,
                "DisclosureUrl": null
            },
            {
                "Name": "LinkedIn",
                "Title": "LinkedIn",
                "Domain": "linkedin.com",
                "BreachDate": "2012-05-05",
                "AddedDate": "2016-05-22T21:35:40Z",
                "ModifiedDate": "2023-11-22T07:04:48Z",
                "PwnCount": 164611595u64,
                "Description": "In May 2016, LinkedIn had 164 million email addresses and passwords exposed.",
                "DataClasses": ["Email addresses", "Passwords"],
                "IsVerified": true,
                "IsFabricated": false,
                "IsSensitive": false,
                "IsRetired": false,
                "IsSpamList": false,
                "IsMalware": false,
                "IsSubscriptionFree": false,
                "IsStealerLog": false,
                "LogoPath": "https://logos.haveibeenpwned.com/LinkedIn.png",
                "Attribution": null,
                "DisclosureUrl": null
            }
        ]);

        Mock::given(method("GET"))
            .and(path("/breaches"))
            .respond_with(ResponseTemplate::new(200).set_body_json(breach_json))
            .mount(&mock_server)
            .await;

        let dir = tempdir().unwrap();
        let db_path = dir.path().join("test.db");
        let pool = init_pool(&db_path).await.unwrap();
        let pool_arc = Arc::new(pool);

        let hibp_client = HibpClient::with_base_url(mock_server.uri(), "");
        let count = poll_hibp_breaches_once(&pool_arc, &hibp_client)
            .await
            .unwrap();

        assert_eq!(count, 2, "2건이 새로 저장되어야 함");

        // DB 에 실제로 삽입됐는지 확인
        use api_vault_core::models::incident::{IncidentFilter, IncidentSource};
        use api_vault_storage::sqlite::repositories::incident::IncidentRepo;
        let incident_repo = IncidentRepo::new(&pool_arc);
        let stored = incident_repo
            .list_with_matches(&IncidentFilter {
                source: Some(IncidentSource::Hibp),
                ..Default::default()
            })
            .await
            .unwrap();
        assert_eq!(stored.len(), 2);

        let source_ids: Vec<&str> = stored
            .iter()
            .map(|e| e.incident.source_id.as_str())
            .collect();
        assert!(source_ids.contains(&"Adobe"));
        assert!(source_ids.contains(&"LinkedIn"));
    }

    // -----------------------------------------------------------------------
    // Test: poll_hibp_breaches_once — 멱등성 (두 번 폴링 → 두 번째는 0)
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn test_poll_hibp_breaches_once_idempotent() {
        use api_vault_feeds::HibpClient;
        use api_vault_storage::sqlite::init_pool;
        use tempfile::tempdir;
        use wiremock::matchers::{method, path};
        use wiremock::{Mock, MockServer, ResponseTemplate};

        let mock_server = MockServer::start().await;

        let breach_json = serde_json::json!([{
            "Name": "Vercel",
            "Title": "Vercel",
            "Domain": "vercel.com",
            "BreachDate": "2023-01-01",
            "AddedDate": "2023-06-15T20:40:48Z",
            "ModifiedDate": "2024-03-04T02:06:27Z",
            "PwnCount": 50000u64,
            "Description": "Test breach.",
            "DataClasses": ["Email addresses"],
            "IsVerified": true,
            "IsFabricated": false,
            "IsSensitive": false,
            "IsRetired": false,
            "IsSpamList": false,
            "IsMalware": false,
            "IsSubscriptionFree": false,
            "IsStealerLog": false,
            "LogoPath": null,
            "Attribution": null,
            "DisclosureUrl": null
        }]);

        // 동일 응답을 2회 반환
        Mock::given(method("GET"))
            .and(path("/breaches"))
            .respond_with(ResponseTemplate::new(200).set_body_json(breach_json))
            .expect(2)
            .mount(&mock_server)
            .await;

        let dir = tempdir().unwrap();
        let db_path = dir.path().join("test.db");
        let pool = init_pool(&db_path).await.unwrap();
        let pool_arc = Arc::new(pool);

        let hibp_client = HibpClient::with_base_url(mock_server.uri(), "");

        let first = poll_hibp_breaches_once(&pool_arc, &hibp_client)
            .await
            .unwrap();
        assert_eq!(first, 1, "첫 번째 폴링: 1건 저장");

        let second = poll_hibp_breaches_once(&pool_arc, &hibp_client)
            .await
            .unwrap();
        assert_eq!(second, 0, "두 번째 폴링: UNIQUE 제약으로 0건 (멱등)");
    }
}
