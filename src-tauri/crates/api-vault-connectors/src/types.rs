use serde::{Deserialize, Serialize};
use thiserror::Error;
use time::OffsetDateTime;

/// 커넥터 인증 정보. 공급자마다 필요한 필드가 달라 enum 으로 분기.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Auth {
    /// GitHub App installation token (릴레이 경유 발급, 1시간 TTL).
    GithubInstallation {
        installation_id: u64,
        token: String,
    },
    /// 단순 bearer / PAT 스타일 — AWS IAM key, Stripe secret, OpenAI API key 등.
    Bearer { token: String },
    /// 인증 불필요 (공개 피드 등).
    None,
}

/// 원격 공급자에서 조회한 key (API Vault 내부 credential 과 매칭 시 사용).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemoteKey {
    pub id: String,                      // provider-native id, e.g. GitHub alert number
    pub provider: String,                // provider_id of the emitting connector
    pub secret_type: String,             // e.g. "aws_access_key_id"
    pub first_detected: Option<OffsetDateTime>,
    pub locations_count: u32,
    pub url: Option<String>,             // human-visible deep link if any
}

/// 회전 (rotation) 지원 수준.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RotationCap {
    /// 공급자가 API 로 rotation 전체 지원 (e.g. AWS IAM CreateAccessKey + DeleteAccessKey).
    Full,
    /// 일부만 지원 (e.g. GitHub Secret Scanning 은 revoke 만, rotation X).
    Partial,
    /// 사용자가 공급자 콘솔에서 수동 처리해야 함.
    Manual,
}

/// 커넥터 공통 에러.
#[derive(Debug, Error)]
pub enum ConnectorError {
    #[error("transport: {0}")]
    Transport(String),
    #[error("unauthorized")]
    Unauthorized,
    #[error("rate limited (retry after {retry_after_secs:?}s)")]
    RateLimited { retry_after_secs: Option<u64> },
    #[error("not found")]
    NotFound,
    #[error("unsupported: {0}")]
    Unsupported(String),
    #[error("internal: {0}")]
    Internal(String),
}
