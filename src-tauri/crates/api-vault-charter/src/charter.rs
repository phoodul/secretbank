//! Diceware codec — 78-bit charter secret ↔ "6 words + 4-digit verifier".
//!
//! `CharterSecret` 은 10B 컨테이너로, 의미있는 값 영역은 0..7776⁶ ≈ 2⁷⁷·⁵⁵ bit.
//! 사용자가 보는 표현은 항상 `Charter` (6 단어 + verifier).
//!
//! verifier 는 단어 6개의 SHA-256 첫 4 byte mod 10000. 한 단어 잘못 적었으면
//! verifier 불일치 → 즉시 감지 (1Password Emergency Kit 의 단순 base32 와 차별화).

use sha2::{Digest, Sha256};
use thiserror::Error;
use zeroize::Zeroize;

use crate::wordlist::{self, WORDLIST_SIZE};

/// 단어 개수 (charter 한 장 당).
pub const WORD_COUNT: usize = 6;

/// verifier 의 modulus (4-digit decimal).
const VERIFIER_MOD: u32 = 10_000;

#[derive(Debug, Error, PartialEq, Eq)]
pub enum CharterError {
    #[error("unknown word in charter: {0:?}")]
    UnknownWord(String),

    #[error("expected {expected} words + 1 verifier token, got {actual} word tokens")]
    WrongWordCount { expected: usize, actual: usize },

    #[error("verifier must be a 4-digit integer 0..9999: {0}")]
    InvalidVerifier(String),

    #[error("checksum mismatch — likely a typo in one of the words (expected {expected:04}, got {actual:04})")]
    ChecksumMismatch { expected: u16, actual: u16 },
}

/// 78-bit secret container (10 bytes; only values `< 7776⁶` are canonical).
///
/// `Drop` 시 zeroize. 메모리에 남아도 GC 직후 0으로 초기화.
#[derive(Clone)]
pub struct CharterSecret(pub(crate) [u8; 10]);

impl Drop for CharterSecret {
    fn drop(&mut self) {
        self.0.zeroize();
    }
}

impl std::fmt::Debug for CharterSecret {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        // 평문 노출 금지.
        write!(f, "CharterSecret(<redacted 10 bytes>)")
    }
}

impl PartialEq for CharterSecret {
    fn eq(&self, other: &Self) -> bool {
        // constant-time compare to avoid timing side-channel.
        let mut diff: u8 = 0;
        for i in 0..10 {
            diff |= self.0[i] ^ other.0[i];
        }
        diff == 0
    }
}
impl Eq for CharterSecret {}

impl CharterSecret {
    /// Generate a fresh 77.55-bit random secret using the OS CSPRNG.
    pub fn random() -> Self {
        use rand::RngCore;
        let mut bytes = [0u8; 10];
        rand::rngs::OsRng.fill_bytes(&mut bytes);
        let v = bytes_to_value(&bytes) % max_value();
        Self(value_to_bytes(v))
    }

    /// Construct from raw 10 bytes — does not enforce canonical range.
    /// Internal use (Shamir share reconstruction); external code should use `random()`.
    pub fn from_bytes(bytes: [u8; 10]) -> Self {
        Self(bytes)
    }

    /// Borrow underlying 10 bytes.
    pub fn as_bytes(&self) -> &[u8; 10] {
        &self.0
    }
}

/// User-facing 6-word + verifier representation.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Charter {
    pub words: [String; WORD_COUNT],
    pub verifier: u16,
}

impl Charter {
    /// Encode a secret → 6 words + verifier.
    pub fn from_secret(secret: &CharterSecret) -> Self {
        let indices = encode_indices(secret);
        let words: [String; WORD_COUNT] = std::array::from_fn(|i| wordlist::at(indices[i]).to_string());
        let verifier = compute_verifier(&words);
        Self { words, verifier }
    }

    /// Decode back to the 78-bit secret. Verifier is rechecked here (defense in depth).
    pub fn to_secret(&self) -> Result<CharterSecret, CharterError> {
        let computed = compute_verifier(&self.words);
        if computed != self.verifier {
            return Err(CharterError::ChecksumMismatch {
                expected: computed,
                actual: self.verifier,
            });
        }
        let mut indices = [0usize; WORD_COUNT];
        for (i, w) in self.words.iter().enumerate() {
            indices[i] = wordlist::index_of(w).ok_or_else(|| CharterError::UnknownWord(w.clone()))?;
        }
        Ok(decode_indices(&indices))
    }

