use secretbank_core::{Issuer, IssuerId, IssuerInput};
use sqlx::{Row, SqlitePool};
use time::OffsetDateTime;

use crate::sqlite::{dt_to_ms, ms_to_dt, StorageError};

fn serialize_domains(domains: &[String]) -> String {
    serde_json::to_string(domains).unwrap_or_else(|_| "[]".to_string())
}

fn deserialize_domains(raw: Option<String>) -> Vec<String> {
    match raw {
        None => Vec::new(),
        Some(s) => serde_json::from_str::<Vec<String>>(&s).unwrap_or_else(|_| {
            tracing::warn!("issuer.domains parse failed, falling back to empty vec");
            Vec::new()
        }),
    }
}

pub struct IssuerRepo<'a> {
    pool: &'a SqlitePool,
}

impl<'a> IssuerRepo<'a> {
    pub fn new(pool: &'a SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn insert(&self, input: &IssuerInput) -> Result<IssuerId, StorageError> {
        let id = IssuerId::new();
        let id_str = id.to_string();
        let now = dt_to_ms(OffsetDateTime::now_utc());

        sqlx::query(
            r#"INSERT INTO issuer
               (id, slug, display_name, docs_url, issue_url, status_url,
                security_feed_url, connector_id, icon_key,
                default_primary_label, default_secondary_label,
                domains, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"#,
        )
        .bind(&id_str)
        .bind(&input.slug)
        .bind(&input.display_name)
        .bind(&input.docs_url)
        .bind(&input.issue_url)
        .bind(&input.status_url)
        .bind(&input.security_feed_url)
        .bind(&input.connector_id)
        .bind(&input.icon_key)
        .bind(&input.default_primary_label)
        .bind(&input.default_secondary_label)
        .bind(serialize_domains(&input.domains))
        .bind(now)
        .bind(now)
        .execute(self.pool)
        .await?;

        Ok(id)
    }

    pub async fn get_by_id(&self, id: IssuerId) -> Result<Option<Issuer>, StorageError> {
        let id_str = id.to_string();
        let row = sqlx::query(
            r#"SELECT id, slug, display_name, docs_url, issue_url, status_url,
                      security_feed_url, connector_id, icon_key,
                      default_primary_label, default_secondary_label,
                      domains, created_at, updated_at
               FROM issuer WHERE id = ?"#,
        )
        .bind(&id_str)
        .fetch_optional(self.pool)
        .await?;

        row.map(|r| row_to_issuer(&r)).transpose()
    }

    pub async fn list(&self) -> Result<Vec<Issuer>, StorageError> {
        let rows = sqlx::query(
            r#"SELECT id, slug, display_name, docs_url, issue_url, status_url,
                      security_feed_url, connector_id, icon_key,
                      default_primary_label, default_secondary_label,
                      domains, created_at, updated_at
               FROM issuer ORDER BY display_name ASC"#,
        )
        .fetch_all(self.pool)
        .await?;

        rows.iter().map(row_to_issuer).collect()
    }

    pub async fn update(&self, id: IssuerId, input: &IssuerInput) -> Result<(), StorageError> {
        let id_str = id.to_string();
        let now = dt_to_ms(OffsetDateTime::now_utc());

        sqlx::query(
            r#"UPDATE issuer SET slug = ?, display_name = ?, docs_url = ?, issue_url = ?,
               status_url = ?, security_feed_url = ?, connector_id = ?, icon_key = ?,
               default_primary_label = ?, default_secondary_label = ?,
               domains = ?, updated_at = ?
               WHERE id = ?"#,
        )
        .bind(&input.slug)
        .bind(&input.display_name)
        .bind(&input.docs_url)
        .bind(&input.issue_url)
        .bind(&input.status_url)
        .bind(&input.security_feed_url)
        .bind(&input.connector_id)
        .bind(&input.icon_key)
        .bind(&input.default_primary_label)
        .bind(&input.default_secondary_label)
        .bind(serialize_domains(&input.domains))
        .bind(now)
        .bind(&id_str)
        .execute(self.pool)
        .await?;

        Ok(())
    }

    pub async fn delete(&self, id: IssuerId) -> Result<(), StorageError> {
        let id_str = id.to_string();
        sqlx::query("DELETE FROM issuer WHERE id = ?")
            .bind(&id_str)
            .execute(self.pool)
            .await?;
        Ok(())
    }

    // T-24-E-D5: domain 기반 issuer 검색 — domains JSON 배열에 domain 이 포함된 첫 row 반환.
    // IssuerRecipe 대용; slug 완전 일치보다 느슨한 매칭. — TM-EXT-ACTOR
    pub async fn find_by_domain(&self, domain: &str) -> Result<Option<Issuer>, StorageError> {
        // SQLite JSON_EACH 를 통해 domains 배열 내 요소를 순회하며 일치 여부 확인.
        // domains 컬럼이 NULL 인 경우 JSON_EACH 는 0 행을 반환하므로 자연스럽게 제외된다.
        let row = sqlx::query(
            r#"SELECT i.id, i.slug, i.display_name, i.docs_url, i.issue_url, i.status_url,
                      i.security_feed_url, i.connector_id, i.icon_key,
                      i.default_primary_label, i.default_secondary_label,
                      i.domains, i.created_at, i.updated_at
               FROM issuer i, json_each(i.domains) j
               WHERE j.value = ?
               LIMIT 1"#,
        )
        .bind(domain)
        .fetch_optional(self.pool)
        .await?;

        row.map(|r| row_to_issuer(&r)).transpose()
    }

    // T-24-E-D5: slug 로 issuer 를 조회하거나 존재하지 않으면 placeholder 로 생성(idempotent).
    // extension autofill 경로에서 issuer 를 보장할 때 사용. — TM-EXT-ACTOR
    pub async fn get_or_create_by_slug(
        &self,
        slug: &str,
        display_name: &str,
    ) -> Result<IssuerId, StorageError> {
        // 먼저 slug 로 기존 row 를 찾는다.
        let existing = sqlx::query_scalar::<_, String>("SELECT id FROM issuer WHERE slug = ?")
            .bind(slug)
            .fetch_optional(self.pool)
            .await?;

        if let Some(id_str) = existing {
            return id_str
                .parse()
                .map_err(|e: ulid::DecodeError| StorageError::Parse(e.to_string()));
        }

        // 없으면 placeholder 생성.
        let id = IssuerId::new();
        let id_str = id.to_string();
        let now = dt_to_ms(OffsetDateTime::now_utc());

        sqlx::query(
            r#"INSERT INTO issuer
               (id, slug, display_name, docs_url, issue_url, status_url,
                security_feed_url, connector_id, icon_key,
                default_primary_label, default_secondary_label,
                domains, created_at, updated_at)
               VALUES (?, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '[]', ?, ?)"#,
        )
        .bind(&id_str)
        .bind(slug)
        .bind(display_name)
        .bind(now)
        .bind(now)
        .execute(self.pool)
        .await?;

        Ok(id)
    }
}

fn row_to_issuer(r: &sqlx::sqlite::SqliteRow) -> Result<Issuer, StorageError> {
    let id_str: String = r.try_get("id")?;
    let created_at_ms: i64 = r.try_get("created_at")?;
    let updated_at_ms: i64 = r.try_get("updated_at")?;
    let domains_raw: Option<String> = r.try_get("domains")?;

    Ok(Issuer {
        id: id_str
            .parse()
            .map_err(|e: ulid::DecodeError| StorageError::Parse(e.to_string()))?,
        slug: r.try_get("slug")?,
        display_name: r.try_get("display_name")?,
        docs_url: r.try_get("docs_url")?,
        issue_url: r.try_get("issue_url")?,
        status_url: r.try_get("status_url")?,
        security_feed_url: r.try_get("security_feed_url")?,
        connector_id: r.try_get("connector_id")?,
        icon_key: r.try_get("icon_key")?,
        default_primary_label: r.try_get("default_primary_label")?,
        default_secondary_label: r.try_get("default_secondary_label")?,
        domains: deserialize_domains(domains_raw),
        created_at: ms_to_dt(created_at_ms)?,
        updated_at: ms_to_dt(updated_at_ms)?,
    })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sqlite::init_pool;

    async fn make_pool() -> (SqlitePool, tempfile::TempDir) {
        let dir = tempfile::tempdir().expect("tempdir");
        let db_path = dir.path().join("test.db");
        let pool = init_pool(&db_path).await.expect("init_pool");
        (pool, dir)
    }

    fn base_input(slug: &str) -> IssuerInput {
        IssuerInput {
            slug: slug.to_string(),
            display_name: slug.to_string(),
            ..Default::default()
        }
    }

    #[tokio::test]
    async fn test_issuer_round_trip_with_domains() {
        let (pool, _dir) = make_pool().await;
        let repo = IssuerRepo::new(&pool);

        let input = IssuerInput {
            domains: vec!["foo.com".to_string(), "bar.io".to_string()],
            ..base_input("testissuer")
        };

        let id = repo.insert(&input).await.expect("insert");
        let issuer = repo.get_by_id(id).await.expect("get").expect("Some");

        assert_eq!(issuer.domains, vec!["foo.com", "bar.io"]);
    }

    #[tokio::test]
    async fn test_issuer_select_null_domains_returns_empty_vec() {
        let (pool, _dir) = make_pool().await;
        let repo = IssuerRepo::new(&pool);

        // Raw insert with NULL domains to simulate pre-migration rows
        let id = IssuerId::new();
        let id_str = id.to_string();
        let now = dt_to_ms(OffsetDateTime::now_utc());
        sqlx::query(
            r#"INSERT INTO issuer
               (id, slug, display_name, docs_url, issue_url, status_url,
                security_feed_url, connector_id, icon_key,
                default_primary_label, default_secondary_label,
                domains, created_at, updated_at)
               VALUES (?, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?)"#,
        )
        .bind(&id_str)
        .bind("nulldomainissuer")
        .bind("Null Domain Issuer")
        .bind(now)
        .bind(now)
        .execute(&pool)
        .await
        .expect("raw insert");

        let issuer = repo.get_by_id(id).await.expect("get").expect("Some");
        assert_eq!(issuer.domains, Vec::<String>::new());
    }

    #[tokio::test]
    async fn test_issuer_update_domains() {
        let (pool, _dir) = make_pool().await;
        let repo = IssuerRepo::new(&pool);

        let id = repo
            .insert(&base_input("updatetest"))
            .await
            .expect("insert");

        let updated = IssuerInput {
            domains: vec!["updated.com".to_string()],
            ..base_input("updatetest")
        };
        repo.update(id, &updated).await.expect("update");

        let issuer = repo.get_by_id(id).await.expect("get").expect("Some");
        assert_eq!(issuer.domains, vec!["updated.com"]);
    }

    // -----------------------------------------------------------------------
    // T-24-E-D5-I1: find_by_domain — domains 배열에 포함된 도메인으로 issuer 조회
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn d5_find_by_domain_returns_matching_issuer() {
        let (pool, _dir) = make_pool().await;
        let repo = IssuerRepo::new(&pool);

        let input = IssuerInput {
            domains: vec!["github.com".to_string(), "api.github.com".to_string()],
            ..base_input("github")
        };
        let id = repo.insert(&input).await.expect("insert");

        let found = repo
            .find_by_domain("github.com")
            .await
            .expect("find_by_domain")
            .expect("Some");
        assert_eq!(found.id, id);
        assert_eq!(found.slug, "github");
    }

    // -----------------------------------------------------------------------
    // T-24-E-D5-I2: find_by_domain — 미매칭 도메인은 None 반환
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn d5_find_by_domain_returns_none_when_no_match() {
        let (pool, _dir) = make_pool().await;
        let repo = IssuerRepo::new(&pool);

        let input = IssuerInput {
            domains: vec!["github.com".to_string()],
            ..base_input("github")
        };
        repo.insert(&input).await.expect("insert");

        let result = repo
            .find_by_domain("stripe.com")
            .await
            .expect("find_by_domain");
        assert!(result.is_none(), "미매칭 도메인은 None 이어야 한다");
    }

    // -----------------------------------------------------------------------
    // T-24-E-D5-I3: get_or_create_by_slug — 없으면 생성, 있으면 기존 id 반환 (idempotent)
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn d5_get_or_create_by_slug_is_idempotent() {
        let (pool, _dir) = make_pool().await;
        let repo = IssuerRepo::new(&pool);

        // 첫 호출: 생성
        let id1 = repo
            .get_or_create_by_slug("github", "Github")
            .await
            .expect("first call");

        // 두 번째 호출: 동일 id 반환
        let id2 = repo
            .get_or_create_by_slug("github", "Github")
            .await
            .expect("second call");

        assert_eq!(id1, id2, "두 번 호출 시 같은 id 반환 (idempotent)");

        // DB 에 row 1개만 존재해야 한다
        let count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM issuer WHERE slug = 'github'")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(count.0, 1, "slug 중복 row 없어야 함");
    }

    // -----------------------------------------------------------------------
    // T-24-E-D5-I4: get_or_create_by_slug — 기존 issuer 가 있으면 해당 id 반환
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn d5_get_or_create_by_slug_returns_existing_id_when_already_present() {
        let (pool, _dir) = make_pool().await;
        let repo = IssuerRepo::new(&pool);

        // 먼저 일반 insert 로 issuer 생성
        let existing_id = repo.insert(&base_input("stripe")).await.expect("insert");

        // get_or_create 는 기존 id 를 그대로 반환해야 한다
        let result_id = repo
            .get_or_create_by_slug("stripe", "Stripe")
            .await
            .expect("get_or_create");

        assert_eq!(result_id, existing_id, "기존 issuer 가 있으면 동일 id 반환");
    }
}
