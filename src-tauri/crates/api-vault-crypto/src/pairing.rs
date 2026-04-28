//! M9 Phase G T092 — X25519 ECDH for device pairing.
//!
//! 흐름:
//!   1. **Initiator** (이미 sign-in 한 디바이스) 가 ephemeral X25519 keypair
//!      A_priv / A_pub 생성. PIN 6자리 + A_pub 를 deep-link / QR 로 출력.
//!   2. **Joiner** (sign-in 안 된 신규 디바이스) 가 deep-link 받아 PIN + A_pub
//!      획득. 자신도 keypair B_priv / B_pub 생성. relay 의 `pair:<pin>` 채널에
//!      B_pub 업로드.
//!   3. Initiator 가 B_pub 받음. ECDH(A_priv, B_pub) → shared. HKDF "pair-
//!      channel" → 32B channel_key.
//!   4. Initiator 가 channel_key 로 (access_token, refresh_token, salt_auth,
//!      salt_enc, master_passphrase 또는 enc_key 직송) 을 AEAD 로 암호화 후
//!      relay 채널에 업로드.
//!   5. Joiner 가 ECDH(B_priv, A_pub) → 같은 shared → 같은 channel_key →
//!      decrypt → vault 에 저장. sign-in 완료.
//!
//! 본 모듈은 1-3 단계의 cryptographic primitives 만 — relay 통신 / vault
//! 저장은 services::pairing (Phase G-pair-3) 의 책임.

use hkdf::Hkdf;
use rand::rngs::OsRng;
use secrecy::SecretBox;
use sha2::Sha256;
use x25519_dalek::{PublicKey, StaticSecret};
use zeroize::Zeroize;

use crate::KdfError;

/// HKDF info string for the device-pairing channel key — must stay stable
/// across releases or paired devices fail to derive matching keys.
const PAIR_CHANNEL_LABEL: &[u8] = b"pair-channel";

/// X25519 keypair (raw 32-byte form). `priv_key` is wrapped in `SecretBox`
/// so accidental Debug logs show `***`.
pub struct PairingKeypair {
    pub priv_key: SecretBox<[u8; 32]>,
    pub pub_key: [u8; 32],
}

/// Generate a fresh ephemeral X25519 keypair.
///
/// Uses `OsRng` (CSPRNG). `StaticSecret` is the form that supports `clone`
/// — `EphemeralSecret` would force consume-on-use which makes initiator-side
/// ECDH (after waiting for joiner's pubkey) awkward. The "ephemeral" property
/// is upheld by callers discarding the keypair after one pairing exchange.
pub fn generate_keypair() -> PairingKeypair {
    let secret = StaticSecret::random_from_rng(OsRng);
    let pubkey = PublicKey::from(&secret);
    let pub_bytes = *pubkey.as_bytes();
    let priv_bytes: [u8; 32] = secret.to_bytes();
    let secret_box = SecretBox::new(Box::new(priv_bytes));
    // Keep StaticSecret around to consume zeroize on drop.
    drop(secret);
    PairingKeypair {
        priv_key: secret_box,
        pub_key: pub_bytes,
    }
}

/// Derive the shared channel key from the local private key and the peer's
/// public key. Both ends compute the same `channel_key` after exchanging
/// public keys (DH symmetry).
///
/// `pin` is mixed into the HKDF info so two concurrent pairings on the same
/// relay can't accidentally derive the same key — even if the relay state
/// machine has a bug.
pub fn derive_channel_key(
    local_priv: &SecretBox<[u8; 32]>,
    peer_pub: &[u8; 32],
    pin: &str,
) -> Result<SecretBox<[u8; 32]>, KdfError> {
    use secrecy::ExposeSecret as _;
    let priv_arr: [u8; 32] = *local_priv.expose_secret();
    let mut secret = StaticSecret::from(priv_arr);
    let peer = PublicKey::from(*peer_pub);
    let shared = secret.diffie_hellman(&peer);
    secret.zeroize();

    let mut shared_bytes: [u8; 32] = *shared.as_bytes();
    let hkdf = Hkdf::<Sha256>::new(None, &shared_bytes);
    shared_bytes.zeroize();

    // info = "pair-channel" || pin (ASCII bytes). HKDF expand 의 info 는 max
    // 255 bytes — 6 자리 PIN 은 안전 마진.
    let mut info = Vec::with_capacity(PAIR_CHANNEL_LABEL.len() + pin.len());
    info.extend_from_slice(PAIR_CHANNEL_LABEL);
    info.extend_from_slice(pin.as_bytes());

    let mut out = [0u8; 32];
    hkdf.expand(&info, &mut out)
        .map_err(|_| KdfError::Hkdf("pair channel expand failed".into()))?;
    let key = SecretBox::new(Box::new(out));
    out.zeroize();
    Ok(key)
}

#[cfg(test)]
mod tests {
    use super::*;
    use secrecy::ExposeSecret as _;

    #[test]
    fn keypairs_are_independent() {
        let k1 = generate_keypair();
        let k2 = generate_keypair();
        assert_ne!(k1.pub_key, k2.pub_key, "two fresh keypairs must differ");
    }

    #[test]
    fn ecdh_is_symmetric() {
        // A 가 priv_a 로 B 의 pub 와 derive_channel 한 결과가
        // B 가 priv_b 로 A 의 pub 와 derive_channel 한 결과와 같다.
        let a = generate_keypair();
        let b = generate_keypair();
        let ck_a = derive_channel_key(&a.priv_key, &b.pub_key, "012345").unwrap();
        let ck_b = derive_channel_key(&b.priv_key, &a.pub_key, "012345").unwrap();
        assert_eq!(ck_a.expose_secret(), ck_b.expose_secret());
    }

    #[test]
    fn different_pins_yield_different_channels() {
        let a = generate_keypair();
        let b = generate_keypair();
        let k1 = derive_channel_key(&a.priv_key, &b.pub_key, "111111").unwrap();
        let k2 = derive_channel_key(&a.priv_key, &b.pub_key, "222222").unwrap();
        assert_ne!(k1.expose_secret(), k2.expose_secret());
    }

    #[test]
    fn ecdh_with_attacker_yields_different_key() {
        // Initiator A, Joiner B, attacker M.
        // A 는 B 의 pub 와 channel 을 만들지만, M 의 keypair 와는 다른 결과.
        let a = generate_keypair();
        let b = generate_keypair();
        let m = generate_keypair();
        let ck_legit = derive_channel_key(&a.priv_key, &b.pub_key, "000000").unwrap();
        let ck_mitm = derive_channel_key(&a.priv_key, &m.pub_key, "000000").unwrap();
        assert_ne!(ck_legit.expose_secret(), ck_mitm.expose_secret());
    }

    #[test]
    fn channel_key_is_32_bytes() {
        let a = generate_keypair();
        let b = generate_keypair();
        let ck = derive_channel_key(&a.priv_key, &b.pub_key, "123456").unwrap();
        assert_eq!(ck.expose_secret().len(), 32);
    }

    #[test]
    fn empty_pin_still_derives_a_key() {
        let a = generate_keypair();
        let b = generate_keypair();
        let _ck = derive_channel_key(&a.priv_key, &b.pub_key, "").unwrap();
        // 단순히 panic 없음 — UI 가 빈 PIN 을 거르되 헬퍼는 견고해야 함.
    }
}
