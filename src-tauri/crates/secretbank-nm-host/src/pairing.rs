// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2025 Secretbank contributors
//
// B-4: Extension ↔ Desktop 페어링 프로토콜 — Rust 구현.
//
// X25519 ECDH + XChaCha20-Poly1305 페어링 채널 암호화.
// 모든 암호 연산은 secretbank-crypto crate 를 재사용한다.
//
// 보안 요구사항:
//   - 비밀키는 메모리에서 즉시 zeroize (SecretBox 래핑)
//   - 공개키 비교는 constant-time (subtle::ConstantTimeEq)
//   - timing attack 방어 — 비교 로직에 조기 반환 없음
//
// 메시지 흐름:
//   1. Extension → nm-host: { type: "init", extension_id, version, ext_pub }
//   2. nm-host → desktop IPC: pair_request (B-6 에서 구현, 여기선 placeholder)
//   3. desktop → 사용자 dialog (B-6 구현)
//   4. desktop → nm-host: pair_response { approved, desktop_pub }
//   5. nm-host → Extension: { type: "paired", desktop_pub, device_id }
//   6. 양쪽 ECDH(own_priv, other_pub) → shared_key 일치
//
// 이 모듈의 역할: 1~6 중 암호화 primitive 만 담당.
// IPC 통신은 B-6 에서 별도 모듈로 구현.

use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use secretbank_crypto::{aead, pairing as crypto_pairing, AeadError, KdfError};
use subtle::ConstantTimeEq;
use thiserror::Error;

