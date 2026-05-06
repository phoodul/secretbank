use api_vault_core::{Issuer, IssuerId, IssuerInput};
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
}
