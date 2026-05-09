// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2025 Secretbank contributors
//
// B-8: NM Host audit action 상수 모음.
//
// # 사용 방법
//   `secretbank_audit::actions::EXT_PAIRING_REQUEST` 와 같이 참조한다.
//
// # 명명 규칙
//   - `extension.pairing.*` — 페어링 생명 주기 이벤트
//   - `extension.session.*` — 세션 토큰 생명 주기 이벤트
//   - `extension.reveal.*`  — 시크릿 노출 이벤트 (Phase C/D placeholder)
//   - `extension.save.*`    — 저장 이벤트 (Phase D placeholder)
//
// 기존 action 문자열 (`extension.pairing.approved` 등) 은 변경하지 않는다.
// breaking change 없이 상수로 alias 만 제공한다.

// ---------------------------------------------------------------------------
// extension.pairing.*
// ---------------------------------------------------------------------------

/// 페어링 요청이 도착한 시점 (요청 수신 즉시, 승인/거부 이전).
/// B-8 에서 신규 추가.
pub const EXT_PAIRING_REQUEST: &str = "extension.pairing.request";

/// 사용자가 페어링을 승인한 시점 (B-6 에서 기존 사용).
pub const EXT_PAIRING_APPROVED: &str = "extension.pairing.approved";

/// 사용자가 페어링을 거부한 시점 (B-6 에서 기존 사용).
pub const EXT_PAIRING_REJECTED: &str = "extension.pairing.rejected";

/// 사용자가 페어링을 해제(revoke)한 시점 (B-6 에서 기존 사용).
pub const EXT_PAIRING_REVOKED: &str = "extension.pairing.revoked";

// ---------------------------------------------------------------------------
// extension.session.*
// ---------------------------------------------------------------------------

/// 세션 토큰이 발급된 시점 (Phase C/D 에서 실 호출 — 이번 B-8 에 placeholder 등록).
pub const EXT_SESSION_ISSUE: &str = "extension.session.issue";

/// session_secret 회전으로 기존 세션이 즉시 무효화된 시점.
/// B-8 에서 신규 추가: `extension_session_settings_set` 호출 시 기록.
pub const EXT_SESSION_REVOKE: &str = "extension.session.revoke";

/// 세션 토큰이 TTL 만료로 무효화된 시점 (Phase C/D placeholder).
pub const EXT_SESSION_EXPIRE: &str = "extension.session.expire";

// ---------------------------------------------------------------------------
// extension.reveal.*  (Phase C/D placeholder — 이번 B-8 에서 정의만)
// ---------------------------------------------------------------------------

/// password 타입 시크릿 노출 이벤트 (Phase C에서 실 호출 예정).
pub const EXT_REVEAL_PASSWORD: &str = "extension.reveal.password";

/// api_key 타입 시크릿 노출 이벤트 (Phase C에서 실 호출 예정).
pub const EXT_REVEAL_API_KEY: &str = "extension.reveal.api_key";

// ---------------------------------------------------------------------------
// extension.save.*  (Phase D placeholder — 이번 B-8 에서 정의만)
// ---------------------------------------------------------------------------

/// 새 시크릿 저장 이벤트 (Phase D에서 실 호출 예정).
pub const EXT_SAVE_CREATE: &str = "extension.save.create";

/// 기존 시크릿 업데이트 이벤트 (Phase D에서 실 호출 예정).
pub const EXT_SAVE_UPDATE: &str = "extension.save.update";

// ---------------------------------------------------------------------------
// 모든 신규 action 상수 목록 (테스트 순회용)
// ---------------------------------------------------------------------------

/// B-8 에서 정의된 모든 action 상수.
/// 각 action 이 audit chain 에 기록 가능한지 검증 테스트에서 사용한다.
pub const ALL_EXT_ACTIONS: &[&str] = &[
    EXT_PAIRING_REQUEST,
    EXT_PAIRING_APPROVED,
    EXT_PAIRING_REJECTED,
    EXT_PAIRING_REVOKED,
    EXT_SESSION_ISSUE,
    EXT_SESSION_REVOKE,
    EXT_SESSION_EXPIRE,
    EXT_REVEAL_PASSWORD,
    EXT_REVEAL_API_KEY,
    EXT_SAVE_CREATE,
    EXT_SAVE_UPDATE,
];

