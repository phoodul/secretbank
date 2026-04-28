//! Match `DependencyDeclaration`s to `PackageAdvisory`s.
//!
//! 단순 1:1 — (ecosystem, name) 일치 + (TODO: M20-3 advanced) version 이
//! advisory 의 affected_range 안에 들어오는지. 현재 구현은 keyword/range
//! 검사 없이 단순 매칭 (range 검증 없는 best-effort).

use crate::advisory::PackageAdvisory;
use crate::range_eval::version_in_range;
use crate::DependencyDeclaration;

#[derive(Debug, Clone, PartialEq)]
pub struct MatchResult {
    pub dep_index: usize,
    pub advisory_index: usize,
    /// version 이 advisory 의 affected_range 안에 있는지. None 이면 advisory
    /// 가 range 정보를 안 줬거나 우리가 못 읽은 케이스 (보수적으로 true).
    pub in_range: bool,
}

/// Cross-product 매칭. caller 가 deps + advisories 를 동시 보유. 결과는
/// (deps[i] ↔ advisories[j]) pairs.
///
/// 매칭 규칙 (M20 v2):
///   - ecosystem + package name 일치
///   - version 가 affected_range 안 (semver range 평가). 범위 밖이면 매칭
///     자체에서 제외 — 호출자는 in_range 가 false 인 결과는 받지 않는다.
pub fn match_advisories(
    deps: &[DependencyDeclaration],
    advisories: &[PackageAdvisory],
) -> Vec<MatchResult> {
    let mut out = Vec::new();
    for (i, d) in deps.iter().enumerate() {
        for (j, a) in advisories.iter().enumerate() {
            if d.ecosystem != a.ecosystem
                || !d.name.eq_ignore_ascii_case(&a.package_name)
            {
                continue;
            }
            let in_range = match a.affected_range.as_deref() {
                Some(r) => version_in_range(&d.version, r, d.ecosystem),
                None => true,
            };
            if !in_range {
                continue;
            }
            out.push(MatchResult {
                dep_index: i,
                advisory_index: j,
                in_range,
            });
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

    #[test]
    fn version_outside_range_excluded() {
        let mut d = dep("axios", Ecosystem::Npm);
        d.version = "2.0.0".into();
        let mut a = adv("axios", Ecosystem::Npm);
        a.affected_range = Some(">=0 <1.0.4".into());
        assert_eq!(match_advisories(&[d], &[a]).len(), 0);
    }

    #[test]
    fn version_inside_range_included() {
        let mut d = dep("axios", Ecosystem::Npm);
        d.version = "1.0.3".into();
        let mut a = adv("axios", Ecosystem::Npm);
        a.affected_range = Some(">=0 <1.0.4".into());
        let res = match_advisories(&[d], &[a]);
        assert_eq!(res.len(), 1);
        assert!(res[0].in_range);
    }

    #[test]
    fn no_range_info_still_matches() {
        let d = dep("axios", Ecosystem::Npm);
        let a = adv("axios", Ecosystem::Npm); // affected_range = None
        assert_eq!(match_advisories(&[d], &[a]).len(), 1);
    }
}
