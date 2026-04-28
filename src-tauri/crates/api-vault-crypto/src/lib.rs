pub mod aead;
pub mod kdf;
pub mod os_keyring;
pub mod pairing;

use thiserror::Error;

/// KDF 연산 오류.
#[derive(Debug, Error)]
pub enum KdfError {
    #[error("Argon2 key derivation failed: {0}")]
    Argon2(String),

    #[error("HKDF subkey derivation failed: {0}")]
    Hkdf(String),
}

/// AEAD 연산 오류 (M9 sync).
#[derive(Debug, Error)]
pub enum AeadError {
    /// 키 길이 가드 실패.
    #[error("AEAD key must be {expected} bytes, got {actual}")]
    InvalidKeyLength { expected: usize, actual: usize },

    /// envelope 가 nonce + tag 최소 길이 미달.
    #[error("AEAD envelope shorter than nonce + tag minimum")]
    EnvelopeTooShort,

    /// Poly1305 검증 실패 (잘못된 키 / tamper / cross-AAD).
    #[error("AEAD verify failed: {0}")]
    VerifyFailed(String),
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
