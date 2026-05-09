//! Tauri commands for M9 Sync (Phase B-3+).
//!
//! Currently exposes the single `sync_get_root_key` command — the bridge
//! between the M8 auth `enc_key` (derived from passphrase + server salts)
//! and the M9 SecSync layer that needs a per-domain root key.
//!
//! All keys derived here are 32-byte HKDF-SHA256 subkeys of `enc_key`. The
//! desktop never transmits these to the relay — only ciphertext encrypted
//! under them. Zero-Knowledge invariant: relay sees only ciphertext.

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use secrecy::{ExposeSecret as _, SecretString};
use secretbank_crypto::{kdf, KdfError};
use serde::Serialize;
use tauri::State;
use thiserror::Error;

use crate::context::AppContext;
use crate::services::value_sync::{
    pull_values_since, push_value, PulledValueRecord, ValuePushResponse, ValueSyncError,
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// HKDF info string for the CRDT root key — must stay stable across releases
/// or every device's Y.Doc decryption breaks.
const CRDT_ROOT_LABEL: &str = "crdt-root";

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

#[derive(Debug, Error, Serialize)]
#[serde(tag = "code", rename_all = "snake_case")]
pub enum SyncCommandError {
    /// `auth_session.enc_key` is `None` — either the user never signed in,
    /// the master passphrase wasn't available during the last unlock, or the
    /// session was cleared. The renderer surfaces this as "sync inactive".
    #[error("no sync session — sign in and unlock the vault to enable sync")]
    NoSyncSession,

    /// HKDF failure — should never happen with our 32-byte input but mapped
    /// for completeness.
    #[error("kdf error: {0}")]
    Kdf(String),

    /// Empty / blank input from caller (credential_id, plaintext, etc.).
    #[error("missing required field: {field}")]
    MissingField { field: String },

    /// Relay HTTP error.
    #[error("relay rejected request (HTTP {status}): {body}")]
    Relay { status: u16, body: String },

    /// Transport-level failure (DNS, TLS, timeout).
    #[error("relay network error: {message}")]
    Network { message: String },

    /// AEAD / vault / decode etc.
    #[error("internal: {message}")]
    Internal { message: String },
}

impl From<KdfError> for SyncCommandError {
    fn from(e: KdfError) -> Self {
        Self::Kdf(e.to_string())
    }
}

impl From<ValueSyncError> for SyncCommandError {
    fn from(e: ValueSyncError) -> Self {
        match e {
            ValueSyncError::NoSyncSession => Self::NoSyncSession,
            ValueSyncError::Kdf(k) => Self::Kdf(k.to_string()),
            ValueSyncError::Relay(r) => match r {
                crate::services::relay_client::RelayError::BadStatus { status, body } => {
                    Self::Relay {
                        status: status.as_u16(),
                        body,
                    }
                }
                crate::services::relay_client::RelayError::Network(m) => {
                    Self::Network { message: m }
                }
                other => Self::Internal {
                    message: other.to_string(),
                },
            },
            ValueSyncError::Aead(a) => Self::Internal {
                message: a.to_string(),
            },
            ValueSyncError::Vault(v) => Self::Internal {
                message: v.to_string(),
            },
            ValueSyncError::Decode(m) | ValueSyncError::Internal(m) => {
                Self::Internal { message: m }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Tauri command — sync_get_relay_url
// ---------------------------------------------------------------------------

/// Return the resolved relay base URL — same value `RelayClient` is using
/// internally. Used by the renderer's `RelayTransport` (Phase E-4b) so that
/// frontend and backend always agree on the relay endpoint, regardless of
/// SQLite settings overrides or build-profile defaults.
#[tauri::command]
pub async fn sync_get_relay_url(state: State<'_, AppContext>) -> Result<String, SyncCommandError> {
    Ok(state.relay_client.base_url().to_string())
}

// ---------------------------------------------------------------------------
// Tauri commands — value sync (Phase F-2)
// ---------------------------------------------------------------------------

/// Push a credential's plaintext value to the relay's value channel.
///
/// 호출자는 이미 plaintext 를 가지고 있어야 한다 (예: credential_create /
/// credential_rotate_value 직후). 이 커맨드 안에서는 vault 에 추가로 쓰지
/// 않는다 — 호출자가 본 명령 호출 직후 vault.put_secret 도 한다.
#[tauri::command]
pub async fn sync_value_push(
    credential_id: String,
    value: String,
    state: State<'_, AppContext>,
) -> Result<ValuePushResponse, SyncCommandError> {
    if credential_id.trim().is_empty() {
        return Err(SyncCommandError::MissingField {
            field: "credential_id".into(),
        });
    }
    if value.is_empty() {
        return Err(SyncCommandError::MissingField {
            field: "value".into(),
        });
    }
    let plaintext = SecretString::from(value);
    let resp = push_value(&state, &credential_id, &plaintext).await?;
    Ok(resp)
}

/// Pull values updated after `since_ms` and apply them to the local vault.
/// Returns metadata of every successfully applied row.
#[tauri::command]
pub async fn sync_value_pull_since(
    since_ms: i64,
    state: State<'_, AppContext>,
) -> Result<Vec<PulledValueRecord>, SyncCommandError> {
    if since_ms < 0 {
        return Err(SyncCommandError::MissingField {
            field: "since_ms (must be >= 0)".into(),
        });
    }
    let applied = pull_values_since(&state, since_ms).await?;
    Ok(applied)
}

// ---------------------------------------------------------------------------
// Tauri command — sync_get_root_key
// ---------------------------------------------------------------------------

/// Return the base64url-encoded CRDT root key for this device + signed-in
/// user.
///
/// Derivation:
///   crdt_root = HKDF-SHA256(enc_key, info="crdt-root")
///
/// Determinism: identical for the same `(passphrase, salt_enc)` pair across
/// devices, which is exactly what M9 sync needs to decrypt CRDT documents
/// produced on a sibling device.
///
/// Returns [`SyncCommandError::NoSyncSession`] when there is no active
/// session or its `enc_key` was not derived (typical first-boot or the user
/// signed in without the passphrase available — Phase B-2 graceful-degrade
/// path). Frontend should surface a "Sign in / unlock to enable sync"
/// message.
#[tauri::command]
pub async fn sync_get_root_key(state: State<'_, AppContext>) -> Result<String, SyncCommandError> {
    let session_guard = state.auth_session.read().await;
    let session = session_guard
        .as_ref()
        .ok_or(SyncCommandError::NoSyncSession)?;
    let enc_key = session
        .enc_key
        .as_ref()
        .ok_or(SyncCommandError::NoSyncSession)?;

    let crdt_root = kdf::derive_subkey(enc_key, CRDT_ROOT_LABEL)?;
    Ok(URL_SAFE_NO_PAD.encode(crdt_root.expose_secret()))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use secrecy::{SecretBox, SecretString};
    use secretbank_storage::sqlite::init_pool;
    use secretbank_storage::vault::mock::MockVaultStorage;
    use secretbank_storage::vault::VaultStorage;
    use tokio::sync::{Mutex, RwLock};
    use url::Url;

    use super::*;
    use crate::audit_ctx::AuditCtx;
    use crate::commands::kill_switch::{ConfirmTokenStore, IssuerConfirmTokenStore};
    use crate::services::device_identity::DeviceIdentity;
    use crate::services::relay_client::RelayClient;
    use crate::services::session::AuthSession;

    /// Pure helper exercising the same logic path as the Tauri command — keeps
    /// tests free of the Tauri runtime.
    async fn direct_get_root_key(ctx: &AppContext) -> Result<String, SyncCommandError> {
        let session_guard = ctx.auth_session.read().await;
        let session = session_guard
            .as_ref()
            .ok_or(SyncCommandError::NoSyncSession)?;
        let enc_key = session
            .enc_key
            .as_ref()
            .ok_or(SyncCommandError::NoSyncSession)?;
        let crdt_root = kdf::derive_subkey(enc_key, CRDT_ROOT_LABEL)?;
        Ok(URL_SAFE_NO_PAD.encode(crdt_root.expose_secret()))
    }

    async fn make_ctx_minimal() -> (AppContext, tempfile::TempDir) {
        let dir = tempfile::tempdir().expect("tempdir");
        let pool = Arc::new(
            init_pool(&dir.path().join("test.db"))
                .await
                .expect("init_pool"),
        );
        let mut vault = MockVaultStorage::new("pw");
        vault
            .unlock(SecretString::from("pw".to_owned()))
            .await
            .unwrap();
        let vault_box: Box<dyn VaultStorage + Send + Sync> = Box::new(vault);

        let device_identity: Arc<RwLock<Option<DeviceIdentity>>> = Arc::new(RwLock::new(None));
        let audit = Arc::new(AuditCtx::new(pool.clone(), device_identity.clone()));
        let relay_client =
            Arc::new(RelayClient::new(Url::parse("http://localhost").unwrap()).unwrap());

        let ctx = AppContext {
            vault: Arc::new(RwLock::new(vault_box)),
            pool,
            data_dir: dir.path().to_path_buf(),
            user_id: "test".to_owned(),
            clipboard_controller: Arc::new(Mutex::new(None)),
            feed_scheduler: Arc::new(Mutex::new(None)),
            device_identity,
            audit,
            kill_switch_tokens: Arc::new(ConfirmTokenStore::default()),
            issuer_kill_switch_tokens: Arc::new(IssuerConfirmTokenStore::default()),
            import_sessions: Arc::new(crate::import::ImportSessionStore::new()),
            relay_client,
            auth_session: Arc::new(RwLock::new(None)),
            master_passphrase: Arc::new(RwLock::new(None)),
            db_change_emitter: crate::services::sync_emit::noop_emitter(),
            nm_bridge: Arc::new(Mutex::new(None)),
            pairing_session: Arc::new(RwLock::new(None)),
        };
        (ctx, dir)
    }

    fn fake_session_with_enc_key(bytes: [u8; 32]) -> AuthSession {
        AuthSession {
            user_id: "usr_test".into(),
            access_token: SecretString::from("ax"),
            refresh_token: SecretString::from("rx"),
            expires_at: 1_700_000_000,
            salt_auth: Some("salt-a".into()),
            salt_enc: Some("salt-e".into()),
            enc_key: Some(SecretBox::new(Box::new(bytes))),
        }
    }

    /// happy path: session has enc_key → command returns 32-byte base64url string.
    #[tokio::test]
    async fn returns_base64url_root_key_when_enc_key_present() {
        let (ctx, _dir) = make_ctx_minimal().await;
        *ctx.auth_session.write().await = Some(fake_session_with_enc_key([0xCD; 32]));

        let key_b64 = direct_get_root_key(&ctx).await.unwrap();
        let decoded = URL_SAFE_NO_PAD.decode(&key_b64).unwrap();
        assert_eq!(decoded.len(), 32, "root key must be 32 bytes");
    }

    /// Determinism: same enc_key → same root key (sync correctness invariant).
    #[tokio::test]
    async fn root_key_is_deterministic() {
        let (ctx, _dir) = make_ctx_minimal().await;
        *ctx.auth_session.write().await = Some(fake_session_with_enc_key([0x01; 32]));
        let k1 = direct_get_root_key(&ctx).await.unwrap();
        let k2 = direct_get_root_key(&ctx).await.unwrap();
        assert_eq!(k1, k2);
    }

    /// Different enc_key → different root key (Zero-Knowledge invariant).
    #[tokio::test]
    async fn root_key_differs_for_different_enc_keys() {
        let (ctx_a, _da) = make_ctx_minimal().await;
        *ctx_a.auth_session.write().await = Some(fake_session_with_enc_key([0x01; 32]));
        let (ctx_b, _db) = make_ctx_minimal().await;
        *ctx_b.auth_session.write().await = Some(fake_session_with_enc_key([0x02; 32]));

        let ka = direct_get_root_key(&ctx_a).await.unwrap();
        let kb = direct_get_root_key(&ctx_b).await.unwrap();
        assert_ne!(ka, kb);
    }

    /// No session at all → NoSyncSession.
    #[tokio::test]
    async fn no_session_returns_no_sync_session() {
        let (ctx, _dir) = make_ctx_minimal().await;
        let err = direct_get_root_key(&ctx).await.unwrap_err();
        assert!(matches!(err, SyncCommandError::NoSyncSession));
    }

    /// Session exists but enc_key is None (Phase B-2 graceful-degrade case)
    /// → NoSyncSession. Frontend can prompt the user to lock+unlock to retry.
    #[tokio::test]
    async fn session_without_enc_key_returns_no_sync_session() {
        let (ctx, _dir) = make_ctx_minimal().await;
        *ctx.auth_session.write().await = Some(AuthSession {
            user_id: "usr_test".into(),
            access_token: SecretString::from("ax"),
            refresh_token: SecretString::from("rx"),
            expires_at: 1_700_000_000,
            salt_auth: Some("salt-a".into()),
            salt_enc: Some("salt-e".into()),
            enc_key: None,
        });
        let err = direct_get_root_key(&ctx).await.unwrap_err();
        assert!(matches!(err, SyncCommandError::NoSyncSession));
    }

    // -----------------------------------------------------------------------
    // M9 Phase E-4b — sync_get_relay_url
    // -----------------------------------------------------------------------

    /// Direct variant — exercises the same logic without the State extractor.
    async fn direct_get_relay_url(ctx: &AppContext) -> Result<String, SyncCommandError> {
        Ok(ctx.relay_client.base_url().to_string())
    }

    #[tokio::test]
    async fn get_relay_url_returns_relay_client_base_url() {
        let (ctx, _dir) = make_ctx_minimal().await;
        let url = direct_get_relay_url(&ctx).await.unwrap();
        // make_ctx_minimal 가 RelayClient 를 http://localhost 로 만든다 — Url
        // 의 정규화로 trailing slash 가 붙는다.
        assert_eq!(url, "http://localhost/");
    }
}
