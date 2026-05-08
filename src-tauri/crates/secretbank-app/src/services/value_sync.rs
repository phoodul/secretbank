//! M9 Phase F-2 — value sync service.
//!
//! 책임:
//!   1. **push** — vault 의 credential value 를 AEAD 로 암호화 후 relay 의
//!      `POST /sync/values` 로 전송.
//!   2. **pull_since** — relay 의 `GET /sync/values?since=<ms>` 결과를 받아
//!      각 envelope 을 복호 → vault 에 upsert. 변경된 credential id 반환.
//!
//! Zero-Knowledge: relay 는 envelope 만 보관, 평문은 절대 모름. AEAD key 는
//! `value-root` HKDF subkey of `auth_session.enc_key` — Phase B-3 의 sync
//! root 와 다른 도메인.
//!
//! AAD = `user:<userId>:cred:<credentialId>` — cross-user / cross-credential
//! replay 차단.

use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use secrecy::{ExposeSecret as _, SecretBox, SecretString};
use secretbank_crypto::{aead, kdf, AeadError, KdfError};
use secretbank_storage::vault::{SecretBytes, VaultError};
use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::context::AppContext;
use crate::services::relay_client::RelayError;
use crate::services::session::AuthSession;

/// HKDF info string for the value-channel subkey. Stable across releases —
/// 변경 시 모든 디바이스의 value envelope 복호화가 깨진다.
const VALUE_ROOT_LABEL: &str = "value-root";

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

