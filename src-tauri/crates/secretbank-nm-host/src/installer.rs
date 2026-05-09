// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2025 Secretbank contributors
//
// Native Messaging Host 설치/해제 모듈.
//
// OS 별 표준 경로에 NM host manifest (JSON) 를 등록·해제한다.
//
// Windows  — HKCU 레지스트리 키 (winreg)
// macOS    — ~/Library/Application Support/{browser}/NativeMessagingHosts/
// Linux    — ~/.config/google-chrome/NativeMessagingHosts/  (Chrome)
//          — ~/.mozilla/native-messaging-hosts/             (Firefox)
//
// TODO(Phase-F): EXT_ID 는 Web Store 등록 후 실제 ID 로 교체.
//               현재는 placeholder 로 전달.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use thiserror::Error;

// ── 상수 ────────────────────────────────────────────────────────────────────

/// NM host name — Chrome/Firefox 공통 (manifest 의 "name" 필드)
pub const HOST_NAME: &str = "com.secretbank.nm_host";

/// NM host description
pub const HOST_DESCRIPTION: &str = "Secretbank Native Messaging Host";

// ── Browser enum ────────────────────────────────────────────────────────────

/// 지원 브라우저
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Browser {
    /// Google Chrome / Chromium
    Chrome,
    /// Mozilla Firefox
    Firefox,
    /// Microsoft Edge (Chromium 기반 — Phase F-2 placeholder)
    Edge,
}

impl Browser {
    /// 모든 지원 브라우저 목록 (install/uninstall 시 순회)
    pub fn all() -> &'static [Browser] {
        &[Browser::Chrome, Browser::Firefox, Browser::Edge]
    }

    /// 브라우저 이름 (표시용)
    pub fn name(&self) -> &'static str {
        match self {
            Browser::Chrome => "Chrome",
            Browser::Firefox => "Firefox",
            Browser::Edge => "Edge",
        }
    }
}

// ── 에러 타입 ────────────────────────────────────────────────────────────────

/// 설치/해제 중 발생 가능한 오류
#[derive(Debug, Error)]
pub enum InstallError {
    /// 홈 디렉토리를 알 수 없다 (dirs crate 실패)
    #[error("홈 디렉토리를 확인할 수 없습니다")]
    HomeDirNotFound,

    /// 설치 대상 디렉토리 생성 실패
    #[error("디렉토리 생성 실패: {path}: {source}")]
    CreateDir {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },

    /// manifest JSON 직렬화 실패
    #[error("manifest JSON 직렬화 실패: {0}")]
    Serialize(#[from] serde_json::Error),

    /// manifest 파일 쓰기 실패
    #[error("manifest 파일 쓰기 실패: {path}: {source}")]
    WriteFile {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },

    /// manifest 파일 삭제 실패
    #[error("manifest 파일 삭제 실패: {path}: {source}")]
    RemoveFile {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },

    /// Windows 레지스트리 오류
    #[cfg(windows)]
    #[error("레지스트리 오류: {0}")]
    Registry(#[from] std::io::Error),

    /// 현재 실행 파일 경로 확인 불가
    #[error("실행 파일 경로를 확인할 수 없습니다: {0}")]
    CurrentExe(std::io::Error),
}

// ── Manifest 구조체 ──────────────────────────────────────────────────────────

/// Chrome NM manifest (allowed_origins 형식)
#[derive(Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct ChromeManifest {
    pub name: String,
    pub description: String,
    pub path: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub allowed_origins: Vec<String>,
}

/// Firefox NM manifest (allowed_extensions 형식)
#[derive(Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct FirefoxManifest {
    pub name: String,
    pub description: String,
    pub path: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub allowed_extensions: Vec<String>,
}

/// 브라우저별 manifest JSON 생성
///
/// - `binary_path`: nm-host 실행 파일의 절대 경로
/// - `browser`: 대상 브라우저
/// - `ext_id`: 확장 ID
///   - Chrome 형식: `chrome-extension://<ID>/`
///   - Firefox 형식: `<ID>@secretbank.app`
///
/// # TODO(Phase-F)
/// EXT_ID 는 Web Store 등록 후 실제 ID 로 교체한다.
pub fn build_manifest(
    binary_path: &Path,
    browser: Browser,
    ext_id: &str,
) -> Result<serde_json::Value, InstallError> {
    let path_str = binary_path.to_string_lossy().to_string();

    match browser {
        Browser::Chrome | Browser::Edge => {
            let manifest = ChromeManifest {
                name: HOST_NAME.to_string(),
                description: HOST_DESCRIPTION.to_string(),
                path: path_str,
                kind: "stdio".to_string(),
                // Chrome/Edge 형식: chrome-extension://<EXT_ID>/
                allowed_origins: vec![format!("chrome-extension://{ext_id}/")],
            };
            Ok(serde_json::to_value(manifest)?)
        }
        Browser::Firefox => {
            let manifest = FirefoxManifest {
                name: HOST_NAME.to_string(),
                description: HOST_DESCRIPTION.to_string(),
                path: path_str,
                kind: "stdio".to_string(),
                // Firefox 형식: <EXT_ID>@secretbank.app
                allowed_extensions: vec![format!("{ext_id}@secretbank.app")],
            };
            Ok(serde_json::to_value(manifest)?)
        }
    }
}