// ---------------------------------------------------------------------------
// 단위 테스트
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{append, verify, AuditActor, AuditInput, GENESIS_PREV_HASH};
    use ed25519_dalek::SigningKey;
    use time::OffsetDateTime;

    fn test_signing_key() -> SigningKey {
        let seed = [99u8; 32];
        SigningKey::from_bytes(&seed)
    }

    fn fixed_now(offset_secs: i64) -> OffsetDateTime {
        OffsetDateTime::from_unix_timestamp(1_700_000_000 + offset_secs).expect("valid timestamp")
    }

    fn make_ext_input(action: &str, ext_id: &str) -> AuditInput {
        AuditInput {
            device_id: Some("device-b8-test".to_string()),
            actor: AuditActor::LocalUser,
            action: action.to_string(),
            // extension subject — ext_id 가 subject_id 에 기록
            subject_kind: "extension".to_string(),
            subject_id: ext_id.to_string(),
            payload_json: Some(format!(r#"{{"ext_id":"{ext_id}"}}"#)),
        }
    }

    // ── BA1: 모든 신규 action 상수가 비어 있지 않고 고유해야 한다 ────────────

    #[test]
    fn ba1_all_ext_actions_non_empty_and_unique() {
        for action in ALL_EXT_ACTIONS {
            assert!(
                !action.is_empty(),
                "action 이 빈 문자열이어서는 안 된다: {action:?}"
            );
        }

        let mut seen = std::collections::HashSet::new();
        for action in ALL_EXT_ACTIONS {
            assert!(seen.insert(*action), "중복 action 상수: {action:?}");
        }
    }

    // ── BA2: 모든 신규 action 을 audit chain 에 추가하면 hash chain 이 유효 ──

    #[test]
    fn ba2_all_ext_actions_chain_integrity() {
        let sk = test_signing_key();
        let vk = sk.verifying_key();
        let ext_id = "chrome_test_b8";

        let mut chain = Vec::new();
        for (i, action) in ALL_EXT_ACTIONS.iter().enumerate() {
            let prev = chain.last();
            let entry = append(
                make_ext_input(action, ext_id),
                prev,
                &sk,
                fixed_now(i as i64),
            )
            .expect("append 성공해야 한다");
            chain.push(entry);
        }

        let result = verify(&chain, &vk);
        assert_eq!(
            result.valid_count,
            ALL_EXT_ACTIONS.len(),
            "모든 신규 action 이 chain 에 유효하게 기록되어야 한다"
        );
        assert_eq!(
            result.first_invalid_seq, None,
            "chain 무결성 깨짐 없어야 한다"
        );
    }

    // ── BA3: 다중 ext_id 환경에서 subject_id 로 분리 가능 ────────────────────

    #[test]
    fn ba3_multi_ext_id_audit_separation() {
        let sk = test_signing_key();
        let vk = sk.verifying_key();

        let ext_ids = ["chrome_ext_aaa", "firefox_ext_bbb", "edge_ext_ccc"];
        let mut chain = Vec::new();
        let mut offset = 0i64;

        // 각 ext_id 마다 pairing.request + pairing.approved 기록
        for ext_id in &ext_ids {
            for action in [EXT_PAIRING_REQUEST, EXT_PAIRING_APPROVED] {
                let prev = chain.last();
                let entry = append(make_ext_input(action, ext_id), prev, &sk, fixed_now(offset))
                    .expect("append 성공");
                chain.push(entry);
                offset += 1;
            }
        }

        // chain 전체 무결성 검증
        let result = verify(&chain, &vk);
        assert_eq!(result.valid_count, ext_ids.len() * 2);
        assert_eq!(result.first_invalid_seq, None);

        // ext_id 로 필터링 시 각 ext_id 에 2건씩 존재
        for ext_id in &ext_ids {
            let filtered: Vec<_> = chain.iter().filter(|e| e.subject_id == *ext_id).collect();
            assert_eq!(filtered.len(), 2, "{ext_id} 는 2건의 audit 가 있어야 한다");
        }
    }

    // ── BA4: EXT_PAIRING_REQUEST 와 EXT_PAIRING_APPROVED 가 같은 chain 에 공존 ─

    #[test]
    fn ba4_request_and_approved_coexist_in_chain() {
        let sk = test_signing_key();
        let vk = sk.verifying_key();
        let ext_id = "paired_ext_001";

        let e0 = append(
            make_ext_input(EXT_PAIRING_REQUEST, ext_id),
            None,
            &sk,
            fixed_now(0),
        )
        .expect("e0");

        let e1 = append(
            make_ext_input(EXT_PAIRING_APPROVED, ext_id),
            Some(&e0),
            &sk,
            fixed_now(1),
        )
        .expect("e1");

        assert_eq!(e0.action, EXT_PAIRING_REQUEST);
        assert_eq!(e1.action, EXT_PAIRING_APPROVED);
        assert_eq!(e1.prev_hash, e0.entry_hash, "prev_hash 체인 링크 확인");

        let chain = vec![e0, e1];
        let result = verify(&chain, &vk);
        assert_eq!(result.valid_count, 2);
        assert_eq!(result.first_invalid_seq, None);
    }

    // ── BA5: EXT_SESSION_REVOKE 가 System actor 로 기록 ──────────────────────

    #[test]
    fn ba5_session_revoke_with_system_actor() {
        let sk = test_signing_key();
        let vk = sk.verifying_key();
        let ext_id = "session_revoke_ext";

        let input = AuditInput {
            device_id: Some("device-b8-test".to_string()),
            actor: AuditActor::System,
            action: EXT_SESSION_REVOKE.to_string(),
            subject_kind: "extension".to_string(),
            subject_id: ext_id.to_string(),
            payload_json: Some(format!(
                r#"{{"ext_id":"{ext_id}","reason":"secret_rotation"}}"#
            )),
        };

        let entry = append(input, None, &sk, fixed_now(0)).expect("append 성공");
        assert_eq!(entry.action, EXT_SESSION_REVOKE);
        assert_eq!(entry.prev_hash, GENESIS_PREV_HASH);

        // 단일 엔트리 chain 검증
        let result = verify(&[entry], &vk);
        assert_eq!(result.valid_count, 1);
        assert_eq!(result.first_invalid_seq, None);
    }
}
