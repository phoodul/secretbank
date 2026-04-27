//! Authenticated session persisted in the age vault (M8 Auth — T083 + T086).
//!
//! After a successful Passkey or OAuth flow the relay returns a JWT pair
//! (`access_token`, `refresh_token`) along with a `user_id`. This module owns
//! the in-memory representation ([`AuthSession`]) and its on-disk persistence
//! inside the age vault under the `auth/*` key prefix.
//!
//! # Vault layout
//! ```text
//! auth/user_id        — opaque server-assigned identifier (string)
//! auth/session_token  — short-lived access JWT (string)
//! auth/refresh_token  — long-lived refresh JWT (string)
//! auth/expires_at     — UNIX seconds when the access token stops being valid
//!                       (string-encoded i64; trivial to inspect with `xxd`
//!                       only when the vault is unlocked)
//! ```
//!
//! All four keys are written and read together — partial state (e.g. a stray
//! `refresh_token` left over after a crash) is treated as no-session by
//! [`load_session`] so the user is forced to sign in again rather than running
//! with an inconsistent state.
//!
//! # Why not the OS keyring?
//! The OS keyring is already used for the vault master key. Storing the JWT
//! pair inside the vault keeps the Zero-Knowledge contract intact (the relay
//! sees the access JWT it issued, but it never sees the refresh token at
//! rest — only when the desktop client explicitly POSTs `/auth/refresh`).

use api_vault_storage::vault::{ExposeSecret, SecretBytes, VaultError, VaultStorage};
use secrecy::SecretString;
use serde::Deserialize;

/// Vault key prefix for authenticated session material.
const VAULT_PREFIX: &str = "auth";
const KEY_USER_ID: &str = "auth/user_id";
const KEY_ACCESS_TOKEN: &str = "auth/session_token";
const KEY_REFRESH_TOKEN: &str = "auth/refresh_token";
const KEY_EXPIRES_AT: &str = "auth/expires_at";

/// In-memory representation of the authenticated session returned by the
/// relay's Passkey / OAuth / Refresh endpoints.
///
/// `Serialize` is intentionally **not** derived — emitting the secrets through
/// `serde_json` would defeat the [`SecretString`] wrapper. Use the explicit
/// [`save_session`] persistence helpers instead.
#[derive(Debug)]
pub struct AuthSession {
    pub user_id: String,
    pub access_token: SecretString,
    pub refresh_token: SecretString,
    /// UNIX seconds at which `access_token` stops being valid.
    /// Computed from the relay's `expires_in` (seconds-from-now) at issue time.
    pub expires_at: i64,
}

/// Wire-shape of the relay's `/auth/*` mint responses.
///
/// Matches both Passkey (`register/verify`, `assert/verify`) and OAuth
/// (`callback`) responses — the relay also includes `salt_auth` / `salt_enc`
/// fields, which are handled separately by T085 and ignored here.
#[derive(Debug, Deserialize)]
pub struct AuthTokensResponse {
    pub user_id: String,
    pub access_token: String,
    pub refresh_token: String,
    pub token_type: String,
    /// Seconds until `access_token` expires (relay returns `3600`).
    pub expires_in: i64,
}

impl AuthSession {
    /// Build a session from a relay token-mint response, computing
    /// `expires_at` relative to the supplied `now` (UNIX seconds).
    ///
    /// Taking `now` as a parameter (instead of calling `SystemTime::now()`
    /// internally) keeps unit tests deterministic.
    pub fn from_response(resp: AuthTokensResponse, now: i64) -> Self {
        Self {
            user_id: resp.user_id,
            access_token: SecretString::from(resp.access_token),
            refresh_token: SecretString::from(resp.refresh_token),
            expires_at: now.saturating_add(resp.expires_in),
        }
    }
}

