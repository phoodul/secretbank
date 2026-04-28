//! XChaCha20-Poly1305 AEAD wrapper for M9 sync.
//!
//! Wire-compatible with the frontend `@noble/ciphers/chacha` adapter:
//!   - 32-byte key
//!   - 24-byte random nonce (XChaCha20 의 extended nonce — `crypto.getRandomValues`
//!     로 충돌 사실상 0)
//!   - 16-byte Poly1305 tag (자동 prepend by `XChaCha20Poly1305`)
//!   - envelope: `[nonce(24) || ciphertext+tag]`
//!
//! AAD 옵션은 envelope binding 용 — `user:<userId>` 또는
//! `user:<userId>:cred:<credentialId>` 같은 식으로 cross-doc / cross-user
//! replay 차단.

use chacha20poly1305::aead::{Aead, KeyInit, Payload};
use chacha20poly1305::{XChaCha20Poly1305, XNonce};
use rand::RngCore;
use secrecy::{ExposeSecret as _, SecretBox};

use crate::AeadError;

pub const AEAD_KEY_BYTES: usize = 32;
pub const AEAD_NONCE_BYTES: usize = 24;
pub const AEAD_TAG_BYTES: usize = 16;

fn check_key(key: &SecretBox<[u8; 32]>) -> Result<(), AeadError> {
    let len = key.expose_secret().len();
    if len != AEAD_KEY_BYTES {
        return Err(AeadError::InvalidKeyLength {
            expected: AEAD_KEY_BYTES,
            actual: len,
        });
    }
    Ok(())
}

/// Generate a fresh 24-byte random nonce. Uses `rand::thread_rng()` —
/// CSPRNG-grade source.
pub fn generate_nonce() -> [u8; AEAD_NONCE_BYTES] {
    let mut nonce = [0u8; AEAD_NONCE_BYTES];
    rand::thread_rng().fill_bytes(&mut nonce);
    nonce
}

/// Encrypt `plaintext` with optional `aad` and return `[nonce || ct+tag]`.
pub fn encrypt(
    key: &SecretBox<[u8; 32]>,
    plaintext: &[u8],
    aad: &[u8],
) -> Result<Vec<u8>, AeadError> {
    check_key(key)?;
    let cipher = XChaCha20Poly1305::new(key.expose_secret().as_slice().into());
    let nonce_bytes = generate_nonce();
    let nonce = XNonce::from_slice(&nonce_bytes);
    let ct = cipher
        .encrypt(
            nonce,
            Payload {
                msg: plaintext,
                aad,
            },
        )
        .map_err(|e| AeadError::VerifyFailed(format!("encrypt: {e}")))?;

    let mut out = Vec::with_capacity(AEAD_NONCE_BYTES + ct.len());
    out.extend_from_slice(&nonce_bytes);
    out.extend_from_slice(&ct);
    Ok(out)
}

/// Decrypt `[nonce || ct+tag]` envelope. AAD must match what `encrypt` used.
pub fn decrypt(
    key: &SecretBox<[u8; 32]>,
    envelope: &[u8],
    aad: &[u8],
) -> Result<Vec<u8>, AeadError> {
    check_key(key)?;
    if envelope.len() < AEAD_NONCE_BYTES + AEAD_TAG_BYTES {
        return Err(AeadError::EnvelopeTooShort);
    }
    let (nonce_bytes, ct) = envelope.split_at(AEAD_NONCE_BYTES);
    let cipher = XChaCha20Poly1305::new(key.expose_secret().as_slice().into());
    let nonce = XNonce::from_slice(nonce_bytes);
    cipher
        .decrypt(nonce, Payload { msg: ct, aad })
        .map_err(|e| AeadError::VerifyFailed(format!("decrypt: {e}")))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn key(byte: u8) -> SecretBox<[u8; 32]> {
        SecretBox::new(Box::new([byte; 32]))
    }

    #[test]
    fn round_trip_typical_payload() {
        let k = key(0x01);
        let env = encrypt(&k, b"hello, sync", b"user:alice").unwrap();
        assert!(env.len() > AEAD_NONCE_BYTES + AEAD_TAG_BYTES);
        let pt = decrypt(&k, &env, b"user:alice").unwrap();
        assert_eq!(&pt, b"hello, sync");
    }

    #[test]
    fn empty_plaintext_round_trips() {
        let k = key(0x02);
        let env = encrypt(&k, b"", b"aad").unwrap();
        assert_eq!(env.len(), AEAD_NONCE_BYTES + AEAD_TAG_BYTES);
        let pt = decrypt(&k, &env, b"aad").unwrap();
        assert!(pt.is_empty());
    }

    #[test]
    fn wrong_key_fails_verify() {
        let env = encrypt(&key(0x01), b"x", b"aad").unwrap();
        let err = decrypt(&key(0x02), &env, b"aad").unwrap_err();
        assert!(matches!(err, AeadError::VerifyFailed(_)));
    }

    #[test]
    fn tampered_ciphertext_fails_verify() {
        let k = key(0x03);
        let mut env = encrypt(&k, b"abcdefgh", b"aad").unwrap();
        let last = env.len() - 1;
        env[last] ^= 0x01;
        assert!(matches!(
            decrypt(&k, &env, b"aad"),
            Err(AeadError::VerifyFailed(_))
        ));
    }

    #[test]
    fn tampered_nonce_fails_verify() {
        let k = key(0x04);
        let mut env = encrypt(&k, b"abc", b"aad").unwrap();
        env[0] ^= 0xff;
        assert!(matches!(
            decrypt(&k, &env, b"aad"),
            Err(AeadError::VerifyFailed(_))
        ));
    }

    #[test]
    fn aad_mismatch_fails_verify() {
        let k = key(0x05);
        let env = encrypt(&k, b"x", b"a").unwrap();
        assert!(matches!(
            decrypt(&k, &env, b"b"),
            Err(AeadError::VerifyFailed(_))
        ));
    }

    #[test]
    fn envelope_shorter_than_minimum_returns_too_short() {
        let k = key(0x06);
        let envelope_short = vec![0u8; AEAD_NONCE_BYTES + AEAD_TAG_BYTES - 1];
        assert!(matches!(
            decrypt(&k, &envelope_short, b""),
            Err(AeadError::EnvelopeTooShort)
        ));
    }

    #[test]
    fn two_encrypts_yield_different_envelopes_same_plaintext() {
        // Random nonce → 같은 plaintext + 같은 key → 다른 envelope.
        let k = key(0x07);
        let a = encrypt(&k, b"x", b"aad").unwrap();
        let b = encrypt(&k, b"x", b"aad").unwrap();
        assert_ne!(a, b);
        // 둘 다 정상 복호.
        assert_eq!(decrypt(&k, &a, b"aad").unwrap(), decrypt(&k, &b, b"aad").unwrap());
    }

    #[test]
    fn frontend_wire_compat_known_format() {
        // 평문 길이 N 이면 envelope 길이 = 24 + N + 16 — frontend `@noble/ciphers`
        // 와 동일한 포맷 (TS aead.ts 의 round-trip 회귀와 일치).
        let k = key(0x08);
        let env = encrypt(&k, b"0123456789", b"").unwrap();
        assert_eq!(env.len(), AEAD_NONCE_BYTES + 10 + AEAD_TAG_BYTES);
    }
}
