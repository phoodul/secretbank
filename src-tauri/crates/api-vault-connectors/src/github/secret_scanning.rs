//! GitHub Secret Scanning alerts API 클라이언트.
//!
//! `list_alerts_with_base` 가 핵심 로직을 담고, 프로덕션 경로는 `GITHUB_API_BASE` 를,
//! 테스트 경로는 wiremock 서버 URI 를 주입한다.

use crate::{Auth, ConnectorError, RemoteKey};
use reqwest::{header::LINK, Client};
use serde::Deserialize;
use time::OffsetDateTime;
use time::format_description::well_known::Rfc3339;
use tracing::warn;

pub(crate) const GITHUB_API_BASE: &str = "https://api.github.com";
const USER_AGENT: &str = "api-vault/0.1.0";
const PROVIDER_ID: &str = "github";
const MAX_PAGES: usize = 50;

// ---------------------------------------------------------------------------
// Raw deserialization
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
struct AlertResponse {
    number: u64,
    secret_type: Option<String>,
    #[allow(dead_code)]
    secret_type_display_name: Option<String>,
    #[allow(dead_code)]
    state: Option<String>,
    created_at: Option<String>,
    html_url: Option<String>,
    locations_count: Option<u32>,
}

// ---------------------------------------------------------------------------
// Link header parser (same pattern as ghsa.rs)
// ---------------------------------------------------------------------------

fn parse_next_link(header_value: &str) -> Option<String> {
    for part in header_value.split(',') {
        let part = part.trim();
        if let Some((url_part, rel_part)) = part.split_once(';') {
            let url = url_part.trim().trim_start_matches('<').trim_end_matches('>');
            let rel = rel_part.trim();
            if rel == r#"rel="next""# {
                return Some(url.to_string());
            }
        }
    }
    None
}

// ---------------------------------------------------------------------------
// Retry-After header helper
// ---------------------------------------------------------------------------

fn parse_retry_after(headers: &reqwest::header::HeaderMap) -> Option<u64> {
    headers
        .get("Retry-After")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.parse::<u64>().ok())
}

// ---------------------------------------------------------------------------
// Alert → RemoteKey mapping
// ---------------------------------------------------------------------------

fn map_alert(alert: AlertResponse, owner: &str, repo: &str) -> Option<RemoteKey> {
    let number = alert.number;
    let first_detected = alert
        .created_at
        .as_deref()
        .and_then(|s| match OffsetDateTime::parse(s, &Rfc3339) {
            Ok(dt) => Some(dt),
            Err(_) => {
                warn!(alert_number = number, "failed to parse alert created_at timestamp");
                None
            }
        });

    Some(RemoteKey {
        id: format!("{}-{}-{}", owner, repo, number),
        provider: PROVIDER_ID.to_owned(),
        secret_type: alert.secret_type.unwrap_or_default(),
        first_detected,
        locations_count: alert.locations_count.unwrap_or(0),
        url: alert.html_url,
    })
}

// ---------------------------------------------------------------------------
// Core implementation — accepts an injectable base URL for testability
// ---------------------------------------------------------------------------

