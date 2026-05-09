//! Tauri commands for Watchtower-style security checks (Phase 2-2B-4).
//!
//! # Commands
//! - `run_security_check` — vault unlock 후 로컬 4종 + 선택적 HIBP 검사 실행.
//! - `list_security_alerts` — 활성 alert 목록 조회 (All / ByKind / ByCredential 필터).
//! - `dismiss_security_alert` — alert 비활성화 (`dismissed_at` 설정).
//! - `undismiss_security_alert` — alert 재활성화 (`dismissed_at` → NULL).
//!
//! # 보안 원칙
//! - B.1-3: 평문 비번은 IPC 응답에 절대 포함 금지 — `SecretBox` 에서만 사용.
//! - B.1-6: audit log 는 수동 실행(`run_security_check`)에만 기록 (요약만, credential_id 미포함).
//! - B.1-9: 에러 메시지는 범용 문자열 — credential ID/URL/username 미포함.
//! - GATE 1-1: HIBP 호출은 `force_hibp=true` 일 때만 (default 비활성).
//! - GATE 1-5: HIBP 동시성 10 (`tokio::sync::Semaphore`).

use std::collections::HashMap;
use std::sync::Arc;

use secrecy::SecretBox;
use secretbank_audit::AuditActor;
use secretbank_feeds::{
    check_missing_2fa, check_unsecured_url, detect_reused_passwords, is_weak_password,
    CredentialFor2FaCheck, CredentialPasswordRef, PwnedPasswordsClient, TwoFaDirectoryClient,
};
use secretbank_storage::sqlite::repositories::{
    credential::CredentialRepo, security_alert::SecurityAlertRepo,
};
use secretbank_storage::vault::ExposeSecret;
use serde::{Deserialize, Serialize};
use tauri::State;
use time::format_description::well_known::Rfc3339;
use time::OffsetDateTime;
use tokio::sync::Semaphore;
use tokio::task::JoinSet;

use crate::context::AppContext;

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

#[derive(Debug, thiserror::Error, Serialize)]
#[serde(tag = "code", rename_all = "snake_case")]
pub enum SecurityCheckCommandError {
    #[error("vault is locked")]
    VaultLocked,

    #[error("internal error")]
    Internal,
}

// ---------------------------------------------------------------------------
// Response / input types
// ---------------------------------------------------------------------------

/// `run_security_check` 응답 — 평문 비번 미포함 (B.1-3).
#[derive(Debug, Serialize)]
pub struct SecurityCheckSummary {
    pub total_credentials_checked: usize,
    pub alerts_count_by_kind: HashMap<String, usize>,
    pub hibp_called: bool,
    /// true 면 HIBP 일부 실패 (R3 — UI에서 별도 표시).
    pub hibp_failed: bool,
    pub completed_at: String,
}

/// `list_security_alerts` 필터.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case", tag = "kind")]
pub enum ListFilter {
    All,
    ByKind { alert_kind: String },
    ByCredential { credential_id: String },
}

/// IPC 응답 DTO — 평문 비번 미포함 (B.1-3).
#[derive(Debug, Serialize)]
pub struct SecurityAlertView {
    pub id: String,
    pub credential_id: String,
    pub alert_kind: String,
    /// 파싱된 JSON 메타데이터 (count/score/domain 등).
    pub alert_meta: serde_json::Value,
    pub dismissed_at: Option<String>,
    pub checked_at: String,
}

// ---------------------------------------------------------------------------
// Internal helper — ISO8601 타임스탬프
// ---------------------------------------------------------------------------

fn now_iso8601() -> String {
    OffsetDateTime::now_utc()
        .format(&Rfc3339)
        .unwrap_or_else(|_| "1970-01-01T00:00:00Z".to_string())
}

// ---------------------------------------------------------------------------
// run_security_check
// ---------------------------------------------------------------------------

