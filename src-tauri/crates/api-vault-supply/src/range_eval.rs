//! Semver range evaluation for advisory matching.
//!
//! M20 v2 — advisory.affected_range 가 ">=0 <1.0.4" 같은 OSV 표기로 들어온다.
//! 이 모듈은 그 문자열을 파싱해 dep.version 이 실제로 그 범위 안에 있는지
//! 검증한다. ecosystem 별로 버전 의미가 다르지만 (npm/Cargo 는 semver 표준,
//! PyPI/Go/Maven 은 약간 변형) 우리는 npm + Cargo 만 strict 평가하고 나머지는
//! lexical fallback (best-effort) 으로 처리한다.
//!
//! 형식 예시 (OSV 표준):
//!   - `>=0 <1.0.4` — introduced=0, fixed=1.0.4
//!   - `>=1.2.3 <*` — fixed 미지정 (모든 미래 버전 영향)
//!   - `>=1.2.3` — single bound
//!   - `>=0` — 전체

use crate::ecosystem::Ecosystem;
use semver::Version;

/// 범위 안에 들어오면 true. 파싱 실패 시 — 안전한 default 로 true (false-
/// negative 보다 false-positive 우선; 사용자가 "이 advisory 무시" 하는게
/// 모르는 것보다 낫다).
pub fn version_in_range(version: &str, range: &str, ecosystem: Ecosystem) -> bool {
    if range.trim().is_empty() {
        return true;
    }

    match ecosystem {
        Ecosystem::Npm | Ecosystem::Cargo => semver_in_range(version, range),
        // 다른 ecosystem 은 semver 호환이 아닐 수 있어 lexical fallback.
        _ => lexical_in_range(version, range),
    }
}

fn semver_in_range(version: &str, range: &str) -> bool {
    let Ok(v) = parse_loose_semver(version) else {
        return true; // 못 읽으면 보수적으로 매칭
    };

    let bounds = parse_bounds(range);
    if bounds.is_empty() {
        return true;
    }
    bounds.iter().all(|b| b.contains(&v))
}

fn lexical_in_range(version: &str, range: &str) -> bool {
    let bounds = parse_bounds(range);
    if bounds.is_empty() {
        return true;
    }
    bounds.iter().all(|b| b.contains_lexical(version))
}

#[derive(Debug, Clone)]
enum Bound {
    Ge(String),  // >=
    Gt(String),  // >
    Le(String),  // <=
    Lt(String),  // <
    Eq(String),  // =
}

impl Bound {
    fn contains(&self, v: &Version) -> bool {
        let raw = self.raw();
        if raw == "*" || raw == "0" {
            return matches!(self, Self::Ge(_)); // ">=0" 은 항상 true
        }
        let Ok(other) = parse_loose_semver(raw) else {
            return true;
        };
        match self {
            Self::Ge(_) => v >= &other,
            Self::Gt(_) => v > &other,
            Self::Le(_) => v <= &other,
            Self::Lt(_) => v < &other,
            Self::Eq(_) => v == &other,
        }
    }

    fn contains_lexical(&self, v: &str) -> bool {
        let raw = self.raw();
        if raw == "*" {
            return matches!(self, Self::Ge(_));
        }
        match self {
            Self::Ge(_) => v >= raw,
            Self::Gt(_) => v > raw,
            Self::Le(_) => v <= raw,
            Self::Lt(_) => v < raw,
            Self::Eq(_) => v == raw,
        }
    }

    fn raw(&self) -> &str {
        match self {
            Self::Ge(s) | Self::Gt(s) | Self::Le(s) | Self::Lt(s) | Self::Eq(s) => s,
        }
    }
}

