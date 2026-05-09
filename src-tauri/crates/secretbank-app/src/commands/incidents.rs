//! Tauri 커맨드 — Incident Feed (T055/T056, T-24-E-G2-1).
//!
//! incident_list, incident_dismiss, incident_matches_for_credential,
//! incident_feed_refresh, incident_matches_for_host 5개를 제공한다.
//!
//! T056 변경: `incident_list` 반환 타입이 `Vec<Incident>` → `Vec<IncidentListEntry>` 로
//! 변경되었다. `IncidentListEntry` 는 incident + 연결된 credential 정보를 포함한다.
//!
//! T-24-E-G2-1: `incident_matches_for_host` — credential 컨텍스트 없이 host 이름만으로
//! severity ≥ MEDIUM 인 incident 를 조회한다. extension content-script banner 용.

use serde::Serialize;
use tauri::State;
use thiserror::Error;

use secretbank_audit::AuditActor;
use secretbank_core::{CredentialId, IncidentFilter, IncidentId};
use secretbank_feeds::{match_incidents_by_host, HostIncidentMatch};
use secretbank_storage::sqlite::repositories::incident::{IncidentListEntry, IncidentRepo};
use secretbank_storage::sqlite::repositories::issuer::IssuerRepo;

use crate::context::AppContext;

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

#[derive(Debug, Error, Serialize)]
#[serde(tag = "code", rename_all = "snake_case")]
pub enum IncidentCommandError {
    #[error("incident not found")]
    NotFound,

    #[error("scheduler is not initialised")]
    SchedulerUnavailable,

    #[error("scheduler error: {message}")]
    Scheduler { message: String },

    #[error("internal: {message}")]
    Internal { message: String },
}

impl From<secretbank_storage::sqlite::StorageError> for IncidentCommandError {
    fn from(e: secretbank_storage::sqlite::StorageError) -> Self {
        Self::Internal {
            message: e.to_string(),
        }
    }
}

