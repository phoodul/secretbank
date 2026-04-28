//! M9 Phase D-2 — `db:changed` Tauri 이벤트 emitter.
//!
//! 모든 mutating 커맨드 (credential / issuer / project / deployment / usage /
//! settings 의 create / update / delete) 가 SQLite 를 변경한 직후 본 헬퍼를
//! 호출한다. 프런트엔드의 `SyncProvider` 가 이 이벤트를 받아 Y.Doc 의 해당
//! Y.Map 을 갱신한다 (Phase D-3 의 origin guard 로 무한 루프 방지).
//!
//! Wire shape (`db:changed` 이벤트 payload — JSON):
//! ```json
//! { "entity": "credential", "op": "upsert", "id": "crd_01HZZZ..." }
//! ```
//!
//! - `op = "upsert"` 는 create 와 update 를 합친다 — 프런트는 `id` 로
//!   다시 로드 (CRDT semantics 에 맞음).
//! - `op = "delete"` 는 Y.Map 에서 키 제거.
//!
//! IncidentEventEmitter 패턴과 동일 — production 은 `TauriDbChangeEmitter`,
//! 테스트는 `NoopDbChangeEmitter`.

use std::sync::Arc;

use serde::Serialize;

// ---------------------------------------------------------------------------
// Wire types
// ---------------------------------------------------------------------------

/// Sync 화이트리스트 6 entity 와 1:1 일치. 프런트 `mapping.ts::SYNC_ENTITIES`
/// 와도 일치해야 한다 (변경 시 wire-format 회귀 부서짐).
#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum DbChangeEntity {
    Credential,
    Issuer,
    Project,
    Deployment,
    Usage,
    Settings,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum DbChangeOp {
    /// `create` 와 `update` 를 합친 의미 — Y.Map 의 set 으로 propagate.
    Upsert,
    /// Y.Map 의 delete 로 propagate.
    Delete,
}

#[derive(Debug, Clone, Serialize)]
pub struct DbChangePayload {
    pub entity: DbChangeEntity,
    pub op: DbChangeOp,
    pub id: String,
}

impl DbChangePayload {
    pub fn upsert(entity: DbChangeEntity, id: impl Into<String>) -> Self {
        Self {
            entity,
            op: DbChangeOp::Upsert,
            id: id.into(),
        }
    }

    pub fn delete(entity: DbChangeEntity, id: impl Into<String>) -> Self {
        Self {
            entity,
            op: DbChangeOp::Delete,
            id: id.into(),
        }
    }
}

// ---------------------------------------------------------------------------
// Trait abstraction (test-friendly)
// ---------------------------------------------------------------------------

/// 모든 mutating 커맨드가 호출하는 emit 인터페이스.
///
/// best-effort: emit 실패는 warn-log 후 swallow — 사용자의 mutating 작업은
/// 성공으로 간주된다 (sync 가 일시 끊겨도 SQLite 는 일관성 유지).
pub trait DbChangeEmitter: Send + Sync + 'static {
    fn emit_db_changed(&self, payload: &DbChangePayload);
}

/// 프로덕션 — Tauri `AppHandle` 로 전체 창에 `db:changed` 이벤트 emit.
pub struct TauriDbChangeEmitter {
    app_handle: tauri::AppHandle,
}

impl TauriDbChangeEmitter {
    pub fn new(app_handle: tauri::AppHandle) -> Self {
        Self { app_handle }
    }
}

impl DbChangeEmitter for TauriDbChangeEmitter {
    fn emit_db_changed(&self, payload: &DbChangePayload) {
        use tauri::Emitter as _;
        if let Err(e) = self.app_handle.emit("db:changed", payload) {
            tracing::warn!(error = %e, "db:changed 이벤트 방출 실패");
        }
    }
}

/// 테스트 / AppContext 기본값 — emit 안 함.
#[derive(Default)]
pub struct NoopDbChangeEmitter;

impl DbChangeEmitter for NoopDbChangeEmitter {
    fn emit_db_changed(&self, _payload: &DbChangePayload) {}
}

/// `Arc<dyn DbChangeEmitter>` 단축 — AppContext field 타입.
pub type SharedDbChangeEmitter = Arc<dyn DbChangeEmitter>;

/// AppContext 기본값 헬퍼.
pub fn noop_emitter() -> SharedDbChangeEmitter {
    Arc::new(NoopDbChangeEmitter)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    #[test]
    fn upsert_serialization_matches_wire_shape() {
        let payload = DbChangePayload::upsert(DbChangeEntity::Credential, "crd_01");
        let s = serde_json::to_string(&payload).unwrap();
        assert_eq!(
            s,
            r#"{"entity":"credential","op":"upsert","id":"crd_01"}"#
        );
    }

    #[test]
    fn delete_serialization_matches_wire_shape() {
        let payload = DbChangePayload::delete(DbChangeEntity::Settings, "key");
        let s = serde_json::to_string(&payload).unwrap();
        assert_eq!(s, r#"{"entity":"settings","op":"delete","id":"key"}"#);
    }

    #[test]
    fn all_entities_serialize_to_lowercase_singular() {
        for (e, expected) in [
            (DbChangeEntity::Credential, "credential"),
            (DbChangeEntity::Issuer, "issuer"),
            (DbChangeEntity::Project, "project"),
            (DbChangeEntity::Deployment, "deployment"),
            (DbChangeEntity::Usage, "usage"),
            (DbChangeEntity::Settings, "settings"),
        ] {
            let payload = DbChangePayload::upsert(e, "x");
            let s = serde_json::to_string(&payload).unwrap();
            assert!(
                s.contains(&format!(r#""entity":"{expected}""#)),
                "entity {expected} should serialize to lowercase singular, got {s}"
            );
        }
    }

    #[test]
    fn noop_emitter_does_not_panic() {
        let e = NoopDbChangeEmitter;
        e.emit_db_changed(&DbChangePayload::upsert(DbChangeEntity::Credential, "x"));
        e.emit_db_changed(&DbChangePayload::delete(DbChangeEntity::Usage, "y"));
    }

    /// 테스트용 emitter — 받은 payload 를 캡처해서 검증.
    #[derive(Default)]
    struct CapturingEmitter {
        captured: Mutex<Vec<DbChangePayload>>,
    }
    impl DbChangeEmitter for CapturingEmitter {
        fn emit_db_changed(&self, payload: &DbChangePayload) {
            self.captured.lock().unwrap().push(payload.clone());
        }
    }

    #[test]
    fn capturing_emitter_records_calls_in_order() {
        let e = CapturingEmitter::default();
        e.emit_db_changed(&DbChangePayload::upsert(DbChangeEntity::Project, "prj_1"));
        e.emit_db_changed(&DbChangePayload::delete(DbChangeEntity::Project, "prj_1"));
        let got = e.captured.lock().unwrap();
        assert_eq!(got.len(), 2);
        assert_eq!(got[0].op, DbChangeOp::Upsert);
        assert_eq!(got[1].op, DbChangeOp::Delete);
        assert_eq!(got[0].id, "prj_1");
    }
}
