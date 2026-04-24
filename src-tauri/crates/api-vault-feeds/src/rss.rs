//! SaaS status RSS/Atom client.
//!
//! `RssClient` fetches multiple RSS 2.0 / Atom 1.0 feeds concurrently
//! (up to 4 simultaneous connections) and maps them to `RssEntry` DTOs.
//! Failures for individual sources are logged and skipped; only successful
//! entries are returned by `fetch_all`.

use std::sync::Arc;
use std::time::Duration;

use time::OffsetDateTime;
use tokio::sync::Semaphore;

use crate::sources::RssSource;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/// A single incident entry extracted from an RSS 2.0 or Atom 1.0 status feed.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq)]
pub struct RssEntry {
    /// Slug of the source this entry came from (e.g. `"github"`).
    pub source_slug: String,
    /// Entry GUID / Atom id.
    pub id: String,
    pub title: Option<String>,
    pub summary: Option<String>,
    /// First link href in the entry's link list.
    pub link: Option<String>,
    pub published_at: Option<OffsetDateTime>,
    pub updated_at: Option<OffsetDateTime>,
}

// ---------------------------------------------------------------------------
// Error model
// ---------------------------------------------------------------------------

#[derive(Debug, thiserror::Error)]
pub enum RssError {
    #[error("HTTP request failed: {0}")]
    Http(#[from] reqwest::Error),

    #[error("HTTP {status} from {url}")]
    Status { status: u16, url: String },

    #[error("Feed parse failed: {0}")]
    Parse(#[from] feed_rs::parser::ParseFeedError),
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

/// RSS/Atom client with concurrency control.
pub struct RssClient {
    http: reqwest::Client,
    /// Maximum number of in-flight HTTP requests (default: 4).
    max_concurrent: usize,
}

impl Default for RssClient {
    fn default() -> Self {
        Self::new()
    }
}

impl RssClient {
    /// Create a client with default settings (30 s timeout, 4 concurrent).
    pub fn new() -> Self {
        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(30))
            .user_agent("api-vault/0.1.0")
            .gzip(true)
            .build()
            .expect("reqwest client build never fails with these options");
        Self {
            http,
            max_concurrent: 4,
        }
    }

    /// Create a client that reuses an externally built `reqwest::Client`.
    /// Useful for sharing connection pools or injecting test doubles.
    pub fn with_http(http: reqwest::Client) -> Self {
        Self {
            http,
            max_concurrent: 4,
        }
    }

    /// Fetch all sources concurrently.
    ///
    /// Sources that fail (HTTP error, non-2xx status, parse error) are logged
    /// via `tracing::warn` and skipped. Only entries from successful sources
    /// are included in the returned `Vec`.
    pub async fn fetch_all(&self, sources: &[RssSource]) -> Vec<RssEntry> {
        let semaphore = Arc::new(Semaphore::new(self.max_concurrent));

        let futures = sources.iter().map(|s| {
            let http = self.http.clone();
            let source = s.clone();
            let sem = semaphore.clone();
            async move {
                let _permit = sem.acquire_owned().await.expect("semaphore not closed");
                match fetch_single(&http, &source).await {
                    Ok(entries) => entries,
                    Err(e) => {
                        tracing::warn!(
                            slug = %source.slug,
                            url = %source.url,
                            error = %e,
                            "rss fetch failed, skipping source"
                        );
                        Vec::new()
                    }
                }
            }
        });

        let results = futures::future::join_all(futures).await;
        results.into_iter().flatten().collect()
    }

    /// Fetch a single source and return its entries, propagating any error.
    pub async fn fetch_one(&self, source: &RssSource) -> Result<Vec<RssEntry>, RssError> {
        fetch_single(&self.http, source).await
    }
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

async fn fetch_single(
    http: &reqwest::Client,
    source: &RssSource,
) -> Result<Vec<RssEntry>, RssError> {
    let resp = http.get(&source.url).send().await?;

    if !resp.status().is_success() {
        return Err(RssError::Status {
            status: resp.status().as_u16(),
            url: source.url.clone(),
        });
    }

    // Use .bytes() — never .text() — to avoid content-encoding charset conflicts.
    let bytes = resp.bytes().await?;
    parse_feed_bytes(&bytes, &source.slug)
}

fn parse_feed_bytes(bytes: &[u8], source_slug: &str) -> Result<Vec<RssEntry>, RssError> {
    let feed = feed_rs::parser::parse(bytes)?;
    Ok(feed
        .entries
        .into_iter()
        .map(|e| map_entry(e, source_slug))
        .collect())
}

fn map_entry(entry: feed_rs::model::Entry, source_slug: &str) -> RssEntry {
    RssEntry {
        source_slug: source_slug.to_string(),
        id: entry.id,
        title: entry.title.map(|t| t.content),
        summary: entry.summary.map(|t| t.content),
        link: entry.links.first().map(|l| l.href.clone()),
        published_at: entry.published.and_then(chrono_to_time),
        updated_at: entry.updated.and_then(chrono_to_time),
    }
}

/// Convert `chrono::DateTime<Utc>` to `time::OffsetDateTime` via unix timestamp.
///
/// Nanosecond precision is preserved when the timestamp is in range.
/// Returns `None` only if the timestamp is outside `time`'s supported range
/// (extremely unlikely for status feed dates).
fn chrono_to_time(dt: chrono::DateTime<chrono::Utc>) -> Option<OffsetDateTime> {
    let secs = dt.timestamp();
    let nanos = dt.timestamp_subsec_nanos();
    OffsetDateTime::from_unix_timestamp(secs)
        .ok()
        .map(|odt| odt + time::Duration::nanoseconds(nanos as i64))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sources::{default_presets, FeedFormat};
    use std::collections::HashSet;
    use std::path::PathBuf;

    // ------------------------------------------------------------------
    // Fixture helpers
    // ------------------------------------------------------------------

    fn fixture_path(name: &str) -> PathBuf {
        let mut p = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        p.push("tests");
        p.push("fixtures");
        p.push("rss");
        p.push(name);
        p
    }

    fn load_fixture(name: &str) -> Vec<u8> {
        std::fs::read(fixture_path(name))
            .unwrap_or_else(|e| panic!("failed to read fixture '{name}': {e}"))
    }

    // ------------------------------------------------------------------
    // Unit test 1: RSS 2.0 fixture — openai.xml → 2 entries
    // ------------------------------------------------------------------

    #[test]
    fn test_parse_rss20_fixture_openai() {
        let bytes = load_fixture("openai.xml");
        let entries = parse_feed_bytes(&bytes, "openai").expect("parse must succeed");

        assert_eq!(entries.len(), 2, "openai fixture must have 2 entries");
        assert_eq!(entries[0].source_slug, "openai");
        assert!(entries[0].title.is_some(), "entry title must be present");
        assert!(entries[0].link.is_some(), "entry link must be present");
    }

    // ------------------------------------------------------------------
    // Unit test 2: Atom 1.0 fixture — gcp.xml → 2 entries with timestamps
    // ------------------------------------------------------------------

    #[test]
    fn test_parse_atom_fixture_gcp() {
        let bytes = load_fixture("gcp.xml");
        let entries = parse_feed_bytes(&bytes, "gcp").expect("parse must succeed");

        assert_eq!(entries.len(), 2, "gcp fixture must have 2 entries");
        assert_eq!(entries[0].source_slug, "gcp");
        // Atom feeds carry both updated and published
        assert!(
            entries[0].updated_at.is_some() || entries[0].published_at.is_some(),
            "at least one timestamp must be parsed"
        );
    }

    // ------------------------------------------------------------------
    // Unit test 3: all 10 presets parse successfully with 2 entries each
    // ------------------------------------------------------------------

    #[test]
    fn test_all_10_presets_parse() {
        let slug_to_file = [
            ("openai", "openai.xml"),
            ("stripe", "stripe.xml"),
            ("aws", "aws.xml"),
            ("vercel", "vercel.xml"),
            ("supabase", "supabase.xml"),
            ("github", "github.xml"),
            ("cloudflare", "cloudflare.xml"),
            ("anthropic", "anthropic.xml"),
            ("gcp", "gcp.xml"),
            ("paddle", "paddle.xml"),
        ];

        for (slug, file) in &slug_to_file {
            let bytes = load_fixture(file);
            let entries =
                parse_feed_bytes(&bytes, slug).unwrap_or_else(|e| {
                    panic!("parse failed for '{file}': {e}")
                });
            assert_eq!(
                entries.len(),
                2,
                "fixture '{file}' must produce exactly 2 entries, got {}",
                entries.len()
            );
            for entry in &entries {
                assert_eq!(entry.source_slug, *slug);
            }
        }
    }

    // ------------------------------------------------------------------
    // Unit test 4: default_presets returns exactly 10 unique slugs
    // ------------------------------------------------------------------

    #[test]
    fn test_default_presets_has_10() {
        let presets = default_presets();
        assert_eq!(presets.len(), 10, "must have exactly 10 presets");

        let slugs: HashSet<&str> = presets.iter().map(|p| p.slug.as_str()).collect();
        assert_eq!(slugs.len(), 10, "all slugs must be unique");

        let expected = [
            "openai", "stripe", "aws", "vercel", "supabase", "github", "cloudflare",
            "anthropic", "gcp", "paddle",
        ];
        for slug in &expected {
            assert!(slugs.contains(slug), "missing expected slug: {slug}");
        }
    }

    // ------------------------------------------------------------------
    // Unit test 5: all preset URLs start with https://
    // ------------------------------------------------------------------

    #[test]
    fn test_default_presets_all_urls_valid_scheme() {
        for preset in default_presets() {
            assert!(
                preset.url.starts_with("https://"),
                "preset '{}' URL must use https, got: {}",
                preset.slug,
                preset.url
            );
        }
    }

    // ------------------------------------------------------------------
    // Unit test 6: chrono → time conversion round-trips to second accuracy
    // ------------------------------------------------------------------

    #[test]
    fn test_chrono_to_time_conversion() {
        use chrono::TimeZone;

        let chrono_dt = chrono::Utc.with_ymd_and_hms(2026, 4, 21, 10, 30, 0).unwrap();
        let odt = chrono_to_time(chrono_dt).expect("conversion must succeed");

        assert_eq!(odt.unix_timestamp(), chrono_dt.timestamp());
        assert_eq!(odt.year(), 2026);
        assert_eq!(odt.month() as u8, 4);
        assert_eq!(odt.day(), 21);
        assert_eq!(odt.hour(), 10);
        assert_eq!(odt.minute(), 30);
        assert_eq!(odt.second(), 0);
    }

    // ------------------------------------------------------------------
    // Integration test 7: fetch_all skips 404 source, returns success entries
    // ------------------------------------------------------------------

    #[tokio::test]
    async fn test_fetch_all_skips_failures() {
        use wiremock::matchers::{method, path};
        use wiremock::{Mock, MockServer, ResponseTemplate};

        let mock_server = MockServer::start().await;
        let ok_xml = load_fixture("github.xml");

        // /ok returns valid RSS
        Mock::given(method("GET"))
            .and(path("/ok"))
            .respond_with(
                ResponseTemplate::new(200)
                    .insert_header("content-type", "application/rss+xml; charset=utf-8")
                    .set_body_bytes(ok_xml),
            )
            .mount(&mock_server)
            .await;

        // /fail returns 404
        Mock::given(method("GET"))
            .and(path("/fail"))
            .respond_with(ResponseTemplate::new(404))
            .mount(&mock_server)
            .await;

        let sources = vec![
            RssSource {
                slug: "ok".into(),
                display_name: "OK Source".into(),
                url: format!("{}/ok", mock_server.uri()),
                format: FeedFormat::Rss,
            },
            RssSource {
                slug: "fail".into(),
                display_name: "Fail Source".into(),
                url: format!("{}/fail", mock_server.uri()),
                format: FeedFormat::Rss,
            },
        ];

        let client = RssClient::new();
        let entries = client.fetch_all(&sources).await;

        // Only the 2 entries from the successful source should be returned
        assert_eq!(entries.len(), 2, "only successful source entries returned");
        assert!(
            entries.iter().all(|e| e.source_slug == "ok"),
            "all returned entries must be from the successful source"
        );
    }

    // ------------------------------------------------------------------
    // Integration test 8: fetch_one returns Status error on 404
    // ------------------------------------------------------------------

    #[tokio::test]
    async fn test_fetch_one_returns_status_error_on_404() {
        use wiremock::matchers::{method, path};
        use wiremock::{Mock, MockServer, ResponseTemplate};

        let mock_server = MockServer::start().await;

        Mock::given(method("GET"))
            .and(path("/history.rss"))
            .respond_with(ResponseTemplate::new(404))
            .mount(&mock_server)
            .await;

        let source = RssSource {
            slug: "test".into(),
            display_name: "Test".into(),
            url: format!("{}/history.rss", mock_server.uri()),
            format: FeedFormat::Rss,
        };

        let client = RssClient::new();
        let err = client.fetch_one(&source).await.unwrap_err();

        match err {
            RssError::Status { status, .. } => {
                assert_eq!(status, 404);
            }
            other => panic!("expected RssError::Status, got: {other:?}"),
        }
    }

    // ------------------------------------------------------------------
    // Integration test 9: fetch_one returns Parse error on malformed XML
    // ------------------------------------------------------------------

    #[tokio::test]
    async fn test_fetch_one_returns_parse_error_on_malformed_xml() {
        use wiremock::matchers::{method, path};
        use wiremock::{Mock, MockServer, ResponseTemplate};

        let mock_server = MockServer::start().await;

        Mock::given(method("GET"))
            .and(path("/bad.rss"))
            .respond_with(
                ResponseTemplate::new(200)
                    .insert_header("content-type", "application/rss+xml")
                    .set_body_string("this is not valid xml <<<<"),
            )
            .mount(&mock_server)
            .await;

        let source = RssSource {
            slug: "bad".into(),
            display_name: "Bad".into(),
            url: format!("{}/bad.rss", mock_server.uri()),
            format: FeedFormat::Rss,
        };

        let client = RssClient::new();
        let err = client.fetch_one(&source).await.unwrap_err();

        assert!(
            matches!(err, RssError::Parse(_)),
            "expected RssError::Parse, got: {err:?}"
        );
    }
}