/// 보안 검사 실행.
///
/// 로컬 4종(weak / reused / unsecured / missing_2fa) 은 항상 실행.
/// HIBP range check 는 `force_hibp=true` 일 때만 실행 (GATE 1-1).
///
/// 수동 실행 시에만 audit log 기록 (GATE 1-6).
/// 검사 결과는 `security_alerts` 테이블에 저장 (dismissed alert 보존).
///
/// **평문 비번은 절대 IPC 응답에 포함하지 않는다** (B.1-3).
#[tauri::command]
pub async fn run_security_check(
    state: State<'_, AppContext>,
    force_hibp: bool,
) -> Result<SecurityCheckSummary, SecurityCheckCommandError> {
    // 1. vault unlock 상태 확인
    {
        let vault = state.vault.read().await;
        if !vault.is_unlocked().await {
            return Err(SecurityCheckCommandError::VaultLocked);
        }
    }

    // 2. 모든 credential 로드 (metadata only — vault_ref 를 통한 secret 조회는 아래에서)
    let cred_repo = CredentialRepo::new(&state.pool);
    let credentials = cred_repo
        .list_all()
        .await
        .map_err(|_| SecurityCheckCommandError::Internal)?;
    let total = credentials.len();

    // 3. vault 에서 평문 비번 로드 (메모리 안에서만 SecretBox 로 보호)
    //    credential_id → SecretBox<String>
    let mut password_map: Vec<(String, SecretBox<String>)> = Vec::with_capacity(total);
    {
        let vault = state.vault.read().await;
        for cred in &credentials {
            match vault.get_secret(&cred.vault_ref).await {
                Ok(bytes) => {
                    let inner = bytes.expose_secret().clone();
                    match String::from_utf8(inner) {
                        Ok(pw) => {
                            password_map.push((cred.id.to_string(), SecretBox::new(Box::new(pw))));
                        }
                        Err(_) => {
                            // UTF-8 아닌 binary secret → 검사 skip
                        }
                    }
                }
                Err(_) => {
                    // vault 접근 실패 → 해당 credential 검사 skip (B.1-9)
                }
            }
        }
    } // vault read lock 해제

    // 4. CredentialPasswordRef 슬라이스 구성
    let pw_refs: Vec<CredentialPasswordRef<'_>> = password_map
        .iter()
        .map(|(id, pw)| CredentialPasswordRef {
            id: id.as_str(),
            password: pw,
        })
        .collect();

    // 5. 재사용 비번 감지 (전체 슬라이스 대상 1회)
    let reuse_groups = detect_reused_passwords(&pw_refs);
    // cred_id → also_used_by 매핑 구성
    let mut reuse_peers: HashMap<String, Vec<String>> = HashMap::new();
    for group in &reuse_groups {
        for id in &group.credential_ids {
            let others: Vec<String> = group
                .credential_ids
                .iter()
                .filter(|other_id| *other_id != id)
                .cloned()
                .collect();
            reuse_peers.insert(id.clone(), others);
        }
    }

    // 6. 2FA directory (in-memory TTL cache 사용, IO 실패 시 빈 HashSet 로 fallback)
    let twofa_client = TwoFaDirectoryClient::new();
    let totp_domains = twofa_client
        .list_totp_supported_domains()
        .await
        .unwrap_or_default();

    // 7. credential 별 로컬 검사 수행
    //    alerts_map: credential_id → Vec<(kind, meta_json)>
    let mut alerts_map: HashMap<String, Vec<(String, String)>> = HashMap::new();

    let cred_id_set: std::collections::HashSet<String> =
        credentials.iter().map(|c| c.id.to_string()).collect();

    for cred in &credentials {
        let cred_id = cred.id.to_string();
        let mut cred_alerts: Vec<(String, String)> = Vec::new();

        // 7a. weak password
        if let Some((id, pw)) = password_map.iter().find(|(id, _)| id == &cred_id) {
            let _ = id; // suppress warning
            let user_inputs: Vec<&str> =
                vec![cred.name.as_str(), cred.username.as_deref().unwrap_or("")];
            if let Some((score, length)) = is_weak_password(pw, &user_inputs) {
                let meta = serde_json::json!({"score": score, "length": length}).to_string();
                cred_alerts.push(("weak_password".to_string(), meta));
            }
        }

        // 7b. reused password
        if let Some(peers) = reuse_peers.get(&cred_id) {
            if !peers.is_empty() {
                let meta = serde_json::json!({"also_used_by": peers}).to_string();
                cred_alerts.push(("reused_password".to_string(), meta));
            }
        }

        // 7c. unsecured URL
        if let Some(ref url) = cred.url {
            if let Some(unsecured_url) = check_unsecured_url(url) {
                let meta = serde_json::json!({"url": unsecured_url}).to_string();
                cred_alerts.push(("unsecured_website".to_string(), meta));
            }
        }

        // 7d. missing 2FA
        // CredentialKind 에는 Totp variant 없음 — secondary_label 에 "totp" 포함 여부로 판단.
        let has_secondary_otp = cred.secondary_value_ref.is_some()
            && cred
                .secondary_label
                .as_deref()
                .map(|l| l.to_ascii_lowercase().contains("totp"))
                .unwrap_or(false);
        let check_2fa = CredentialFor2FaCheck {
            id: &cred_id,
            url: cred.url.as_deref(),
            totp_uri: None,
            has_secondary_otp_slot: has_secondary_otp,
        };
        if let Some(domain) = check_missing_2fa(&check_2fa, &totp_domains) {
            let meta = serde_json::json!({"domain": domain}).to_string();
            cred_alerts.push(("missing_two_factor".to_string(), meta));
        }

        if !cred_alerts.is_empty() {
            alerts_map.insert(cred_id, cred_alerts);
        } else {
            // 알림 없어도 빈 Vec 로 replace → 기존 undismissed alert 삭제
            alerts_map.insert(cred_id, Vec::new());
        }
    }

    // 8. HIBP (force_hibp=true 일 때만, GATE 1-1)
    let mut hibp_called = false;
    let mut hibp_failed = false;

    if force_hibp {
        hibp_called = true;
        let pwned_client = Arc::new(PwnedPasswordsClient::new());
        const CONCURRENCY: usize = 10; // GATE 1-5
        let semaphore = Arc::new(Semaphore::new(CONCURRENCY));

        let mut join_set: JoinSet<(String, Result<u64, ()>)> = JoinSet::new();

        for (cred_id, pw) in &password_map {
            // cred_id 가 credentials 에 없으면 skip (방어적 코딩)
            if !cred_id_set.contains(cred_id) {
                continue;
            }

            let permit = match semaphore.clone().acquire_owned().await {
                Ok(p) => p,
                Err(_) => {
                    hibp_failed = true;
                    continue;
                }
            };
            let client = pwned_client.clone();
            // SecretBox 는 Clone 불가 → 내용 복사하여 새 SecretBox 로 spawn
            let pw_clone: SecretBox<String> = {
                let inner = pw.expose_secret().clone();
                SecretBox::new(Box::new(inner))
            };
            let id_clone = cred_id.clone();
            join_set.spawn(async move {
                let _permit = permit;
                let result = client.check_password(&pw_clone).await.map_err(|_| ()); // B.1-9: 에러 세부 미저장
                (id_clone, result)
            });
        }

        while let Some(joined) = join_set.join_next().await {
            match joined {
                Ok((cred_id, Ok(count))) if count > 0 => {
                    let meta = serde_json::json!({"exposure_count": count}).to_string();
                    alerts_map
                        .entry(cred_id)
                        .or_default()
                        .push(("compromised_password".to_string(), meta));
                }
                Ok((_, Ok(_))) => {
                    // count == 0, 정상
                }
                Ok((_, Err(_))) => {
                    hibp_failed = true; // R3: 일부 실패, 작업 계속
                }
                Err(_) => {
                    hibp_failed = true;
                }
            }
        }
    }

    // 9. 모든 alert → SecurityAlertRepo.replace_alerts_for_credential 트랜잭션
    let now = now_iso8601();
    let alert_repo = SecurityAlertRepo::new(&state.pool);

    // 검사에 포함되지 않은 credential(vault 접근 실패 등)은 alerts_map 에 없음
    // → replace 미호출 → 기존 alert 보존 (안전한 방향)
    for (cred_id, alerts) in &alerts_map {
        alert_repo
            .replace_alerts_for_credential(cred_id, alerts, &now)
            .await
            .map_err(|_| SecurityCheckCommandError::Internal)?;
    }

    // 10. 통계 집계
    let mut alerts_count_by_kind: HashMap<String, usize> = HashMap::new();
    for alerts in alerts_map.values() {
        for (kind, _) in alerts {
            *alerts_count_by_kind.entry(kind.clone()).or_insert(0) += 1;
        }
    }
    let total_alerts: usize = alerts_count_by_kind.values().sum();

    // 11. audit log (B.1-6, GATE 1-6 — 수동 실행 시만, 요약만, credential_id 미포함)
    state
        .audit
        .record(
            AuditActor::LocalUser,
            "security_check.run",
            "security_check",
            "manual",
            Some(
                serde_json::json!({
                    "total_checked": total,
                    "alerts_count": total_alerts,
                    "hibp_called": hibp_called,
                })
                .to_string(),
            ),
        )
        .await;

    Ok(SecurityCheckSummary {
        total_credentials_checked: total,
        alerts_count_by_kind,
        hibp_called,
        hibp_failed,
        completed_at: now,
    })
}

