pub mod kdf;
pub mod os_keyring;

use thiserror::Error;

/// KDF 연산 오류.
#[derive(Debug, Error)]
pub enum KdfError {
    #[error("Argon2 key derivation failed: {0}")]
    Argon2(String),

    #[error("HKDF subkey derivation failed: {0}")]
    Hkdf(String),
}

/// OS Keyring 연산 오류.
#[derive(Debug, Error)]
pub enum KeyringError {
    /// Secret Service / Keychain 접근 불가 (Linux headless 등).
    #[error("keyring unavailable: {0}")]
    Unavailable(String),

    /// 해당 account 에 저장된 항목이 없음.
    #[error("keyring entry not found")]
    NotFound,

    /// 플랫폼별 기타 오류.
    #[error("keyring backend error: {0}")]
    Backend(String),
}
