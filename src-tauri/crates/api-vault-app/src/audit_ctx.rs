//! Best-effort audit context — records tamper-evident audit entries for every
//! mutating command without ever blocking or failing the caller.
//!
//! # Design
//! - If device identity is not available (vault locked) we log a warning and
//!   return `None`. The caller's operation proceeds normally.
//! - If the DB write fails we log a warning and return `None`.
//! - This is an explicit pragmatic tradeoff for the desktop single-user app.
//!   Transactional guarantees for the most sensitive ops can be layered later.

use std::sync::Arc;

use api_vault_audit::{append, AuditActor, AuditInput, AuditLog};
use api_vault_storage::AuditRepo;
use sqlx::SqlitePool;
use time::OffsetDateTime;
use tokio::sync::{Mutex, RwLock};
use tracing::warn;

use crate::services::device_identity::DeviceIdentity;

pub struct AuditCtx {
    pool: Arc<SqlitePool>,
    device_identity: Arc<RwLock<Option<DeviceIdentity>>>,
    /// `last_for_device → append → insert` 3단계를 단일 프로세스 내에서 직렬화한다.
    record_lock: Mutex<()>,
}

impl AuditCtx {
    pub fn new(
        pool: Arc<SqlitePool>,
        device_identity: Arc<RwLock<Option<DeviceIdentity>>>,
    ) -> Self {
        Self {
            pool,
            device_identity,
            record_lock: Mutex::new(()),
        }
    }

