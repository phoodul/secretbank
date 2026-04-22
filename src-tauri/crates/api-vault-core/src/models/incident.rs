use serde::{Deserialize, Serialize};
use time::OffsetDateTime;

use crate::id::{CredentialId, IncidentId, IncidentMatchId, IssuerId};

/// Feed source for an incident.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum IncidentSource {
    Nvd,
    Ghsa,
    Rss,
    Hibp,
}

/// Severity level of an incident.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum IncidentSeverity {
    Info,
    Low,
    Medium,
    High,
    Critical,
}

/// A security incident or vulnerability notification.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Incident {
    pub id: IncidentId,
    pub source: IncidentSource,
    /// External identifier e.g. `CVE-2025-1234` or `GHSA-xxx`.
    pub source_id: String,
    pub issuer_id: Option<IssuerId>,
    pub severity: IncidentSeverity,
    pub title: String,
    pub body: Option<String>,
    pub url: Option<String>,
    #[serde(with = "time::serde::timestamp::milliseconds")]
    pub detected_at: OffsetDateTime,
    #[serde(
        default,
        with = "time::serde::timestamp::milliseconds::option"
    )]
    pub published_at: Option<OffsetDateTime>,
}

/// How an incident was matched to a credential.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MatchReason {
    IssuerMatch,
    Keyword,
    Explicit,
}

/// Links an incident to a specific credential that may be affected.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct IncidentMatch {
    pub id: IncidentMatchId,
    pub incident_id: IncidentId,
    pub credential_id: CredentialId,
    pub reason: MatchReason,
    #[serde(with = "time::serde::timestamp::milliseconds")]
    pub matched_at: OffsetDateTime,
    /// RFC 3339 text when dismissed; `None` = active.
    #[serde(with = "time::serde::rfc3339::option")]
    pub dismissed_at: Option<OffsetDateTime>,
}
