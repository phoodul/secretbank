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

/// Returns the 10 preset SaaS status page sources (as of 2026-04-24).
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
    ]
}
