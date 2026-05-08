//! Tauri 커맨드 — Incident Feed (T055/T056).
//!
//! incident_list, incident_dismiss, incident_matches_for_credential,
//! incident_feed_refresh 4개를 제공한다.
//!
//! T056 변경: `incident_list` 반환 타입이 `Vec<Incident>` → `Vec<IncidentListEntry>` 로
//! 변경되었다. `IncidentListEntry` 는 incident + 연결된 credential 정보를 포함한다.

use serde::Serialize;
use tauri::State;
use thiserror::Error;

use secretbank_audit::AuditActor;
use secretbank_core::{CredentialId, IncidentFilter, IncidentId};
use secretbank_storage::sqlite::repositories::incident::{IncidentListEntry, IncidentRepo};

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
}
