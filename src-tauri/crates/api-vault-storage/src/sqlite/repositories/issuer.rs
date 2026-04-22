use api_vault_core::{Issuer, IssuerInput, IssuerId};
use sqlx::{Row, SqlitePool};
use time::OffsetDateTime;

use crate::sqlite::{dt_to_ms, ms_to_dt, StorageError};

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
                security_feed_url, connector_id, icon_key, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"#,
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
                      security_feed_url, connector_id, icon_key, created_at, updated_at
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
                      security_feed_url, connector_id, icon_key, created_at, updated_at
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
               updated_at = ?
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
        created_at: ms_to_dt(created_at_ms)?,
        updated_at: ms_to_dt(updated_at_ms)?,
    })
}
