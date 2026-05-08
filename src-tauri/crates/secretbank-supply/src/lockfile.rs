//! Lockfile parsers — resolve manifest range strings (`^1.4.0`) to single
//! versions (`1.4.7`) so OSV.query / range eval can be precise.
//!
//! 지원:
//!   - `package-lock.json` (npm v3+, "packages" 키)
//!   - `pnpm-lock.yaml` (pnpm v6+)
//!   - `Cargo.lock`
//!
//! 모두 best-effort — lockfile 형식이 깨지면 빈 결과를 반환하고 caller 가
//! 매니페스트 범위 그대로 사용한다 (regression 없음).

use std::collections::HashMap;
use std::path::Path;

use crate::ecosystem::Ecosystem;
use crate::SupplyError;

/// (ecosystem, package_name) → resolved_version.
pub type ResolvedVersions = HashMap<(Ecosystem, String), String>;

/// `package-lock.json` (npm v3+). "packages" 객체 안의 각 키가
/// `node_modules/<name>` 또는 중첩 경로 — value 의 `version` 필드가 정답.
pub fn parse_package_lock_json(path: &Path) -> Result<ResolvedVersions, SupplyError> {
    let raw = std::fs::read_to_string(path)?;
    let parsed: serde_json::Value = serde_json::from_str(&raw)
        .map_err(|e| SupplyError::Manifest(format!("package-lock.json: {e}")))?;
    let mut out = ResolvedVersions::new();

    // npm v7+: packages 키
    if let Some(obj) = parsed.get("packages").and_then(|v| v.as_object()) {
        for (key, val) in obj {
            // 루트 패키지 자체 (key == "") 는 스킵
            if key.is_empty() {
                continue;
            }
            let name = pkg_name_from_path(key);
            let Some(name) = name else {
                continue;
            };
            let Some(ver) = val.get("version").and_then(|v| v.as_str()) else {
                continue;
            };
            out.insert((Ecosystem::Npm, name.to_string()), ver.to_string());
        }
    }

    // npm v3-v6 fallback: dependencies 객체 (재귀)
    if let Some(obj) = parsed.get("dependencies").and_then(|v| v.as_object()) {
        collect_npm_dep_tree(obj, &mut out);
    }

    Ok(out)
}

fn pkg_name_from_path(key: &str) -> Option<&str> {
    // "node_modules/foo" → "foo"
    // "node_modules/@scope/foo" → "@scope/foo"
    // "node_modules/a/node_modules/b" → "b" (중첩 — 마지막)
    let last = key.rsplit("node_modules/").next()?;
    if last.is_empty() {
        None
    } else {
        Some(last)
    }
}

fn collect_npm_dep_tree(
    obj: &serde_json::Map<String, serde_json::Value>,
    out: &mut ResolvedVersions,
) {
    for (name, val) in obj {
        if let Some(ver) = val.get("version").and_then(|v| v.as_str()) {
            out.entry((Ecosystem::Npm, name.clone()))
                .or_insert_with(|| ver.to_string());
        }
        if let Some(nested) = val.get("dependencies").and_then(|v| v.as_object()) {
            collect_npm_dep_tree(nested, out);
        }
    }
}

/// `pnpm-lock.yaml`. v6+ 의 "packages" 키 — 키 자체가 `/<name>@<version>(...)`.
pub fn parse_pnpm_lock_yaml(path: &Path) -> Result<ResolvedVersions, SupplyError> {
    let raw = std::fs::read_to_string(path)?;
    let parsed: serde_yaml::Value = serde_yaml::from_str(&raw)
        .map_err(|e| SupplyError::Manifest(format!("pnpm-lock.yaml: {e}")))?;
    let mut out = ResolvedVersions::new();

    if let Some(map) = parsed.get("packages").and_then(|v| v.as_mapping()) {
        for (key, _val) in map {
            let Some(k) = key.as_str() else { continue };
            if let Some((name, version)) = parse_pnpm_pkg_key(k) {
                out.entry((Ecosystem::Npm, name.to_string()))
                    .or_insert_with(|| version.to_string());
            }
        }
    }

    Ok(out)
}

fn parse_pnpm_pkg_key(key: &str) -> Option<(&str, &str)> {
    // 형식 예시:
    //   /axios@1.7.2
    //   /@scope/foo@2.3.4
    //   /axios@1.7.2(react@18.0.0)
    //   axios@1.7.2 (v9 스타일, leading slash 없음)
    let s = key.strip_prefix('/').unwrap_or(key);
    // peer-dep 메타데이터 제거
    let core = s.split('(').next()?;
    let at = core.rfind('@')?;
    if at == 0 {
        return None; // "@scope/foo" — 잘못된 케이스 방어
    }
    let name = &core[..at];
    let version = &core[at + 1..];
    if name.is_empty() || version.is_empty() {
        None
    } else {
        Some((name, version))
    }
}