#[derive(Debug, Error)]
pub enum ValueSyncError {
    /// Auth session 또는 enc_key 가 없음. UI 가 "Sign in / unlock" 안내.
    #[error("no sync session — sign in and unlock the vault to enable sync")]
    NoSyncSession,
    #[error("kdf: {0}")]
    Kdf(#[from] KdfError),
    #[error("aead: {0}")]
    Aead(#[from] AeadError),
    #[error("vault: {0}")]
    Vault(#[from] VaultError),
    #[error("relay: {0}")]
    Relay(#[from] RelayError),
    #[error("decode: {0}")]
    Decode(String),
    #[error("internal: {0}")]
    Internal(String),
}

// ---------------------------------------------------------------------------
// Wire types — relay endpoints (mirror routes/sync.ts)
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize)]
struct ValuePushBody<'a> {
    credential_id: &'a str,
    ciphertext_b64: String,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct ValuePushResponse {
    pub version: i64,
    pub updated_at: i64,
}

#[derive(Debug, Deserialize)]
struct ValueListResponse {
    values: Vec<EncryptedValueDto>,
}

#[derive(Debug, Deserialize)]
struct EncryptedValueDto {
    credential_id: String,
    version: i64,
    ciphertext_b64: String,
    updated_at: i64,
}

/// 호출자에게 노출되는 — pull 후 vault 에 적용된 ID 목록 entry.
#[derive(Debug, Clone, Serialize)]
pub struct PulledValueRecord {
    pub credential_id: String,
    pub version: i64,
    pub updated_at: i64,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Derive the value-channel root key from the active auth session.
fn derive_value_root_key(session: &AuthSession) -> Result<SecretBox<[u8; 32]>, ValueSyncError> {
    let enc_key = session
        .enc_key
        .as_ref()
        .ok_or(ValueSyncError::NoSyncSession)?;
    Ok(kdf::derive_subkey(enc_key, VALUE_ROOT_LABEL)?)
}

/// envelope-binding AAD: `user:<userId>:cred:<credentialId>`. AEAD verify 가
/// 다른 user / credential 의 ciphertext 재생을 차단.
fn aad_for(user_id: &str, credential_id: &str) -> Vec<u8> {
    format!("user:{user_id}:cred:{credential_id}").into_bytes()
}

// ---------------------------------------------------------------------------
// push
// ---------------------------------------------------------------------------

/// Encrypt + POST /sync/values. 호출 직전에 vault 에서 plaintext 를 읽고
/// 메모리에 들고 와도 되지만, 호출자가 이미 plaintext 를 가지고 있는 흐름을
/// 가정 (예: credential_create 가 새 value 를 막 받았을 때).
pub async fn push_value(
    ctx: &AppContext,
    credential_id: &str,
    plaintext_value: &SecretString,
) -> Result<ValuePushResponse, ValueSyncError> {
    let session_guard = ctx.auth_session.read().await;
    let session = session_guard
        .as_ref()
        .ok_or(ValueSyncError::NoSyncSession)?;

    let value_key = derive_value_root_key(session)?;
    let aad = aad_for(&session.user_id, credential_id);
    let envelope = aead::encrypt(&value_key, plaintext_value.expose_secret().as_bytes(), &aad)?;
    let body = ValuePushBody {
        credential_id,
        ciphertext_b64: B64.encode(&envelope),
    };
    let bearer = session.access_token.expose_secret().to_owned();
    drop(session_guard);

    let resp: ValuePushResponse = ctx
        .relay_client
        .post_json_authed("/sync/values", &bearer, &body)
        .await?;
    Ok(resp)
}

// ---------------------------------------------------------------------------
// pull_since
// ---------------------------------------------------------------------------

/// Fetch all values updated after `since_ms` and decrypt + write into the
/// local vault. Returns the metadata of every successfully applied row.
///
/// Decryption / vault upsert failures of individual rows are best-effort
/// skipped (warn-logged) so a single corrupted row doesn't block the
/// whole pull. Caller can re-pull later with the latest seen `updated_at`.
pub async fn pull_values_since(
    ctx: &AppContext,
    since_ms: i64,
) -> Result<Vec<PulledValueRecord>, ValueSyncError> {
    let session_guard = ctx.auth_session.read().await;
    let session = session_guard
        .as_ref()
        .ok_or(ValueSyncError::NoSyncSession)?;
    let value_key = derive_value_root_key(session)?;
    let user_id = session.user_id.clone();
    let bearer = session.access_token.expose_secret().to_owned();
    drop(session_guard);

    let path = format!("/sync/values?since={since_ms}");
    let list: ValueListResponse = ctx.relay_client.get_json_authed(&path, &bearer).await?;

    let mut applied: Vec<PulledValueRecord> = Vec::with_capacity(list.values.len());
    for ev in list.values {
        let envelope = match B64.decode(&ev.ciphertext_b64) {
            Ok(b) => b,
            Err(e) => {
                tracing::warn!(
                    credential_id = %ev.credential_id,
                    error = %e,
                    "value pull: base64 decode failed, skipping"
                );
                continue;
            }
        };
        let aad = aad_for(&user_id, &ev.credential_id);
        let plaintext = match aead::decrypt(&value_key, &envelope, &aad) {
            Ok(p) => p,
            Err(e) => {
                tracing::warn!(
                    credential_id = %ev.credential_id,
                    error = %e,
                    "value pull: AEAD verify failed, skipping"
                );
                continue;
            }
        };
        // vault upsert
        let vault_ref = format!("credentials/{}", ev.credential_id);
        let secret = SecretBytes::new(plaintext);
        let mut vault = ctx.vault.write().await;
        if let Err(e) = vault.put_secret(&vault_ref, secret).await {
            tracing::warn!(
                credential_id = %ev.credential_id,
                error = %e,
                "value pull: vault put_secret failed, skipping"
            );
            continue;
        }
        drop(vault);

        applied.push(PulledValueRecord {
            credential_id: ev.credential_id,
            version: ev.version,
            updated_at: ev.updated_at,
        });
    }
    Ok(applied)
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
    use wiremock::matchers::{method, path, path_regex};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    use super::*;
    use crate::audit_ctx::AuditCtx;
    use crate::commands::kill_switch::{ConfirmTokenStore, IssuerConfirmTokenStore};
    use crate::services::device_identity::DeviceIdentity;
    use crate::services::relay_client::RelayClient;

    fn fake_session(user_id: &str, enc_byte: u8) -> AuthSession {
        AuthSession {
            user_id: user_id.to_owned(),
            access_token: SecretString::from("ax"),
            refresh_token: SecretString::from("rx"),
            expires_at: 1_700_000_000,
            salt_auth: Some("sa".into()),
            salt_enc: Some("se".into()),
            enc_key: Some(SecretBox::new(Box::new([enc_byte; 32]))),
        }
    }

    async fn make_ctx(server: &MockServer) -> (AppContext, tempfile::TempDir) {
        let dir = tempfile::tempdir().expect("tempdir");
        let pool = Arc::new(init_pool(&dir.path().join("test.db")).await.unwrap());
        let mut vault = MockVaultStorage::new("pw");
        vault
            .unlock(SecretString::from("pw".to_owned()))
            .await
            .unwrap();
        let vault_box: Box<dyn VaultStorage + Send + Sync> = Box::new(vault);

        let device_identity: Arc<RwLock<Option<DeviceIdentity>>> = Arc::new(RwLock::new(None));
        let audit = Arc::new(AuditCtx::new(pool.clone(), device_identity.clone()));
        let relay_client = Arc::new(RelayClient::new(Url::parse(&server.uri()).unwrap()).unwrap());

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
            pairing_session: Arc::new(RwLock::new(None)),
        };
        (ctx, dir)
    }

    #[tokio::test]
    async fn push_value_without_session_returns_no_sync_session() {
        let server = MockServer::start().await;
        let (ctx, _dir) = make_ctx(&server).await;
        let err = push_value(&ctx, "crd_x", &SecretString::from("v"))
            .await
            .unwrap_err();
        assert!(matches!(err, ValueSyncError::NoSyncSession));
    }

    #[tokio::test]
    async fn push_value_without_enc_key_returns_no_sync_session() {
        let server = MockServer::start().await;
        let (ctx, _dir) = make_ctx(&server).await;
        let mut s = fake_session("usr_alice", 0xAB);
        s.enc_key = None;
        *ctx.auth_session.write().await = Some(s);
        let err = push_value(&ctx, "crd_x", &SecretString::from("v"))
            .await
            .unwrap_err();
        assert!(matches!(err, ValueSyncError::NoSyncSession));
    }

    #[tokio::test]
    async fn push_value_encrypts_and_posts_envelope() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/sync/values"))
            .respond_with(
                ResponseTemplate::new(200)
                    .set_body_json(serde_json::json!({ "version": 1, "updated_at": 1700 })),
            )
            .mount(&server)
            .await;
        let (ctx, _dir) = make_ctx(&server).await;
        *ctx.auth_session.write().await = Some(fake_session("usr_alice", 0xAB));

        let resp = push_value(&ctx, "crd_1", &SecretString::from("super-secret-key"))
            .await
            .unwrap();
        assert_eq!(resp.version, 1);
        assert_eq!(resp.updated_at, 1700);

        // wiremock 의 received_requests 로 평문이 절대 들어가지 않았는지 검증.
        let recv = server.received_requests().await.unwrap();
        let body = std::str::from_utf8(&recv[0].body).unwrap();
        assert!(!body.contains("super-secret-key"));
        assert!(body.contains("ciphertext_b64"));
        assert!(body.contains("crd_1"));
    }

    #[tokio::test]
    async fn pull_values_since_decrypts_and_upserts_into_vault() {
        let server = MockServer::start().await;
        let session = fake_session("usr_alice", 0xCD);

        // 같은 키로 envelope 미리 만들기 (상호작용 검증).
        let value_key = derive_value_root_key(&session).unwrap();
        let aad = aad_for(&session.user_id, "crd_remote_1");
        let env = aead::encrypt(&value_key, b"remote-secret-payload", &aad).unwrap();
        let env_b64 = B64.encode(&env);

        Mock::given(method("GET"))
            .and(path_regex(r"^/sync/values"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "values": [{
                    "credential_id": "crd_remote_1",
                    "version": 3,
                    "ciphertext_b64": env_b64,
                    "updated_at": 1_710_000_000_000_i64,
                }]
            })))
            .mount(&server)
            .await;

