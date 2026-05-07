//! SecurityAlertRepo — Watchtower 스타일 보안 알림 저장소.
//!
//! `security_alerts` 테이블과 `twofa_directory_cache` 테이블을 각각
//! `SecurityAlertRepo` / `TwoFaDirectoryCacheRepo` 로 관리한다.
//!
//! # 설계 원칙
//! - `alert_meta` 는 평문 JSON (count/score/domain). 비번·username 등 비밀 정보 미포함 (GATE 1-7).
//! - `dismissed_at` NULL = 활성. 재검사 시 dismissed 항목은 보존 (`replace_alerts_for_credential`).
//! - 모든 ID 는 ULID.

use serde::{Deserialize, Serialize};
use sqlx::Row;
use ulid::Ulid;

use crate::sqlite::{SqlitePool, StorageError};

// ---------------------------------------------------------------------------
// SecurityAlertRecord
// ---------------------------------------------------------------------------

/// `security_alerts` 테이블 한 행.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SecurityAlertRecord {
    pub id: String,
    pub credential_id: String,
    /// "compromised_password" | "weak_password" | "reused_password" |
    /// "missing_two_factor" | "unsecured_website"
    pub alert_kind: String,
    /// JSON 문자열 — count/score/domain 등 평문 메타데이터. 비번 미포함.
    pub alert_meta: String,
    /// ISO8601, None = 활성
    pub dismissed_at: Option<String>,
    /// ISO8601 — 마지막 검사 시각
    pub checked_at: String,
}

// ---------------------------------------------------------------------------
// SecurityAlertRepo
// ---------------------------------------------------------------------------

pub struct SecurityAlertRepo<'a> {
    pool: &'a SqlitePool,
}

impl<'a> SecurityAlertRepo<'a> {
    pub fn new(pool: &'a SqlitePool) -> Self {
        Self { pool }
    }

    /// 신규 alert 삽입. ID 는 ULID 자동 생성.
    ///
    /// 반환값: 생성된 alert id (ULID 문자열).
    pub async fn insert(
        &self,
        credential_id: &str,
        alert_kind: &str,
        alert_meta: &str,
        checked_at: &str,
    ) -> Result<String, StorageError> {
        let id = Ulid::new().to_string();
        sqlx::query(
            r#"INSERT INTO security_alerts (id, credential_id, alert_kind, alert_meta, checked_at)
               VALUES (?, ?, ?, ?, ?)"#,
        )
        .bind(&id)
        .bind(credential_id)
        .bind(alert_kind)
        .bind(alert_meta)
        .bind(checked_at)
        .execute(self.pool)
        .await?;
        Ok(id)
    }

    /// credential 별 활성 alert 목록 (`dismissed_at IS NULL`).
    pub async fn list_active_by_credential(
        &self,
        credential_id: &str,
    ) -> Result<Vec<SecurityAlertRecord>, StorageError> {
        let rows = sqlx::query(
            r#"SELECT id, credential_id, alert_kind, alert_meta, dismissed_at, checked_at
               FROM security_alerts
               WHERE credential_id = ? AND dismissed_at IS NULL
               ORDER BY checked_at DESC"#,
        )
        .bind(credential_id)
        .fetch_all(self.pool)
        .await?;

        rows.iter().map(row_to_record).collect()
    }

    /// alert_kind 별 전체 활성 alert (Watchtower 페이지용).
    pub async fn list_active_by_kind(
        &self,
        alert_kind: &str,
    ) -> Result<Vec<SecurityAlertRecord>, StorageError> {
        let rows = sqlx::query(
            r#"SELECT id, credential_id, alert_kind, alert_meta, dismissed_at, checked_at
               FROM security_alerts
               WHERE alert_kind = ? AND dismissed_at IS NULL
               ORDER BY checked_at DESC"#,
        )
        .bind(alert_kind)
        .fetch_all(self.pool)
        .await?;

        rows.iter().map(row_to_record).collect()
    }

    /// 전체 활성 alert (count summary 용).
    pub async fn list_active_all(&self) -> Result<Vec<SecurityAlertRecord>, StorageError> {
        let rows = sqlx::query(
            r#"SELECT id, credential_id, alert_kind, alert_meta, dismissed_at, checked_at
               FROM security_alerts
               WHERE dismissed_at IS NULL
               ORDER BY checked_at DESC"#,
        )
        .fetch_all(self.pool)
        .await?;

        rows.iter().map(row_to_record).collect()
    }

