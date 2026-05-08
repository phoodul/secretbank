use serde::{Deserialize, Serialize};
use time::OffsetDateTime;

use crate::id::DeviceId;

/// Platform a device runs on.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum DevicePlatform {
    DesktopWin,
    Mac,
    Linux,
    Ios,
    Android,
    Web,
}

/// Device lifecycle status.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DeviceStatus {
    Active,
    Revoked,
}

/// A paired device that can access the vault.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Device {
    pub id: DeviceId,
    pub name: String,
    pub platform: DevicePlatform,
    /// X25519 or Ed25519 public key (raw bytes).
    pub public_key: Vec<u8>,
    #[serde(with = "time::serde::timestamp::milliseconds")]
    pub paired_at: OffsetDateTime,
    #[serde(default, with = "time::serde::timestamp::milliseconds::option")]
    pub last_seen_at: Option<OffsetDateTime>,
    pub status: DeviceStatus,
}

/// Input for registering a new device.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DeviceInput {
    pub name: String,
    pub platform: DevicePlatform,
    pub public_key: Vec<u8>,
}
