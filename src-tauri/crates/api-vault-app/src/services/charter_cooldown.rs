//! Vault Charter cooldown — sidecar 파일 기반 도난 방지 메커니즘.
//!
//! # 왜 sidecar 인가
//!
//! cooldown 정보는 vault 가 잠긴 상태에서도 읽을 수 있어야 한다 (vault_unlock 시점에서
//! 검사). vault 안 setting 으로 저장하면 unlock 전에 못 읽는 닭-달걀 문제. 따라서
//! `vault.age.cooldown.json` sidecar 파일에 평문 metadata 만 저장한다.
//!
//! # Threat model
//!
//! - **공격자가 vault 파일 + 옛 charter 만 가지고 있다** (예: 도난당한 노트북 + 가족 책상의
//!   charter 종이). cooldown 활성 시 recovery 후 7일간 unlock 거부 → 진짜 사용자가
//!   원격으로 vault 파일 자체를 삭제하거나 새 마스터 비밀번호로 세션을 무효화할 시간을 번다.
//! - **공격자가 sidecar 파일을 삭제** → cooldown 회피 가능. 이 시나리오는 받아들임.
//!   cooldown 은 보조적 안전 장치 (defense in depth) 이며 원천적 방어가 아니다.
//! - **사용자가 7일 안에 비밀번호를 정상 변경** → cooldown 도 같이 클리어.

use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

/// 7일 = 604800 초 = 604_800_000 ms.
pub const DEFAULT_COOLDOWN_SECONDS: u64 = 7 * 24 * 60 * 60;

const SIDECAR_NAME: &str = "vault.age.cooldown.json";

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq, Eq)]
pub struct CooldownSidecar {
    /// 사용자가 settings 에서 cooldown 활성화 여부.
    pub enabled: bool,
    /// recovery 발생 시 설정되는 unix-ms timestamp. 이 시각 이후 unlock 허용.
    /// `None` 또는 과거 시점이면 cooldown 없음.
    pub cooldown_until_unix_ms: Option<u64>,
    /// 가장 최근 recovery 가 일어난 시각 (감사 / UI 표시용).
    pub last_recovery_unix_ms: Option<u64>,
}

#[derive(Debug, thiserror::Error)]
pub enum CooldownError {
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),

    #[error("JSON serialization failed: {0}")]
    Json(#[from] serde_json::Error),
}

pub fn sidecar_path(data_dir: &Path) -> PathBuf {
    data_dir.join(SIDECAR_NAME)
}

/// Read sidecar; returns `Default` if file does not exist.
pub fn read(data_dir: &Path) -> Result<CooldownSidecar, CooldownError> {
    let path = sidecar_path(data_dir);
    if !path.exists() {
        return Ok(CooldownSidecar::default());
    }
    let bytes = std::fs::read(&path)?;
    let parsed: CooldownSidecar = serde_json::from_slice(&bytes)?;
    Ok(parsed)
}

/// Atomic write — temp file + rename.
pub fn write(data_dir: &Path, sidecar: &CooldownSidecar) -> Result<(), CooldownError> {
    let path = sidecar_path(data_dir);
    let tmp = path.with_extension("json.tmp");
    let bytes = serde_json::to_vec_pretty(sidecar)?;
    std::fs::write(&tmp, &bytes)?;
    #[cfg(target_os = "windows")]
    if path.exists() {
        let _ = std::fs::remove_file(&path);
    }
    std::fs::rename(&tmp, &path)?;
    Ok(())
}

/// Apply a recovery event: bump `last_recovery_unix_ms` and, if `enabled`,
/// set `cooldown_until_unix_ms = now + DEFAULT_COOLDOWN_SECONDS`.
pub fn apply_recovery_event(data_dir: &Path) -> Result<CooldownSidecar, CooldownError> {
    let mut sidecar = read(data_dir)?;
    let now_ms = current_unix_ms();
    sidecar.last_recovery_unix_ms = Some(now_ms);
    if sidecar.enabled {
        sidecar.cooldown_until_unix_ms = Some(now_ms + DEFAULT_COOLDOWN_SECONDS * 1000);
    }
    write(data_dir, &sidecar)?;
    Ok(sidecar)
}

/// Check whether unlock is currently blocked by an active cooldown.
/// Returns `Some(seconds_remaining)` if blocked, `None` if free to unlock.
pub fn check_active(data_dir: &Path) -> Result<Option<u64>, CooldownError> {
    let sidecar = read(data_dir)?;
    if !sidecar.enabled {
        return Ok(None);
    }
    let until = match sidecar.cooldown_until_unix_ms {
        Some(t) => t,
        None => return Ok(None),
    };
    let now = current_unix_ms();
    if until <= now {
        return Ok(None);
    }
    Ok(Some((until - now) / 1000))
}

