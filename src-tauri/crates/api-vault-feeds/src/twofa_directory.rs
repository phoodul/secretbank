//! 2fa.directory API v4 client with 24-hour in-memory TTL cache.
//!
//! Fetches the list of TOTP-supporting domains from
//! `https://api.2fa.directory/v4/totp.json` and caches the result for 24 hours.
//!
//! # API Response Format (verified 2026-05-07)
//! The v4 endpoint returns a JSON object mapping domain strings to metadata:
//! ```json
//! {
//!   "github.com": { "methods": ["totp"], "documentation": "https://..." },
//!   "zoom.us":    { "methods": ["sms", "totp"], ... },
//!   ...
//! }
//! ```
//! Only entries whose `methods` array contains `"totp"` are included in the
//! returned [`HashSet`]. Other method types (sms, email, etc.) are ignored.
//!
//! # Security notes (B.1)
//! - B.1-4: Uses `serde_json::Value` (permissive parser); unknown fields are
//!   silently ignored. No `deny_unknown_fields`.
//! - B.1-9: Error messages are generic; no URLs or credential details leak.

use std::collections::HashSet;
use std::sync::RwLock;
use std::time::{Duration, Instant};

/// Cache TTL: 24 hours.
const CACHE_TTL: Duration = Duration::from_secs(24 * 60 * 60);

const TWOFA_BASE_URL: &str = "https://api.2fa.directory";

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

/// Errors produced by [`TwoFaDirectoryClient`].
///
/// Error messages are intentionally generic — no URL or credential details
/// are included (B.1-9).
#[derive(Debug, thiserror::Error)]
pub enum TwoFaError {
    #[error("HTTP request failed")]
    Http(#[from] reqwest::Error),

    #[error("invalid 2fa.directory response")]
    InvalidResponse,
}

// ---------------------------------------------------------------------------
// Internal cache
// ---------------------------------------------------------------------------

struct CachedDomains {
    domains: HashSet<String>,
    cached_at: Instant,
}

impl CachedDomains {
    fn is_fresh(&self) -> bool {
        self.cached_at.elapsed() < CACHE_TTL
    }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

/// 2fa.directory v4 TOTP-domain client.
///
/// Maintains a 24-hour in-memory cache of TOTP-supporting domains.
/// The cache is keyed by domain string (lowercase, no trailing dot).
///
/// Thread-safe via `RwLock`; multiple concurrent readers are supported.
pub struct TwoFaDirectoryClient {
    base_url: String,
    http: reqwest::Client,
    cache: RwLock<Option<CachedDomains>>,
}

impl TwoFaDirectoryClient {
    /// Create a client pointing at the official 2fa.directory API.
    pub fn new() -> Self {
        let http = reqwest::Client::builder()
            .user_agent("api-vault/0.1.0")
            .build()
            .expect("reqwest client build never fails with these options");
        Self {
            base_url: TWOFA_BASE_URL.to_string(),
            http,
            cache: RwLock::new(None),
        }
    }

    /// Create a client with an overridden base URL (used in tests).
    #[doc(hidden)]
    pub fn with_base_url(base_url: impl Into<String>, http: reqwest::Client) -> Self {
        Self {
            base_url: base_url.into(),
            http,
            cache: RwLock::new(None),
        }
    }

    /// Return the set of domains that support TOTP-based 2FA.
    ///
    /// Returns the cached set if the cache is still fresh (< 24 h old).
    /// Otherwise, fetches `GET /v4/totp.json`, parses the response, and
    /// updates the cache.
    ///
    /// # Errors
    /// - [`TwoFaError::Http`] — network request failed or non-200 status.
    /// - [`TwoFaError::InvalidResponse`] — JSON is not the expected object shape.
    pub async fn list_totp_supported_domains(&self) -> Result<HashSet<String>, TwoFaError> {
        // Fast path: return cached value if fresh.
        {
            let guard = self
                .cache
                .read()
                .expect("RwLock poisoned — should not happen in single-process app");
            if let Some(cached) = guard.as_ref() {
                if cached.is_fresh() {
                    return Ok(cached.domains.clone());
                }
            }
        }

        // Slow path: fetch and parse.
        let domains = self.fetch_domains().await?;

        // Update cache.
        {
            let mut guard = self
                .cache
                .write()
                .expect("RwLock poisoned — should not happen in single-process app");
            *guard = Some(CachedDomains {
                domains: domains.clone(),
                cached_at: Instant::now(),
            });
        }

        Ok(domains)
    }

