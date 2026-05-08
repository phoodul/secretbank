//! Supply chain repos — package / package_advisory / package_usage.
//!
//! M20-3 의 storage layer. command 가 manifest 파싱 + OSV query 결과를
//! 받아 본 repo 들로 upsert. UI / MCP 가 read.

use serde::{Deserialize, Serialize};
use sqlx::Row;
use ulid::Ulid;

use crate::sqlite::{SqlitePool, StorageError};

// ---------------------------------------------------------------------------
// Package
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PackageRow {
    pub id: String,
    pub ecosystem: String,
    pub name: String,
    pub first_seen_at: i64,
    pub last_seen_at: i64,
}

pub struct PackageRepo<'a> {
    pool: &'a SqlitePool,
}

impl<'a> PackageRepo<'a> {
    pub fn new(pool: &'a SqlitePool) -> Self {
        Self { pool }
    }

    /// (ecosystem, name) UNIQUE 기준 upsert. 새 row 면 INSERT, 기존이면
    /// last_seen_at 갱신.
    pub async fn upsert(
        &self,
        ecosystem: &str,
        name: &str,
        now_ms: i64,
    ) -> Result<String, StorageError> {
        let id = Ulid::new().to_string();
        let row = sqlx::query(
            r#"INSERT INTO package (id, ecosystem, name, first_seen_at, last_seen_at)
               VALUES (?, ?, ?, ?, ?)
               ON CONFLICT (ecosystem, name) DO UPDATE
                 SET last_seen_at = excluded.last_seen_at
               RETURNING id"#,
        )
        .bind(&id)
        .bind(ecosystem)
        .bind(name)
        .bind(now_ms)
        .bind(now_ms)
        .fetch_one(self.pool)
        .await?;
        Ok(row.try_get::<String, _>("id")?)
    }

    pub async fn list(&self) -> Result<Vec<PackageRow>, StorageError> {
        let rows = sqlx::query(
            "SELECT id, ecosystem, name, first_seen_at, last_seen_at
             FROM package ORDER BY ecosystem ASC, name ASC",
        )
        .fetch_all(self.pool)
        .await?;
        let mut out = Vec::with_capacity(rows.len());
        for r in rows {
            out.push(PackageRow {
                id: r.try_get("id")?,
                ecosystem: r.try_get("ecosystem")?,
                name: r.try_get("name")?,
                first_seen_at: r.try_get("first_seen_at")?,
                last_seen_at: r.try_get("last_seen_at")?,
            });
        }
        Ok(out)
    }
}

// ---------------------------------------------------------------------------
// Package advisory
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PackageAdvisoryRow {
    pub id: String,
    pub package_id: String,
    pub source: String,
    pub source_id: String,
    pub severity: String,
    pub category: String,
    pub summary: String,
    pub detail: Option<String>,
    pub affected_range: Option<String>,
    pub published_at: i64,
    pub modified_at: i64,
    pub references_json: Option<String>,
}

pub struct PackageAdvisoryRepo<'a> {
    pool: &'a SqlitePool,
}

impl<'a> PackageAdvisoryRepo<'a> {
    pub fn new(pool: &'a SqlitePool) -> Self {
        Self { pool }
    }

    /// (source, source_id) UNIQUE 기준 upsert. 갱신 시 modified_at 등 변경.
    #[allow(clippy::too_many_arguments)]
    pub async fn upsert(
        &self,
        package_id: &str,
        source: &str,
        source_id: &str,
        severity: &str,
        category: &str,
        summary: &str,
        detail: Option<&str>,
        affected_range: Option<&str>,
        published_at: i64,
        modified_at: i64,
        references_json: Option<&str>,
    ) -> Result<String, StorageError> {
        let id = Ulid::new().to_string();
        let row = sqlx::query(
            r#"INSERT INTO package_advisory
               (id, package_id, source, source_id, severity, category, summary, detail,
                affected_range, published_at, modified_at, references_json)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT (source, source_id) DO UPDATE SET
                 severity = excluded.severity,
                 category = excluded.category,
                 summary = excluded.summary,
                 detail = excluded.detail,
                 affected_range = excluded.affected_range,
                 modified_at = excluded.modified_at,
                 references_json = excluded.references_json
               RETURNING id"#,
        )
        .bind(&id)
        .bind(package_id)
        .bind(source)
        .bind(source_id)
        .bind(severity)
        .bind(category)
        .bind(summary)
        .bind(detail)
        .bind(affected_range)
        .bind(published_at)
        .bind(modified_at)
        .bind(references_json)
        .fetch_one(self.pool)
        .await?;
        Ok(row.try_get("id")?)
    }

    pub async fn list_for_package(
        &self,
        package_id: &str,
    ) -> Result<Vec<PackageAdvisoryRow>, StorageError> {
        let rows = sqlx::query(
            "SELECT id, package_id, source, source_id, severity, category, summary, detail,
                    affected_range, published_at, modified_at, references_json
             FROM package_advisory WHERE package_id = ? ORDER BY published_at DESC",
        )
        .bind(package_id)
        .fetch_all(self.pool)
        .await?;
        let mut out = Vec::with_capacity(rows.len());
        for r in rows {
            out.push(PackageAdvisoryRow {
                id: r.try_get("id")?,
                package_id: r.try_get("package_id")?,
                source: r.try_get("source")?,
                source_id: r.try_get("source_id")?,
                severity: r.try_get("severity")?,
                category: r.try_get("category")?,
                summary: r.try_get("summary")?,
                detail: r.try_get("detail").ok(),
                affected_range: r.try_get("affected_range").ok(),
                published_at: r.try_get("published_at")?,
                modified_at: r.try_get("modified_at")?,
                references_json: r.try_get("references_json").ok(),
            });
        }
        Ok(out)
    }
}

