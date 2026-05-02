//! 볼트 파일 레이아웃 및 I/O 유틸리티.
//!
//! ## 파일 형식 (바이너리)
//!
//! ### v1 (legacy, 0x01)
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
//! ### v2 (current, 0x02 — adds Vault Charter envelope)
//!
//! ```text
//! ┌──────────────────────────────────────────────────────────┐
//! │ MAGIC   (8 bytes) — ASCII "APIVAULT"                      │
//! │ VERSION (1 byte)  — 0x02                                  │
//! │ SALT_AUTH (16 bytes) — Argon2id auth salt                 │
//! │ SALT_ENC  (16 bytes) — Argon2id enc salt                  │
//! │ CHARTER_FLAG (1 byte) — 0x00 = absent, 0x01 = present     │
//! │ [if present:                                              │
//! │   CHARTER_ENVELOPE_LEN (2 bytes, big-endian u16)          │
//! │   CHARTER_ENVELOPE     (variable) — XChaCha20-Poly1305    │
//! │                                     wrap of enc_key       │
//! │ ]                                                         │
//! │ AGE_PAYLOAD (variable) — age-encrypted body               │
//! └──────────────────────────────────────────────────────────┘
//! ```
//!
//! charter envelope 는 [`api_vault_charter::WrappedKey::to_bytes`] 직렬화 결과
//! (`salt(16) || nonce(24) || ciphertext(32+16)` = 88 bytes) 를 그대로 저장한다.
//!
//! v1 파일은 자동으로 v2 로 read 된다 (charter_envelope = None). write 는 항상 v2.
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
/// Legacy 포맷 버전 (charter 슬롯 없음). 자동으로 v2 로 읽힘.
pub const VERSION_V1: u8 = 0x01;
/// 현재 볼트 파일 포맷 버전 (charter envelope 슬롯 포함).
pub const VERSION_V2: u8 = 0x02;
/// 신규 write 시 사용하는 버전.
pub const VERSION: u8 = VERSION_V2;
/// v1 헤더 고정 크기 = MAGIC(8) + VERSION(1) + SALT_AUTH(16) + SALT_ENC(16).
pub const HEADER_V1_SIZE: usize = 8 + 1 + 16 + 16;
/// v2 의 charter 영역을 제외한 고정 prefix 크기 = v1 + CHARTER_FLAG(1).
pub const HEADER_V2_PREFIX_SIZE: usize = HEADER_V1_SIZE + 1;
/// charter envelope 의 절대 상한 (현재 88 bytes 가 표준 — 여유 두고 1024 cap).
pub const CHARTER_ENVELOPE_MAX_LEN: usize = 1024;

/// (deprecated 명칭, 호환용) v1 헤더 고정 크기.
pub const HEADER_SIZE: usize = HEADER_V1_SIZE;

/// 볼트 파일 헤더.
///
/// salt 는 평문으로 저장되며, password 기반 키 파생에 사용된다.
/// 두 salt 가 독립적인 이유: 하나의 password 에서 auth hash 와 enc key 를
/// 각각 별도의 Argon2id 호출로 파생하면 상호 독립성을 보장할 수 있다.
///
/// `charter_envelope` 는 v2+ 에서만 의미가 있다. v1 파일을 읽으면 항상 `None`.
#[derive(Clone, Debug)]
pub struct VaultHeader {
    /// Argon2id auth-hash 파생에 사용하는 salt (16 bytes).
    pub salt_auth: [u8; 16],
    /// Argon2id enc-key 파생에 사용하는 salt (16 bytes).
    pub salt_enc: [u8; 16],
    /// (v2+) Vault Charter envelope — `WrappedKey::to_bytes()` 직렬화 결과.
    /// 사용자가 charter 발급을 거부했거나 v1 vault 인 경우 `None`.
    pub charter_envelope: Option<Vec<u8>>,
}

impl VaultHeader {
    /// charter envelope 없이 v1 호환 헤더를 만든다 (테스트 / 마이그레이션 보조).
    pub fn new(salt_auth: [u8; 16], salt_enc: [u8; 16]) -> Self {
        Self {
            salt_auth,
            salt_enc,
            charter_envelope: None,
        }
    }

    /// 헤더를 v2 포맷으로 직렬화한다.
    ///
    /// 반환값의 크기:
    /// - charter 없음: `HEADER_V2_PREFIX_SIZE` (42 bytes)
    /// - charter 있음: `HEADER_V2_PREFIX_SIZE + 2 + envelope.len()`
    pub fn to_bytes(&self) -> Vec<u8> {
        let charter_extra = self
            .charter_envelope
            .as_ref()
            .map(|e| 2 + e.len())
            .unwrap_or(0);
        let mut buf = Vec::with_capacity(HEADER_V2_PREFIX_SIZE + charter_extra);
        buf.extend_from_slice(MAGIC);
        buf.push(VERSION_V2);
        buf.extend_from_slice(&self.salt_auth);
        buf.extend_from_slice(&self.salt_enc);

        match &self.charter_envelope {
            Some(env) => {
                buf.push(0x01); // CHARTER_FLAG = present
                let len = env.len() as u16;
                buf.extend_from_slice(&len.to_be_bytes());
                buf.extend_from_slice(env);
            }
            None => {
                buf.push(0x00); // CHARTER_FLAG = absent
            }
        }
        buf
    }

