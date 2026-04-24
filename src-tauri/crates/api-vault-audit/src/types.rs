use serde::{Deserialize, Serialize};
use time::OffsetDateTime;

mod serde_array32 {
    use serde::{de::Error, Deserializer, Serializer};

    pub fn serialize<S: Serializer>(v: &[u8; 32], s: S) -> Result<S::Ok, S::Error> {
        s.serialize_bytes(v)
    }

    pub fn deserialize<'de, D: Deserializer<'de>>(d: D) -> Result<[u8; 32], D::Error> {
        let bytes: Vec<u8> = serde_bytes::deserialize(d)?;
        bytes
            .try_into()
            .map_err(|_| D::Error::custom("expected exactly 32 bytes"))
    }
}

mod serde_array64 {
    use serde::{de::Error, Deserializer, Serializer};

    pub fn serialize<S: Serializer>(v: &[u8; 64], s: S) -> Result<S::Ok, S::Error> {
        s.serialize_bytes(v)
    }

    pub fn deserialize<'de, D: Deserializer<'de>>(d: D) -> Result<[u8; 64], D::Error> {
        let bytes: Vec<u8> = serde_bytes::deserialize(d)?;
        bytes
            .try_into()
            .map_err(|_| D::Error::custom("expected exactly 64 bytes"))
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum AuditActor {
    LocalUser,
    System,
    Connector,
}

impl AuditActor {
    pub fn as_str(&self) -> &'static str {
        match self {
            AuditActor::LocalUser => "local-user",
            AuditActor::System => "system",
            AuditActor::Connector => "connector",
        }
    }
}

/// Input for a new audit entry — the fields the caller must supply.
/// The crate computes seq, hashes, signature, created_at itself.
#[derive(Debug, Clone)]
pub struct AuditInput {
    /// None for system-level entries
    pub device_id: Option<String>,
    pub actor: AuditActor,
    /// e.g. "credential.create"
    pub action: String,
    /// e.g. "credential"
    pub subject_kind: String,
    pub subject_id: String,
    pub payload_json: Option<String>,
}

/// A fully-formed audit log entry as stored in SQLite.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditLog {
    /// ULID
    pub id: String,
    /// monotonic per-device
    pub seq: i64,
    pub device_id: Option<String>,
    pub actor: AuditActor,
    pub action: String,
    pub subject_kind: String,
    pub subject_id: String,
    pub payload_json: Option<String>,
    #[serde(with = "serde_array32")]
    pub prev_hash: [u8; 32],
    #[serde(with = "serde_array32")]
    pub entry_hash: [u8; 32],
    #[serde(with = "serde_array64")]
    pub signature: [u8; 64],
    pub created_at: OffsetDateTime,
}
