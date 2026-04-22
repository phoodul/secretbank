/// Shannon entropy over byte frequencies (bits per character).
///
/// Empty string → 0.0.
/// Uniform byte distribution of length N → log2(N).
pub fn shannon_entropy(s: &str) -> f64 {
    if s.is_empty() {
        return 0.0;
    }
    let mut counts = [0u32; 256];
    let bytes = s.as_bytes();
    for &b in bytes {
        counts[b as usize] += 1;
    }
    let len = bytes.len() as f64;
    counts
        .iter()
        .filter(|&&c| c > 0)
        .map(|&c| {
            let p = c as f64 / len;
            -p * p.log2()
        })
        .sum()
}

#[cfg(test)]
mod tests {
    use super::shannon_entropy;

    #[test]
    fn empty_string_is_zero() {
        assert_eq!(shannon_entropy(""), 0.0);
    }

    #[test]
    fn single_repeated_char_is_zero() {
        assert_eq!(shannon_entropy("aaaaaaaa"), 0.0);
    }

    #[test]
    fn eight_distinct_chars_is_three() {
        // "abcdefgh" — 8 distinct bytes, each with probability 1/8
        // entropy = -8 * (1/8 * log2(1/8)) = log2(8) = 3.0
        let h = shannon_entropy("abcdefgh");
        assert!((h - 3.0).abs() < 0.01, "expected ≈3.0, got {h}");
    }

    #[test]
    fn high_entropy_api_key_exceeds_threshold() {
        let h = shannon_entropy("sk-proj-aBcDeF0123456789_XYZ");
        assert!(h > 3.5, "expected >3.5, got {h}");
    }

    #[test]
    fn low_entropy_plain_word() {
        // "hello" has repeated 'l' — entropy well below 3.5
        let h = shannon_entropy("hello");
        assert!(h < 3.5, "expected <3.5, got {h}");
    }
}
