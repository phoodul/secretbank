use api_vault_core::{
    CredentialId, DeploymentId, ProjectId, Usage, UsageId, UsageInput, UsageWhereKind, VerifiedBy,
};
use sqlx::{Row, SqlitePool};

use crate::sqlite::{ms_to_dt_opt, StorageError};

pub struct UsageRepo<'a> {
    pool: &'a SqlitePool,
}

impl<'a> UsageRepo<'a> {
    pub fn new(pool: &'a SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn insert(&self, input: &UsageInput) -> Result<UsageId, StorageError> {
        let id = UsageId::new();
        let id_str = id.to_string();
        let cred_id_str = input.credential_id.to_string();
        let proj_id_str = input.project_id.to_string();
        let dep_id_str = input.deployment_id.map(|d| d.to_string());
        let where_kind_str = where_kind_to_str(input.where_kind);

        sqlx::query(
            r#"INSERT INTO usage (id, credential_id, project_id, deployment_id, where_kind, where_value)
               VALUES (?, ?, ?, ?, ?, ?)"#,
        )
        .bind(&id_str)
        .bind(&cred_id_str)
        .bind(&proj_id_str)
        .bind(&dep_id_str)
        .bind(where_kind_str)
        .bind(&input.where_value)
        .execute(self.pool)
        .await?;

        Ok(id)
    }

    pub async fn get_by_id(&self, id: UsageId) -> Result<Option<Usage>, StorageError> {
        let id_str = id.to_string();
        let row = sqlx::query(
            r#"SELECT id, credential_id, project_id, deployment_id, where_kind, where_value,
                      verified_at, verified_by
               FROM usage WHERE id = ?"#,
        )
        .bind(&id_str)
        .fetch_optional(self.pool)
        .await?;

        row.map(|r| row_to_usage(&r)).transpose()
    }

    pub async fn list_for_credential(
        &self,
        credential_id: CredentialId,
    ) -> Result<Vec<Usage>, StorageError> {
        let cid_str = credential_id.to_string();
        let rows = sqlx::query(
            r#"SELECT id, credential_id, project_id, deployment_id, where_kind, where_value,
                      verified_at, verified_by
               FROM usage WHERE credential_id = ? ORDER BY id ASC"#,
        )
        .bind(&cid_str)
        .fetch_all(self.pool)
        .await?;

        rows.iter().map(row_to_usage).collect()
    }

    pub async fn list_for_project(
        &self,
        project_id: ProjectId,
    ) -> Result<Vec<Usage>, StorageError> {
        let pid_str = project_id.to_string();
        let rows = sqlx::query(
            r#"SELECT id, credential_id, project_id, deployment_id, where_kind, where_value,
                      verified_at, verified_by
               FROM usage WHERE project_id = ? ORDER BY id ASC"#,
        )
        .bind(&pid_str)
        .fetch_all(self.pool)
        .await?;

        rows.iter().map(row_to_usage).collect()
    }

    pub async fn delete(&self, id: UsageId) -> Result<(), StorageError> {
        let id_str = id.to_string();
        sqlx::query("DELETE FROM usage WHERE id = ?")
            .bind(&id_str)
            .execute(self.pool)
            .await?;
        Ok(())
    }
}

fn row_to_usage(r: &sqlx::sqlite::SqliteRow) -> Result<Usage, StorageError> {
    let id_str: String = r.try_get("id")?;
    let cred_id_str: String = r.try_get("credential_id")?;
    let proj_id_str: String = r.try_get("project_id")?;
    let dep_id_str: Option<String> = r.try_get("deployment_id")?;
    let where_kind_str: String = r.try_get("where_kind")?;
    let verified_ms: Option<i64> = r.try_get("verified_at")?;
    let verified_by_str: Option<String> = r.try_get("verified_by")?;

    Ok(Usage {
        id: id_str
            .parse()
            .map_err(|e: ulid::DecodeError| StorageError::Parse(e.to_string()))?,
        credential_id: cred_id_str
            .parse()
            .map_err(|e: ulid::DecodeError| StorageError::Parse(e.to_string()))?,
        project_id: proj_id_str
            .parse()
            .map_err(|e: ulid::DecodeError| StorageError::Parse(e.to_string()))?,
        deployment_id: dep_id_str
            .map(|s| {
                s.parse::<DeploymentId>()
                    .map_err(|e: ulid::DecodeError| StorageError::Parse(e.to_string()))
            })
            .transpose()?,
        where_kind: str_to_where_kind(&where_kind_str)?,
        where_value: r.try_get("where_value")?,
        verified_at: ms_to_dt_opt(verified_ms)?,
        verified_by: verified_by_str
            .map(|s| str_to_verified_by(&s))
            .transpose()?,
    })
}

fn where_kind_to_str(k: UsageWhereKind) -> &'static str {
    match k {
        UsageWhereKind::EnvVar => "env_var",
        UsageWhereKind::FilePath => "file_path",
        UsageWhereKind::CodeRef => "code_ref",
    }
}

fn str_to_where_kind(s: &str) -> Result<UsageWhereKind, StorageError> {
    match s {
        "env_var" => Ok(UsageWhereKind::EnvVar),
        "file_path" => Ok(UsageWhereKind::FilePath),
        "code_ref" => Ok(UsageWhereKind::CodeRef),
        other => Err(StorageError::Parse(format!("unknown where_kind: {other}"))),
    }
}

fn str_to_verified_by(s: &str) -> Result<VerifiedBy, StorageError> {
    match s {
        "scan" => Ok(VerifiedBy::Scan),
        "manual" => Ok(VerifiedBy::Manual),
        "runtime" => Ok(VerifiedBy::Runtime),
        other => Err(StorageError::Parse(format!("unknown verified_by: {other}"))),
    }
}
