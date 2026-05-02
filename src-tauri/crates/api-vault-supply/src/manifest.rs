//! Manifest parsers — turn `package.json` / `Cargo.toml` 등 매니페스트
//! 파일을 [`DependencyDeclaration`] 목록으로.
//!
//! M20-2 의 첫 단계 — 매니페스트만 (lockfile 통합은 후속). 매니페스트의
//! version range 는 `^1.4.0` 같은 형태 — OSV.query 는 정확한 version 을
//! 요구하므로 caller 가 lockfile 으로 resolve 해야 한다. 임시: range string
//! 그대로 보관하고 OSV 매칭 시 fallback (range 비교 없이 name 매칭).
//!
//! 파일 미존재 / 형식 깨짐은 `Manifest` 에러. caller (M20-3 Tauri command)
//! 가 한 프로젝트의 여러 manifest 를 best-effort 시도하고 누락 보고.

use std::path::Path;

use crate::ecosystem::Ecosystem;
use crate::{DependencyDeclaration, DependencyKind, SupplyError};

#[derive(Debug, serde::Deserialize)]
struct PackageJson {
    #[serde(default)]
    dependencies: std::collections::BTreeMap<String, String>,
    #[serde(rename = "devDependencies", default)]
    dev_dependencies: std::collections::BTreeMap<String, String>,
    #[serde(rename = "optionalDependencies", default)]
    optional_dependencies: std::collections::BTreeMap<String, String>,
    #[serde(rename = "peerDependencies", default)]
    peer_dependencies: std::collections::BTreeMap<String, String>,
}

/// Parse a `package.json` file path. Returns one [`DependencyDeclaration`]
/// per direct dependency. version 은 매니페스트에 적힌 그대로 (range 등
/// 그대로 — caller 가 lockfile resolve 가능).
pub fn parse_package_json(path: &Path) -> Result<Vec<DependencyDeclaration>, SupplyError> {
    let raw = std::fs::read_to_string(path)?;
    let pkg: PackageJson = serde_json::from_str(&raw)
        .map_err(|e| SupplyError::Manifest(format!("package.json: {e}")))?;
    let manifest_path = path
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("package.json")
        .to_owned();

    let mut out = Vec::new();
    for (name, version) in pkg.dependencies {
        out.push(decl(
            Ecosystem::Npm,
            &name,
            &version,
            DependencyKind::Prod,
            &manifest_path,
        ));
    }
    for (name, version) in pkg.dev_dependencies {
        out.push(decl(
            Ecosystem::Npm,
            &name,
            &version,
            DependencyKind::Dev,
            &manifest_path,
        ));
    }
    for (name, version) in pkg.optional_dependencies {
        out.push(decl(
            Ecosystem::Npm,
            &name,
            &version,
            DependencyKind::Optional,
            &manifest_path,
        ));
    }
    for (name, version) in pkg.peer_dependencies {
        out.push(decl(
            Ecosystem::Npm,
            &name,
            &version,
            DependencyKind::Peer,
            &manifest_path,
        ));
    }
    Ok(out)
}

#[derive(Debug, serde::Deserialize)]
struct CargoToml {
    #[serde(default)]
    dependencies: std::collections::BTreeMap<String, toml::Value>,
    #[serde(rename = "dev-dependencies", default)]
    dev_dependencies: std::collections::BTreeMap<String, toml::Value>,
    #[serde(rename = "build-dependencies", default)]
    build_dependencies: std::collections::BTreeMap<String, toml::Value>,
}

/// Parse a `Cargo.toml`. workspace deps 와 path/git 의존성도 포함되지만
/// version 이 명시 안 된 경우 "workspace" / "git" 같은 플레이스홀더로
/// 표시 — OSV query 는 version 이 있어야 의미.
pub fn parse_cargo_toml(path: &Path) -> Result<Vec<DependencyDeclaration>, SupplyError> {
    let raw = std::fs::read_to_string(path)?;
    let cargo: CargoToml =
        toml::from_str(&raw).map_err(|e| SupplyError::Manifest(format!("Cargo.toml: {e}")))?;
    let manifest_path = path
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("Cargo.toml")
        .to_owned();

    let mut out = Vec::new();
    push_cargo_section(
        &cargo.dependencies,
        DependencyKind::Prod,
        &manifest_path,
        &mut out,
    );
    push_cargo_section(
        &cargo.dev_dependencies,
        DependencyKind::Dev,
        &manifest_path,
        &mut out,
    );
    push_cargo_section(
        &cargo.build_dependencies,
        DependencyKind::Optional,
        &manifest_path,
        &mut out,
    );
    Ok(out)
}