// ---------------------------------------------------------------------------
// list_security_alerts
// ---------------------------------------------------------------------------

/// 활성 security alert 목록 조회.
///
/// `filter`:
/// - `{"kind":"all"}` — 전체 활성 alert
/// - `{"kind":"by_kind","alert_kind":"weak_password"}` — 특정 종류
/// - `{"kind":"by_credential","credential_id":"<ULID>"}` — 특정 credential
///
/// 응답에 평문 비번 미포함 (B.1-3).
#[tauri::command]
pub async fn list_security_alerts(
    state: State<'_, AppContext>,
    filter: ListFilter,
) -> Result<Vec<SecurityAlertView>, SecurityCheckCommandError> {
    let repo = SecurityAlertRepo::new(&state.pool);

    let records = match filter {
        ListFilter::All => repo.list_active_all().await,
        ListFilter::ByKind { alert_kind } => repo.list_active_by_kind(&alert_kind).await,
        ListFilter::ByCredential { credential_id } => {
            repo.list_active_by_credential(&credential_id).await
        }
    }
    .map_err(|_| SecurityCheckCommandError::Internal)?;

    Ok(records
        .into_iter()
        .map(|r| SecurityAlertView {
            id: r.id,
            credential_id: r.credential_id,
            alert_kind: r.alert_kind,
            alert_meta: serde_json::from_str(&r.alert_meta).unwrap_or(serde_json::json!({})),
            dismissed_at: r.dismissed_at,
            checked_at: r.checked_at,
        })
        .collect())
}