/// Persist `session` into the age vault.
///
/// Writes all four `auth/*` keys and triggers a single [`flush`](VaultStorage::flush)
/// at the end so the new session survives a crash. Returns
/// [`VaultError::NotUnlocked`] if the vault is locked.
pub async fn save_session(
    vault: &mut Box<dyn VaultStorage + Send + Sync>,
    session: &AuthSession,
) -> Result<(), VaultError> {
    vault
        .put_secret(
            KEY_USER_ID,
            SecretBytes::new(session.user_id.as_bytes().to_vec()),
        )
        .await?;
    vault
        .put_secret(
            KEY_ACCESS_TOKEN,
            SecretBytes::new(session.access_token.expose_secret().as_bytes().to_vec()),
        )
        .await?;
    vault
        .put_secret(
            KEY_REFRESH_TOKEN,
            SecretBytes::new(session.refresh_token.expose_secret().as_bytes().to_vec()),
        )
        .await?;
    vault
        .put_secret(
            KEY_EXPIRES_AT,
            SecretBytes::new(session.expires_at.to_string().into_bytes()),
        )
        .await?;
    vault.flush().await?;
    Ok(())
}

/// Load the session previously written by [`save_session`].
///
/// Returns `Ok(None)` when no session is stored (any of the four keys
/// missing → treated as no-session; partial state from a crash is discarded).
/// Returns [`VaultError::NotUnlocked`] when the vault is locked.
pub async fn load_session(
    vault: &(dyn VaultStorage + Send + Sync),
) -> Result<Option<AuthSession>, VaultError> {
    let user_id = match read_string(vault, KEY_USER_ID).await? {
        Some(v) => v,
        None => return Ok(None),
    };
    let access_token = match read_string(vault, KEY_ACCESS_TOKEN).await? {
        Some(v) => v,
        None => return Ok(None),
    };
    let refresh_token = match read_string(vault, KEY_REFRESH_TOKEN).await? {
        Some(v) => v,
        None => return Ok(None),
    };
    let expires_raw = match read_string(vault, KEY_EXPIRES_AT).await? {
        Some(v) => v,
        None => return Ok(None),
    };
    let expires_at = expires_raw
        .parse::<i64>()
        .map_err(|e| VaultError::Serialization(format!("auth/expires_at parse: {e}")))?;

    Ok(Some(AuthSession {
        user_id,
        access_token: SecretString::from(access_token),
        refresh_token: SecretString::from(refresh_token),
        expires_at,
    }))
}

/// Remove every `auth/*` key and flush the vault.
///
/// Iterates [`list_secrets`](VaultStorage::list_secrets) under the `auth`
/// prefix so future additions (e.g. `auth/device_id`) are cleared too.
pub async fn clear_session(
    vault: &mut Box<dyn VaultStorage + Send + Sync>,
) -> Result<(), VaultError> {
    let paths = vault.list_secrets(VAULT_PREFIX).await?;
    for path in paths {
        // Tolerate concurrent deletion (e.g. another command already cleared a
        // key) — only NotFound is silently swallowed.
        match vault.delete_secret(&path).await {
            Ok(()) => {}
            Err(VaultError::NotFound { .. }) => {}
            Err(e) => return Err(e),
        }
    }
    vault.flush().await?;
    Ok(())
}

