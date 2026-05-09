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

use secretbank_storage::vault::VaultError;

use crate::context::AppContext;
use crate::services::relay_client::RelayError;
use crate::services::session::{
    derive_session_keys, save_session, AuthSession, AuthTokensResponse, OAuthCallbackResponse,
};

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

    /// Caller supplied a provider that is not in the OAuth allow-list.
    #[error("unsupported oauth provider: {provider}")]
    UnsupportedProvider { provider: String },

    /// Caller supplied an empty `code` / `state` / `redirect_uri`.
    #[error("missing required field: {field}")]
    MissingField { field: String },

    /// `auth_refresh` was called with no signed-in session.
    #[error("no signed-in session — sign in again")]
    NoSession,

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

/// Allow-list of OAuth providers the desktop client knows how to handle.
///
/// Must stay aligned with the relay's `lib/oauth.ts:isProvider` predicate.
const ALLOWED_OAUTH_PROVIDERS: &[&str] = &["github", "google"];

/// Return the canonical (trimmed) provider slug if it is in the allow-list.
fn sanitise_provider(provider: &str) -> Result<&str, AuthCommandError> {
    let trimmed = provider.trim();
    if ALLOWED_OAUTH_PROVIDERS.contains(&trimmed) {
        Ok(trimmed)
    } else {
        Err(AuthCommandError::UnsupportedProvider {
            provider: trimmed.to_owned(),
        })
    }
}

fn ensure_nonblank(field: &str, value: &str) -> Result<(), AuthCommandError> {
    if value.trim().is_empty() {
        Err(AuthCommandError::MissingField {
            field: field.to_owned(),
        })
    } else {
        Ok(())
    }
}

