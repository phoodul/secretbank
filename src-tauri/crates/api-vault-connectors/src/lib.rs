//! Cross-provider connector interface.
//!
//! 각 공급자별 구현은 하위 모듈 (e.g. `github`) 로 들어간다. 현 단계(M5)에서는 GitHub 만
//! 구현하고, AWS / Stripe / OpenAI 등 다른 공급자는 Phase 2 에서 같은 trait 를 구현한다.
//!
//! # DoD deviation
//! `fetch_incidents` 는 원래 DoD 에 `&Auth` 파라미터가 없었으나, 실제로 private repo 의
//! Secret Scanning alerts 를 폴링하려면 공급자 인증이 필요하므로 `&Auth` 를 추가했다.

pub mod env_scanner;
pub use env_scanner::{scan_path, DetectedKey};

mod types;
pub use types::{Auth, ConnectorError, RemoteKey, RotationCap};

use api_vault_core::Incident;
use async_trait::async_trait;

/// Cross-provider connector trait.
///
/// M5 이후 각 공급자 구현체가 이 trait 을 구현한다.
/// `Send + Sync` 바운드를 포함하므로 Arc<dyn Connector> 로 공유 가능하다.
#[async_trait]
pub trait Connector: Send + Sync {
    /// 정적 provider identifier, e.g. `"github"`.
    fn provider_id(&self) -> &'static str;

    /// 공급자에 등록된 / 노출된 remote key 목록.
    async fn list_keys(&self, auth: &Auth) -> Result<Vec<RemoteKey>, ConnectorError>;

    /// 지정된 key 를 revoke. 공급자가 지원하지 않으면 `Unsupported` 에러.
    async fn revoke_key(&self, auth: &Auth, id: &str) -> Result<(), ConnectorError>;

    /// 공급자가 발행하는 보안 incident (Secret Scanning alerts, advisories 등).
    ///
    /// # DoD deviation
    /// 원래 DoD 서명에는 `&Auth` 가 없었으나 private repo alerts 폴링에 인증이
    /// 필요하므로 추가함.
    async fn fetch_incidents(&self, auth: &Auth) -> Result<Vec<Incident>, ConnectorError>;

    /// 회전 지원 수준.
    fn rotation_capability(&self) -> RotationCap;
}

/// 테스트 및 다른 crate 에서 재사용 가능한 mock 구현.
///
/// `feature = "testing"` 또는 `#[cfg(test)]` 에서만 컴파일된다.
#[cfg(any(test, feature = "testing"))]
pub mod testing {
    use super::{Auth, Connector, ConnectorError, RemoteKey, RotationCap};
    use api_vault_core::Incident;
    use async_trait::async_trait;
    use std::sync::{Arc, Mutex};

    /// `Connector` trait 의 동기화 가능한 mock 구현.
    pub struct MockConnector {
        pub provider: &'static str,
        pub keys: Vec<RemoteKey>,
        pub incidents: Vec<Incident>,
        pub revoked_ids: Arc<Mutex<Vec<String>>>,
        pub cap: RotationCap,
    }

    impl MockConnector {
        pub fn new() -> Self {
            Self {
                provider: "mock",
                keys: vec![],
                incidents: vec![],
                revoked_ids: Arc::new(Mutex::new(vec![])),
                cap: RotationCap::Full,
            }
        }

        pub fn revoked_ids(&self) -> Arc<Mutex<Vec<String>>> {
            Arc::clone(&self.revoked_ids)
        }
    }

    impl Default for MockConnector {
        fn default() -> Self {
            Self::new()
        }
    }

    #[async_trait]
    impl Connector for MockConnector {
        fn provider_id(&self) -> &'static str {
            self.provider
        }

        async fn list_keys(&self, _auth: &Auth) -> Result<Vec<RemoteKey>, ConnectorError> {
            Ok(self.keys.clone())
        }

        async fn revoke_key(&self, _auth: &Auth, id: &str) -> Result<(), ConnectorError> {
            self.revoked_ids
                .lock()
                .expect("mutex poisoned")
                .push(id.to_owned());
            Ok(())
        }

        async fn fetch_incidents(&self, _auth: &Auth) -> Result<Vec<Incident>, ConnectorError> {
            Ok(self.incidents.clone())
        }

        fn rotation_capability(&self) -> RotationCap {
            self.cap
        }
    }
}

#[cfg(test)]
mod tests {
    use super::testing::MockConnector;
    use super::*;
    use api_vault_core::{
        Incident, IncidentId, IncidentSeverity, IncidentSource,
    };
    use time::OffsetDateTime;

    fn make_incident() -> Incident {
        Incident {
            id: IncidentId::new(),
            source: IncidentSource::Ghsa,
            source_id: "GHSA-test-0001".to_owned(),
            issuer_id: None,
            severity: IncidentSeverity::High,
            title: "Test incident".to_owned(),
            body: None,
            url: None,
            detected_at: OffsetDateTime::now_utc(),
            published_at: None,
        }
    }

    fn make_remote_key() -> RemoteKey {
        RemoteKey {
            id: "alert-42".to_owned(),
            provider: "mock".to_owned(),
            secret_type: "aws_access_key_id".to_owned(),
            first_detected: None,
            locations_count: 1,
            url: Some("https://github.com/example/repo/security/secret-scanning/42".to_owned()),
        }
    }

    /// trait object dispatch 가 컴파일되는지 확인.
    #[test]
    fn test_trait_object_dispatch() {
        let mock = MockConnector::new();
        let _: &dyn Connector = &mock;
    }

    #[tokio::test]
    async fn test_provider_id() {
        let mock = MockConnector::new();
        assert_eq!(mock.provider_id(), "mock");
    }

    #[tokio::test]
    async fn test_list_keys() {
        let mut mock = MockConnector::new();
        mock.keys = vec![make_remote_key()];
        let auth = Auth::None;
        let keys = mock.list_keys(&auth).await.unwrap();
        assert_eq!(keys.len(), 1);
        assert_eq!(keys[0].id, "alert-42");
    }

    #[tokio::test]
    async fn test_revoke_key_records_id() {
        let mock = MockConnector::new();
        let revoked = mock.revoked_ids();
        let auth = Auth::None;
        mock.revoke_key(&auth, "key-abc").await.unwrap();
        mock.revoke_key(&auth, "key-xyz").await.unwrap();
        let ids = revoked.lock().unwrap();
        assert_eq!(*ids, vec!["key-abc", "key-xyz"]);
    }

    #[tokio::test]
    async fn test_fetch_incidents() {
        let mut mock = MockConnector::new();
        mock.incidents = vec![make_incident()];
        let auth = Auth::Bearer {
            token: "tok".to_owned(),
        };
        let incidents = mock.fetch_incidents(&auth).await.unwrap();
        assert_eq!(incidents.len(), 1);
        assert_eq!(incidents[0].source_id, "GHSA-test-0001");
    }

    #[test]
    fn test_rotation_capability() {
        let mock = MockConnector::new();
        assert_eq!(mock.rotation_capability(), RotationCap::Full);
    }
}
