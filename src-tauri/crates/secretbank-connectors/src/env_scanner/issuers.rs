/// Issuer preset patterns for API key detection.
///
/// IMPORTANT: This list must be kept in sync with the TypeScript counterpart
/// in `src/features/inventory/issuer-presets.ts` (T028). The Rust side is the
/// canonical source for scanning; the TS side is used for UI display only.
use once_cell::sync::Lazy;
use regex::Regex;

pub struct IssuerPattern {
    pub slug: &'static str,
    pub regex: Regex,
}

/// 10 issuer presets, ordered so that more-specific patterns come first.
///
/// NOTE: Anthropic (`sk-ant-api03-...`) must appear before OpenAI (`sk-...`)
/// because the OpenAI regex `^sk-(proj-)?[A-Za-z0-9_-]{20,}$` would also
/// match an Anthropic key (the `ant-api03-` segment passes the char class).
pub static ISSUER_PATTERNS: Lazy<Vec<IssuerPattern>> = Lazy::new(|| {
    vec![
        // Anthropic before OpenAI — see module doc above.
        IssuerPattern {
            slug: "anthropic",
            regex: Regex::new(r"^sk-ant-api03-[A-Za-z0-9_-]{90,}$").unwrap(),
        },
        IssuerPattern {
            slug: "openai",
            regex: Regex::new(r"^sk-(proj-)?[A-Za-z0-9_-]{20,}$").unwrap(),
        },
        IssuerPattern {
            slug: "stripe",
            regex: Regex::new(r"^(sk|rk|pk)_(test|live)_[A-Za-z0-9]{24,}$").unwrap(),
        },
        IssuerPattern {
            slug: "github",
            regex: Regex::new(r"^(ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{82})$").unwrap(),
        },
        IssuerPattern {
            slug: "aws",
            regex: Regex::new(r"^AKIA[0-9A-Z]{16}$").unwrap(),
        },
        IssuerPattern {
            slug: "google",
            regex: Regex::new(r"^AIza[0-9A-Za-z_-]{35}$").unwrap(),
        },
        IssuerPattern {
            slug: "supabase",
            regex: Regex::new(r"^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$").unwrap(),
        },
        IssuerPattern {
            slug: "vercel",
            regex: Regex::new(r"^[A-Za-z0-9]{24}$").unwrap(),
        },
        IssuerPattern {
            slug: "cloudflare",
            regex: Regex::new(r"^[A-Za-z0-9_-]{40}$").unwrap(),
        },
        IssuerPattern {
            slug: "paddle",
            regex: Regex::new(r"^[A-Za-z0-9]{40,}$").unwrap(),
        },
    ]
});

/// Return the slug of the first issuer whose pattern matches `value`,
/// or `None` if no pattern matches.
pub fn match_issuer(value: &str) -> Option<&'static str> {
    ISSUER_PATTERNS
        .iter()
        .find(|p| p.regex.is_match(value))
        .map(|p| p.slug)
}

#[cfg(test)]
mod tests {
    use super::match_issuer;

    #[test]
    fn openai_key() {
        assert_eq!(match_issuer("sk-proj-AAAAAAAAAAAAAAAAAAAA"), Some("openai"));
    }

    #[test]
    fn openai_key_without_proj() {
        // sk- followed by 20+ chars is also OpenAI
        assert_eq!(match_issuer("sk-AAAAAAAAAAAAAAAAAAAA"), Some("openai"));
    }

    #[test]
    fn anthropic_key_matches_anthropic_not_openai() {
        // Build a valid-looking Anthropic key: "sk-ant-api03-" + 90 chars
        let key = format!("sk-ant-api03-{}", "A".repeat(90));
        assert_eq!(match_issuer(&key), Some("anthropic"));
    }

    #[test]
    fn aws_key() {
        // AKIA + 16 uppercase alphanumeric = 20 chars total
        assert_eq!(match_issuer("AKIA1234567890ABCDEF"), Some("aws"));
    }

    #[test]
    fn no_match_returns_none() {
        assert_eq!(match_issuer("random-string-1234567890ABC"), None);
    }

    #[test]
    fn stripe_live_key() {
        // sk_live_ + 24 alphanumeric chars
        let key = format!("sk_live_{}", "a".repeat(24));
        assert_eq!(match_issuer(&key), Some("stripe"));
    }

    #[test]
    fn github_pat() {
        let key = format!("ghp_{}", "A".repeat(36));
        assert_eq!(match_issuer(&key), Some("github"));
    }
}
