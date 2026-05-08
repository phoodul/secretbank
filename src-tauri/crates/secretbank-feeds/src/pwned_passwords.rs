//! HIBP Pwned Passwords API v3 k-anonymity range lookup client.
//!
//! # Privacy model (k-anonymity)
//! Only the first 5 hex characters of the SHA-1 hash are sent to the server.
//! The full hash **never** leaves the device.
//!
//! # Security notes
//! - Password plaintext is accessed through `SecretBox::expose_secret()` inside
//!   a minimal scope; the borrow is released as soon as the SHA-1 block exits.
//! - Suffix comparison uses `subtle::ConstantTimeEq` to avoid timing side-channels.
//! - Malformed response lines (suffix length ≠ 35) are silently skipped — no panic.

use secrecy::{ExposeSecret, SecretBox};
use sha1::{Digest, Sha1};
use subtle::ConstantTimeEq;

// ---------------------------------------------------------------------------
// Error model
// ---------------------------------------------------------------------------

/// Errors produced by [`PwnedPasswordsClient`].
///
/// Error messages are intentionally generic — no URL or credential details
/// are included (B.1-9).
#[derive(Debug, thiserror::Error)]
pub enum PwnedError {
    #[error("HTTP request failed")]
    Http(#[from] reqwest::Error),

    #[error("invalid HIBP response")]
    InvalidResponse,
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

const PWNED_BASE_URL: &str = "https://api.pwnedpasswords.com";

/// HIBP Pwned Passwords v3 client.
///
/// Uses the k-anonymity range endpoint — the plaintext password never leaves
/// the device. Only the first 5 hex characters of the SHA-1 hash are sent.
pub struct PwnedPasswordsClient {
    base_url: String,
    http: reqwest::Client,
}

impl PwnedPasswordsClient {
    /// Create a client pointing at the official HIBP Pwned Passwords endpoint.
    pub fn new() -> Self {
        let http = reqwest::Client::builder()
            .user_agent("secretbank/0.1.0")
            .build()
            .expect("reqwest client build never fails with these options");
        Self {
            base_url: PWNED_BASE_URL.to_string(),
            http,
        }
    }

    /// Create a client with an overridden base URL (used in tests).
    #[doc(hidden)]
    pub fn with_base_url(base_url: impl Into<String>, http: reqwest::Client) -> Self {
        Self {
            base_url: base_url.into(),
            http,
        }
    }

    /// Check whether a password has been seen in a known data breach.
    ///
    /// Returns the **exposure count** (number of times the password appeared
    /// in breached datasets), or `0` if the password was not found.
    ///
    /// # Privacy
    /// Only a 5-character SHA-1 prefix is sent to the server. The server
    /// returns all hashes with that prefix (padded to ~800–1000 lines);
    /// matching is performed locally using constant-time comparison.
    ///
    /// # Errors
    /// Returns [`PwnedError::Http`] if the network request fails or the server
    /// responds with a non-200 status code.
    pub async fn check_password(&self, password: &SecretBox<String>) -> Result<u64, PwnedError> {
        // B.1-2: expose_secret() scope is minimised to this block.
        // The plaintext borrow is released when the block exits.
        let (prefix, suffix) = {
            let plain = password.expose_secret();
            let mut hasher = Sha1::new();
            hasher.update(plain.as_bytes());
            let hash = hasher.finalize(); // [u8; 20]
            let hex: String = hash.iter().map(|b| format!("{:02X}", b)).collect();
            let prefix = hex[0..5].to_string();
            let suffix = hex[5..].to_string(); // 35 chars
            (prefix, suffix)
            // plaintext released here
        };

        let url = format!("{}/range/{}", self.base_url, prefix);

        let resp = self
            .http
            .get(&url)
            .header("Add-Padding", "true")
            .send()
            .await?;

        if resp.status() != reqwest::StatusCode::OK {
            return Err(PwnedError::Http(
                resp.error_for_status()
                    .expect_err("status is not OK, error_for_status must return Err"),
            ));
        }

        let body = resp.text().await?;
        let count = parse_range_response(&body, &suffix);
        Ok(count)
    }
}

impl Default for PwnedPasswordsClient {
    fn default() -> Self {
        Self::new()
    }
}

// ---------------------------------------------------------------------------
// Response parsing
// ---------------------------------------------------------------------------

/// Parse the `/range/<prefix>` response body and return the exposure count
/// for the given `suffix` (35-character uppercase hex string).
///
/// Lines that are malformed (suffix length ≠ 35, missing colon, non-numeric
/// count) are silently skipped — no panic, no error (B.1-4 fuzz-safe).
///
/// Padding lines (count == 0) are also skipped.
///
/// Suffix comparison uses `subtle::ConstantTimeEq` to avoid timing
/// side-channels (B.1-10).
fn parse_range_response(body: &str, suffix: &str) -> u64 {
    let suffix_bytes = suffix.as_bytes();

    for line in body.lines() {
        // Split on first ':' only; malformed lines (no ':') are skipped.
        let mut parts = line.splitn(2, ':');
        let line_suffix = match parts.next() {
            Some(s) => s,
            None => continue,
        };
        let count_str = match parts.next() {
            Some(c) => c,
            None => continue,
        };

        // B.1-4: skip guard — suffix must be exactly 35 characters.
        if line_suffix.len() != 35 {
            continue;
        }

        // Parse count; padding lines (count == 0) are skipped.
        let count: u64 = count_str.trim().parse().unwrap_or(0);
        if count == 0 {
            continue;
        }

        // B.1-10: constant-time comparison to avoid timing side-channels.
        let matched: bool = suffix_bytes.ct_eq(line_suffix.as_bytes()).into();
        if matched {
            return count;
        }
    }

    0
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use wiremock::matchers::{header, method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    // ------------------------------------------------------------------
    // Helper: build a minimal range response body
    // ------------------------------------------------------------------

    /// Construct a synthetic HIBP `/range` response.
    ///
    /// `entries`: list of (suffix_35, count) pairs.
    fn range_body(entries: &[(&str, u64)]) -> String {
        entries
            .iter()
            .map(|(s, c)| format!("{}:{}", s, c))
            .collect::<Vec<_>>()
            .join("\r\n")
    }

    // The SHA-1 of "password" is 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8
    // prefix = "5BAA6", suffix = "1E4C9B93F3F0682250B6CF8331B7EE68FD8"
    const PASSWORD_PREFIX: &str = "5BAA6";
    const PASSWORD_SUFFIX: &str = "1E4C9B93F3F0682250B6CF8331B7EE68FD8";

    fn make_client(server: &MockServer) -> PwnedPasswordsClient {
        let http = reqwest::Client::builder()
            .user_agent("secretbank/0.1.0")
            .build()
            .unwrap();
        PwnedPasswordsClient::with_base_url(server.uri(), http)
    }

    // ------------------------------------------------------------------
    // T1: 발견된 suffix → count 반환
    // ------------------------------------------------------------------

    #[tokio::test]
    async fn t1_found_suffix_returns_count() {
        let mock_server = MockServer::start().await;

        let body = range_body(&[
            ("0018A45C4D1DEF81644B54AB7F969B88D65", 3),
            (PASSWORD_SUFFIX, 9_545_824),
            ("011053FD0102E94D6AE2F8B83D76FAF94F6", 17),
        ]);

        Mock::given(method("GET"))
            .respond_with(ResponseTemplate::new(200).set_body_string(body))
            .mount(&mock_server)
            .await;

        let client = make_client(&mock_server);
        let pw: SecretBox<String> = SecretBox::new(Box::new("password".to_string()));
        let count = client.check_password(&pw).await.unwrap();

        assert_eq!(count, 9_545_824, "should return exact breach count");
    }

    // ------------------------------------------------------------------
    // T2: 미발견 → 0 반환
    // ------------------------------------------------------------------

    #[tokio::test]
    async fn t2_not_found_returns_zero() {
        let mock_server = MockServer::start().await;

        // Response does not contain the suffix for "password"
        let body = range_body(&[
            ("0018A45C4D1DEF81644B54AB7F969B88D65", 3),
            ("011053FD0102E94D6AE2F8B83D76FAF94F6", 17),
        ]);

        Mock::given(method("GET"))
            .respond_with(ResponseTemplate::new(200).set_body_string(body))
            .mount(&mock_server)
            .await;

        let client = make_client(&mock_server);
        let pw: SecretBox<String> = SecretBox::new(Box::new("password".to_string()));
        let count = client.check_password(&pw).await.unwrap();

        assert_eq!(count, 0, "unfound password must return 0");
    }

    // ------------------------------------------------------------------
    // T3: padding 행 (count=0) → skip
    // ------------------------------------------------------------------

    #[tokio::test]
    async fn t3_padding_lines_skipped() {
        let mock_server = MockServer::start().await;

        // The suffix for "password" is present but with count=0 (padding line)
        let body = range_body(&[
            ("0018A45C4D1DEF81644B54AB7F969B88D65", 3),
            (PASSWORD_SUFFIX, 0), // padding line — must be skipped
            ("011053FD0102E94D6AE2F8B83D76FAF94F6", 17),
        ]);

        Mock::given(method("GET"))
            .respond_with(ResponseTemplate::new(200).set_body_string(body))
            .mount(&mock_server)
            .await;

        let client = make_client(&mock_server);
        let pw: SecretBox<String> = SecretBox::new(Box::new("password".to_string()));
        let count = client.check_password(&pw).await.unwrap();

        assert_eq!(
            count, 0,
            "padding lines (count=0) must be treated as not found"
        );
    }

    // ------------------------------------------------------------------
    // T4: Add-Padding: true 헤더 전송 확인
    // ------------------------------------------------------------------

    #[tokio::test]
    async fn t4_add_padding_header_sent() {
        let mock_server = MockServer::start().await;

        Mock::given(method("GET"))
            .and(header("Add-Padding", "true"))
            .respond_with(ResponseTemplate::new(200).set_body_string(range_body(&[])))
            .mount(&mock_server)
            .await;

        let client = make_client(&mock_server);
        let pw: SecretBox<String> = SecretBox::new(Box::new("password".to_string()));
        // Mock only responds 200 if the header matches; otherwise wiremock returns 404
        let result = client.check_password(&pw).await;

        // If the header was NOT sent, wiremock returns 404 → Http error
        assert!(
            result.is_ok(),
            "Add-Padding: true must be sent; got: {:?}",
            result.err()
        );
    }

    // ------------------------------------------------------------------
    // T5: prefix 5자 대문자 hex 전송 확인 (e.g., "5BAA6")
    // ------------------------------------------------------------------

    #[tokio::test]
    async fn t5_prefix_five_uppercase_hex_in_path() {
        let mock_server = MockServer::start().await;

        let expected_path = format!("/range/{}", PASSWORD_PREFIX);

        Mock::given(method("GET"))
            .and(path(expected_path))
            .respond_with(ResponseTemplate::new(200).set_body_string(range_body(&[])))
            .mount(&mock_server)
            .await;

        let client = make_client(&mock_server);
        let pw: SecretBox<String> = SecretBox::new(Box::new("password".to_string()));
        let result = client.check_password(&pw).await;

        // If the path did not match, wiremock returns 404 → Http error
        assert!(
            result.is_ok(),
            "prefix must be 5 uppercase hex chars in path; got: {:?}",
            result.err()
        );
    }

    // ------------------------------------------------------------------
    // T6: 응답에 비정상 행 (suffix 길이 ≠ 35) 포함 시 panic 없음
    // ------------------------------------------------------------------

    #[tokio::test]
    async fn t6_malformed_lines_skipped_no_panic() {
        let mock_server = MockServer::start().await;

        // Mix of malformed and normal lines
        let body = [
            "0018A45C4D1DEF81644B54AB7F969B88D65:1",
            "SHORT:5",                                     // too short — skip
            "TOOLONGLINE123456789012345678901234567890:3", // too long — skip
            ":missing_suffix",                             // no suffix — skip
            "no_colon_at_all",                             // no colon — skip
            &format!("{}:{}", PASSWORD_SUFFIX, 42),        // valid match
        ]
        .join("\r\n");

        Mock::given(method("GET"))
            .respond_with(ResponseTemplate::new(200).set_body_string(body))
            .mount(&mock_server)
            .await;

        let client = make_client(&mock_server);
        let pw: SecretBox<String> = SecretBox::new(Box::new("password".to_string()));

        // Must not panic; must still find the valid match
        let count = client.check_password(&pw).await.unwrap();
        assert_eq!(count, 42, "valid line after malformed lines must be found");
    }

    // ------------------------------------------------------------------
    // T7: 500 에러 → Err(Http)
    // ------------------------------------------------------------------

    #[tokio::test]
    async fn t7_server_error_returns_http_error() {
        let mock_server = MockServer::start().await;

        Mock::given(method("GET"))
            .respond_with(ResponseTemplate::new(500))
            .mount(&mock_server)
            .await;

        let client = make_client(&mock_server);
        let pw: SecretBox<String> = SecretBox::new(Box::new("password".to_string()));
        let err = client.check_password(&pw).await.unwrap_err();

        assert!(
            matches!(err, PwnedError::Http(_)),
            "500 response must produce PwnedError::Http, got: {:?}",
            err
        );
    }
}
