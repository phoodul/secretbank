//! M20-3 — Supply chain Tauri 커맨드.
//!
//! `supply_scan_project(project_id, project_path)`:
//!   - 매니페스트 발견 (package.json / Cargo.toml — 향후 pnpm-lock / pyproject)
//!   - DependencyDeclaration 추출
//!   - package + package_usage upsert
//!   - OSV.dev 에 (ecosystem, name, version) 별 query (best-effort, 실패해도
//!     scan 자체는 성공으로 보고)
//!   - package_advisory upsert + match
//!   - 결과 SupplyScanReport 반환
//!
//! `supply_list_advisories(project_id?)`:
//!   - project 의 모든 package_usage 가 매칭되는 advisory list 반환
//!     (UI 가 risk 페이지로 표시)

use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::State;
use thiserror::Error;
use time::OffsetDateTime;

use api_vault_core::ProjectId;
use api_vault_storage::sqlite::repositories::supply::{
    PackageAdvisoryRepo, PackageRepo, PackageUsageRepo,
};
use api_vault_supply::advisory::{AdvisoryCategory, AdvisorySeverity, OsvClient};
use api_vault_supply::lockfile::{
    apply_resolved, parse_cargo_lock, parse_package_lock_json, parse_pnpm_lock_yaml,
    ResolvedVersions,
};
use api_vault_supply::manifest::{parse_cargo_toml, parse_package_json};
use api_vault_supply::matcher::match_advisories;
use api_vault_supply::DependencyDeclaration;

use crate::context::AppContext;

#[derive(Debug, Error, Serialize)]
#[serde(tag = "code", rename_all = "snake_case")]
pub enum SupplyCommandError {
    #[error("project_path does not exist: {path}")]
    PathNotFound { path: String },
    #[error("invalid project id: {message}")]
    InvalidProjectId { message: String },
    #[error("manifest parse: {message}")]
    Manifest { message: String },
    #[error("storage: {message}")]
    Storage { message: String },
    #[error("internal: {message}")]
    Internal { message: String },
}

#[derive(Debug, Serialize)]
pub struct SupplyScanReport {
    pub project_id: String,
    pub manifests_found: u32,
    pub packages_seen: u32,
    pub advisories_matched: u32,
    pub osv_query_failures: u32,
    pub matched: Vec<MatchedAdvisoryDto>,
}

#[derive(Debug, Serialize)]
pub struct MatchedAdvisoryDto {
    pub package_name: String,
    pub ecosystem: String,
    pub version: String,
    pub manifest_path: String,
    pub source_id: String,
    pub severity: String,
    pub category: String,
    pub summary: String,
}

fn now_ms() -> i64 {
    let t = OffsetDateTime::now_utc();
    t.unix_timestamp() * 1_000 + i64::from(t.millisecond())
}

fn discover_manifests(root: &Path) -> Vec<(PathBuf, &'static str)> {
    let mut out = Vec::new();
    for (rel, kind) in [("package.json", "npm"), ("Cargo.toml", "cargo")] {
        let p = root.join(rel);
        if p.exists() {
            out.push((p, kind));
        }
    }
    out
}

/// Best-effort lockfile resolution. 깨진 파일은 warning + 계속.
fn collect_resolved_versions(root: &Path) -> ResolvedVersions {
    let mut out = ResolvedVersions::new();

    let pkg_lock = root.join("package-lock.json");
    if pkg_lock.exists() {
        match parse_package_lock_json(&pkg_lock) {
            Ok(r) => out.extend(r),
            Err(e) => tracing::warn!(error = %e, "package-lock.json parse failed"),
        }
    }

    let pnpm_lock = root.join("pnpm-lock.yaml");
    if pnpm_lock.exists() {
        match parse_pnpm_lock_yaml(&pnpm_lock) {
            Ok(r) => {
                for (k, v) in r {
                    out.entry(k).or_insert(v);
                }
            }
            Err(e) => tracing::warn!(error = %e, "pnpm-lock.yaml parse failed"),
        }
    }

    let cargo_lock = root.join("Cargo.lock");
    if cargo_lock.exists() {
        match parse_cargo_lock(&cargo_lock) {
            Ok(r) => out.extend(r),
            Err(e) => tracing::warn!(error = %e, "Cargo.lock parse failed"),
        }
    }

    out
}

fn parse_manifest(
    path: &Path,
    kind: &str,
) -> Result<Vec<DependencyDeclaration>, SupplyCommandError> {
    match kind {
        "npm" => parse_package_json(path).map_err(|e| SupplyCommandError::Manifest {
            message: e.to_string(),
        }),
        "cargo" => parse_cargo_toml(path).map_err(|e| SupplyCommandError::Manifest {
            message: e.to_string(),
        }),
        _ => Ok(vec![]),
    }
}