    /// Parse user input (case-insensitive, dash/space tolerant):
    ///
    /// `"TUNDRA HARBOR FLINT MOTH OPAL CASCADE - 7042"`
    /// `"tundra-harbor-flint-moth-opal-cascade-7042"`
    /// `"tundra harbor flint moth opal cascade 7042"`
    pub fn parse(input: &str) -> Result<Self, CharterError> {
        let normalized: Vec<String> = input
            .replace(['-', '_', '\t', '\n', '\r'], " ")
            .split_whitespace()
            .map(|s| s.to_lowercase())
            .collect();

        if normalized.len() != WORD_COUNT + 1 {
            return Err(CharterError::WrongWordCount {
                expected: WORD_COUNT,
                actual: normalized.len().saturating_sub(1),
            });
        }

        let verifier_token = &normalized[WORD_COUNT];
        let verifier: u32 = verifier_token
            .parse()
            .map_err(|e: std::num::ParseIntError| CharterError::InvalidVerifier(e.to_string()))?;
        if verifier >= VERIFIER_MOD {
            return Err(CharterError::InvalidVerifier(format!(
                "out of range: {verifier}"
            )));
        }

        let mut words: [String; WORD_COUNT] = Default::default();
        for (i, w) in normalized[..WORD_COUNT].iter().enumerate() {
            if wordlist::index_of(w).is_none() {
                return Err(CharterError::UnknownWord(w.clone()));
            }
            words[i] = w.clone();
        }

        let computed = compute_verifier(&words);
        if computed != verifier as u16 {
            return Err(CharterError::ChecksumMismatch {
                expected: computed,
                actual: verifier as u16,
            });
        }

        Ok(Self {
            words,
            verifier: verifier as u16,
        })
    }

    /// Canonical formatted form (uppercase words, 4-digit verifier):
    /// `"TUNDRA HARBOR FLINT MOTH OPAL CASCADE - 7042"`.
    pub fn formatted(&self) -> String {
        let words: Vec<String> = self.words.iter().map(|w| w.to_uppercase()).collect();
        format!("{} - {:04}", words.join(" "), self.verifier)
    }
}

// ---------- internals ----------

fn max_value() -> u128 {
    (WORDLIST_SIZE as u128).pow(WORD_COUNT as u32)
}

fn bytes_to_value(bytes: &[u8; 10]) -> u128 {
    let mut v: u128 = 0;
    for &b in bytes.iter() {
        v = (v << 8) | (b as u128);
    }
    v
}

fn value_to_bytes(v: u128) -> [u8; 10] {
    let mut out = [0u8; 10];
    let mut x = v;
    for i in (0..10).rev() {
        out[i] = (x & 0xFF) as u8;
        x >>= 8;
    }
    out
}

fn encode_indices(secret: &CharterSecret) -> [usize; WORD_COUNT] {
    let mut v = bytes_to_value(&secret.0) % max_value();
    let mut out = [0usize; WORD_COUNT];
    for slot in out.iter_mut() {
        *slot = (v % WORDLIST_SIZE as u128) as usize;
        v /= WORDLIST_SIZE as u128;
    }
    out
}

fn decode_indices(indices: &[usize; WORD_COUNT]) -> CharterSecret {
    let mut v: u128 = 0;
    for i in (0..WORD_COUNT).rev() {
        v = v * WORDLIST_SIZE as u128 + indices[i] as u128;
    }
    CharterSecret(value_to_bytes(v))
}

fn compute_verifier(words: &[String; WORD_COUNT]) -> u16 {
    let canonical = words
        .iter()
        .map(|w| w.to_lowercase())
        .collect::<Vec<_>>()
        .join(" ");
    let hash = Sha256::digest(canonical.as_bytes());
    let v = u32::from_be_bytes([hash[0], hash[1], hash[2], hash[3]]);
    (v % VERIFIER_MOD) as u16
}