    /// Best-effort audit append. Never fails the caller — on error logs a warning.
    /// Returns the appended entry if the write succeeded (useful for tests).
    ///
    /// `record_lock` 을 통해 `last_for_device → append → insert` 3단계를 직렬화한다.
    /// 단일 프로세스 내 동시 호출 시 같은 seq 로 chain 이 분기되는 TOCTOU 를 방지한다.
    pub async fn record(
        &self,
        actor: AuditActor,
        action: impl Into<String>,
        subject_kind: impl Into<String>,
        subject_id: impl Into<String>,
        payload_json: Option<String>,
    ) -> Option<AuditLog> {
        let _guard = self.record_lock.lock().await;

        let action = action.into();
        let subject_kind = subject_kind.into();
        let subject_id = subject_id.into();

        // Extract device_id and signing_key under the read lock, then release
        // the lock immediately so vault write-lock operations (unlock/lock) are
        // not blocked for the duration of the SQLite I/O below.
        let (device_id, signing_key) = {
            let identity_guard = self.device_identity.read().await;
            let Some(identity) = identity_guard.as_ref() else {
                warn!(
                    action = %action,
                    "audit skipped: device identity not available (vault locked?)"
                );
                return None;
            };
            (identity.device_id, identity.signing_key.clone())
        }; // read lock released here

        let repo = AuditRepo::new(&self.pool);
        let prev = match repo.last_for_device(&device_id.to_string()).await {
            Ok(p) => p,
            Err(e) => {
                warn!(error = %e, "audit: failed to read last entry");
                return None;
            }
        };

        let input = AuditInput {
            device_id: Some(device_id.to_string()),
            actor,
            action,
            subject_kind,
            subject_id,
            payload_json,
        };

        let entry = match append(input, prev.as_ref(), &signing_key, OffsetDateTime::now_utc()) {
            Ok(e) => e,
            Err(e) => {
                warn!(error = %e, "audit: append failed");
                return None;
            }
        };

        if let Err(e) = repo.insert(&entry).await {
            warn!(error = %e, "audit: insert failed");
            return None;
        }

        Some(entry)
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use api_vault_audit::{verify, AuditActor};
    use api_vault_core::DevicePlatform;
    use api_vault_storage::sqlite::init_pool;
    use api_vault_storage::vault::mock::MockVaultStorage;
    use api_vault_storage::vault::VaultStorage as _;
    use tokio::sync::RwLock;

    use crate::services::device_identity::{ensure_device_keys, DeviceIdentity};

    use super::*;

    // -----------------------------------------------------------------------
    // Helpers shared across tests
    // -----------------------------------------------------------------------

    async fn unlocked_vault() -> Arc<RwLock<Box<dyn api_vault_storage::vault::VaultStorage + Send + Sync>>> {
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

    fn make_ctx(
        pool: Arc<sqlx::SqlitePool>,
        identity: Option<DeviceIdentity>,
    ) -> AuditCtx {
        let di = Arc::new(RwLock::new(identity));
        AuditCtx::new(pool, di)
    }

    // -----------------------------------------------------------------------
    // T1: identity not set → returns None, no DB row
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn record_without_identity_returns_none() {
        let (_dir, pool) = make_pool().await;
        let pool = Arc::new(pool);
        let ctx = make_ctx(pool.clone(), None);

        let result = ctx
            .record(
                AuditActor::LocalUser,
                "credential.create",
                "credential",
                "some-id",
                None,
            )
            .await;

        assert!(result.is_none(), "should return None when identity missing");

        // Confirm no DB row was inserted
        let count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM audit_log")
            .fetch_one(pool.as_ref())
            .await
            .unwrap();
        assert_eq!(count.0, 0, "no row should be inserted when identity missing");
    }

    // -----------------------------------------------------------------------
    // T2: with identity → inserts one row
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn record_with_identity_inserts_row() {
        let vault = unlocked_vault().await;
        let (_dir, pool) = make_pool().await;
        let pool = Arc::new(pool);
        let identity = make_identity(vault, pool.as_ref()).await;

        let ctx = make_ctx(pool.clone(), Some(identity));

        let result = ctx
            .record(
                AuditActor::LocalUser,
                "credential.create",
                "credential",
                "cred-01",
                Some(r#"{"name":"My Key"}"#.to_string()),
            )
            .await;

        assert!(result.is_some(), "should return Some(entry)");
        let entry = result.unwrap();
        assert_eq!(entry.seq, 0);
        assert_eq!(entry.action, "credential.create");

        let count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM audit_log")
            .fetch_one(pool.as_ref())
            .await
            .unwrap();
        assert_eq!(count.0, 1, "one row should be in audit_log");
    }

    // -----------------------------------------------------------------------
    // T3: two records → seq 0, 1 with correct prev_hash linkage
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn record_chains_entries() {
        let vault = unlocked_vault().await;
        let (_dir, pool) = make_pool().await;
        let pool = Arc::new(pool);
        let identity = make_identity(vault, pool.as_ref()).await;

        let ctx = make_ctx(pool.clone(), Some(identity));

        let e0 = ctx
            .record(AuditActor::LocalUser, "credential.create", "credential", "c1", None)
            .await
            .unwrap();
        let e1 = ctx
            .record(AuditActor::LocalUser, "credential.update", "credential", "c1", None)
            .await
            .unwrap();

        assert_eq!(e0.seq, 0);
        assert_eq!(e1.seq, 1);
        assert_eq!(e1.prev_hash, e0.entry_hash, "prev_hash of e1 must equal entry_hash of e0");
    }

    // -----------------------------------------------------------------------
    // T4: concurrent record calls → each gets a distinct seq (no TOCTOU)
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn record_serializes_concurrent_calls() {
        let vault = unlocked_vault().await;
        let (_dir, pool) = make_pool().await;
        let pool = Arc::new(pool);
        let identity = make_identity(vault, pool.as_ref()).await;

        let ctx = Arc::new(make_ctx(pool.clone(), Some(identity)));

        let (r0, r1, r2) = tokio::join!(
            ctx.record(AuditActor::LocalUser, "concurrent.a", "test", "id0", None),
            ctx.record(AuditActor::LocalUser, "concurrent.b", "test", "id1", None),
            ctx.record(AuditActor::LocalUser, "concurrent.c", "test", "id2", None),
        );

        let e0 = r0.expect("record 0 must succeed");
        let e1 = r1.expect("record 1 must succeed");
        let e2 = r2.expect("record 2 must succeed");

        // seq 는 0, 1, 2 여야 하며 모두 달라야 한다.
        let mut seqs = [e0.seq, e1.seq, e2.seq];
        seqs.sort();
        assert_eq!(seqs, [0, 1, 2], "concurrent records must have distinct seqs: {:?}", seqs);
    }

    // -----------------------------------------------------------------------
    // T5: three records → fetch all, verify chain
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn record_verifies_against_chain() {
        let vault = unlocked_vault().await;
        let (_dir, pool) = make_pool().await;
        let pool = Arc::new(pool);
        let identity = make_identity(vault, pool.as_ref()).await;
        let verifying_key = identity.signing_key.verifying_key();

        let ctx = make_ctx(pool.clone(), Some(identity));

        ctx.record(AuditActor::LocalUser, "credential.create", "credential", "c1", None)
            .await
            .unwrap();
        ctx.record(AuditActor::LocalUser, "credential.update", "credential", "c1", None)
            .await
            .unwrap();
        ctx.record(AuditActor::LocalUser, "credential.delete", "credential", "c1", None)
            .await
            .unwrap();

        // Fetch all entries for this device and verify
        let repo = AuditRepo::new(pool.as_ref());
        let all = repo.list_for_verify().await.unwrap();
        assert_eq!(all.len(), 3);

        let result = verify(&all, &verifying_key);
        assert_eq!(result.valid_count, 3);
        assert_eq!(result.first_invalid_seq, None, "chain must be fully valid");
    }
}
