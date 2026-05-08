/// Parse a `.env`-style file into `(line_number, key, value)` triples.
///
/// Rules:
/// - Lines are 1-indexed.
/// - Blank lines and lines starting with `#` are skipped.
/// - `export KEY=value` prefix is stripped.
/// - Key and value are trimmed of surrounding whitespace.
/// - Quoted values (`"..."` or `'...'`) have their quotes stripped.
/// - Unquoted values are returned as-is (no inline comment stripping — MVP).
/// - Lines without `=` are skipped.
pub fn parse_env_file(content: &str) -> Vec<(u32, String, String)> {
    let mut results = Vec::new();

    for (idx, line) in content.lines().enumerate() {
        let line_no = (idx + 1) as u32;
        let trimmed = line.trim();

        // Skip blank lines and comments.
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }

        // Strip optional `export ` prefix.
        let trimmed = trimmed
            .strip_prefix("export ")
            .map(str::trim_start)
            .unwrap_or(trimmed);

        // Split on first `=`.
        let Some(eq_pos) = trimmed.find('=') else {
            continue;
        };

        let key = trimmed[..eq_pos].trim().to_string();
        if key.is_empty() {
            continue;
        }

        let raw_value = trimmed[eq_pos + 1..].trim();
        let value = strip_quotes(raw_value).to_string();

        results.push((line_no, key, value));
    }

    results
}

/// Strip surrounding `"..."` or `'...'` from a value string.
/// Only strips when both the first and last character match the same quote type.
fn strip_quotes(s: &str) -> &str {
    if s.len() >= 2 {
        let first = s.as_bytes()[0];
        let last = s.as_bytes()[s.len() - 1];
        if (first == b'"' && last == b'"') || (first == b'\'' && last == b'\'') {
            return &s[1..s.len() - 1];
        }
    }
    s
}

/// Extract string literals from generic text (JSON / TypeScript / JavaScript).
///
/// Returns `(line_number, value)` for each double- or single-quoted string
/// literal whose content is at least `min_len` characters long.
/// Multi-line strings (containing `\n`) are skipped.
pub fn parse_generic_strings(content: &str, min_len: usize) -> Vec<(u32, String)> {
    let mut results = Vec::new();

    for (idx, line) in content.lines().enumerate() {
        let line_no = (idx + 1) as u32;

        // Collect all string literals from this line.
        let mut remaining = line;
        while !remaining.is_empty() {
            // Find the next opening quote.
            let Some(start) = remaining.find(['"', '\'']) else {
                break;
            };
            let quote = remaining.as_bytes()[start] as char;
            let after_open = &remaining[start + 1..];

            // Find matching closing quote (simple, no escape handling for MVP).
            let Some(end) = after_open.find(quote) else {
                break;
            };

            let candidate = &after_open[..end];
            // Advance past this literal.
            remaining = &after_open[end + 1..];

            if candidate.len() >= min_len {
                results.push((line_no, candidate.to_string()));
            }
        }
    }

    results
}

#[cfg(test)]
mod tests {
    use super::{parse_env_file, parse_generic_strings};

    // --- parse_env_file ---

    #[test]
    fn simple_key_value() {
        let pairs = parse_env_file("KEY=value\n");
        assert_eq!(pairs.len(), 1);
        assert_eq!(pairs[0].1, "KEY");
        assert_eq!(pairs[0].2, "value");
    }

    #[test]
    fn double_quoted_value() {
        let pairs = parse_env_file(r#"KEY="value with spaces""#);
        assert_eq!(pairs[0].2, "value with spaces");
    }

    #[test]
    fn single_quoted_value() {
        let pairs = parse_env_file("KEY='single quoted'\n");
        assert_eq!(pairs[0].2, "single quoted");
    }

    #[test]
    fn export_prefix() {
        let pairs = parse_env_file("export KEY=value\n");
        assert_eq!(pairs[0].1, "KEY");
        assert_eq!(pairs[0].2, "value");
    }

    #[test]
    fn comment_line_skipped() {
        let pairs = parse_env_file("# this is a comment\nKEY=value\n");
        assert_eq!(pairs.len(), 1);
        assert_eq!(pairs[0].1, "KEY");
    }

    #[test]
    fn blank_line_skipped() {
        let pairs = parse_env_file("\n\nKEY=value\n");
        assert_eq!(pairs.len(), 1);
    }

    #[test]
    fn empty_value() {
        let pairs = parse_env_file("KEY=\n");
        assert_eq!(pairs.len(), 1);
        assert_eq!(pairs[0].2, "");
    }

    #[test]
    fn line_numbers_are_correct() {
        let content = "# comment\n\nFIRST=a\nSECOND=b\n";
        let pairs = parse_env_file(content);
        assert_eq!(pairs[0].0, 3); // FIRST on line 3
        assert_eq!(pairs[1].0, 4); // SECOND on line 4
    }

    // --- parse_generic_strings ---

    #[test]
    fn extracts_double_quoted_strings() {
        let result = parse_generic_strings(r#"const KEY = "sk-proj-AAAAAAAAAAAAAAAAAAAA";"#, 16);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].1, "sk-proj-AAAAAAAAAAAAAAAAAAAA");
    }

    #[test]
    fn skips_short_strings() {
        let result = parse_generic_strings(r#"const x = "short";"#, 16);
        assert!(result.is_empty());
    }

    #[test]
    fn extracts_single_quoted_strings() {
        let result = parse_generic_strings("const k = 'abcdefghijklmnopqrstuvwxyz';", 16);
        assert_eq!(result.len(), 1);
    }

    #[test]
    fn returns_correct_line_number() {
        let content = "// first line\nconst k = \"sk-proj-AAAAAAAAAAAAAAAAAAAA\";";
        let result = parse_generic_strings(content, 16);
        assert_eq!(result[0].0, 2);
    }
}
