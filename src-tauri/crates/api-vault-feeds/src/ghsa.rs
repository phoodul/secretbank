use std::num::NonZeroU32;
use std::sync::Arc;
use std::time::Duration;

use governor::{DefaultDirectRateLimiter, Quota, RateLimiter};
use reqwest::header::{ACCEPT, LINK};
use time::format_description::well_known::Rfc3339;
use time::OffsetDateTime;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/// A single advisory entry fetched from the GitHub Security Advisory database.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct GhsaAdvisory {
    pub ghsa_id: String,
    pub cve_id: Option<String>,
    pub summary: String,
    pub description: Option<String>,
    /// "low" | "medium" | "high" | "critical" | "unknown"
    pub severity: String,
    pub html_url: String,
    pub published_at: OffsetDateTime,
    pub updated_at: OffsetDateTime,
    pub withdrawn_at: Option<OffsetDateTime>,
    /// cvss_severities.cvss_v3.score
    pub cvss_v3_score: Option<f32>,
    /// cvss_severities.cvss_v3.vector_string
    pub cvss_v3_vector: Option<String>,
    /// cwes[].cwe_id (flattened)
    pub cwe_ids: Vec<String>,
    /// references[] — string array in the GHSA REST API
    pub references: Vec<String>,
    /// "reviewed" | "unreviewed" | "malware"
    pub advisory_type: String,
}

// ---------------------------------------------------------------------------
// Error model
// ---------------------------------------------------------------------------

#[derive(Debug, thiserror::Error)]
pub enum GhsaError {
    #[error("HTTP request failed: {0}")]
    Http(#[from] reqwest::Error),

    #[error("GHSA rate limited, retry after {retry_after:?}")]
    RateLimited { retry_after: Duration },

    #[error("Failed to decode GHSA response: {0}")]
    Decode(#[from] serde_json::Error),

    #[error("GHSA server error (status {status}): {message}")]
    Server { status: u16, message: String },

    #[error("GHSA client error (status {status}): {message}")]
    Client { status: u16, message: String },

    #[error("Failed to parse GHSA timestamp: {0}")]
    ParseTime(#[from] time::error::Parse),

    #[error("Invalid Link header: {0}")]
    InvalidLinkHeader(String),
}

// ---------------------------------------------------------------------------
// Raw (private) deserialization types
// ---------------------------------------------------------------------------

#[derive(serde::Deserialize)]
struct RawAdvisory {
    ghsa_id: String,
    cve_id: Option<String>,
    summary: String,
    description: Option<String>,
    severity: Option<String>,
    html_url: String,
    published_at: String,
    updated_at: String,
    withdrawn_at: Option<String>,
    cvss_severities: Option<RawCvssSeverities>,
    cwes: Option<Vec<RawCwe>>,
    references: Vec<serde_json::Value>,
    #[serde(rename = "type")]
    advisory_type: String,
}

#[derive(serde::Deserialize)]
struct RawCvssSeverities {
    cvss_v3: Option<RawCvss>,
}

#[derive(serde::Deserialize)]
struct RawCvss {
    vector_string: Option<String>,
    score: Option<f32>,
}

#[derive(serde::Deserialize)]
struct RawCwe {
    cwe_id: String,
}

// ---------------------------------------------------------------------------
// Link header parser
// ---------------------------------------------------------------------------

/// Parse the GitHub `Link` header and return the URL for `rel="next"`, if present.
///
/// GitHub example:
/// ```text
/// Link: <https://api.github.com/advisories?after=XYZ>; rel="next", <...>; rel="last"
/// ```
fn parse_next_link(header_value: &str) -> Option<String> {
    for part in header_value.split(',') {
        let part = part.trim();
        if let Some((url_part, rel_part)) = part.split_once(';') {
            let url = url_part
                .trim()
                .trim_start_matches('<')
                .trim_end_matches('>');
            let rel = rel_part.trim();
            if rel == r#"rel="next""# {
                return Some(url.to_string());
            }
        }
    }
    None
}

// ---------------------------------------------------------------------------
// Date formatting helpers
// ---------------------------------------------------------------------------

fn format_github_search_date(dt: OffsetDateTime) -> String {
    dt.format(&Rfc3339).expect("Rfc3339 format always succeeds")
}

fn parse_ghsa_time(s: &str) -> Result<OffsetDateTime, time::error::Parse> {
    OffsetDateTime::parse(s, &Rfc3339)
}

// ---------------------------------------------------------------------------
// Map raw → public
// ---------------------------------------------------------------------------

fn map_raw(raw: RawAdvisory) -> Result<GhsaAdvisory, GhsaError> {
    let published_at = parse_ghsa_time(&raw.published_at)?;
    let updated_at = parse_ghsa_time(&raw.updated_at)?;
    let withdrawn_at = raw
        .withdrawn_at
        .as_deref()
        .map(parse_ghsa_time)
        .transpose()?;

    let (cvss_v3_score, cvss_v3_vector) = raw
        .cvss_severities
        .as_ref()
        .and_then(|s| s.cvss_v3.as_ref())
        .map(|v3| (v3.score, v3.vector_string.clone()))
        .unwrap_or((None, None));

    let cwe_ids = raw
        .cwes
        .unwrap_or_default()
        .into_iter()
        .map(|c| c.cwe_id)
        .collect();

    // `references` field is a string array in the GHSA REST API.
    // Guard against both `"https://..."` and `{"url":"https://..."}` shapes.
    let references = raw
        .references
        .into_iter()
        .filter_map(|v| match v {
            serde_json::Value::String(s) => Some(s),
            serde_json::Value::Object(m) => {
                m.get("url").and_then(|u| u.as_str()).map(|s| s.to_string())
            }
            _ => None,
        })
        .collect();

    Ok(GhsaAdvisory {
        ghsa_id: raw.ghsa_id,
        cve_id: raw.cve_id,
        summary: raw.summary,
        description: raw.description,
        severity: raw.severity.unwrap_or_else(|| "unknown".to_string()),
        html_url: raw.html_url,
        published_at,
        updated_at,
        withdrawn_at,
        cvss_v3_score,
        cvss_v3_vector,
        cwe_ids,
        references,
        advisory_type: raw.advisory_type,
    })
}

// ---------------------------------------------------------------------------
// Rate limiter factory
// ---------------------------------------------------------------------------

fn build_limiter() -> Arc<DefaultDirectRateLimiter> {
    // PAT authenticated: 5000 req/h → 1 token per 720ms, burst 10
    let quota = Quota::with_period(Duration::from_millis(720))
        .expect("period > 0")
        .allow_burst(NonZeroU32::new(10).expect("burst > 0"));
    Arc::new(RateLimiter::direct(quota))
}

// ---------------------------------------------------------------------------
// Retry-After header parser
// ---------------------------------------------------------------------------

fn parse_retry_after(headers: &reqwest::header::HeaderMap) -> Duration {
    headers
        .get("Retry-After")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.parse::<u64>().ok())
        .map(Duration::from_secs)
        .unwrap_or(Duration::from_secs(60))
}

// ---------------------------------------------------------------------------
// GhsaClient
// ---------------------------------------------------------------------------

const GHSA_BASE_URL: &str = "https://api.github.com/advisories";
const GHSA_API_VERSION: &str = "2022-11-28";
const PER_PAGE: &str = "100";

/// GitHub Security Advisory DB client with built-in rate limiting.
pub struct GhsaClient {
    http: reqwest::Client,
    /// Full endpoint URL — default: `https://api.github.com/advisories`
    base_url: String,
    token: String,
    limiter: Arc<DefaultDirectRateLimiter>,
}

impl GhsaClient {
    /// Create a client pointing at the official GitHub advisory endpoint.
    pub fn new(token: String) -> Self {
        Self::with_base_url(GHSA_BASE_URL, token)
    }

