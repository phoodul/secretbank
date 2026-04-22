use api_vault_core::{
    Credential, CredentialFilter, CredentialId, CredentialInput, CredentialPatch,
    CredentialStatus, CredentialSummary, Env,
};
use sqlx::{Row, SqlitePool};
use time::OffsetDateTime;

use crate::sqlite::{dt_to_ms, dt_to_ms_opt, ms_to_dt, ms_to_dt_opt, StorageError};

pub struct CredentialRepo<'a> {
    pool: &'a SqlitePool,
}

impl<'a> CredentialRepo<'a> {
    pub fn new(pool: &'a SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn insert(
        &self,
        input: &CredentialInput,
        vault_ref: String,
    ) -> Result<CredentialId, StorageError> {
        let id = CredentialId::new();
        let id_str = id.to_string();
        let issuer_id_str = input.issuer_id.to_string();
        let env_str = env_to_str(input.env);
        let now = dt_to_ms(OffsetDateTime::now_utc());
        let expires_ms = dt_to_ms_opt(input.expires_at);

        sqlx::query(
            r#"INSERT INTO credential
               (id, issuer_id, name, env, scope, vault_ref, created_at, expires_at,
                owner, rotation_policy_days, rotation_runbook_id, status, hash_hint)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)"#,
        )
        .bind(&id_str)
        .bind(&issuer_id_str)
        .bind(&input.name)
        .bind(env_str)
        .bind(&input.scope)
        .bind(&vault_ref)
        .bind(now)
        .bind(expires_ms)
        .bind(&input.owner)
        .bind(input.rotation_policy_days)
        .bind(&input.rotation_runbook_id)
        .bind(&input.hash_hint)
        .execute(self.pool)
        .await?;

        Ok(id)
    }

    pub async fn get_by_id(
        &self,
        id: CredentialId,
    ) -> Result<Option<Credential>, StorageError> {
        let id_str = id.to_string();
        let row = sqlx::query(
            r#"SELECT id, issuer_id, name, env, scope, vault_ref, created_at,
                      last_rotated_at, expires_at, owner, rotation_policy_days,
                      rotation_runbook_id, status, hash_hint
               FROM credential WHERE id = ?"#,
        )
        .bind(&id_str)
        .fetch_optional(self.pool)
        .await?;

        row.map(|r| row_to_credential(&r)).transpose()
    }

    pub async fn list(
        &self,
        filter: &CredentialFilter,
    ) -> Result<Vec<CredentialSummary>, StorageError> {
        let mut qb = sqlx::QueryBuilder::new(
            "SELECT id, issuer_id, name, env, status, expires_at FROM credential WHERE 1=1",
        );

        if let Some(issuer_id) = &filter.issuer_id {
            qb.push(" AND issuer_id = ");
            qb.push_bind(issuer_id.to_string());
        }
        if let Some(env) = filter.env {
            qb.push(" AND env = ");
            qb.push_bind(env_to_str(env).to_string());
        }
        if let Some(status) = filter.status {
            qb.push(" AND status = ");
            qb.push_bind(status_to_str(status).to_string());
        }
        if let Some(days) = filter.expiring_within_days {
            let cutoff = dt_to_ms(OffsetDateTime::now_utc()) + (days as i64) * 86_400_000;
            qb.push(" AND expires_at IS NOT NULL AND expires_at <= ");
            qb.push_bind(cutoff);
        }

        qb.push(" ORDER BY name ASC");

        let rows = qb.build().fetch_all(self.pool).await?;

        rows.iter()
            .map(|r| {
                let id_str: String = r.try_get("id")?;
                let issuer_id_str: String = r.try_get("issuer_id")?;
                let env_str: String = r.try_get("env")?;
                let status_str: String = r.try_get("status")?;
                let expires_ms: Option<i64> = r.try_get("expires_at")?;

                Ok(CredentialSummary {
                    id: id_str
                        .parse()
                        .map_err(|e: ulid::DecodeError| StorageError::Parse(e.to_string()))?,
                    issuer_id: issuer_id_str
                        .parse()
                        .map_err(|e: ulid::DecodeError| StorageError::Parse(e.to_string()))?,
                    name: r.try_get("name")?,
                    env: str_to_env(&env_str)?,
                    status: str_to_status(&status_str)?,
                    expires_at: ms_to_dt_opt(expires_ms)?,
                })
            })
            .collect()
    }

    pub async fn update(
        &self,
        id: CredentialId,
        patch: &CredentialPatch,
    ) -> Result<(), StorageError> {
        let id_str = id.to_string();
        let mut qb = sqlx::QueryBuilder::new("UPDATE credential SET ");
        let mut first = true;

        macro_rules! push_field {
            ($field:expr, $val:expr) => {
                if !first {
                    qb.push(", ");
                }
                qb.push($field);
                qb.push(" = ");
                qb.push_bind($val);
                first = false;
            };
        }

        if let Some(ref name) = patch.name {
            push_field!("name", name.clone());
        }
        if let Some(env) = patch.env {
            push_field!("env", env_to_str(env).to_string());
        }
        if let Some(ref scope) = patch.scope {
            push_field!("scope", scope.clone());
        }
        if let Some(days) = patch.rotation_policy_days {
            push_field!("rotation_policy_days", days);
        }
        if let Some(ref runbook) = patch.rotation_runbook_id {
            push_field!("rotation_runbook_id", runbook.clone());
        }
        if let Some(expires) = patch.expires_at {
            push_field!("expires_at", dt_to_ms(expires));
        }
        if let Some(ref owner) = patch.owner {
            push_field!("owner", owner.clone());
        }
        if let Some(status) = patch.status {
            push_field!("status", status_to_str(status).to_string());
        }
        if let Some(ref hint) = patch.hash_hint {
            push_field!("hash_hint", hint.clone());
        }

        if first {
            return Ok(());
        }

        qb.push(" WHERE id = ");
        qb.push_bind(id_str);

        qb.build().execute(self.pool).await?;
        Ok(())
    }

    pub async fn delete(&self, id: CredentialId) -> Result<(), StorageError> {
        let id_str = id.to_string();
        sqlx::query("DELETE FROM credential WHERE id = ?")
            .bind(&id_str)
            .execute(self.pool)
            .await?;
        Ok(())
    }
}