        let (ctx, _dir) = make_ctx(&server).await;
        *ctx.auth_session.write().await = Some(session);

        let applied = pull_values_since(&ctx, 0).await.unwrap();
        assert_eq!(applied.len(), 1);
        assert_eq!(applied[0].credential_id, "crd_remote_1");
        assert_eq!(applied[0].version, 3);

        // vault 에 실제 저장됐는지 — get_secret 으로 확인.
        let vault = ctx.vault.read().await;
        let stored = vault.get_secret("credentials/crd_remote_1").await.unwrap();
        assert_eq!(stored.expose_secret(), b"remote-secret-payload");
    }

    #[tokio::test]
    async fn pull_values_skips_corrupted_envelope() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path_regex(r"^/sync/values"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "values": [{
                    "credential_id": "crd_bad",
                    "version": 1,
                    "ciphertext_b64": "AAAA",  // 길이가 nonce + tag 미달
                    "updated_at": 1_710_000_000_000_i64,
                }]
            })))
            .mount(&server)
            .await;

        let (ctx, _dir) = make_ctx(&server).await;
        *ctx.auth_session.write().await = Some(fake_session("usr_alice", 0xDE));

        let applied = pull_values_since(&ctx, 0).await.unwrap();
        assert_eq!(applied.len(), 0, "corrupted envelope must be skipped");
    }

    #[tokio::test]
    async fn round_trip_push_then_pull_decrypts_to_same_plaintext() {
        // 같은 user + 같은 enc_key 의 두 디바이스 시뮬레이션.
        let user_id = "usr_round";
        let enc_byte = 0xBE;

        let server = MockServer::start().await;

        // Push: relay 가 200 with version
        Mock::given(method("POST"))
            .and(path("/sync/values"))
            .respond_with(
                ResponseTemplate::new(200)
                    .set_body_json(serde_json::json!({ "version": 1, "updated_at": 1700 })),
            )
            .mount(&server)
            .await;

        let (ctx_a, _dir_a) = make_ctx(&server).await;
        *ctx_a.auth_session.write().await = Some(fake_session(user_id, enc_byte));

        push_value(&ctx_a, "crd_xy", &SecretString::from("plaintext-value-XY"))
            .await
            .unwrap();

        // 받은 envelope 을 직접 복호하는 가상 디바이스 B
        let recv = server.received_requests().await.unwrap();
        let last = recv.last().unwrap();
        let body: serde_json::Value = serde_json::from_slice(&last.body).unwrap();
        let env_b64 = body["ciphertext_b64"].as_str().unwrap().to_owned();
        let env = B64.decode(&env_b64).unwrap();

        let session_b = fake_session(user_id, enc_byte);
        let key_b = derive_value_root_key(&session_b).unwrap();
        let aad_b = aad_for(user_id, "crd_xy");
        let pt = aead::decrypt(&key_b, &env, &aad_b).unwrap();
        assert_eq!(&pt, b"plaintext-value-XY");
    }
}