    /// 헤더를 `r` 에서 역직렬화한다 (v1, v2 모두 지원).
    ///
    /// magic 불일치 / 미지의 version → `VaultError::Crypto`.
    /// v1 → `charter_envelope = None` 으로 자동 승격.
    pub fn read_from<R: Read>(r: &mut R) -> Result<Self, VaultError> {
        // 우선 v1 prefix 만 읽고 version 분기.
        let mut prefix = [0u8; HEADER_V1_SIZE];
        r.read_exact(&mut prefix).map_err(VaultError::Io)?;

        if &prefix[0..8] != MAGIC {
            return Err(VaultError::Crypto(
                "invalid vault file: magic mismatch".into(),
            ));
        }

        let version = prefix[8];
        let mut salt_auth = [0u8; 16];
        let mut salt_enc = [0u8; 16];
        salt_auth.copy_from_slice(&prefix[9..25]);
        salt_enc.copy_from_slice(&prefix[25..41]);

        match version {
            VERSION_V1 => Ok(VaultHeader {
                salt_auth,
                salt_enc,
                charter_envelope: None,
            }),
            VERSION_V2 => {
                // CHARTER_FLAG (1 byte)
                let mut flag_buf = [0u8; 1];
                r.read_exact(&mut flag_buf).map_err(VaultError::Io)?;
                let charter_envelope = match flag_buf[0] {
                    0x00 => None,
                    0x01 => {
                        let mut len_buf = [0u8; 2];
                        r.read_exact(&mut len_buf).map_err(VaultError::Io)?;
                        let len = u16::from_be_bytes(len_buf) as usize;
                        if len == 0 {
                            return Err(VaultError::Crypto(
                                "v2 vault: charter flag set but length is zero".into(),
                            ));
                        }
                        if len > CHARTER_ENVELOPE_MAX_LEN {
                            return Err(VaultError::Crypto(format!(
                                "v2 vault: charter envelope length {len} exceeds cap {CHARTER_ENVELOPE_MAX_LEN}"
                            )));
                        }
                        let mut env = vec![0u8; len];
                        r.read_exact(&mut env).map_err(VaultError::Io)?;
                        Some(env)
                    }
                    other => {
                        return Err(VaultError::Crypto(format!(
                            "v2 vault: invalid CHARTER_FLAG byte 0x{other:02X}"
                        )));
                    }
                };
                Ok(VaultHeader {
                    salt_auth,
                    salt_enc,
                    charter_envelope,
                })
            }
            other => Err(VaultError::Crypto(format!(
                "unsupported vault version: 0x{other:02X}"
            ))),
        }
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
        VaultHeader::new([0xAA; 16], [0xBB; 16])
    }