/// `Cargo.lock`. `[[package]]` 배열의 각 항목에 name/version.
pub fn parse_cargo_lock(path: &Path) -> Result<ResolvedVersions, SupplyError> {
    let raw = std::fs::read_to_string(path)?;
    let parsed: toml::Value =
        toml::from_str(&raw).map_err(|e| SupplyError::Manifest(format!("Cargo.lock: {e}")))?;
    let mut out = ResolvedVersions::new();

    let Some(packages) = parsed.get("package").and_then(|v| v.as_array()) else {
        return Ok(out);
    };

    for pkg in packages {
        let Some(name) = pkg.get("name").and_then(|v| v.as_str()) else {
            continue;
        };
        let Some(version) = pkg.get("version").and_then(|v| v.as_str()) else {
            continue;
        };
        out.entry((Ecosystem::Cargo, name.to_string()))
            .or_insert_with(|| version.to_string());
    }

    Ok(out)
}

/// manifest 의 [`DependencyDeclaration`] 에 lockfile resolved version 을 덮어
/// 씌운다. 일치 없는 dep 은 그대로 유지 (range string).
pub fn apply_resolved(deps: &mut [crate::DependencyDeclaration], resolved: &ResolvedVersions) {
    for d in deps.iter_mut() {
        if let Some(v) = resolved.get(&(d.ecosystem, d.name.clone())) {
            d.version = v.clone();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn write_tmp(name: &str, contents: &str) -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(name);
        std::fs::File::create(&path)
            .unwrap()
            .write_all(contents.as_bytes())
            .unwrap();
        dir
    }

    #[test]
    fn parse_npm_v7_packages() {
        let json = r#"{
            "name": "demo",
            "lockfileVersion": 3,
            "packages": {
                "": { "name": "demo", "version": "1.0.0" },
                "node_modules/axios": { "version": "1.7.2" },
                "node_modules/@scope/foo": { "version": "2.3.4" }
            }
        }"#;
        let dir = write_tmp("package-lock.json", json);
        let r = parse_package_lock_json(&dir.path().join("package-lock.json")).unwrap();
        assert_eq!(r.get(&(Ecosystem::Npm, "axios".into())).unwrap(), "1.7.2");
        assert_eq!(
            r.get(&(Ecosystem::Npm, "@scope/foo".into())).unwrap(),
            "2.3.4"
        );
    }

    #[test]
    fn parse_npm_v6_dependencies_tree() {
        let json = r#"{
            "name": "demo",
            "lockfileVersion": 1,
            "dependencies": {
                "axios": {
                    "version": "0.21.1",
                    "dependencies": {
                        "follow-redirects": { "version": "1.14.0" }
                    }
                }
            }
        }"#;
        let dir = write_tmp("package-lock.json", json);
        let r = parse_package_lock_json(&dir.path().join("package-lock.json")).unwrap();
        assert_eq!(r.get(&(Ecosystem::Npm, "axios".into())).unwrap(), "0.21.1");
        assert_eq!(
            r.get(&(Ecosystem::Npm, "follow-redirects".into())).unwrap(),
            "1.14.0"
        );
    }

    #[test]
    fn parse_pnpm_v6_keys() {
        let yaml = r#"
lockfileVersion: '6.0'
packages:
  /axios@1.7.2:
    resolution: { integrity: sha512-x }
  /@scope/foo@2.3.4(react@18.0.0):
    resolution: { integrity: sha512-y }
"#;
        let dir = write_tmp("pnpm-lock.yaml", yaml);
        let r = parse_pnpm_lock_yaml(&dir.path().join("pnpm-lock.yaml")).unwrap();
        assert_eq!(r.get(&(Ecosystem::Npm, "axios".into())).unwrap(), "1.7.2");
        assert_eq!(
            r.get(&(Ecosystem::Npm, "@scope/foo".into())).unwrap(),
            "2.3.4"
        );
    }

    #[test]
    fn parse_cargo_lock_packages() {
        let lock = r#"
version = 3

[[package]]
name = "serde"
version = "1.0.197"

[[package]]
name = "tokio"
version = "1.36.0"
"#;
        let dir = write_tmp("Cargo.lock", lock);
        let r = parse_cargo_lock(&dir.path().join("Cargo.lock")).unwrap();
        assert_eq!(
            r.get(&(Ecosystem::Cargo, "serde".into())).unwrap(),
            "1.0.197"
        );
        assert_eq!(
            r.get(&(Ecosystem::Cargo, "tokio".into())).unwrap(),
            "1.36.0"
        );
    }

    #[test]
    fn apply_resolved_overwrites_range_with_concrete_version() {
        use crate::{DependencyDeclaration, DependencyKind};
        let mut deps = vec![DependencyDeclaration {
            ecosystem: Ecosystem::Npm,
            name: "axios".into(),
            version: "^1.4.0".into(),
            kind: DependencyKind::Prod,
            manifest_path: "package.json".into(),
        }];
        let mut resolved = ResolvedVersions::new();
        resolved.insert((Ecosystem::Npm, "axios".into()), "1.7.2".into());
        apply_resolved(&mut deps, &resolved);
        assert_eq!(deps[0].version, "1.7.2");
    }

    #[test]
    fn apply_resolved_keeps_unmatched_unchanged() {
        use crate::{DependencyDeclaration, DependencyKind};
        let mut deps = vec![DependencyDeclaration {
            ecosystem: Ecosystem::Npm,
            name: "left-pad".into(),
            version: "^1.0.0".into(),
            kind: DependencyKind::Prod,
            manifest_path: "package.json".into(),
        }];
        let resolved = ResolvedVersions::new();
        apply_resolved(&mut deps, &resolved);
        assert_eq!(deps[0].version, "^1.0.0");
    }
}