async fn read_string(
    vault: &(dyn VaultStorage + Send + Sync),
    path: &str,
) -> Result<Option<String>, VaultError> {
    match vault.get_secret(path).await {
        Ok(bytes) => {
            let s = String::from_utf8(bytes.expose_secret().clone())
                .map_err(|e| VaultError::Serialization(format!("{path} utf-8: {e}")))?;
            Ok(Some(s))
        }
        Err(VaultError::NotFound { .. }) => Ok(None),
        Err(e) => Err(e),
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use api_vault_storage::vault::mock::MockVaultStorage;
    use secrecy::ExposeSecret as _;

    use super::*;

    fn sample_session(user_id: &str, expires_at: i64) -> AuthSession {
        AuthSession {
            user_id: user_id.to_owned(),
            access_token: SecretString::from("access-jwt-payload"),
            refresh_token: SecretString::from("refresh-jwt-payload"),
            expires_at,
        }
    }

    async fn unlocked_vault() -> Box<dyn VaultStorage + Send + Sync> {
        let mut v = MockVaultStorage::new("pw");
        v.unlock(SecretString::from("pw".to_owned())).await.unwrap();
        Box::new(v)
    }

    // -----------------------------------------------------------------------
    // 1. from_response: expires_at = now + expires_in
    // -----------------------------------------------------------------------
    #[test]
    fn from_response_computes_expires_at() {
        let resp = AuthTokensResponse {
            user_id: "usr_abc".into(),
            access_token: "ax".into(),
            refresh_token: "rx".into(),
            token_type: "Bearer".into(),
            expires_in: 3600,
        };
        let session = AuthSession::from_response(resp, 1_700_000_000);
        assert_eq!(session.user_id, "usr_abc");
        assert_eq!(session.expires_at, 1_700_003_600);
        assert_eq!(session.access_token.expose_secret(), "ax");
    }

    // -----------------------------------------------------------------------
    // 2. save → load round-trip preserves all fields
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn save_then_load_roundtrip() {
        let mut vault = unlocked_vault().await;
        let session = sample_session("usr_42", 1_700_003_600);
        save_session(&mut vault, &session).await.unwrap();

        let loaded = load_session(vault.as_ref()).await.unwrap().unwrap();
        assert_eq!(loaded.user_id, "usr_42");
        assert_eq!(loaded.expires_at, 1_700_003_600);
        assert_eq!(loaded.access_token.expose_secret(), "access-jwt-payload");
        assert_eq!(loaded.refresh_token.expose_secret(), "refresh-jwt-payload");
    }

    // -----------------------------------------------------------------------
    // 3. load on empty vault returns None
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn load_returns_none_when_no_session() {
        let vault = unlocked_vault().await;
        assert!(load_session(vault.as_ref()).await.unwrap().is_none());
    }

    // -----------------------------------------------------------------------
    // 4. partial state (crash mid-write) is treated as no-session
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn load_partial_state_returns_none() {
        let mut vault = unlocked_vault().await;
        vault
            .put_secret(
                KEY_USER_ID,
                SecretBytes::new(b"usr_orphan".to_vec()),
            )
            .await
            .unwrap();
        // No access / refresh / expires written.
        assert!(load_session(vault.as_ref()).await.unwrap().is_none());
    }

    // -----------------------------------------------------------------------
    // 5. clear_session removes every auth/* key
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn clear_session_removes_all_keys() {
        let mut vault = unlocked_vault().await;
        let session = sample_session("usr_42", 1_700_003_600);
        save_session(&mut vault, &session).await.unwrap();
        clear_session(&mut vault).await.unwrap();

        assert!(load_session(vault.as_ref()).await.unwrap().is_none());
        let remaining = vault.list_secrets(VAULT_PREFIX).await.unwrap();
        assert!(remaining.is_empty(), "expected no auth/* keys, got {remaining:?}");
    }

    // -----------------------------------------------------------------------
    // 6. expires_at with malformed integer → Serialization error
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn load_malformed_expires_at_returns_serialization_error() {
        let mut vault = unlocked_vault().await;
        vault
            .put_secret(KEY_USER_ID, SecretBytes::new(b"usr_x".to_vec()))
            .await
            .unwrap();
        vault
            .put_secret(KEY_ACCESS_TOKEN, SecretBytes::new(b"ax".to_vec()))
            .await
            .unwrap();
        vault
            .put_secret(KEY_REFRESH_TOKEN, SecretBytes::new(b"rx".to_vec()))
            .await
            .unwrap();
        vault
            .put_secret(KEY_EXPIRES_AT, SecretBytes::new(b"not-a-number".to_vec()))
            .await
            .unwrap();

        let err = load_session(vault.as_ref()).await.unwrap_err();
        assert!(matches!(err, VaultError::Serialization(_)));
    }
}
