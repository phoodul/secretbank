use serde::{Deserialize, Serialize};
use time::OffsetDateTime;

use crate::id::IssuerId;

/// An API provider (Stripe, OpenAI, GitHub, ...).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Issuer {
    pub id: IssuerId,
    pub slug: String,
    pub display_name: String,
    pub docs_url: Option<String>,
    pub issue_url: Option<String>,
    pub status_url: Option<String>,
    pub security_feed_url: Option<String>,
    pub connector_id: Option<String>,
    pub icon_key: Option<String>,
    /// Default label for the primary credential value (e.g. "API Key", "Public Key").
    pub default_primary_label: Option<String>,
    /// Default label for the secondary credential value (e.g. "Secret Key", "Client Secret").
    pub default_secondary_label: Option<String>,
    #[serde(with = "time::serde::timestamp::milliseconds")]
    pub created_at: OffsetDateTime,
    #[serde(with = "time::serde::timestamp::milliseconds")]
    pub updated_at: OffsetDateTime,
}

/// Input for creating a new issuer.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
pub struct IssuerInput {
    pub slug: String,
    pub display_name: String,
    pub docs_url: Option<String>,
    pub issue_url: Option<String>,
    pub status_url: Option<String>,
    pub security_feed_url: Option<String>,
    pub connector_id: Option<String>,
    pub icon_key: Option<String>,
    /// Default label for the primary credential value.
    #[serde(default)]
    pub default_primary_label: Option<String>,
    /// Default label for the secondary credential value.
    #[serde(default)]
    pub default_secondary_label: Option<String>,
}
