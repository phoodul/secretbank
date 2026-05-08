use serde::{Deserialize, Serialize};
use time::OffsetDateTime;

use crate::id::{CredentialId, IssuerId};
use crate::security_score::ScoreBreakdown;

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

/// Credential kind — API key (default, M0) vs. general password (M24) vs. credit card (M24 Phase 3-A).
///
/// API keys carry only `name` + opaque `value`. Passwords additionally use
/// `url` (for autofill matching) and `username` (login identifier). Migration
/// 0006 adds `kind` column with default `'api_key'` so existing rows are
/// classified correctly without backfill.
/// Credit cards use `credit_card_meta` table (migration 0012) for plaintext
/// metadata and store card_number/CVC in the age vault (migration 0012).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum CredentialKind {
    #[default]
    ApiKey,
    Password,
    /// Payment card — metadata in `credit_card_meta`, secret in age vault.
    CreditCard,
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
    /// API key (default) or general password (M24).
    #[serde(default)]
    pub kind: CredentialKind,
    /// Password-only — origin URL for autofill matching (e.g. "https://gmail.com").
    /// Cleartext in DB so the browser extension / autofill can match without
    /// unlocking the vault. `None` for API keys.
    #[serde(default)]
    pub url: Option<String>,
    /// Password-only — login identifier (e.g. "user@gmail.com"). `None` for API keys.
    #[serde(default)]
    pub username: Option<String>,
    /// Vault entry reference for the secondary secret (e.g. Secret Key, Client Secret).
    /// `None` = single-secret credential. Always set/cleared together with `secondary_label`.
    #[serde(default)]
    pub secondary_value_ref: Option<String>,
    /// Display label for the primary value (e.g. "API Key", "Public Key", "Password").
    /// `None` = type-based fallback in the UI (api_key→"API Key", password→"PW").
    #[serde(default)]
    pub primary_label: Option<String>,
    /// Display label for the secondary value (e.g. "Secret Key", "Client Secret").
    /// `None` iff `secondary_value_ref` is `None`.
    #[serde(default)]
    pub secondary_label: Option<String>,
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
    #[serde(default)]
    pub kind: CredentialKind,
    #[serde(default)]
    pub url: Option<String>,
    #[serde(default)]
    pub username: Option<String>,
    /// Display label for the primary value. `None` = type-based fallback.
    #[serde(default)]
    pub primary_label: Option<String>,
    /// Display label for the secondary value. Required when `secondary_value` is provided.
    #[serde(default)]
    pub secondary_label: Option<String>,
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
    /// Last 4 characters of the secret. Used for duplicate detection in
    /// drop-scan import flow (T035). `None` for records imported before
    /// hash_hint was required.
    pub hash_hint: Option<String>,
    /// Risk score computed on the server (T040).
    pub score: ScoreBreakdown,
    #[serde(default)]
    pub kind: CredentialKind,
    /// Password-only — host displayed in card (e.g. "gmail.com" stripped from url).
    #[serde(default)]
    pub url: Option<String>,
    #[serde(default)]
    pub username: Option<String>,
    /// `true` when `secondary_value_ref` is set — avoids leaking vault paths in list responses.
    #[serde(default)]
    pub has_secondary: bool,
    /// Display label for the primary value. `None` = type-based fallback.
    #[serde(default)]
    pub primary_label: Option<String>,
    /// Display label for the secondary value. `None` when no secondary exists.
    #[serde(default)]
    pub secondary_label: Option<String>,
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
    pub url: Option<String>,
    pub username: Option<String>,
    pub primary_label: Option<String>,
    pub secondary_label: Option<String>,
    /// When `Some`, updates the secondary vault ref (use empty string to clear).
    pub secondary_value_ref: Option<String>,
}

/// Filter parameters for listing credentials.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct CredentialFilter {
    pub issuer_id: Option<IssuerId>,
    pub env: Option<Env>,
    pub status: Option<CredentialStatus>,
    pub expiring_within_days: Option<i32>,
    /// Filter by credential kind (api_key vs. password). `None` = all kinds.
    pub kind: Option<CredentialKind>,
}