/// Persist the relay's JWT pair into the vault and refresh the in-memory
/// `auth_session` cache, then return a sanitised DTO (no tokens).
///
/// **M9 Phase B-2**: when `new_salts` is supplied (Passkey verify flow), they
/// override the previously stored salts and `enc_key` is derived in place via
/// `derive_session_keys(master_passphrase, ...)`. When `new_salts` is `None`
/// (refresh / OAuth callback paths), pre-existing salts are preserved and
/// `enc_key` is re-derived from the same passphrase + persisted salts —
/// `derive_session_keys` is deterministic so the new enc_key matches the
/// previous one byte-for-byte.
///
/// If `master_passphrase` is unavailable (vault locked, which shouldn't happen
/// here because verify is gated behind `require_vault_unlocked`) or
/// `derive_session_keys` errors, the session is still saved but `enc_key` is
/// left as `None` — the user will sign in again or the next `vault_unlock`
/// hydration will retry.
async fn complete_session(
    state: &AppContext,
    tokens: AuthTokensResponse,
    new_salts: Option<(&str, &str)>,
) -> Result<AuthSessionDto, AuthCommandError> {
    // SystemTime cannot fail here outside of clock-before-epoch scenarios that
    // would already have crashed the OS — treat as internal if it ever does.
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| AuthCommandError::Internal {
            message: format!("system clock: {e}"),
        })?
        .as_secs() as i64;

    let mut session = AuthSession::from_response(tokens, now);

    // Preserve previously persisted salts across refresh/OAuth paths so we
    // don't lose enc_key derivation context. Verify paths overwrite below.
    {
        let prev = state.auth_session.read().await;
        if let Some(p) = prev.as_ref() {
            session.salt_auth = p.salt_auth.clone();
            session.salt_enc = p.salt_enc.clone();
        }
    }

    if let Some((sa, se)) = new_salts {
        session.salt_auth = Some(sa.to_owned());
        session.salt_enc = Some(se.to_owned());
    }

    // Derive enc_key from master_passphrase + salts when both are available.
    // Failure is non-fatal — sync stays inactive until the user re-unlocks.
    if let (Some(sa), Some(se)) = (session.salt_auth.as_ref(), session.salt_enc.as_ref()) {
        let mp = state.master_passphrase.read().await;
        if let Some(passphrase) = mp.as_ref() {
            match derive_session_keys(passphrase, sa, se) {
                Ok(derived) => {
                    session.enc_key = Some(derived.enc_key);
                }
                Err(e) => {
                    tracing::warn!(error = %e, "derive_session_keys failed during complete_session");
                }
            }
        } else {
            tracing::warn!("master_passphrase missing in complete_session — enc_key not derived");
        }
    }

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
///
/// Requires the local vault to be unlocked even though `start` itself does
/// not write the session — otherwise the user could complete the OS-level
/// PIN/biometric prompt (which registers the credential in the OS passkey
/// store) only to have `register/verify` reject the result with VaultLocked,
/// leaving the OS store and the server DB out of sync. The desync is
/// effectively unrecoverable from inside the app because the WebAuthn
/// privacy spec returns NotAllowedError instead of InvalidStateError on the
/// next attempt. (Discovered 2026-04-27 J2.)
#[tauri::command]
pub async fn auth_passkey_register_start(
    email: String,
    state: State<'_, AppContext>,
) -> Result<PasskeyChallenge, AuthCommandError> {
    ensure_nonempty_email(&email)?;
    require_vault_unlocked(&state).await?;
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
///
/// **M9 Phase B-2**: `salt_auth` / `salt_enc` are the values returned by
/// the matching `register/start` call — the frontend stashes them between
/// the start and verify steps and forwards them here so we can derive the
/// device's `enc_key` while `master_passphrase` is still hot.
#[tauri::command]
pub async fn auth_passkey_register_verify(
    email: String,
    response: serde_json::Value,
    salt_auth: String,
    salt_enc: String,
    state: State<'_, AppContext>,
) -> Result<AuthSessionDto, AuthCommandError> {
    ensure_nonempty_email(&email)?;
    require_vault_unlocked(&state).await?;
    ensure_nonblank("salt_auth", &salt_auth)?;
    ensure_nonblank("salt_enc", &salt_enc)?;

    let body = serde_json::json!({ "email": email, "response": response });
    let tokens: AuthTokensResponse = state
        .relay_client
        .post_json("/auth/passkey/register/verify", &body)
        .await?;
    complete_session(&state, tokens, Some((&salt_auth, &salt_enc))).await
}

// ---------------------------------------------------------------------------
// Tauri commands — Passkey assert (sign-in for an existing user)
// ---------------------------------------------------------------------------

/// `POST /auth/passkey/assert/start` — request an authentication challenge.
///
/// Same vault-unlock precheck as `register_start`: prevents asking the user
/// for biometric input that would be wasted by a `VaultLocked` failure at
/// the verify step.
#[tauri::command]
pub async fn auth_passkey_assert_start(
    email: String,
    state: State<'_, AppContext>,
) -> Result<PasskeyChallenge, AuthCommandError> {
    ensure_nonempty_email(&email)?;
    require_vault_unlocked(&state).await?;
    let body = serde_json::json!({ "email": email });
    let resp: PasskeyChallenge = state
        .relay_client
        .post_json("/auth/passkey/assert/start", &body)
        .await?;
    Ok(resp)
}

/// `POST /auth/passkey/assert/verify` — verify the WebAuthn assertion and
/// activate the session.
///
/// **M9 Phase B-2**: like `register_verify`, `salt_auth` / `salt_enc` come
/// from the matching `assert/start` response and are required for `enc_key`
/// derivation.
#[tauri::command]
pub async fn auth_passkey_assert_verify(
    email: String,
    response: serde_json::Value,
    salt_auth: String,
    salt_enc: String,
    state: State<'_, AppContext>,
) -> Result<AuthSessionDto, AuthCommandError> {
    ensure_nonempty_email(&email)?;
    require_vault_unlocked(&state).await?;
    ensure_nonblank("salt_auth", &salt_auth)?;
    ensure_nonblank("salt_enc", &salt_enc)?;

    let body = serde_json::json!({ "email": email, "response": response });
    let tokens: AuthTokensResponse = state
        .relay_client
        .post_json("/auth/passkey/assert/verify", &body)
        .await?;
    complete_session(&state, tokens, Some((&salt_auth, &salt_enc))).await
}

// ---------------------------------------------------------------------------
// Tauri commands — OAuth (GitHub + Google)
// ---------------------------------------------------------------------------

/// Result of `auth_oauth_start`.
///
/// `state` must round-trip back into [`auth_oauth_callback`] so the relay can
/// verify the redirect originates from the same desktop session that started
/// it. The browser is opened side-effectfully via `tauri-plugin-shell` —
/// the FE only needs `state` for the round-trip.
#[derive(Debug, Serialize, Deserialize)]
pub struct OAuthStartResponse {
    pub state: String,
    pub authorize_url: String,
}

/// Pure (no AppHandle) helper that performs the relay round-trip for
/// `auth_oauth_start`. Separated so unit tests can exercise the network path
/// without needing a Tauri runtime.
async fn fetch_oauth_authorize(
    state: &AppContext,
    provider: &str,
    redirect_uri: &str,
) -> Result<OAuthStartResponse, AuthCommandError> {
    let body = serde_json::json!({ "redirect_uri": redirect_uri });
    let resp: OAuthStartResponse = state
        .relay_client
        .post_json(&format!("/auth/oauth/{provider}/start"), &body)
        .await?;
    Ok(resp)
}

/// Pure helper for `auth_oauth_callback` — relay POST + persistence.
///
/// **M9 Phase B-4**: the relay's callback now ships `salt_auth` / `salt_enc`
/// alongside the JWT pair (the user record on the relay is provisioned with
/// these on first OAuth sign-in). Forward them to [`complete_session`] so
/// that — when the local vault was unlocked just before sign-in — `enc_key`
/// gets derived in the same flow as Passkey verify.
async fn exchange_oauth_callback(
    state: &AppContext,
    provider: &str,
    code: &str,
    oauth_state: &str,
) -> Result<AuthSessionDto, AuthCommandError> {
    let body = serde_json::json!({ "code": code, "state": oauth_state });
    let resp: OAuthCallbackResponse = state
        .relay_client
        .post_json(&format!("/auth/oauth/{provider}/callback"), &body)
        .await?;
    let salts = (resp.salt_auth.clone(), resp.salt_enc.clone());
    complete_session(state, resp.tokens, Some((&salts.0, &salts.1))).await
}

/// `POST /auth/oauth/:provider/start` + open the OS browser.
///
/// `redirect_uri` should be the desktop app's deep-link URL (e.g.
/// `Secretbank://auth/callback`). The relay echoes it inside the OAuth
/// `redirect_uri` query parameter so the provider redirects back to it after
/// the user consents.
#[tauri::command]
pub async fn auth_oauth_start(
    provider: String,
    redirect_uri: String,
    state: State<'_, AppContext>,
    app_handle: tauri::AppHandle,
) -> Result<OAuthStartResponse, AuthCommandError> {
    let provider = sanitise_provider(&provider)?.to_owned();
    ensure_nonblank("redirect_uri", &redirect_uri)?;

    let resp = fetch_oauth_authorize(&state, &provider, &redirect_uri).await?;

    // Open the browser only after the relay accepted the request — failing
    // earlier avoids spawning a browser tab the user cannot complete.
    open_external_url(&app_handle, &resp.authorize_url)?;

    Ok(resp)
}

/// `POST /auth/oauth/:provider/callback` — exchange `code` + `state` for a
/// JWT pair, then persist the session via [`complete_session`].
///
/// `oauth_state` is named separately to avoid colliding with Tauri's
/// `State<'_, AppContext>` injection.
#[tauri::command]
pub async fn auth_oauth_callback(
    provider: String,
    code: String,
    oauth_state: String,
    state: State<'_, AppContext>,
) -> Result<AuthSessionDto, AuthCommandError> {
    let provider = sanitise_provider(&provider)?.to_owned();
    require_vault_unlocked(&state).await?;
    ensure_nonblank("code", &code)?;
    ensure_nonblank("state", &oauth_state)?;

    exchange_oauth_callback(&state, &provider, &code, &oauth_state).await
}

/// Open `url` in the user's default browser via tauri-plugin-opener.
///
/// `tauri-plugin-shell::Shell::open` is deprecated in favour of the dedicated
/// opener plugin — both ship with this app, so we use the recommended path.
fn open_external_url(app: &tauri::AppHandle, url: &str) -> Result<(), AuthCommandError> {
    use tauri_plugin_opener::OpenerExt;
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| AuthCommandError::Internal {
            message: format!("opener open_url: {e}"),
        })
}