impl From<crate::services::feed_scheduler::FeedSchedulerError> for IncidentCommandError {
    fn from(e: crate::services::feed_scheduler::FeedSchedulerError) -> Self {
        Self::Scheduler {
            message: e.to_string(),
        }
    }
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

/// Incident 목록을 필터링하여 반환한다.
///
/// `filter` 가 None 이면 기본 필터(dismissed=false, 소스/심각도/issuer 무제한) 적용.
///
/// 반환: `Vec<IncidentListEntry>` — 각 항목은 `incident` + `matches` 배열을 포함한다.
/// `matches` 에는 연결된 credential 이름/issuer 정보가 포함되어 있어 UI 에서 바로 사용 가능.
#[tauri::command]
pub async fn incident_list(
    filter: Option<IncidentFilter>,
    state: State<'_, AppContext>,
) -> Result<Vec<IncidentListEntry>, IncidentCommandError> {
    let filter = filter.unwrap_or_default();
    let repo = IncidentRepo::new(&state.pool);
    Ok(repo.list_with_matches(&filter).await?)
}

/// `incident_id` 에 해당하는 모든 활성 match 를 dismissed 처리한다.
///
/// 반환값 = 업데이트된 row 수 (이미 모두 dismissed 이면 0).
#[tauri::command]
pub async fn incident_dismiss(
    id: IncidentId,
    state: State<'_, AppContext>,
) -> Result<u64, IncidentCommandError> {
    let repo = IncidentRepo::new(&state.pool);
    let count = repo.dismiss_matches_for_incident(id).await?;

    state
        .audit
        .record(
            AuditActor::LocalUser,
            "incident.dismiss",
            "incident",
            id.to_string(),
            None,
        )
        .await;

    Ok(count)
}

/// 특정 credential 에 연결된 Incident 목록을 반환한다 (active + dismissed 모두).
///
/// Credential Detail 패널에서 "이 키에 영향을 주는 이슈" 목록으로 사용.
/// 반환: `Vec<IncidentListEntry>` — matches 배열에는 이 credential 의 match만 포함.
#[tauri::command]
pub async fn incident_matches_for_credential(
    credential_id: CredentialId,
    state: State<'_, AppContext>,
) -> Result<Vec<IncidentListEntry>, IncidentCommandError> {
    let repo = IncidentRepo::new(&state.pool);
    Ok(repo
        .list_incidents_with_matches_for_credential(&credential_id)
        .await?)
}

// ---------------------------------------------------------------------------
// T-24-E-G2-1: host-only incident lookup (severity ≥ MEDIUM)
// ---------------------------------------------------------------------------

/// Extension content-script banner 용 응답 DTO.
///
/// `HostIncidentMatch` 를 Tauri IPC 직렬화가 가능한 형태로 래핑한다.
/// `IncidentSeverity` 는 문자열로 직렬화된다.
#[derive(Debug, Serialize)]
pub struct IncidentMatchSummary {
    pub incident_id: String,
    pub severity: String,
    pub title: String,
    pub published_at: Option<i64>,
    pub source: String,
}

impl From<HostIncidentMatch> for IncidentMatchSummary {
    fn from(m: HostIncidentMatch) -> Self {
        use secretbank_core::models::incident::IncidentSeverity;

        let severity_str = match m.severity {
            IncidentSeverity::Info => "info",
            IncidentSeverity::Low => "low",
            IncidentSeverity::Medium => "medium",
            IncidentSeverity::High => "high",
            IncidentSeverity::Critical => "critical",
        };

        Self {
            incident_id: m.incident_id.to_string(),
            severity: severity_str.to_string(),
            title: m.title,
            published_at: m.published_at,
            source: m.source,
        }
    }
}

/// 특정 host 에 연관된 severity ≥ MEDIUM incident 목록을 반환한다.
///
/// extension content-script 가 현재 페이지의 host 를 전달하면,
/// issuer.domains[] 및 incident.domain 필드와 서브도메인-safe 매칭을 수행하여
/// 해당 host 와 관련된 보안 사건을 반환한다.
///
/// credential 컨텍스트 없음 — 외부 사이트 방문 시 사용 가능.
/// severity LOW / INFO 는 노이즈로 제거한다 (matcher 내부 필터링).
/// audit log: EXT_INCIDENT_LOOKUP 1건 기록.
///
/// 반환: `Vec<IncidentMatchSummary>` — 최신 순(detected_at DESC).
#[tauri::command]
pub async fn incident_matches_for_host(
    host: String,
    state: State<'_, AppContext>,
) -> Result<Vec<IncidentMatchSummary>, IncidentCommandError> {
    use secretbank_audit::actions::EXT_INCIDENT_LOOKUP;
    use secretbank_storage::sqlite::repositories::incident::IncidentRepo;

    // host 빈 문자열 조기 반환 — audit log 도 생략.
    if host.trim().is_empty() {
        return Ok(Vec::new());
    }

    let incident_repo = IncidentRepo::new(&state.pool);
    let issuer_repo = IssuerRepo::new(&state.pool);

    // 전체 active incident 및 issuer 로드 (host 매칭에 필요).
    // include_dismissed=false → dismissed 처리된 incident 제외.
    let filter = IncidentFilter {
        include_dismissed: false,
        ..Default::default()
    };
    let incident_entries = incident_repo.list_with_matches(&filter).await?;
    let incidents: Vec<_> = incident_entries
        .into_iter()
        .map(|entry| entry.incident)
        .collect();

    let issuers = issuer_repo
        .list()
        .await
        .map_err(|e| IncidentCommandError::Internal {
            message: e.to_string(),
        })?;

    // host-only 매칭 (severity ≥ MEDIUM 필터는 matcher 내부에서 처리).
    let matches = match_incidents_by_host(&host, &incidents, &issuers);

    // audit log (best-effort — 실패해도 응답은 반환).
    state
        .audit
        .record(
            AuditActor::LocalUser,
            EXT_INCIDENT_LOOKUP,
            "host",
            host.clone(),
            None,
        )
        .await;

    Ok(matches
        .into_iter()
        .map(IncidentMatchSummary::from)
        .collect())
}

/// 스케줄러를 즉시 1회 폴링하고 저장된 incident 개수를 반환한다.
///
/// 앱 시작 후 스케줄러가 초기화되기 전에 호출하면 `SchedulerUnavailable` 에러.
#[tauri::command]
pub async fn incident_feed_refresh(
    state: State<'_, AppContext>,
) -> Result<usize, IncidentCommandError> {
    let count = {
        let guard = state.feed_scheduler.lock().await;
        let handle = guard
            .as_ref()
            .ok_or(IncidentCommandError::SchedulerUnavailable)?;
        handle.trigger_once().await?
    };

    state
        .audit
        .record(
            AuditActor::LocalUser,
            "incident.feed_refresh",
            "incident",
            "feed",
            None,
        )
        .await;

    Ok(count)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use secretbank_storage::sqlite::StorageError;

    // -----------------------------------------------------------------------
    // T1: StorageError → IncidentCommandError::Internal
    // -----------------------------------------------------------------------
    #[test]
    fn test_error_conversion_from_storage_error() {
        let storage_err = StorageError::Parse("bad data".to_owned());
        let cmd_err = IncidentCommandError::from(storage_err);
        match cmd_err {
            IncidentCommandError::Internal { message } => {
                assert!(message.contains("bad data"));
            }
            other => panic!("예상과 다른 variant: {other:?}"),
        }
    }

    // -----------------------------------------------------------------------
    // T2: FeedSchedulerError → IncidentCommandError::Scheduler
    // -----------------------------------------------------------------------
    #[test]
    fn test_error_conversion_from_scheduler_error() {
        use crate::services::feed_scheduler::FeedSchedulerError;
        use secretbank_feeds::NvdError;

        let sched_err = FeedSchedulerError::Nvd(NvdError::RangeTooLarge { days: 200 });
        let cmd_err = IncidentCommandError::from(sched_err);
        match cmd_err {
            IncidentCommandError::Scheduler { message } => {
                assert!(!message.is_empty());
            }
            other => panic!("예상과 다른 variant: {other:?}"),
        }
    }

    // -----------------------------------------------------------------------
    // T3: serde tag + snake_case — { "code": "not_found" }
    // -----------------------------------------------------------------------
    #[test]
    fn test_error_serde_tag_snake_case() {
        let err = IncidentCommandError::NotFound;
        let val = serde_json::to_value(&err).unwrap();
        assert_eq!(val["code"], "not_found");
    }

    // -----------------------------------------------------------------------
    // T4: IncidentMatchSummary::from — severity 문자열 매핑
    // -----------------------------------------------------------------------
    #[test]
    fn test_incident_match_summary_severity_mapping() {
        use secretbank_core::id::IncidentId;
        use secretbank_core::models::incident::IncidentSeverity;
        use secretbank_feeds::HostIncidentMatch;

        let cases = [
            (IncidentSeverity::Info, "info"),
            (IncidentSeverity::Low, "low"),
            (IncidentSeverity::Medium, "medium"),
            (IncidentSeverity::High, "high"),
            (IncidentSeverity::Critical, "critical"),
        ];

        for (sev, expected_str) in cases {
            let m = HostIncidentMatch {
                incident_id: IncidentId::new(),
                severity: sev,
                title: "test title".to_string(),
                published_at: None,
                source: "nvd".to_string(),
            };
            let summary = IncidentMatchSummary::from(m);
            assert_eq!(
                summary.severity, expected_str,
                "severity {sev:?} 는 '{expected_str}' 로 직렬화돼야 한다"
            );
        }
    }

    // -----------------------------------------------------------------------
    // T5: IncidentMatchSummary — published_at ms 와 source 필드 보존
    // -----------------------------------------------------------------------
    #[test]
    fn test_incident_match_summary_fields_preserved() {
        use secretbank_core::id::IncidentId;
        use secretbank_core::models::incident::IncidentSeverity;
        use secretbank_feeds::HostIncidentMatch;

        let id = IncidentId::new();
        let m = HostIncidentMatch {
            incident_id: id,
            severity: IncidentSeverity::High,
            title: "OpenAI breach".to_string(),
            published_at: Some(1_735_000_000_000),
            source: "ghsa".to_string(),
        };

        let summary = IncidentMatchSummary::from(m);
        assert_eq!(summary.incident_id, id.to_string());
        assert_eq!(summary.title, "OpenAI breach");
        assert_eq!(summary.published_at, Some(1_735_000_000_000));
        assert_eq!(summary.source, "ghsa");
    }

    // -----------------------------------------------------------------------
    // T6: match_incidents_by_host — severity LOW/INFO 제외 확인 (unit)
    // -----------------------------------------------------------------------
    #[test]
    fn test_host_lookup_excludes_low_severity() {
        use secretbank_core::id::{IncidentId, IssuerId};
        use secretbank_core::models::incident::{Incident, IncidentSeverity, IncidentSource};
        use secretbank_core::models::issuer::Issuer;
        use secretbank_feeds::match_incidents_by_host;
        use time::OffsetDateTime;

        let now = OffsetDateTime::from_unix_timestamp(1_735_000_000).unwrap();

        let make_incident = |sev: IncidentSeverity, domain: Option<&str>| Incident {
            id: IncidentId::new(),
            source: IncidentSource::Nvd,
            source_id: "test".to_string(),
            issuer_id: None,
            severity: sev,
            title: "test incident".to_string(),
            body: None,
            url: None,
            domain: domain.map(|s| s.to_string()),
            detected_at: now,
            published_at: None,
        };

        let make_issuer = |domains: Vec<&str>| {
            let now2 = OffsetDateTime::from_unix_timestamp(1_735_000_000).unwrap();
            Issuer {
                id: IssuerId::new(),
                slug: "acme".to_string(),
                display_name: "Acme".to_string(),
                docs_url: None,
                issue_url: None,
                status_url: None,
                security_feed_url: None,
                connector_id: None,
                icon_key: None,
                default_primary_label: None,
                default_secondary_label: None,
                domains: domains.into_iter().map(|s| s.to_string()).collect(),
                created_at: now2,
                updated_at: now2,
            }
        };

        let inc_low = make_incident(IncidentSeverity::Low, Some("acme.com"));
        let inc_info = make_incident(IncidentSeverity::Info, Some("acme.com"));
        let inc_medium = make_incident(IncidentSeverity::Medium, Some("acme.com"));
        let inc_high = make_incident(IncidentSeverity::High, Some("acme.com"));

        let issuer = make_issuer(vec!["acme.com"]);
        let results = match_incidents_by_host(
            "acme.com",
            &[inc_low, inc_info, inc_medium.clone(), inc_high.clone()],
            &[issuer],
        );

        assert_eq!(results.len(), 2, "MEDIUM, HIGH 만 반환해야 한다");
        let ids: Vec<_> = results.iter().map(|r| r.incident_id).collect();
        assert!(ids.contains(&inc_medium.id));
        assert!(ids.contains(&inc_high.id));
    }

    // -----------------------------------------------------------------------
    // T7: EXT_INCIDENT_LOOKUP 상수값 검증
    // -----------------------------------------------------------------------
    #[test]
    fn test_ext_incident_lookup_action_constant() {
        use secretbank_audit::actions::EXT_INCIDENT_LOOKUP;
        assert_eq!(EXT_INCIDENT_LOOKUP, "extension.incident.lookup");
    }
}
