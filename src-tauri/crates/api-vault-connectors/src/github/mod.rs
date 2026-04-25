//! GitHub connector — Secret Scanning alerts 폴링, Actions Secrets 쓰기 (Pro),
//! webhook 수신 (릴레이 경유).
//!
//! Private key 는 릴레이에만 보관되며, 클라이언트는 릴레이가 발급한 short-lived
//! installation_token 만 사용한다. 실제 API 호출 구현은 T061/T062 에서.

pub mod auth;

use crate::{Auth, Connector, ConnectorError, RemoteKey, RotationCap};
use api_vault_core::Incident;
use async_trait::async_trait;

pub const PROVIDER_ID: &str = "github";

/// GitHub connector 런타임 설정.
///
/// - `installation_id`: GitHub App 이 사용자/org 에 설치될 때 발급되는 ID
/// - `relay_base_url`: Cloudflare Workers 릴레이 URL (installation token 발급 및 webhook 수신)
#[derive(Debug, Clone)]
pub struct GithubConnector {
    pub installation_id: u64,
    pub relay_base_url: String,
}

impl GithubConnector {
    pub fn new(installation_id: u64, relay_base_url: impl Into<String>) -> Self {
        Self {
            installation_id,
            relay_base_url: relay_base_url.into(),
        }
    }
}

#[async_trait]
impl Connector for GithubConnector {
    fn provider_id(&self) -> &'static str {
        PROVIDER_ID
    }

    async fn list_keys(&self, _auth: &Auth) -> Result<Vec<RemoteKey>, ConnectorError> {
        // T062 에서 구현 예정 (secret_scanning/alerts 호출)
        Err(ConnectorError::Unsupported(
            "list_keys: pending T062 Secret Scanning 구현".into(),
        ))
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
        // GithubConnector 는 Secret Scanning alerts 를 Incident 로 변환하는 경로 (T062+) 담당.
        Err(ConnectorError::Unsupported(
            "fetch_incidents: pending T062 Secret Scanning → Incident 매핑".into(),
        ))
    }

    fn rotation_capability(&self) -> RotationCap {
        // Secret Scanning 자체는 revoke 만 지원 (Pro) → Partial.
        RotationCap::Partial
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_stores_fields() {
        let c = GithubConnector::new(12345, "https://relay.example.com");
        assert_eq!(c.installation_id, 12345);
        assert_eq!(c.relay_base_url, "https://relay.example.com");
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

    #[tokio::test]
    async fn list_keys_returns_unsupported_pending() {
        let c = GithubConnector::new(1, "");
        let err = c.list_keys(&Auth::None).await.unwrap_err();
        assert!(matches!(err, ConnectorError::Unsupported(_)));
    }
}
