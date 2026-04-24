use crate::types::{AuditActor, AuditInput, AuditLog};
use ed25519_dalek::{Signature, Signer, SigningKey, Verifier, VerifyingKey};
use sha2::{Digest, Sha256};
use thiserror::Error;
use time::OffsetDateTime;

pub const GENESIS_PREV_HASH: [u8; 32] = [0u8; 32];

#[derive(Debug, Error)]
pub enum AuditError {
    #[error("signature failed")]
    Sign,
    #[error("serialization failed: {0}")]
    Serialize(String),
}

/// Result of verifying a chain.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ChainVerification {
    pub valid_count: usize,
    /// First seq where verification failed (hash or signature). None if all valid.
    pub first_invalid_seq: Option<i64>,
}

/// Deterministic canonical serialization for hashing and signing.
///
/// Format (all integers big-endian):
/// - seq: i64 BE (8 bytes)
/// - device_id: u16 BE length + utf8 bytes; 0xFFFF sentinel for None
/// - actor: u8 length + utf8 bytes
/// - action: u16 BE length + utf8 bytes
/// - subject_kind: u8 length + utf8 bytes
/// - subject_id: u16 BE length + utf8 bytes
/// - payload_json: u32 BE length + utf8 bytes; 0xFFFFFFFF sentinel for None
/// - created_at_unix_ms: i64 BE (8 bytes)
/// - prev_hash: 32 bytes verbatim
#[allow(clippy::too_many_arguments)]
fn canonical_bytes(
    seq: i64,
    device_id: Option<&str>,
    actor: AuditActor,
    action: &str,
    subject_kind: &str,
    subject_id: &str,
    payload_json: Option<&str>,
    created_at: OffsetDateTime,
    prev_hash: &[u8; 32],
) -> Vec<u8> {
    let mut buf = Vec::new();

    // seq (i64 BE, 8 bytes)
    buf.extend_from_slice(&seq.to_be_bytes());

    // device_id (u16 BE len + utf8; 0xFFFF for None)
    match device_id {
        None => buf.extend_from_slice(&0xFFFFu16.to_be_bytes()),
        Some(s) => {
            let bytes = s.as_bytes();
            let len = u16::try_from(bytes.len())
                .expect("device_id exceeds u16::MAX bytes");
            buf.extend_from_slice(&len.to_be_bytes());
            buf.extend_from_slice(bytes);
        }
    }

    // actor (u8 len + utf8)
    let actor_bytes = actor.as_str().as_bytes();
    let actor_len = u8::try_from(actor_bytes.len())
        .expect("actor string exceeds u8::MAX bytes");
    buf.push(actor_len);
    buf.extend_from_slice(actor_bytes);

    // action (u16 BE len + utf8)
    let action_bytes = action.as_bytes();
    let action_len = u16::try_from(action_bytes.len())
        .expect("action exceeds u16::MAX bytes");
    buf.extend_from_slice(&action_len.to_be_bytes());
    buf.extend_from_slice(action_bytes);

    // subject_kind (u8 len + utf8)
    let sk_bytes = subject_kind.as_bytes();
    let sk_len = u8::try_from(sk_bytes.len())
        .expect("subject_kind exceeds u8::MAX bytes");
    buf.push(sk_len);
    buf.extend_from_slice(sk_bytes);

    // subject_id (u16 BE len + utf8)
    let si_bytes = subject_id.as_bytes();
    let si_len = u16::try_from(si_bytes.len())
        .expect("subject_id exceeds u16::MAX bytes");
    buf.extend_from_slice(&si_len.to_be_bytes());
    buf.extend_from_slice(si_bytes);

    // payload_json (u32 BE len + utf8; 0xFFFFFFFF for None)
    match payload_json {
        None => buf.extend_from_slice(&0xFFFF_FFFFu32.to_be_bytes()),
        Some(s) => {
            let bytes = s.as_bytes();
            let len = u32::try_from(bytes.len())
                .expect("payload_json exceeds u32::MAX bytes");
            buf.extend_from_slice(&len.to_be_bytes());
            buf.extend_from_slice(bytes);
        }
    }

    // created_at_unix_ms (i64 BE, 8 bytes)
    let unix_ms = (created_at.unix_timestamp_nanos() / 1_000_000) as i64;
    buf.extend_from_slice(&unix_ms.to_be_bytes());

    // prev_hash (32 bytes)
    buf.extend_from_slice(prev_hash);

    buf
}

