//! Shamir Secret Sharing 2-of-3 — `CharterSecret` 을 3 장으로 분할.
//!
//! 각 share = (index 1..3, 88-bit packed payload, 4-digit verifier) → 7 Diceware 단어.
//! 단일 Charter (6 단어) 와의 차이: share 는 secret + share index 를 함께 담아야 하므로 한 단어 더 길다.
//!
//! 정보 이론적 보안: 1 장만 가져도 secret 비트 0개 노출 (sharks crate, GF(2⁸) byte-wise).

use sha2::{Digest, Sha256};
use sharks::{Share, Sharks};
use thiserror::Error;
use zeroize::Zeroize;

use crate::charter::CharterSecret;
use crate::wordlist::{self, WORDLIST_SIZE};

/// share 한 장의 단어 개수 (index 1B + secret 10B = 11B = 88bit → 7 단어 ≤ 90.4bit).
pub const SHARE_WORD_COUNT: usize = 7;

/// 2-of-3 임계값.
pub const THRESHOLD: u8 = 2;
/// 총 share 개수.
pub const TOTAL_SHARES: u8 = 3;

const VERIFIER_MOD: u32 = 10_000;
const SECRET_BYTES: usize = 10;

#[derive(Debug, Error)]
pub enum ShamirError {
    #[error("need at least {threshold} shares to combine, got {actual}")]
    InsufficientShares { threshold: u8, actual: usize },

    #[error("share index out of range: must be 1..={total}, got {actual}")]
    InvalidIndex { total: u8, actual: u8 },

    #[error("expected {expected} share words, got {actual}")]
    WrongWordCount { expected: usize, actual: usize },

    #[error("unknown word in share #{index}: {word:?}")]
    UnknownWord { index: u8, word: String },

    #[error("invalid verifier on share #{index}: {detail}")]
    InvalidVerifier { index: u8, detail: String },

    #[error("checksum mismatch on share #{index} (expected {expected:04}, got {actual:04}) — likely a typo")]
    ChecksumMismatch {
        index: u8,
        expected: u16,
        actual: u16,
    },

    #[error("Shamir reconstruction failed: {0}")]
    ReconstructionFailed(String),

    #[error("share serialization error: {0}")]
    SerializationFailed(String),
}

/// User-facing share representation: index + 7 단어 + verifier.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ShamirShare {
    pub index: u8,
    pub words: [String; SHARE_WORD_COUNT],
    pub verifier: u16,
}

impl ShamirShare {
    /// Canonical formatted form:
    /// `"Share 1 of 3: TUNDRA HARBOR FLINT MOTH OPAL CASCADE NEUTRAL - 7042"`.
    pub fn formatted(&self) -> String {
        let words: Vec<String> = self.words.iter().map(|w| w.to_uppercase()).collect();
        format!(
            "Share {} of {}: {} - {:04}",
            self.index,
            TOTAL_SHARES,
            words.join(" "),
            self.verifier
        )
    }

    /// Parse permissive input — `"Share 1 of 3: ..."`, `"#1 ..."`, `"1: ..."` 모두 허용.
    pub fn parse(input: &str) -> Result<Self, ShamirError> {
        let cleaned = input
            .replace(['#', ':', '-', '_', '\t', '\n', '\r', ','], " ")
            .to_lowercase();
        let tokens: Vec<&str> = cleaned.split_whitespace().collect();

        // Find the share index. Strategy: first integer in 1..=TOTAL_SHARES that is followed by
        // either "of" or by a wordlist word (start of body).
        let (index, body_start) = find_share_index(&tokens)?;

        // Tokens after body_start should be: 7 words + 1 numeric verifier.
        let body: Vec<&str> = tokens[body_start..]
            .iter()
            .copied()
            .filter(|t| *t != "of" && t.parse::<u32>().ok() != Some(TOTAL_SHARES as u32))
            .collect();

        if body.len() != SHARE_WORD_COUNT + 1 {
            return Err(ShamirError::WrongWordCount {
                expected: SHARE_WORD_COUNT,
                actual: body.len().saturating_sub(1),
            });
        }

        let verifier_token = body[SHARE_WORD_COUNT];
        let verifier: u32 = verifier_token.parse().map_err(|e: std::num::ParseIntError| {
            ShamirError::InvalidVerifier {
                index,
                detail: e.to_string(),
            }
        })?;
        if verifier >= VERIFIER_MOD {
            return Err(ShamirError::InvalidVerifier {
                index,
                detail: format!("out of range: {verifier}"),
            });
        }

        let mut words: [String; SHARE_WORD_COUNT] = Default::default();
        for (i, w) in body[..SHARE_WORD_COUNT].iter().enumerate() {
            if wordlist::index_of(w).is_none() {
                return Err(ShamirError::UnknownWord {
                    index,
                    word: (*w).to_string(),
                });
            }
            words[i] = (*w).to_string();
        }

        let computed = compute_share_verifier(index, &words);
        if computed != verifier as u16 {
            return Err(ShamirError::ChecksumMismatch {
                index,
                expected: computed,
                actual: verifier as u16,
            });
        }

        Ok(Self {
            index,
            words,
            verifier: verifier as u16,
        })
    }

