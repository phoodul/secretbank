use argon2::{Algorithm, Argon2, Params, Version};
use hkdf::Hkdf;
use rand::RngCore;
use secrecy::{ExposeSecret, SecretBox, SecretString};
use sha2::Sha256;
use zeroize::Zeroize;

use crate::KdfError;

/// Argon2id 파라미터: m_cost=65536 KiB (64 MiB), t_cost=3, p_cost=1, output=32 bytes.
fn argon2_instance() -> Result<Argon2<'static>, KdfError> {
    let params = Params::new(65536, 3, 1, Some(32))
        .map_err(|e| KdfError::Argon2(e.to_string()))?;
    Ok(Argon2::new(Algorithm::Argon2id, Version::V0x13, params))
}

/// Argon2id 기반 authentication hash (32 bytes).
/// 같은 password + salt_auth 조합은 항상 동일한 값을 반환한다.
pub fn derive_auth_hash(
    password: &SecretString,
    salt_auth: &[u8; 16],
) -> Result<[u8; 32], KdfError> {
    let argon2 = argon2_instance()?;
    let mut output = [0u8; 32];
    argon2
        .hash_password_into(password.expose_secret().as_bytes(), salt_auth, &mut output)
        .map_err(|e| KdfError::Argon2(e.to_string()))?;
    Ok(output)
}

/// Argon2id 기반 encryption root key (32 bytes), SecretBox 로 보호.
/// salt_enc 는 salt_auth 와 별도의 랜덤 값을 사용해야 한다.
pub fn derive_enc_key(
    password: &SecretString,
    salt_enc: &[u8; 16],
) -> Result<SecretBox<[u8; 32]>, KdfError> {
    let argon2 = argon2_instance()?;
    let mut raw = [0u8; 32];
    argon2
        .hash_password_into(password.expose_secret().as_bytes(), salt_enc, &mut raw)
        .map_err(|e| KdfError::Argon2(e.to_string()))?;
    // raw 를 SecretBox 로 이전한 뒤 원본 버퍼를 즉시 zeroize 한다.
    let secret = SecretBox::new(Box::new(raw));
    raw.zeroize();
    Ok(secret)
}

/// HKDF-SHA256 으로 root key 에서 도메인별 subkey 를 파생한다.
/// info 는 용도를 구분하는 고유 문자열이어야 한다 (예: "age-vault", "crdt-root").
pub fn derive_subkey(
    root: &SecretBox<[u8; 32]>,
    info: &str,
) -> Result<SecretBox<[u8; 32]>, KdfError> {
    let hkdf = Hkdf::<Sha256>::new(None, root.expose_secret().as_slice());
    let mut subkey = [0u8; 32];
    hkdf.expand(info.as_bytes(), &mut subkey)
        .map_err(|_| KdfError::Hkdf("expand failed".into()))?;
    let secret = SecretBox::new(Box::new(subkey));
    subkey.zeroize();
    Ok(secret)
}

/// 초기 볼트 생성 시 1회 호출하는 랜덤 16바이트 salt 생성.
pub fn generate_salt() -> [u8; 16] {
    let mut salt = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut salt);
    salt
}
