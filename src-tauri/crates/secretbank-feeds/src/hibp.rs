use std::num::NonZeroU32;
use std::sync::Arc;
use std::time::Duration;

use governor::{DefaultDirectRateLimiter, Quota, RateLimiter};
use time::format_description::well_known::Rfc3339;
use time::OffsetDateTime;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/// A single breach entry returned by the HIBP v3 `breachedaccount` endpoint.
///
/// All fields use PascalCase JSON keys (`#[serde(rename_all = "PascalCase")]`).
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq)]
pub struct HibpBreach {
    pub name: String,
    pub title: String,
    pub domain: String,
    /// "YYYY-MM-DD" — date only, kept as String to avoid time-zone ambiguity.
    pub breach_date: String,
    pub added_date: OffsetDateTime,
    pub modified_date: OffsetDateTime,
    pub pwn_count: u64,
    pub description: String,
    pub data_classes: Vec<String>,
    pub is_verified: bool,
    pub is_fabricated: bool,
    pub is_sensitive: bool,
    pub is_retired: bool,
    pub is_spam_list: bool,
    pub is_malware: bool,
    pub is_subscription_free: bool,
    /// Present in newer breach records; absent in older ones — use Option.
    pub is_stealer_log: Option<bool>,
    pub logo_path: Option<String>,
    /// Attribution text requested by some data providers (nullable).
    pub attribution: Option<String>,
    /// Public disclosure URL, when available (nullable).
    pub disclosure_url: Option<String>,
}

// ---------------------------------------------------------------------------
// Error model
// ---------------------------------------------------------------------------

