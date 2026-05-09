// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2025 Secretbank contributors
//
// NM Host installer 통합 테스트.
//
// tempdir 로 mock filesystem 을 만들고 install → 내용 검증 → uninstall 순서로
// round-trip 을 검증한다.
//
// OS 별 레지스트리/파일 경로는 cfg(target_os) 분기로 커버한다.
// Windows: 레지스트리 조작은 실제 HKCU 에 영향을 주므로 별도 표시.
// macOS / Linux: tempdir HOME override 로 격리.

use secretbank_nm_host::installer::{self, Browser, HOST_NAME};
use std::path::PathBuf;
use tempfile::TempDir;

// ── 헬퍼 ─────────────────────────────────────────────────────────────────────

/// 가짜 nm-host 실행 파일 경로 (존재하지 않아도 됨 — manifest 내용 검증용)
fn fake_binary(tmp: &TempDir) -> PathBuf {
    tmp.path().join("secretbank-nm-host")
}

// ── manifest JSON 내용 검증 ───────────────────────────────────────────────────

#[test]
fn integration_chrome_manifest_has_correct_fields() {
    let tmp = TempDir::new().unwrap();
    let exe = fake_binary(&tmp);

    let manifest = installer::build_manifest(&exe, Browser::Chrome, "test_ext_123").unwrap();

    // 필수 필드
    assert_eq!(manifest["name"].as_str().unwrap(), HOST_NAME);
    assert_eq!(manifest["type"].as_str().unwrap(), "stdio");
    assert!(manifest["description"].is_string());

    // allowed_origins 형식
    let origins = manifest["allowed_origins"].as_array().unwrap();
    assert!(!origins.is_empty());
    assert!(origins[0]
        .as_str()
        .unwrap()
        .starts_with("chrome-extension://"));
    assert!(origins[0].as_str().unwrap().ends_with("/"));

    // Firefox 필드 없음
    assert!(manifest.get("allowed_extensions").is_none());
}

#[test]
fn integration_firefox_manifest_has_correct_fields() {
    let tmp = TempDir::new().unwrap();
    let exe = fake_binary(&tmp);

    let manifest = installer::build_manifest(&exe, Browser::Firefox, "test_ext_123").unwrap();

    // 필수 필드
    assert_eq!(manifest["name"].as_str().unwrap(), HOST_NAME);
    assert_eq!(manifest["type"].as_str().unwrap(), "stdio");

    // allowed_extensions 형식
    let exts = manifest["allowed_extensions"].as_array().unwrap();
    assert!(!exts.is_empty());
    assert!(exts[0].as_str().unwrap().ends_with("@secretbank.app"));

    // Chrome 필드 없음
    assert!(manifest.get("allowed_origins").is_none());
}

#[test]
fn integration_manifest_path_contains_host_name() {
    for &browser in Browser::all() {
        if let Ok(p) = installer::manifest_path(browser) {
            let fname = p.file_name().unwrap().to_str().unwrap();
            assert!(
                fname.contains(HOST_NAME) && fname.ends_with(".json"),
                "{browser:?}: 파일명에 HOST_NAME 포함 + .json 이어야 함: {fname}"
            );
        }
    }
}

// ── install / uninstall round-trip (Unix/macOS) ───────────────────────────────

/// HOME 환경 변수를 임시 디렉토리로 설정하여 dirs::home_dir() 를 격리한다.
///
/// dirs crate 는 HOME (Unix) / USERPROFILE (Windows) env var 를 우선 사용하므로
/// 이 방법으로 테스트를 안전하게 격리할 수 있다.
///
/// NOTE: 환경 변수 변경은 프로세스 전역에 영향을 주므로 각 테스트는
///       set_var / remove_var 를 직접 수행한다 (병렬 실행 시 레이스 주의).
///       cargo test 는 기본적으로 테스트별 독립 스레드이므로 이 수준에서는 안전.
/// 환경 변수 변경 시 process-global 이라 cargo test 의 병렬 실행에서 race 발생.
/// 모든 with_temp_home 호출을 단일 Mutex 로 serialize 한다.
#[cfg(not(windows))]
static TEST_ENV_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

