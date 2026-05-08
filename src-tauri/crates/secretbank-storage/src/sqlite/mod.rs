use std::path::Path;

use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions};
pub use sqlx::SqlitePool;

pub mod repositories;

/// Storage layer errors.
#[derive(Debug, thiserror::Error)]
pub enum StorageError {
    #[error("sqlx error: {0}")]
    Sqlx(#[from] sqlx::Error),

    #[error("migration error: {0}")]
    Migrate(#[from] sqlx::migrate::MigrateError),

    #[error("io error: {0}")]
    Io(#[from] std::io::Error),

    #[error("parse error: {0}")]
    Parse(String),
}

impl serde::Serialize for StorageError {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}

/// Opens (or creates) a WAL-mode SQLite database at `db_path` and runs all
/// pending migrations from the `migrations/` directory adjacent to this crate.
pub async fn init_pool(db_path: &Path) -> Result<SqlitePool, StorageError> {
    let opts = SqliteConnectOptions::new()
        .filename(db_path)
        .create_if_missing(true)
        .journal_mode(SqliteJournalMode::Wal)
        .foreign_keys(true);

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(opts)
        .await?;

    sqlx::migrate!("./migrations").run(&pool).await?;

    Ok(pool)
}

// ---------------------------------------------------------------------------
// Unix-ms ↔ OffsetDateTime helpers (used by repositories)
// ---------------------------------------------------------------------------

pub(crate) fn ms_to_dt(ms: i64) -> Result<time::OffsetDateTime, StorageError> {
    time::OffsetDateTime::from_unix_timestamp_nanos((ms as i128) * 1_000_000)
        .map_err(|e| StorageError::Parse(e.to_string()))
}

pub(crate) fn ms_to_dt_opt(ms: Option<i64>) -> Result<Option<time::OffsetDateTime>, StorageError> {
    ms.map(ms_to_dt).transpose()
}

pub(crate) fn dt_to_ms(dt: time::OffsetDateTime) -> i64 {
    dt.unix_timestamp() * 1000 + (dt.nanosecond() as i64 / 1_000_000)
}

pub(crate) fn dt_to_ms_opt(dt: Option<time::OffsetDateTime>) -> Option<i64> {
    dt.map(dt_to_ms)
}
