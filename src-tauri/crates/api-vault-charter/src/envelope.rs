//! enc_key envelope — `CharterSecret` → Argon2id → 32B charter_key → XChaCha20-Poly1305 wrap.
//!
//! 흐름:
//!
//! 1. `CharterSecret` (78bit) + 16B random salt → Argon2id (m=64MB, t=3, p=4) → 32B charter_key.
//! 2. 32B charter_key 로 24B random nonce + enc_key (32B) 를 XChaCha20-Poly1305 으로 envelope.
//! 3. `WrappedKey` 를 vault 파일에 저장 — recovery 시 charter_secret 로만 풀 수 있음.

use argon2::{Algorithm, Argon2, Params, Version};
use chacha20poly1305::{
    aead::{Aead, KeyInit},
    Key, XChaCha20Poly1305, XNonce,
};
use rand::RngCore;
use thiserror::Error;
use zeroize::Zeroize;

use crate::charter::CharterSecret;

const KDF_OUTPUT_LEN: usize = 32;
const KDF_SALT_LEN: usize = 16;
const NONCE_LEN: usize = 24;
const ENC_KEY_LEN: usize = 32;
const TAG_LEN: usize = 16;

const ARGON2_M_COST_KIB: u32 = 64 * 1024; // 64 MiB
const ARGON2_T_COST: u32 = 3;
const ARGON2_P_COST: u32 = 4;

#[derive(Debug, Error)]
pub enum EnvelopeError {
    #[error("KDF (Argon2id) failed: {0}")]
    Kdf(String),

    #[error("AEAD seal failed: {0}")]
    AeadSeal(String),

    #[error("AEAD open failed (wrong charter or tampered envelope)")]
    AeadOpen,

    #[error("envelope payload length mismatch (expected {expected}, got {actual})")]
    InvalidLength { expected: usize, actual: usize },
}

/// Charter envelope payload — stored alongside the vault, decryptable only with the charter.
#[derive(Clone, Debug)]
pub struct WrappedKey {
    pub kdf_salt: [u8; KDF_SALT_LEN],
    pub aead_nonce: [u8; NONCE_LEN],
    pub ciphertext: Vec<u8>, // enc_key (32B) + Poly1305 tag (16B) = 48B
}

impl WrappedKey {
    /// Serialize to a single byte vector: `salt(16) || nonce(24) || ciphertext(32+16)`.
    pub fn to_bytes(&self) -> Vec<u8> {
        let mut out = Vec::with_capacity(KDF_SALT_LEN + NONCE_LEN + self.ciphertext.len());
        out.extend_from_slice(&self.kdf_salt);
        out.extend_from_slice(&self.aead_nonce);
        out.extend_from_slice(&self.ciphertext);
        out
    }

    pub fn from_bytes(bytes: &[u8]) -> Result<Self, EnvelopeError> {
        let expected_min = KDF_SALT_LEN + NONCE_LEN + ENC_KEY_LEN + TAG_LEN;
        if bytes.len() < expected_min {
            return Err(EnvelopeError::InvalidLength {
                expected: expected_min,
                actual: bytes.len(),
            });
        }
        let mut kdf_salt = [0u8; KDF_SALT_LEN];
        let mut aead_nonce = [0u8; NONCE_LEN];
        kdf_salt.copy_from_slice(&bytes[..KDF_SALT_LEN]);
        aead_nonce.copy_from_slice(&bytes[KDF_SALT_LEN..KDF_SALT_LEN + NONCE_LEN]);
        let ciphertext = bytes[KDF_SALT_LEN + NONCE_LEN..].to_vec();
        Ok(Self {
            kdf_salt,
            aead_nonce,
            ciphertext,
        })
    }
}

fn derive_charter_key(
    secret: &CharterSecret,
    salt: &[u8; KDF_SALT_LEN],
) -> Result<[u8; KDF_OUTPUT_LEN], EnvelopeError> {
    let params = Params::new(
        ARGON2_M_COST_KIB,
        ARGON2_T_COST,
        ARGON2_P_COST,
        Some(KDF_OUTPUT_LEN),
    )
    .map_err(|e| EnvelopeError::Kdf(e.to_string()))?;
    let argon = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);

    let mut output = [0u8; KDF_OUTPUT_LEN];
    argon
        .hash_password_into(secret.as_bytes(), salt, &mut output)
        .map_err(|e| EnvelopeError::Kdf(e.to_string()))?;
    Ok(output)
}

