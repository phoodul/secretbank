use api_vault_core::{AuditAction, AuditActor, AuditLog, AuditLogId, DeviceId};
use sqlx::{Row, SqlitePool};

use crate::sqlite::{dt_to_ms, ms_to_dt, StorageError};

pub struct AuditRepo<'a> {
    pool: &'a SqlitePool,
}

impl<'a> AuditRepo<'a> {
    pub fn new(pool: &'a SqlitePool) -> Self {
        Self { pool }
    }

    /// Append an audit log entry. All hashes/signature must already be set.
    pub async fn insert(&self, entry: &AuditLog) -> Result<(), StorageError> {
        let id_str = entry.id.to_string();
        let device_id_str = entry.device_id.map(|d| d.to_string());
        let actor_str = actor_to_str(entry.actor);
        let action_str = action_to_str(entry.action);
        let created_ms = dt_to_ms(entry.created_at);

        sqlx::query(
            r#"INSERT INTO audit_log
               (id, seq, device_id, actor, action, subject_kind, subject_id,
                payload_json, prev_hash, entry_hash, signature, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"#,
        )
        .bind(&id_str)
        .bind(entry.seq)
        .bind(&device_id_str)
        .bind(actor_str)
        .bind(action_str)
        .bind(&entry.subject_kind)
        .bind(&entry.subject_id)
        .bind(&entry.payload_json)
        .bind(&entry.prev_hash)
        .bind(&entry.entry_hash)
        .bind(&entry.signature)
        .bind(created_ms)
        .execute(self.pool)
        .await?;

        Ok(())
    }

    pub async fn get_by_id(&self, id: AuditLogId) -> Result<Option<AuditLog>, StorageError> {
        let id_str = id.to_string();
        let row = sqlx::query(
            r#"SELECT id, seq, device_id, actor, action, subject_kind, subject_id,
                      payload_json, prev_hash, entry_hash, signature, created_at
               FROM audit_log WHERE id = ?"#,
        )
        .bind(&id_str)
        .fetch_optional(self.pool)
        .await?;

        row.map(|r| row_to_audit_log(&r)).transpose()
    }

    pub async fn list_for_device(
        &self,
        device_id: DeviceId,
        limit: i64,
    ) -> Result<Vec<AuditLog>, StorageError> {
        let dev_id_str = device_id.to_string();
        let rows = sqlx::query(
            r#"SELECT id, seq, device_id, actor, action, subject_kind, subject_id,
                      payload_json, prev_hash, entry_hash, signature, created_at
               FROM audit_log WHERE device_id = ? ORDER BY seq ASC LIMIT ?"#,
        )
        .bind(&dev_id_str)
        .bind(limit)
        .fetch_all(self.pool)
        .await?;

        rows.iter().map(row_to_audit_log).collect()
    }
}

fn row_to_audit_log(r: &sqlx::sqlite::SqliteRow) -> Result<AuditLog, StorageError> {
    let id_str: String = r.try_get("id")?;
    let device_id_str: Option<String> = r.try_get("device_id")?;
    let actor_str: String = r.try_get("actor")?;
    let action_str: String = r.try_get("action")?;
    let created_ms: i64 = r.try_get("created_at")?;

    Ok(AuditLog {
        id: id_str
            .parse()
            .map_err(|e: ulid::DecodeError| StorageError::Parse(e.to_string()))?,
        seq: r.try_get("seq")?,
        device_id: device_id_str
            .map(|s| {
                s.parse::<DeviceId>()
                    .map_err(|e: ulid::DecodeError| StorageError::Parse(e.to_string()))
            })
            .transpose()?,
        actor: str_to_actor(&actor_str)?,
        action: str_to_action(&action_str)?,
        subject_kind: r.try_get("subject_kind")?,
        subject_id: r.try_get("subject_id")?,
        payload_json: r.try_get("payload_json")?,
        prev_hash: r.try_get("prev_hash")?,
        entry_hash: r.try_get("entry_hash")?,
        signature: r.try_get("signature")?,
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

fn action_to_str(a: AuditAction) -> &'static str {
    match a {
        AuditAction::CredentialCreate => "credential_create",
        AuditAction::CredentialUpdate => "credential_update",
        AuditAction::CredentialDelete => "credential_delete",
        AuditAction::CredentialRotate => "credential_rotate",
        AuditAction::CredentialRevoke => "credential_revoke",
        AuditAction::CredentialReveal => "credential_reveal",
        AuditAction::ProjectCreate => "project_create",
        AuditAction::ProjectUpdate => "project_update",
        AuditAction::ProjectDelete => "project_delete",
        AuditAction::UsageCreate => "usage_create",
        AuditAction::UsageDelete => "usage_delete",
        AuditAction::DeploymentCreate => "deployment_create",
        AuditAction::DeploymentDelete => "deployment_delete",
        AuditAction::IncidentDismiss => "incident_dismiss",
        AuditAction::VaultUnlock => "vault_unlock",
        AuditAction::VaultLock => "vault_lock",
        AuditAction::KillSwitchTriggered => "kill_switch_triggered",
    }
}

fn str_to_action(s: &str) -> Result<AuditAction, StorageError> {
    match s {
        "credential_create" => Ok(AuditAction::CredentialCreate),
        "credential_update" => Ok(AuditAction::CredentialUpdate),
        "credential_delete" => Ok(AuditAction::CredentialDelete),
        "credential_rotate" => Ok(AuditAction::CredentialRotate),
        "credential_revoke" => Ok(AuditAction::CredentialRevoke),
        "credential_reveal" => Ok(AuditAction::CredentialReveal),
        "project_create" => Ok(AuditAction::ProjectCreate),
        "project_update" => Ok(AuditAction::ProjectUpdate),
        "project_delete" => Ok(AuditAction::ProjectDelete),
        "usage_create" => Ok(AuditAction::UsageCreate),
        "usage_delete" => Ok(AuditAction::UsageDelete),
        "deployment_create" => Ok(AuditAction::DeploymentCreate),
        "deployment_delete" => Ok(AuditAction::DeploymentDelete),
        "incident_dismiss" => Ok(AuditAction::IncidentDismiss),
        "vault_unlock" => Ok(AuditAction::VaultUnlock),
        "vault_lock" => Ok(AuditAction::VaultLock),
        "kill_switch_triggered" => Ok(AuditAction::KillSwitchTriggered),
        other => Err(StorageError::Parse(format!("unknown action: {other}"))),
    }
}