fn push_cargo_section(
    map: &std::collections::BTreeMap<String, toml::Value>,
    kind: DependencyKind,
    manifest_path: &str,
    out: &mut Vec<DependencyDeclaration>,
) {
    for (name, val) in map {
        let version = match val {
            toml::Value::String(s) => s.clone(),
            toml::Value::Table(t) => {
                if let Some(toml::Value::String(s)) = t.get("version") {
                    s.clone()
                } else if t.get("workspace").and_then(|v| v.as_bool()) == Some(true) {
                    "workspace".to_owned()
                } else if t.contains_key("path") {
                    "path".to_owned()
                } else if t.contains_key("git") {
                    "git".to_owned()
                } else {
                    continue;
                }
            }
            _ => continue,
        };
        out.push(decl(Ecosystem::Cargo, name, &version, kind, manifest_path));
    }
}

fn decl(
    eco: Ecosystem,
    name: &str,
    version: &str,
    kind: DependencyKind,
    manifest_path: &str,
) -> DependencyDeclaration {
    DependencyDeclaration {
        ecosystem: eco,
        name: name.to_owned(),
        version: version.to_owned(),
        kind,
        manifest_path: manifest_path.to_owned(),
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
    fn parse_package_json_separates_kinds() {
        let json = r#"{
            "name": "demo",
            "dependencies": { "axios": "^1.4.0", "lodash": "4.17.21" },
            "devDependencies": { "vitest": "^1.0.0" },
            "optionalDependencies": { "fsevents": "*" }
        }"#;
        let dir = write_tmp("package.json", json);
        let deps = parse_package_json(&dir.path().join("package.json")).unwrap();
        assert_eq!(deps.len(), 4);
        assert!(deps
            .iter()
            .any(|d| d.name == "axios" && d.kind == DependencyKind::Prod));
        assert!(deps
            .iter()
            .any(|d| d.name == "vitest" && d.kind == DependencyKind::Dev));
        assert!(deps
            .iter()
            .any(|d| d.name == "fsevents" && d.kind == DependencyKind::Optional));
        for d in &deps {
            assert_eq!(d.ecosystem, Ecosystem::Npm);
            assert_eq!(d.manifest_path, "package.json");
        }
    }

    #[test]
    fn parse_package_json_missing_sections_ok() {
        let json = r#"{ "name": "minimal" }"#;
        let dir = write_tmp("package.json", json);
        let deps = parse_package_json(&dir.path().join("package.json")).unwrap();
        assert_eq!(deps.len(), 0);
    }

    #[test]
    fn parse_package_json_invalid_returns_manifest_error() {
        let dir = write_tmp("package.json", "not-json{");
        let err = parse_package_json(&dir.path().join("package.json")).unwrap_err();
        assert!(matches!(err, SupplyError::Manifest(_)));
    }

    #[test]
    fn parse_cargo_toml_extracts_versions_and_workspace_marker() {
        let toml_str = r#"
[package]
name = "demo"

[dependencies]
serde = "1.0"
tokio = { version = "1", features = ["macros"] }
api-vault-core = { path = "../api-vault-core" }
shared = { workspace = true }

[dev-dependencies]
mockall = "0.12"

[build-dependencies]
cc = "1.0"
"#;
        let dir = write_tmp("Cargo.toml", toml_str);
        let deps = parse_cargo_toml(&dir.path().join("Cargo.toml")).unwrap();
        // serde, tokio, api-vault-core, shared, mockall, cc = 6
        assert_eq!(deps.len(), 6);
        let serde = deps.iter().find(|d| d.name == "serde").unwrap();
        assert_eq!(serde.version, "1.0");
        assert_eq!(serde.ecosystem, Ecosystem::Cargo);
        assert_eq!(serde.kind, DependencyKind::Prod);
        let path_dep = deps.iter().find(|d| d.name == "api-vault-core").unwrap();
        assert_eq!(path_dep.version, "path");
        let ws = deps.iter().find(|d| d.name == "shared").unwrap();
        assert_eq!(ws.version, "workspace");
    }
}