/// Secret Scanning alerts 를 가져온다. `api_base` 주입으로 테스트가 가능하다.
///
/// 프로덕션: `api_base = GITHUB_API_BASE`
/// 테스트:   `api_base = mock_server.uri()`
pub(crate) async fn list_alerts_with_base(
    client: &Client,
    auth: &Auth,
    api_base: &str,
    owner: &str,
    repo: &str,
) -> Result<Vec<RemoteKey>, ConnectorError> {
    let token = match auth {
        Auth::GithubInstallation { token, .. } => token.as_str(),
        _ => return Err(ConnectorError::Unauthorized),
    };

    let initial_url = format!(
        "{}/repos/{}/{}/secret-scanning/alerts?state=open&per_page=100",
        api_base.trim_end_matches('/'),
        owner,
        repo,
    );

    let mut results: Vec<RemoteKey> = Vec::new();
    let mut next_url: Option<String> = None;
    let mut pages = 0usize;

    loop {
        if pages >= MAX_PAGES {
            warn!(owner, repo, "reached max pages ({MAX_PAGES}) for secret scanning alerts");
            break;
        }

        let url = next_url.take().unwrap_or_else(|| initial_url.clone());
        pages += 1;

        let resp = client
            .get(&url)
            .bearer_auth(token)
            .header("Accept", "application/vnd.github+json")
            .header("X-GitHub-Api-Version", "2022-11-28")
            .header("User-Agent", USER_AGENT)
            .send()
            .await
            .map_err(|e| ConnectorError::Transport(e.to_string()))?;

        match resp.status().as_u16() {
            200 => {
                let link = resp
                    .headers()
                    .get(LINK)
                    .and_then(|v| v.to_str().ok())
                    .map(|s| s.to_string());

                let alerts: Vec<AlertResponse> = resp
                    .json()
                    .await
                    .map_err(|e| ConnectorError::Internal(e.to_string()))?;

                for alert in alerts {
                    if let Some(key) = map_alert(alert, owner, repo) {
                        results.push(key);
                    }
                }

                next_url = link.as_deref().and_then(parse_next_link);
                if next_url.is_none() {
                    break;
                }
            }
            401 => return Err(ConnectorError::Unauthorized),
            404 => return Err(ConnectorError::NotFound),
            429 => {
                let retry_after_secs = parse_retry_after(resp.headers());
                return Err(ConnectorError::RateLimited { retry_after_secs });
            }
            status => {
                return Err(ConnectorError::Internal(format!(
                    "unexpected status {status} from GitHub Secret Scanning API"
                )));
            }
        }
    }

    Ok(results)
}

// ---------------------------------------------------------------------------
// Public API — delegates to list_alerts_with_base with production base URL
// ---------------------------------------------------------------------------

