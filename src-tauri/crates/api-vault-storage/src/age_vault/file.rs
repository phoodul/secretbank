//! 볼트 파일 레이아웃 및 I/O 유틸리티.
//!
//! ## 파일 형식 (바이너리)
//!
//! ```text
//! ┌─────────────────────────────────────────────────┐
//! │ MAGIC   (8 bytes) — ASCII "APIVAULT"             │
//! │ VERSION (1 byte)  — 0x01                         │
//! │ SALT_AUTH (16 bytes) — Argon2id auth salt        │
//! │ SALT_ENC  (16 bytes) — Argon2id enc salt         │
//! │ AGE_PAYLOAD (variable) — age-encrypted body      │
//! └─────────────────────────────────────────────────┘
//! ```
//!
//! salt 값은 평문 헤더에 저장된다. 공격자가 이 값을 알아도 올바른 password 없이는
//! age payload 를 복호화할 수 없다 (X25519 키는 password 에서 파생).
//!
//! ## Atomic write
//!
//! 파일 쓰기는 `vault.age.tmp` → fsync → rename 순서로 원자적으로 수행한다.
//! Windows 에서는 rename destination 이 이미 존재하면 `std::fs::rename` 이 실패하므로
//! 먼저 기존 파일을 삭제한 뒤 rename 한다.
//!
//! ## 백업
//!
//! 기존 파일이 있을 때 flush 하기 전에 `vault.age.bak-{unix_ms}` 로 복사한다.
//! 최신 5개만 유지하고 오래된 것은 삭제한다.