fn row_to_credential(r: &sqlx::sqlite::SqliteRow) -> Result<Credential, StorageError> {
    let id_str: String = r.try_get("id")?;
    let issuer_id_str: String = r.try_get("issuer_id")?;
    let env_str: String = r.try_get("env")?;
    let status_str: String = r.try_get("status")?;
    let created_ms: i64 = r.try_get("created_at")?;
    let last_rotated_ms: Option<i64> = r.try_get("last_rotated_at")?;
    let expires_ms: Option<i64> = r.try_get("expires_at")?;
    let rotation_days: Option<i64> = r.try_get("rotation_policy_days")?;

    Ok(Credential {
        id: id_str
            .parse()
            .map_err(|e: ulid::DecodeError| StorageError::Parse(e.to_string()))?,
        issuer_id: issuer_id_str
            .parse()
            .map_err(|e: ulid::DecodeError| StorageError::Parse(e.to_string()))?,
        name: r.try_get("name")?,
        env: str_to_env(&env_str)?,
        scope: r.try_get("scope")?,
        vault_ref: r.try_get("vault_ref")?,
        created_at: ms_to_dt(created_ms)?,
        last_rotated_at: ms_to_dt_opt(last_rotated_ms)?,
        expires_at: ms_to_dt_opt(expires_ms)?,
        owner: r.try_get("owner")?,
        rotation_policy_days: rotation_days.map(|v| v as i32),
        rotation_runbook_id: r.try_get("rotation_runbook_id")?,
        status: str_to_status(&status_str)?,
        hash_hint: r.try_get("hash_hint")?,
    })
}

// ---------------------------------------------------------------------------
// Enum ↔ string helpers
// ---------------------------------------------------------------------------

pub(crate) fn env_to_str(env: Env) -> &'static str {
    match env {
        Env::Dev => "dev",
        Env::Staging => "staging",
        Env::Prod => "prod",
    }
}

pub(crate) fn str_to_env(s: &str) -> Result<Env, StorageError> {
    match s {
        "dev" => Ok(Env::Dev),
        "staging" => Ok(Env::Staging),
        "prod" => Ok(Env::Prod),
        other => Err(StorageError::Parse(format!("unknown env: {other}"))),
    }
}

fn status_to_str(s: CredentialStatus) -> &'static str {
    match s {
        CredentialStatus::Active => "active",
        CredentialStatus::Revoked => "revoked",
        CredentialStatus::Compromised => "compromised",
    }
}

fn str_to_status(s: &str) -> Result<CredentialStatus, StorageError> {
    match s {
        "active" => Ok(CredentialStatus::Active),
        "revoked" => Ok(CredentialStatus::Revoked),
        "compromised" => Ok(CredentialStatus::Compromised),
        other => Err(StorageError::Parse(format!("unknown status: {other}"))),
    }
}

