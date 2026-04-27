//! Tauri commands for authenticated relay sessions (M8 — T083 Phase B).
//!
//! Two flows in this phase:
//! 1. **Passkey** — frontend invokes `navigator.credentials.create / get` and
//!    forwards the resulting [`RegistrationResponseJSON`] / [`AuthenticationResponseJSON`]
//!    to the backend, which posts it to the relay's `/auth/passkey/*/verify`
//!    endpoint. The relay returns a JWT pair; we persist it via
//!    [`crate::services::session::save_session`] and surface a sanitised DTO
//!    (no secrets) to the UI.
//! 2. **OAuth + Refresh** are added in Phases C/D.
//!
//! WebAuthn `options` / `response` are passed through verbatim as
//! [`serde_json::Value`] — the relay is the source of truth for shape and
//! validation. The desktop only orchestrates the round-trip and persistence.

use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::State;
use thiserror::Error;

use api_vault_storage::vault::VaultError;

use crate::context::AppContext;
use crate::services::relay_client::RelayError;
use crate::services::session::{save_session, AuthSession, AuthTokensResponse};

// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------

/// Result of a successful Passkey verify (or future OAuth callback).
///
/// Deliberately omits `access_token` / `refresh_token`: the renderer never
/// needs them — all subsequent relay calls go through Tauri commands that
/// pull tokens from `AppContext::auth_session`.
#[derive(Debug, Serialize)]
pub struct AuthSessionDto {
    pub user_id: String,
    /// UNIX seconds when the access token expires.
    pub expires_at: i64,
}

/// Server `/auth/passkey/{register,assert}/start` response, forwarded to the
/// frontend so it can hand `options` to `navigator.credentials.*`.
///
/// `options` is opaque (PublicKeyCredential{Creation,Request}OptionsJSON);
/// the relay generates and validates it. `salt_auth` / `salt_enc` are
/// base64url 32-byte values consumed by T085 for KDF — Phase B passes them
/// through unchanged so a future task can wire them up without re-issuing
/// challenges.
#[derive(Debug, Serialize, Deserialize)]
pub struct PasskeyChallenge {
    pub user_id: String,
    pub options: serde_json::Value,
    pub salt_auth: String,
    pub salt_enc: String,
}

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

#[derive(Debug, Error, Serialize)]
#[serde(tag = "code", rename_all = "snake_case")]
pub enum AuthCommandError {
    /// The local age vault is locked — verify steps need to write the session.
    #[error("vault is locked — unlock the local vault before signing in")]
    VaultLocked,

    /// Caller supplied an empty / blank email.
    #[error("email is required")]
    EmptyEmail,

    /// Relay returned a non-2xx status. `body` is the verbatim JSON returned
    /// by the relay (`{ error, detail? }`) so the renderer can map error
    /// codes to localised messages.
    #[error("relay rejected request (HTTP {status}): {body}")]
    Relay { status: u16, body: String },

    /// Transport-level failure (DNS, TLS, timeout).
    #[error("relay network error: {message}")]
    Network { message: String },

    /// Anything else (decode error, vault I/O, …).
    #[error("internal: {message}")]
    Internal { message: String },
}

impl From<RelayError> for AuthCommandError {
    fn from(e: RelayError) -> Self {
        match e {
            RelayError::Network(m) => Self::Network { message: m },
            RelayError::BadStatus { status, body } => Self::Relay {
                status: status.as_u16(),
                body,
            },
            RelayError::Decode(m) => Self::Internal {
                message: format!("decode: {m}"),
            },
            RelayError::InvalidBaseUrl(m) => Self::Internal {
                message: format!("base_url: {m}"),
            },
        }
    }
}

impl From<VaultError> for AuthCommandError {
    fn from(e: VaultError) -> Self {
        match e {
            VaultError::NotUnlocked => Self::VaultLocked,
            other => Self::Internal {
                message: other.to_string(),
            },
        }
    }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/// Reject blank emails before hitting the network. The relay re-validates
/// against an RFC-friendly regex; this guard exists to keep cheap mistakes
/// out of the request log.
fn ensure_nonempty_email(email: &str) -> Result<(), AuthCommandError> {
    if email.trim().is_empty() {
        Err(AuthCommandError::EmptyEmail)
    } else {
        Ok(())
    }
}

/// Persist the relay's JWT pair into the vault and refresh the in-memory
/// `auth_session` cache, then return a sanitised DTO (no tokens).
async fn complete_session(
    state: &AppContext,
    tokens: AuthTokensResponse,
) -> Result<AuthSessionDto, AuthCommandError> {
    // SystemTime cannot fail here outside of clock-before-epoch scenarios that
    // would already have crashed the OS — treat as internal if it ever does.
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| AuthCommandError::Internal {
            message: format!("system clock: {e}"),
        })?
        .as_secs() as i64;