use std::{
    io::{Read, Write},
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use crate::vault::VaultError;

/// 볼트 파일 매직 시그니처 (ASCII "APIVAULT").
pub const MAGIC: &[u8; 8] = b"APIVAULT";
/// 현재 볼트 파일 포맷 버전.
pub const VERSION: u8 = 0x01;
/// 헤더 고정 크기 = MAGIC(8) + VERSION(1) + SALT_AUTH(16) + SALT_ENC(16).
pub const HEADER_SIZE: usize = 8 + 1 + 16 + 16;

/// 볼트 파일 헤더.
///
/// salt 는 평문으로 저장되며, password 기반 키 파생에 사용된다.
/// 두 salt 가 독립적인 이유: 하나의 password 에서 auth hash 와 enc key 를
/// 각각 별도의 Argon2id 호출로 파생하면 상호 독립성을 보장할 수 있다.
#[derive(Clone, Debug)]
pub struct VaultHeader {
    /// Argon2id auth-hash 파생에 사용하는 salt (16 bytes).
    pub salt_auth: [u8; 16],
    /// Argon2id enc-key 파생에 사용하는 salt (16 bytes).
    pub salt_enc: [u8; 16],
}

impl VaultHeader {
    /// 새 헤더를 직렬화한다: MAGIC + VERSION + SALT_AUTH + SALT_ENC.
    pub fn to_bytes(&self) -> [u8; HEADER_SIZE] {
        let mut buf = [0u8; HEADER_SIZE];
        buf[0..8].copy_from_slice(MAGIC);
        buf[8] = VERSION;
        buf[9..25].copy_from_slice(&self.salt_auth);
        buf[25..41].copy_from_slice(&self.salt_enc);
        buf
    }

    /// 헤더를 `r` 에서 역직렬화한다.
    ///
    /// magic / version 이 일치하지 않으면 `VaultError::Crypto` 를 반환한다.
    pub fn read_from<R: Read>(r: &mut R) -> Result<Self, VaultError> {
        let mut buf = [0u8; HEADER_SIZE];
        r.read_exact(&mut buf).map_err(VaultError::Io)?;

        if &buf[0..8] != MAGIC {
            return Err(VaultError::Crypto(
                "invalid vault file: magic mismatch".into(),
            ));
        }
        if buf[8] != VERSION {
            return Err(VaultError::Crypto(format!(
                "unsupported vault version: 0x{:02X}",
                buf[8]
            )));
        }

        let mut salt_auth = [0u8; 16];
        let mut salt_enc = [0u8; 16];
        salt_auth.copy_from_slice(&buf[9..25]);
        salt_enc.copy_from_slice(&buf[25..41]);

        Ok(VaultHeader {
            salt_auth,
            salt_enc,
        })
    }
}

/// 볼트 파일에서 헤더와 age payload (암호화된 body) 를 분리해 읽는다.
///
/// 반환값: `(VaultHeader, age_payload_bytes)`
pub fn read_vault_file(path: &Path) -> Result<(VaultHeader, Vec<u8>), VaultError> {
    let mut file = std::fs::File::open(path).map_err(VaultError::Io)?;
    let header = VaultHeader::read_from(&mut file)?;

    let mut payload = Vec::new();
    file.read_to_end(&mut payload).map_err(VaultError::Io)?;

    Ok((header, payload))
}

/// age payload 를 포함한 볼트 파일을 atomic write 로 저장한다.
///
/// 1. 기존 파일이 존재하면 `vault.age.bak-{unix_ms}` 로 복사 (백업).
/// 2. `vault.age.tmp` 에 헤더 + payload 기록 후 fsync.
/// 3. Windows 에서는 destination 이 존재하면 먼저 삭제한 뒤 rename.
/// 4. 백업 5개 초과 시 오래된 것부터 삭제.
pub fn write_vault_file(
    path: &Path,
    header: &VaultHeader,
    age_payload: &[u8],
) -> Result<(), VaultError> {
    // 기존 파일이 있으면 백업
    if path.exists() {
        create_backup(path)?;
    }

    // tmp 파일에 쓰기 — `with_extension` 은 마지막 확장자만 교체하므로
    // "vault.age" → "vault.tmp" 가 되는 버그가 있다. 파일 이름 전체에 ".tmp" 를 붙인다.
    let tmp_path = path.with_file_name(format!(
        "{}.tmp",
        path.file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_else(|| "vault.age".into())
    ));
    {
        let mut tmp = std::fs::OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .open(&tmp_path)
            .map_err(VaultError::Io)?;

        tmp.write_all(&header.to_bytes()).map_err(VaultError::Io)?;
        tmp.write_all(age_payload).map_err(VaultError::Io)?;
        // 커널 버퍼 → 디스크 플러시
        tmp.flush().map_err(VaultError::Io)?;
        tmp.sync_all().map_err(VaultError::Io)?;
    }

    // Windows: rename destination 존재 시 먼저 삭제
    #[cfg(target_os = "windows")]
    if path.exists() {
        std::fs::remove_file(path).map_err(VaultError::Io)?;
    }

    std::fs::rename(&tmp_path, path).map_err(VaultError::Io)?;

    // 오래된 백업 정리
    prune_backups(path, 5)?;

    Ok(())
}

/// 현재 볼트 파일을 `vault.age.bak-{unix_ms}` 로 복사한다.
fn create_backup(path: &Path) -> Result<(), VaultError> {
    let unix_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();

    // 원본 파일 이름에 `.bak-{unix_ms}` 를 덧붙인다.
    // path = "/some/vault.age" → backup = "/some/vault.age.bak-1234567890"
    let bak_name = format!(
        "{}.bak-{}",
        path.file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("vault.age"),
        unix_ms
    );
    let bak_path = path
        .parent()
        .unwrap_or_else(|| Path::new("."))
        .join(bak_name);

    std::fs::copy(path, &bak_path).map_err(VaultError::Io)?;
    Ok(())
}

/// 볼트 디렉터리에서 `vault.age.bak-*` 패턴의 파일을 열거하고
/// `keep` 개를 초과하는 오래된 파일을 삭제한다.
///
/// 파일 이름의 unix_ms 숫자를 기준으로 정렬 (오래된 것 = 숫자가 작음).
pub fn prune_backups(vault_path: &Path, keep: usize) -> Result<(), VaultError> {
    let dir = vault_path.parent().unwrap_or_else(|| Path::new("."));

    let prefix = format!(
        "{}.bak-",
        vault_path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("vault.age")
    );

    let mut backups: Vec<PathBuf> = std::fs::read_dir(dir)
        .map_err(VaultError::Io)?
        .filter_map(|entry| entry.ok())
        .map(|e| e.path())
        .filter(|p| {
            p.file_name()
                .and_then(|n| n.to_str())
                .map(|n| n.starts_with(&prefix))
                .unwrap_or(false)
        })
        .collect();

    // 이름 기준 정렬 = unix_ms 오름차순 (같은 prefix 이후 숫자)
    backups.sort();

    // keep 초과분 삭제
    if backups.len() > keep {
        let to_delete = backups.len() - keep;
        for old_bak in backups.iter().take(to_delete) {
            // 삭제 실패는 치명적이지 않으므로 무시
            let _ = std::fs::remove_file(old_bak);
        }
    }

    Ok(())
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn make_header() -> VaultHeader {
        VaultHeader {
            salt_auth: [0xAA; 16],
            salt_enc: [0xBB; 16],
        }
    }

    // -----------------------------------------------------------------------
    // tmp 경로가 `.age.tmp` 로 끝나야 한다 (with_extension 버그 회귀 테스트)
    // -----------------------------------------------------------------------
    #[test]
    fn write_vault_file_tmp_has_age_tmp_suffix() {
        let dir = TempDir::new().unwrap();
        let vault_path = dir.path().join("vault.age");
        let header = make_header();
        let payload = b"fake-age-payload";

        write_vault_file(&vault_path, &header, payload).unwrap();

        // vault.age 가 정상적으로 생성되어야 한다
        assert!(vault_path.exists(), "vault.age must exist after write");

        // 잔여 .tmp 파일이 없어야 한다 (정상 경로에서는 rename 후 삭제됨)
        let tmp_wrong = dir.path().join("vault.tmp"); // 버그 시 생성될 경로
        assert!(
            !tmp_wrong.exists(),
            "vault.tmp must NOT exist — would indicate with_extension bug"
        );

        let tmp_correct = dir.path().join("vault.age.tmp"); // 올바른 경로 (rename 후 삭제됨)
        assert!(
            !tmp_correct.exists(),
            "vault.age.tmp must NOT exist after successful rename"
        );
    }

    // -----------------------------------------------------------------------
    // write → read 왕복
    // -----------------------------------------------------------------------
    #[test]
    fn write_then_read_roundtrip() {
        let dir = TempDir::new().unwrap();
        let vault_path = dir.path().join("vault.age");
        let header = make_header();
        let payload = b"roundtrip-payload";

        write_vault_file(&vault_path, &header, payload).unwrap();

        let (read_header, read_payload) = read_vault_file(&vault_path).unwrap();
        assert_eq!(read_header.salt_auth, header.salt_auth);
        assert_eq!(read_header.salt_enc, header.salt_enc);
        assert_eq!(read_payload, payload);
    }

    // -----------------------------------------------------------------------
    // 백업 5개 초과 시 가장 오래된 것 삭제
    // -----------------------------------------------------------------------
    #[test]
    fn prune_backups_keeps_five() {
        let dir = TempDir::new().unwrap();
        let vault_path = dir.path().join("vault.age");
        let header = make_header();
        let payload = b"data";

        // 초기 파일 생성
        write_vault_file(&vault_path, &header, payload).unwrap();

        // 6번 더 쓰면 backup 이 6개 생성 → prune 후 5개만 남아야
        for _ in 0..6 {
            write_vault_file(&vault_path, &header, payload).unwrap();
        }

        let backups: Vec<_> = std::fs::read_dir(dir.path())
            .unwrap()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_name().to_string_lossy().starts_with("vault.age.bak-"))
            .collect();

        assert!(
            backups.len() <= 5,
            "expected at most 5 backups, found {}",
            backups.len()
        );
    }
}
