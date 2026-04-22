use serde::{Deserialize, Serialize};
use time::OffsetDateTime;

use crate::id::{CredentialId, IssuerId};

/// Environment tier for a credential or deployment.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Env {
    Dev,
    Staging,
    Prod,
}

/// Lifecycle status of a credential.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CredentialStatus {
    Active,
    Revoked,
    Compromised,
}

/// Full credential record as stored in the database.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Credential {
    pub id: CredentialId,
    pub issuer_id: IssuerId,
    pub name: String,
    pub env: Env,
    pub scope: Option<String>,
    /// Logical path inside the age vault file (e.g. `credentials/<id>`).
    pub vault_ref: String,
    #[serde(with = "time::serde::timestamp::milliseconds")]
    pub created_at: OffsetDateTime,
    #[serde(default, with = "time::serde::timestamp::milliseconds::option")]
    pub last_rotated_at: Option<OffsetDateTime>,
    #[serde(default, with = "time::serde::timestamp::milliseconds::option")]
    pub expires_at: Option<OffsetDateTime>,
    pub owner: Option<String>,
    pub rotation_policy_days: Option<i32>,
    pub rotation_runbook_id: Option<String>,
    pub status: CredentialStatus,
    /// Last 4 characters of the secret, for display only.
    pub hash_hint: Option<String>,
}

/// Input for creating a new credential (no id, vault_ref, or timestamps).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CredentialInput {
    pub issuer_id: IssuerId,
    pub name: String,
    pub env: Env,
    pub scope: Option<String>,
    pub rotation_policy_days: Option<i32>,
    pub rotation_runbook_id: Option<String>,
    #[serde(default, with = "time::serde::timestamp::milliseconds::option")]
    pub expires_at: Option<OffsetDateTime>,
    pub owner: Option<String>,
    pub hash_hint: Option<String>,
}

/// Lightweight summary used in list views.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CredentialSummary {
    pub id: CredentialId,
    pub issuer_id: IssuerId,
    pub name: String,
    pub env: Env,
    pub status: CredentialStatus,
    #[serde(default, with = "time::serde::timestamp::milliseconds::option")]
    pub expires_at: Option<OffsetDateTime>,
}

/// Partial update — all fields optional.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct CredentialPatch {
    pub name: Option<String>,
    pub env: Option<Env>,
    pub scope: Option<String>,
    pub rotation_policy_days: Option<i32>,
    pub rotation_runbook_id: Option<String>,
    pub expires_at: Option<OffsetDateTime>,
    pub owner: Option<String>,
    pub status: Option<CredentialStatus>,
    pub hash_hint: Option<String>,
}

/// Filter parameters for listing credentials.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct CredentialFilter {
    pub issuer_id: Option<IssuerId>,
    pub env: Option<Env>,
    pub status: Option<CredentialStatus>,
    pub expiring_within_days: Option<i32>,
}