    fn from_raw(index: u8, payload: [u8; SECRET_BYTES]) -> Self {
        let indices = encode_share_indices(index, &payload);
        let words: [String; SHARE_WORD_COUNT] =
            std::array::from_fn(|i| wordlist::at(indices[i]).to_string());
        let verifier = compute_share_verifier(index, &words);
        Self {
            index,
            words,
            verifier,
        }
    }

    fn to_raw(&self) -> Result<(u8, [u8; SECRET_BYTES]), ShamirError> {
        let computed = compute_share_verifier(self.index, &self.words);
        if computed != self.verifier {
            return Err(ShamirError::ChecksumMismatch {
                index: self.index,
                expected: computed,
                actual: self.verifier,
            });
        }
        let mut indices = [0usize; SHARE_WORD_COUNT];
        for (i, w) in self.words.iter().enumerate() {
            indices[i] = wordlist::index_of(w).ok_or_else(|| ShamirError::UnknownWord {
                index: self.index,
                word: w.clone(),
            })?;
        }
        Ok(decode_share_indices(&indices))
    }
}

fn find_share_index(tokens: &[&str]) -> Result<(u8, usize), ShamirError> {
    for (i, tok) in tokens.iter().enumerate() {
        if let Ok(n) = tok.parse::<u8>() {
            if (1..=TOTAL_SHARES).contains(&n) {
                let next = tokens.get(i + 1).copied().unwrap_or("");
                if next == "of" || wordlist::index_of(next).is_some() {
                    return Ok((n, i + 1));
                }
            }
        }
    }
    Err(ShamirError::InvalidIndex {
        total: TOTAL_SHARES,
        actual: 0,
    })
}

/// Split a `CharterSecret` into 3 user-printable shares; any 2 reconstruct.
pub fn shamir_split(secret: &CharterSecret) -> [ShamirShare; 3] {
    let sharks = Sharks(THRESHOLD);
    let dealer = sharks.dealer(secret.as_bytes());
    let raw_shares: Vec<Share> = dealer.take(TOTAL_SHARES as usize).collect();

    let mut out: Vec<ShamirShare> = raw_shares
        .iter()
        .map(|s| {
            let bytes: Vec<u8> = Vec::from(s);
            // bytes[0] = index, bytes[1..1+SECRET_BYTES] = y
            let mut payload = [0u8; SECRET_BYTES];
            payload.copy_from_slice(&bytes[1..1 + SECRET_BYTES]);
            ShamirShare::from_raw(bytes[0], payload)
        })
        .collect();

    // Should always be exactly 3 — invariant from `take(3)` over an infinite iterator.
    debug_assert_eq!(out.len(), 3);
    let third = out.pop().unwrap();
    let second = out.pop().unwrap();
    let first = out.pop().unwrap();
    [first, second, third]
}