    /// alert dismiss — `dismissed_at` 설정.
    ///
    /// 반환값: 영향받은 행 수.
    pub async fn dismiss(&self, id: &str, dismissed_at: &str) -> Result<u64, StorageError> {
        let result = sqlx::query("UPDATE security_alerts SET dismissed_at = ? WHERE id = ?")
            .bind(dismissed_at)
            .bind(id)
            .execute(self.pool)
            .await?;
        Ok(result.rows_affected())
    }

    /// alert undismiss — `dismissed_at` 을 NULL 로 초기화.
    ///
    /// 반환값: 영향받은 행 수.
    pub async fn undismiss(&self, id: &str) -> Result<u64, StorageError> {
        let result = sqlx::query("UPDATE security_alerts SET dismissed_at = NULL WHERE id = ?")
            .bind(id)
            .execute(self.pool)
            .await?;
        Ok(result.rows_affected())
    }

    /// credential 의 모든 alert 삭제 (재검사 전 full cleanup).
    ///
    /// 반환값: 삭제된 행 수.
    pub async fn clear_for_credential(&self, credential_id: &str) -> Result<u64, StorageError> {
        let result = sqlx::query("DELETE FROM security_alerts WHERE credential_id = ?")
            .bind(credential_id)
            .execute(self.pool)
            .await?;
        Ok(result.rows_affected())
    }

    /// 특정 kind 만 삭제 (예: HIBP 만 재검사).
    ///
    /// 반환값: 삭제된 행 수.
    pub async fn clear_kind_for_credential(
        &self,
        credential_id: &str,
        alert_kind: &str,
    ) -> Result<u64, StorageError> {
        let result =
            sqlx::query("DELETE FROM security_alerts WHERE credential_id = ? AND alert_kind = ?")
                .bind(credential_id)
                .bind(alert_kind)
                .execute(self.pool)
                .await?;
        Ok(result.rows_affected())
    }

    /// 트랜잭션 안에서 활성(미dismiss) alert 를 교체한다.
    ///
    /// 1. 해당 credential 의 `dismissed_at IS NULL` alert 전부 삭제.
    /// 2. 새 alert 들 insert (각각 새 ULID).
    /// 3. `dismissed_at NOT NULL` 항목은 보존 (사용자가 dismiss 한 것).
    ///
    /// `alerts`: `(alert_kind, alert_meta_json)` 쌍의 슬라이스.
    pub async fn replace_alerts_for_credential(
        &self,
        credential_id: &str,
        alerts: &[(String, String)],
        checked_at: &str,
    ) -> Result<(), StorageError> {
        let mut tx = self.pool.begin().await?;

        // 1. dismissed_at IS NULL 인 alert 삭제
        sqlx::query("DELETE FROM security_alerts WHERE credential_id = ? AND dismissed_at IS NULL")
            .bind(credential_id)
            .execute(&mut *tx)
            .await?;

        // 2. 신규 alert insert
        for (kind, meta) in alerts {
            let id = Ulid::new().to_string();
            sqlx::query(
                r#"INSERT INTO security_alerts (id, credential_id, alert_kind, alert_meta, checked_at)
                   VALUES (?, ?, ?, ?, ?)"#,
            )
            .bind(&id)
            .bind(credential_id)
            .bind(kind.as_str())
            .bind(meta.as_str())
            .bind(checked_at)
            .execute(&mut *tx)
            .await?;
        }

        tx.commit().await?;
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// TwoFaDirectoryCacheRepo
// ---------------------------------------------------------------------------

pub struct TwoFaDirectoryCacheRepo<'a> {
    pool: &'a SqlitePool,
}

impl<'a> TwoFaDirectoryCacheRepo<'a> {
    pub fn new(pool: &'a SqlitePool) -> Self {
        Self { pool }
    }

    /// `domains` 로 테이블 전체 교체 (트랜잭션 안에서 DELETE ALL + INSERT).
    ///
    /// 도메인 목록이 수백~수천 건이므로 개별 upsert 대신 전체 교체 전략을 사용한다.
    pub async fn replace_all(
        &self,
        domains: &[String],
        cached_at: &str,
    ) -> Result<(), StorageError> {
        let mut tx = self.pool.begin().await?;

        sqlx::query("DELETE FROM twofa_directory_cache")
            .execute(&mut *tx)
            .await?;

        for domain in domains {
            sqlx::query("INSERT INTO twofa_directory_cache (domain, cached_at) VALUES (?, ?)")
                .bind(domain.as_str())
                .bind(cached_at)
                .execute(&mut *tx)
                .await?;
        }

        tx.commit().await?;
        Ok(())
    }