// ---------- tests ----------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn random_secret_is_within_canonical_range() {
        for _ in 0..50 {
            let s = CharterSecret::random();
            let v = bytes_to_value(&s.0);
            assert!(v < max_value(), "secret out of range: {v}");
        }
    }

    #[test]
    fn round_trip_secret_to_charter_to_secret() {
        for _ in 0..20 {
            let secret = CharterSecret::random();
            let charter = Charter::from_secret(&secret);
            let recovered = charter.to_secret().expect("verifier must match");
            assert_eq!(secret, recovered, "round-trip mismatch");
        }
    }

    #[test]
    fn formatted_string_round_trips_via_parse() {
        for _ in 0..20 {
            let secret = CharterSecret::random();
            let charter = Charter::from_secret(&secret);
            let formatted = charter.formatted();
            let parsed = Charter::parse(&formatted).expect("formatted form must parse");
            assert_eq!(parsed, charter);
        }
    }

    #[test]
    fn parse_accepts_dash_separated_input() {
        let secret = CharterSecret::random();
        let charter = Charter::from_secret(&secret);
        let dashed: String = charter
            .words
            .iter()
            .map(String::as_str)
            .collect::<Vec<_>>()
            .join("-")
            + &format!("-{:04}", charter.verifier);
        let parsed = Charter::parse(&dashed).expect("dash-separated input must parse");
        assert_eq!(parsed, charter);
    }

    #[test]
    fn parse_is_case_insensitive_and_whitespace_tolerant() {
        let secret = CharterSecret::random();
        let charter = Charter::from_secret(&secret);
        let messy = format!(
            "  {}  {}  {}\n{}\t{}  {}   -   {:04}  ",
            charter.words[0].to_uppercase(),
            charter.words[1],
            charter.words[2].to_uppercase(),
            charter.words[3],
            charter.words[4].to_uppercase(),
            charter.words[5],
            charter.verifier,
        );
        let parsed = Charter::parse(&messy).expect("messy input must parse");
        assert_eq!(parsed, charter);
    }

    #[test]
    fn parse_rejects_one_word_typo_via_checksum() {
        let secret = CharterSecret::random();
        let charter = Charter::from_secret(&secret);
        // Replace one word with a different valid wordlist entry.
        let mut tampered_words = charter.words.clone();
        let original_idx = wordlist::index_of(&tampered_words[2]).unwrap();
        let other_idx = if original_idx == 0 { 1 } else { 0 };
        tampered_words[2] = wordlist::at(other_idx).to_string();
        let tampered = format!(
            "{} - {:04}",
            tampered_words.join(" ").to_uppercase(),
            charter.verifier
        );
        let result = Charter::parse(&tampered);
        match result {
            Err(CharterError::ChecksumMismatch { .. }) => {}
            other => panic!("expected ChecksumMismatch, got {other:?}"),
        }
    }

    #[test]
    fn parse_rejects_unknown_word() {
        let result = Charter::parse("notarealword harbor flint moth opal cascade 7042");
        match result {
            Err(CharterError::UnknownWord(w)) => assert_eq!(w, "notarealword"),
            other => panic!("expected UnknownWord, got {other:?}"),
        }
    }

    #[test]
    fn parse_rejects_wrong_word_count() {
        let result = Charter::parse("tundra harbor flint moth opal 7042"); // only 5 words
        match result {
            Err(CharterError::WrongWordCount { expected, actual }) => {
                assert_eq!(expected, 6);
                assert_eq!(actual, 5);
            }
            other => panic!("expected WrongWordCount, got {other:?}"),
        }
    }

    #[test]
    fn parse_rejects_non_numeric_verifier() {
        // Construct charter then swap verifier with non-numeric token.
        let secret = CharterSecret::random();
        let charter = Charter::from_secret(&secret);
        let bad = format!("{} - oops", charter.words.join(" "));
        let result = Charter::parse(&bad);
        assert!(matches!(result, Err(CharterError::InvalidVerifier(_))));
    }

    #[test]
    fn parse_rejects_out_of_range_verifier() {
        let secret = CharterSecret::random();
        let charter = Charter::from_secret(&secret);
        let bad = format!("{} - 99999", charter.words.join(" "));
        let result = Charter::parse(&bad);
        assert!(matches!(result, Err(CharterError::InvalidVerifier(_))));
    }

    #[test]
    fn debug_output_redacts_secret_bytes() {
        // Use distinctive byte values that would only appear if the raw array were leaked
        // (and not in any plausible part of the redacted format like the byte-count suffix).
        let secret = CharterSecret::from_bytes([0xAB, 0xCD, 0xEF, 0x99, 0x88, 0x77, 0x66, 0x55, 0x44, 0x33]);
        let dbg = format!("{secret:?}");
        assert!(dbg.contains("redacted"), "expected redaction marker in {dbg}");
        // The default `[u8; N]` Debug would print "[171, 205," etc. — none of those tokens
        // should leak.
        assert!(!dbg.contains("171"), "raw decimal byte leaked: {dbg}");
        assert!(!dbg.contains("0xAB"), "raw hex byte leaked: {dbg}");
        assert!(!dbg.contains(','), "array-style separator leaked: {dbg}");
    }
}
