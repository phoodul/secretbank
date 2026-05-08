//! CSV import infrastructure for the Tauri backend.
//!
//! # prepare / commit 분리
//!
//! `DetectedFromCsv.value` 는 `SecretBox<String>` 평문이므로 **frontend 로 직렬화 금지**.
//! 따라서 import 흐름을 두 단계로 나눈다.
//!
//! 1. **prepare** (`import_csv_prepare` command) — CSV 파싱 + `rows_to_detected` 변환 후
//!    평문을 `ImportSessionStore` 에 보관. frontend 에는 값 없는 preview DTO 만 반환.
//! 2. **commit** (`import_csv_commit` command, 2-3-a-4) — session_id + 선택된 row index →
//!    vault 저장. 평문은 commit 시점에만 vault 로 이동.
//!
//! `ImportSession` 이 drop 되면 내부 `SecretBox<String>` 들이 자동 zeroize (secrecy 보장).

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use secretbank_connectors::import::csv_google::{CsvFormat, ImportWarnings};
use secretbank_connectors::import::to_detected::DetectedFromCsv;

/// 기본 세션 TTL: 5분.
pub const DEFAULT_SESSION_TTL: Duration = Duration::from_secs(5 * 60);

// ---------------------------------------------------------------------------
// ImportSession
// ---------------------------------------------------------------------------

/// 평문 credential 행을 TTL 만기 전까지 보관하는 단기 세션.
///
/// `Drop` 시 내부 `SecretBox<String>` 들이 자동 zeroize 된다 (secrecy crate 보장).
pub struct ImportSession {
    pub id: String,
    pub created_at: Instant,
    pub ttl: Duration,
    pub format: CsvFormat,
    pub rows: Vec<DetectedFromCsv>,
    pub warnings: ImportWarnings,
}

impl ImportSession {
    /// 세션 만료 여부.
    pub fn is_expired(&self) -> bool {
        self.created_at.elapsed() >= self.ttl
    }
}

// ---------------------------------------------------------------------------
// ImportSessionStore
// ---------------------------------------------------------------------------

/// 짧은 수명의 import 세션을 in-memory 로 보관한다.
///
/// - 세션 ID: 16바이트 random hex (ConfirmTokenStore 패턴 동일).
/// - TTL: `DEFAULT_SESSION_TTL` (5분). `new_with_ttl` 로 테스트에서 단축 가능.
/// - TTL 만료 세션은 `insert` / `take` 시 lazy sweep.
/// - `Mutex<HashMap<…>>` 사용 — Tauri command 는 async 이지만 세션 저장소 자체는
///   짧은 동기 critical section 으로 충분.
pub struct ImportSessionStore {
    inner: Mutex<HashMap<String, ImportSession>>,
    ttl: Duration,
}

impl ImportSessionStore {
    pub fn new() -> Self {
        Self::new_with_ttl(DEFAULT_SESSION_TTL)
    }

    /// 테스트에서 TTL 을 단축해 expiry 를 빠르게 검증하기 위한 생성자.
    pub fn new_with_ttl(ttl: Duration) -> Self {
        Self {
            inner: Mutex::new(HashMap::new()),
            ttl,
        }
    }

    /// `session` 을 저장하고 session_id 를 반환한다.
    ///
    /// 저장 전 만료된 세션을 sweep.
    pub fn insert(
        &self,
        rows: Vec<DetectedFromCsv>,
        format: CsvFormat,
        warnings: ImportWarnings,
    ) -> String {
        let id = Self::new_id();
        let session = ImportSession {
            id: id.clone(),
            created_at: Instant::now(),
            ttl: self.ttl,
            format,
            rows,
            warnings,
        };

        let mut guard = self.inner.lock().expect("import session lock poisoned");
        self.sweep_expired_locked(&mut guard);
        guard.insert(id.clone(), session);
        id
    }

    /// 세션을 꺼내서 반환한다 (one-shot — 이후 같은 ID 로 재호출 시 `None`).
    ///
    /// 호출 전 만료 세션 sweep.
    pub fn take(&self, id: &str) -> Option<ImportSession> {
        let mut guard = self.inner.lock().expect("import session lock poisoned");
        self.sweep_expired_locked(&mut guard);
        guard.remove(id).filter(|s| !s.is_expired())
    }

    /// 만료된 세션만 삭제 (lazy GC). 호출 시 이미 lock 을 보유하고 있어야 한다.
    fn sweep_expired_locked(&self, map: &mut HashMap<String, ImportSession>) {
        map.retain(|_, s| !s.is_expired());
    }

    /// 16 바이트 random hex session ID 생성.
    fn new_id() -> String {
        use rand::Rng;
        let bytes: [u8; 16] = rand::thread_rng().gen();
        bytes.iter().map(|b| format!("{:02x}", b)).collect()
    }
}