// ---------------------------------------------------------------------------
// Package usage
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PackageUsageRow {
    pub id: String,
    pub project_id: String,
    pub package_id: String,
    pub version: String,
    pub manifest_path: Option<String>,
    pub detected_at: i64,
    pub dep_kind: String,
}

pub struct PackageUsageRepo<'a> {
    pool: &'a SqlitePool,
}

impl<'a> PackageUsageRepo<'a> {
    pub fn new(pool: &'a SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn upsert(
        &self,
        project_id: &str,
        package_id: &str,
        version: &str,
        manifest_path: Option<&str>,
        detected_at: i64,
        dep_kind: &str,
    ) -> Result<String, StorageError> {
        let id = Ulid::new().to_string();
        let row = sqlx::query(
            r#"INSERT INTO package_usage
               (id, project_id, package_id, version, manifest_path, detected_at, dep_kind)
               VALUES (?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT (project_id, package_id, manifest_path) DO UPDATE SET
                 version = excluded.version,
                 detected_at = excluded.detected_at,
                 dep_kind = excluded.dep_kind
               RETURNING id"#,
        )
        .bind(&id)
        .bind(project_id)
        .bind(package_id)
        .bind(version)
        .bind(manifest_path)
        .bind(detected_at)
        .bind(dep_kind)
        .fetch_one(self.pool)
        .await?;
        Ok(row.try_get("id")?)
    }

    pub async fn list_for_project(
        &self,
        project_id: &str,
    ) -> Result<Vec<PackageUsageRow>, StorageError> {
        let rows = sqlx::query(
            "SELECT id, project_id, package_id, version, manifest_path, detected_at, dep_kind
             FROM package_usage WHERE project_id = ? ORDER BY detected_at DESC",
        )
        .bind(project_id)
        .fetch_all(self.pool)
        .await?;
        let mut out = Vec::with_capacity(rows.len());
        for r in rows {
            out.push(PackageUsageRow {
                id: r.try_get("id")?,
                project_id: r.try_get("project_id")?,
                package_id: r.try_get("package_id")?,
                version: r.try_get("version")?,
                manifest_path: r.try_get("manifest_path").ok(),
                detected_at: r.try_get("detected_at")?,
                dep_kind: r.try_get("dep_kind")?,
            });
        }
        Ok(out)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sqlite::init_pool;

    async fn pool() -> (tempfile::TempDir, SqlitePool) {
        let dir = tempfile::tempdir().unwrap();
        let p = init_pool(&dir.path().join("t.db")).await.unwrap();
        (dir, p)
    }

    async fn seed_project(pool: &SqlitePool, id: &str) {
        sqlx::query(
            "INSERT INTO project (id, name, repo_url, framework, runtime, local_path, created_at, updated_at)
             VALUES (?, ?, NULL, NULL, NULL, NULL, ?, ?)",
        )
        .bind(id)
        .bind(format!("proj-{id}"))
        .bind(0_i64)
        .bind(0_i64)
        .execute(pool)
        .await
        .unwrap();
    }

    #[tokio::test]
    async fn package_upsert_returns_same_id_on_duplicate_eco_name() {
        let (_dir, p) = pool().await;
        let r = PackageRepo::new(&p);
        let id1 = r.upsert("npm", "axios", 100).await.unwrap();
        let id2 = r.upsert("npm", "axios", 200).await.unwrap();
        assert_eq!(id1, id2, "ON CONFLICT must keep original id");
        let list = r.list().await.unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].last_seen_at, 200);
    }

    #[tokio::test]
    async fn advisory_upsert_dedup_by_source_pair() {
        let (_dir, p) = pool().await;
        let pkg = PackageRepo::new(&p)
            .upsert("npm", "axios", 100)
            .await
            .unwrap();
        let r = PackageAdvisoryRepo::new(&p);
        let id1 = r
            .upsert(
                &pkg,
                "osv",
                "GHSA-1",
                "high",
                "secret_leak",
                "summary",
                None,
                None,
                1,
                1,
                None,
            )
            .await
            .unwrap();
        let id2 = r
            .upsert(
                &pkg,
                "osv",
                "GHSA-1",
                "critical",
                "secret_leak",
                "summary v2",
                None,
                None,
                1,
                2,
                None,
            )
            .await
            .unwrap();
        assert_eq!(id1, id2);
        let advs = r.list_for_package(&pkg).await.unwrap();
        assert_eq!(advs.len(), 1);
        assert_eq!(advs[0].severity, "critical");
        assert_eq!(advs[0].summary, "summary v2");
    }

    #[tokio::test]
    async fn package_usage_upsert_dedup_by_project_pkg_manifest() {
        let (_dir, p) = pool().await;
        seed_project(&p, "prj_test").await;
        let pkg = PackageRepo::new(&p)
            .upsert("npm", "axios", 100)
            .await
            .unwrap();
        let r = PackageUsageRepo::new(&p);
        let id1 = r
            .upsert("prj_test", &pkg, "1.0.0", Some("package.json"), 100, "prod")
            .await
            .unwrap();
        let id2 = r
            .upsert("prj_test", &pkg, "1.1.0", Some("package.json"), 200, "prod")
            .await
            .unwrap();
        assert_eq!(id1, id2);
        let usages = r.list_for_project("prj_test").await.unwrap();
        assert_eq!(usages.len(), 1);
        assert_eq!(usages[0].version, "1.1.0");
    }
}
