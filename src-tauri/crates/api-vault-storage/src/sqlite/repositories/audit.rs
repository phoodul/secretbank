use api_vault_audit::{AuditActor, AuditLog};
use sqlx::{Row, SqlitePool};

use crate::sqlite::{dt_to_ms, ms_to_dt, StorageError};

// ---------------------------------------------------------------------------
// Filter type
// ---------------------------------------------------------------------------

/// Query filter for [`AuditRepo::list`].
#[derive(Debug, Default, Clone)]
pub struct AuditFilter {
    pub subject_kind: Option<String>,
    pub subject_id: Option<String>,
    /// Prefix match on action (e.g. `"credential."`)
    pub action_prefix: Option<String>,
    pub device_id: Option<String>,
    pub limit: u32,
    pub offset: u32,
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

pub struct AuditRepo<'a> {
    pool: &'a SqlitePool,
}

impl<'a> AuditRepo<'a> {
    pub fn new(pool: &'a SqlitePool) -> Self {
        Self { pool }
    }

    /// Insert a fully-formed audit entry (all hashes/signature must be set).
    pub async fn insert(&self, entry: &AuditLog) -> Result<(), StorageError> {
        let created_ms = dt_to_ms(entry.created_at);
        let actor_str = actor_to_str(entry.actor);

        sqlx::query(
            r#"INSERT INTO audit_log
               (id, seq, device_id, actor, action, subject_kind, subject_id,
                payload_json, prev_hash, entry_hash, signature, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"#,
        )
        .bind(&entry.id)
        .bind(entry.seq)
        .bind(&entry.device_id)
        .bind(actor_str)
        .bind(&entry.action)
        .bind(&entry.subject_kind)
        .bind(&entry.subject_id)
        .bind(&entry.payload_json)
        .bind(entry.prev_hash.as_slice())
        .bind(entry.entry_hash.as_slice())
        .bind(entry.signature.as_slice())
        .bind(created_ms)
        .execute(self.pool)
        .await?;

        Ok(())
    }

    /// Fetch the entry with the highest `seq` for a given device.
    /// Returns `None` if the device has no entries yet.
    pub async fn last_for_device(&self, device_id: &str) -> Result<Option<AuditLog>, StorageError> {
        let row = sqlx::query(
            r#"SELECT id, seq, device_id, actor, action, subject_kind, subject_id,
                      payload_json, prev_hash, entry_hash, signature, created_at
               FROM audit_log
               WHERE device_id = ?
               ORDER BY seq DESC
               LIMIT 1"#,
        )
        .bind(device_id)
        .fetch_optional(self.pool)
        .await?;

        row.map(|r| row_to_audit_log(&r)).transpose()
    }

    /// Filtered, paginated query for T072 audit viewer.
    pub async fn list(&self, filter: &AuditFilter) -> Result<Vec<AuditLog>, StorageError> {
        // Build query dynamically based on which filters are set.
        // Using a simple WHERE-clause builder to stay readable.
        let mut conditions: Vec<&str> = Vec::new();
        if filter.subject_kind.is_some() {
            conditions.push("subject_kind = ?");
        }
        if filter.subject_id.is_some() {
            conditions.push("subject_id = ?");
        }
        if filter.action_prefix.is_some() {
            conditions.push("action LIKE ?");
        }
        if filter.device_id.is_some() {
            conditions.push("device_id = ?");
        }

        let where_clause = if conditions.is_empty() {
            String::new()
        } else {
            format!("WHERE {}", conditions.join(" AND "))
        };

        let limit = if filter.limit == 0 { 100 } else { filter.limit };
        let sql = format!(
            r#"SELECT id, seq, device_id, actor, action, subject_kind, subject_id,
                      payload_json, prev_hash, entry_hash, signature, created_at
               FROM audit_log
               {where_clause}
               ORDER BY created_at DESC
               LIMIT ? OFFSET ?"#,
        );

        let mut q = sqlx::query(&sql);

        if let Some(ref v) = filter.subject_kind {
            q = q.bind(v);
        }
        if let Some(ref v) = filter.subject_id {
            q = q.bind(v);
        }
        if let Some(ref v) = filter.action_prefix {
            q = q.bind(format!("{v}%"));
        }
        if let Some(ref v) = filter.device_id {
            q = q.bind(v);
        }

        let rows = q
            .bind(limit)
            .bind(filter.offset)
            .fetch_all(self.pool)
            .await?;

        rows.iter().map(row_to_audit_log).collect()
    }

    /// Fetch ALL entries ordered by (device_id, seq) for chain verification.
    pub async fn list_for_verify(&self) -> Result<Vec<AuditLog>, StorageError> {
        let rows = sqlx::query(
            r#"SELECT id, seq, device_id, actor, action, subject_kind, subject_id,
                      payload_json, prev_hash, entry_hash, signature, created_at
               FROM audit_log
               ORDER BY device_id, seq ASC"#,
        )
        .fetch_all(self.pool)
        .await?;

        rows.iter().map(row_to_audit_log).collect()
    }
}

// ---------------------------------------------------------------------------
// Row conversion helpers
// ---------------------------------------------------------------------------

fn row_to_audit_log(r: &sqlx::sqlite::SqliteRow) -> Result<AuditLog, StorageError> {
    let created_ms: i64 = r.try_get("created_at")?;
    let actor_str: String = r.try_get("actor")?;

    let prev_hash_bytes: Vec<u8> = r.try_get("prev_hash")?;
    let entry_hash_bytes: Vec<u8> = r.try_get("entry_hash")?;
    let signature_bytes: Vec<u8> = r.try_get("signature")?;

    let prev_hash: [u8; 32] = prev_hash_bytes
        .try_into()
        .map_err(|_| StorageError::Parse("prev_hash must be 32 bytes".into()))?;
    let entry_hash: [u8; 32] = entry_hash_bytes
        .try_into()
        .map_err(|_| StorageError::Parse("entry_hash must be 32 bytes".into()))?;
    let signature: [u8; 64] = signature_bytes
        .try_into()
        .map_err(|_| StorageError::Parse("signature must be 64 bytes".into()))?;

    Ok(AuditLog {
        id: r.try_get("id")?,
        seq: r.try_get("seq")?,
        device_id: r.try_get("device_id")?,
        actor: str_to_actor(&actor_str)?,
        action: r.try_get("action")?,
        subject_kind: r.try_get("subject_kind")?,
        subject_id: r.try_get("subject_id")?,
        payload_json: r.try_get("payload_json")?,
        prev_hash,
        entry_hash,
        signature,
        created_at: ms_to_dt(created_ms)?,
    })
}

fn actor_to_str(a: AuditActor) -> &'static str {
    match a {
        AuditActor::LocalUser => "local-user",
        AuditActor::System => "system",
        AuditActor::Connector => "connector",
    }
}

fn str_to_actor(s: &str) -> Result<AuditActor, StorageError> {
    match s {
        "local-user" => Ok(AuditActor::LocalUser),
        "system" => Ok(AuditActor::System),
        "connector" => Ok(AuditActor::Connector),
        other => Err(StorageError::Parse(format!("unknown actor: {other}"))),
    }
}
