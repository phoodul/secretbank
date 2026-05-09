// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2025 Secretbank contributors
//
// B-7: Extension session token — HMAC-SHA256 발급/검증/TTL.
//
// # 토큰 구조 (base64url, no-pad)
//   <ts_secs:u64 big-endian 8 bytes> || <nonce:16 bytes random> || <sig:32 bytes HMAC-SHA256>
//   base64url(56 bytes) = 75자 (no padding)
//
// # 서명 입력
//   HMAC-SHA256(key, "session" || ts_bytes || nonce_bytes || ext_id.as_bytes())
//
// # 보안
//   - constant-time 서명 비교 (subtle::ConstantTimeEq) — timing attack 방어
//   - CSPRNG nonce (16 bytes, rand::thread_rng)
//   - TTL 는 발급 시각 기준 (시계 후진 공격은 서버 측에서 방어 — 여기선 단조 증가 보장 없음)

use base64::{engine::general_purpose::URL_SAFE_NO_PAD as B64URL, Engine as _};
use hmac::{Hmac, Mac};
use rand::RngCore as _;
use sha2::Sha256;
use std::time::{SystemTime, UNIX_EPOCH};
use subtle::ConstantTimeEq;
use thiserror::Error;

// ---------------------------------------------------------------------------
// 공개 오류 타입
// ---------------------------------------------------------------------------

/// Session token 검증 오류
#[derive(Debug, Error, PartialEq, Eq)]
pub enum SessionError {
    /// 서명 불일치 — 잘못된 secret 또는 변조된 token
    #[error("session token signature is invalid")]
    InvalidSignature,

    /// TTL 만료
    #[error("session token has expired")]
    Expired,

    /// 토큰 형식 오류 (base64 디코딩 실패 또는 길이 불일치)
    #[error("session token is malformed")]
    Malformed,
}

// ---------------------------------------------------------------------------
// 상수
// ---------------------------------------------------------------------------

/// 토큰 접두사 (HMAC 입력에 포함 — domain separation)
const DOMAIN: &[u8] = b"session";

/// 타임스탬프 필드 크기 (u64 big-endian)
const TS_LEN: usize = 8;

/// nonce 크기 (CSPRNG 16바이트)
const NONCE_LEN: usize = 16;

/// HMAC-SHA256 출력 크기
const SIG_LEN: usize = 32;

/// 직렬화된 원시 토큰 크기 = ts + nonce + sig
const RAW_LEN: usize = TS_LEN + NONCE_LEN + SIG_LEN;

// ---------------------------------------------------------------------------
// 내부 서명 계산
// ---------------------------------------------------------------------------

/// HMAC-SHA256(secret, DOMAIN || ts_bytes || nonce_bytes || ext_id)
///
/// secret: 32-byte symmetric key
/// ts_secs: 발급 시각 (unix seconds, u64 big-endian)
/// nonce: 16-byte random
/// ext_id: 브라우저 extension 고유 ID
fn compute_sig(
    secret: &[u8; 32],
    ts_secs: u64,
    nonce: &[u8; NONCE_LEN],
    ext_id: &str,
) -> [u8; SIG_LEN] {
    let mut mac =
        Hmac::<Sha256>::new_from_slice(secret.as_slice()).expect("HMAC 는 임의 길이 키를 받는다");
    mac.update(DOMAIN);
    mac.update(&ts_secs.to_be_bytes());
    mac.update(nonce.as_slice());
    mac.update(ext_id.as_bytes());
    let result = mac.finalize().into_bytes();
    // GenericArray<u8, 32> → [u8; 32]
    let mut sig = [0u8; SIG_LEN];
    sig.copy_from_slice(&result);
    sig
}

// ---------------------------------------------------------------------------
// 공개 API
// ---------------------------------------------------------------------------

/// Session token 발급.
///
/// # 인자
/// - `secret`: 32-byte HMAC 키 (CSPRNG 생성, vault 보관)
/// - `ext_id`: 브라우저 extension 고유 ID (domain separation)
/// - `ttl_seconds`: 만료 TTL (초). 0이면 즉시 만료 (테스트용).
///
/// # 반환
/// base64url-no-pad 인코딩된 56-byte 토큰 (75자)
pub fn issue_token(secret: &[u8; 32], ext_id: &str, ttl_seconds: u64) -> String {
    // 현재 unix timestamp (seconds)
    let ts_secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("시스템 시계가 UNIX_EPOCH 이전")
        .as_secs();

    // CSPRNG 16-byte nonce
    let mut nonce = [0u8; NONCE_LEN];
    rand::thread_rng().fill_bytes(&mut nonce);

    issue_token_at(secret, ext_id, ttl_seconds, ts_secs, &nonce)
}

