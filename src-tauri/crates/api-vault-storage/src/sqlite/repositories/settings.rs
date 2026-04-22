use sqlx::SqlitePool;
use time::OffsetDateTime;

use crate::sqlite::{dt_to_ms, StorageError};

pub struct SettingsRepo<'a> {
    pool: &'a SqlitePool,
}

impl<'a> SettingsRepo<'a> {
    pub fn new(pool: &'a SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn get(&self, key: &str) -> Result<Option<String>, StorageError> {
        let row = sqlx::query("SELECT value FROM settings WHERE key = ?")
            .bind(key)
            .fetch_optional(self.pool)
            .await?;

        use sqlx::Row;
        Ok(row
            .map(|r| r.try_get::<Option<String>, _>("value"))
            .transpose()?
            .flatten())
    }

    pub async fn set(&self, key: &str, value: Option<&str>) -> Result<(), StorageError> {
        let now = dt_to_ms(OffsetDateTime::now_utc());
        sqlx::query(
            r#"INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
               ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"#,
        )
        .bind(key)
        .bind(value)
        .bind(now)
        .execute(self.pool)
        .await?;
        Ok(())
    }

    pub async fn delete(&self, key: &str) -> Result<(), StorageError> {
        sqlx::query("DELETE FROM settings WHERE key = ?")
            .bind(key)
            .execute(self.pool)
            .await?;
        Ok(())
    }
}