// ── manifest 경로 helper ─────────────────────────────────────────────────────

/// OS + 브라우저 조합에 따라 manifest JSON 파일 경로를 반환한다.
///
/// Windows  — manifest 자체는 파일이 아니라 레지스트리 값이 가리키는 경로.
///            여기서는 레지스트리에 등록할 manifest JSON 을 저장할 경로를 반환한다.
///            관례: `%APPDATA%\Secretbank\NativeMessaging\{browser}\{HOST_NAME}.json`
/// macOS    — `~/Library/Application Support/{browser_dir}/NativeMessagingHosts/{HOST_NAME}.json`
/// Linux    — `~/.config/google-chrome/NativeMessagingHosts/{HOST_NAME}.json` (Chrome/Edge)
///          — `~/.mozilla/native-messaging-hosts/{HOST_NAME}.json`             (Firefox)
pub fn manifest_path(browser: Browser) -> Result<PathBuf, InstallError> {
    #[cfg(windows)]
    {
        manifest_path_windows(browser)
    }
    #[cfg(target_os = "macos")]
    {
        manifest_path_macos(browser)
    }
    #[cfg(target_os = "linux")]
    {
        manifest_path_linux(browser)
    }
    // 기타 Unix (FreeBSD 등) — Linux 경로 사용
    #[cfg(not(any(windows, target_os = "macos", target_os = "linux")))]
    {
        manifest_path_linux(browser)
    }
}

// ── OS 별 경로 구현 ──────────────────────────────────────────────────────────

/// Windows: manifest 파일은 `%APPDATA%\Secretbank\NativeMessaging\<browser>\<HOST_NAME>.json`
/// 레지스트리 키는 해당 파일 경로를 값으로 갖는다.
#[cfg(windows)]
fn manifest_path_windows(browser: Browser) -> Result<PathBuf, InstallError> {
    let data_dir = dirs::data_dir().ok_or(InstallError::HomeDirNotFound)?;
    let browser_name = match browser {
        Browser::Chrome => "Chrome",
        Browser::Firefox => "Firefox",
        Browser::Edge => "Edge",
    };
    Ok(data_dir
        .join("Secretbank")
        .join("NativeMessaging")
        .join(browser_name)
        .join(format!("{HOST_NAME}.json")))
}

/// macOS: `~/Library/Application Support/<browser_dir>/NativeMessagingHosts/<HOST_NAME>.json`
#[cfg(target_os = "macos")]
fn manifest_path_macos(browser: Browser) -> Result<PathBuf, InstallError> {
    let home = dirs::home_dir().ok_or(InstallError::HomeDirNotFound)?;
    let subdir = match browser {
        Browser::Chrome => "Google/Chrome",
        Browser::Firefox => "Mozilla",
        Browser::Edge => "Microsoft Edge",
    };
    let nm_subdir = match browser {
        Browser::Firefox => "NativeMessagingHosts",
        _ => "NativeMessagingHosts",
    };
    Ok(home
        .join("Library")
        .join("Application Support")
        .join(subdir)
        .join(nm_subdir)
        .join(format!("{HOST_NAME}.json")))
}