// ---------------------------------------------------------------------------
// Tauri commands — Refresh + session management (T086 client-side, T083)
// ---------------------------------------------------------------------------

/// `POST /auth/refresh` — exchange the stored refresh token for a brand-new
/// JWT pair (refresh rotation: every successful refresh invalidates the
/// previous refresh token by issuing a new one).
///
/// Idempotency: callers may invoke this whenever they observe a 401 from a
/// downstream relay endpoint; the stored session is replaced atomically and
/// the new pair is persisted to the vault before returning.
#[tauri::command]
pub async fn auth_refresh(
    state: State<'_, AppContext>,
) -> Result<AuthSessionDto, AuthCommandError> {
    use secrecy::ExposeSecret as _;
    require_vault_unlocked(&state).await?;

    // Read the refresh token without holding the auth_session lock during the
    // network call — the relay round-trip can take seconds and other commands
    // may want to read `user_id` from the session in the meantime.
    let refresh_token = {
        let guard = state.auth_session.read().await;
        match guard.as_ref() {
            Some(s) => s.refresh_token.expose_secret().to_owned(),
            None => return Err(AuthCommandError::NoSession),
        }
    };

    let body = serde_json::json!({ "refresh_token": refresh_token });
    let tokens: AuthTokensResponse = state.relay_client.post_json("/auth/refresh", &body).await?;
    // Refresh: rotate tokens but keep previously persisted salts. complete_session
    // copies them from auth_session and re-derives enc_key deterministically.
    complete_session(&state, tokens, None).await
}

/// Clear the persisted session and the in-memory cache.
///
/// Returns `Ok(())` even when no session exists — sign-out is idempotent so
/// the renderer can call it during boot without first checking status.
#[tauri::command]
pub async fn auth_signout(state: State<'_, AppContext>) -> Result<(), AuthCommandError> {
    use crate::services::session::clear_session;

    require_vault_unlocked(&state).await?;

    {
        let mut vault = state.vault.write().await;
        clear_session(&mut vault).await?;
    }
    {
        let mut auth = state.auth_session.write().await;
        *auth = None;
    }
    Ok(())
}

/// **M9 Phase E-4b** — return the in-memory access token so the renderer's
/// RelayTransport can attach it as a Bearer header.
///
/// Returns [`AuthCommandError::NoSession`] when there is no signed-in session.
/// Token rotation: callers must re-invoke this on every relay request — when
/// `auth_refresh` rotates tokens, the next call here returns the fresh value.
///
/// **Why expose the token to the renderer**: the RelayTransport runs in the
/// frontend (Phase E-4a) and needs to attach `Authorization: Bearer <token>`.
/// Tauri commands already carry tokens between renderer and backend on every
/// auth command, so the additional surface here is minimal — and the renderer
/// never persists the token (it's a transient string handed to fetch).
#[tauri::command]
pub async fn auth_get_access_token(
    state: State<'_, AppContext>,
) -> Result<String, AuthCommandError> {
    use secrecy::ExposeSecret as _;
    let guard = state.auth_session.read().await;
    let session = guard.as_ref().ok_or(AuthCommandError::NoSession)?;
    Ok(session.access_token.expose_secret().to_owned())
}

/// Return a sanitised view of the current session, or `None` when signed out.
///
/// Reads from the in-memory cache only — assumes [`hydrate_session_from_vault`]
/// (called immediately after `vault_unlock`) has already populated it.
#[tauri::command]
pub async fn auth_status(
    state: State<'_, AppContext>,
) -> Result<Option<AuthSessionDto>, AuthCommandError> {
    let guard = state.auth_session.read().await;
    Ok(guard.as_ref().map(|s| AuthSessionDto {
        user_id: s.user_id.clone(),
        expires_at: s.expires_at,
    }))
}