fn sha256(bytes: &[u8]) -> [u8; 32] {
    let mut h = Sha256::new();
    h.update(bytes);
    h.finalize().into()
}

/// Append a new entry to the chain.
///
/// `now` controls timestamp for determinism / testability.
/// Use `OffsetDateTime::now_utc()` in production.
/// `seq` is `prev.seq + 1`, or 0 if prev is None.
pub fn append(
    input: AuditInput,
    prev: Option<&AuditLog>,
    signing_key: &SigningKey,
    now: OffsetDateTime,
) -> Result<AuditLog, AuditError> {
    let seq = prev.map(|p| p.seq + 1).unwrap_or(0);
    let prev_hash = prev.map(|p| p.entry_hash).unwrap_or(GENESIS_PREV_HASH);

    let canonical = canonical_bytes(
        seq,
        input.device_id.as_deref(),
        input.actor,
        &input.action,
        &input.subject_kind,
        &input.subject_id,
        input.payload_json.as_deref(),
        now,
        &prev_hash,
    );

    let entry_hash = sha256(&canonical);
    let signature: Signature = signing_key.sign(&canonical);

    Ok(AuditLog {
        id: ulid::Ulid::new().to_string(),
        seq,
        device_id: input.device_id,
        actor: input.actor,
        action: input.action,
        subject_kind: input.subject_kind,
        subject_id: input.subject_id,
        payload_json: input.payload_json,
        prev_hash,
        entry_hash,
        signature: signature.to_bytes(),
        created_at: now,
    })
}

