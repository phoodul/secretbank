//! EFF Diceware large wordlist (7776 단어, public domain).
//!
//! 원본: https://www.eff.org/files/2016/07/18/eff_large_wordlist.txt
//! 형식: `{5-digit dice roll}\t{word}` per line.

use std::collections::HashMap;
use std::sync::OnceLock;

const RAW: &str = include_str!("wordlist_raw.txt");

pub const WORDLIST_SIZE: usize = 7776;

static WORDLIST: OnceLock<Vec<&'static str>> = OnceLock::new();
static WORD_INDEX: OnceLock<HashMap<&'static str, usize>> = OnceLock::new();

/// Lazy-parse the bundled EFF wordlist into a flat `Vec<&'static str>`.
pub fn words() -> &'static [&'static str] {
    WORDLIST
        .get_or_init(|| {
            let parsed: Vec<&'static str> = RAW
                .lines()
                .filter_map(|line| line.split_once('\t').map(|(_, w)| w.trim()))
                .filter(|w| !w.is_empty())
                .collect();
            assert_eq!(
                parsed.len(),
                WORDLIST_SIZE,
                "EFF wordlist must contain exactly {WORDLIST_SIZE} entries"
            );
            parsed
        })
        .as_slice()
}

/// Return the wordlist index (0..7775) of `word`, case-insensitive.
pub fn index_of(word: &str) -> Option<usize> {
    let map = WORD_INDEX.get_or_init(|| words().iter().enumerate().map(|(i, w)| (*w, i)).collect());
    let lower = word.trim().to_lowercase();
    map.get(lower.as_str()).copied()
}

/// Word at `idx` (panics if out of range — internal callers always bound-check).
pub fn at(idx: usize) -> &'static str {
    words()[idx]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wordlist_has_exactly_7776_entries() {
        assert_eq!(words().len(), WORDLIST_SIZE);
    }

    #[test]
    fn first_and_last_words_match_eff_canonical() {
        // EFF large wordlist canonical anchors.
        assert_eq!(at(0), "abacus");
        assert_eq!(at(WORDLIST_SIZE - 1), "zoom");
    }

    #[test]
    fn index_round_trips_for_sampled_words() {
        for &(w, expected) in &[("abacus", 0), ("zoom", 7775)] {
            assert_eq!(index_of(w), Some(expected));
        }
    }

    #[test]
    fn index_is_case_insensitive_and_trims_whitespace() {
        assert_eq!(index_of("ABACUS"), Some(0));
        assert_eq!(index_of("  Zoom  "), Some(7775));
    }

    #[test]
    fn unknown_word_returns_none() {
        assert!(index_of("notarealword").is_none());
        assert!(index_of("").is_none());
    }
}