/// Toggle the `enabled` flag (UI bound). Existing cooldown timestamp is preserved.
pub fn set_enabled(data_dir: &Path, enabled: bool) -> Result<CooldownSidecar, CooldownError> {
    let mut sidecar = read(data_dir)?;
    sidecar.enabled = enabled;
    write(data_dir, &sidecar)?;
    Ok(sidecar)
}

/// Clear an active cooldown — invoked by the user from inside an unlocked
/// vault (which proves they are the legitimate owner).
pub fn clear_cooldown(data_dir: &Path) -> Result<CooldownSidecar, CooldownError> {
    let mut sidecar = read(data_dir)?;
    sidecar.cooldown_until_unix_ms = None;
    write(data_dir, &sidecar)?;
    Ok(sidecar)
}

fn current_unix_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn read_returns_default_when_sidecar_missing() {
        let dir = TempDir::new().unwrap();
        let s = read(dir.path()).unwrap();
        assert_eq!(s, CooldownSidecar::default());
    }

    #[test]
    fn write_then_read_round_trip() {
        let dir = TempDir::new().unwrap();
        let original = CooldownSidecar {
            enabled: true,
            cooldown_until_unix_ms: Some(1_700_000_000_000),
            last_recovery_unix_ms: Some(1_699_000_000_000),
        };
        write(dir.path(), &original).unwrap();
        let parsed = read(dir.path()).unwrap();
        assert_eq!(parsed, original);
    }

    #[test]
    fn set_enabled_preserves_cooldown_timestamp() {
        let dir = TempDir::new().unwrap();
        write(
            dir.path(),
            &CooldownSidecar {
                enabled: false,
                cooldown_until_unix_ms: Some(123),
                last_recovery_unix_ms: None,
            },
        )
        .unwrap();
        set_enabled(dir.path(), true).unwrap();
        let s = read(dir.path()).unwrap();
        assert!(s.enabled);
        assert_eq!(s.cooldown_until_unix_ms, Some(123));
    }

    #[test]
    fn check_active_returns_none_when_disabled() {
        let dir = TempDir::new().unwrap();
        write(
            dir.path(),
            &CooldownSidecar {
                enabled: false,
                cooldown_until_unix_ms: Some(u64::MAX),
                last_recovery_unix_ms: None,
            },
        )
        .unwrap();
        assert!(check_active(dir.path()).unwrap().is_none());
    }

    #[test]
    fn check_active_returns_none_when_past() {
        let dir = TempDir::new().unwrap();
        write(
            dir.path(),
            &CooldownSidecar {
                enabled: true,
                cooldown_until_unix_ms: Some(0),
                last_recovery_unix_ms: None,
            },
        )
        .unwrap();
        assert!(check_active(dir.path()).unwrap().is_none());
    }

    #[test]
    fn check_active_returns_remaining_seconds_when_future() {
        let dir = TempDir::new().unwrap();
        let future = current_unix_ms() + 60_000; // 60s into the future
        write(
            dir.path(),
            &CooldownSidecar {
                enabled: true,
                cooldown_until_unix_ms: Some(future),
                last_recovery_unix_ms: None,
            },
        )
        .unwrap();
        let remaining = check_active(dir.path()).unwrap().expect("active");
        // Allow ±2 second wall-clock drift.
        assert!(remaining > 55 && remaining <= 60, "remaining={remaining}");
    }

    #[test]
    fn apply_recovery_event_with_enabled_sets_future_cooldown() {
        let dir = TempDir::new().unwrap();
        set_enabled(dir.path(), true).unwrap();
        let before = current_unix_ms();
        let after_apply = apply_recovery_event(dir.path()).unwrap();
        let until = after_apply.cooldown_until_unix_ms.unwrap();
        let elapsed_min = until - before;
        // Should be very close to DEFAULT_COOLDOWN_SECONDS * 1000.
        let expected_ms = DEFAULT_COOLDOWN_SECONDS * 1000;
        assert!(
            elapsed_min.abs_diff(expected_ms) < 5_000,
            "elapsed_min={elapsed_min}, expected~={expected_ms}"
        );
        assert!(after_apply.last_recovery_unix_ms.is_some());
    }

    #[test]
    fn apply_recovery_event_with_disabled_does_not_set_cooldown() {
        let dir = TempDir::new().unwrap();
        let after = apply_recovery_event(dir.path()).unwrap();
        assert!(!after.enabled);
        assert!(after.cooldown_until_unix_ms.is_none());
        assert!(after.last_recovery_unix_ms.is_some());
    }

    #[test]
    fn clear_cooldown_zeros_out_timestamp_only() {
        let dir = TempDir::new().unwrap();
        write(
            dir.path(),
            &CooldownSidecar {
                enabled: true,
                cooldown_until_unix_ms: Some(u64::MAX),
                last_recovery_unix_ms: Some(123),
            },
        )
        .unwrap();
        let after = clear_cooldown(dir.path()).unwrap();
        assert!(after.enabled, "enabled flag preserved");
        assert!(after.cooldown_until_unix_ms.is_none());
        assert_eq!(after.last_recovery_unix_ms, Some(123));
    }
}
