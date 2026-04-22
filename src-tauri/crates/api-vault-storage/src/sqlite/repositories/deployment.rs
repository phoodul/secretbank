use api_vault_core::{Deployment, DeploymentId, DeploymentInput, DeploymentPlatform, Env, ProjectId};
use sqlx::{Row, SqlitePool};
use time::OffsetDateTime;

use crate::sqlite::{dt_to_ms, ms_to_dt, StorageError};

pub struct DeploymentRepo<'a> {
    pool: &'a SqlitePool,
}

impl<'a> DeploymentRepo<'a> {
    pub fn new(pool: &'a SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn insert(&self, input: &DeploymentInput) -> Result<DeploymentId, StorageError> {
        let id = DeploymentId::new();
        let id_str = id.to_string();
        let project_id_str = input.project_id.to_string();
        let platform_str = platform_to_str(input.platform);
        let env_str = env_to_str(input.env);
        let now = dt_to_ms(OffsetDateTime::now_utc());

        sqlx::query(
            r#"INSERT INTO deployment (id, project_id, url, platform, env, created_at)
               VALUES (?, ?, ?, ?, ?, ?)"#,
        )
        .bind(&id_str)
        .bind(&project_id_str)
        .bind(&input.url)
        .bind(platform_str)
        .bind(env_str)
        .bind(now)
        .execute(self.pool)
        .await?;

        Ok(id)
    }

    pub async fn get_by_id(&self, id: DeploymentId) -> Result<Option<Deployment>, StorageError> {
        let id_str = id.to_string();
        let row = sqlx::query(
            r#"SELECT id, project_id, url, platform, env, created_at
               FROM deployment WHERE id = ?"#,
        )
        .bind(&id_str)
        .fetch_optional(self.pool)
        .await?;

        row.map(|r| row_to_deployment(&r)).transpose()
    }

    pub async fn list_for_project(
        &self,
        project_id: ProjectId,
    ) -> Result<Vec<Deployment>, StorageError> {
        let pid_str = project_id.to_string();
        let rows = sqlx::query(
            r#"SELECT id, project_id, url, platform, env, created_at
               FROM deployment WHERE project_id = ? ORDER BY created_at DESC"#,
        )
        .bind(&pid_str)
        .fetch_all(self.pool)
        .await?;

        rows.iter().map(row_to_deployment).collect()
    }

    pub async fn delete(&self, id: DeploymentId) -> Result<(), StorageError> {
        let id_str = id.to_string();
        sqlx::query("DELETE FROM deployment WHERE id = ?")
            .bind(&id_str)
            .execute(self.pool)
            .await?;
        Ok(())
    }
}

fn row_to_deployment(r: &sqlx::sqlite::SqliteRow) -> Result<Deployment, StorageError> {
    let id_str: String = r.try_get("id")?;
    let project_id_str: String = r.try_get("project_id")?;
    let platform_str: String = r.try_get("platform")?;
    let env_str: String = r.try_get("env")?;
    let created_ms: i64 = r.try_get("created_at")?;

    Ok(Deployment {
        id: id_str
            .parse()
            .map_err(|e: ulid::DecodeError| StorageError::Parse(e.to_string()))?,
        project_id: project_id_str
            .parse()
            .map_err(|e: ulid::DecodeError| StorageError::Parse(e.to_string()))?,
        url: r.try_get("url")?,
        platform: str_to_platform(&platform_str)?,
        env: str_to_env(&env_str)?,
        created_at: ms_to_dt(created_ms)?,
    })
}

fn platform_to_str(p: DeploymentPlatform) -> &'static str {
    match p {
        DeploymentPlatform::Vercel => "vercel",
        DeploymentPlatform::Railway => "railway",
        DeploymentPlatform::Fly => "fly",
        DeploymentPlatform::Netlify => "netlify",
        DeploymentPlatform::Other => "other",
    }
}

fn str_to_platform(s: &str) -> Result<DeploymentPlatform, StorageError> {
    match s {
        "vercel" => Ok(DeploymentPlatform::Vercel),
        "railway" => Ok(DeploymentPlatform::Railway),
        "fly" => Ok(DeploymentPlatform::Fly),
        "netlify" => Ok(DeploymentPlatform::Netlify),
        "other" => Ok(DeploymentPlatform::Other),
        other => Err(StorageError::Parse(format!("unknown platform: {other}"))),
    }
}

fn env_to_str(env: Env) -> &'static str {
    match env {
        Env::Dev => "dev",
        Env::Staging => "staging",
        Env::Prod => "prod",
    }
}

fn str_to_env(s: &str) -> Result<Env, StorageError> {
    match s {
        "dev" => Ok(Env::Dev),
        "staging" => Ok(Env::Staging),
        "prod" => Ok(Env::Prod),
        other => Err(StorageError::Parse(format!("unknown env: {other}"))),
    }
}