/// Linux: Chrome/Edge = `~/.config/google-chrome/NativeMessagingHosts/...`
///        Firefox      = `~/.mozilla/native-messaging-hosts/...`
///
/// `dirs::home_dir()` 대신 직접 `HOME` env 를 읽는다. Linux 의 `dirs` 는
/// passwd entry 우선이라 테스트의 `set_var("HOME", ...)` 가 무시되어 격리 실패.
/// Chrome/Edge 는 XDG_CONFIG_HOME 우선 (없으면 `$HOME/.config`).
#[cfg(target_os = "linux")]
fn manifest_path_linux(browser: Browser) -> Result<PathBuf, InstallError> {
    let home = std::env::var("HOME")
        .map(PathBuf::from)
        .map_err(|_| InstallError::HomeDirNotFound)?;
    let xdg_config = std::env::var("XDG_CONFIG_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|_| home.join(".config"));
    match browser {
        Browser::Chrome => Ok(xdg_config
            .join("google-chrome")
            .join("NativeMessagingHosts")
            .join(format!("{HOST_NAME}.json"))),
        Browser::Edge => Ok(xdg_config
            .join("microsoft-edge")
            .join("NativeMessagingHosts")
            .join(format!("{HOST_NAME}.json"))),
        Browser::Firefox => Ok(home
            .join(".mozilla")
            .join("native-messaging-hosts")
            .join(format!("{HOST_NAME}.json"))),
    }
}

// 기타 Unix fallback (컴파일 충족 목적)
#[cfg(not(any(windows, target_os = "macos", target_os = "linux")))]
fn manifest_path_linux(browser: Browser) -> Result<PathBuf, InstallError> {
    let home = dirs::home_dir().ok_or(InstallError::HomeDirNotFound)?;
    match browser {
        Browser::Chrome | Browser::Edge => Ok(home
            .join(".config")
            .join("google-chrome")
            .join("NativeMessagingHosts")
            .join(format!("{HOST_NAME}.json"))),
        Browser::Firefox => Ok(home
            .join(".mozilla")
            .join("native-messaging-hosts")
            .join(format!("{HOST_NAME}.json"))),
    }
}

// ── Windows 레지스트리 helper ────────────────────────────────────────────────

/// Windows: HKCU 레지스트리 키 경로 반환
///
/// Chrome/Edge: `HKCU\Software\Google\Chrome\NativeMessagingHosts\<HOST_NAME>`
/// Firefox:     `HKCU\Software\Mozilla\NativeMessagingHosts\<HOST_NAME>`
#[cfg(windows)]
fn registry_key_path(browser: Browser) -> String {
    match browser {
        Browser::Chrome => format!(r"Software\Google\Chrome\NativeMessagingHosts\{HOST_NAME}"),
        Browser::Firefox => format!(r"Software\Mozilla\NativeMessagingHosts\{HOST_NAME}"),
        Browser::Edge => format!(r"Software\Microsoft\Edge\NativeMessagingHosts\{HOST_NAME}"),
    }
}

// ── 설치 함수 ────────────────────────────────────────────────────────────────

/// 현재 실행 파일 경로를 반환한다.
///
/// 테스트 시 override 가능하도록 별도 함수로 분리.
fn current_exe_path() -> Result<PathBuf, InstallError> {
    std::env::current_exe().map_err(InstallError::CurrentExe)
}

/// 지정된 브라우저에 NM host manifest 를 등록한다.
///
/// - Windows: manifest JSON 파일 저장 후 HKCU 레지스트리에 파일 경로 등록
/// - macOS/Linux: manifest JSON 파일을 표준 경로에 저장
///
/// `binary_path`: 등록할 nm-host 실행 파일 경로.
///               `None` 이면 `std::env::current_exe()` 를 사용한다.
/// `ext_id`: 확장 ID (placeholder — Phase-F 에서 실 ID 로 교체)
pub fn install(
    browser: Browser,
    ext_id: &str,
    binary_path: Option<&Path>,
) -> Result<(), InstallError> {
    // 실행 파일 경로 결정
    let exe = match binary_path {
        Some(p) => p.to_path_buf(),
        None => current_exe_path()?,
    };

    // manifest JSON 생성
    let manifest = build_manifest(&exe, browser, ext_id)?;
    let json_str = serde_json::to_string_pretty(&manifest)?;

    // manifest 파일 저장 경로 계산
    let dest_path = manifest_path(browser)?;

    // 부모 디렉토리 생성
    if let Some(parent) = dest_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| InstallError::CreateDir {
            path: parent.to_path_buf(),
            source: e,
        })?;
    }

    // manifest JSON 파일 저장
    std::fs::write(&dest_path, json_str.as_bytes()).map_err(|e| InstallError::WriteFile {
        path: dest_path.clone(),
        source: e,
    })?;

    // Windows: 레지스트리에 파일 경로 등록
    #[cfg(windows)]
    {
        install_registry(browser, &dest_path)?;
    }

    Ok(())
}