#[tauri::command]
pub async fn supply_scan_project(
    project_id: String,
    project_path: String,
    state: State<'_, AppContext>,
) -> Result<SupplyScanReport, SupplyCommandError> {
    let _project_id_parsed: ProjectId =
        project_id
            .parse()
            .map_err(|e: <ProjectId as std::str::FromStr>::Err| {
                SupplyCommandError::InvalidProjectId {
                    message: e.to_string(),
                }
            })?;
    let root = std::path::PathBuf::from(&project_path);
    if !root.exists() {
        return Err(SupplyCommandError::PathNotFound { path: project_path });
    }

    let manifests = discover_manifests(&root);
    let mut all_deps: Vec<DependencyDeclaration> = Vec::new();
    for (path, kind) in &manifests {
        let mut ds = parse_manifest(path, kind)?;
        all_deps.append(&mut ds);
    }

    // M20 v2 — lockfile resolve: range string → 단일 version
    let resolved = collect_resolved_versions(&root);
    if !resolved.is_empty() {
        apply_resolved(&mut all_deps, &resolved);
    }

    // upsert package + package_usage.
    let now = now_ms();
    let pkg_repo = PackageRepo::new(&state.pool);
    let usage_repo = PackageUsageRepo::new(&state.pool);
    let mut package_ids: Vec<String> = Vec::with_capacity(all_deps.len());
    for d in &all_deps {
        let pid = pkg_repo
            .upsert(d.ecosystem.db_name(), &d.name, now)
            .await
            .map_err(|e| SupplyCommandError::Storage {
                message: e.to_string(),
            })?;
        usage_repo
            .upsert(
                &project_id,
                &pid,
                &d.version,
                Some(&d.manifest_path),
                now,
                d.kind.as_str(),
            )
            .await
            .map_err(|e| SupplyCommandError::Storage {
                message: e.to_string(),
            })?;
        package_ids.push(pid);
    }

    // OSV.dev query — best-effort. version 이 "workspace" / "path" / "git"
    // 같은 placeholder 면 query skip.
    let osv = OsvClient::new();
    let adv_repo = PackageAdvisoryRepo::new(&state.pool);
    let mut all_advisories: Vec<api_vault_supply::PackageAdvisory> = Vec::new();
    let mut osv_failures: u32 = 0;
    for (i, d) in all_deps.iter().enumerate() {
        if matches!(d.version.as_str(), "workspace" | "path" | "git" | "*") {
            continue;
        }
        match osv.query(d.ecosystem, &d.name, &d.version).await {
            Ok(list) => {
                for a in list {
                    let refs_json = serde_json::to_string(&a.references).ok();
                    if let Err(e) = adv_repo
                        .upsert(
                            &package_ids[i],
                            &a.source,
                            &a.source_id,
                            severity_label(a.severity),
                            category_label(a.category),
                            &a.summary,
                            a.detail.as_deref(),
                            a.affected_range.as_deref(),
                            a.published_at_ms,
                            a.modified_at_ms,
                            refs_json.as_deref(),
                        )
                        .await
                    {
                        tracing::warn!(error = %e, "advisory upsert failed — skipping");
                        continue;
                    }
                    all_advisories.push(a);
                }
            }
            Err(e) => {
                tracing::warn!(
                    package = %d.name,
                    error = %e,
                    "OSV query failed — skipping (advisory data may be stale)"
                );
                osv_failures += 1;
            }
        }
    }

    let matches = match_advisories(&all_deps, &all_advisories);
    let matched_dtos: Vec<MatchedAdvisoryDto> = matches
        .into_iter()
        .map(|m| {
            let d = &all_deps[m.dep_index];
            let a = &all_advisories[m.advisory_index];
            MatchedAdvisoryDto {
                package_name: d.name.clone(),
                ecosystem: d.ecosystem.db_name().to_owned(),
                version: d.version.clone(),
                manifest_path: d.manifest_path.clone(),
                source_id: a.source_id.clone(),
                severity: severity_label(a.severity).to_owned(),
                category: category_label(a.category).to_owned(),
                summary: a.summary.clone(),
            }
        })
        .collect();

    Ok(SupplyScanReport {
        project_id: project_id.clone(),
        manifests_found: manifests.len() as u32,
        packages_seen: all_deps.len() as u32,
        advisories_matched: matched_dtos.len() as u32,
        osv_query_failures: osv_failures,
        matched: matched_dtos,
    })
}

fn severity_label(s: AdvisorySeverity) -> &'static str {
    match s {
        AdvisorySeverity::Low => "low",
        AdvisorySeverity::Medium => "medium",
        AdvisorySeverity::High => "high",
        AdvisorySeverity::Critical => "critical",
    }
}

fn category_label(c: AdvisoryCategory) -> &'static str {
    match c {
        AdvisoryCategory::SecretLeak => "secret_leak",
        AdvisoryCategory::CryptoWeak => "crypto_weak",
        AdvisoryCategory::SupplyChain => "supply_chain",
        AdvisoryCategory::Other => "other",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn discover_manifests_finds_existing_files() {
        let dir = tempfile::tempdir().unwrap();
        let pkg = dir.path().join("package.json");
        std::fs::write(&pkg, "{}").unwrap();
        let m = discover_manifests(dir.path());
        assert!(m.iter().any(|(p, _)| p == &pkg));
    }

    #[test]
    fn discover_manifests_empty_for_unrelated_dir() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("README.md"), "# hi").unwrap();
        let m = discover_manifests(dir.path());
        assert!(m.is_empty());
    }

    #[test]
    fn severity_and_category_labels_round_trip() {
        for s in [
            AdvisorySeverity::Low,
            AdvisorySeverity::Medium,
            AdvisorySeverity::High,
            AdvisorySeverity::Critical,
        ] {
            assert!(!severity_label(s).is_empty());
        }
        for c in [
            AdvisoryCategory::SecretLeak,
            AdvisoryCategory::CryptoWeak,
            AdvisoryCategory::SupplyChain,
            AdvisoryCategory::Other,
        ] {
            assert!(!category_label(c).is_empty());
        }
    }
}
