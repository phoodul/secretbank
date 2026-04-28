//! Match `DependencyDeclaration`s to `PackageAdvisory`s.
//!
//! 단순 1:1 — (ecosystem, name) 일치 + (TODO: M20-3 advanced) version 이
//! advisory 의 affected_range 안에 들어오는지. 현재 구현은 keyword/range
//! 검사 없이 단순 매칭 (range 검증 없는 best-effort).

use crate::advisory::PackageAdvisory;
use crate::DependencyDeclaration;

#[derive(Debug, Clone, PartialEq)]
pub struct MatchResult {
    pub dep_index: usize,
    pub advisory_index: usize,
}

/// Cross-product 매칭. caller 가 deps + advisories 를 동시 보유. 결과는
/// (deps[i] ↔ advisories[j]) pairs.
///
/// 매칭 규칙 (M20-1 단순):
///   - ecosystem + package name 일치
///   - version 가 affected_range 안 (정확한 semver range 평가는 M20-3+ 의
///     range parser 가 도입되면 갈음. 본 함수는 모든 advisory 를 매칭하고
///     UI/호출자가 false-positive 표시).
pub fn match_advisories(
    deps: &[DependencyDeclaration],
    advisories: &[PackageAdvisory],
) -> Vec<MatchResult> {
    let mut out = Vec::new();
    for (i, d) in deps.iter().enumerate() {
        for (j, a) in advisories.iter().enumerate() {
            if d.ecosystem == a.ecosystem
                && d.name.eq_ignore_ascii_case(&a.package_name)
            {
                out.push(MatchResult {
                    dep_index: i,
                    advisory_index: j,
                });
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::advisory::{AdvisoryCategory, AdvisorySeverity};
    use crate::ecosystem::Ecosystem;
    use crate::DependencyKind;

    fn dep(name: &str, eco: Ecosystem) -> DependencyDeclaration {
        DependencyDeclaration {
            ecosystem: eco,
            name: name.into(),
            version: "1.0.0".into(),
            kind: DependencyKind::Prod,
            manifest_path: "package.json".into(),
        }
    }

    fn adv(name: &str, eco: Ecosystem) -> PackageAdvisory {
        PackageAdvisory {
            source: "osv".into(),
            source_id: format!("GHSA-{name}"),
            package_name: name.into(),
            ecosystem: eco,
            severity: AdvisorySeverity::High,
            category: AdvisoryCategory::SecretLeak,
            summary: "test".into(),
            detail: None,
            affected_range: None,
            published_at_ms: 0,
            modified_at_ms: 0,
            references: vec![],
        }
    }

    #[test]
    fn matches_same_ecosystem_and_name() {
        let deps = vec![dep("axios", Ecosystem::Npm)];
        let advs = vec![adv("axios", Ecosystem::Npm)];
        assert_eq!(match_advisories(&deps, &advs).len(), 1);
    }

    #[test]
    fn does_not_match_different_ecosystem() {
        let deps = vec![dep("axios", Ecosystem::Npm)];
        let advs = vec![adv("axios", Ecosystem::Cargo)];
        assert_eq!(match_advisories(&deps, &advs).len(), 0);
    }

    #[test]
    fn does_not_match_different_name() {
        let deps = vec![dep("axios", Ecosystem::Npm)];
        let advs = vec![adv("ax-malicious", Ecosystem::Npm)];
        assert_eq!(match_advisories(&deps, &advs).len(), 0);
    }

    #[test]
    fn matches_case_insensitive_name() {
        let deps = vec![dep("axios", Ecosystem::Npm)];
        let advs = vec![adv("AXIOS", Ecosystem::Npm)];
        assert_eq!(match_advisories(&deps, &advs).len(), 1);
    }

    #[test]
    fn cartesian_emits_multiple_pairs() {
        let deps = vec![
            dep("axios", Ecosystem::Npm),
            dep("axios", Ecosystem::Npm),
        ];
        let advs = vec![
            adv("axios", Ecosystem::Npm),
            adv("axios", Ecosystem::Npm),
        ];
        // 2 × 2 = 4 매칭
        assert_eq!(match_advisories(&deps, &advs).len(), 4);
    }
}