/// Windows 전용: HKCU 레지스트리에 manifest 파일 경로를 등록한다.
#[cfg(windows)]
fn install_registry(browser: Browser, manifest_file: &Path) -> Result<(), InstallError> {
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let key_path = registry_key_path(browser);

    let (key, _disposition) = hkcu
        .create_subkey(&key_path)
        .map_err(InstallError::Registry)?;

    // 기본값(Default)을 manifest 파일 경로로 설정
    let path_str = manifest_file.to_string_lossy().to_string();
    key.set_value("", &path_str)
        .map_err(InstallError::Registry)?;

    Ok(())
}

// ── 해제 함수 ────────────────────────────────────────────────────────────────

/// 지정된 브라우저의 NM host manifest 등록을 해제한다.
///
/// - Windows: 레지스트리 키 삭제 + manifest 파일 삭제
/// - macOS/Linux: manifest 파일 삭제
///
/// 파일/레지스트리가 이미 없으면 에러 없이 성공 (idempotent).
pub fn uninstall(browser: Browser) -> Result<(), InstallError> {
    // Windows: 레지스트리 키 삭제
    #[cfg(windows)]
    {
        uninstall_registry(browser)?;
    }

    // manifest 파일 삭제
    let dest_path = manifest_path(browser)?;
    if dest_path.exists() {
        std::fs::remove_file(&dest_path).map_err(|e| InstallError::RemoveFile {
            path: dest_path.clone(),
            source: e,
        })?;
    }

    Ok(())
}

/// Windows 전용: HKCU 레지스트리 키를 삭제한다.
#[cfg(windows)]
fn uninstall_registry(browser: Browser) -> Result<(), InstallError> {
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let key_path = registry_key_path(browser);

    match hkcu.delete_subkey_all(&key_path) {
        Ok(_) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()), // 이미 없음 — idempotent
        Err(e) => Err(InstallError::Registry(e)),
    }
}

// ── 상태 확인 ────────────────────────────────────────────────────────────────

/// 지정된 브라우저의 NM host 가 등록되어 있는지 확인한다.
///
/// Windows: manifest 파일 존재 여부 (레지스트리 확인은 is_installed_registry 참조)
/// macOS/Linux: manifest 파일 존재 여부
pub fn is_installed(browser: Browser) -> bool {
    match manifest_path(browser) {
        Ok(p) => p.exists(),
        Err(_) => false,
    }
}

/// Windows 전용: HKCU 레지스트리 키 존재 여부를 확인한다.
#[cfg(windows)]
pub fn is_installed_registry(browser: Browser) -> bool {
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let key_path = registry_key_path(browser);
    hkcu.open_subkey(&key_path).is_ok()
}