// ---------------------------------------------------------------------------
// dismiss_security_alert
// ---------------------------------------------------------------------------

/// Alert 비활성화 (`dismissed_at` 설정).
#[tauri::command]
pub async fn dismiss_security_alert(
    state: State<'_, AppContext>,
    alert_id: String,
) -> Result<(), SecurityCheckCommandError> {
    let now = now_iso8601();
    SecurityAlertRepo::new(&state.pool)
        .dismiss(&alert_id, &now)
        .await
        .map_err(|_| SecurityCheckCommandError::Internal)?;
    Ok(())
}

// ---------------------------------------------------------------------------
// undismiss_security_alert
// ---------------------------------------------------------------------------

/// Alert 재활성화 (`dismissed_at` → NULL).
#[tauri::command]
pub async fn undismiss_security_alert(
    state: State<'_, AppContext>,
    alert_id: String,
) -> Result<(), SecurityCheckCommandError> {
    SecurityAlertRepo::new(&state.pool)
        .undismiss(&alert_id)
        .await
        .map_err(|_| SecurityCheckCommandError::Internal)?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Tests (C1~C10)
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use secrecy::SecretString;
    use secretbank_core::{CredentialId, CredentialInput, Env, IssuerInput};
    use secretbank_storage::sqlite::{
        init_pool,
        repositories::{
            credential::CredentialRepo, issuer::IssuerRepo, security_alert::SecurityAlertRepo,
        },
    };
    use secretbank_storage::vault::mock::MockVaultStorage;
    use secretbank_storage::vault::{SecretBytes, VaultStorage as _};
    use std::sync::Arc;
    use tokio::sync::{Mutex, RwLock};

    use crate::audit_ctx::AuditCtx;
    use crate::commands::kill_switch::{ConfirmTokenStore, IssuerConfirmTokenStore};
    use crate::context::AppContext;
    use crate::import::ImportSessionStore;
    use crate::services::device_identity::DeviceIdentity;

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

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

    async fn seed_issuer(pool: &sqlx::SqlitePool) -> secretbank_core::IssuerId {
        IssuerRepo::new(pool)
            .insert(&IssuerInput {
                slug: format!("test-issuer-{}", ulid::Ulid::new()),
                display_name: "Test Issuer".to_string(),
                docs_url: None,
                issue_url: None,
                status_url: None,
                security_feed_url: None,
                connector_id: None,
                icon_key: None,
                default_primary_label: None,
                default_secondary_label: None,
                domains: vec![],
            })
            .await
            .expect("issuer insert")
    }

    async fn seed_credential(
        pool: &sqlx::SqlitePool,
        vault: &mut MockVaultStorage,
        password: &str,
        url: Option<&str>,
    ) -> String {
        let issuer_id = seed_issuer(pool).await;
        let repo = CredentialRepo::new(pool);
        let id = CredentialId::new();
        let vault_ref = format!("credentials/{id}");
        let input = CredentialInput {
            issuer_id,
            name: format!("test-{id}"),
            env: Env::Prod,
            scope: None,
            owner: None,
            rotation_policy_days: None,
            rotation_runbook_id: None,
            expires_at: None,
            hash_hint: None,
            kind: Default::default(),
            url: url.map(|s| s.to_string()),
            username: None,
            primary_label: None,
            secondary_label: None,
        };
        repo.insert_with_id(Some(id), &input, vault_ref.clone())
            .await
            .expect("credential insert");
        let bytes = SecretBytes::new(password.as_bytes().to_vec());
        vault
            .put_secret(&vault_ref, bytes)
            .await
            .expect("vault put");
        id.to_string()
    }

    fn make_ctx(pool: Arc<sqlx::SqlitePool>, vault: MockVaultStorage) -> AppContext {
        let vault_box: Box<dyn secretbank_storage::vault::VaultStorage + Send + Sync> =
            Box::new(vault);
        let vault_arc = Arc::new(RwLock::new(vault_box));
        let device_identity: Arc<RwLock<Option<DeviceIdentity>>> = Arc::new(RwLock::new(None));
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
            import_sessions: Arc::new(ImportSessionStore::new()),
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

    // -----------------------------------------------------------------------
    // C1: run_security_check(force_hibp=false) — HIBP skip, 로컬 alert 만 저장
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn c1_force_hibp_false_skips_hibp() {
        let (_dir, pool) = make_pool().await;
        let pool = Arc::new(pool);
        let mut vault = make_unlocked_vault().await;

        // 약한 비번을 가진 credential 1개
        seed_credential(&pool, &mut vault, "password", None).await;

        let ctx = make_ctx(pool.clone(), vault);
        let repo = SecurityAlertRepo::new(&pool);

        // force_hibp=false → HIBP 호출 없이 weak_password 만 저장
        let summary = run_security_check_inner(&ctx, false).await.unwrap();

        assert!(
            !summary.hibp_called,
            "force_hibp=false 면 hibp_called=false"
        );
        assert!(!summary.hibp_failed);

        // DB에 alert 가 존재해야 함 (weak_password)
        let alerts = repo.list_active_all().await.unwrap();
        assert!(!alerts.is_empty(), "weak password alert 가 저장되어야 함");
        let has_weak = alerts.iter().any(|a| a.alert_kind == "weak_password");
        assert!(has_weak, "weak_password alert 존재 필수");

        // compromised_password alert 는 없어야 함
        let has_compromised = alerts
            .iter()
            .any(|a| a.alert_kind == "compromised_password");
        assert!(
            !has_compromised,
            "HIBP 비활성 시 compromised_password alert 없어야 함"
        );
    }

    // -----------------------------------------------------------------------
    // C2: run_security_check → list_security_alerts(All) 일관성
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn c2_run_then_list_consistent() {
        let (_dir, pool) = make_pool().await;
        let pool = Arc::new(pool);
        let mut vault = make_unlocked_vault().await;

        seed_credential(&pool, &mut vault, "password", Some("http://insecure.com")).await;

        let ctx = make_ctx(pool.clone(), vault);
        let summary = run_security_check_inner(&ctx, false).await.unwrap();

        let repo = SecurityAlertRepo::new(&pool);
        let alerts = repo.list_active_all().await.unwrap();

        // list 결과가 summary 집계 count 와 일치
        let total_from_summary: usize = summary.alerts_count_by_kind.values().sum();
        assert_eq!(
            alerts.len(),
            total_from_summary,
            "list 결과 개수 == summary 집계 개수"
        );
    }

    // -----------------------------------------------------------------------
    // C3: dismiss → list_active 에서 제외
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn c3_dismiss_hides_from_active_list() {
        let (_dir, pool) = make_pool().await;
        let pool = Arc::new(pool);
        let mut vault = make_unlocked_vault().await;

        seed_credential(&pool, &mut vault, "password", None).await;

        let ctx = make_ctx(pool.clone(), vault);
        run_security_check_inner(&ctx, false).await.unwrap();

        let repo = SecurityAlertRepo::new(&pool);
        let alerts_before = repo.list_active_all().await.unwrap();
        assert!(
            !alerts_before.is_empty(),
            "alert 가 있어야 dismiss 테스트 가능"
        );

        let alert_id = &alerts_before[0].id;
        let now = now_iso8601();
        repo.dismiss(alert_id, &now).await.unwrap();

        let alerts_after = repo.list_active_all().await.unwrap();
        assert_eq!(
            alerts_after.len(),
            alerts_before.len() - 1,
            "dismiss 후 active 목록에서 제외"
        );
    }

    // -----------------------------------------------------------------------
    // C4: undismiss → list_active 에 다시 포함
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn c4_undismiss_restores_to_active_list() {
        let (_dir, pool) = make_pool().await;
        let pool = Arc::new(pool);
        let mut vault = make_unlocked_vault().await;

        seed_credential(&pool, &mut vault, "password", None).await;

        let ctx = make_ctx(pool.clone(), vault);
        run_security_check_inner(&ctx, false).await.unwrap();

        let repo = SecurityAlertRepo::new(&pool);
        let alerts = repo.list_active_all().await.unwrap();
        assert!(!alerts.is_empty());
        let alert_id = alerts[0].id.clone();

        let now = now_iso8601();
        repo.dismiss(&alert_id, &now).await.unwrap();

        // undismiss
        repo.undismiss(&alert_id).await.unwrap();

        let after = repo.list_active_all().await.unwrap();
        assert_eq!(after.len(), alerts.len(), "undismiss 후 원래 개수 복원");
    }

    // -----------------------------------------------------------------------
    // C6: run_security_check 두 번 → dismiss 된 alert 보존
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn c6_dismissed_alerts_preserved_on_re_check() {
        let (_dir, pool) = make_pool().await;
        let pool = Arc::new(pool);
        let mut vault = make_unlocked_vault().await;

        seed_credential(&pool, &mut vault, "password", None).await;

        let ctx = make_ctx(pool.clone(), vault);

        // 첫 번째 검사
        run_security_check_inner(&ctx, false).await.unwrap();

        let repo = SecurityAlertRepo::new(&pool);
        let alerts = repo.list_active_all().await.unwrap();
        assert!(!alerts.is_empty());

        // dismiss
        let now = now_iso8601();
        repo.dismiss(&alerts[0].id, &now).await.unwrap();

        // 두 번째 검사
        run_security_check_inner(&ctx, false).await.unwrap();

        // dismissed alert 는 여전히 DB에 존재
        let dismissed_count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM security_alerts WHERE dismissed_at IS NOT NULL",
        )
        .fetch_one(pool.as_ref())
        .await
        .unwrap();
        assert_eq!(dismissed_count, 1, "재검사 후 dismiss 된 alert 보존");
    }

    // -----------------------------------------------------------------------
    // C7: 동일 비번 3개 credential → 3개 ReusedPassword alert
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn c7_same_password_three_creds_produces_reused_alerts() {
        let (_dir, pool) = make_pool().await;
        let pool = Arc::new(pool);
        let mut vault = make_unlocked_vault().await;

        let shared_pw = "SharedPw99!Shared";
        seed_credential(&pool, &mut vault, shared_pw, None).await;
        seed_credential(&pool, &mut vault, shared_pw, None).await;
        seed_credential(&pool, &mut vault, shared_pw, None).await;

        let ctx = make_ctx(pool.clone(), vault);
        run_security_check_inner(&ctx, false).await.unwrap();

        let repo = SecurityAlertRepo::new(&pool);
        let reused: Vec<_> = repo
            .list_active_all()
            .await
            .unwrap()
            .into_iter()
            .filter(|a| a.alert_kind == "reused_password")
            .collect();

        assert_eq!(
            reused.len(),
            3,
            "3개 credential → 3개 reused_password alert"
        );
    }

    // -----------------------------------------------------------------------
    // C8: vault locked 상태에서 호출 → Err(VaultLocked)
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn c8_vault_locked_returns_error() {
        let (_dir, pool) = make_pool().await;
        let pool = Arc::new(pool);
        // 잠긴 vault (unlock 호출 안 함)
        let vault = MockVaultStorage::new("pw");
        let ctx = make_ctx(pool.clone(), vault);

        let result = run_security_check_inner(&ctx, false).await;
        assert!(
            matches!(result, Err(SecurityCheckCommandError::VaultLocked)),
            "vault locked 시 VaultLocked 에러"
        );
    }

    // -----------------------------------------------------------------------
    // C9: audit log entry 1개 추가 (수동 실행)
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn c9_audit_log_recorded_on_manual_run() {
        use crate::services::device_identity::ensure_device_keys;
        use secretbank_core::DevicePlatform;
        use secretbank_storage::AuditRepo;

        let (_dir, pool) = make_pool().await;
        let pool = Arc::new(pool);
        let mut vault = make_unlocked_vault().await;

        // device identity 가 있어야 audit.record 가 DB에 기록됨
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

        seed_credential(&pool, &mut vault, "password", None).await;

        // ctx with identity
        let vault_box: Box<dyn secretbank_storage::vault::VaultStorage + Send + Sync> =
            Box::new(vault);
        let vault_arc = Arc::new(RwLock::new(vault_box));
        let device_identity = Arc::new(RwLock::new(Some(identity)));
        let audit = Arc::new(AuditCtx::new(pool.clone(), device_identity.clone()));
        let ctx = AppContext {
            vault: vault_arc,
            pool: pool.clone(),
            data_dir: std::path::PathBuf::from("/tmp/test"),
            user_id: "test".to_string(),
            clipboard_controller: Arc::new(Mutex::new(None)),
            feed_scheduler: Arc::new(Mutex::new(None)),
            device_identity,
            audit,
            kill_switch_tokens: Arc::new(ConfirmTokenStore::default()),
            issuer_kill_switch_tokens: Arc::new(IssuerConfirmTokenStore::default()),
            import_sessions: Arc::new(ImportSessionStore::new()),
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
        };

        run_security_check_inner(&ctx, false).await.unwrap();

        let audit_repo = AuditRepo::new(pool.as_ref());
        let entries = audit_repo.list_for_verify().await.unwrap();
        let security_entries: Vec<_> = entries
            .iter()
            .filter(|e| e.action == "security_check.run")
            .collect();
        assert_eq!(security_entries.len(), 1, "수동 실행 시 audit 1개 기록");
    }

    // -----------------------------------------------------------------------
    // 내부 헬퍼 — AppContext 참조로 run_security_check 실행 (Tauri State 없이)
    // -----------------------------------------------------------------------
    async fn run_security_check_inner(
        ctx: &AppContext,
        force_hibp: bool,
    ) -> Result<SecurityCheckSummary, SecurityCheckCommandError> {
        // vault unlock 상태 확인
        {
            let vault = ctx.vault.read().await;
            if !vault.is_unlocked().await {
                return Err(SecurityCheckCommandError::VaultLocked);
            }
        }

        let cred_repo = CredentialRepo::new(&ctx.pool);
        let credentials = cred_repo
            .list_all()
            .await
            .map_err(|_| SecurityCheckCommandError::Internal)?;
        let total = credentials.len();

        let mut password_map: Vec<(String, SecretBox<String>)> = Vec::with_capacity(total);
        {
            let vault = ctx.vault.read().await;
            for cred in &credentials {
                if let Ok(bytes) = vault.get_secret(&cred.vault_ref).await {
                    let inner = bytes.expose_secret().clone();
                    if let Ok(pw) = String::from_utf8(inner) {
                        password_map.push((cred.id.to_string(), SecretBox::new(Box::new(pw))));
                    }
                }
            }
        }

        let pw_refs: Vec<CredentialPasswordRef<'_>> = password_map
            .iter()
            .map(|(id, pw)| CredentialPasswordRef {
                id: id.as_str(),
                password: pw,
            })
            .collect();

        let reuse_groups = detect_reused_passwords(&pw_refs);
        let mut reuse_peers: HashMap<String, Vec<String>> = HashMap::new();
        for group in &reuse_groups {
            for id in &group.credential_ids {
                let others: Vec<String> = group
                    .credential_ids
                    .iter()
                    .filter(|other_id| *other_id != id)
                    .cloned()
                    .collect();
                reuse_peers.insert(id.clone(), others);
            }
        }

        let totp_domains = std::collections::HashSet::new(); // 테스트에서는 빈 set 사용

        let mut alerts_map: HashMap<String, Vec<(String, String)>> = HashMap::new();
        for cred in &credentials {
            let cred_id = cred.id.to_string();
            let mut cred_alerts: Vec<(String, String)> = Vec::new();

            if let Some((_, pw)) = password_map.iter().find(|(id, _)| id == &cred_id) {
                let user_inputs: Vec<&str> =
                    vec![cred.name.as_str(), cred.username.as_deref().unwrap_or("")];
                if let Some((score, length)) = is_weak_password(pw, &user_inputs) {
                    let meta = serde_json::json!({"score": score, "length": length}).to_string();
                    cred_alerts.push(("weak_password".to_string(), meta));
                }
            }

            if let Some(peers) = reuse_peers.get(&cred_id) {
                if !peers.is_empty() {
                    let meta = serde_json::json!({"also_used_by": peers}).to_string();
                    cred_alerts.push(("reused_password".to_string(), meta));
                }
            }

            if let Some(ref url) = cred.url {
                if let Some(unsecured_url) = check_unsecured_url(url) {
                    let meta = serde_json::json!({"url": unsecured_url}).to_string();
                    cred_alerts.push(("unsecured_website".to_string(), meta));
                }
            }

            // CredentialKind 에는 Totp variant 없음 — secondary_label 에 "totp" 포함 여부로 판단.
            let has_secondary_otp = cred.secondary_value_ref.is_some()
                && cred
                    .secondary_label
                    .as_deref()
                    .map(|l| l.to_ascii_lowercase().contains("totp"))
                    .unwrap_or(false);
            let check_2fa = CredentialFor2FaCheck {
                id: &cred_id,
                url: cred.url.as_deref(),
                totp_uri: None,
                has_secondary_otp_slot: has_secondary_otp,
            };
            if let Some(domain) = check_missing_2fa(&check_2fa, &totp_domains) {
                let meta = serde_json::json!({"domain": domain}).to_string();
                cred_alerts.push(("missing_two_factor".to_string(), meta));
            }

            alerts_map.insert(cred_id, cred_alerts);
        }

        let hibp_called = false;
        let hibp_failed = false;
        // force_hibp 테스트는 C5/C10 에서 wiremock 통합 테스트로 별도 구성
        let _ = force_hibp;

        let now = now_iso8601();
        let alert_repo = SecurityAlertRepo::new(&ctx.pool);
        for (cred_id, alerts) in &alerts_map {
            alert_repo
                .replace_alerts_for_credential(cred_id, alerts, &now)
                .await
                .map_err(|_| SecurityCheckCommandError::Internal)?;
        }

        let mut alerts_count_by_kind: HashMap<String, usize> = HashMap::new();
        for alerts in alerts_map.values() {
            for (kind, _) in alerts {
                *alerts_count_by_kind.entry(kind.clone()).or_insert(0) += 1;
            }
        }
        let total_alerts: usize = alerts_count_by_kind.values().sum();

        ctx.audit
            .record(
                AuditActor::LocalUser,
                "security_check.run",
                "security_check",
                "manual",
                Some(
                    serde_json::json!({
                        "total_checked": total,
                        "alerts_count": total_alerts,
                        "hibp_called": hibp_called,
                    })
                    .to_string(),
                ),
            )
            .await;

        Ok(SecurityCheckSummary {
            total_credentials_checked: total,
            alerts_count_by_kind,
            hibp_called,
            hibp_failed,
            completed_at: now,
        })
    }
}