/// Wrap a 32B `enc_key` so that it can later be recovered by the charter alone.
pub fn wrap_enc_key(
    secret: &CharterSecret,
    enc_key: &[u8; ENC_KEY_LEN],
) -> Result<WrappedKey, EnvelopeError> {
    let mut salt = [0u8; KDF_SALT_LEN];
    let mut nonce = [0u8; NONCE_LEN];
    rand::rngs::OsRng.fill_bytes(&mut salt);
    rand::rngs::OsRng.fill_bytes(&mut nonce);

    let mut charter_key = derive_charter_key(secret, &salt)?;
    let cipher = XChaCha20Poly1305::new(Key::from_slice(&charter_key));
    let xnonce = XNonce::from_slice(&nonce);
    let ciphertext = cipher
        .encrypt(xnonce, enc_key.as_slice())
        .map_err(|e| EnvelopeError::AeadSeal(e.to_string()))?;
    charter_key.zeroize();

    Ok(WrappedKey {
        kdf_salt: salt,
        aead_nonce: nonce,
        ciphertext,
    })
}

/// Recover the original 32B `enc_key`. Returns `AeadOpen` on wrong charter / tamper.
pub fn unwrap_enc_key(
    secret: &CharterSecret,
    wrapped: &WrappedKey,
) -> Result<[u8; ENC_KEY_LEN], EnvelopeError> {
    let mut charter_key = derive_charter_key(secret, &wrapped.kdf_salt)?;
    let cipher = XChaCha20Poly1305::new(Key::from_slice(&charter_key));
    let xnonce = XNonce::from_slice(&wrapped.aead_nonce);
    let plain = cipher
        .decrypt(xnonce, wrapped.ciphertext.as_slice())
        .map_err(|_| EnvelopeError::AeadOpen)?;
    charter_key.zeroize();

    if plain.len() != ENC_KEY_LEN {
        return Err(EnvelopeError::InvalidLength {
            expected: ENC_KEY_LEN,
            actual: plain.len(),
        });
    }
    let mut out = [0u8; ENC_KEY_LEN];
    out.copy_from_slice(&plain);
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixed_enc_key() -> [u8; ENC_KEY_LEN] {
        let mut k = [0u8; ENC_KEY_LEN];
        for (i, slot) in k.iter_mut().enumerate() {
            *slot = i as u8;
        }
        k
    }

    #[test]
    fn wrap_and_unwrap_round_trip() {
        let secret = CharterSecret::random();
        let enc = fixed_enc_key();
        let wrapped = wrap_enc_key(&secret, &enc).expect("wrap");
        let recovered = unwrap_enc_key(&secret, &wrapped).expect("unwrap");
        assert_eq!(enc, recovered);
    }

    #[test]
    fn wrong_charter_fails_to_unwrap() {
        let secret_a = CharterSecret::random();
        let secret_b = CharterSecret::random();
        // Vanishingly unlikely to coincide; if they do, regen.
        let secret_b = if secret_a == secret_b {
            CharterSecret::random()
        } else {
            secret_b
        };
        let enc = fixed_enc_key();
        let wrapped = wrap_enc_key(&secret_a, &enc).expect("wrap");
        let result = unwrap_enc_key(&secret_b, &wrapped);
        assert!(matches!(result, Err(EnvelopeError::AeadOpen)));
    }

    #[test]
    fn tampered_ciphertext_fails_to_unwrap() {
        let secret = CharterSecret::random();
        let enc = fixed_enc_key();
        let mut wrapped = wrap_enc_key(&secret, &enc).expect("wrap");
        wrapped.ciphertext[0] ^= 0x01;
        let result = unwrap_enc_key(&secret, &wrapped);
        assert!(matches!(result, Err(EnvelopeError::AeadOpen)));
    }

    #[test]
    fn tampered_nonce_fails_to_unwrap() {
        let secret = CharterSecret::random();
        let enc = fixed_enc_key();
        let mut wrapped = wrap_enc_key(&secret, &enc).expect("wrap");
        wrapped.aead_nonce[0] ^= 0x01;
        let result = unwrap_enc_key(&secret, &wrapped);
        assert!(matches!(result, Err(EnvelopeError::AeadOpen)));
    }

    #[test]
    fn serialize_round_trip_via_to_bytes() {
        let secret = CharterSecret::random();
        let enc = fixed_enc_key();
        let wrapped = wrap_enc_key(&secret, &enc).expect("wrap");
        let bytes = wrapped.to_bytes();
        let parsed = WrappedKey::from_bytes(&bytes).expect("parse");
        assert_eq!(parsed.kdf_salt, wrapped.kdf_salt);
        assert_eq!(parsed.aead_nonce, wrapped.aead_nonce);
        assert_eq!(parsed.ciphertext, wrapped.ciphertext);

        let recovered = unwrap_enc_key(&secret, &parsed).expect("unwrap");
        assert_eq!(enc, recovered);
    }

    #[test]
    fn from_bytes_rejects_short_input() {
        let result = WrappedKey::from_bytes(&[0u8; 10]);
        assert!(matches!(result, Err(EnvelopeError::InvalidLength { .. })));
    }
}
