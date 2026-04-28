//! HTTP client for the Cloudflare Workers relay (M8 Auth).
//!
//! `RelayClient` is a thin wrapper around `reqwest::Client` that:
//!   - resolves a base URL from build profile + optional SQLite settings override
//!   - serialises a JSON request body and decodes a JSON response body
//!   - maps non-2xx responses into [`RelayError::BadStatus`] with body intact for
//!     diagnostics (the relay returns `{ error, detail? }` on failures)
//!
//! # URL resolution order
//! 1. `settings/relay_url` in the SQLite settings table (user override —
//!    used by self-hosters or when pointing at a staging deployment)
//! 2. `cfg(debug_assertions)` → `http://localhost:8787` (Cloudflare Workers
//!    `wrangler dev` default)
//! 3. release default → `https://api-vault.app`
//!
//! # Why a dedicated module?
//! M9 Sync (Y-IndexedDB + SecSync over relay) will reuse the same HTTP client —
//! keeping it on `AppContext` as a shared `Arc<RelayClient>` avoids re-creating
//! the underlying connection pool per command.

use std::time::Duration;

use api_vault_storage::sqlite::repositories::settings::SettingsRepo;
use api_vault_storage::sqlite::SqlitePool;
use reqwest::{Client, StatusCode};
use serde::{de::DeserializeOwned, Serialize};
use thiserror::Error;
use url::Url;

/// Default relay URL used when no override is set.
///
/// `debug_assertions` is the standard way to detect a non-release build
/// (`cargo build` vs `cargo build --release`); we use it instead of a custom
/// `cfg(test)` so `cargo run` in dev also points at localhost.
const DEFAULT_RELAY_URL: &str = if cfg!(debug_assertions) {
    "http://localhost:8787"
} else {
    "https://api-vault.app"
};

/// SQLite settings key used to override the relay URL at runtime.
pub const RELAY_URL_SETTING: &str = "relay_url";

/// Total request timeout (covers connect + read + decode).
const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);

/// Errors returned by [`RelayClient`].
#[derive(Debug, Error)]
pub enum RelayError {
    /// Network-level failure (DNS, TLS, connection refused, timeout).
    #[error("relay network error: {0}")]
    Network(String),

    /// The relay responded with a non-2xx status. `body` is captured verbatim
    /// so callers can surface `error` / `detail` fields to users.
    #[error("relay bad status {status}: {body}")]
    BadStatus { status: StatusCode, body: String },

    /// Response body was not valid JSON of the expected shape.
    #[error("relay decode error: {0}")]
    Decode(String),

    /// The configured base URL was invalid.
    #[error("relay invalid base url: {0}")]
    InvalidBaseUrl(String),
}

/// Shared HTTP client targeted at the relay.
///
/// Cheap to clone (`reqwest::Client` is internally `Arc`-wrapped).
#[derive(Clone, Debug)]
pub struct RelayClient {
    http: Client,
    base_url: Url,
}

impl RelayClient {
    /// Build a client with an explicit base URL.
    ///
    /// Used by tests pointing at a `wiremock::MockServer` and by
    /// [`from_settings`] after URL resolution.
    pub fn new(base_url: Url) -> Result<Self, RelayError> {
        let http = Client::builder()
            .timeout(REQUEST_TIMEOUT)
            .user_agent(concat!("api-vault/", env!("CARGO_PKG_VERSION")))
            .build()
            .map_err(|e| RelayError::Network(e.to_string()))?;
        Ok(Self { http, base_url })
    }

    /// Resolve the relay base URL from SQLite settings (if set) or fall back to
    /// [`DEFAULT_RELAY_URL`], then build a client.
    pub async fn from_settings(pool: &SqlitePool) -> Result<Self, RelayError> {
        let override_url = SettingsRepo::new(pool)
            .get(RELAY_URL_SETTING)
            .await
            .map_err(|e| RelayError::Network(format!("settings lookup: {e}")))?;
        let raw = override_url.unwrap_or_else(|| DEFAULT_RELAY_URL.to_owned());
        let base_url =
            Url::parse(&raw).map_err(|e| RelayError::InvalidBaseUrl(format!("{raw:?}: {e}")))?;
        Self::new(base_url)
    }

    /// Return the resolved base URL (useful for diagnostics and tests).
    pub fn base_url(&self) -> &Url {
        &self.base_url
    }