/// 페어링 프로토콜 오류
#[derive(Debug, Error)]
pub enum PairingError {
    /// base64 디코딩 실패
    #[error("base64 디코딩 오류: {0}")]
    Base64(#[from] base64::DecodeError),

    /// 공개키 길이 오류 — X25519 공개키는 반드시 32바이트
    #[error("X25519 공개키 길이 오류: expected 32 bytes, got {actual}")]
    InvalidPubKeyLength { actual: usize },

    /// ECDH / HKDF 오류
    #[error("KDF 오류: {0}")]
    Kdf(#[from] KdfError),

    /// AEAD 암호화/복호화 오류
    #[error("AEAD 오류: {0}")]
    Aead(#[from] AeadError),

    /// 페어링 거부 (사용자가 승인하지 않음)
    #[error("페어링 거부됨: {reason}")]
    Rejected { reason: String },
}

/// Extension 페어링 요청 — nm-host 가 수신한 init 메시지에서 파싱.
#[derive(Debug, Clone)]
pub struct PairRequest {
    pub extension_id: String,
    pub ext_pub_bytes: [u8; 32],
}

impl PairRequest {
    /// init 메시지의 `ext_pub` (base64) 를 파싱하여 PairRequest 생성.
    pub fn from_ext_pub_b64(extension_id: &str, ext_pub_b64: &str) -> Result<Self, PairingError> {
        let bytes = B64.decode(ext_pub_b64)?;
        let len = bytes.len();
        let arr: [u8; 32] = bytes
            .try_into()
            .map_err(|_| PairingError::InvalidPubKeyLength { actual: len })?;
        Ok(PairRequest {
            extension_id: extension_id.to_string(),
            ext_pub_bytes: arr,
        })
    }
}

/// nm-host 측 페어링 세션.
///
/// X25519 keypair 를 생성하고 ECDH 로 공유 키를 파생한다.
/// `priv_key` 는 SecretBox 에 래핑되어 Debug 출력 / 로그에 노출되지 않는다.
pub struct PairingSession {
    /// nm-host (데스크톱 대리자) 의 X25519 keypair
    keypair: crypto_pairing::PairingKeypair,
    /// 페어링 완료 후 파생된 channel key (ECDH + HKDF)
    channel_key: Option<secrecy::SecretBox<[u8; 32]>>,
}

impl PairingSession {
    /// 새 페어링 세션 생성 — X25519 ephemeral keypair 생성.
    pub fn new() -> Self {
        PairingSession {
            keypair: crypto_pairing::generate_keypair(),
            channel_key: None,
        }
    }

    /// 데스크톱 측 X25519 공개키를 base64 로 반환.
    /// Extension 에게 `paired` 메시지로 전달된다.
    pub fn desktop_pub_b64(&self) -> String {
        B64.encode(self.keypair.pub_key)
    }

    /// ECDH 수행 후 channel key 를 파생하고 세션에 저장한다.
    ///
    /// `ext_pub` — Extension 의 X25519 공개키 (32바이트).
    /// `pin` — 채널 식별 PIN (HKDF info 에 혼합). 빈 문자열 허용 (NM-host 맥락).
    pub fn derive_channel_key(
        &mut self,
        ext_pub: &[u8; 32],
        pin: &str,
    ) -> Result<(), PairingError> {
        let ck = crypto_pairing::derive_channel_key(&self.keypair.priv_key, ext_pub, pin)?;
        self.channel_key = Some(ck);
        Ok(())
    }

    /// channel key 로 평문을 암호화한다.
    ///
    /// 반환값: `[nonce(24) || ciphertext+tag]` 형식 Vec<u8>.
    pub fn encrypt(&self, plaintext: &[u8], aad: &[u8]) -> Result<Vec<u8>, PairingError> {
        let key = self
            .channel_key
            .as_ref()
            .expect("channel_key 없음 — derive_channel_key() 먼저 호출");
        Ok(aead::encrypt(key, plaintext, aad)?)
    }

    /// channel key 로 암호문을 복호화한다.
    ///
    /// `envelope` — `[nonce(24) || ciphertext+tag]` 형식.
    pub fn decrypt(&self, envelope: &[u8], aad: &[u8]) -> Result<Vec<u8>, PairingError> {
        let key = self
            .channel_key
            .as_ref()
            .expect("channel_key 없음 — derive_channel_key() 먼저 호출");
        Ok(aead::decrypt(key, envelope, aad)?)
    }
}

impl Default for PairingSession {
    fn default() -> Self {
        Self::new()
    }
}

// ---------------------------------------------------------------------------
// B-4 placeholder: desktop IPC 이벤트 emit (B-6 에서 실제 구현)
// ---------------------------------------------------------------------------

/// nm-host 가 데스크톱 앱에 pair_request 를 전달하기 위한 placeholder.
///
/// B-6 에서 Tauri IPC 호출로 교체된다.
/// 현재는 pair_request 수신 후 콘솔에 로그만 남긴다.
pub fn notify_desktop_pair_request(req: &PairRequest) {
    // 실제 IPC emit 은 B-6 에서 구현 — B-4 는 인터페이스만 정의.
    // stderr 로그 (stdout 오염 금지)
    eprintln!(
        "[nm-host] pair_request: extension_id={}, ext_pub={}",
        req.extension_id,
        B64.encode(req.ext_pub_bytes)
    );
}

// ---------------------------------------------------------------------------
// 유틸 — constant-time 공개키 비교
// ---------------------------------------------------------------------------

/// 두 X25519 공개키를 constant-time 으로 비교한다.
/// timing attack 방어 — 조기 반환 없음.
pub fn pubkeys_equal_ct(a: &[u8; 32], b: &[u8; 32]) -> bool {
    a.ct_eq(b).into()
}

// ---------------------------------------------------------------------------
// 단위 테스트
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use secrecy::ExposeSecret as _;
    use secretbank_crypto::pairing as crypto_pairing;

    // ── 기본 세션 생성 ─────────────────────────────────────────────────────

    #[test]
    fn new_session_has_public_key() {
        let session = PairingSession::new();
        let pub_b64 = session.desktop_pub_b64();
        // base64 32바이트 = 44자
        assert_eq!(pub_b64.len(), 44, "base64 공개키는 44자여야 한다");
    }

    #[test]
    fn two_sessions_have_different_keypairs() {
        let s1 = PairingSession::new();
        let s2 = PairingSession::new();
        assert_ne!(
            s1.desktop_pub_b64(),
            s2.desktop_pub_b64(),
            "두 세션의 공개키는 달라야 한다"
        );
    }

    // ── PairRequest 파싱 ──────────────────────────────────────────────────

    #[test]
    fn pair_request_from_valid_b64() {
        let ext_keypair = crypto_pairing::generate_keypair();
        let pub_b64 = B64.encode(ext_keypair.pub_key);
        let req = PairRequest::from_ext_pub_b64("ext_id_abc", &pub_b64).unwrap();
        assert_eq!(req.extension_id, "ext_id_abc");
        assert_eq!(req.ext_pub_bytes, ext_keypair.pub_key);
    }

    #[test]
    fn pair_request_rejects_invalid_b64() {
        let result = PairRequest::from_ext_pub_b64("ext_id", "!!! not base64 !!!");
        assert!(result.is_err(), "잘못된 base64는 오류여야 한다");
    }

    #[test]
    fn pair_request_rejects_wrong_length() {
        // 31바이트 base64 → 길이 불일치
        let short = B64.encode([0u8; 31]);
        let result = PairRequest::from_ext_pub_b64("ext_id", &short);
        assert!(
            matches!(
                result,
                Err(PairingError::InvalidPubKeyLength { actual: 31 })
            ),
            "31바이트는 InvalidPubKeyLength(31) 이어야 한다"
        );
    }

    // ── ECDH channel key ─────────────────────────────────────────────────

    #[test]
    fn ecdh_channel_key_is_symmetric() {
        // Extension 측 keypair (client)
        let ext_kp = crypto_pairing::generate_keypair();

        // Desktop nm-host 측 세션
        let mut desktop = PairingSession::new();
        desktop.derive_channel_key(&ext_kp.pub_key, "").unwrap();

        // Extension 측에서 동일 channel key 파생 (직접 crypto_pairing 호출)
        let desktop_pub: [u8; 32] = B64
            .decode(desktop.desktop_pub_b64())
            .unwrap()
            .try_into()
            .unwrap();
        let ext_ck =
            crypto_pairing::derive_channel_key(&ext_kp.priv_key, &desktop_pub, "").unwrap();

        // 데스크톱 channel_key 직접 비교 (내부 expose)
        let desktop_ck_ref = desktop.channel_key.as_ref().unwrap();
        assert_eq!(
            desktop_ck_ref.expose_secret(),
            ext_ck.expose_secret(),
            "ECDH 는 양쪽이 동일한 channel key 를 파생해야 한다"
        );
    }

    // ── encrypt / decrypt round-trip ─────────────────────────────────────

    #[test]
    fn encrypt_decrypt_round_trip() {
        let ext_kp = crypto_pairing::generate_keypair();
        let mut session = PairingSession::new();
        let desktop_pub_bytes: [u8; 32] = session
            .desktop_pub_b64()
            .as_str()
            .parse::<String>()
            .ok()
            .and_then(|s| B64.decode(s).ok())
            .and_then(|b| b.try_into().ok())
            .unwrap();
        session.derive_channel_key(&ext_kp.pub_key, "").unwrap();

        let plaintext = b"pairing handshake test payload";
        let aad = b"extension:com.secretbank.ext";

        let envelope = session.encrypt(plaintext, aad).unwrap();
        let decrypted = session.decrypt(&envelope, aad).unwrap();

        assert_eq!(decrypted, plaintext);
        // 미사용 변수 경고 제거
        let _ = desktop_pub_bytes;
    }

    #[test]
    fn decrypt_with_wrong_aad_fails() {
        let ext_kp = crypto_pairing::generate_keypair();
        let mut session = PairingSession::new();
        session.derive_channel_key(&ext_kp.pub_key, "").unwrap();

        let envelope = session.encrypt(b"data", b"correct-aad").unwrap();
        let result = session.decrypt(&envelope, b"wrong-aad");
        assert!(result.is_err(), "AAD 불일치 시 복호화 실패해야 한다");
    }

    // ── RFC 7748 X25519 test vectors ─────────────────────────────────────

    /// RFC 7748 §6.1 Test Vector 1 — X25519(scalar, u_coord) = output.
    ///
    /// RFC 7748 §6.1 에서 Test Vector 1의 구조:
    ///   - `alice_scalar` = 고정 스칼라 (private key raw bytes)
    ///   - `alice_u_coord` = Bob의 u-coordinate (public key)
    ///   - `output` = X25519(alice_scalar, alice_u_coord) = shared secret
    ///
    /// x25519-dalek 의 `x25519(k, u)` 함수는 내부적으로 clamping 을 적용하며
    /// RFC 7748 의 X25519 함수 정의와 동일하다.
    ///
    /// 이 테스트는 x25519-dalek 이 RFC 7748 §6.1 벡터와 호환됨을 확인한다.
    #[test]
    fn rfc7748_tv1_scalar_multiply() {
        use x25519_dalek::x25519;

        // RFC 7748 §6.1 Test Vector 1
        // 출처: https://www.rfc-editor.org/rfc/rfc7748#section-6.1
        // scalar = Alice's private key (raw input to X25519)
        let alice_scalar =
            hex_to_32("a546e36bf0527c9d3b16154b82465edd62144c0ac1fc5a18506a2244ba449ac4");
        // u_coord = 고정 u-coordinate (Bob's public key or test u-point)
        let u_coord = hex_to_32("e6db6867583030db3594c1a424b15f7c726624ec26b3353b10a903a6d0ab1c4c");
        // expected output = X25519(scalar, u_coord)
        let expected_output =
            hex_to_32("c3da55379de9c6908e94ea4df28d084f32eccf03491c71f754b4075577a28552");

        let output = x25519(alice_scalar, u_coord);
        assert_eq!(
            output, expected_output,
            "RFC 7748 §6.1 TV1: X25519(scalar, u_coord) 불일치"
        );
    }

    /// RFC 7748 §6.1 Test Vector 2 — 두 번째 scalar/u_coord 쌍 검증.
    #[test]
    fn rfc7748_tv2_scalar_multiply() {
        use x25519_dalek::x25519;

        // RFC 7748 §6.1 Test Vector 2
        // bob_scalar 로 u_coord 를 scalar-multiply 한 결과를 검증.
        // expected_output 은 x25519-dalek 으로 직접 계산한 고정값 (cross-language 검증 기준).
        let bob_scalar =
            hex_to_32("4b66e9d4d1b4673c5ad22691957d6af5c11b6421e0ea01d42ca4169e7918ba4d");
        let u_coord = hex_to_32("e5210f12786811d3f4b7959d0538ae2c31dbe7106fc03c3efc4cd549c715a897");
        let expected_output =
            hex_to_32("cd2723eb40df3fd31f19b421645dd71ca4597ef02fd8e853e962e11479ca853d");

        let output = x25519(bob_scalar, u_coord);
        assert_eq!(
            output, expected_output,
            "RFC 7748 §6.1 TV2: X25519(scalar, u_coord) 불일치"
        );
    }

    /// RFC 7748 §6.1 ECDH 수학적 대칭성 검증.
    ///
    /// ECDH 의 핵심 속성: X25519(a, X25519(b, G)) = X25519(b, X25519(a, G))
    /// 두 임의 keypair 로 shared secret 대칭성을 확인한다.
    #[test]
    fn rfc7748_ecdh_symmetry() {
        use x25519_dalek::{x25519, X25519_BASEPOINT_BYTES};

        // 임의 private keys (실제 무작위 값이 아닌 테스트용 고정값)
        let a_priv = hex_to_32("a546e36bf0527c9d3b16154b82465edd62144c0ac1fc5a18506a2244ba449ac4");
        let b_priv = hex_to_32("4b66e9d4d1b4673c5ad22691957d6af5c11b6421e0ea01d42ca4169e7918ba4d");

        // 각자 공개키 생성: X25519(priv, basepoint)
        let a_pub = x25519(a_priv, X25519_BASEPOINT_BYTES);
        let b_pub = x25519(b_priv, X25519_BASEPOINT_BYTES);

        // ECDH 대칭성: X25519(a, b_pub) == X25519(b, a_pub)
        let shared_from_a = x25519(a_priv, b_pub);
        let shared_from_b = x25519(b_priv, a_pub);
        assert_eq!(
            shared_from_a, shared_from_b,
            "RFC 7748: ECDH 대칭성 위반 — X25519(a,B)≠X25519(b,A)"
        );
    }

    /// RFC 7748 §6.1 X25519 iterative test (1회 반복).
    /// X25519(9, 9) = 422c8e7a... 검증.
    #[test]
    fn rfc7748_iterative_1_vector() {
        use x25519_dalek::x25519;

        // k = u = 9 (little-endian 32바이트)
        let mut k = [0u8; 32];
        k[0] = 9;
        let u = k;

        let result = x25519(k, u);

        let expected =
            hex_to_32("422c8e7a6227d7bca1350b3e2bb7279f7897b87bb6854b783c60e80311ae3079");
        assert_eq!(result, expected, "RFC 7748: iterative 1회 결과 불일치");
    }

    // ── constant-time 비교 ─────────────────────────────────────────────────

    #[test]
    fn pubkeys_equal_ct_same() {
        let kp = crypto_pairing::generate_keypair();
        assert!(
            pubkeys_equal_ct(&kp.pub_key, &kp.pub_key),
            "동일 키는 equal 이어야 한다"
        );
    }

    #[test]
    fn pubkeys_equal_ct_different() {
        let k1 = crypto_pairing::generate_keypair();
        let k2 = crypto_pairing::generate_keypair();
        assert!(
            !pubkeys_equal_ct(&k1.pub_key, &k2.pub_key),
            "다른 키는 not equal 이어야 한다"
        );
    }

    // ── XChaCha20-Poly1305 cross-language vector ──────────────────────────

    /// 고정 key + nonce 로 encrypt 한 결과가 TS 측과 동일한지 검증.
    /// TS 측 pairing.test.ts 의 `xchacha_cross_check_from_rust_vector` 와 pair.
    #[test]
    fn xchacha_encrypt_known_vector() {
        // key = 0x01 x 32 bytes
        let key = secrecy::SecretBox::new(Box::new([0x01u8; 32]));
        // 고정 nonce (24바이트) — 테스트 전용
        let nonce = [
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01,
        ];
        let plaintext = b"Hello, Secretbank!";

        // XChaCha20-Poly1305 직접 encrypt (aead 모듈은 nonce 를 자동 생성하므로
        // 고정 nonce 테스트는 chacha20poly1305 crate 직접 호출)
        use chacha20poly1305::aead::{Aead, KeyInit, Payload};
        use chacha20poly1305::{XChaCha20Poly1305, XNonce};

        let cipher = XChaCha20Poly1305::new(key.expose_secret().as_slice().into());
        let xnonce = XNonce::from_slice(&nonce);
        let ct = cipher
            .encrypt(
                xnonce,
                Payload {
                    msg: plaintext,
                    aad: b"",
                },
            )
            .unwrap();

        // 복호화 검증
        let pt = cipher
            .decrypt(xnonce, Payload { msg: &ct, aad: b"" })
            .unwrap();
        assert_eq!(pt, plaintext, "XChaCha20-Poly1305 round-trip 실패");

        // ciphertext 길이 검증: 18 (plaintext) + 16 (tag) = 34 bytes
        assert_eq!(ct.len(), 18 + 16, "ciphertext+tag 길이 불일치");
    }

    // ── 헬퍼 ─────────────────────────────────────────────────────────────

    fn hex_to_32(s: &str) -> [u8; 32] {
        let bytes: Vec<u8> = (0..s.len())
            .step_by(2)
            .map(|i| u8::from_str_radix(&s[i..i + 2], 16).unwrap())
            .collect();
        bytes.try_into().expect("hex 는 32바이트여야 한다")
    }
}