    /// TTL 내의 도메인 목록 반환.
    ///
    /// `now` 기준으로 `cached_at > (now - ttl_seconds)` 인 행만 반환.
    /// SQLite 에서 ISO8601 문자열 비교는 사전 순 == 시간 순이므로 문자열 뺄셈 대신
    /// `datetime(cached_at, '+N seconds') > datetime(now)` 방식을 사용한다.
    ///
    /// `now`: ISO8601 문자열 (예: "2026-05-07T12:00:00Z")
    pub async fn list_all_within_ttl(
        &self,
        ttl_seconds: u64,
        now: &str,
    ) -> Result<Vec<String>, StorageError> {
        // SQLite: datetime('2026-05-07T12:00:00Z', '-86400 seconds') 형식은 'T' 포함 시
        // 파싱 실패. replace 로 변환하거나 strftime 사용 가능하지만 가장 안전한 방법:
        // cached_at 기준 만료 시각을 계산해 비교한다.
        // datetime(cached_at, '+ttl seconds') >= datetime(now)
        let ttl_str = format!("{ttl_seconds} seconds");
        let rows = sqlx::query_scalar(
            r#"SELECT domain FROM twofa_directory_cache
               WHERE datetime(cached_at, '+' || ?) >= datetime(?)"#,
        )
        .bind(ttl_str)
        .bind(now)
        .fetch_all(self.pool)
        .await?;
        Ok(rows)
    }
}

// ---------------------------------------------------------------------------
// 내부 헬퍼
// ---------------------------------------------------------------------------

fn row_to_record(row: &sqlx::sqlite::SqliteRow) -> Result<SecurityAlertRecord, StorageError> {
    Ok(SecurityAlertRecord {
        id: row.try_get("id")?,
        credential_id: row.try_get("credential_id")?,
        alert_kind: row.try_get("alert_kind")?,
        alert_meta: row.try_get("alert_meta")?,
        dismissed_at: row.try_get("dismissed_at")?,
        checked_at: row.try_get("checked_at")?,
    })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sqlite::init_pool;
    use crate::sqlite::repositories::credential::CredentialRepo;
    use crate::sqlite::repositories::issuer::IssuerRepo;
    use api_vault_core::{CredentialInput, Env, IssuerInput};
    use tempfile::tempdir;

    async fn make_pool() -> (tempfile::TempDir, SqlitePool) {
        let dir = tempdir().unwrap();
        let db_path = dir.path().join("test.db");
        let pool = init_pool(&db_path).await.unwrap();
        (dir, pool)
    }

    async fn insert_credential(pool: &SqlitePool, suffix: &str) -> String {
        let issuer_repo = IssuerRepo::new(pool);
        let issuer_id = issuer_repo
            .insert(&IssuerInput {
                slug: format!("issuer-{suffix}"),
                display_name: format!("Issuer {suffix}"),
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
            .unwrap();

        let cred_repo = CredentialRepo::new(pool);
        let cred_id = cred_repo
            .insert(
                &CredentialInput {
                    issuer_id,
                    name: format!("key-{suffix}"),
                    env: Env::Prod,
                    scope: None,
                    owner: None,
                    rotation_policy_days: None,
                    rotation_runbook_id: None,
                    expires_at: None,
                    hash_hint: None,
                    kind: Default::default(),
                    url: None,
                    username: None,
                    primary_label: None,
                    secondary_label: None,
                },
                format!("vault/credentials/key-{suffix}"),
            )
            .await
            .unwrap();
        cred_id.to_string()
    }

    // -----------------------------------------------------------------------
    // RA1: insert → list_active_by_credential → 1개 반환
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn ra1_insert_and_list_active_by_credential() {
        let (_dir, pool) = make_pool().await;
        let cred_id = insert_credential(&pool, "ra1").await;
        let repo = SecurityAlertRepo::new(&pool);

        repo.insert(
            &cred_id,
            "weak_password",
            r#"{"score":20}"#,
            "2026-05-07T00:00:00Z",
        )
        .await
        .unwrap();

        let alerts = repo.list_active_by_credential(&cred_id).await.unwrap();
        assert_eq!(alerts.len(), 1);
        assert_eq!(alerts[0].alert_kind, "weak_password");
        assert!(alerts[0].dismissed_at.is_none());
    }

    // -----------------------------------------------------------------------
    // RA2: dismiss 후 list_active_by_credential → 0개
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn ra2_dismiss_hides_from_active_list() {
        let (_dir, pool) = make_pool().await;
        let cred_id = insert_credential(&pool, "ra2").await;
        let repo = SecurityAlertRepo::new(&pool);

        let alert_id = repo
            .insert(
                &cred_id,
                "compromised_password",
                "{}",
                "2026-05-07T00:00:00Z",
            )
            .await
            .unwrap();

        let affected = repo
            .dismiss(&alert_id, "2026-05-07T01:00:00Z")
            .await
            .unwrap();
        assert_eq!(affected, 1);

        let alerts = repo.list_active_by_credential(&cred_id).await.unwrap();
        assert!(alerts.is_empty(), "dismiss 후 활성 목록이 비어야 함");
    }

    // -----------------------------------------------------------------------
    // RA3: 동일 credential 2개 alert → list_active_all → 2개
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn ra3_list_active_all_returns_multiple() {
        let (_dir, pool) = make_pool().await;
        let cred_id = insert_credential(&pool, "ra3").await;
        let repo = SecurityAlertRepo::new(&pool);

        repo.insert(&cred_id, "weak_password", "{}", "2026-05-07T00:00:00Z")
            .await
            .unwrap();
        repo.insert(&cred_id, "reused_password", "{}", "2026-05-07T00:00:00Z")
            .await
            .unwrap();

        let alerts = repo.list_active_all().await.unwrap();
        assert_eq!(alerts.len(), 2);
    }

    // -----------------------------------------------------------------------
    // RA4: replace_alerts_for_credential — 기존 1개 삭제 + 신규 2개 insert
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn ra4_replace_alerts_clears_and_inserts() {
        let (_dir, pool) = make_pool().await;
        let cred_id = insert_credential(&pool, "ra4").await;
        let repo = SecurityAlertRepo::new(&pool);

        // 기존 1개
        repo.insert(&cred_id, "weak_password", "{}", "2026-05-07T00:00:00Z")
            .await
            .unwrap();

        // replace: 신규 2개
        let new_alerts = vec![
            ("reused_password".to_string(), r#"{"count":3}"#.to_string()),
            (
                "missing_two_factor".to_string(),
                r#"{"domain":"example.com"}"#.to_string(),
            ),
        ];
        repo.replace_alerts_for_credential(&cred_id, &new_alerts, "2026-05-07T02:00:00Z")
            .await
            .unwrap();

        let alerts = repo.list_active_by_credential(&cred_id).await.unwrap();
        assert_eq!(alerts.len(), 2, "replace 후 신규 2개만 존재해야 함");
        let kinds: Vec<&str> = alerts.iter().map(|a| a.alert_kind.as_str()).collect();
        assert!(kinds.contains(&"reused_password"));
        assert!(kinds.contains(&"missing_two_factor"));
    }

    // -----------------------------------------------------------------------
    // RA5: replace 시 dismissed_at NOT NULL 항목 보존
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn ra5_replace_preserves_dismissed_alerts() {
        let (_dir, pool) = make_pool().await;
        let cred_id = insert_credential(&pool, "ra5").await;
        let repo = SecurityAlertRepo::new(&pool);

        // 기존 2개 — 하나는 dismiss
        let active_id = repo
            .insert(&cred_id, "weak_password", "{}", "2026-05-07T00:00:00Z")
            .await
            .unwrap();
        let dismissed_id = repo
            .insert(&cred_id, "reused_password", "{}", "2026-05-07T00:00:00Z")
            .await
            .unwrap();
        repo.dismiss(&dismissed_id, "2026-05-07T01:00:00Z")
            .await
            .unwrap();
        let _ = active_id; // suppress warning

        // replace: 신규 1개
        let new_alerts = vec![("compromised_password".to_string(), "{}".to_string())];
        repo.replace_alerts_for_credential(&cred_id, &new_alerts, "2026-05-07T02:00:00Z")
            .await
            .unwrap();

        // dismissed 항목은 여전히 존재해야 함 (non-active이므로 undismiss로 확인)
        let dismissed_after = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM security_alerts WHERE credential_id = ? AND dismissed_at IS NOT NULL",
        )
        .bind(&cred_id)
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(
            dismissed_after, 1,
            "dismiss 된 항목은 replace 후에도 보존되어야 함"
        );

        // 활성 항목은 신규 1개
        let active = repo.list_active_by_credential(&cred_id).await.unwrap();
        assert_eq!(active.len(), 1);
        assert_eq!(active[0].alert_kind, "compromised_password");
    }

    // -----------------------------------------------------------------------
    // RA6: clear_for_credential → 0개
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn ra6_clear_for_credential() {
        let (_dir, pool) = make_pool().await;
        let cred_id = insert_credential(&pool, "ra6").await;
        let repo = SecurityAlertRepo::new(&pool);

        repo.insert(&cred_id, "weak_password", "{}", "2026-05-07T00:00:00Z")
            .await
            .unwrap();
        repo.insert(&cred_id, "reused_password", "{}", "2026-05-07T00:00:00Z")
            .await
            .unwrap();

        let deleted = repo.clear_for_credential(&cred_id).await.unwrap();
        assert_eq!(deleted, 2);

        let alerts = repo.list_active_by_credential(&cred_id).await.unwrap();
        assert!(alerts.is_empty());
    }

    // -----------------------------------------------------------------------
    // RA7: list_active_by_kind("weak_password")
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn ra7_list_active_by_kind() {
        let (_dir, pool) = make_pool().await;
        let cred_a = insert_credential(&pool, "ra7a").await;
        let cred_b = insert_credential(&pool, "ra7b").await;
        let repo = SecurityAlertRepo::new(&pool);

        repo.insert(&cred_a, "weak_password", "{}", "2026-05-07T00:00:00Z")
            .await
            .unwrap();
        repo.insert(&cred_b, "weak_password", "{}", "2026-05-07T00:00:00Z")
            .await
            .unwrap();
        repo.insert(&cred_a, "reused_password", "{}", "2026-05-07T00:00:00Z")
            .await
            .unwrap();

        let weak = repo.list_active_by_kind("weak_password").await.unwrap();
        assert_eq!(weak.len(), 2, "weak_password 2개 반환");
        for a in &weak {
            assert_eq!(a.alert_kind, "weak_password");
        }

        let reused = repo.list_active_by_kind("reused_password").await.unwrap();
        assert_eq!(reused.len(), 1);
    }

    // -----------------------------------------------------------------------
    // RA8: UUID 충돌 없음 (insert 100회)
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn ra8_no_id_collision_on_100_inserts() {
        let (_dir, pool) = make_pool().await;
        let cred_id = insert_credential(&pool, "ra8").await;
        let repo = SecurityAlertRepo::new(&pool);

        for i in 0..100u32 {
            let meta = format!(r#"{{"i":{i}}}"#);
            repo.insert(&cred_id, "weak_password", &meta, "2026-05-07T00:00:00Z")
                .await
                .unwrap();
        }

        let count: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM security_alerts WHERE credential_id = ?")
                .bind(&cred_id)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(count, 100, "100개 모두 고유 ID로 삽입되어야 함");
    }

    // -----------------------------------------------------------------------
    // C1: TwoFaDirectoryCacheRepo — replace_all 3개 → list_all_within_ttl 3개
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn c1_twofa_cache_replace_and_list() {
        let (_dir, pool) = make_pool().await;
        let repo = TwoFaDirectoryCacheRepo::new(&pool);

        let domains = vec![
            "github.com".to_string(),
            "google.com".to_string(),
            "stripe.com".to_string(),
        ];
        let cached_at = "2026-05-07T00:00:00Z";
        repo.replace_all(&domains, cached_at).await.unwrap();

        // TTL 86400초, now = 직후 → 전부 유효
        let now = "2026-05-07T00:01:00Z";
        let result = repo.list_all_within_ttl(86400, now).await.unwrap();
        assert_eq!(result.len(), 3, "3개 도메인 모두 반환되어야 함");
        for d in &domains {
            assert!(result.contains(d), "{d} 가 결과에 없음");
        }
    }

    // -----------------------------------------------------------------------
    // C2: TwoFaDirectoryCacheRepo — TTL 만료 → list_all_within_ttl 빈 결과
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn c2_twofa_cache_ttl_expired() {
        let (_dir, pool) = make_pool().await;
        let repo = TwoFaDirectoryCacheRepo::new(&pool);

        let domains = vec!["example.com".to_string()];
        // cached_at = 24시간 이상 이전
        let cached_at = "2026-05-06T00:00:00Z";
        repo.replace_all(&domains, cached_at).await.unwrap();

        // ttl_seconds = 3600 (1시간), now = 25시간 뒤 → 만료
        let now = "2026-05-07T01:00:00Z";
        let result = repo.list_all_within_ttl(3600, now).await.unwrap();
        assert!(result.is_empty(), "TTL 만료 후 빈 결과가 반환되어야 함");
    }
}
