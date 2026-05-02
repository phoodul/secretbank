use std::num::NonZeroU32;
use std::sync::Arc;
use std::time::Duration;

use governor::{DefaultDirectRateLimiter, Quota, RateLimiter};
use time::macros::format_description;
use time::OffsetDateTime;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/// A single CVE entry extracted from the NVD CVE API 2.0 response.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct NvdCve {
    pub id: String,
    pub published: OffsetDateTime,
    pub last_modified: OffsetDateTime,
    pub vuln_status: String,
    pub description_en: Option<String>,
    /// baseSeverity from cvssMetricV31[0] — absent for "Not Scheduled" CVEs (post 2026-04-15)
    pub base_severity: Option<String>,
    /// baseScore from cvssMetricV31[0] — absent for "Not Scheduled" CVEs
    pub base_score: Option<f32>,
    pub cwes: Vec<String>,
    pub references: Vec<String>,
}

// ---------------------------------------------------------------------------
// Error model
// ---------------------------------------------------------------------------

#[derive(Debug, thiserror::Error)]
pub enum NvdError {
    #[error("HTTP request failed: {0}")]
    Http(#[from] reqwest::Error),

    #[error("NVD rate limited, retry after {retry_after:?}")]
    RateLimited { retry_after: Duration },

    #[error("Failed to decode NVD response: {0}")]
    Decode(#[from] serde_json::Error),

    #[error("NVD server error (status {status}): {message}")]
    Server { status: u16, message: String },

    #[error("NVD client error (status {status}): {message}")]
    Client { status: u16, message: String },

    #[error("Date range too large ({days} days). NVD limits range to 120 days.")]
    RangeTooLarge { days: i64 },

    #[error("Failed to parse NVD timestamp: {0}")]
    ParseTime(#[from] time::error::Parse),
}

// ---------------------------------------------------------------------------
// Raw (private) deserialization types
// ---------------------------------------------------------------------------

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawPage {
    total_results: u32,
    vulnerabilities: Vec<RawVulnEnvelope>,
}

#[derive(Debug, serde::Deserialize)]
struct RawVulnEnvelope {
    cve: RawCve,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawCve {
    id: String,
    published: String,
    last_modified: String,
    vuln_status: String,
    #[serde(default)]
    descriptions: Vec<RawDescription>,
    #[serde(default)]
    metrics: RawMetrics,
    #[serde(default)]
    weaknesses: Vec<RawWeakness>,
    #[serde(default)]
    references: Vec<RawReference>,
}

#[derive(Debug, serde::Deserialize)]
struct RawDescription {
    lang: String,
    value: String,
}

#[derive(Debug, Default, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawMetrics {
    #[serde(default)]
    cvss_metric_v31: Option<Vec<RawCvssV31>>,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawCvssV31 {
    cvss_data: RawCvssData,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawCvssData {
    base_score: f32,
    base_severity: String,
}

#[derive(Debug, Default, serde::Deserialize)]
struct RawWeakness {
    #[serde(default)]
    description: Vec<RawDescription>,
}

#[derive(Debug, serde::Deserialize)]
struct RawReference {
    url: String,
}

// ---------------------------------------------------------------------------
// Date formatting helpers
// ---------------------------------------------------------------------------

/// Format `OffsetDateTime` into the NVD query param format:
/// `2026-04-01T00:00:00.000+00:00`
fn format_nvd_date(dt: OffsetDateTime) -> String {
    // Format to NVD expected format: with ±HH:MM offset
    const FMT: &[time::format_description::BorrowedFormatItem<'_>] = format_description!(
        "[year]-[month]-[day]T[hour]:[minute]:[second].[subsecond digits:3][offset_hour sign:mandatory]:[offset_minute]"
    );
    dt.format(FMT).expect("static format always succeeds")
}

/// Parse the NVD response datetime string (no timezone offset).
/// Example: `"2026-04-01T12:00:00.000"` → OffsetDateTime (UTC)
fn parse_nvd_time(s: &str) -> Result<OffsetDateTime, time::error::Parse> {
    // NVD timestamps lack offset; try with subseconds first, then without.
    const FMT_MS: &[time::format_description::BorrowedFormatItem<'_>] =
        format_description!("[year]-[month]-[day]T[hour]:[minute]:[second].[subsecond]");
    const FMT_PLAIN: &[time::format_description::BorrowedFormatItem<'_>] =
        format_description!("[year]-[month]-[day]T[hour]:[minute]:[second]");

    if let Ok(pdt) = time::PrimitiveDateTime::parse(s, FMT_MS) {
        return Ok(pdt.assume_utc());
    }
    let pdt = time::PrimitiveDateTime::parse(s, FMT_PLAIN)?;
    Ok(pdt.assume_utc())
}

// ---------------------------------------------------------------------------
// Map raw → public
// ---------------------------------------------------------------------------

fn map_raw_to_public(raw: RawCve) -> Result<NvdCve, NvdError> {
    let published = parse_nvd_time(&raw.published)?;
    let last_modified = parse_nvd_time(&raw.last_modified)?;

    let description_en = raw
        .descriptions
        .iter()
        .find(|d| d.lang == "en")
        .map(|d| d.value.clone());

    let (base_score, base_severity) = raw
        .metrics
        .cvss_metric_v31
        .as_deref()
        .and_then(|v| v.first())
        .map(|m| {
            (
                Some(m.cvss_data.base_score),
                Some(m.cvss_data.base_severity.clone()),
            )
        })
        .unwrap_or((None, None));

    let cwes = raw
        .weaknesses
        .iter()
        .flat_map(|w| w.description.iter())
        .filter(|d| d.lang == "en")
        .map(|d| d.value.clone())
        .collect();

    let references = raw.references.iter().map(|r| r.url.clone()).collect();

    Ok(NvdCve {
        id: raw.id,
        published,
        last_modified,
        vuln_status: raw.vuln_status,
        description_en,
        base_severity,
        base_score,
        cwes,
        references,
    })
}

// ---------------------------------------------------------------------------
// Rate limiter factory
// ---------------------------------------------------------------------------

fn build_limiter(has_api_key: bool) -> Arc<DefaultDirectRateLimiter> {
    // API key present:  50 req / 30s → 1 token per 600ms, burst 50
    // No API key:        5 req / 30s → 1 token per 6000ms, burst 5
    let (period_ms, burst): (u64, u32) = if has_api_key { (600, 50) } else { (6_000, 5) };
    let quota = Quota::with_period(Duration::from_millis(period_ms))
        .expect("period > 0")
        .allow_burst(NonZeroU32::new(burst).expect("burst > 0"));
    Arc::new(RateLimiter::direct(quota))
}

// ---------------------------------------------------------------------------
// NvdClient
// ---------------------------------------------------------------------------

const PAGE_SIZE: u32 = 2000;
const MAX_RANGE_DAYS: i64 = 120;

/// NVD CVE API 2.0 client with built-in rate limiting.
pub struct NvdClient {
    http: reqwest::Client,
    /// Full endpoint URL — default: `https://services.nvd.nist.gov/rest/json/cves/2.0`
    base_url: String,
    api_key: Option<String>,
    limiter: Arc<DefaultDirectRateLimiter>,
}

impl NvdClient {
    /// Create a client pointing at the official NVD endpoint.
    pub fn new(api_key: Option<String>) -> Self {
        Self::with_base_url("https://services.nvd.nist.gov/rest/json/cves/2.0", api_key)
    }

    /// Create a client with an overridden base URL (used in tests).
    #[doc(hidden)]
    pub fn with_base_url(base_url: impl Into<String>, api_key: Option<String>) -> Self {
        let limiter = build_limiter(api_key.is_some());
        Self {
            http: reqwest::Client::new(),
            base_url: base_url.into(),
            api_key,
            limiter,
        }
    }

    /// Fetch all CVEs modified since `since` up to now, using pagination.
    ///
    /// Returns `NvdError::RangeTooLarge` immediately if the range exceeds 120 days.
    pub async fn fetch_incremental(&self, since: OffsetDateTime) -> Result<Vec<NvdCve>, NvdError> {
        let now = OffsetDateTime::now_utc();
        let days = (now - since).whole_days();
        if days > MAX_RANGE_DAYS {
            return Err(NvdError::RangeTooLarge { days });
        }

        let start_date = format_nvd_date(since.to_offset(time::UtcOffset::UTC));
        let end_date = format_nvd_date(now.to_offset(time::UtcOffset::UTC));

        let mut start_index: u32 = 0;
        let mut collected: Vec<NvdCve> = Vec::new();

        loop {
            self.limiter.until_ready().await;

            let page = self
                .fetch_page(start_index, PAGE_SIZE, &start_date, &end_date)
                .await?;

            let total = page.total_results;
            let fetched = page.vulnerabilities.len() as u32;

            for env in page.vulnerabilities {
                collected.push(map_raw_to_public(env.cve)?);
            }

            // Advance by PAGE_SIZE (not fetched count) so we skip the window even on partial pages
            start_index += PAGE_SIZE;

            if start_index >= total || fetched == 0 {
                break;
            }
        }

        Ok(collected)
    }

    // -----------------------------------------------------------------------
    // Internal helpers
    // -----------------------------------------------------------------------

    async fn fetch_page(
        &self,
        start_index: u32,
        results_per_page: u32,
        start_date: &str,
        end_date: &str,
    ) -> Result<RawPage, NvdError> {
        let mut req = self.http.get(&self.base_url).query(&[
            ("lastModStartDate", start_date),
            ("lastModEndDate", end_date),
            ("startIndex", &start_index.to_string()),
            ("resultsPerPage", &results_per_page.to_string()),
        ]);

        if let Some(key) = &self.api_key {
            req = req.header("apiKey", key.as_str());
        }

        let resp = req.send().await?;

        match resp.status().as_u16() {
            200 => {
                let body = resp.text().await?;
                let page: RawPage = serde_json::from_str(&body)?;
                Ok(page)
            }
            429 => {
                let retry_after = resp
                    .headers()
                    .get("Retry-After")
                    .and_then(|v| v.to_str().ok())
                    .and_then(|s| s.parse::<u64>().ok())
                    .map(Duration::from_secs)
                    .unwrap_or(Duration::from_secs(30));
                Err(NvdError::RateLimited { retry_after })
            }
            s @ 500..=599 => {
                let message = resp
                    .headers()
                    .get("message")
                    .and_then(|v| v.to_str().ok())
                    .unwrap_or("unknown server error")
                    .to_string();
                Err(NvdError::Server { status: s, message })
            }
            s => {
                let message = resp
                    .headers()
                    .get("message")
                    .and_then(|v| v.to_str().ok())
                    .unwrap_or("client error")
                    .to_string();
                Err(NvdError::Client { status: s, message })
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use time::Duration as TimeDuration;
    use wiremock::matchers::{method, path, query_param};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    fn single_cve_page(total: u32, start: u32, count: usize) -> serde_json::Value {
        let vulns: Vec<serde_json::Value> = (0..count)
            .map(|i| {
                serde_json::json!({
                    "cve": {
                        "id": format!("CVE-2026-{:05}", start as usize + i),
                        "published": "2026-01-15T10:00:00.000",
                        "lastModified": "2026-04-01T12:00:00.000",
                        "vulnStatus": "Analyzed",
                        "descriptions": [
                            { "lang": "en", "value": "A test vulnerability." }
                        ],
                        "metrics": {
                            "cvssMetricV31": [
                                {
                                    "source": "nvd@nist.gov",
                                    "type": "Primary",
                                    "cvssData": {
                                        "version": "3.1",
                                        "vectorString": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H",
                                        "baseScore": 9.8,
                                        "baseSeverity": "CRITICAL"
                                    }
                                }
                            ]
                        },
                        "weaknesses": [
                            {
                                "source": "nvd@nist.gov",
                                "type": "Primary",
                                "description": [{ "lang": "en", "value": "CWE-79" }]
                            }
                        ],
                        "references": [
                            { "url": "https://example.com/advisory" }
                        ]
                    }
                })
            })
            .collect();

        serde_json::json!({
            "resultsPerPage": count,
            "startIndex": start,
            "totalResults": total,
            "format": "NVD_CVE",
            "version": "2.0",
            "timestamp": "2026-04-24T00:00:00.000",
            "vulnerabilities": vulns
        })
    }

    fn no_cvss_cve_page() -> serde_json::Value {
        serde_json::json!({
            "resultsPerPage": 1,
            "startIndex": 0,
            "totalResults": 1,
            "format": "NVD_CVE",
            "version": "2.0",
            "timestamp": "2026-04-24T00:00:00.000",
            "vulnerabilities": [
                {
                    "cve": {
                        "id": "CVE-2026-99999",
                        "published": "2026-03-01T00:00:00.000",
                        "lastModified": "2026-04-01T00:00:00.000",
                        "vulnStatus": "Not Scheduled",
                        "descriptions": [
                            { "lang": "en", "value": "No CVSS data." }
                        ],
                        "metrics": {},
                        "weaknesses": [],
                        "references": []
                    }
                }
            ]
        })
    }

    // ------------------------------------------------------------------
    // T2: 200 single page — 1 CVE returned
    // ------------------------------------------------------------------
    #[tokio::test]
    async fn test_fetch_incremental_200_single_page() {
        let mock_server = MockServer::start().await;

        Mock::given(method("GET"))
            .and(path("/"))
            .respond_with(ResponseTemplate::new(200).set_body_json(single_cve_page(1, 0, 1)))
            .mount(&mock_server)
            .await;

        let client = NvdClient::with_base_url(mock_server.uri(), None);
        let since = OffsetDateTime::now_utc() - TimeDuration::days(7);
        let result = client.fetch_incremental(since).await.unwrap();

        assert_eq!(result.len(), 1);
        assert_eq!(result[0].id, "CVE-2026-00000");
        assert_eq!(result[0].base_severity.as_deref(), Some("CRITICAL"));
        assert!((result[0].base_score.unwrap() - 9.8).abs() < f32::EPSILON);
        assert_eq!(result[0].cwes, vec!["CWE-79"]);
        assert_eq!(result[0].references, vec!["https://example.com/advisory"]);
    }

    // ------------------------------------------------------------------
    // T3: 200 paginated — totalResults=2100, two pages
    // ------------------------------------------------------------------
    #[tokio::test]
    async fn test_fetch_incremental_200_paginated() {
        let mock_server = MockServer::start().await;

        // Page 1: startIndex=0, 2000 items
        Mock::given(method("GET"))
            .and(path("/"))
            .and(query_param("startIndex", "0"))
            .respond_with(ResponseTemplate::new(200).set_body_json(single_cve_page(2100, 0, 2000)))
            .mount(&mock_server)
            .await;

        // Page 2: startIndex=2000, 100 items
        Mock::given(method("GET"))
            .and(path("/"))
            .and(query_param("startIndex", "2000"))
            .respond_with(
                ResponseTemplate::new(200).set_body_json(single_cve_page(2100, 2000, 100)),
            )
            .mount(&mock_server)
            .await;

        let client = NvdClient::with_base_url(mock_server.uri(), None);
        let since = OffsetDateTime::now_utc() - TimeDuration::days(7);
        let result = client.fetch_incremental(since).await.unwrap();

        assert_eq!(result.len(), 2100);
    }

    // ------------------------------------------------------------------
    // T4: 429 → NvdError::RateLimited with Retry-After=30
    // ------------------------------------------------------------------
    #[tokio::test]
    async fn test_fetch_incremental_429_returns_rate_limited() {
        let mock_server = MockServer::start().await;

        Mock::given(method("GET"))
            .and(path("/"))
            .respond_with(ResponseTemplate::new(429).insert_header("Retry-After", "30"))
            .mount(&mock_server)
            .await;

        let client = NvdClient::with_base_url(mock_server.uri(), None);
        let since = OffsetDateTime::now_utc() - TimeDuration::days(7);
        let err = client.fetch_incremental(since).await.unwrap_err();

        match err {
            NvdError::RateLimited { retry_after } => {
                assert_eq!(retry_after, Duration::from_secs(30));
            }
            other => panic!("expected RateLimited, got: {other:?}"),
        }
    }

    // ------------------------------------------------------------------
    // T5: 503 → NvdError::Server { status: 503 }
    // ------------------------------------------------------------------
    #[tokio::test]
    async fn test_fetch_incremental_503_returns_server() {
        let mock_server = MockServer::start().await;

        Mock::given(method("GET"))
            .and(path("/"))
            .respond_with(ResponseTemplate::new(503))
            .mount(&mock_server)
            .await;

        let client = NvdClient::with_base_url(mock_server.uri(), None);
        let since = OffsetDateTime::now_utc() - TimeDuration::days(7);
        let err = client.fetch_incremental(since).await.unwrap_err();

        match err {
            NvdError::Server { status, .. } => {
                assert_eq!(status, 503);
            }
            other => panic!("expected Server, got: {other:?}"),
        }
    }

    // ------------------------------------------------------------------
    // T6: since > 120 days ago → RangeTooLarge (no HTTP call)
    // ------------------------------------------------------------------
    #[tokio::test]
    async fn test_fetch_incremental_range_too_large_returns_error() {
        // No mock server needed — error is returned before any HTTP call.
        let client = NvdClient::with_base_url("http://127.0.0.1:1", None);
        let since = OffsetDateTime::now_utc() - TimeDuration::days(121);
        let err = client.fetch_incremental(since).await.unwrap_err();

        match err {
            NvdError::RangeTooLarge { days } => {
                assert!(days >= 121, "expected days >= 121, got {days}");
            }
            other => panic!("expected RangeTooLarge, got: {other:?}"),
        }
    }

    // ------------------------------------------------------------------
    // T7: cvssMetricV31 absent → base_severity / base_score = None
    // ------------------------------------------------------------------
    #[tokio::test]
    async fn test_cvss_metric_v31_optional_parse() {
        let mock_server = MockServer::start().await;

        Mock::given(method("GET"))
            .and(path("/"))
            .respond_with(ResponseTemplate::new(200).set_body_json(no_cvss_cve_page()))
            .mount(&mock_server)
            .await;

        let client = NvdClient::with_base_url(mock_server.uri(), None);
        let since = OffsetDateTime::now_utc() - TimeDuration::days(7);
        let result = client.fetch_incremental(since).await.unwrap();

        assert_eq!(result.len(), 1);
        assert_eq!(result[0].id, "CVE-2026-99999");
        assert!(result[0].base_severity.is_none());
        assert!(result[0].base_score.is_none());
        assert_eq!(result[0].vuln_status, "Not Scheduled");
    }
}