/// Verify a chain of audit entries.
///
/// Recomputes canonical bytes, SHA-256 hash, and ed25519 signature for each entry.
/// Also checks that prev_hash links correctly to the prior entry's entry_hash.
/// Returns [`ChainVerification`] with the count of valid entries and the first
/// invalid seq, if any.
pub fn verify(chain: &[AuditLog], verifying_key: &VerifyingKey) -> ChainVerification {
    let mut expected_prev = GENESIS_PREV_HASH;

    for (i, entry) in chain.iter().enumerate() {
        // Recompute canonical using the expected_prev (not entry.prev_hash),
        // then check that entry.prev_hash matches expected_prev separately.
        if entry.prev_hash != expected_prev {
            return ChainVerification {
                valid_count: i,
                first_invalid_seq: Some(entry.seq),
            };
        }

        let canonical = canonical_bytes(
            entry.seq,
            entry.device_id.as_deref(),
            entry.actor,
            &entry.action,
            &entry.subject_kind,
            &entry.subject_id,
            entry.payload_json.as_deref(),
            entry.created_at,
            &expected_prev,
        );

        let hash = sha256(&canonical);
        if hash != entry.entry_hash {
            return ChainVerification {
                valid_count: i,
                first_invalid_seq: Some(entry.seq),
            };
        }

        let sig = match Signature::from_slice(&entry.signature) {
            Ok(s) => s,
            Err(_) => {
                return ChainVerification {
                    valid_count: i,
                    first_invalid_seq: Some(entry.seq),
                }
            }
        };

        if verifying_key.verify(&canonical, &sig).is_err() {
            return ChainVerification {
                valid_count: i,
                first_invalid_seq: Some(entry.seq),
            };
        }

        expected_prev = entry.entry_hash;
    }

    ChainVerification {
        valid_count: chain.len(),
        first_invalid_seq: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::SigningKey;
    use time::OffsetDateTime;

    /// Fixed-seed signing key for deterministic tests.
    fn test_signing_key() -> SigningKey {
        let seed = [42u8; 32];
        SigningKey::from_bytes(&seed)
    }

    fn make_input(action: &str, payload: Option<&str>) -> AuditInput {
        AuditInput {
            device_id: Some("device-test-01".to_string()),
            actor: AuditActor::LocalUser,
            action: action.to_string(),
            subject_kind: "credential".to_string(),
            subject_id: "cred-01".to_string(),
            payload_json: payload.map(|s| s.to_string()),
        }
    }

    fn fixed_now(offset_secs: i64) -> OffsetDateTime {
        OffsetDateTime::from_unix_timestamp(1_700_000_000 + offset_secs)
            .expect("valid timestamp")
    }

    #[test]
    fn append_first_entry_has_genesis_prev_hash() {
        let sk = test_signing_key();
        let entry = append(make_input("credential.create", None), None, &sk, fixed_now(0))
            .expect("append succeeded");

        assert_eq!(entry.seq, 0);
        assert_eq!(entry.prev_hash, GENESIS_PREV_HASH);
    }

    #[test]
    fn append_chains_prev_hash() {
        let sk = test_signing_key();
        let e0 = append(make_input("credential.create", None), None, &sk, fixed_now(0))
            .expect("e0");
        let e1 = append(make_input("credential.update", None), Some(&e0), &sk, fixed_now(1))
            .expect("e1");

        assert_eq!(e1.seq, 1);
        assert_eq!(e1.prev_hash, e0.entry_hash);
    }

    #[test]
    fn verify_passes_for_valid_chain_of_10() {
        let sk = test_signing_key();
        let vk = sk.verifying_key();

        let mut chain: Vec<AuditLog> = Vec::new();
        for i in 0..10i64 {
            let prev = chain.last();
            let entry = append(
                make_input(&format!("action.{i}"), None),
                prev,
                &sk,
                fixed_now(i),
            )
            .expect("append");
            chain.push(entry);
        }

        let result = verify(&chain, &vk);
        assert_eq!(result.valid_count, 10);
        assert_eq!(result.first_invalid_seq, None);
    }

    #[test]
    fn verify_detects_payload_tamper() {
        let sk = test_signing_key();
        let vk = sk.verifying_key();

        let mut chain: Vec<AuditLog> = Vec::new();
        for i in 0..5i64 {
            let prev = chain.last();
            let entry = append(
                make_input(&format!("action.{i}"), Some(&format!(r#"{{"i":{i}}}"#))),
                prev,
                &sk,
                fixed_now(i),
            )
            .expect("append");
            chain.push(entry);
        }

        // Tamper entry at index 2 (seq 2)
        chain[2].payload_json = Some(r#"{"tampered":true}"#.to_string());

        let result = verify(&chain, &vk);
        assert_eq!(result.valid_count, 2);
        assert_eq!(result.first_invalid_seq, Some(2));
    }

    #[test]
    fn verify_detects_signature_swap() {
        let sk = test_signing_key();
        let vk = sk.verifying_key();

        let mut chain: Vec<AuditLog> = Vec::new();
        for i in 0..3i64 {
            let prev = chain.last();
            let entry = append(
                make_input(&format!("action.{i}"), None),
                prev,
                &sk,
                fixed_now(i),
            )
            .expect("append");
            chain.push(entry);
        }

        // Swap entry[1] and entry[2] signatures
        let sig1 = chain[1].signature;
        let sig2 = chain[2].signature;
        chain[1].signature = sig2;
        chain[2].signature = sig1;

        let result = verify(&chain, &vk);
        // entry[1] now has entry[2]'s signature — verification should fail at seq 1
        assert!(result.first_invalid_seq.is_some());
        assert!(result.valid_count <= 1);
    }

    #[test]
    fn verify_detects_prev_hash_break() {
        let sk = test_signing_key();
        let vk = sk.verifying_key();

        let mut chain: Vec<AuditLog> = Vec::new();
        for i in 0..4i64 {
            let prev = chain.last();
            let entry = append(
                make_input(&format!("action.{i}"), None),
                prev,
                &sk,
                fixed_now(i),
            )
            .expect("append");
            chain.push(entry);
        }

        // Corrupt entry[2]'s prev_hash
        chain[2].prev_hash = [0xABu8; 32];

        let result = verify(&chain, &vk);
        assert_eq!(result.valid_count, 2);
        assert_eq!(result.first_invalid_seq, Some(2));
    }

    #[test]
    fn append_across_actors_and_optional_payload() {
        let sk = test_signing_key();
        let vk = sk.verifying_key();

        let with_payload = AuditInput {
            device_id: Some("dev-1".to_string()),
            actor: AuditActor::System,
            action: "vault.unlock".to_string(),
            subject_kind: "vault".to_string(),
            subject_id: "vault-main".to_string(),
            payload_json: Some(r#"{"source":"startup"}"#.to_string()),
        };
        let without_payload = AuditInput {
            device_id: None,
            actor: AuditActor::Connector,
            action: "connector.sync".to_string(),
            subject_kind: "connector".to_string(),
            subject_id: "github-connector-1".to_string(),
            payload_json: None,
        };

        let e0 = append(with_payload, None, &sk, fixed_now(0)).expect("e0");
        let e1 = append(without_payload, Some(&e0), &sk, fixed_now(1)).expect("e1");

        let chain = vec![e0, e1];
        let result = verify(&chain, &vk);
        assert_eq!(result.valid_count, 2);
        assert_eq!(result.first_invalid_seq, None);
    }
}
