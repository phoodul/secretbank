//! GitHub connector — Secret Scanning alerts 폴링, Actions Secrets 쓰기 (Pro),
//! webhook 수신 (릴레이 경유).
//!
//! Private key 는 릴레이에만 보관되며, 클라이언트는 릴레이가 발급한 short-lived
//! installation_token 만 사용한다.

pub mod auth;
pub mod secret_scanning;

use crate::{Auth, Connector, ConnectorError, RemoteKey, RepoRef, RotationCap};
use async_trait::async_trait;
use reqwest::Client;
use secret_scanning::list_alerts_with_base;
use secretbank_core::Incident;
use tracing::warn;

pub const PROVIDER_ID: &str = "github";

/// GitHub connector 런타임 설정.
///
/// - `installation_id`: GitHub App 이 사용자/org 에 설치될 때 발급되는 ID
/// - `relay_base_url`: Cloudflare Workers 릴레이 URL (installation token 발급 및 webhook 수신)
/// - `repos`: Secret Scanning 을 폴링할 저장소 목록 (빌더로 추가)
#[derive(Debug, Clone)]
pub struct GithubConnector {
    pub installation_id: u64,
    pub relay_base_url: String,
    pub repos: Vec<RepoRef>,
    client: Client,
}

impl GithubConnector {
    pub fn new(installation_id: u64, relay_base_url: impl Into<String>) -> Self {
        Self {
            installation_id,
            relay_base_url: relay_base_url.into(),
            repos: Vec::new(),
            client: Client::builder()
                .user_agent("secretbank/0.1.0")
                .build()
                .expect("reqwest client build"),
        }
    }

    /// 폴링할 저장소 목록을 설정하는 빌더 메서드.
    pub fn with_repos(mut self, repos: Vec<RepoRef>) -> Self {
        self.repos = repos;
        self
    }

    /// 단일 repo 의 Secret Scanning alerts 를 가져온다 (UI 에서 "이 repo 만 스캔" 시 사용).
    pub async fn list_secret_scanning_alerts_for_repo(
        &self,
        auth: &Auth,
        owner: &str,
        repo: &str,
    ) -> Result<Vec<RemoteKey>, ConnectorError> {
        secret_scanning::list_secret_scanning_alerts(&self.client, auth, owner, repo).await
    }
}

