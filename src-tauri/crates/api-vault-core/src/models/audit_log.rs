use serde::{Deserialize, Serialize};
use time::OffsetDateTime;

use crate::id::{AuditLogId, DeviceId};

/// Who performed the action.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum AuditActor {
    LocalUser,
    System,
    Connector,
}

/// All auditable actions in the vault.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AuditAction {
    // Credential lifecycle
    CredentialCreate,
    CredentialUpdate,
    CredentialDelete,
    CredentialRotate,
    CredentialRevoke,
    CredentialReveal,
    // Project / usage / deployment
    ProjectCreate,
    ProjectUpdate,
    ProjectDelete,
    UsageCreate,
    UsageDelete,
    DeploymentCreate,
    DeploymentDelete,
    // Incident / auth
    IncidentDismiss,
    VaultUnlock,
    VaultLock,
    // Kill switch
    KillSwitchTriggered,
}

/// An append-only tamper-evident audit log entry.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AuditLog {
    pub id: AuditLogId,
    /// Monotonic per-device counter.
    pub seq: i64,
    pub device_id: Option<DeviceId>,
    pub actor: AuditActor,
    pub action: AuditAction,
    pub subject_kind: String,
    pub subject_id: String,
    pub payload_json: Option<String>,
    /// SHA-256 of the previous entry (32 bytes).
    pub prev_hash: Option<Vec<u8>>,
    /// SHA-256 of this entry (32 bytes).
    pub entry_hash: Option<Vec<u8>>,
    /// Ed25519 signature (64 bytes).
    pub signature: Option<Vec<u8>>,
    #[serde(with = "time::serde::timestamp::milliseconds")]
    pub created_at: OffsetDateTime,
}