    /// POST `body` (JSON-serialised) to `path` and decode the JSON response.
    ///
    /// `path` should start with `/` (e.g. `/auth/passkey/register/start`).
    /// Joins against `base_url` using [`Url::join`] semantics so a trailing
    /// slash on the base is not required.
    pub async fn post_json<I, O>(&self, path: &str, body: &I) -> Result<O, RelayError>
    where
        I: Serialize + ?Sized,
        O: DeserializeOwned,
    {
        let url = self
            .base_url
            .join(path)
            .map_err(|e| RelayError::InvalidBaseUrl(format!("{path:?}: {e}")))?;

        let resp = self
            .http
            .post(url)
            .json(body)
            .send()
            .await
            .map_err(|e| RelayError::Network(e.to_string()))?;

        let status = resp.status();
        let text = resp
            .text()
            .await
            .map_err(|e| RelayError::Network(e.to_string()))?;

        if !status.is_success() {
            return Err(RelayError::BadStatus { status, body: text });
        }

        serde_json::from_str::<O>(&text).map_err(|e| RelayError::Decode(e.to_string()))
    }

    /// GET `path` and decode the JSON response. Bearer token / authorization
    /// is **not** attached here — callers that need it construct the URL with
    /// query parameters and rely on the relay to authenticate via cookies or
    /// future header injection. M9 Phase F-2 의 value pull 흐름에선
    /// authorization 이 필요한데, 현재 relay_client 는 stateless. 이 메서드는
    /// auth 부담을 호출자에게 넘기지 않으려 `post_json` 처럼 단순 wrapper.
    ///
    pub async fn get_json<O>(&self, path: &str) -> Result<O, RelayError>
    where
        O: DeserializeOwned,
    {
        let url = self
            .base_url
            .join(path)
            .map_err(|e| RelayError::InvalidBaseUrl(format!("{path:?}: {e}")))?;

        let resp = self
            .http
            .get(url)
            .send()
            .await
            .map_err(|e| RelayError::Network(e.to_string()))?;

        let status = resp.status();
        let text = resp
            .text()
            .await
            .map_err(|e| RelayError::Network(e.to_string()))?;

        if !status.is_success() {
            return Err(RelayError::BadStatus { status, body: text });
        }

        serde_json::from_str::<O>(&text).map_err(|e| RelayError::Decode(e.to_string()))
    }

    /// POST + Bearer access token. M9 Phase F-2 의 sync_value_push 등 인증된
    /// endpoint 호출용.
    pub async fn post_json_authed<I, O>(
        &self,
        path: &str,
        bearer: &str,
        body: &I,
    ) -> Result<O, RelayError>
    where
        I: Serialize + ?Sized,
        O: DeserializeOwned,
    {
        let url = self
            .base_url
            .join(path)
            .map_err(|e| RelayError::InvalidBaseUrl(format!("{path:?}: {e}")))?;
        let resp = self
            .http
            .post(url)
            .bearer_auth(bearer)
            .json(body)
            .send()
            .await
            .map_err(|e| RelayError::Network(e.to_string()))?;
        let status = resp.status();
        let text = resp
            .text()
            .await
            .map_err(|e| RelayError::Network(e.to_string()))?;
        if !status.is_success() {
            return Err(RelayError::BadStatus { status, body: text });
        }
        serde_json::from_str::<O>(&text).map_err(|e| RelayError::Decode(e.to_string()))
    }