/// Combine ≥2 shares back into the original `CharterSecret`.
pub fn shamir_combine(shares: &[ShamirShare]) -> Result<CharterSecret, ShamirError> {
    if shares.len() < THRESHOLD as usize {
        return Err(ShamirError::InsufficientShares {
            threshold: THRESHOLD,
            actual: shares.len(),
        });
    }

    let mut raw_shares: Vec<Share> = Vec::with_capacity(shares.len());
    for sh in shares.iter() {
        if sh.index == 0 || sh.index > TOTAL_SHARES {
            return Err(ShamirError::InvalidIndex {
                total: TOTAL_SHARES,
                actual: sh.index,
            });
        }
        let (id, payload) = sh.to_raw()?;
        let mut wire = Vec::with_capacity(1 + SECRET_BYTES);
        wire.push(id);
        wire.extend_from_slice(&payload);
        let share = Share::try_from(wire.as_slice())
            .map_err(|e| ShamirError::SerializationFailed(e.to_string()))?;
        raw_shares.push(share);
    }

    let sharks = Sharks(THRESHOLD);
    let mut recovered = sharks
        .recover(raw_shares.as_slice())
        .map_err(|e| ShamirError::ReconstructionFailed(e.to_string()))?;

    if recovered.len() != SECRET_BYTES {
        // sharks should always restore the original length; this is defense-in-depth.
        let len = recovered.len();
        recovered.zeroize();
        return Err(ShamirError::ReconstructionFailed(format!(
            "recovered length {len} != expected {SECRET_BYTES}"
        )));
    }

    let mut bytes = [0u8; SECRET_BYTES];
    bytes.copy_from_slice(&recovered);
    recovered.zeroize();
    Ok(CharterSecret::from_bytes(bytes))
}

// ---------- internals ----------

fn encode_share_indices(id: u8, payload: &[u8; SECRET_BYTES]) -> [usize; SHARE_WORD_COUNT] {
    // Pack id (8 bit, MSB) || payload (80 bit) → 88-bit value.
    let mut v: u128 = id as u128;
    for &b in payload.iter() {
        v = (v << 8) | (b as u128);
    }
    let mut out = [0usize; SHARE_WORD_COUNT];
    for slot in out.iter_mut() {
        *slot = (v % WORDLIST_SIZE as u128) as usize;
        v /= WORDLIST_SIZE as u128;
    }
    out
}

fn decode_share_indices(indices: &[usize; SHARE_WORD_COUNT]) -> (u8, [u8; SECRET_BYTES]) {
    let mut v: u128 = 0;
    for i in (0..SHARE_WORD_COUNT).rev() {
        v = v * WORDLIST_SIZE as u128 + indices[i] as u128;
    }
    let mut payload = [0u8; SECRET_BYTES];
    for i in (0..SECRET_BYTES).rev() {
        payload[i] = (v & 0xFF) as u8;
        v >>= 8;
    }
    let id = (v & 0xFF) as u8;
    (id, payload)
}

fn compute_share_verifier(index: u8, words: &[String; SHARE_WORD_COUNT]) -> u16 {
    let canonical = format!(
        "{}|{}",
        index,
        words
            .iter()
            .map(|w| w.to_lowercase())
            .collect::<Vec<_>>()
            .join(" ")
    );
    let hash = Sha256::digest(canonical.as_bytes());
    let v = u32::from_be_bytes([hash[0], hash[1], hash[2], hash[3]]);
    (v % VERIFIER_MOD) as u16
}