    /// Create a client with an overridden base URL (used in tests).
    #[doc(hidden)]
    pub fn with_base_url(base_url: impl Into<String>, token: impl Into<String>) -> Self {
        let http = reqwest::Client::builder()
            .user_agent("api-vault/0.1.0")
            .build()
            .expect("reqwest client build never fails with these options");
        Self {
            http,
            base_url: base_url.into(),
            token: token.into(),
            limiter: build_limiter(),
        }
    }

    /// Fetch all advisories modified since `since`, following Link-header pagination.
    pub async fn fetch_advisories(
        &self,
        since: OffsetDateTime,
    ) -> Result<Vec<GhsaAdvisory>, GhsaError> {
        let formatted_since = format_github_search_date(since);
        let query = [
            ("modified", format!(">{}", formatted_since)),
            ("sort", "updated".to_string()),
            ("direction", "asc".to_string()),
            ("per_page", PER_PAGE.to_string()),
        ];

        let mut next_url: Option<String> = None;
        let mut collected: Vec<GhsaAdvisory> = Vec::new();

        loop {
            self.limiter.until_ready().await;

            let req = if let Some(url) = next_url.take() {
                // Subsequent pages — use the full URL from the Link header as-is
                self.http.get(url)
            } else {
                self.http.get(&self.base_url).query(&query)
            };

            let resp = req
                .bearer_auth(&self.token)
                .header(ACCEPT, "application/vnd.github+json")
                .header("X-GitHub-Api-Version", GHSA_API_VERSION)
                .send()
                .await?;

            match resp.status().as_u16() {
                200 => {
                    let link = resp
                        .headers()
                        .get(LINK)
                        .and_then(|v| v.to_str().ok())
                        .map(|s| s.to_string());
                    let raw: Vec<RawAdvisory> = resp.json().await?;
                    for r in raw {
                        collected.push(map_raw(r)?);
                    }
                    next_url = link.as_deref().and_then(parse_next_link);
                    if next_url.is_none() {
                        break;
                    }
                }
                429 => {
                    let retry_after = parse_retry_after(resp.headers());
                    return Err(GhsaError::RateLimited { retry_after });
                }
                s @ 500..=599 => {
                    let message = resp
                        .headers()
                        .get("message")
                        .and_then(|v| v.to_str().ok())
                        .unwrap_or("unknown server error")
                        .to_string();
                    return Err(GhsaError::Server { status: s, message });
                }
                s => {
                    let message = resp
                        .headers()
                        .get("message")
                        .and_then(|v| v.to_str().ok())
                        .unwrap_or("client error")
                        .to_string();
                    return Err(GhsaError::Client { status: s, message });
                }
            }
        }

        Ok(collected)
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use time::Duration as TimeDuration;
    use wiremock::matchers::{method, path, query_param_is_missing};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    fn make_advisory(n: u32) -> serde_json::Value {
        serde_json::json!({
            "ghsa_id": format!("GHSA-{n:04}-{n:04}-{n:04}"),
            "cve_id": format!("CVE-2026-{n:05}"),
            "summary": format!("Test advisory {n}"),
            "description": format!("Description for advisory {n}"),
            "severity": "high",
            "html_url": format!("https://github.com/advisories/GHSA-{n:04}-{n:04}-{n:04}"),
            "published_at": "2026-01-15T10:00:00Z",
            "updated_at": "2026-04-01T12:00:00Z",
            "withdrawn_at": null,
            "cvss_severities": {
                "cvss_v3": {
                    "vector_string": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H",
                    "score": 9.8_f32
                }
            },
            "cwes": [{ "cwe_id": "CWE-79", "name": "XSS" }],
            "references": ["https://example.com/ref1"],
            "type": "reviewed"
        })
    }

    fn make_advisory_no_cvss(n: u32) -> serde_json::Value {
        serde_json::json!({
            "ghsa_id": format!("GHSA-{n:04}-{n:04}-{n:04}"),
            "cve_id": null,
            "summary": format!("Advisory no CVSS {n}"),
            "description": null,
            "severity": "unknown",
            "html_url": format!("https://github.com/advisories/GHSA-{n:04}-{n:04}-{n:04}"),
            "published_at": "2026-02-01T00:00:00Z",
            "updated_at": "2026-04-10T00:00:00Z",
            "withdrawn_at": null,
            "cvss_severities": null,
            "cwes": null,
            "references": [],
            "type": "unreviewed"
        })
    }

    // ------------------------------------------------------------------
    // Unit tests — parse_next_link
    // ------------------------------------------------------------------

    #[test]
    fn test_parse_next_link_extracts_next_url() {
        let header = r#"<https://api.github.com/advisories?after=ABC123>; rel="next", <https://api.github.com/advisories?after=XYZ>; rel="last""#;
        let result = parse_next_link(header);
        assert_eq!(
            result,
            Some("https://api.github.com/advisories?after=ABC123".to_string())
        );
    }

    #[test]
    fn test_parse_next_link_returns_none_when_no_next() {
        let header = r#"<https://api.github.com/advisories?before=ABC123>; rel="last""#;
        let result = parse_next_link(header);
        assert_eq!(result, None);
    }

    #[test]
    fn test_parse_next_link_handles_multiple_rels() {
        let header = r#"<https://api.github.com/advisories?before=A>; rel="prev", <https://api.github.com/advisories>; rel="first", <https://api.github.com/advisories?after=CURSOR>; rel="next", <https://api.github.com/advisories?after=LAST>; rel="last""#;
        let result = parse_next_link(header);
        assert_eq!(
            result,
            Some("https://api.github.com/advisories?after=CURSOR".to_string())
        );
    }

    // ------------------------------------------------------------------
    // Integration tests — wiremock
    // ------------------------------------------------------------------

    #[tokio::test]
    async fn test_fetch_advisories_200_single_page() {
        let mock_server = MockServer::start().await;

        Mock::given(method("GET"))
            .and(path("/"))
            .respond_with(
                ResponseTemplate::new(200).set_body_json(serde_json::json!([make_advisory(1)])),
            )
            .mount(&mock_server)
            .await;

        let client = GhsaClient::with_base_url(mock_server.uri(), "test-token");
        let since = OffsetDateTime::now_utc() - TimeDuration::days(7);
        let result = client.fetch_advisories(since).await.unwrap();

        assert_eq!(result.len(), 1);
        assert_eq!(result[0].ghsa_id, "GHSA-0001-0001-0001");
        assert_eq!(result[0].cve_id.as_deref(), Some("CVE-2026-00001"));
        assert_eq!(result[0].severity, "high");
        assert_eq!(result[0].advisory_type, "reviewed");
        assert_eq!(result[0].cwe_ids, vec!["CWE-79"]);
        assert_eq!(result[0].references, vec!["https://example.com/ref1"]);
        let score = result[0].cvss_v3_score.unwrap();
        assert!((score - 9.8_f32).abs() < 0.01);
    }

    #[tokio::test]
    async fn test_fetch_advisories_200_paginated_via_link_header() {
        let mock_server = MockServer::start().await;
        let page2_url = format!("{}/page2", mock_server.uri());

        // Page 1 — has Link: next → page2
        Mock::given(method("GET"))
            .and(path("/"))
            .and(query_param_is_missing("after"))
            .respond_with(
                ResponseTemplate::new(200)
                    .insert_header("Link", format!(r#"<{}>; rel="next""#, page2_url))
                    .set_body_json(serde_json::json!([make_advisory(1)])),
            )
            .mount(&mock_server)
            .await;

        // Page 2 — no Link header → last page
        Mock::given(method("GET"))
            .and(path("/page2"))
            .respond_with(
                ResponseTemplate::new(200).set_body_json(serde_json::json!([make_advisory(2)])),
            )
            .mount(&mock_server)
            .await;

        let client = GhsaClient::with_base_url(mock_server.uri(), "test-token");
        let since = OffsetDateTime::now_utc() - TimeDuration::days(7);
        let result = client.fetch_advisories(since).await.unwrap();

        assert_eq!(result.len(), 2);
        assert_eq!(result[0].ghsa_id, "GHSA-0001-0001-0001");
        assert_eq!(result[1].ghsa_id, "GHSA-0002-0002-0002");
    }

    #[tokio::test]
    async fn test_fetch_advisories_429_returns_rate_limited() {
        let mock_server = MockServer::start().await;

        Mock::given(method("GET"))
            .and(path("/"))
            .respond_with(ResponseTemplate::new(429).insert_header("Retry-After", "60"))
            .mount(&mock_server)
            .await;

        let client = GhsaClient::with_base_url(mock_server.uri(), "test-token");
        let since = OffsetDateTime::now_utc() - TimeDuration::days(7);
        let err = client.fetch_advisories(since).await.unwrap_err();

        match err {
            GhsaError::RateLimited { retry_after } => {
                assert_eq!(retry_after, Duration::from_secs(60));
            }
            other => panic!("expected RateLimited, got: {other:?}"),
        }
    }

    #[tokio::test]
    async fn test_fetch_advisories_503_returns_server() {
        let mock_server = MockServer::start().await;

        Mock::given(method("GET"))
            .and(path("/"))
            .respond_with(ResponseTemplate::new(503))
            .mount(&mock_server)
            .await;

        let client = GhsaClient::with_base_url(mock_server.uri(), "test-token");
        let since = OffsetDateTime::now_utc() - TimeDuration::days(7);
        let err = client.fetch_advisories(since).await.unwrap_err();

        match err {
            GhsaError::Server { status, .. } => {
                assert_eq!(status, 503);
            }
            other => panic!("expected Server, got: {other:?}"),
        }
    }

    #[tokio::test]
    async fn test_fetch_advisories_cvss_severities_optional() {
        let mock_server = MockServer::start().await;

        Mock::given(method("GET"))
            .and(path("/"))
            .respond_with(
                ResponseTemplate::new(200)
                    .set_body_json(serde_json::json!([make_advisory_no_cvss(5)])),
            )
            .mount(&mock_server)
            .await;

        let client = GhsaClient::with_base_url(mock_server.uri(), "test-token");
        let since = OffsetDateTime::now_utc() - TimeDuration::days(7);
        let result = client.fetch_advisories(since).await.unwrap();

        assert_eq!(result.len(), 1);
        assert!(result[0].cvss_v3_score.is_none());
        assert!(result[0].cvss_v3_vector.is_none());
        assert_eq!(result[0].severity, "unknown");
    }

    #[tokio::test]
    async fn test_fetch_advisories_cve_id_nullable() {
        let mock_server = MockServer::start().await;

        Mock::given(method("GET"))
            .and(path("/"))
            .respond_with(
                ResponseTemplate::new(200)
                    .set_body_json(serde_json::json!([make_advisory_no_cvss(7)])),
            )
            .mount(&mock_server)
            .await;

        let client = GhsaClient::with_base_url(mock_server.uri(), "test-token");
        let since = OffsetDateTime::now_utc() - TimeDuration::days(7);
        let result = client.fetch_advisories(since).await.unwrap();

        assert_eq!(result.len(), 1);
        assert!(result[0].cve_id.is_none());
    }
}
