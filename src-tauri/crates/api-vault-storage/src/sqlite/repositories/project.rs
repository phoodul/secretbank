use api_vault_core::{Project, ProjectId, ProjectInput, ProjectPatch};
use sqlx::{Row, SqlitePool};
use time::OffsetDateTime;

use crate::sqlite::{dt_to_ms, ms_to_dt, StorageError};

pub struct ProjectRepo<'a> {
    pool: &'a SqlitePool,
}

impl<'a> ProjectRepo<'a> {
    pub fn new(pool: &'a SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn insert(&self, input: &ProjectInput) -> Result<ProjectId, StorageError> {
        let id = ProjectId::new();
        let id_str = id.to_string();
        let now = dt_to_ms(OffsetDateTime::now_utc());

        sqlx::query(
            r#"INSERT INTO project (id, name, repo_url, framework, runtime, local_path, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)"#,
        )
        .bind(&id_str)
        .bind(&input.name)
        .bind(&input.repo_url)
        .bind(&input.framework)
        .bind(&input.runtime)
        .bind(&input.local_path)
        .bind(now)
        .bind(now)
        .execute(self.pool)
        .await?;

        Ok(id)
    }

    pub async fn get_by_id(&self, id: ProjectId) -> Result<Option<Project>, StorageError> {
        let id_str = id.to_string();
        let row = sqlx::query(
            r#"SELECT id, name, repo_url, framework, runtime, local_path, created_at, updated_at
               FROM project WHERE id = ?"#,
        )
        .bind(&id_str)
        .fetch_optional(self.pool)
        .await?;

        row.map(|r| row_to_project(&r)).transpose()
    }

    pub async fn list(&self) -> Result<Vec<Project>, StorageError> {
        let rows = sqlx::query(
            r#"SELECT id, name, repo_url, framework, runtime, local_path, created_at, updated_at
               FROM project ORDER BY name ASC"#,
        )
        .fetch_all(self.pool)
        .await?;

        rows.iter().map(row_to_project).collect()
    }

    pub async fn update(&self, id: ProjectId, patch: &ProjectPatch) -> Result<(), StorageError> {
        let id_str = id.to_string();
        let mut qb = sqlx::QueryBuilder::new("UPDATE project SET ");
        let mut first = true;

        macro_rules! push_field {
            ($col:expr, $val:expr) => {
                if !first {
                    qb.push(", ");
                }
                qb.push($col);
                qb.push(" = ");
                qb.push_bind($val);
                first = false;
            };
        }

        if let Some(ref name) = patch.name {
            push_field!("name", name.clone());
        }
        if let Some(ref url) = patch.repo_url {
            push_field!("repo_url", url.clone());
        }
        if let Some(ref fw) = patch.framework {
            push_field!("framework", fw.clone());
        }
        if let Some(ref rt) = patch.runtime {
            push_field!("runtime", rt.clone());
        }
        if let Some(ref lp) = patch.local_path {
            push_field!("local_path", lp.clone());
        }

        if first {
            return Ok(());
        }

        let now = dt_to_ms(OffsetDateTime::now_utc());
        qb.push(", updated_at = ");
        qb.push_bind(now);
        qb.push(" WHERE id = ");
        qb.push_bind(id_str);

        qb.build().execute(self.pool).await?;
        Ok(())
    }

    pub async fn delete(&self, id: ProjectId) -> Result<(), StorageError> {
        let id_str = id.to_string();
        sqlx::query("DELETE FROM project WHERE id = ?")
            .bind(&id_str)
            .execute(self.pool)
            .await?;
        Ok(())
    }
}

fn row_to_project(r: &sqlx::sqlite::SqliteRow) -> Result<Project, StorageError> {
    let id_str: String = r.try_get("id")?;
    let created_ms: i64 = r.try_get("created_at")?;
    let updated_ms: i64 = r.try_get("updated_at")?;

    Ok(Project {
        id: id_str
            .parse()
            .map_err(|e: ulid::DecodeError| StorageError::Parse(e.to_string()))?,
        name: r.try_get("name")?,
        repo_url: r.try_get("repo_url")?,
        framework: r.try_get("framework")?,
        runtime: r.try_get("runtime")?,
        local_path: r.try_get("local_path")?,
        created_at: ms_to_dt(created_ms)?,
        updated_at: ms_to_dt(updated_ms)?,
    })
}