    let session = AuthSession::from_response(tokens, now);
    let dto = AuthSessionDto {
        user_id: session.user_id.clone(),
        expires_at: session.expires_at,
    };

    {
        let mut vault = state.vault.write().await;
        save_session(&mut vault, &session).await?;
    }
    {
        let mut auth = state.auth_session.write().await;
        *auth = Some(session);
    }

    Ok(dto)
}

/// `vault_unlocked` precheck — verify steps fail fast rather than burning a
/// WebAuthn challenge if the vault is locked.
async fn require_vault_unlocked(state: &AppContext) -> Result<(), AuthCommandError> {
    if !state.vault.read().await.is_unlocked().await {
        return Err(AuthCommandError::VaultLocked);
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Tauri commands — Passkey register
// ---------------------------------------------------------------------------

/// `POST /auth/passkey/register/start` — request a WebAuthn registration
/// challenge for `email` (creates the user row on first call).
///
/// The returned `options` is passed verbatim to `navigator.credentials.create`.
#[tauri::command]
pub async fn auth_passkey_register_start(
    email: String,
    state: State<'_, AppContext>,
) -> Result<PasskeyChallenge, AuthCommandError> {
    ensure_nonempty_email(&email)?;
    let body = serde_json::json!({ "email": email });
    let resp: PasskeyChallenge = state
        .relay_client
        .post_json("/auth/passkey/register/start", &body)
        .await?;
    Ok(resp)
}

/// `POST /auth/passkey/register/verify` — submit the WebAuthn attestation
/// response, persist the resulting JWT pair, and return a sanitised session
/// DTO.
///
/// `response` is the raw `RegistrationResponseJSON` produced by the browser.
#[tauri::command]
pub async fn auth_passkey_register_verify(
    email: String,
    response: serde_json::Value,
    state: State<'_, AppContext>,
) -> Result<AuthSessionDto, AuthCommandError> {
    ensure_nonempty_email(&email)?;
    require_vault_unlocked(&state).await?;

    let body = serde_json::json!({ "email": email, "response": response });
    let tokens: AuthTokensResponse = state
        .relay_client
        .post_json("/auth/passkey/register/verify", &body)
        .await?;
    complete_session(&state, tokens).await
}

// ---------------------------------------------------------------------------
// Tauri commands — Passkey assert (sign-in for an existing user)
// ---------------------------------------------------------------------------

/// `POST /auth/passkey/assert/start` — request an authentication challenge.
#[tauri::command]
pub async fn auth_passkey_assert_start(
    email: String,
    state: State<'_, AppContext>,
) -> Result<PasskeyChallenge, AuthCommandError> {
    ensure_nonempty_email(&email)?;
    let body = serde_json::json!({ "email": email });
    let resp: PasskeyChallenge = state
        .relay_client
        .post_json("/auth/passkey/assert/start", &body)
        .await?;
    Ok(resp)
}

/// `POST /auth/passkey/assert/verify` — verify the WebAuthn assertion and
/// activate the session.
#[tauri::command]
pub async fn auth_passkey_assert_verify(
    email: String,
    response: serde_json::Value,
    state: State<'_, AppContext>,
) -> Result<AuthSessionDto, AuthCommandError> {
    ensure_nonempty_email(&email)?;
    require_vault_unlocked(&state).await?;

    let body = serde_json::json!({ "email": email, "response": response });
    let tokens: AuthTokensResponse = state
        .relay_client
        .post_json("/auth/passkey/assert/verify", &body)
        .await?;
    complete_session(&state, tokens).await
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use api_vault_storage::sqlite::init_pool;
    use api_vault_storage::vault::mock::MockVaultStorage;
    use api_vault_storage::vault::VaultStorage;
    use secrecy::SecretString;
    use tokio::sync::{Mutex, RwLock};
    use url::Url;
    use wiremock::matchers::{body_json, method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    use super::*;
    use crate::audit_ctx::AuditCtx;
    use crate::commands::kill_switch::{ConfirmTokenStore, IssuerConfirmTokenStore};
    use crate::services::device_identity::DeviceIdentity;
    use crate::services::relay_client::RelayClient;
    use crate::services::session::load_session;

    /// Build an `AppContext` whose `relay_client` points at the supplied mock
    /// server and whose vault is unlocked. Returned `_dir` keeps the temp DB
    /// alive for the test lifetime.
    async fn make_ctx(server: &MockServer) -> (AppContext, tempfile::TempDir) {
        let dir = tempfile::tempdir().expect("tempdir");
        let pool = Arc::new(
            init_pool(&dir.path().join("test.db"))
                .await
                .expect("init_pool"),
        );

        let mut vault = MockVaultStorage::new("pw");
        vault.unlock(SecretString::from("pw".to_owned())).await.unwrap();
        let vault_box: Box<dyn VaultStorage + Send + Sync> = Box::new(vault);

        let device_identity: Arc<RwLock<Option<DeviceIdentity>>> = Arc::new(RwLock::new(None));
        let audit = Arc::new(AuditCtx::new(pool.clone(), device_identity.clone()));
        let relay_url = Url::parse(&server.uri()).expect("mock server url");
        let relay_client = Arc::new(RelayClient::new(relay_url).unwrap());

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
            relay_client,
            auth_session: Arc::new(RwLock::new(None)),
        };
        (ctx, dir)
    }

    /// Direct (non-Tauri-state) variants that exercise the same code paths as
    /// the `#[tauri::command]` wrappers. The Tauri runtime is not started in
    /// unit tests; see Phase E for E2E coverage.
    async fn direct_register_start(
        ctx: &AppContext,
        email: String,
    ) -> Result<PasskeyChallenge, AuthCommandError> {
        ensure_nonempty_email(&email)?;
        let body = serde_json::json!({ "email": email });
        Ok(ctx
            .relay_client
            .post_json("/auth/passkey/register/start", &body)
            .await?)
    }

    async fn direct_register_verify(
        ctx: &AppContext,
        email: String,
        response: serde_json::Value,
    ) -> Result<AuthSessionDto, AuthCommandError> {
        ensure_nonempty_email(&email)?;
        require_vault_unlocked(ctx).await?;
        let body = serde_json::json!({ "email": email, "response": response });
        let tokens: AuthTokensResponse = ctx
            .relay_client
            .post_json("/auth/passkey/register/verify", &body)
            .await?;
        complete_session(ctx, tokens).await
    }

    async fn direct_assert_verify(
        ctx: &AppContext,
        email: String,
        response: serde_json::Value,
    ) -> Result<AuthSessionDto, AuthCommandError> {
        ensure_nonempty_email(&email)?;
        require_vault_unlocked(ctx).await?;
        let body = serde_json::json!({ "email": email, "response": response });
        let tokens: AuthTokensResponse = ctx
            .relay_client
            .post_json("/auth/passkey/assert/verify", &body)
            .await?;
        complete_session(ctx, tokens).await
    }

    // -----------------------------------------------------------------------
    // 1. register_start: 200 → PasskeyChallenge 통과 (options + salts)
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn register_start_returns_challenge() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/auth/passkey/register/start"))
            .and(body_json(serde_json::json!({"email": "alice@example.com"})))
            .respond_with(
                ResponseTemplate::new(200).set_body_json(serde_json::json!({
                    "user_id": "usr_alice",
                    "options": { "challenge": "abc", "rp": { "name": "api-vault" } },
                    "salt_auth": "AAAA",
                    "salt_enc": "BBBB",
                })),
            )
            .mount(&server)
            .await;

        let (ctx, _dir) = make_ctx(&server).await;
        let challenge = direct_register_start(&ctx, "alice@example.com".into())
            .await
            .unwrap();

        assert_eq!(challenge.user_id, "usr_alice");
        assert_eq!(challenge.salt_auth, "AAAA");
        assert_eq!(challenge.salt_enc, "BBBB");
        assert_eq!(
            challenge.options.get("challenge").and_then(|v| v.as_str()),
            Some("abc"),
        );
    }

    // -----------------------------------------------------------------------
    // 2. register_start: relay 400 (invalid_email) → Relay error + body 보존
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn register_start_relay_400_returns_relay_error() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/auth/passkey/register/start"))
            .respond_with(
                ResponseTemplate::new(400)
                    .set_body_json(serde_json::json!({"error": "invalid_email"})),
            )
            .mount(&server)
            .await;

        let (ctx, _dir) = make_ctx(&server).await;
        let err = direct_register_start(&ctx, "broken".into()).await.unwrap_err();
        match err {
            AuthCommandError::Relay { status, body } => {
                assert_eq!(status, 400);
                assert!(body.contains("invalid_email"), "got body={body}");
            }
            other => panic!("expected Relay, got {other:?}"),
        }
    }

    // -----------------------------------------------------------------------
    // 3. register_verify: 200 → AuthSession 영속 + DTO + 메모리 갱신
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn register_verify_persists_and_returns_dto() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/auth/passkey/register/verify"))
            .respond_with(
                ResponseTemplate::new(200).set_body_json(serde_json::json!({
                    "user_id": "usr_alice",
                    "access_token": "access-jwt",
                    "refresh_token": "refresh-jwt",
                    "token_type": "Bearer",
                    "expires_in": 3600,
                })),
            )
            .mount(&server)
            .await;

        let (ctx, _dir) = make_ctx(&server).await;
        let dto = direct_register_verify(
            &ctx,
            "alice@example.com".into(),
            serde_json::json!({ "id": "raw-attestation" }),
        )
        .await
        .unwrap();

        assert_eq!(dto.user_id, "usr_alice");
        assert!(dto.expires_at > 0, "expires_at must be set");

        // 메모리 캐시
        let in_mem = ctx.auth_session.read().await;
        assert!(in_mem.is_some(), "auth_session must be populated");
        assert_eq!(in_mem.as_ref().unwrap().user_id, "usr_alice");
        drop(in_mem);

        // 볼트 영속
        let vault_guard = ctx.vault.read().await;
        let loaded = load_session(vault_guard.as_ref()).await.unwrap();
        assert!(loaded.is_some(), "session must be persisted to vault");
        assert_eq!(loaded.unwrap().user_id, "usr_alice");
    }

    // -----------------------------------------------------------------------
    // 4. assert_verify: 200 → save_session 정상
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn assert_verify_persists_session() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/auth/passkey/assert/verify"))
            .respond_with(
                ResponseTemplate::new(200).set_body_json(serde_json::json!({
                    "user_id": "usr_bob",
                    "access_token": "ax",
                    "refresh_token": "rx",
                    "token_type": "Bearer",
                    "expires_in": 3600,
                })),
            )
            .mount(&server)
            .await;

        let (ctx, _dir) = make_ctx(&server).await;
        let dto = direct_assert_verify(
            &ctx,
            "bob@example.com".into(),
            serde_json::json!({ "id": "raw-assertion" }),
        )
        .await
        .unwrap();

        assert_eq!(dto.user_id, "usr_bob");
        let in_mem = ctx.auth_session.read().await;
        assert_eq!(in_mem.as_ref().unwrap().user_id, "usr_bob");
    }

    // -----------------------------------------------------------------------
    // 5. ensure_nonempty_email: blank → EmptyEmail (no network call)
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn empty_email_short_circuits_before_network() {
        let server = MockServer::start().await;
        // No mocks mounted — if the code attempts an HTTP call it will hit
        // the default 404 and return Relay, not EmptyEmail.
        let (ctx, _dir) = make_ctx(&server).await;
        let err = direct_register_start(&ctx, "   ".into()).await.unwrap_err();
        assert!(matches!(err, AuthCommandError::EmptyEmail));
    }

    // -----------------------------------------------------------------------
    // 6. require_vault_unlocked: locked vault → VaultLocked (verify only)
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn verify_with_locked_vault_returns_vault_locked() {
        let server = MockServer::start().await;
        let (ctx, _dir) = make_ctx(&server).await;

        // Lock the vault after make_ctx unlocked it.
        ctx.vault.write().await.lock().await.unwrap();

        let err = direct_register_verify(
            &ctx,
            "alice@example.com".into(),
            serde_json::json!({}),
        )
        .await
        .unwrap_err();
        assert!(matches!(err, AuthCommandError::VaultLocked));
    }
}
