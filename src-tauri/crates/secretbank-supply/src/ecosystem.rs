use serde::{Deserialize, Serialize};
use thiserror::Error;

/// Package ecosystem — OSV.dev 의 ecosystem string 과 일치.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "lowercase")]
pub enum Ecosystem {
    Npm,
    PyPI,
    Cargo,
    GoMod,
    Maven,
}

impl Ecosystem {
    /// OSV.dev API 가 기대하는 형식 — "npm" / "PyPI" / "crates.io" / "Go" / "Maven".
    pub fn osv_name(&self) -> &'static str {
        match self {
            Self::Npm => "npm",
            Self::PyPI => "PyPI",
            Self::Cargo => "crates.io",
            Self::GoMod => "Go",
            Self::Maven => "Maven",
        }
    }

    /// SQLite 컬럼 / DB 직렬화 형식 — 항상 lowercase.
    pub fn db_name(&self) -> &'static str {
        match self {
            Self::Npm => "npm",
            Self::PyPI => "pypi",
            Self::Cargo => "cargo",
            Self::GoMod => "gomod",
            Self::Maven => "maven",
        }
    }
}

#[derive(Debug, Error)]
pub enum ParseEcosystemError {
    #[error("unknown ecosystem: {0}")]
    Unknown(String),
}

impl std::str::FromStr for Ecosystem {
    type Err = ParseEcosystemError;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_ascii_lowercase().as_str() {
            "npm" => Ok(Self::Npm),
            "pypi" => Ok(Self::PyPI),
            "cargo" | "crates.io" | "crates" => Ok(Self::Cargo),
            "gomod" | "go" => Ok(Self::GoMod),
            "maven" => Ok(Self::Maven),
            other => Err(ParseEcosystemError::Unknown(other.to_owned())),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::str::FromStr as _;

    #[test]
    fn osv_name_matches_spec() {
        assert_eq!(Ecosystem::Npm.osv_name(), "npm");
        assert_eq!(Ecosystem::PyPI.osv_name(), "PyPI");
        assert_eq!(Ecosystem::Cargo.osv_name(), "crates.io");
    }

    #[test]
    fn db_name_is_lowercase() {
        for e in [
            Ecosystem::Npm,
            Ecosystem::PyPI,
            Ecosystem::Cargo,
            Ecosystem::GoMod,
            Ecosystem::Maven,
        ] {
            let n = e.db_name();
            assert_eq!(n, n.to_lowercase(), "db_name must be lowercase: {n}");
        }
    }

    #[test]
    fn from_str_accepts_aliases() {
        assert_eq!(Ecosystem::from_str("npm").unwrap(), Ecosystem::Npm);
        assert_eq!(Ecosystem::from_str("PyPI").unwrap(), Ecosystem::PyPI);
        assert_eq!(Ecosystem::from_str("crates.io").unwrap(), Ecosystem::Cargo);
        assert_eq!(Ecosystem::from_str("Go").unwrap(), Ecosystem::GoMod);
    }

    #[test]
    fn from_str_rejects_unknown() {
        assert!(Ecosystem::from_str("rubygems").is_err());
    }
}