/// 타임스탬프와 nonce 를 직접 주입하는 내부 헬퍼 (단위 테스트에서 만료 시뮬레이션).
///
/// 공개하지 않음 — 테스트 모듈에서 `super::issue_token_at` 으로만 접근.
pub(crate) fn issue_token_at(
    secret: &[u8; 32],
    ext_id: &str,
    ttl_seconds: u64,
    ts_secs: u64,
    nonce: &[u8; NONCE_LEN],
) -> String {
    let sig = compute_sig(secret, ts_secs, nonce, ext_id);

    // raw = ts_bytes || nonce || sig (56 bytes)
    let mut raw = [0u8; RAW_LEN];
    raw[..TS_LEN].copy_from_slice(&ts_secs.to_be_bytes());
    raw[TS_LEN..TS_LEN + NONCE_LEN].copy_from_slice(nonce.as_slice());
    raw[TS_LEN + NONCE_LEN..].copy_from_slice(&sig);

    // ttl_seconds 는 발급 시 소비하지 않고 verify 쪽에서 TTL 을 받아 검증.
    // 토큰 자체에 TTL 을 포함하지 않는다 — TTL 은 서버(앱) 설정으로 관리.
    // (ttl_seconds 파라미터는 issue 흐름 대칭을 위해 선언만 하고 payload 에는 포함 안 함)
    let _ = ttl_seconds;

    B64URL.encode(raw)
}

/// Session token 검증.
///
/// # 인자
/// - `secret`: 32-byte HMAC 키 (vault 에서 읽음)
/// - `token`: `issue_token` 이 반환한 base64url 문자열
/// - `ext_id`: 발급 시와 동일한 extension ID
/// - `ttl_seconds`: 허용 TTL (초). 이 시간이 지나면 `Expired`.
/// - `now_secs`: 현재 unix timestamp (테스트 주입용). `None` 이면 `SystemTime::now()`.
///
/// # 반환
/// `Ok(())` = 유효한 토큰.  에러 = `SessionError` 의 세 변형 중 하나.
pub fn verify_token_at(
    secret: &[u8; 32],
    token: &str,
    ext_id: &str,
    ttl_seconds: u64,
    now_secs: Option<u64>,
) -> Result<(), SessionError> {
    // 1. base64url 디코딩
    let raw = B64URL
        .decode(token.as_bytes())
        .map_err(|_| SessionError::Malformed)?;
    if raw.len() != RAW_LEN {
        return Err(SessionError::Malformed);
    }

    // 2. 필드 분해
    let ts_bytes: [u8; TS_LEN] = raw[..TS_LEN].try_into().expect("슬라이스 크기 보장");
    let nonce: [u8; NONCE_LEN] = raw[TS_LEN..TS_LEN + NONCE_LEN]
        .try_into()
        .expect("슬라이스 크기 보장");
    let stored_sig: [u8; SIG_LEN] = raw[TS_LEN + NONCE_LEN..]
        .try_into()
        .expect("슬라이스 크기 보장");

    let ts_secs = u64::from_be_bytes(ts_bytes);

    // 3. constant-time HMAC 서명 재계산 + 비교
    let expected_sig = compute_sig(secret, ts_secs, &nonce, ext_id);

    // subtle::ConstantTimeEq — 타이밍 공격 방어
    if expected_sig.ct_eq(&stored_sig).unwrap_u8() != 1 {
        return Err(SessionError::InvalidSignature);
    }

    // 4. TTL 검증 (서명 검증 후 — 서명이 틀린 경우 Expired 를 먼저 반환하면 oracle)
    let now = now_secs.unwrap_or_else(|| {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("시스템 시계가 UNIX_EPOCH 이전")
            .as_secs()
    });

    if now.saturating_sub(ts_secs) > ttl_seconds {
        return Err(SessionError::Expired);
    }

    Ok(())
}