    /// GET + Bearer access token.
    pub async fn get_json_authed<O>(&self, path: &str, bearer: &str) -> Result<O, RelayError>
    where
        O: DeserializeOwned,
    {
        let url = self
            .base_url
            .join(path)
            .map_err(|e| RelayError::InvalidBaseUrl(format!("{path:?}: {e}")))?;
        let resp = self
            .http
            .get(url)
            .bearer_auth(bearer)
            .send()
            .await
            .map_err(|e| RelayError::Network(e.to_string()))?;
        let status = resp.status();
        let text = resp
            .text()
            .await
            .map_err(|e| RelayError::Network(e.to_string()))?;
        if !status.is_success() {
            return Err(RelayError::BadStatus { status, body: text });
        }
        serde_json::from_str::<O>(&text).map_err(|e| RelayError::Decode(e.to_string()))
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use api_vault_storage::sqlite::init_pool;
    use serde::Deserialize;
    use wiremock::matchers::{body_json, method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    use super::*;

    #[derive(Serialize)]
    struct Echo {
        msg: String,
    }

    #[derive(Deserialize, Debug, PartialEq)]
    struct EchoResp {
        ok: bool,
        seen: String,
    }

    fn url(server: &MockServer) -> Url {
        Url::parse(&server.uri()).expect("mock server url")
    }

    // -----------------------------------------------------------------------
    // 1. post_json: 200 응답 → JSON 디코딩 성공
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn post_json_200_decodes_response() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/echo"))
            .and(body_json(serde_json::json!({"msg": "hi"})))
            .respond_with(
                ResponseTemplate::new(200).set_body_json(serde_json::json!({
                    "ok": true,
                    "seen": "hi",
                })),
            )
            .mount(&server)
            .await;

        let client = RelayClient::new(url(&server)).unwrap();
        let resp: EchoResp = client
            .post_json("/echo", &Echo { msg: "hi".into() })
            .await
            .unwrap();
        assert_eq!(
            resp,
            EchoResp {
                ok: true,
                seen: "hi".into(),
            }
        );
    }

    // -----------------------------------------------------------------------
    // 2. post_json: 4xx 응답 → BadStatus + body 보존
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn post_json_4xx_returns_bad_status_with_body() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/auth/passkey/register/start"))
            .respond_with(
                ResponseTemplate::new(400).set_body_json(serde_json::json!({
                    "error": "invalid_email",
                })),
            )
            .mount(&server)
            .await;

        let client = RelayClient::new(url(&server)).unwrap();
        let result: Result<serde_json::Value, _> = client
            .post_json("/auth/passkey/register/start", &serde_json::json!({}))
            .await;

        match result.unwrap_err() {
            RelayError::BadStatus { status, body } => {
                assert_eq!(status.as_u16(), 400);
                assert!(
                    body.contains("invalid_email"),
                    "body should preserve error code, got: {body}"
                );
            }
            other => panic!("expected BadStatus, got {other:?}"),
        }
    }

    // -----------------------------------------------------------------------
    // 3. post_json: malformed JSON 응답 → Decode 에러
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn post_json_malformed_body_returns_decode_error() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/echo"))
            .respond_with(ResponseTemplate::new(200).set_body_string("not-json"))
            .mount(&server)
            .await;

        let client = RelayClient::new(url(&server)).unwrap();
        let result: Result<EchoResp, _> = client
            .post_json("/echo", &Echo { msg: "x".into() })
            .await;
        assert!(matches!(result.unwrap_err(), RelayError::Decode(_)));
    }

    // -----------------------------------------------------------------------
    // 4. from_settings: override 없으면 default URL 사용
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn from_settings_uses_default_when_no_override() {
        let dir = tempfile::tempdir().unwrap();
        let pool = init_pool(&dir.path().join("test.db")).await.unwrap();
        let client = RelayClient::from_settings(&pool).await.unwrap();
        // `Url` normalises an origin-only URL by appending a trailing slash, so
        // compare via `origin()` to stay tolerant of that.
        assert_eq!(
            client.base_url().origin().ascii_serialization(),
            Url::parse(DEFAULT_RELAY_URL).unwrap().origin().ascii_serialization(),
        );
    }

    // -----------------------------------------------------------------------
    // 5. from_settings: SQLite override 가 있으면 그 값 사용
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn from_settings_uses_override_when_present() {
        let dir = tempfile::tempdir().unwrap();
        let pool = init_pool(&dir.path().join("test.db")).await.unwrap();
        SettingsRepo::new(&pool)
            .set(RELAY_URL_SETTING, Some("https://staging.example.com"))
            .await
            .unwrap();

        let client = RelayClient::from_settings(&pool).await.unwrap();
        assert_eq!(
            client.base_url().origin().ascii_serialization(),
            "https://staging.example.com",
        );
    }

    // -----------------------------------------------------------------------
    // 6. from_settings: 잘못된 URL → InvalidBaseUrl
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn from_settings_invalid_url_returns_error() {
        let dir = tempfile::tempdir().unwrap();
        let pool = init_pool(&dir.path().join("test.db")).await.unwrap();
        SettingsRepo::new(&pool)
            .set(RELAY_URL_SETTING, Some("not-a-url"))
            .await
            .unwrap();

        let result = RelayClient::from_settings(&pool).await;
        assert!(matches!(result.unwrap_err(), RelayError::InvalidBaseUrl(_)));
    }
}