    /// Fetch and parse the TOTP domain list from the remote API.
    async fn fetch_domains(&self) -> Result<HashSet<String>, TwoFaError> {
        let url = format!("{}/v4/totp.json", self.base_url);

        let resp = self.http.get(&url).send().await?;

        if resp.status() != reqwest::StatusCode::OK {
            return Err(TwoFaError::Http(
                resp.error_for_status()
                    .expect_err("status is not OK, error_for_status must return Err"),
            ));
        }

        let body = resp.text().await?;
        parse_totp_json(&body)
    }
}

impl Default for TwoFaDirectoryClient {
    fn default() -> Self {
        Self::new()
    }
}

// ---------------------------------------------------------------------------
// JSON parsing
// ---------------------------------------------------------------------------

/// Parse the `v4/totp.json` response body.
///
/// Expected shape (verified 2026-05-07):
/// ```json
/// { "domain.com": { "methods": ["totp", ...], ... }, ... }
/// ```
///
/// Returns a [`HashSet`] of domain strings whose `methods` array contains
/// `"totp"` (case-insensitive). Domains are normalised to lowercase with any
/// trailing dots stripped.
///
/// Uses `serde_json::Value` (permissive) so that unknown or future fields do
/// not cause parse failures (B.1-4).
fn parse_totp_json(body: &str) -> Result<HashSet<String>, TwoFaError> {
    let value: serde_json::Value =
        serde_json::from_str(body).map_err(|_| TwoFaError::InvalidResponse)?;

    let obj = value.as_object().ok_or(TwoFaError::InvalidResponse)?;

    let mut domains = HashSet::new();

    for (domain_key, entry) in obj {
        // Normalise domain: lowercase + strip trailing dot.
        let domain = domain_key.to_lowercase();
        let domain = domain.trim_end_matches('.');

        // Each entry must be an object with a "methods" array.
        let methods = match entry.get("methods").and_then(|m| m.as_array()) {
            Some(arr) => arr,
            None => continue, // missing or non-array "methods" → skip
        };

        // Include only domains that support TOTP.
        let supports_totp = methods
            .iter()
            .filter_map(|v| v.as_str())
            .any(|m| m.eq_ignore_ascii_case("totp"));

        if supports_totp {
            domains.insert(domain.to_string());
        }
    }

    Ok(domains)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;
    use wiremock::matchers::{method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    fn make_client(server: &MockServer) -> TwoFaDirectoryClient {
        let http = reqwest::Client::builder()
            .user_agent("api-vault/0.1.0")
            .build()
            .unwrap();
        TwoFaDirectoryClient::with_base_url(server.uri(), http)
    }

    /// Minimal v4/totp.json fixture containing two TOTP-supporting domains
    /// and one that only supports SMS (should be excluded).
    fn fixture_totp_json() -> &'static str {
        r#"{
            "github.com": {
                "methods": ["totp"],
                "documentation": "https://docs.github.com/en/authentication"
            },
            "google.com": {
                "methods": ["totp", "sms"],
                "documentation": "https://support.google.com"
            },
            "sms-only.example.com": {
                "methods": ["sms"],
                "documentation": "https://example.com"
            }
        }"#
    }

    // ------------------------------------------------------------------
    // TFA1: wiremock 응답 → HashSet 정상 파싱
    // ------------------------------------------------------------------
    #[tokio::test]
    async fn tfa1_valid_response_parsed_to_hashset() {
        let mock_server = MockServer::start().await;

        Mock::given(method("GET"))
            .and(path("/v4/totp.json"))
            .respond_with(ResponseTemplate::new(200).set_body_string(fixture_totp_json()))
            .mount(&mock_server)
            .await;

        let client = make_client(&mock_server);
        let domains = client.list_totp_supported_domains().await.unwrap();

        assert!(
            domains.contains("github.com"),
            "github.com must be included"
        );
        assert!(
            domains.contains("google.com"),
            "google.com must be included"
        );
        assert!(
            !domains.contains("sms-only.example.com"),
            "SMS-only domain must be excluded"
        );
    }

    // ------------------------------------------------------------------
    // TFA2: 두 번째 호출은 네트워크 안 침 (캐시 히트)
    // ------------------------------------------------------------------
    #[tokio::test]
    async fn tfa2_second_call_uses_cache() {
        let mock_server = MockServer::start().await;

        // Mount the mock — but we will verify it's called exactly once.
        Mock::given(method("GET"))
            .and(path("/v4/totp.json"))
            .respond_with(ResponseTemplate::new(200).set_body_string(fixture_totp_json()))
            .expect(1) // Must be called exactly once regardless of how many client calls we make.
            .mount(&mock_server)
            .await;

        let client = make_client(&mock_server);

        let domains1 = client.list_totp_supported_domains().await.unwrap();
        let domains2 = client.list_totp_supported_domains().await.unwrap();

        assert_eq!(domains1, domains2, "cached result must equal fresh result");
        // wiremock verifies the `expect(1)` constraint on `mock_server` drop.
    }