// ── 단위 테스트 ─────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    // ── Manifest JSON 직렬화 검증 ────────────────────────────────────────────

    #[test]
    fn test_chrome_manifest_json() {
        let exe = PathBuf::from("/usr/local/bin/secretbank-nm-host");
        let manifest = build_manifest(&exe, Browser::Chrome, "placeholder123").unwrap();

        assert_eq!(manifest["name"], HOST_NAME);
        assert_eq!(manifest["type"], "stdio");
        assert_eq!(manifest["path"], "/usr/local/bin/secretbank-nm-host");

        // Chrome 형식: allowed_origins 배열
        let origins = manifest["allowed_origins"].as_array().unwrap();
        assert_eq!(origins.len(), 1);
        assert_eq!(origins[0], "chrome-extension://placeholder123/");

        // Firefox 필드 없음
        assert!(manifest.get("allowed_extensions").is_none());
    }

    #[test]
    fn test_firefox_manifest_json() {
        let exe = PathBuf::from("/usr/local/bin/secretbank-nm-host");
        let manifest = build_manifest(&exe, Browser::Firefox, "placeholder123").unwrap();

        assert_eq!(manifest["name"], HOST_NAME);
        assert_eq!(manifest["type"], "stdio");
        assert_eq!(manifest["path"], "/usr/local/bin/secretbank-nm-host");

        // Firefox 형식: allowed_extensions 배열
        let extensions = manifest["allowed_extensions"].as_array().unwrap();
        assert_eq!(extensions.len(), 1);
        assert_eq!(extensions[0], "placeholder123@secretbank.app");

        // Chrome 필드 없음
        assert!(manifest.get("allowed_origins").is_none());
    }

    #[test]
    fn test_edge_manifest_same_as_chrome_format() {
        // Edge 는 Chromium 기반 → Chrome 형식 사용
        let exe = PathBuf::from("/usr/local/bin/secretbank-nm-host");
        let manifest = build_manifest(&exe, Browser::Edge, "edgeid123").unwrap();
        assert!(manifest.get("allowed_origins").is_some());
        assert!(manifest.get("allowed_extensions").is_none());
    }

    #[test]
    fn test_manifest_serialization_roundtrip_chrome() {
        let exe = PathBuf::from("/path/to/nm-host");
        let val = build_manifest(&exe, Browser::Chrome, "abc123").unwrap();
        let json_str = serde_json::to_string(&val).unwrap();
        let reparsed: serde_json::Value = serde_json::from_str(&json_str).unwrap();
        assert_eq!(val, reparsed);
    }

    #[test]
    fn test_manifest_serialization_roundtrip_firefox() {
        let exe = PathBuf::from("/path/to/nm-host");
        let val = build_manifest(&exe, Browser::Firefox, "abc123").unwrap();
        let json_str = serde_json::to_string(&val).unwrap();
        let reparsed: serde_json::Value = serde_json::from_str(&json_str).unwrap();
        assert_eq!(val, reparsed);
    }

    #[test]
    fn test_manifest_has_required_fields() {
        // Chrome 형식 필수 필드 검증
        let exe = PathBuf::from("/bin/nm");
        let manifest = build_manifest(&exe, Browser::Chrome, "x").unwrap();
        assert!(manifest.get("name").is_some());
        assert!(manifest.get("description").is_some());
        assert!(manifest.get("path").is_some());
        assert!(manifest.get("type").is_some());
        assert!(manifest.get("allowed_origins").is_some());
    }

    // ── OS 별 경로 helper 검증 ───────────────────────────────────────────────

    #[test]
    #[cfg(target_os = "linux")]
    fn test_linux_chrome_path_ends_with_host_name() {
        let p = manifest_path(Browser::Chrome).unwrap();
        assert!(
            p.to_str().unwrap().contains("google-chrome"),
            "Chrome path: {p:?}"
        );
        assert!(p.file_name().unwrap() == format!("{HOST_NAME}.json").as_str());
    }

    #[test]
    #[cfg(target_os = "linux")]
    fn test_linux_firefox_path_contains_mozilla() {
        let p = manifest_path(Browser::Firefox).unwrap();
        assert!(
            p.to_str().unwrap().contains("mozilla"),
            "Firefox path: {p:?}"
        );
    }

    #[test]
    #[cfg(target_os = "macos")]
    fn test_macos_chrome_path() {
        let p = manifest_path(Browser::Chrome).unwrap();
        let s = p.to_str().unwrap();
        assert!(s.contains("Google/Chrome"), "Chrome path: {p:?}");
        assert!(s.contains("NativeMessagingHosts"), "NM dir: {p:?}");
    }

    #[test]
    #[cfg(target_os = "macos")]
    fn test_macos_firefox_path() {
        let p = manifest_path(Browser::Firefox).unwrap();
        let s = p.to_str().unwrap();
        assert!(s.contains("Mozilla"), "Firefox path: {p:?}");
    }

    #[test]
    #[cfg(windows)]
    fn test_windows_path_contains_secretbank() {
        let p = manifest_path(Browser::Chrome).unwrap();
        let s = p.to_str().unwrap();
        assert!(s.contains("Secretbank"), "Win Chrome path: {p:?}");
    }

    #[test]
    #[cfg(windows)]
    fn test_windows_registry_key_paths() {
        let chrome_key = registry_key_path(Browser::Chrome);
        assert!(
            chrome_key.contains("Google\\Chrome"),
            "Chrome reg: {chrome_key}"
        );
        let ff_key = registry_key_path(Browser::Firefox);
        assert!(ff_key.contains("Mozilla"), "Firefox reg: {ff_key}");
        let edge_key = registry_key_path(Browser::Edge);
        assert!(edge_key.contains("Microsoft\\Edge"), "Edge reg: {edge_key}");
    }

    // ── HOST_NAME 일관성 ──────────────────────────────────────────────────────

    #[test]
    fn test_host_name_constant() {
        assert_eq!(HOST_NAME, "com.secretbank.nm_host");
    }

    // ── manifest path 파일명 ─────────────────────────────────────────────────

    #[test]
    fn test_all_manifest_paths_end_with_json() {
        for browser in Browser::all() {
            if let Ok(p) = manifest_path(*browser) {
                let fname = p.file_name().unwrap().to_str().unwrap();
                assert!(
                    fname.ends_with(".json"),
                    "{browser:?} 경로가 .json 으로 끝나야 함: {p:?}"
                );
            }
        }
    }
}