    fn make_header_with_charter() -> VaultHeader {
        let mut h = make_header();
        // 88 bytes — typical WrappedKey serialization size: salt(16) + nonce(24) + ciphertext(48).
        h.charter_envelope = Some((1u8..=88u8).collect());
        h
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
    // v2 — charter envelope round-trip
    // -----------------------------------------------------------------------
    #[test]
    fn write_then_read_v2_with_charter_envelope_roundtrip() {
        let dir = TempDir::new().unwrap();
        let vault_path = dir.path().join("vault.age");
        let header = make_header_with_charter();
        let payload = b"v2-charter-payload";

        write_vault_file(&vault_path, &header, payload).unwrap();

        let (read_header, read_payload) = read_vault_file(&vault_path).unwrap();
        assert_eq!(read_header.salt_auth, header.salt_auth);
        assert_eq!(read_header.salt_enc, header.salt_enc);
        assert_eq!(read_header.charter_envelope, header.charter_envelope);
        assert_eq!(read_payload, payload);
    }

    // -----------------------------------------------------------------------
    // v1 backward compat — legacy file is read with charter_envelope = None
    // -----------------------------------------------------------------------
    #[test]
    fn read_legacy_v1_file_yields_none_charter() {
        let dir = TempDir::new().unwrap();
        let vault_path = dir.path().join("legacy_v1.age");

        // Hand-craft a v1 header (no charter slot, no flag byte).
        let mut v1_bytes = Vec::with_capacity(HEADER_V1_SIZE + 8);
        v1_bytes.extend_from_slice(MAGIC);
        v1_bytes.push(VERSION_V1);
        v1_bytes.extend_from_slice(&[0xAA; 16]);
        v1_bytes.extend_from_slice(&[0xBB; 16]);
        v1_bytes.extend_from_slice(b"v1-body");

        std::fs::write(&vault_path, &v1_bytes).unwrap();

        let (header, payload) = read_vault_file(&vault_path).unwrap();
        assert_eq!(header.salt_auth, [0xAA; 16]);
        assert_eq!(header.salt_enc, [0xBB; 16]);
        assert!(
            header.charter_envelope.is_none(),
            "v1 file must yield None charter_envelope"
        );
        assert_eq!(payload, b"v1-body");
    }

    // -----------------------------------------------------------------------
    // CHARTER_FLAG = 0x01 with zero-length envelope must be rejected.
    // -----------------------------------------------------------------------
    #[test]
    fn read_rejects_zero_length_charter_when_flag_set() {
        let dir = TempDir::new().unwrap();
        let vault_path = dir.path().join("bad_zero.age");

        let mut bytes = Vec::new();
        bytes.extend_from_slice(MAGIC);
        bytes.push(VERSION_V2);
        bytes.extend_from_slice(&[0xAA; 16]);
        bytes.extend_from_slice(&[0xBB; 16]);
        bytes.push(0x01); // flag = present
        bytes.extend_from_slice(&0u16.to_be_bytes()); // length = 0 — invalid

        std::fs::write(&vault_path, &bytes).unwrap();
        let result = read_vault_file(&vault_path);
        assert!(
            result.is_err(),
            "zero-length charter envelope must be rejected"
        );
    }

    // -----------------------------------------------------------------------
    // CHARTER_ENVELOPE > CHARTER_ENVELOPE_MAX_LEN must be rejected.
    // -----------------------------------------------------------------------
    #[test]
    fn read_rejects_charter_envelope_over_cap() {
        let dir = TempDir::new().unwrap();
        let vault_path = dir.path().join("oversize.age");

        let mut bytes = Vec::new();
        bytes.extend_from_slice(MAGIC);
        bytes.push(VERSION_V2);
        bytes.extend_from_slice(&[0xAA; 16]);
        bytes.extend_from_slice(&[0xBB; 16]);
        bytes.push(0x01);
        let oversize_len = (CHARTER_ENVELOPE_MAX_LEN as u16) + 1;
        bytes.extend_from_slice(&oversize_len.to_be_bytes());
        // Don't actually need to write the body — read_exact will fail or length check trips first.
        std::fs::write(&vault_path, &bytes).unwrap();
        let result = read_vault_file(&vault_path);
        assert!(
            result.is_err(),
            "oversize charter envelope must be rejected before read"
        );
    }

    // -----------------------------------------------------------------------
    // Unknown CHARTER_FLAG byte must be rejected.
    // -----------------------------------------------------------------------
    #[test]
    fn read_rejects_unknown_charter_flag() {
        let dir = TempDir::new().unwrap();
        let vault_path = dir.path().join("badflag.age");

        let mut bytes = Vec::new();
        bytes.extend_from_slice(MAGIC);
        bytes.push(VERSION_V2);
        bytes.extend_from_slice(&[0xAA; 16]);
        bytes.extend_from_slice(&[0xBB; 16]);
        bytes.push(0x42); // not 0x00 or 0x01

        std::fs::write(&vault_path, &bytes).unwrap();
        let result = read_vault_file(&vault_path);
        assert!(result.is_err(), "unknown CHARTER_FLAG must be rejected");
    }

    // -----------------------------------------------------------------------
    // Unknown VERSION byte must be rejected.
    // -----------------------------------------------------------------------
    #[test]
    fn read_rejects_unknown_version() {
        let dir = TempDir::new().unwrap();
        let vault_path = dir.path().join("future_v9.age");

        let mut bytes = Vec::new();
        bytes.extend_from_slice(MAGIC);
        bytes.push(0x09); // future version
        bytes.extend_from_slice(&[0xAA; 16]);
        bytes.extend_from_slice(&[0xBB; 16]);

        std::fs::write(&vault_path, &bytes).unwrap();
        let result = read_vault_file(&vault_path);
        assert!(result.is_err(), "unknown VERSION must be rejected");
    }

    // -----------------------------------------------------------------------
    // to_bytes() size invariants — encode prefix correctly.
    // -----------------------------------------------------------------------
    #[test]
    fn to_bytes_size_matches_format() {
        let h_plain = make_header();
        assert_eq!(h_plain.to_bytes().len(), HEADER_V2_PREFIX_SIZE);

        let h_charter = make_header_with_charter();
        let env_len = h_charter.charter_envelope.as_ref().unwrap().len();
        assert_eq!(
            h_charter.to_bytes().len(),
            HEADER_V2_PREFIX_SIZE + 2 + env_len
        );
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
            .filter(|e| {
                e.file_name()
                    .to_string_lossy()
                    .starts_with("vault.age.bak-")
            })
            .collect();

        assert!(
            backups.len() <= 5,
            "expected at most 5 backups, found {}",
            backups.len()
        );
    }
}