/// Session token 검증 (현재 시각 자동).
///
/// 프로덕션 코드에서 사용하는 래퍼.
pub fn verify_token(
    secret: &[u8; 32],
    token: &str,
    ext_id: &str,
    ttl_seconds: u64,
) -> Result<(), SessionError> {
    verify_token_at(secret, token, ext_id, ttl_seconds, None)
}

// ---------------------------------------------------------------------------
// 단위 테스트
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    /// 32-byte all-zero test secret
    fn test_secret() -> [u8; 32] {
        [0x42u8; 32]
    }

    // ── ST1: issue + verify round-trip ──────────────────────────────────────

    #[test]
    fn st1_issue_verify_round_trip() {
        let secret = test_secret();
        let ext_id = "chrome_test_ext_001";
        let ttl = 3600u64; // 1시간

        let token = issue_token(&secret, ext_id, ttl);
        let result = verify_token(&secret, &token, ext_id, ttl);
        assert!(result.is_ok(), "round-trip 검증 실패: {result:?}");
    }

    // ── ST2: 잘못된 secret → InvalidSignature ───────────────────────────────

    #[test]
    fn st2_wrong_secret_invalid_signature() {
        let secret = test_secret();
        let wrong_secret = [0xFFu8; 32];
        let ext_id = "chrome_test_ext_001";
        let ttl = 3600u64;

        let token = issue_token(&secret, ext_id, ttl);
        let result = verify_token(&wrong_secret, &token, ext_id, ttl);
        assert_eq!(result, Err(SessionError::InvalidSignature));
    }

    // ── ST3: TTL 만료 → Expired ─────────────────────────────────────────────

    #[test]
    fn st3_expired_token() {
        let secret = test_secret();
        let ext_id = "firefox_test_ext";
        let ttl = 60u64; // 60초 TTL

        // 과거 타임스탬프 주입 (61초 전)
        let past_ts = 1_700_000_000u64; // 과거 고정 timestamp
        let nonce = [0xAAu8; NONCE_LEN];
        let token = issue_token_at(&secret, ext_id, ttl, past_ts, &nonce);

        // now = past_ts + 61 (TTL 초과)
        let now = past_ts + 61;
        let result = verify_token_at(&secret, &token, ext_id, ttl, Some(now));
        assert_eq!(result, Err(SessionError::Expired));
    }

    // ── ST4: TTL 경계 — 만료 전 OK, 만료 직후 Expired ──────────────────────

    #[test]
    fn st4_ttl_boundary() {
        let secret = test_secret();
        let ext_id = "edge_test_ext";
        let ttl = 100u64;
        let past_ts = 1_700_000_000u64;
        let nonce = [0xBBu8; NONCE_LEN];

        let token = issue_token_at(&secret, ext_id, ttl, past_ts, &nonce);

        // 만료 직전 (now = past_ts + 100) → OK (== 경계는 포함)
        let result_ok = verify_token_at(&secret, &token, ext_id, ttl, Some(past_ts + 100));
        assert!(result_ok.is_ok(), "TTL 경계 OK 실패");

        // 만료 직후 (now = past_ts + 101) → Expired
        let result_exp = verify_token_at(&secret, &token, ext_id, ttl, Some(past_ts + 101));
        assert_eq!(result_exp, Err(SessionError::Expired));
    }

    // ── ST5: 잘못된 형식 토큰 → Malformed ──────────────────────────────────

    #[test]
    fn st5_malformed_token() {
        let secret = test_secret();
        let ext_id = "test_ext";

        // 완전히 무관한 문자열
        let result = verify_token(&secret, "not-a-token", ext_id, 3600);
        assert_eq!(result, Err(SessionError::Malformed));

        // 길이 불일치 (정상 base64url 이지만 52 bytes — 4 바이트 짧음)
        let short_raw = [0u8; RAW_LEN - 4];
        let short_token = B64URL.encode(short_raw);
        let result2 = verify_token(&secret, &short_token, ext_id, 3600);
        assert_eq!(result2, Err(SessionError::Malformed));
    }

    // ── ST6: ext_id 불일치 → InvalidSignature ──────────────────────────────

    #[test]
    fn st6_wrong_ext_id_invalid_signature() {
        let secret = test_secret();
        let ext_id_a = "chrome_ext_aaa";
        let ext_id_b = "firefox_ext_bbb";
        let ttl = 3600u64;

        let token = issue_token(&secret, ext_id_a, ttl);
        let result = verify_token(&secret, &token, ext_id_b, ttl);
        assert_eq!(result, Err(SessionError::InvalidSignature));
    }

    // ── ST7: 토큰 1비트 변조 → InvalidSignature ────────────────────────────

    #[test]
    fn st7_tampered_token_invalid_signature() {
        let secret = test_secret();
        let ext_id = "chrome_test";
        let ttl = 3600u64;

        let token = issue_token(&secret, ext_id, ttl);
        let mut raw = B64URL.decode(&token).unwrap();

        // 서명 첫 번째 바이트 XOR 변조
        raw[TS_LEN + NONCE_LEN] ^= 0x01;
        let tampered = B64URL.encode(&raw);

        let result = verify_token(&secret, &tampered, ext_id, ttl);
        assert_eq!(result, Err(SessionError::InvalidSignature));
    }

    // ── ST8: 다른 ext_id 용 토큰이 다른 ext_id 에 사용 불가 ────────────────

    #[test]
    fn st8_token_not_reusable_across_ext_ids() {
        let secret = test_secret();
        let ttl = 3600u64;

        let token_a = issue_token(&secret, "ext_a", ttl);
        let token_b = issue_token(&secret, "ext_b", ttl);

        // 교차 사용 모두 실패
        assert_eq!(
            verify_token(&secret, &token_a, "ext_b", ttl),
            Err(SessionError::InvalidSignature)
        );
        assert_eq!(
            verify_token(&secret, &token_b, "ext_a", ttl),
            Err(SessionError::InvalidSignature)
        );
    }

    // ── ST9: 토큰 길이 = 75자 (base64url-no-pad of 56 bytes) ───────────────

    #[test]
    fn st9_token_length() {
        let secret = test_secret();
        let token = issue_token(&secret, "test_ext", 3600);
        // 56 bytes * 4/3 = 74.67 → ceiling = 75 (no-pad)
        assert_eq!(token.len(), 75, "토큰 길이 = 75자");
    }

    // ── ST10: constant-time 비교 — 여러 잘못된 서명 시도 모두 실패 ──────────

    #[test]
    fn st10_constant_time_multiple_wrong_sigs_all_fail() {
        let secret = test_secret();
        let ext_id = "chrome_test";
        let ttl = 3600u64;

        let valid_token = issue_token(&secret, ext_id, ttl);
        let raw = B64URL.decode(&valid_token).unwrap();

        // 서명 바이트를 한 바이트씩 XOR 변조해 32개 모두 실패 확인
        for i in 0..SIG_LEN {
            let mut tampered_raw = raw.clone();
            tampered_raw[TS_LEN + NONCE_LEN + i] ^= 0xFF;
            let tampered = B64URL.encode(&tampered_raw);
            let result = verify_token(&secret, &tampered, ext_id, ttl);
            assert_eq!(
                result,
                Err(SessionError::InvalidSignature),
                "바이트 {i} 변조 시 InvalidSignature 기대"
            );
        }
    }

    // ── ST11: 빈 ext_id 도 동작 (domain separation 유지) ───────────────────

    #[test]
    fn st11_empty_ext_id_round_trip() {
        let secret = test_secret();
        let token = issue_token(&secret, "", 3600);
        let result = verify_token(&secret, &token, "", 3600);
        assert!(result.is_ok());

        // 빈 ext_id 토큰은 비빈 ext_id 에서 실패
        let result2 = verify_token(&secret, &token, "some_ext", 3600);
        assert_eq!(result2, Err(SessionError::InvalidSignature));
    }

    // ── ST12: 만료 직전 (경계값 0초 남음) ──────────────────────────────────

    #[test]
    fn st12_zero_ttl_immediately_expired() {
        let secret = test_secret();
        let ext_id = "test_ext";
        let past_ts = 1_700_000_000u64;
        let nonce = [0xCCu8; NONCE_LEN];

        // ttl=0, now=past_ts+1 → 즉시 만료
        let token = issue_token_at(&secret, ext_id, 0, past_ts, &nonce);
        let result = verify_token_at(&secret, &token, ext_id, 0, Some(past_ts + 1));
        assert_eq!(result, Err(SessionError::Expired));
    }
}