// ---------- tests ----------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn split_produces_three_distinct_shares() {
        let secret = CharterSecret::random();
        let shares = shamir_split(&secret);
        assert_eq!(shares.len(), 3);
        assert_ne!(shares[0].words, shares[1].words);
        assert_ne!(shares[1].words, shares[2].words);
        assert_ne!(shares[0].words, shares[2].words);
    }

    #[test]
    fn any_two_shares_reconstruct_secret() {
        for _ in 0..10 {
            let secret = CharterSecret::random();
            let shares = shamir_split(&secret);
            for combo in &[(0, 1), (0, 2), (1, 2)] {
                let recovered =
                    shamir_combine(&[shares[combo.0].clone(), shares[combo.1].clone()])
                        .expect("any 2 shares must reconstruct");
                assert_eq!(secret, recovered, "combo {combo:?} mismatch");
            }
        }
    }

    #[test]
    fn three_shares_also_reconstruct() {
        let secret = CharterSecret::random();
        let shares = shamir_split(&secret);
        let recovered = shamir_combine(&shares).expect("3 shares must reconstruct");
        assert_eq!(secret, recovered);
    }

    #[test]
    fn one_share_alone_is_insufficient() {
        let secret = CharterSecret::random();
        let shares = shamir_split(&secret);
        let result = shamir_combine(&shares[..1]);
        match result {
            Err(ShamirError::InsufficientShares { threshold, actual }) => {
                assert_eq!(threshold, 2);
                assert_eq!(actual, 1);
            }
            other => panic!("expected InsufficientShares, got {other:?}"),
        }
    }

    #[test]
    fn shares_format_and_parse_round_trip() {
        let secret = CharterSecret::random();
        let shares = shamir_split(&secret);
        for sh in &shares {
            let formatted = sh.formatted();
            let parsed = ShamirShare::parse(&formatted).expect("formatted form must parse");
            assert_eq!(parsed, *sh);
        }
    }

    #[test]
    fn parse_tolerates_alternate_formats() {
        let secret = CharterSecret::random();
        let shares = shamir_split(&secret);
        let sh = &shares[0];
        let alt = format!(
            "#{} {} {} {} {} {} {} {} - {:04}",
            sh.index,
            sh.words[0].to_uppercase(),
            sh.words[1],
            sh.words[2].to_uppercase(),
            sh.words[3],
            sh.words[4].to_uppercase(),
            sh.words[5],
            sh.words[6].to_uppercase(),
            sh.verifier
        );
        let parsed = ShamirShare::parse(&alt).expect("alt format must parse");
        assert_eq!(parsed.words, sh.words);
        assert_eq!(parsed.index, sh.index);
    }

    #[test]
    fn typo_in_one_share_word_is_detected() {
        let secret = CharterSecret::random();
        let shares = shamir_split(&secret);
        let mut tampered = shares[0].clone();
        let original = wordlist::index_of(&tampered.words[3]).unwrap();
        let other = if original == 0 { 1 } else { 0 };
        tampered.words[3] = wordlist::at(other).to_string();

        let formatted = format!(
            "Share {} of {}: {} - {:04}",
            tampered.index,
            TOTAL_SHARES,
            tampered.words.join(" "),
            tampered.verifier
        );
        let result = ShamirShare::parse(&formatted);
        match result {
            Err(ShamirError::ChecksumMismatch { .. }) => {}
            other => panic!("expected ChecksumMismatch, got {other:?}"),
        }
    }

    #[test]
    fn cross_share_index_swap_is_detected_via_verifier() {
        // Using share #1's words but claiming it is share #2 must fail the verifier.
        let secret = CharterSecret::random();
        let shares = shamir_split(&secret);
        let s1 = &shares[0];
        let other_index_share = ShamirShare {
            index: shares[1].index,
            words: s1.words.clone(),
            verifier: s1.verifier,
        };
        let formatted = other_index_share.formatted();
        let result = ShamirShare::parse(&formatted);
        match result {
            Err(ShamirError::ChecksumMismatch { .. }) => {}
            other => panic!("expected ChecksumMismatch on index swap, got {other:?}"),
        }
    }

    #[test]
    fn duplicate_shares_passed_to_combine_are_handled() {
        let secret = CharterSecret::random();
        let shares = shamir_split(&secret);
        // Passing the same share twice — sharks crate behavior: yields wrong result, not error.
        // Our defense: caller (UI) must dedupe by index before calling. This test documents the
        // current behavior: it should NOT successfully reconstruct.
        let result =
            shamir_combine(&[shares[0].clone(), shares[0].clone()]).map(|s| s.as_bytes().to_vec());
        let expected = secret.as_bytes().to_vec();
        // It either returns an error or a different (wrong) reconstruction.
        if let Ok(bytes) = result {
            assert_ne!(bytes, expected, "duplicate shares must not produce correct secret");
        }
    }
}