#[cfg(not(windows))]
fn with_temp_home<F: FnOnce(&TempDir)>(f: F) {
    // CI 의 다른 테스트가 panic 으로 poison 한 경우에도 진행 (lock state 만 필요).
    let _guard = TEST_ENV_LOCK.lock().unwrap_or_else(|p| p.into_inner());
    let tmp = TempDir::new().unwrap();
    // SAFETY: TEST_ENV_LOCK 보유 중이라 단일 thread 만 env 변경.
    //
    // Linux 의 `dirs::*` 는 `HOME` 의 set_var 를 무시 (passwd entry 우선) 하므로
    // installer.rs 의 manifest_path_linux 가 직접 std::env::var 를 읽도록 변경됨.
    // XDG_CONFIG_HOME 도 같이 override 하여 Chrome/Edge 경로 결정 정확.
    unsafe {
        std::env::set_var("HOME", tmp.path());
        std::env::set_var("XDG_CONFIG_HOME", tmp.path().join(".config"));
    }
    f(&tmp);
    unsafe {
        std::env::remove_var("HOME");
        std::env::remove_var("XDG_CONFIG_HOME");
    }
}

#[test]
#[cfg(not(windows))]
fn integration_chrome_install_creates_manifest_file() {
    with_temp_home(|_tmp| {
        let fake_exe = PathBuf::from("/fake/secretbank-nm-host");

        installer::install(Browser::Chrome, "ext_abc123", Some(&fake_exe)).unwrap();

        let path = installer::manifest_path(Browser::Chrome).unwrap();
        assert!(path.exists(), "manifest 파일이 존재해야 함: {path:?}");

        // 파일 내용이 유효한 JSON 이고 name 필드가 올바른지 확인
        let content = std::fs::read_to_string(&path).unwrap();
        let val: serde_json::Value = serde_json::from_str(&content).unwrap();
        assert_eq!(val["name"].as_str().unwrap(), HOST_NAME);
        assert!(val["allowed_origins"].is_array());
    });
}

#[test]
#[cfg(not(windows))]
fn integration_firefox_install_creates_manifest_file() {
    with_temp_home(|_tmp| {
        let fake_exe = PathBuf::from("/fake/secretbank-nm-host");

        installer::install(Browser::Firefox, "ff_ext_456", Some(&fake_exe)).unwrap();

        let path = installer::manifest_path(Browser::Firefox).unwrap();
        assert!(
            path.exists(),
            "Firefox manifest 파일이 존재해야 함: {path:?}"
        );

        let content = std::fs::read_to_string(&path).unwrap();
        let val: serde_json::Value = serde_json::from_str(&content).unwrap();
        assert_eq!(val["name"].as_str().unwrap(), HOST_NAME);
        assert!(val["allowed_extensions"].is_array());
    });
}

#[test]
#[cfg(not(windows))]
fn integration_chrome_install_uninstall_roundtrip() {
    with_temp_home(|_tmp| {
        let fake_exe = PathBuf::from("/fake/secretbank-nm-host");

        // 설치
        installer::install(Browser::Chrome, "round_trip_id", Some(&fake_exe)).unwrap();
        assert!(
            installer::is_installed(Browser::Chrome),
            "설치 후 is_installed == true 이어야 함"
        );

        // 해제
        installer::uninstall(Browser::Chrome).unwrap();
        assert!(
            !installer::is_installed(Browser::Chrome),
            "해제 후 is_installed == false 이어야 함"
        );
    });
}

#[test]
#[cfg(not(windows))]
fn integration_firefox_install_uninstall_roundtrip() {
    with_temp_home(|_tmp| {
        let fake_exe = PathBuf::from("/fake/secretbank-nm-host");

        installer::install(Browser::Firefox, "ff_round_trip", Some(&fake_exe)).unwrap();
        assert!(installer::is_installed(Browser::Firefox));

        installer::uninstall(Browser::Firefox).unwrap();
        assert!(!installer::is_installed(Browser::Firefox));
    });
}

#[test]
#[cfg(not(windows))]
fn integration_uninstall_idempotent_when_not_installed() {
    with_temp_home(|_tmp| {
        // 설치 없이 uninstall → 에러 없이 성공 (idempotent)
        installer::uninstall(Browser::Chrome).unwrap();
        installer::uninstall(Browser::Firefox).unwrap();
    });
}

#[test]
#[cfg(not(windows))]
fn integration_install_creates_parent_directories() {
    with_temp_home(|_tmp| {
        let fake_exe = PathBuf::from("/fake/secretbank-nm-host");

        // 부모 디렉토리가 아직 없어도 install 이 자동 생성해야 함
        installer::install(Browser::Chrome, "dir_test", Some(&fake_exe)).unwrap();

        let path = installer::manifest_path(Browser::Chrome).unwrap();
        assert!(
            path.parent().unwrap().exists(),
            "부모 디렉토리가 존재해야 함"
        );
    });
}

