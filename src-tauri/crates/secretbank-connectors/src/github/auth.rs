// SPDX-License-Identifier: AGPL-3.0-or-later
//
// 이 모듈은 OSS 코어(AGPL-3.0) 에 위치하지만, EE 릴레이(ee/secretbank-relay)를
// 호출하는 클라이언트 헬퍼다. 릴레이 자체는 EE 라이선스 적용.

use reqwest::Client;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize)]
struct TokenRequest {
    installation_id: u64,
}

#[derive(Debug, Deserialize, Clone)]
pub struct InstallationToken {
    pub token: String,
    pub expires_at: String,
}

#[derive(Debug, thiserror::Error)]
pub enum InstallationTokenError {
    #[error("network: {0}")]
    Network(String),
    #[error("relay error {status}: {body}")]
    Relay { status: u16, body: String },
    #[error("decode: {0}")]
    Decode(String),
}

/// 릴레이 서버에서 GitHub installation access token 을 발급받는다.
///
/// # Arguments
/// - `relay_base_url`: 릴레이 Workers URL (예: `https://relay.secretbank.app`)
/// - `user_token`: 현재 사용자의 bearer token (M8 이전에는 stub)
/// - `installation_id`: GitHub App installation ID
pub async fn fetch_installation_token(
    relay_base_url: &str,
    user_token: &str,
    installation_id: u64,
) -> Result<InstallationToken, InstallationTokenError> {
    let client = Client::builder()
        .user_agent("secretbank/0.1.0")
        .build()
        .map_err(|e| InstallationTokenError::Network(e.to_string()))?;

    let url = format!(
        "{}/integrations/github/installation-token",
        relay_base_url.trim_end_matches('/')
    );

    let resp = client
        .post(&url)
        .bearer_auth(user_token)
        .json(&TokenRequest { installation_id })
        .send()
        .await
        .map_err(|e| InstallationTokenError::Network(e.to_string()))?;

    let status = resp.status().as_u16();
    let body = resp
        .text()
        .await
        .map_err(|e| InstallationTokenError::Network(e.to_string()))?;

    if status >= 400 {
        return Err(InstallationTokenError::Relay { status, body });
    }

    serde_json::from_str(&body).map_err(|e| InstallationTokenError::Decode(e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use wiremock::matchers::{header, method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    #[tokio::test]
    async fn fetch_returns_token_on_200() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/integrations/github/installation-token"))
            .and(header("authorization", "Bearer user-tok"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "token": "ghs_test_token",
                "expires_at": "2099-01-01T00:00:00Z"
            })))
            .mount(&server)
            .await;

        let result = fetch_installation_token(&server.uri(), "user-tok", 42)
            .await
            .expect("should succeed");

        assert_eq!(result.token, "ghs_test_token");
        assert_eq!(result.expires_at, "2099-01-01T00:00:00Z");
    }

    #[tokio::test]
    async fn fetch_returns_relay_error_on_401() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/integrations/github/installation-token"))
            .respond_with(
                ResponseTemplate::new(401)
                    .set_body_json(serde_json::json!({ "error": "missing_auth" })),
            )
            .mount(&server)
            .await;

        let err = fetch_installation_token(&server.uri(), "bad-token", 42)
            .await
            .expect_err("should fail");

        match err {
            InstallationTokenError::Relay { status, .. } => {
                assert_eq!(status, 401);
            }
            other => panic!("unexpected error: {other}"),
        }
    }

    #[tokio::test]
    async fn fetch_returns_relay_error_on_500() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/integrations/github/installation-token"))
            .respond_with(ResponseTemplate::new(500).set_body_string("internal server error"))
            .mount(&server)
            .await;

        let err = fetch_installation_token(&server.uri(), "any-token", 99)
            .await
            .expect_err("should fail");

        match err {
            InstallationTokenError::Relay { status, .. } => {
                assert_eq!(status, 500);
            }
            other => panic!("unexpected error: {other}"),
        }
    }
}