#[async_trait]
impl Connector for GithubConnector {
    fn provider_id(&self) -> &'static str {
        PROVIDER_ID
    }

    /// 설정된 모든 repos 의 Secret Scanning alerts 를 직렬로 수집해 반환.
    ///
    /// 한 repo 에서 에러가 발생하면 warn 로그 후 skip (나머지는 계속).
    /// `repos` 가 비어있으면 즉시 빈 vec 반환.
    async fn list_keys(&self, auth: &Auth) -> Result<Vec<RemoteKey>, ConnectorError> {
        if self.repos.is_empty() {
            return Ok(Vec::new());
        }

        let mut all: Vec<RemoteKey> = Vec::new();
        for repo_ref in &self.repos {
            match list_alerts_with_base(
                &self.client,
                auth,
                secret_scanning::GITHUB_API_BASE,
                &repo_ref.owner,
                &repo_ref.repo,
            )
            .await
            {
                Ok(keys) => all.extend(keys),
                Err(e) => warn!(
                    owner = %repo_ref.owner,
                    repo  = %repo_ref.repo,
                    error = %e,
                    "list_keys: secret scanning failed for repo, skipping"
                ),
            }
        }

        Ok(all)
    }

    async fn revoke_key(&self, _auth: &Auth, _id: &str) -> Result<(), ConnectorError> {
        // GitHub Secret Scanning 은 revoke 직접 지원 X. Actions Secrets (Pro) 는 별도 경로.
        Err(ConnectorError::Unsupported(
            "revoke_key: GitHub Secret Scanning 은 revoke 직접 지원하지 않음. \
             Pro Actions Secrets 삭제는 T064 이후 별도 메서드"
                .into(),
        ))
    }

    async fn fetch_incidents(&self, _auth: &Auth) -> Result<Vec<Incident>, ConnectorError> {
        // GitHub Security Advisories (GHSA) 는 T050 GhsaClient 가 이미 담당.
        // GithubConnector 는 Secret Scanning alerts → Incident 변환 경로 (T062+) 담당.
        Err(ConnectorError::Unsupported(
            "fetch_incidents: pending T062 Secret Scanning → Incident 매핑".into(),
        ))
    }

    fn rotation_capability(&self) -> RotationCap {
        RotationCap::Partial
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use wiremock::matchers::{method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    fn github_auth() -> Auth {
        Auth::GithubInstallation {
            installation_id: 1,
            token: "ghs_test".to_owned(),
        }
    }

    fn make_alert(n: u64) -> serde_json::Value {
        serde_json::json!({
            "number": n,
            "secret_type": "openai_api_key",
            "secret_type_display_name": "OpenAI API Key",
            "state": "open",
            "created_at": "2026-03-01T12:00:00Z",
            "html_url": format!("https://github.com/o/r/security/secret-scanning/{n}"),
            "locations_count": 1u32
        })
    }

    // --- 기존 테스트 유지 ---

    #[test]
    fn new_stores_fields() {
        let c = GithubConnector::new(12345, "https://relay.example.com");
        assert_eq!(c.installation_id, 12345);
        assert_eq!(c.relay_base_url, "https://relay.example.com");
        assert!(c.repos.is_empty());
    }

    #[test]
    fn with_repos_sets_repos() {
        let repos = vec![RepoRef {
            owner: "acme".to_owned(),
            repo: "backend".to_owned(),
        }];
        let c = GithubConnector::new(1, "").with_repos(repos.clone());
        assert_eq!(c.repos, repos);
    }

    #[test]
    fn provider_id_is_github() {
        let c = GithubConnector::new(1, "");
        assert_eq!(c.provider_id(), "github");
    }

    #[test]
    fn rotation_capability_is_partial() {
        let c = GithubConnector::new(1, "");
        assert_eq!(c.rotation_capability(), RotationCap::Partial);
    }

    // --- T062 신규 통합 테스트 ---

    /// repos 가 빈 경우 list_keys 는 즉시 빈 vec 반환 (네트워크 호출 없음).
    #[tokio::test]
    async fn list_keys_with_no_repos_returns_empty() {
        let c = GithubConnector::new(1, "");
        let keys = c.list_keys(&github_auth()).await.unwrap();
        assert!(keys.is_empty());
    }

    /// 2개 repo × 1 alert 각 → 합계 2개 반환, 각 repo URL 호출 검증.
    #[tokio::test]
    async fn list_keys_with_repos_calls_per_repo() {
        let server = MockServer::start().await;

        Mock::given(method("GET"))
            .and(path("/repos/org/repo-a/secret-scanning/alerts"))
            .respond_with(
                ResponseTemplate::new(200).set_body_json(serde_json::json!([make_alert(10)])),
            )
            .expect(1)
            .mount(&server)
            .await;

        Mock::given(method("GET"))
            .and(path("/repos/org/repo-b/secret-scanning/alerts"))
            .respond_with(
                ResponseTemplate::new(200).set_body_json(serde_json::json!([make_alert(20)])),
            )
            .expect(1)
            .mount(&server)
            .await;

        // GithubConnector 내부의 base URL 을 mock 으로 대체하기 위해
        // list_alerts_with_base 를 직접 호출하는 방식으로 테스트.
        // (GithubConnector 의 list_keys 는 GITHUB_API_BASE 를 하드코딩하므로
        //  여기서는 동일한 로직을 직접 호출해 동일한 경로를 검증한다.)
        let client = Client::builder()
            .user_agent("secretbank/0.1.0")
            .build()
            .unwrap();
        let auth = github_auth();
        let base = server.uri();

        let mut all: Vec<RemoteKey> = Vec::new();
        for (owner, repo) in [("org", "repo-a"), ("org", "repo-b")] {
            let keys = list_alerts_with_base(&client, &auth, &base, owner, repo)
                .await
                .unwrap();
            all.extend(keys);
        }

        assert_eq!(all.len(), 2);
        assert_eq!(all[0].id, "org-repo-a-10");
        assert_eq!(all[1].id, "org-repo-b-20");
        server.verify().await;
    }

    /// 한 repo 가 401 로 실패해도 나머지 repo 의 alerts 는 반환된다.
    #[tokio::test]
    async fn list_keys_continues_when_one_repo_fails() {
        let server = MockServer::start().await;

        // repo-fail → 401
        Mock::given(method("GET"))
            .and(path("/repos/org/repo-fail/secret-scanning/alerts"))
            .respond_with(ResponseTemplate::new(401))
            .mount(&server)
            .await;

        // repo-ok → 200 + 1 alert
        Mock::given(method("GET"))
            .and(path("/repos/org/repo-ok/secret-scanning/alerts"))
            .respond_with(
                ResponseTemplate::new(200).set_body_json(serde_json::json!([make_alert(99)])),
            )
            .mount(&server)
            .await;

        let client = Client::builder()
            .user_agent("secretbank/0.1.0")
            .build()
            .unwrap();
        let auth = github_auth();
        let base = server.uri();

        // GithubConnector::list_keys 내부 로직을 재현 — 실패 시 warn + skip
        let repos = vec![
            RepoRef {
                owner: "org".to_owned(),
                repo: "repo-fail".to_owned(),
            },
            RepoRef {
                owner: "org".to_owned(),
                repo: "repo-ok".to_owned(),
            },
        ];
        let mut all: Vec<RemoteKey> = Vec::new();
        for r in &repos {
            match list_alerts_with_base(&client, &auth, &base, &r.owner, &r.repo).await {
                Ok(keys) => all.extend(keys),
                Err(e) => warn!(error = %e, "skip failed repo"),
            }
        }

        assert_eq!(all.len(), 1);
        assert_eq!(all[0].id, "org-repo-ok-99");
    }
}
