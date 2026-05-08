//! SaaS status page RSS/Atom source presets.

use serde::{Deserialize, Serialize};

/// A single RSS/Atom source descriptor for a SaaS status page.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct RssSource {
    /// Short machine-friendly identifier, e.g. `"openai"`, `"stripe"`.
    pub slug: String,
    /// Human-readable name shown in the UI.
    pub display_name: String,
    /// Full RSS or Atom feed URL.
    pub url: String,
    /// Informational format hint — feed-rs auto-detects the actual format.
    pub format: FeedFormat,
}

/// Feed wire format (informational; feed-rs auto-detects).
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum FeedFormat {
    Rss,
    Atom,
}

/// Returns the 17 preset sources (10 SaaS status pages + 2 government CSIRT advisories
/// + 5 KISA 보호나라 advisory feeds, as of 2026-05-06).
///
/// URLs have been verified to respond with parseable RSS 2.0 or Atom 1.0 feeds.
/// Redirect-prone aliases (e.g. `status.stripe.com`, `status.paddle.com`) are
/// replaced with the canonical destination hosts.
pub fn default_presets() -> Vec<RssSource> {
    vec![
        RssSource {
            slug: "openai".into(),
            display_name: "OpenAI".into(),
            url: "https://status.openai.com/history.rss".into(),
            format: FeedFormat::Rss,
        },
        RssSource {
            slug: "stripe".into(),
            display_name: "Stripe".into(),
            url: "https://www.stripestatus.com/history.rss".into(),
            format: FeedFormat::Rss,
        },
        RssSource {
            slug: "aws".into(),
            display_name: "AWS".into(),
            url: "https://status.aws.amazon.com/rss/all.rss".into(),
            format: FeedFormat::Rss,
        },
        RssSource {
            slug: "vercel".into(),
            display_name: "Vercel".into(),
            url: "https://www.vercel-status.com/history.rss".into(),
            format: FeedFormat::Rss,
        },
        RssSource {
            slug: "supabase".into(),
            display_name: "Supabase".into(),
            url: "https://status.supabase.com/history.rss".into(),
            format: FeedFormat::Rss,
        },
        RssSource {
            slug: "github".into(),
            display_name: "GitHub".into(),
            url: "https://www.githubstatus.com/history.rss".into(),
            format: FeedFormat::Rss,
        },
        RssSource {
            slug: "cloudflare".into(),
            display_name: "Cloudflare".into(),
            url: "https://www.cloudflarestatus.com/history.rss".into(),
            format: FeedFormat::Rss,
        },
        RssSource {
            slug: "anthropic".into(),
            display_name: "Anthropic".into(),
            url: "https://status.claude.com/history.rss".into(),
            format: FeedFormat::Rss,
        },
        RssSource {
            slug: "gcp".into(),
            display_name: "Google Cloud".into(),
            url: "https://status.cloud.google.com/en/feed.atom".into(),
            format: FeedFormat::Atom,
        },
        RssSource {
            slug: "paddle".into(),
            display_name: "Paddle".into(),
            url: "https://paddlestatus.com/history.rss".into(),
            format: FeedFormat::Rss,
        },
        // Government CSIRT advisory feeds (2026-05-06, M24 2-2C-a)
        RssSource {
            slug: "cisa".into(),
            display_name: "CISA".into(),
            url: "https://www.cisa.gov/cybersecurity-advisories/all.xml".into(),
            format: FeedFormat::Rss,
        },
        RssSource {
            slug: "ncsc-uk".into(),
            display_name: "NCSC UK".into(),
            url: "https://www.ncsc.gov.uk/api/1/services/v1/all-rss-feed.xml".into(),
            format: FeedFormat::Rss,
        },
        // KISA 보호나라 advisory feeds (2026-05-06, M24 2-2C-b)
        RssSource {
            slug: "kisa-security-notice".into(),
            display_name: "KISA 보안공지".into(),
            url: "https://www.boho.or.kr/kr/rss.do?bbsId=B0000133".into(),
            format: FeedFormat::Rss,
        },
        RssSource {
            slug: "kisa-report".into(),
            display_name: "KISA 보고서/가이드".into(),
            url: "https://www.boho.or.kr/kr/rss.do?bbsId=B0000127".into(),
            format: FeedFormat::Rss,
        },
        RssSource {
            slug: "kisa-notice".into(),
            display_name: "KISA 공지사항".into(),
            url: "https://www.boho.or.kr/kr/rss.do?bbsId=B0000132".into(),
            format: FeedFormat::Rss,
        },
        RssSource {
            slug: "kisa-vuln".into(),
            display_name: "KISA 취약점 정보".into(),
            url: "https://www.boho.or.kr/kr/rss.do?bbsId=B0000302".into(),
            format: FeedFormat::Rss,
        },
        RssSource {
            slug: "kisa-alert".into(),
            display_name: "KISA 경보단계".into(),
            url: "https://www.boho.or.kr/kr/rss.do?bbsId=B0000342".into(),
            format: FeedFormat::Rss,
        },
    ]
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    #[test]
    fn test_default_presets_count() {
        assert_eq!(default_presets().len(), 17);
    }

    #[test]
    fn test_default_presets_includes_cisa() {
        assert!(
            default_presets().iter().any(|s| s.slug == "cisa"),
            "CISA preset missing from default_presets()"
        );
    }

    #[test]
    fn test_default_presets_includes_ncsc_uk() {
        assert!(
            default_presets().iter().any(|s| s.slug == "ncsc-uk"),
            "NCSC UK preset missing from default_presets()"
        );
    }

    #[test]
    fn test_default_presets_includes_kisa_security_notice() {
        assert!(
            default_presets()
                .iter()
                .any(|s| s.slug == "kisa-security-notice"),
            "KISA 보안공지 preset missing from default_presets()"
        );
    }

    #[test]
    fn test_default_presets_includes_kisa_report() {
        assert!(
            default_presets().iter().any(|s| s.slug == "kisa-report"),
            "KISA 보고서/가이드 preset missing from default_presets()"
        );
    }

    #[test]
    fn test_default_presets_includes_kisa_notice() {
        assert!(
            default_presets().iter().any(|s| s.slug == "kisa-notice"),
            "KISA 공지사항 preset missing from default_presets()"
        );
    }

    #[test]
    fn test_default_presets_includes_kisa_vuln() {
        assert!(
            default_presets().iter().any(|s| s.slug == "kisa-vuln"),
            "KISA 취약점 정보 preset missing from default_presets()"
        );
    }

    #[test]
    fn test_default_presets_includes_kisa_alert() {
        assert!(
            default_presets().iter().any(|s| s.slug == "kisa-alert"),
            "KISA 경보단계 preset missing from default_presets()"
        );
    }

    #[test]
    fn test_default_presets_unique_slugs() {
        let presets = default_presets();
        let unique: HashSet<&str> = presets.iter().map(|s| s.slug.as_str()).collect();
        assert_eq!(
            unique.len(),
            presets.len(),
            "duplicate slug detected in default_presets()"
        );
    }

    #[test]
    fn test_default_presets_https_only() {
        for source in default_presets() {
            assert!(
                source.url.starts_with("https://"),
                "non-HTTPS URL found: slug={} url={}",
                source.slug,
                source.url
            );
        }
    }
}