    // ------------------------------------------------------------------
    // TFA3: TTL 만료 후 재 fetch
    // ------------------------------------------------------------------
    #[tokio::test]
    async fn tfa3_expired_cache_refetches() {
        let mock_server = MockServer::start().await;

        Mock::given(method("GET"))
            .and(path("/v4/totp.json"))
            .respond_with(ResponseTemplate::new(200).set_body_string(fixture_totp_json()))
            .expect(2) // Should be called twice: initial fetch + after expiry.
            .mount(&mock_server)
            .await;

        let http = reqwest::Client::builder()
            .user_agent("api-vault/0.1.0")
            .build()
            .unwrap();
        let client = TwoFaDirectoryClient::with_base_url(mock_server.uri(), http);

        // First fetch.
        client.list_totp_supported_domains().await.unwrap();

        // Manually expire the cache by backdating `cached_at`.
        {
            let mut guard = client.cache.write().unwrap();
            if let Some(cached) = guard.as_mut() {
                // Subtract more than CACHE_TTL to simulate expiry.
                cached.cached_at = Instant::now()
                    .checked_sub(CACHE_TTL + Duration::from_secs(1))
                    .unwrap_or_else(Instant::now);
            }
        }

        // Second fetch — cache is stale, must hit network.
        client.list_totp_supported_domains().await.unwrap();

        // wiremock verifies the `expect(2)` constraint on drop.
    }

    // ------------------------------------------------------------------
    // Extra: parse_totp_json — 실제 응답 형식 검증
    // ------------------------------------------------------------------
    #[test]
    fn parse_real_response_shape() {
        let result = parse_totp_json(fixture_totp_json()).unwrap();
        assert!(result.contains("github.com"));
        assert!(result.contains("google.com"));
        assert_eq!(result.len(), 2, "only TOTP-supporting domains included");
    }

    // ------------------------------------------------------------------
    // Extra: parse_totp_json — 빈 methods 배열
    // ------------------------------------------------------------------
    #[test]
    fn parse_empty_methods_excluded() {
        let body = r#"{ "empty.com": { "methods": [] } }"#;
        let result = parse_totp_json(body).unwrap();
        assert!(
            result.is_empty(),
            "domain with empty methods must be excluded"
        );
    }

    // ------------------------------------------------------------------
    // Extra: parse_totp_json — 잘못된 JSON → Err(InvalidResponse)
    // ------------------------------------------------------------------
    #[test]
    fn parse_invalid_json_returns_error() {
        let err = parse_totp_json("not valid json").unwrap_err();
        assert!(matches!(err, TwoFaError::InvalidResponse));
    }

    // ------------------------------------------------------------------
    // Extra: parse_totp_json — JSON 배열 (예상 밖 형식) → Err
    // ------------------------------------------------------------------
    #[test]
    fn parse_json_array_returns_error() {
        let err = parse_totp_json("[1, 2, 3]").unwrap_err();
        assert!(matches!(err, TwoFaError::InvalidResponse));
    }

    // ------------------------------------------------------------------
    // Extra: parse_totp_json — missing "methods" 키 → skip
    // ------------------------------------------------------------------
    #[test]
    fn parse_missing_methods_key_skipped() {
        let body = r#"{ "no-methods.com": { "documentation": "https://example.com" } }"#;
        let result = parse_totp_json(body).unwrap();
        assert!(
            result.is_empty(),
            "domain without methods key must be skipped"
        );
    }

    // ------------------------------------------------------------------
    // Extra: domain normalisation (trailing dot, uppercase)
    // ------------------------------------------------------------------
    #[test]
    fn parse_domain_normalised_lowercase_no_trailing_dot() {
        let body = r#"{ "GitHub.Com.": { "methods": ["totp"] } }"#;
        let result = parse_totp_json(body).unwrap();
        assert!(
            result.contains("github.com"),
            "domain must be normalised to lowercase without trailing dot"
        );
    }

    // ------------------------------------------------------------------
    // Extra: 500 서버 에러 → Err(Http)
    // ------------------------------------------------------------------
    #[tokio::test]
    async fn tfa_server_error_returns_http_error() {
        let mock_server = MockServer::start().await;

        Mock::given(method("GET"))
            .and(path("/v4/totp.json"))
            .respond_with(ResponseTemplate::new(500))
            .mount(&mock_server)
            .await;

        let client = make_client(&mock_server);
        let err = client.list_totp_supported_domains().await.unwrap_err();

        assert!(
            matches!(err, TwoFaError::Http(_)),
            "500 response must produce TwoFaError::Http, got: {:?}",
            err
        );
    }
}