/// 단일 repo 의 Secret Scanning alerts 를 가져온다 (프로덕션용).
pub async fn list_secret_scanning_alerts(
    client: &Client,
    auth: &Auth,
    owner: &str,
    repo: &str,
) -> Result<Vec<RemoteKey>, ConnectorError> {
    list_alerts_with_base(client, auth, GITHUB_API_BASE, owner, repo).await
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use wiremock::matchers::{method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    fn make_alert(n: u64) -> serde_json::Value {
        serde_json::json!({
            "number": n,
            "secret_type": "openai_api_key",
            "secret_type_display_name": "OpenAI API Key",
            "state": "open",
            "created_at": "2026-03-01T12:00:00Z",
            "html_url": format!("https://github.com/owner/repo/security/secret-scanning/{n}"),
            "locations_count": 1u32
        })
    }

    fn github_auth() -> Auth {
        Auth::GithubInstallation {
            installation_id: 1,
            token: "ghs_test".to_owned(),
        }
    }

    fn build_client() -> Client {
        Client::builder()
            .user_agent(USER_AGENT)
            .build()
            .expect("client build")
    }

    // -----------------------------------------------------------------------
    // T1: single_page_returns_alerts
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn single_page_returns_alerts() {
        let server = MockServer::start().await;

        Mock::given(method("GET"))
            .and(path("/repos/owner/repo/secret-scanning/alerts"))
            .respond_with(
                ResponseTemplate::new(200)
                    .set_body_json(serde_json::json!([make_alert(1), make_alert(2)])),
            )
            .mount(&server)
            .await;

        let client = build_client();
        let auth = github_auth();
        let keys = list_alerts_with_base(&client, &auth, &server.uri(), "owner", "repo")
            .await
            .unwrap();

        assert_eq!(keys.len(), 2);
        assert_eq!(keys[0].id, "owner-repo-1");
        assert_eq!(keys[0].provider, "github");
        assert_eq!(keys[0].secret_type, "openai_api_key");
        assert_eq!(keys[0].locations_count, 1);
        assert!(keys[0].first_detected.is_some());
        assert_eq!(
            keys[1].url.as_deref(),
            Some("https://github.com/owner/repo/security/secret-scanning/2")
        );
    }

    // -----------------------------------------------------------------------
    // T2: paginates_via_link_header
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn paginates_via_link_header() {
        let server = MockServer::start().await;
        // page2 경로에는 query string 없이 구분 가능한 path 를 사용
        let page2_path = "/repos/owner/repo/secret-scanning/alerts/page2";
        let page2_url = format!("{}{}", server.uri(), page2_path);

        // page 1 — Link header 포함
        Mock::given(method("GET"))
            .and(path("/repos/owner/repo/secret-scanning/alerts"))
            .respond_with(
                ResponseTemplate::new(200)
                    .insert_header("Link", format!(r#"<{}>; rel="next""#, page2_url))
                    .set_body_json(serde_json::json!([make_alert(1), make_alert(2)])),
            )
            .mount(&server)
            .await;

        // page 2 — Link header 없음
        Mock::given(method("GET"))
            .and(path(page2_path))
            .respond_with(
                ResponseTemplate::new(200)
                    .set_body_json(serde_json::json!([make_alert(3), make_alert(4)])),
            )
            .mount(&server)
            .await;

        let client = build_client();
        let auth = github_auth();
        let keys = list_alerts_with_base(&client, &auth, &server.uri(), "owner", "repo")
            .await
            .unwrap();

        assert_eq!(keys.len(), 4);
        assert_eq!(keys[0].id, "owner-repo-1");
        assert_eq!(keys[3].id, "owner-repo-4");
    }

    // -----------------------------------------------------------------------
    // T3: unauthorized_401
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn unauthorized_401() {
        let server = MockServer::start().await;

        Mock::given(method("GET"))
            .and(path("/repos/owner/repo/secret-scanning/alerts"))
            .respond_with(ResponseTemplate::new(401))
            .mount(&server)
            .await;

        let client = build_client();
        let auth = github_auth();
        let err = list_alerts_with_base(&client, &auth, &server.uri(), "owner", "repo")
            .await
            .unwrap_err();

        assert!(matches!(err, ConnectorError::Unauthorized));
    }

    // -----------------------------------------------------------------------
    // T4: not_found_404
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn not_found_404() {
        let server = MockServer::start().await;

        Mock::given(method("GET"))
            .and(path("/repos/owner/repo/secret-scanning/alerts"))
            .respond_with(ResponseTemplate::new(404))
            .mount(&server)
            .await;

        let client = build_client();
        let auth = github_auth();
        let err = list_alerts_with_base(&client, &auth, &server.uri(), "owner", "repo")
            .await
            .unwrap_err();

        assert!(matches!(err, ConnectorError::NotFound));
    }

    // -----------------------------------------------------------------------
    // T5: rate_limited_429_with_retry_after
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn rate_limited_429_with_retry_after() {
        let server = MockServer::start().await;

        Mock::given(method("GET"))
            .and(path("/repos/owner/repo/secret-scanning/alerts"))
            .respond_with(
                ResponseTemplate::new(429).insert_header("Retry-After", "60"),
            )
            .mount(&server)
            .await;

        let client = build_client();
        let auth = github_auth();
        let err = list_alerts_with_base(&client, &auth, &server.uri(), "owner", "repo")
            .await
            .unwrap_err();

        assert!(matches!(
            err,
            ConnectorError::RateLimited { retry_after_secs: Some(60) }
        ));
    }

    // -----------------------------------------------------------------------
    // T6: wrong_auth_kind_returns_unauthorized
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn wrong_auth_kind_returns_unauthorized() {
        let server = MockServer::start().await;
        let client = build_client();

        // Auth::None
        let err = list_alerts_with_base(&client, &Auth::None, &server.uri(), "owner", "repo")
            .await
            .unwrap_err();
        assert!(matches!(err, ConnectorError::Unauthorized));

        // Auth::Bearer
        let err = list_alerts_with_base(
            &client,
            &Auth::Bearer { token: "pat".to_owned() },
            &server.uri(),
            "owner",
            "repo",
        )
        .await
        .unwrap_err();
        assert!(matches!(err, ConnectorError::Unauthorized));
    }
}
