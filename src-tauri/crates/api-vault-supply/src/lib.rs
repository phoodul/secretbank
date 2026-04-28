//! `api-vault-supply` — supply chain risk graph.
//!
//! M20 의 핵심 차별화: dependency graph 를 외부 package 까지 확장. 1Password
//! / Doppler / Infisical 도 못 하는 "이 npm 패키지가 secret leak history 가
//! 있다 → 이 프로젝트가 그 패키지를 쓴다 → 이 credential 이 위험" cross-
//! domain blast radius.
//!
//! 본 crate 의 책임:
//!   - DependencyDeclaration 모델 (M20-2 에서 매니페스트 파서가 채움)
//!   - PackageAdvisory 모델 (OSV.dev / GHSA / 자체 큐레이션)
//!   - 매칭 엔진 (M20-3) — package + version → advisory list
//!   - 외부 API (osv.dev) 클라이언트 (M20-3)
//!
//! Tauri 통합 / UI 는 api-vault-app 에서.

pub mod advisory;
pub mod ecosystem;
pub mod lockfile;
pub mod manifest;
pub mod matcher;
pub mod range_eval;

pub use advisory::{
    AdvisoryCategory, AdvisorySeverity, OsvClient, OsvClientError, PackageAdvisory,
};
pub use ecosystem::{Ecosystem, ParseEcosystemError};
pub use lockfile::{
    apply_resolved, parse_cargo_lock, parse_package_lock_json, parse_pnpm_lock_yaml,
    ResolvedVersions,
};
pub use matcher::{match_advisories, MatchResult};
pub use range_eval::version_in_range;

use serde::{Deserialize, Serialize};
use thiserror::Error;

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------

/// 한 매니페스트에서 추출된 의존성. M20-2 의 파서 산출.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DependencyDeclaration {
    pub ecosystem: Ecosystem,
    pub name: String,
    /// Resolved version (e.g., "1.4.2"). Range 가 아닌 lockfile 기준 단일.
    pub version: String,
    /// dev / optional 등 영향 범위. prod 가 가장 risk 큼.
    pub kind: DependencyKind,
    pub manifest_path: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum DependencyKind {
    Prod,
    Dev,
    Optional,
    Peer,
}

impl DependencyKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Prod => "prod",
            Self::Dev => "dev",
            Self::Optional => "optional",
            Self::Peer => "peer",
        }
    }
}

#[derive(Debug, Error)]
pub enum SupplyError {
    #[error("ecosystem: {0}")]
    Ecosystem(#[from] ParseEcosystemError),
    #[error("osv: {0}")]
    Osv(#[from] OsvClientError),
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("manifest parse: {0}")]
    Manifest(String),
}
