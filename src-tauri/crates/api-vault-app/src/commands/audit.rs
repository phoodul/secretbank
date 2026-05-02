//! Tauri commands for the tamper-evident audit log (T072).
//!
//! ## Commands
//! - `audit_list`         — paginated, filtered list of audit entries.
//! - `audit_verify_chain` — per-device hash-chain + signature verification.

use std::collections::HashMap;

use api_vault_audit::{verify as verify_chain, ChainVerification};
use api_vault_core::DeviceId;
use api_vault_storage::sqlite::repositories::device::DeviceRepo;
use api_vault_storage::{AuditFilter, AuditRepo};
use ed25519_dalek::VerifyingKey;
use serde::{Deserialize, Serialize};
use tauri::State;
use thiserror::Error;

use crate::context::AppContext;

// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------

/// JSON-friendly representation of an audit log entry.
///
/// Binary fields (hashes, signature) are hex-encoded; timestamps are Unix ms.
#[derive(Debug, Clone, Serialize)]
pub struct AuditEntry {
    pub id: String,
    pub seq: i64,
    pub device_id: Option<String>,
    /// "local-user" | "system" | "connector"
    pub actor: &'static str,
    pub action: String,
    pub subject_kind: String,
    pub subject_id: String,
    pub payload_json: Option<String>,
    /// Unix timestamp in milliseconds (UTC).
    pub created_at_ms: i64,
    /// SHA-256 of the previous entry (64 hex chars, all-zeros for genesis).
    pub prev_hash_hex: String,
    /// SHA-256 of this entry's canonical bytes (64 hex chars).
    pub entry_hash_hex: String,
    /// ed25519 signature (128 hex chars).
    pub signature_hex: String,
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct AuditListInput {
    pub subject_kind: Option<String>,
    pub subject_id: Option<String>,
    pub action_prefix: Option<String>,
    pub device_id: Option<String>,
    pub limit: Option<u32>,
    pub offset: Option<u32>,
}

/// Per-device chain verification result.
#[derive(Debug, Clone, Serialize)]
pub struct PerDeviceVerification {
    pub device_id: String,
    pub valid_count: usize,
    pub first_invalid_seq: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ChainVerifyReport {
    pub devices: Vec<PerDeviceVerification>,
    pub total_entries: usize,
    pub all_valid: bool,
}

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

#[derive(Debug, Error, Serialize)]
#[serde(tag = "code", rename_all = "snake_case")]
pub enum AuditCommandError {
    #[error("storage: {message}")]
    Storage { message: String },
    #[error("internal: {message}")]
    Internal { message: String },
}

impl From<api_vault_storage::sqlite::StorageError> for AuditCommandError {
    fn from(e: api_vault_storage::sqlite::StorageError) -> Self {
        Self::Storage {
            message: e.to_string(),
        }
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn ms_from_offset_dt(dt: time::OffsetDateTime) -> i64 {
    dt.unix_timestamp() * 1000 + (dt.nanosecond() as i64 / 1_000_000)
}

fn map_entry(log: api_vault_audit::AuditLog) -> AuditEntry {
    AuditEntry {
        id: log.id,
        seq: log.seq,
        device_id: log.device_id,
        actor: log.actor.as_str(),
        action: log.action,
        subject_kind: log.subject_kind,
        subject_id: log.subject_id,
        payload_json: log.payload_json,
        created_at_ms: ms_from_offset_dt(log.created_at),
        prev_hash_hex: hex::encode(log.prev_hash),
        entry_hash_hex: hex::encode(log.entry_hash),
        signature_hex: hex::encode(log.signature),
    }
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/// List audit log entries with optional filtering and pagination.
///
/// Defaults: limit = 100, offset = 0.
/// Limit is clamped to 1..=500.
#[tauri::command]
pub async fn audit_list(
    input: Option<AuditListInput>,
    state: State<'_, AppContext>,
) -> Result<Vec<AuditEntry>, AuditCommandError> {
    let input = input.unwrap_or_default();

    let raw_limit = input.limit.unwrap_or(100);
    let limit = raw_limit.clamp(1, 500);

    let filter = AuditFilter {
        subject_kind: input.subject_kind,
        subject_id: input.subject_id,
        action_prefix: input.action_prefix,
        device_id: input.device_id,
        limit,
        offset: input.offset.unwrap_or(0),
    };

    let repo = AuditRepo::new(&state.pool);
    let entries = repo.list(&filter).await?;

    Ok(entries.into_iter().map(map_entry).collect())
}

/// Verify the tamper-evident hash chain for every device.
///
/// Entries are fetched ordered by (device_id, seq) and grouped per device.
///
/// ## Device-id = None (system entries)
/// Some entries may have `device_id = NULL` when recorded before the vault was
/// unlocked. Each such entry is placed in its own synthetic group
/// `"__system__:<id>"` and reported as valid_count=1 (no public key available
/// to verify signatures, but we acknowledge their presence).
#[tauri::command]
pub async fn audit_verify_chain(
    state: State<'_, AppContext>,
) -> Result<ChainVerifyReport, AuditCommandError> {
    let repo = AuditRepo::new(&state.pool);
    let all = repo.list_for_verify().await?;
    let total_entries = all.len();

    // Group entries by device_id.
    // `None` device_id → synthetic key "__system__:<entry_id>" (one entry per group).
    let mut groups: HashMap<String, Vec<api_vault_audit::AuditLog>> = HashMap::new();
    for entry in all {
        let key = match &entry.device_id {
            Some(id) => id.clone(),
            // Each system entry is its own isolated group — no public key to verify.
            None => format!("__system__:{}", entry.id),
        };
        groups.entry(key).or_default().push(entry);
    }

    let device_repo = DeviceRepo::new(&state.pool);
    let mut devices: Vec<PerDeviceVerification> = Vec::new();
    let mut all_valid = true;

    for (key, entries) in groups {
        // System entries (no public key) — accept as-is.
        if key.starts_with("__system__:") {
            devices.push(PerDeviceVerification {
                device_id: key,
                valid_count: entries.len(),
                first_invalid_seq: None,
            });
            continue;
        }

        // Parse the device_id string back to a DeviceId ULID.
        let device_id_parsed: DeviceId = match key.parse() {
            Ok(id) => id,
            Err(e) => {
                all_valid = false;
                devices.push(PerDeviceVerification {
                    device_id: key,
                    valid_count: 0,
                    first_invalid_seq: entries.first().map(|e| e.seq),
                });
                tracing::warn!(error = %e, "audit_verify_chain: could not parse device_id");
                continue;
            }
        };

        // Look up the device's public key.
        let device = match device_repo.get_by_id(device_id_parsed).await {
            Ok(Some(d)) => d,
            Ok(None) => {
                // Unknown device — mark entire chain invalid.
                all_valid = false;
                devices.push(PerDeviceVerification {
                    device_id: key,
                    valid_count: 0,
                    first_invalid_seq: entries.first().map(|e| e.seq),
                });
                continue;
            }
            Err(e) => {
                return Err(AuditCommandError::Storage {
                    message: e.to_string(),
                });
            }
        };

        // Parse the 32-byte ed25519 verifying key.
        let vk = match device.public_key.as_slice().try_into() as Result<[u8; 32], _> {
            Ok(arr) => match VerifyingKey::from_bytes(&arr) {
                Ok(vk) => vk,
                Err(e) => {
                    all_valid = false;
                    tracing::warn!(device = %key, error = %e, "audit_verify_chain: bad verifying key");
                    devices.push(PerDeviceVerification {
                        device_id: key,
                        valid_count: 0,
                        first_invalid_seq: entries.first().map(|e| e.seq),
                    });
                    continue;
                }
            },
            Err(_) => {
                all_valid = false;
                tracing::warn!(device = %key, "audit_verify_chain: public_key is not 32 bytes");
                devices.push(PerDeviceVerification {
                    device_id: key,
                    valid_count: 0,
                    first_invalid_seq: entries.first().map(|e| e.seq),
                });
                continue;
            }
        };

        let ChainVerification {
            valid_count,
            first_invalid_seq,
        } = verify_chain(&entries, &vk);

        if first_invalid_seq.is_some() {
            all_valid = false;
        }

        devices.push(PerDeviceVerification {
            device_id: key,
            valid_count,
            first_invalid_seq,
        });
    }

    Ok(ChainVerifyReport {
        devices,
        total_entries,
        all_valid,
    })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use api_vault_audit::AuditActor;
    use api_vault_core::DevicePlatform;
    use api_vault_storage::sqlite::init_pool;
    use api_vault_storage::vault::mock::MockVaultStorage;
    use api_vault_storage::vault::VaultStorage as _;
    use api_vault_storage::AuditRepo;
    use tokio::sync::RwLock;

    use crate::audit_ctx::AuditCtx;
    use crate::services::device_identity::{ensure_device_keys, DeviceIdentity};

    // -----------------------------------------------------------------------
    // Shared helpers (mirrors audit_ctx.rs tests)
    // -----------------------------------------------------------------------

    async fn unlocked_vault(
    ) -> Arc<RwLock<Box<dyn api_vault_storage::vault::VaultStorage + Send + Sync>>> {
        let mut mock = MockVaultStorage::new("pw");
        mock.unlock(secrecy::SecretString::from("pw".to_owned()))
            .await
            .unwrap();
        Arc::new(RwLock::new(Box::new(mock)))
    }

    async fn make_pool() -> (tempfile::TempDir, sqlx::SqlitePool) {
        let dir = tempfile::tempdir().expect("tempdir");
        let db_path = dir.path().join("test.db");
        let pool = init_pool(&db_path).await.expect("init_pool");
        (dir, pool)
    }

    async fn make_identity(
        vault: Arc<RwLock<Box<dyn api_vault_storage::vault::VaultStorage + Send + Sync>>>,
        pool: &sqlx::SqlitePool,
    ) -> DeviceIdentity {
        ensure_device_keys(vault, pool, "test-device", DevicePlatform::Linux)
            .await
            .expect("ensure_device_keys")
    }

    fn make_ctx(pool: Arc<sqlx::SqlitePool>, identity: Option<DeviceIdentity>) -> AuditCtx {
        let di = Arc::new(RwLock::new(identity));
        AuditCtx::new(pool, di)
    }

    // -----------------------------------------------------------------------
    // T1: empty DB returns empty list
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn audit_list_empty_returns_empty() {
        let (_dir, pool) = make_pool().await;
        let pool = Arc::new(pool);

        let repo = AuditRepo::new(&pool);
        let filter = api_vault_storage::AuditFilter::default();
        let result = repo.list(&filter).await.unwrap();

        assert!(result.is_empty(), "fresh DB must return empty list");
    }

    // -----------------------------------------------------------------------
    // T2: filter by subject_kind
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn audit_list_respects_filter() {
        let vault = unlocked_vault().await;
        let (_dir, pool) = make_pool().await;
        let pool = Arc::new(pool);
        let identity = make_identity(vault, pool.as_ref()).await;
        let ctx = make_ctx(pool.clone(), Some(identity));

        // 2 credential entries + 1 project entry
        ctx.record(
            AuditActor::LocalUser,
            "credential.create",
            "credential",
            "c1",
            None,
        )
        .await
        .unwrap();
        ctx.record(
            AuditActor::LocalUser,
            "credential.update",
            "credential",
            "c2",
            None,
        )
        .await
        .unwrap();
        ctx.record(
            AuditActor::LocalUser,
            "project.create",
            "project",
            "p1",
            None,
        )
        .await
        .unwrap();

        let repo = AuditRepo::new(&pool);
        let filter = api_vault_storage::AuditFilter {
            subject_kind: Some("credential".to_string()),
            limit: 100,
            ..Default::default()
        };
        let results = repo.list(&filter).await.unwrap();

        assert_eq!(
            results.len(),
            2,
            "filter subject_kind=credential must return 2 entries"
        );
        for entry in &results {
            assert_eq!(entry.subject_kind, "credential");
        }
    }

    // -----------------------------------------------------------------------
    // T3: default limit caps at 100, explicit limit=500 returns all 150
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn audit_list_limit_default() {
        let vault = unlocked_vault().await;
        let (_dir, pool) = make_pool().await;
        let pool = Arc::new(pool);
        let identity = make_identity(vault, pool.as_ref()).await;
        let ctx = make_ctx(pool.clone(), Some(identity));

        // Seed 150 entries
        for i in 0u32..150 {
            ctx.record(
                AuditActor::LocalUser,
                format!("action.{i}"),
                "credential",
                format!("c{i}"),
                None,
            )
            .await
            .unwrap();
        }

        let repo = AuditRepo::new(&pool);

        // Default limit (0 → 100 in repo implementation)
        let default_filter = api_vault_storage::AuditFilter {
            limit: 0,
            ..Default::default()
        };
        let capped = repo.list(&default_filter).await.unwrap();
        assert_eq!(capped.len(), 100, "default limit must cap at 100");

        // Explicit limit 500 (more than seeded)
        let big_filter = api_vault_storage::AuditFilter {
            limit: 500,
            ..Default::default()
        };
        let all = repo.list(&big_filter).await.unwrap();
        assert_eq!(all.len(), 150, "limit=500 must return all 150 entries");
    }

    // -----------------------------------------------------------------------
    // T4: verify chain passes on untampered 5-entry chain
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn audit_verify_chain_passes_on_untampered_chain() {
        let vault = unlocked_vault().await;
        let (_dir, pool) = make_pool().await;
        let pool = Arc::new(pool);
        let identity = make_identity(vault, pool.as_ref()).await;
        let verifying_key = identity.signing_key.verifying_key();
        let ctx = make_ctx(pool.clone(), Some(identity));

        for i in 0u32..5 {
            ctx.record(
                AuditActor::LocalUser,
                format!("action.{i}"),
                "credential",
                format!("c{i}"),
                None,
            )
            .await
            .unwrap();
        }

        let repo = AuditRepo::new(&pool);
        let all = repo.list_for_verify().await.unwrap();
        assert_eq!(all.len(), 5);

        let result = api_vault_audit::verify(&all, &verifying_key);
        assert_eq!(result.valid_count, 5);
        assert_eq!(result.first_invalid_seq, None, "chain must be fully valid");
    }

    // -----------------------------------------------------------------------
    // T5: verify chain detects payload tamper at seq=2
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn audit_verify_chain_detects_tamper() {
        let vault = unlocked_vault().await;
        let (_dir, pool) = make_pool().await;
        let pool = Arc::new(pool);
        let identity = make_identity(vault, pool.as_ref()).await;
        let verifying_key = identity.signing_key.verifying_key();
        let ctx = make_ctx(pool.clone(), Some(identity));

        for i in 0i64..5 {
            ctx.record(
                AuditActor::LocalUser,
                format!("action.{i}"),
                "credential",
                format!("c{i}"),
                Some(format!(r#"{{"i":{i}}}"#)),
            )
            .await
            .unwrap();
        }

        // Directly tamper with seq=2 in the DB
        sqlx::query("UPDATE audit_log SET payload_json = 'hacked' WHERE seq = 2")
            .execute(pool.as_ref())
            .await
            .unwrap();

        let repo = AuditRepo::new(&pool);
        let all = repo.list_for_verify().await.unwrap();

        let result = api_vault_audit::verify(&all, &verifying_key);
        assert!(
            result.first_invalid_seq.is_some(),
            "tampered chain must report invalid seq"
        );
        assert_eq!(
            result.first_invalid_seq,
            Some(2),
            "first invalid seq must be 2 (the tampered entry)"
        );
        assert!(result.valid_count < 5, "valid_count must be less than 5");
    }
}