impl Default for ImportSessionStore {
    fn default() -> Self {
        Self::new()
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use secrecy::SecretBox;
    use secretbank_connectors::import::csv_google::{CsvFormat, ImportWarnings};
    use secretbank_connectors::import::to_detected::{CredentialKind, DetectedFromCsv};

    use super::ImportSessionStore;

    // -----------------------------------------------------------------------
    // 헬퍼
    // -----------------------------------------------------------------------

    fn make_row(url: &str, pw: &str) -> DetectedFromCsv {
        DetectedFromCsv {
            url: url.to_owned(),
            host: None,
            matched_issuer_slug: None,
            name: url.to_owned(),
            username: None,
            note: None,
            kind: CredentialKind::Password,
            env: "prod".to_owned(),
            value: SecretBox::new(Box::new(pw.to_owned())),
            value_hint: pw
                .chars()
                .rev()
                .take(4)
                .collect::<String>()
                .chars()
                .rev()
                .collect(),
        }
    }

    fn make_rows(n: usize) -> Vec<DetectedFromCsv> {
        (0..n)
            .map(|i| make_row(&format!("https://example.com/{i}"), &format!("pass{i:04}")))
            .collect()
    }

    // -----------------------------------------------------------------------
    // T1: insert → take 으로 같은 세션 회수 + take 후 None
    // -----------------------------------------------------------------------
    #[test]
    fn session_store_inserts_and_takes() {
        let store = ImportSessionStore::new();
        let rows = make_rows(2);
        let id = store.insert(rows, CsvFormat::ChromeBrave, ImportWarnings::default());

        assert!(!id.is_empty(), "session ID must not be empty");

        let session = store.take(&id);
        assert!(session.is_some(), "first take must return Some");
        let s = session.unwrap();
        assert_eq!(s.rows.len(), 2);
        assert_eq!(s.format, CsvFormat::ChromeBrave);

        // 두 번째 take → None (one-shot)
        let second = store.take(&id);
        assert!(second.is_none(), "second take must return None (one-shot)");
    }

    // -----------------------------------------------------------------------
    // T2: TTL 만료된 세션 → sweep 후 None
    // -----------------------------------------------------------------------
    #[test]
    fn session_store_ttl_expiry() {
        // 매우 짧은 TTL (1ms) 로 생성
        let store = ImportSessionStore::new_with_ttl(Duration::from_millis(1));
        let id = store.insert(make_rows(1), CsvFormat::Edge, ImportWarnings::default());

        // 2ms 대기 (std::thread::sleep — 동기 테스트)
        std::thread::sleep(Duration::from_millis(5));

        let session = store.take(&id);
        assert!(session.is_none(), "expired session must return None");
    }

    // -----------------------------------------------------------------------
    // T3: 다른 ID 로 take → None
    // -----------------------------------------------------------------------
    #[test]
    fn session_store_take_unknown_id_returns_none() {
        let store = ImportSessionStore::new();
        let _id = store.insert(
            make_rows(1),
            CsvFormat::ChromeBrave,
            ImportWarnings::default(),
        );
        let result = store.take("nonexistent-id");
        assert!(result.is_none(), "unknown ID must return None");
    }

    // -----------------------------------------------------------------------
    // T4: SecretBox drop 시 panic 없음 (zeroize sanity)
    // -----------------------------------------------------------------------
    #[test]
    fn session_store_drop_does_not_panic() {
        let store = ImportSessionStore::new();
        let rows = make_rows(3);
        let id = store.insert(rows, CsvFormat::ChromeBrave, ImportWarnings::default());
        let session = store.take(&id).expect("must exist");
        // session 을 명시적으로 drop — SecretBox zeroize 발생
        drop(session);
        // 여기까지 panic 없으면 통과
    }

    // -----------------------------------------------------------------------
    // T5: session ID 는 16 바이트 hex (32자)
    // -----------------------------------------------------------------------
    #[test]
    fn session_id_is_32_hex_chars() {
        let store = ImportSessionStore::new();
        let id = store.insert(
            make_rows(1),
            CsvFormat::ChromeBrave,
            ImportWarnings::default(),
        );
        assert_eq!(id.len(), 32, "session ID must be 32 hex chars");
        assert!(
            id.chars().all(|c| c.is_ascii_hexdigit()),
            "session ID must be lowercase hex"
        );
    }

    // -----------------------------------------------------------------------
    // T6: 만료된 세션은 insert 시 sweep 된다
    // -----------------------------------------------------------------------
    #[test]
    fn sweep_removes_expired_on_insert() {
        let store = ImportSessionStore::new_with_ttl(Duration::from_millis(1));
        let id1 = store.insert(
            make_rows(1),
            CsvFormat::ChromeBrave,
            ImportWarnings::default(),
        );
        std::thread::sleep(Duration::from_millis(5));

        // 새 insert 가 sweep 트리거
        let _id2 = store.insert(
            make_rows(1),
            CsvFormat::ChromeBrave,
            ImportWarnings::default(),
        );

        // id1 은 이제 만료로 인해 take 불가
        assert!(
            store.take(&id1).is_none(),
            "expired session must be None after sweep"
        );
    }
}