fn parse_bounds(range: &str) -> Vec<Bound> {
    let mut out = Vec::new();
    for token in range.split_whitespace() {
        let parsed = if let Some(rest) = token.strip_prefix(">=") {
            Some(Bound::Ge(rest.to_string()))
        } else if let Some(rest) = token.strip_prefix("<=") {
            Some(Bound::Le(rest.to_string()))
        } else if let Some(rest) = token.strip_prefix('>') {
            Some(Bound::Gt(rest.to_string()))
        } else if let Some(rest) = token.strip_prefix('<') {
            Some(Bound::Lt(rest.to_string()))
        } else {
            token.strip_prefix('=').map(|rest| Bound::Eq(rest.to_string()))
        };
        if let Some(b) = parsed {
            // "<*" — fixed 미지정. 무시 (open upper bound = always satisfied).
            if b.raw() == "*" && matches!(b, Bound::Lt(_)) {
                continue;
            }
            out.push(b);
        }
    }
    out
}

/// `1.2.3`, `1.2`, `1` 모두 받아서 `Version` 으로. semver 크레이트는 strict
/// SemVer 만 받지만 OSV 데이터엔 `1.0` 같은 partial 이 흔해서 patch=0 채움.
fn parse_loose_semver(s: &str) -> Result<Version, semver::Error> {
    let s = s.trim();
    // pre-release / build 메타데이터 제거된 핵심만으로 시도
    if let Ok(v) = Version::parse(s) {
        return Ok(v);
    }
    let core = s.split(['-', '+']).next().unwrap_or(s);
    let parts: Vec<&str> = core.split('.').collect();
    let normalized = match parts.len() {
        1 => format!("{}.0.0", parts[0]),
        2 => format!("{}.{}.0", parts[0], parts[1]),
        _ => core.to_string(),
    };
    Version::parse(&normalized)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn npm_in_range() {
        assert!(version_in_range("1.0.3", ">=0 <1.0.4", Ecosystem::Npm));
        assert!(!version_in_range("1.0.4", ">=0 <1.0.4", Ecosystem::Npm));
        assert!(!version_in_range("2.0.0", ">=0 <1.0.4", Ecosystem::Npm));
    }

    #[test]
    fn cargo_in_range() {
        assert!(version_in_range("1.2.3", ">=1.0.0 <2.0.0", Ecosystem::Cargo));
        assert!(!version_in_range("0.9.0", ">=1.0.0 <2.0.0", Ecosystem::Cargo));
    }

    #[test]
    fn open_upper_bound_always_matches_lower() {
        // ">=1.2.3 <*" — fixed 미지정, 1.2.3 이상 항상 true
        assert!(version_in_range("1.2.3", ">=1.2.3 <*", Ecosystem::Npm));
        assert!(version_in_range("99.0.0", ">=1.2.3 <*", Ecosystem::Npm));
        assert!(!version_in_range("1.0.0", ">=1.2.3 <*", Ecosystem::Npm));
    }

    #[test]
    fn empty_range_matches() {
        assert!(version_in_range("1.0.0", "", Ecosystem::Npm));
    }

    #[test]
    fn unparseable_version_is_conservative() {
        // 못 읽으면 매칭 (false-negative 방지)
        assert!(version_in_range("not-a-version", ">=0 <1.0.4", Ecosystem::Npm));
    }

    #[test]
    fn partial_version_normalized() {
        assert!(version_in_range("1.0", ">=1.0.0 <2.0.0", Ecosystem::Npm));
        assert!(version_in_range("1", ">=1.0.0 <2.0.0", Ecosystem::Npm));
    }

    #[test]
    fn pypi_lexical_fallback() {
        assert!(version_in_range("1.0.3", ">=0 <1.0.4", Ecosystem::PyPI));
    }

    #[test]
    fn ge_zero_always_true() {
        assert!(version_in_range("99.99.99", ">=0", Ecosystem::Npm));
    }

    #[test]
    fn pre_release_handled() {
        // "1.0.0-beta" 도 받아야 함 (semver 표준)
        assert!(version_in_range("1.0.0-beta", ">=0 <1.0.0", Ecosystem::Npm));
    }
}