#[derive(Debug, thiserror::Error)]
pub enum HibpError {
    #[error("HTTP request failed: {0}")]
    Http(#[from] reqwest::Error),

    #[error("HIBP rate limited, retry after {retry_after:?}")]
    RateLimited { retry_after: Duration },

    #[error("HIBP unauthorized (invalid or missing api key)")]
    Unauthorized,

    #[error("HIBP forbidden (missing User-Agent)")]
    Forbidden,

    #[error("HIBP bad request: {0}")]
    BadRequest(String),

    #[error("HIBP server error (status {status})")]
    Server { status: u16 },

    #[error("Failed to decode HIBP response: {0}")]
    Decode(#[from] serde_json::Error),

    #[error("Failed to parse HIBP timestamp: {0}")]
    ParseTime(#[from] time::error::Parse),
}

// ---------------------------------------------------------------------------
// Raw (private) deserialization type
// ---------------------------------------------------------------------------

/// Internal struct that mirrors the HIBP JSON payload.
/// `added_date` / `modified_date` are kept as `String` so we can parse them
/// manually with `time::OffsetDateTime::parse` and surface a typed error.
#[derive(serde::Deserialize)]
#[serde(rename_all = "PascalCase")]
struct RawBreach {
    name: String,
    title: String,
    domain: String,
    breach_date: String,
    added_date: String,
    modified_date: String,
    pwn_count: u64,
    description: String,
    data_classes: Vec<String>,
    is_verified: bool,
    is_fabricated: bool,
    is_sensitive: bool,
    is_retired: bool,
    is_spam_list: bool,
    is_malware: bool,
    is_subscription_free: bool,
    is_stealer_log: Option<bool>,
    logo_path: Option<String>,
    attribution: Option<String>,
    disclosure_url: Option<String>,
}

// ---------------------------------------------------------------------------
// Map raw → public
// ---------------------------------------------------------------------------

fn raw_to_breach(raw: RawBreach) -> Result<HibpBreach, HibpError> {
    let added_date = OffsetDateTime::parse(&raw.added_date, &Rfc3339)?;
    let modified_date = OffsetDateTime::parse(&raw.modified_date, &Rfc3339)?;
    Ok(HibpBreach {
        name: raw.name,
        title: raw.title,
        domain: raw.domain,
        breach_date: raw.breach_date,
        added_date,
        modified_date,
        pwn_count: raw.pwn_count,
        description: raw.description,
        data_classes: raw.data_classes,
        is_verified: raw.is_verified,
        is_fabricated: raw.is_fabricated,
        is_sensitive: raw.is_sensitive,
        is_retired: raw.is_retired,
        is_spam_list: raw.is_spam_list,
        is_malware: raw.is_malware,
        is_subscription_free: raw.is_subscription_free,
        is_stealer_log: raw.is_stealer_log,
        logo_path: raw.logo_path,
        attribution: raw.attribution,
        disclosure_url: raw.disclosure_url,
    })
}

// ---------------------------------------------------------------------------
// Rate limiter factory
// ---------------------------------------------------------------------------

fn build_limiter() -> Arc<DefaultDirectRateLimiter> {
    // Core 1 tier: 10 requests per minute (most conservative HIBP plan).
    let quota = Quota::per_minute(NonZeroU32::new(10).expect("10 > 0"));
    Arc::new(RateLimiter::direct(quota))
}

// ---------------------------------------------------------------------------
// HibpClient
// ---------------------------------------------------------------------------

const HIBP_BASE_URL: &str = "https://haveibeenpwned.com/api/v3";

/// HIBP v3 client for the `breachedaccount` endpoint.
///
/// # Authentication
/// - `api_key` — required; send via `hibp-api-key` header.
/// - `User-Agent` — set globally on the `reqwest::Client`; absence returns 403.
///
/// # Rate limiting
/// Built-in governor limiter (Core 1 tier: 10 RPM).
pub struct HibpClient {
    http: reqwest::Client,
    /// Full base URL (without trailing slash) — default: `https://haveibeenpwned.com/api/v3`
    base_url: String,
    api_key: String,
    limiter: Arc<DefaultDirectRateLimiter>,
}

impl HibpClient {
    /// Create a client pointing at the official HIBP v3 endpoint.
    /// `User-Agent` defaults to `"secretbank/0.1.0"`.
    pub fn new(api_key: String) -> Self {
        Self::with_base_url(HIBP_BASE_URL, api_key)
    }

    /// Create a client with an overridden base URL (used in tests).
    #[doc(hidden)]
    pub fn with_base_url(base_url: impl Into<String>, api_key: impl Into<String>) -> Self {
        let http = reqwest::Client::builder()
            .user_agent("secretbank/0.1.0")
            .build()
            .expect("reqwest client build never fails with these options");
        Self {
            http,
            base_url: base_url.into(),
            api_key: api_key.into(),
            limiter: build_limiter(),
        }
    }

    /// Query the HIBP `/breaches` endpoint.
    ///
    /// Returns the global breach catalog (~800+ entries) — no email required.
    /// `hibp-api-key` is sent for consistency even though the endpoint is publicly accessible.
    pub async fn list_breaches(&self) -> Result<Vec<HibpBreach>, HibpError> {
        self.limiter.until_ready().await;

        let url = format!("{}/breaches", self.base_url);

        let resp = self
            .http
            .get(&url)
            .header("hibp-api-key", &self.api_key)
            .send()
            .await?;

        match resp.status().as_u16() {
            200 => {
                let body = resp.bytes().await?;
                let raws: Vec<RawBreach> = serde_json::from_slice(&body)?;
                let breaches: Result<Vec<_>, _> = raws.into_iter().map(raw_to_breach).collect();
                Ok(breaches?)
            }
            401 => Err(HibpError::Unauthorized),
            403 => Err(HibpError::Forbidden),
            429 => {
                let retry_after = resp
                    .headers()
                    .get("retry-after")
                    .and_then(|v| v.to_str().ok())
                    .and_then(|s| s.parse::<u64>().ok())
                    .map(Duration::from_secs)
                    .unwrap_or(Duration::from_secs(60));
                Err(HibpError::RateLimited { retry_after })
            }
            s if (500..=599).contains(&s) => Err(HibpError::Server { status: s }),
            s => Err(HibpError::BadRequest(format!("unexpected status {s}"))),
        }
    }

    /// Query the HIBP `breachedaccount/{email}` endpoint.
    ///
    /// Returns `Ok(Vec::new())` when the email has **no** known breaches (HTTP 404).
    /// This is intentional: 404 is a normal "clean" response from HIBP, not an error.
    pub async fn check_email(&self, email: &str) -> Result<Vec<HibpBreach>, HibpError> {
        self.limiter.until_ready().await;

        let encoded = urlencoding::encode(email);
        let url = format!("{}/breachedaccount/{}", self.base_url, encoded);

        let resp = self
            .http
            .get(&url)
            .header("hibp-api-key", &self.api_key)
            .query(&[("truncateResponse", "false")])
            .send()
            .await?;

        match resp.status().as_u16() {
            200 => {
                let body = resp.bytes().await?;
                let raws: Vec<RawBreach> = serde_json::from_slice(&body)?;
                let breaches: Result<Vec<_>, _> = raws.into_iter().map(raw_to_breach).collect();
                Ok(breaches?)
            }
            // 404 = "no breaches found" — this is a normal, non-error response.
            404 => Ok(Vec::new()),
            401 => Err(HibpError::Unauthorized),
            403 => Err(HibpError::Forbidden),
            400 => {
                let msg = resp.text().await.unwrap_or_default();
                Err(HibpError::BadRequest(msg))
            }
            429 => {
                let retry_after = resp
                    .headers()
                    .get("retry-after")
                    .and_then(|v| v.to_str().ok())
                    .and_then(|s| s.parse::<u64>().ok())
                    .map(Duration::from_secs)
                    .unwrap_or(Duration::from_secs(60));
                Err(HibpError::RateLimited { retry_after })
            }
            s if (500..=599).contains(&s) => Err(HibpError::Server { status: s }),
            s => Err(HibpError::BadRequest(format!("unexpected status {s}"))),
        }
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use wiremock::matchers::{header, method, path, query_param};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    fn make_breach(name: &str) -> serde_json::Value {
        serde_json::json!({
            "Name": name,
            "Title": name,
            "Domain": "example.com",
            "BreachDate": "2023-01-01",
            "AddedDate": "2023-06-15T20:40:48Z",
            "ModifiedDate": "2024-03-04T02:06:27Z",
            "PwnCount": 100_000u64,
            "Description": "Test breach description.",
            "DataClasses": ["Email addresses", "Passwords"],
            "IsVerified": true,
            "IsFabricated": false,
            "IsSensitive": false,
            "IsRetired": false,
            "IsSpamList": false,
            "IsMalware": false,
            "IsSubscriptionFree": false,
            "IsStealerLog": false,
            "LogoPath": "https://logos.haveibeenpwned.com/Test.png",
            "Attribution": null,
            "DisclosureUrl": null
        })
    }

    // ------------------------------------------------------------------
    // T1: 200 → Vec<HibpBreach> 2개
    // ------------------------------------------------------------------

    #[tokio::test]
    async fn test_check_email_200_returns_breaches() {
        let mock_server = MockServer::start().await;

        Mock::given(method("GET"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!([
                make_breach("Adobe"),
                make_breach("LinkedIn"),
            ])))
            .mount(&mock_server)
            .await;

        let client = HibpClient::with_base_url(mock_server.uri(), "test-key");
        let result = client.check_email("user@example.com").await.unwrap();

        assert_eq!(result.len(), 2);
        assert_eq!(result[0].name, "Adobe");
        assert_eq!(result[1].name, "LinkedIn");
        assert_eq!(result[0].pwn_count, 100_000);
        assert_eq!(result[0].data_classes, vec!["Email addresses", "Passwords"]);
        assert!(result[0].attribution.is_none());
        assert!(result[0].disclosure_url.is_none());
    }

    // ------------------------------------------------------------------
    // T2: 404 → Ok(vec![])  (핵심 semantics)
    // ------------------------------------------------------------------

    #[tokio::test]
    async fn test_check_email_404_returns_empty() {
        let mock_server = MockServer::start().await;

        Mock::given(method("GET"))
            .respond_with(ResponseTemplate::new(404))
            .mount(&mock_server)
            .await;

        let client = HibpClient::with_base_url(mock_server.uri(), "test-key");
        let result = client.check_email("clean@example.com").await.unwrap();

        assert!(result.is_empty(), "404 must return Ok(empty), not Err");
    }

    // ------------------------------------------------------------------
    // T3: 401 → HibpError::Unauthorized
    // ------------------------------------------------------------------

    #[tokio::test]
    async fn test_check_email_401_returns_unauthorized() {
        let mock_server = MockServer::start().await;

        Mock::given(method("GET"))
            .respond_with(ResponseTemplate::new(401))
            .mount(&mock_server)
            .await;

        let client = HibpClient::with_base_url(mock_server.uri(), "bad-key");
        let err = client.check_email("user@example.com").await.unwrap_err();

        assert!(
            matches!(err, HibpError::Unauthorized),
            "expected Unauthorized, got: {err:?}"
        );
    }

    // ------------------------------------------------------------------
    // T4: 403 → HibpError::Forbidden
    // ------------------------------------------------------------------

    #[tokio::test]
    async fn test_check_email_403_returns_forbidden() {
        let mock_server = MockServer::start().await;

        Mock::given(method("GET"))
            .respond_with(ResponseTemplate::new(403))
            .mount(&mock_server)
            .await;

        let client = HibpClient::with_base_url(mock_server.uri(), "test-key");
        let err = client.check_email("user@example.com").await.unwrap_err();

        assert!(
            matches!(err, HibpError::Forbidden),
            "expected Forbidden, got: {err:?}"
        );
    }

    // ------------------------------------------------------------------
    // T5: 429 + retry-after:60 → HibpError::RateLimited { 60s }
    // ------------------------------------------------------------------

    #[tokio::test]
    async fn test_check_email_429_returns_rate_limited_with_retry_after() {
        let mock_server = MockServer::start().await;

        Mock::given(method("GET"))
            .respond_with(ResponseTemplate::new(429).insert_header("retry-after", "60"))
            .mount(&mock_server)
            .await;

        let client = HibpClient::with_base_url(mock_server.uri(), "test-key");
        let err = client.check_email("user@example.com").await.unwrap_err();

        match err {
            HibpError::RateLimited { retry_after } => {
                assert_eq!(retry_after, Duration::from_secs(60));
            }
            other => panic!("expected RateLimited, got: {other:?}"),
        }
    }

    // ------------------------------------------------------------------
    // T6: 503 → HibpError::Server { status: 503 }
    // ------------------------------------------------------------------

    #[tokio::test]
    async fn test_check_email_503_returns_server() {
        let mock_server = MockServer::start().await;

        Mock::given(method("GET"))
            .respond_with(ResponseTemplate::new(503))
            .mount(&mock_server)
            .await;

        let client = HibpClient::with_base_url(mock_server.uri(), "test-key");
        let err = client.check_email("user@example.com").await.unwrap_err();

        match err {
            HibpError::Server { status } => assert_eq!(status, 503),
            other => panic!("expected Server, got: {other:?}"),
        }
    }

    // ------------------------------------------------------------------
    // T7: hibp-api-key 헤더 전송 검증
    // ------------------------------------------------------------------

    #[tokio::test]
    async fn test_check_email_sends_hibp_api_key_header() {
        let mock_server = MockServer::start().await;

        Mock::given(method("GET"))
            .and(header("hibp-api-key", "my-key-123"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!([])))
            .mount(&mock_server)
            .await;

        let client = HibpClient::with_base_url(mock_server.uri(), "my-key-123");
        // 잘못된 키이면 mock이 매치 실패 → 404 반환 → empty vec
        // 올바른 키이면 mock 매치 → 200 + empty body → Ok([])
        let result = client.check_email("user@example.com").await.unwrap();
        assert!(result.is_empty());
    }

    // ------------------------------------------------------------------
    // T8: truncateResponse=false 쿼리 파라미터 검증
    // ------------------------------------------------------------------

    #[tokio::test]
    async fn test_check_email_sends_truncate_false_query() {
        let mock_server = MockServer::start().await;

        Mock::given(method("GET"))
            .and(query_param("truncateResponse", "false"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!([])))
            .mount(&mock_server)
            .await;

        let client = HibpClient::with_base_url(mock_server.uri(), "test-key");
        let result = client.check_email("user@example.com").await.unwrap();
        assert!(result.is_empty());
    }

    // ------------------------------------------------------------------
    // T9: email URL 인코딩 검증
    //     "user+test@example.com" → path /breachedaccount/user%2Btest%40example.com
    // ------------------------------------------------------------------

    #[tokio::test]
    async fn test_check_email_url_encodes_email() {
        let mock_server = MockServer::start().await;

        Mock::given(method("GET"))
            .and(path("/breachedaccount/user%2Btest%40example.com"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!([])))
            .mount(&mock_server)
            .await;

        let client = HibpClient::with_base_url(mock_server.uri(), "test-key");
        // 인코딩이 올바르면 mock 매치 → 200 반환
        let result = client.check_email("user+test@example.com").await.unwrap();
        assert!(result.is_empty());
    }

    // ------------------------------------------------------------------
    // T10: Attribution / DisclosureUrl null → Option::None
    // ------------------------------------------------------------------

    #[tokio::test]
    async fn test_check_email_optional_fields_null() {
        let mock_server = MockServer::start().await;

        let body = serde_json::json!([{
            "Name": "NullFields",
            "Title": "Null Fields Test",
            "Domain": "",
            "BreachDate": "2024-07-18",
            "AddedDate": "2024-08-01T05:38:53Z",
            "ModifiedDate": "2025-03-04T02:06:27Z",
            "PwnCount": 26_105_473u64,
            "Description": "Test with nullable fields.",
            "DataClasses": ["Email addresses"],
            "IsVerified": true,
            "IsFabricated": false,
            "IsSensitive": false,
            "IsRetired": false,
            "IsSpamList": false,
            "IsMalware": false,
            "IsSubscriptionFree": false,
            "IsStealerLog": true,
            "LogoPath": "https://logos.haveibeenpwned.com/List.png",
            "Attribution": null,
            "DisclosureUrl": null
        }]);

        Mock::given(method("GET"))
            .respond_with(ResponseTemplate::new(200).set_body_json(body))
            .mount(&mock_server)
            .await;

        let client = HibpClient::with_base_url(mock_server.uri(), "test-key");
        let result = client.check_email("user@example.com").await.unwrap();

        assert_eq!(result.len(), 1);
        assert!(result[0].attribution.is_none(), "attribution must be None");
        assert!(
            result[0].disclosure_url.is_none(),
            "disclosure_url must be None"
        );
        assert_eq!(result[0].is_stealer_log, Some(true));
        assert_eq!(result[0].pwn_count, 26_105_473);
    }

    // ------------------------------------------------------------------
    // T11: list_breaches 200 → Vec<HibpBreach> 2개
    // ------------------------------------------------------------------

    #[tokio::test]
    async fn test_list_breaches_200_returns_breaches() {
        let mock_server = MockServer::start().await;

        Mock::given(method("GET"))
            .and(path("/breaches"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!([
                make_breach("Adobe"),
                make_breach("LinkedIn"),
            ])))
            .mount(&mock_server)
            .await;

        let client = HibpClient::with_base_url(mock_server.uri(), "test-key");
        let result = client.list_breaches().await.unwrap();

        assert_eq!(result.len(), 2);
        assert_eq!(result[0].name, "Adobe");
        assert_eq!(result[0].pwn_count, 100_000);
        assert!(result[0].attribution.is_none());
    }

    // ------------------------------------------------------------------
    // T12: list_breaches 200 + 빈 배열 → Ok(vec![])
    // ------------------------------------------------------------------

    #[tokio::test]
    async fn test_list_breaches_200_empty_array() {
        let mock_server = MockServer::start().await;

        Mock::given(method("GET"))
            .and(path("/breaches"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!([])))
            .mount(&mock_server)
            .await;

        let client = HibpClient::with_base_url(mock_server.uri(), "test-key");
        let result = client.list_breaches().await.unwrap();

        assert!(result.is_empty());
    }

    // ------------------------------------------------------------------
    // T13: list_breaches 401 → HibpError::Unauthorized
    // ------------------------------------------------------------------

    #[tokio::test]
    async fn test_list_breaches_401_returns_unauthorized() {
        let mock_server = MockServer::start().await;

        Mock::given(method("GET"))
            .and(path("/breaches"))
            .respond_with(ResponseTemplate::new(401))
            .mount(&mock_server)
            .await;

        let client = HibpClient::with_base_url(mock_server.uri(), "bad-key");
        let err = client.list_breaches().await.unwrap_err();

        assert!(
            matches!(err, HibpError::Unauthorized),
            "expected Unauthorized, got: {err:?}"
        );
    }

    // ------------------------------------------------------------------
    // T14: list_breaches 429 + retry-after:120 → HibpError::RateLimited { 120s }
    // ------------------------------------------------------------------

    #[tokio::test]
    async fn test_list_breaches_429_returns_rate_limited() {
        let mock_server = MockServer::start().await;

        Mock::given(method("GET"))
            .and(path("/breaches"))
            .respond_with(ResponseTemplate::new(429).insert_header("retry-after", "120"))
            .mount(&mock_server)
            .await;

        let client = HibpClient::with_base_url(mock_server.uri(), "test-key");
        let err = client.list_breaches().await.unwrap_err();

        match err {
            HibpError::RateLimited { retry_after } => {
                assert_eq!(retry_after, Duration::from_secs(120));
            }
            other => panic!("expected RateLimited, got: {other:?}"),
        }
    }

    // ------------------------------------------------------------------
    // T15: list_breaches 503 → HibpError::Server { status: 503 }
    // ------------------------------------------------------------------

    #[tokio::test]
    async fn test_list_breaches_503_returns_server() {
        let mock_server = MockServer::start().await;

        Mock::given(method("GET"))
            .and(path("/breaches"))
            .respond_with(ResponseTemplate::new(503))
            .mount(&mock_server)
            .await;

        let client = HibpClient::with_base_url(mock_server.uri(), "test-key");
        let err = client.list_breaches().await.unwrap_err();

        match err {
            HibpError::Server { status } => assert_eq!(status, 503),
            other => panic!("expected Server, got: {other:?}"),
        }
    }
}