#[test]
#[cfg(not(windows))]
fn integration_manifest_binary_path_matches_exe() {
    with_temp_home(|_tmp| {
        let fake_exe = PathBuf::from("/usr/local/bin/secretbank-nm-host");
        installer::install(Browser::Chrome, "path_check", Some(&fake_exe)).unwrap();

        let path = installer::manifest_path(Browser::Chrome).unwrap();
        let content = std::fs::read_to_string(&path).unwrap();
        let val: serde_json::Value = serde_json::from_str(&content).unwrap();

        assert_eq!(
            val["path"].as_str().unwrap(),
            "/usr/local/bin/secretbank-nm-host",
            "manifest 의 path 필드가 실행 파일 경로와 일치해야 함"
        );
    });
}

// ── Windows 전용: 레지스트리 round-trip ──────────────────────────────────────
//
// 주의: 이 테스트는 실제 HKCU 레지스트리를 수정한다.
//       CI/CD 환경에서는 Windows runner 에서 실행된다.
//       사용자 데이터에 영향을 주지 않는 `Secretbank\NativeMessaging` 하위 키만 사용.

#[test]
#[cfg(windows)]
fn integration_windows_chrome_registry_roundtrip() {
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;

    let tmp = TempDir::new().unwrap();
    let fake_exe = tmp.path().join("secretbank-nm-host.exe");

    // Windows는 HOME 격리가 dirs::data_dir() (APPDATA) 기반이므로
    // APPDATA env var 를 임시 디렉토리로 설정한다.
    unsafe {
        std::env::set_var("APPDATA", tmp.path());
    }

    installer::install(Browser::Chrome, "win_test_id", Some(&fake_exe)).unwrap();

    // manifest 파일 존재 확인
    let manifest_file = installer::manifest_path(Browser::Chrome).unwrap();
    assert!(manifest_file.exists(), "manifest 파일 존재해야 함");

    // 레지스트리 키 존재 확인
    assert!(
        installer::is_installed_registry(Browser::Chrome),
        "Chrome 레지스트리 키가 존재해야 함"
    );

    // 레지스트리 기본값이 manifest 파일 경로와 일치하는지 확인
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let key_path = format!(r"Software\Google\Chrome\NativeMessagingHosts\{HOST_NAME}");
    let key = hkcu.open_subkey(&key_path).unwrap();
    let reg_val: String = key.get_value("").unwrap();
    assert_eq!(
        reg_val,
        manifest_file.to_string_lossy().to_string(),
        "레지스트리 값이 manifest 파일 경로와 일치해야 함"
    );

    // uninstall
    installer::uninstall(Browser::Chrome).unwrap();

    assert!(
        !installer::is_installed_registry(Browser::Chrome),
        "uninstall 후 레지스트리 키가 없어야 함"
    );
    assert!(
        !manifest_file.exists(),
        "uninstall 후 manifest 파일이 없어야 함"
    );

    unsafe {
        std::env::remove_var("APPDATA");
    }
}

#[test]
#[cfg(windows)]
fn integration_windows_firefox_registry_roundtrip() {
    let tmp = TempDir::new().unwrap();
    let fake_exe = tmp.path().join("secretbank-nm-host.exe");

    unsafe {
        std::env::set_var("APPDATA", tmp.path());
    }

    installer::install(Browser::Firefox, "ff_win_test", Some(&fake_exe)).unwrap();

    assert!(
        installer::is_installed_registry(Browser::Firefox),
        "Firefox 레지스트리 키가 존재해야 함"
    );

    installer::uninstall(Browser::Firefox).unwrap();

    assert!(
        !installer::is_installed_registry(Browser::Firefox),
        "uninstall 후 Firefox 레지스트리 키가 없어야 함"
    );

    unsafe {
        std::env::remove_var("APPDATA");
    }
}

#[test]
#[cfg(windows)]
fn integration_windows_uninstall_idempotent() {
    let tmp = TempDir::new().unwrap();
    unsafe {
        std::env::set_var("APPDATA", tmp.path());
    }

    // 설치 없이 uninstall → 에러 없이 성공 (idempotent)
    installer::uninstall(Browser::Chrome).unwrap();
    installer::uninstall(Browser::Firefox).unwrap();

    unsafe {
        std::env::remove_var("APPDATA");
    }
}