/// Populate `AppContext.auth_session` from the vault — invoked once after
/// `vault_unlock` so the renderer's first `auth_status` call returns the
/// persisted session without a network hop.
///
/// **M9 Phase B-2**: when the loaded session has both `salt_auth` and
/// `salt_enc` persisted **and** `master_passphrase` is hot, we re-derive
/// `enc_key` in place so M9 sync can immediately consume it via
/// `sync_get_root_key`. `derive_session_keys` is deterministic, so the
/// resulting `enc_key` matches every previous device-local sign-in by the
/// same user.
///
/// Treats a missing or malformed on-disk session as no-session (the user will
/// be prompted to sign in again). enc_key derivation failure is non-fatal —
/// auth state is still hydrated, sync simply stays inactive.
pub async fn hydrate_session_from_vault(state: &AppContext) -> Result<(), AuthCommandError> {
    use crate::services::session::load_session;
    let loaded = {
        let vault = state.vault.read().await;
        load_session(vault.as_ref()).await.ok().flatten()
    };

    let mut session = match loaded {
        Some(s) => s,
        None => {
            let mut auth = state.auth_session.write().await;
            *auth = None;
            return Ok(());
        }
    };

    // Phase B-2: derive enc_key in place when prerequisites are met.
    if let (Some(sa), Some(se)) = (session.salt_auth.as_ref(), session.salt_enc.as_ref()) {
        let mp = state.master_passphrase.read().await;
        if let Some(passphrase) = mp.as_ref() {
            match derive_session_keys(passphrase, sa, se) {
                Ok(derived) => {
                    session.enc_key = Some(derived.enc_key);
                }
                Err(e) => {
                    tracing::warn!(error = %e, "derive_session_keys failed during hydrate");
                }
            }
        }
    }

    let mut auth = state.auth_session.write().await;
    *auth = Some(session);
    Ok(())
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use secrecy::SecretString;
    use secretbank_storage::sqlite::init_pool;
    use secretbank_storage::vault::mock::MockVaultStorage;
    use secretbank_storage::vault::VaultStorage;
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
        vault
            .unlock(SecretString::from("pw".to_owned()))
            .await
            .unwrap();
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

    /// Direct (non-Tauri-state) variants that exercise the same code paths as
    /// the `#[tauri::command]` wrappers. The Tauri runtime is not started in
    /// unit tests; see Phase E for E2E coverage.
    async fn direct_register_start(
        ctx: &AppContext,
        email: String,
    ) -> Result<PasskeyChallenge, AuthCommandError> {
        ensure_nonempty_email(&email)?;
        require_vault_unlocked(ctx).await?;
        let body = serde_json::json!({ "email": email });
        Ok(ctx
            .relay_client
            .post_json("/auth/passkey/register/start", &body)
            .await?)
    }

    async fn direct_assert_start(
        ctx: &AppContext,
        email: String,
    ) -> Result<PasskeyChallenge, AuthCommandError> {
        ensure_nonempty_email(&email)?;
        require_vault_unlocked(ctx).await?;
        let body = serde_json::json!({ "email": email });
        Ok(ctx
            .relay_client
            .post_json("/auth/passkey/assert/start", &body)
            .await?)
    }

    /// Test salts — properly base64url-encoded 32-byte values derived from
    /// `[1u8; 32]` and `[2u8; 32]`. Stored as constants so each test gets
    /// reproducible derivations.
    fn test_salt_auth() -> String {
        use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
        URL_SAFE_NO_PAD.encode([1u8; 32])
    }
    fn test_salt_enc() -> String {
        use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
        URL_SAFE_NO_PAD.encode([2u8; 32])
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
        let sa = test_salt_auth();
        let se = test_salt_enc();
        complete_session(ctx, tokens, Some((&sa, &se))).await
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
        let sa = test_salt_auth();
        let se = test_salt_enc();
        complete_session(ctx, tokens, Some((&sa, &se))).await
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
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "user_id": "usr_alice",
                "options": { "challenge": "abc", "rp": { "name": "secretbank" } },
                "salt_auth": "AAAA",
                "salt_enc": "BBBB",
            })))
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
        let err = direct_register_start(&ctx, "broken".into())
            .await
            .unwrap_err();
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
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "user_id": "usr_alice",
                "access_token": "access-jwt",
                "refresh_token": "refresh-jwt",
                "token_type": "Bearer",
                "expires_in": 3600,
            })))
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
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "user_id": "usr_bob",
                "access_token": "ax",
                "refresh_token": "rx",
                "token_type": "Bearer",
                "expires_in": 3600,
            })))
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

        let err = direct_register_verify(&ctx, "alice@example.com".into(), serde_json::json!({}))
            .await
            .unwrap_err();
        assert!(matches!(err, AuthCommandError::VaultLocked));
    }

    // -----------------------------------------------------------------------
    // 7. sanitise_provider: github / google → Ok, others → UnsupportedProvider
    // -----------------------------------------------------------------------
    #[test]
    fn sanitise_provider_allows_github_and_google() {
        assert_eq!(sanitise_provider("github").unwrap(), "github");
        assert_eq!(sanitise_provider(" google ").unwrap(), "google");
        let err = sanitise_provider("apple").unwrap_err();
        assert!(matches!(
            err,
            AuthCommandError::UnsupportedProvider { ref provider } if provider == "apple"
        ));
    }

    // -----------------------------------------------------------------------
    // 8. fetch_oauth_authorize: 200 → state + authorize_url 통과
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn fetch_oauth_authorize_returns_state_and_url() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/auth/oauth/github/start"))
            .and(body_json(
                serde_json::json!({"redirect_uri": "Secretbank://auth/callback"}),
            ))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "state": "deadbeef",
                "authorize_url": "https://github.com/login/oauth/authorize?client_id=x",
            })))
            .mount(&server)
            .await;

        let (ctx, _dir) = make_ctx(&server).await;
        let resp = fetch_oauth_authorize(&ctx, "github", "Secretbank://auth/callback")
            .await
            .unwrap();
        assert_eq!(resp.state, "deadbeef");
        assert!(resp.authorize_url.starts_with("https://github.com/"));
    }

    // -----------------------------------------------------------------------
    // 9. exchange_oauth_callback: 200 → AuthSession 저장 + DTO + 메모리 갱신
    //    M9 Phase B-4: relay 가 보내는 salt_auth/salt_enc 가 AuthSession 에
    //    저장되어야 한다 (master_passphrase 가 None 이라 enc_key derive 는
    //    skip — 별도 테스트에서 derive 검증).
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn exchange_oauth_callback_persists_session_and_records_salts() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/auth/oauth/github/callback"))
            .and(body_json(
                serde_json::json!({"code": "the-code", "state": "deadbeef"}),
            ))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "user_id": "usr_carol",
                "access_token": "ax",
                "refresh_token": "rx",
                "token_type": "Bearer",
                "expires_in": 3600,
                "salt_auth": test_salt_auth(),
                "salt_enc": test_salt_enc(),
            })))
            .mount(&server)
            .await;

        let (ctx, _dir) = make_ctx(&server).await;
        let dto = exchange_oauth_callback(&ctx, "github", "the-code", "deadbeef")
            .await
            .unwrap();
        assert_eq!(dto.user_id, "usr_carol");

        let in_mem = ctx.auth_session.read().await;
        let session = in_mem.as_ref().unwrap();
        assert_eq!(session.user_id, "usr_carol");
        assert_eq!(session.salt_auth, Some(test_salt_auth()));
        assert_eq!(session.salt_enc, Some(test_salt_enc()));
        // master_passphrase=None → enc_key 는 derive 안 됨
        assert!(
            session.enc_key.is_none(),
            "enc_key skipped without passphrase"
        );
    }

    // -----------------------------------------------------------------------
    // 9b. M9 Phase B-4: OAuth callback + master_passphrase set →
    //     enc_key 가 Passkey verify 와 동일하게 derive 된다.
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn exchange_oauth_callback_with_passphrase_derives_enc_key() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/auth/oauth/google/callback"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "user_id": "usr_dora",
                "access_token": "ax",
                "refresh_token": "rx",
                "token_type": "Bearer",
                "expires_in": 3600,
                "salt_auth": test_salt_auth(),
                "salt_enc": test_salt_enc(),
            })))
            .mount(&server)
            .await;

        let (ctx, _dir) = make_ctx_with_passphrase(&server, "correct horse battery").await;
        exchange_oauth_callback(&ctx, "google", "code", "state")
            .await
            .unwrap();

        let in_mem = ctx.auth_session.read().await;
        let session = in_mem.as_ref().unwrap();
        assert!(
            session.enc_key.is_some(),
            "OAuth callback must derive enc_key when passphrase is available"
        );
        assert_eq!(session.salt_auth, Some(test_salt_auth()));
        assert_eq!(session.salt_enc, Some(test_salt_enc()));
    }

    // -----------------------------------------------------------------------
    // 10. exchange_oauth_callback: relay 410 (state_expired) → Relay error
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn exchange_oauth_callback_state_expired_returns_relay_error() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/auth/oauth/google/callback"))
            .respond_with(
                ResponseTemplate::new(410)
                    .set_body_json(serde_json::json!({"error": "state_expired"})),
            )
            .mount(&server)
            .await;

        let (ctx, _dir) = make_ctx(&server).await;
        let err = exchange_oauth_callback(&ctx, "google", "code", "state")
            .await
            .unwrap_err();
        match err {
            AuthCommandError::Relay { status, body } => {
                assert_eq!(status, 410);
                assert!(body.contains("state_expired"));
            }
            other => panic!("expected Relay, got {other:?}"),
        }
    }

    // -----------------------------------------------------------------------
    // 11. ensure_nonblank: empty redirect_uri → MissingField
    // -----------------------------------------------------------------------
    #[test]
    fn ensure_nonblank_rejects_blank_string() {
        let err = ensure_nonblank("redirect_uri", "   ").unwrap_err();
        assert!(matches!(
            err,
            AuthCommandError::MissingField { ref field } if field == "redirect_uri"
        ));
    }

    // -----------------------------------------------------------------------
    // Phase D — Refresh + Session 관리 테스트
    // -----------------------------------------------------------------------

    /// Direct variant of `auth_refresh` (no Tauri State extractor).
    async fn direct_refresh(ctx: &AppContext) -> Result<AuthSessionDto, AuthCommandError> {
        use secrecy::ExposeSecret as _;
        require_vault_unlocked(ctx).await?;
        let refresh_token = {
            let guard = ctx.auth_session.read().await;
            match guard.as_ref() {
                Some(s) => s.refresh_token.expose_secret().to_owned(),
                None => return Err(AuthCommandError::NoSession),
            }
        };
        let body = serde_json::json!({ "refresh_token": refresh_token });
        let tokens: AuthTokensResponse = ctx.relay_client.post_json("/auth/refresh", &body).await?;
        complete_session(ctx, tokens, None).await
    }

    async fn direct_signout(ctx: &AppContext) -> Result<(), AuthCommandError> {
        use crate::services::session::clear_session;
        require_vault_unlocked(ctx).await?;
        {
            let mut vault = ctx.vault.write().await;
            clear_session(&mut vault).await?;
        }
        {
            let mut auth = ctx.auth_session.write().await;
            *auth = None;
        }
        Ok(())
    }

    // -----------------------------------------------------------------------
    // 12. auth_refresh: no session → NoSession (네트워크 호출 안 함)
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn refresh_without_session_returns_no_session() {
        let server = MockServer::start().await;
        // No mocks — direct_refresh must not reach the network.
        let (ctx, _dir) = make_ctx(&server).await;
        let err = direct_refresh(&ctx).await.unwrap_err();
        assert!(matches!(err, AuthCommandError::NoSession));
    }

    // -----------------------------------------------------------------------
    // 13. auth_refresh: stored refresh → 새 페어로 교체 (rotation)
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn refresh_replaces_session_with_new_pair() {
        let server = MockServer::start().await;
        // 1) seed a session via assert_verify
        Mock::given(method("POST"))
            .and(path("/auth/passkey/assert/verify"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "user_id": "usr_dave",
                "access_token": "old-access",
                "refresh_token": "old-refresh",
                "token_type": "Bearer",
                "expires_in": 3600,
            })))
            .mount(&server)
            .await;

        // 2) refresh: relay returns a brand-new pair
        Mock::given(method("POST"))
            .and(path("/auth/refresh"))
            .and(body_json(
                serde_json::json!({"refresh_token": "old-refresh"}),
            ))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "user_id": "usr_dave",
                "access_token": "NEW-access",
                "refresh_token": "NEW-refresh",
                "token_type": "Bearer",
                "expires_in": 3600,
            })))
            .mount(&server)
            .await;

        let (ctx, _dir) = make_ctx(&server).await;
        direct_assert_verify(
            &ctx,
            "dave@example.com".into(),
            serde_json::json!({ "id": "raw" }),
        )
        .await
        .unwrap();

        let dto = direct_refresh(&ctx).await.unwrap();
        assert_eq!(dto.user_id, "usr_dave");

        // In-memory session must hold the rotated tokens.
        use secrecy::ExposeSecret as _;
        let in_mem = ctx.auth_session.read().await;
        let session = in_mem.as_ref().unwrap();
        assert_eq!(session.access_token.expose_secret(), "NEW-access");
        assert_eq!(session.refresh_token.expose_secret(), "NEW-refresh");
    }

    // -----------------------------------------------------------------------
    // 14. auth_refresh: relay 401 (invalid_refresh_token) → Relay error
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn refresh_with_invalid_token_returns_relay_error() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/auth/refresh"))
            .respond_with(ResponseTemplate::new(401).set_body_json(
                serde_json::json!({"error": "invalid_refresh_token", "detail": "expired"}),
            ))
            .mount(&server)
            .await;

        let (ctx, _dir) = make_ctx(&server).await;
        // Inject a session manually so direct_refresh has something to send.
        {
            let mut auth = ctx.auth_session.write().await;
            *auth = Some(AuthSession {
                user_id: "usr_x".into(),
                access_token: SecretString::from("ax"),
                refresh_token: SecretString::from("expired-refresh"),
                expires_at: 0,
                salt_auth: None,
                salt_enc: None,
                enc_key: None,
            });
        }
        let err = direct_refresh(&ctx).await.unwrap_err();
        match err {
            AuthCommandError::Relay { status, body } => {
                assert_eq!(status, 401);
                assert!(body.contains("invalid_refresh_token"));
            }
            other => panic!("expected Relay, got {other:?}"),
        }
    }

    // -----------------------------------------------------------------------
    // 15. auth_signout: 메모리 + 볼트 모두 정리, 두 번 호출도 idempotent
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn signout_clears_memory_and_vault_idempotent() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/auth/passkey/assert/verify"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "user_id": "usr_eve",
                "access_token": "ax",
                "refresh_token": "rx",
                "token_type": "Bearer",
                "expires_in": 3600,
            })))
            .mount(&server)
            .await;

        let (ctx, _dir) = make_ctx(&server).await;
        direct_assert_verify(
            &ctx,
            "eve@example.com".into(),
            serde_json::json!({ "id": "raw" }),
        )
        .await
        .unwrap();

        // First sign-out.
        direct_signout(&ctx).await.unwrap();
        assert!(ctx.auth_session.read().await.is_none());
        let vault_guard = ctx.vault.read().await;
        let loaded = crate::services::session::load_session(vault_guard.as_ref())
            .await
            .unwrap();
        assert!(loaded.is_none());
        drop(vault_guard);

        // Second sign-out (no session) must succeed too.
        direct_signout(&ctx).await.unwrap();
    }

    // -----------------------------------------------------------------------
    // J2 hotfix: register_start 가드 — locked vault 일 때 즉시 거부 (PIN 인증
    // 후 verify 실패로 인한 OS↔DB 분리 방지)
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn register_start_with_locked_vault_returns_vault_locked() {
        let server = MockServer::start().await;
        // No mock — guard must short-circuit before the network call.
        let (ctx, _dir) = make_ctx(&server).await;
        ctx.vault.write().await.lock().await.unwrap();

        let err = direct_register_start(&ctx, "alice@example.com".into())
            .await
            .unwrap_err();
        assert!(matches!(err, AuthCommandError::VaultLocked));
    }

    // -----------------------------------------------------------------------
    // J2 hotfix: assert_start 가드 — 같은 이유로 locked vault 즉시 거부
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn assert_start_with_locked_vault_returns_vault_locked() {
        let server = MockServer::start().await;
        let (ctx, _dir) = make_ctx(&server).await;
        ctx.vault.write().await.lock().await.unwrap();

        let err = direct_assert_start(&ctx, "alice@example.com".into())
            .await
            .unwrap_err();
        assert!(matches!(err, AuthCommandError::VaultLocked));
    }

    // -----------------------------------------------------------------------
    // 16. hydrate_session_from_vault: 볼트에 있던 세션을 메모리로 복원
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn hydrate_loads_persisted_session_into_memory() {
        let server = MockServer::start().await;
        let (ctx, _dir) = make_ctx(&server).await;

        // Persist a session directly into the vault, leaving the in-memory
        // cache empty (simulating a fresh boot after vault_unlock).
        {
            let mut vault = ctx.vault.write().await;
            crate::services::session::save_session(
                &mut vault,
                &AuthSession {
                    user_id: "usr_frank".into(),
                    access_token: SecretString::from("ax"),
                    refresh_token: SecretString::from("rx"),
                    expires_at: 1_700_000_000,
                    salt_auth: None,
                    salt_enc: None,
                    enc_key: None,
                },
            )
            .await
            .unwrap();
        }
        assert!(ctx.auth_session.read().await.is_none());

        hydrate_session_from_vault(&ctx).await.unwrap();

        let in_mem = ctx.auth_session.read().await;
        assert_eq!(in_mem.as_ref().unwrap().user_id, "usr_frank");
    }

    // -----------------------------------------------------------------------
    // M9 Phase B-2 — complete_session derive + hydrate derive 회귀
    // -----------------------------------------------------------------------

    /// Helper: ctx with master_passphrase pre-populated for derive flows.
    async fn make_ctx_with_passphrase(
        server: &MockServer,
        passphrase: &str,
    ) -> (AppContext, tempfile::TempDir) {
        let (ctx, dir) = make_ctx(server).await;
        *ctx.master_passphrase.write().await = Some(SecretString::from(passphrase.to_owned()));
        (ctx, dir)
    }

    /// register/verify happy path now derives enc_key when salts + passphrase
    /// are both available — sync immediately usable post-sign-in.
    #[tokio::test]
    async fn register_verify_with_passphrase_derives_enc_key() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/auth/passkey/register/verify"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "user_id": "usr_alice",
                "access_token": "ax",
                "refresh_token": "rx",
                "token_type": "Bearer",
                "expires_in": 3600,
            })))
            .mount(&server)
            .await;

        let (ctx, _dir) = make_ctx_with_passphrase(&server, "correct horse battery").await;
        direct_register_verify(
            &ctx,
            "alice@example.com".into(),
            serde_json::json!({ "id": "raw" }),
        )
        .await
        .unwrap();

        let in_mem = ctx.auth_session.read().await;
        let session = in_mem.as_ref().unwrap();
        assert!(session.enc_key.is_some(), "enc_key must be derived");
        assert_eq!(session.salt_auth, Some(test_salt_auth()));
        assert_eq!(session.salt_enc, Some(test_salt_enc()));
    }

    /// When master_passphrase is missing (vault locked between unlock and
    /// verify — pathological case), enc_key derivation is skipped but the
    /// session still saves successfully so tokens are usable.
    #[tokio::test]
    async fn complete_session_without_passphrase_leaves_enc_key_none() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/auth/passkey/register/verify"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "user_id": "usr_alice",
                "access_token": "ax",
                "refresh_token": "rx",
                "token_type": "Bearer",
                "expires_in": 3600,
            })))
            .mount(&server)
            .await;

        // make_ctx leaves master_passphrase = None.
        let (ctx, _dir) = make_ctx(&server).await;
        direct_register_verify(
            &ctx,
            "alice@example.com".into(),
            serde_json::json!({ "id": "raw" }),
        )
        .await
        .unwrap();

        let in_mem = ctx.auth_session.read().await;
        let session = in_mem.as_ref().unwrap();
        assert!(
            session.enc_key.is_none(),
            "enc_key must be None when master_passphrase missing"
        );
        // salts still persisted so a future hydrate can finish the job.
        assert_eq!(session.salt_auth, Some(test_salt_auth()));
    }

    /// hydrate_session_from_vault re-derives enc_key when salts are persisted
    /// and master_passphrase is hot — this is the everyday path after the
    /// user re-locks/unlocks their vault.
    #[tokio::test]
    async fn hydrate_with_salts_and_passphrase_derives_enc_key() {
        let server = MockServer::start().await;
        let (ctx, _dir) = make_ctx_with_passphrase(&server, "battery horse staple").await;

        // Persist a session with salts but no enc_key (simulating disk state
        // after a previous vault_lock).
        {
            let mut vault = ctx.vault.write().await;
            save_session(
                &mut vault,
                &AuthSession {
                    user_id: "usr_grace".into(),
                    access_token: SecretString::from("ax"),
                    refresh_token: SecretString::from("rx"),
                    expires_at: 1_700_000_000,
                    salt_auth: Some(test_salt_auth()),
                    salt_enc: Some(test_salt_enc()),
                    enc_key: None,
                },
            )
            .await
            .unwrap();
        }
        assert!(ctx.auth_session.read().await.is_none());

        hydrate_session_from_vault(&ctx).await.unwrap();

        let in_mem = ctx.auth_session.read().await;
        let session = in_mem.as_ref().unwrap();
        assert_eq!(session.user_id, "usr_grace");
        assert!(session.enc_key.is_some(), "hydrate must derive enc_key");
    }

    /// hydrate without master_passphrase leaves enc_key None — the session is
    /// still usable for token-only operations but sync stays inactive.
    #[tokio::test]
    async fn hydrate_without_passphrase_leaves_enc_key_none() {
        let server = MockServer::start().await;
        let (ctx, _dir) = make_ctx(&server).await;

        {
            let mut vault = ctx.vault.write().await;
            save_session(
                &mut vault,
                &AuthSession {
                    user_id: "usr_henry".into(),
                    access_token: SecretString::from("ax"),
                    refresh_token: SecretString::from("rx"),
                    expires_at: 1_700_000_000,
                    salt_auth: Some(test_salt_auth()),
                    salt_enc: Some(test_salt_enc()),
                    enc_key: None,
                },
            )
            .await
            .unwrap();
        }

        hydrate_session_from_vault(&ctx).await.unwrap();

        let in_mem = ctx.auth_session.read().await;
        let session = in_mem.as_ref().unwrap();
        assert!(session.enc_key.is_none());
        // salts preserved for next hydrate attempt.
        assert!(session.salt_auth.is_some());
    }

    /// Refresh path: complete_session preserves previously persisted salts
    /// when called with new_salts=None, so the rotated session keeps its
    /// derive context.
    #[tokio::test]
    async fn refresh_preserves_persisted_salts() {
        let server = MockServer::start().await;

        // 1) seed a session with salts via assert_verify
        Mock::given(method("POST"))
            .and(path("/auth/passkey/assert/verify"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "user_id": "usr_irene",
                "access_token": "old-ax",
                "refresh_token": "old-rx",
                "token_type": "Bearer",
                "expires_in": 3600,
            })))
            .mount(&server)
            .await;

        // 2) refresh: relay returns rotated tokens, no salts
        Mock::given(method("POST"))
            .and(path("/auth/refresh"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "user_id": "usr_irene",
                "access_token": "NEW-ax",
                "refresh_token": "NEW-rx",
                "token_type": "Bearer",
                "expires_in": 3600,
            })))
            .mount(&server)
            .await;

        let (ctx, _dir) = make_ctx_with_passphrase(&server, "irene-passphrase").await;

        direct_assert_verify(
            &ctx,
            "irene@example.com".into(),
            serde_json::json!({ "id": "raw" }),
        )
        .await
        .unwrap();
        direct_refresh(&ctx).await.unwrap();

        let in_mem = ctx.auth_session.read().await;
        let session = in_mem.as_ref().unwrap();
        assert_eq!(session.salt_auth, Some(test_salt_auth()));
        assert_eq!(session.salt_enc, Some(test_salt_enc()));
        assert!(
            session.enc_key.is_some(),
            "enc_key must be re-derived after refresh"
        );
    }

    /// Verify commands now require non-blank salts — empty input → MissingField
    /// before any network call, matching the existing email/redirect_uri guards.
    #[tokio::test]
    async fn verify_with_blank_salt_returns_missing_field() {
        let server = MockServer::start().await;
        let (ctx, _dir) = make_ctx_with_passphrase(&server, "x").await;

        // Inline call so we can pass an empty salt without going through
        // direct_register_verify (which uses TEST_SALT_*).
        async fn direct_register_verify_with_salts(
            ctx: &AppContext,
            email: String,
            response: serde_json::Value,
            sa: &str,
            se: &str,
        ) -> Result<AuthSessionDto, AuthCommandError> {
            ensure_nonempty_email(&email)?;
            require_vault_unlocked(ctx).await?;
            ensure_nonblank("salt_auth", sa)?;
            ensure_nonblank("salt_enc", se)?;
            let body = serde_json::json!({ "email": email, "response": response });
            let tokens: AuthTokensResponse = ctx
                .relay_client
                .post_json("/auth/passkey/register/verify", &body)
                .await?;
            complete_session(ctx, tokens, Some((sa, se))).await
        }

        let se = test_salt_enc();
        let err = direct_register_verify_with_salts(
            &ctx,
            "alice@example.com".into(),
            serde_json::json!({}),
            "   ",
            &se,
        )
        .await
        .unwrap_err();
        assert!(matches!(
            err,
            AuthCommandError::MissingField { ref field } if field == "salt_auth"
        ));
    }

    // -----------------------------------------------------------------------
    // M9 Phase E-4b — auth_get_access_token
    // -----------------------------------------------------------------------

    /// Direct variant — exercises the same logic as the Tauri command without
    /// the State extractor.
    async fn direct_get_access_token(ctx: &AppContext) -> Result<String, AuthCommandError> {
        use secrecy::ExposeSecret as _;
        let guard = ctx.auth_session.read().await;
        let session = guard.as_ref().ok_or(AuthCommandError::NoSession)?;
        Ok(session.access_token.expose_secret().to_owned())
    }

    #[tokio::test]
    async fn get_access_token_returns_in_memory_token() {
        let server = MockServer::start().await;
        let (ctx, _dir) = make_ctx(&server).await;
        *ctx.auth_session.write().await = Some(AuthSession {
            user_id: "usr_alice".into(),
            access_token: SecretString::from("the-access-jwt"),
            refresh_token: SecretString::from("the-refresh-jwt"),
            expires_at: 1_700_000_000,
            salt_auth: None,
            salt_enc: None,
            enc_key: None,
        });

        let token = direct_get_access_token(&ctx).await.unwrap();
        assert_eq!(token, "the-access-jwt");
    }

    #[tokio::test]
    async fn get_access_token_without_session_returns_no_session() {
        let server = MockServer::start().await;
        let (ctx, _dir) = make_ctx(&server).await;
        let err = direct_get_access_token(&ctx).await.unwrap_err();
        assert!(matches!(err, AuthCommandError::NoSession));
    }

    /// Token rotation: after refresh writes a new access token to the session,
    /// the next get_access_token call returns the rotated value (no caching).
    #[tokio::test]
    async fn get_access_token_returns_rotated_token_after_refresh() {
        let server = MockServer::start().await;
        let (ctx, _dir) = make_ctx(&server).await;
        *ctx.auth_session.write().await = Some(AuthSession {
            user_id: "usr_bob".into(),
            access_token: SecretString::from("v1"),
            refresh_token: SecretString::from("rx"),
            expires_at: 1_700_000_000,
            salt_auth: None,
            salt_enc: None,
            enc_key: None,
        });
        assert_eq!(direct_get_access_token(&ctx).await.unwrap(), "v1");

        // simulate refresh rotation
        {
            let mut guard = ctx.auth_session.write().await;
            if let Some(s) = guard.as_mut() {
                s.access_token = SecretString::from("v2");
            }
        }
        assert_eq!(direct_get_access_token(&ctx).await.unwrap(), "v2");
    }
}
