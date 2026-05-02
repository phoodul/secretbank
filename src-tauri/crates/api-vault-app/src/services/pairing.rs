//! M9 Phase G T092 — client-side device pairing service.
//!
//! 흐름 (api-vault-crypto::pairing 의 doc-comment 와 routes/pair.ts 에 wire 됨):
//!
//!   **Initiator (sign-in 한 디바이스 A)**:
//!     1. `initiator_start` — keypair 생성, 메모리에 priv 보관, relay
//!        `/pair/start` 로 pub 업로드, PIN 받음. UI 가 PIN+pub 을 deep-link
//!        / QR 로 출력.
//!     2. `initiator_poll` — joiner 가 join 했는지 `/pair/poll` 로 polling
//!        (UI 가 1-2초 간격으로). joiner_pub 받으면 다음 단계로.
//!     3. `initiator_finalize` — ECDH(priv, joiner_pub) → channel_key. 자기
//!        `auth_session` + `master_passphrase` 를 [`PairingPayload`] 로
//!        직렬화 + AEAD 암호화 + relay `/pair/payload` 업로드.
//!
//!   **Joiner (sign-in 안 된 디바이스 B)**:
//!     1. `joiner_join` — deep-link 에서 PIN+initiator_pub 받음, 자기 keypair
//!        생성, relay `/pair/join` 으로 pub 업로드.
//!     2. `joiner_poll` — initiator 가 payload 보냈는지 `/pair/poll` polling.
//!     3. `joiner_apply` — ECDH → channel_key → AEAD decrypt payload →
//!        vault_init(master_passphrase) + vault_unlock + save_session.
//!        sign-in 완료.
//!
//! priv key 는 모두 백엔드 메모리 (`PairingSession`) 에만. frontend 는
//! pin / pub_b64 / payload_b64 같은 wire 값만 본다.

use api_vault_crypto::{aead, pairing as kp, AeadError, KdfError};
use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use secrecy::{ExposeSecret as _, SecretBox, SecretString};
use serde::{Deserialize, Serialize};
use thiserror::Error;
use tokio::sync::RwLock;

use crate::context::AppContext;
use crate::services::relay_client::RelayError;
use crate::services::session::{save_session, AuthSession, AuthTokensResponse};

/// AAD for the pairing-channel envelope. `pin` is mixed into the channel
/// key already; the AAD provides an extra binding so a payload from one
/// pairing session can't be replayed into another even within the 5-minute
/// relay TTL window.
fn pair_aad(pin: &str) -> Vec<u8> {
    format!("pair:{pin}").into_bytes()
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

#[derive(Debug, Error)]
pub enum PairingError {
    #[error("no active sync session — initiator must be signed in and unlocked")]
    NoSyncSession,
    #[error("master passphrase unavailable — vault must be unlocked before pairing")]
    NoMasterPassphrase,
    #[error("no active pairing session — call start/join first")]
    NoActiveSession,
    #[error("pairing role mismatch — expected {expected}")]
    RoleMismatch { expected: &'static str },
    #[error("PIN length mismatch — expected 6 digits, got {got}")]
    InvalidPin { got: usize },
    #[error("invalid base64 from peer: {0}")]
    InvalidB64(String),
    #[error("invalid pub key length — expected 32B, got {0}")]
    InvalidPubKey(usize),
    #[error("kdf: {0}")]
    Kdf(#[from] KdfError),
    #[error("aead: {0}")]
    Aead(#[from] AeadError),
    #[error("relay: {0}")]
    Relay(#[from] RelayError),
    #[error("vault: {0}")]
    Vault(String),
    #[error("decode: {0}")]
    Decode(String),
}

// ---------------------------------------------------------------------------
// PairingSession — held in AppContext to bridge multiple Tauri command calls
// ---------------------------------------------------------------------------

/// Active pairing state for a single user. Only one pairing can be in flight
/// per `AppContext` — starting a new one cancels any previous.
pub enum PairingSession {
    Initiator {
        pin: String,
        keypair: kp::PairingKeypair,
    },
    Joiner {
        pin: String,
        keypair: kp::PairingKeypair,
        initiator_pub: [u8; 32],
    },
}

impl PairingSession {
    pub fn pin(&self) -> &str {
        match self {
            Self::Initiator { pin, .. } => pin,
            Self::Joiner { pin, .. } => pin,
        }
    }
}

/// Type alias used by AppContext.
pub type PairingSessionLock = RwLock<Option<PairingSession>>;

// ---------------------------------------------------------------------------
// Wire types — relay endpoints (mirror routes/pair.ts)
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize)]
struct PairStartReq {
    initiator_pub_b64: String,
}
#[derive(Debug, Deserialize)]
struct PairStartResp {
    pin: String,
}

#[derive(Debug, Serialize)]
struct PairJoinReq {
    pin: String,
    joiner_pub_b64: String,
}
#[derive(Debug, Deserialize)]
struct PairJoinResp {
    initiator_pub_b64: String,
    payload_ciphertext_b64: Option<String>,
}

#[derive(Debug, Deserialize)]
struct PairPollResp {
    joiner_pub_b64: Option<String>,
    payload_ciphertext_b64: Option<String>,
}

#[derive(Debug, Serialize)]
struct PairPayloadReq {
    pin: String,
    ciphertext_b64: String,
}

// ---------------------------------------------------------------------------
// PairingPayload — what initiator sends, joiner receives (AEAD-protected)
// ---------------------------------------------------------------------------

/// Wire-shape of the encrypted pairing payload. Initiator copies its own
/// session into this struct, the joiner reconstructs an `AuthSession` +
/// initialises its vault from the same fields.
///
/// `master_passphrase` is included so the joiner can run `vault_init` +
/// `vault_unlock` autonomously — the user does NOT need to retype the
/// passphrase on the new device.
#[derive(Debug, Serialize, Deserialize)]
pub struct PairingPayload {
    pub user_id: String,
    pub access_token: String,
    pub refresh_token: String,
    pub expires_at: i64,
    pub salt_auth: String,
    pub salt_enc: String,
    pub master_passphrase: String,
}

// ---------------------------------------------------------------------------
// Frontend-facing DTOs (Tauri commands return these)
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize)]
pub struct InitiatorStartDto {
    pub pin: String,
    pub initiator_pub_b64: String,
}
#[derive(Debug, Serialize)]
pub struct InitiatorPollDto {
    /// `Some` 면 joiner 가 join 함 — UI 가 finalize 단계로.
    pub joiner_pub_b64: Option<String>,
}
#[derive(Debug, Serialize)]
pub struct JoinerJoinDto {
    pub initiator_pub_b64: String,
    /// `Some` 면 initiator 가 이미 payload 까지 보냄 — joiner 가 즉시 apply.
    pub payload_ciphertext_b64: Option<String>,
}
#[derive(Debug, Serialize)]
pub struct JoinerPollDto {
    pub payload_ciphertext_b64: Option<String>,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn decode_pub_key(b64: &str) -> Result<[u8; 32], PairingError> {
    let raw = B64
        .decode(b64)
        .map_err(|e| PairingError::InvalidB64(e.to_string()))?;
    if raw.len() != 32 {
        return Err(PairingError::InvalidPubKey(raw.len()));
    }
    let mut out = [0u8; 32];
    out.copy_from_slice(&raw);
    Ok(out)
}

fn check_pin(pin: &str) -> Result<(), PairingError> {
    if pin.len() != 6 || !pin.chars().all(|c| c.is_ascii_digit()) {
        return Err(PairingError::InvalidPin { got: pin.len() });
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Initiator side
// ---------------------------------------------------------------------------

/// Step 1 (initiator) — generate keypair, register channel with relay,
/// store priv in `PairingSession::Initiator`.
pub async fn initiator_start(ctx: &AppContext) -> Result<InitiatorStartDto, PairingError> {
    // 1. Bearer access required — current device must be signed in.
    let bearer = {
        let guard = ctx.auth_session.read().await;
        guard
            .as_ref()
            .ok_or(PairingError::NoSyncSession)?
            .access_token
            .expose_secret()
            .to_owned()
    };
    // 2. Master passphrase required — needed at finalize step.
    {
        let mp = ctx.master_passphrase.read().await;
        if mp.is_none() {
            return Err(PairingError::NoMasterPassphrase);
        }
    }

    let keypair = kp::generate_keypair();
    let pub_b64 = B64.encode(keypair.pub_key);
    let resp: PairStartResp = ctx
        .relay_client
        .post_json_authed(
            "/pair/start",
            &bearer,
            &PairStartReq {
                initiator_pub_b64: pub_b64.clone(),
            },
        )
        .await?;

    {
        let mut guard = ctx.pairing_session.write().await;
        *guard = Some(PairingSession::Initiator {
            pin: resp.pin.clone(),
            keypair,
        });
    }

    Ok(InitiatorStartDto {
        pin: resp.pin,
        initiator_pub_b64: pub_b64,
    })
}

/// Step 2 (initiator) — poll relay for joiner's pub.
pub async fn initiator_poll(ctx: &AppContext, pin: &str) -> Result<InitiatorPollDto, PairingError> {
    check_pin(pin)?;
    {
        let guard = ctx.pairing_session.read().await;
        match guard.as_ref() {
            Some(PairingSession::Initiator { pin: stored, .. }) if stored == pin => {}
            Some(_) => {
                return Err(PairingError::RoleMismatch {
                    expected: "initiator",
                })
            }
            None => return Err(PairingError::NoActiveSession),
        }
    }

    let resp: PairPollResp = ctx
        .relay_client
        .get_json(&format!("/pair/poll?pin={pin}"))
        .await?;
    Ok(InitiatorPollDto {
        joiner_pub_b64: resp.joiner_pub_b64,
    })
}

/// Step 3 (initiator) — derive channel key, encrypt payload, upload to relay,
/// clear pairing session.
pub async fn initiator_finalize(
    ctx: &AppContext,
    pin: &str,
    joiner_pub_b64: &str,
) -> Result<(), PairingError> {
    check_pin(pin)?;
    let joiner_pub = decode_pub_key(joiner_pub_b64)?;

    // Snapshot sender state out of locks before doing crypto.
    let (priv_key, payload, bearer) = {
        let pair_guard = ctx.pairing_session.read().await;
        let kpair = match pair_guard.as_ref() {
            Some(PairingSession::Initiator {
                pin: stored,
                keypair,
            }) if stored == pin => {
                // SecretBox copy — we need the priv bytes
                kp::PairingKeypair {
                    priv_key: SecretBox::new(Box::new(*keypair.priv_key.expose_secret())),
                    pub_key: keypair.pub_key,
                }
            }
            Some(_) => {
                return Err(PairingError::RoleMismatch {
                    expected: "initiator",
                })
            }
            None => return Err(PairingError::NoActiveSession),
        };
        drop(pair_guard);

        let auth = ctx.auth_session.read().await;
        let s = auth.as_ref().ok_or(PairingError::NoSyncSession)?;
        let mp = ctx.master_passphrase.read().await;
        let mp_str = mp
            .as_ref()
            .ok_or(PairingError::NoMasterPassphrase)?
            .expose_secret()
            .to_owned();
        let payload = PairingPayload {
            user_id: s.user_id.clone(),
            access_token: s.access_token.expose_secret().to_owned(),
            refresh_token: s.refresh_token.expose_secret().to_owned(),
            expires_at: s.expires_at,
            salt_auth: s.salt_auth.clone().unwrap_or_default(),
            salt_enc: s.salt_enc.clone().unwrap_or_default(),
            master_passphrase: mp_str,
        };
        let bearer = s.access_token.expose_secret().to_owned();
        (kpair.priv_key, payload, bearer)
    };

    let channel_key = kp::derive_channel_key(&priv_key, &joiner_pub, pin)?;
    let plaintext = serde_json::to_vec(&payload)
        .map_err(|e| PairingError::Decode(format!("payload serialize: {e}")))?;
    let envelope = aead::encrypt(&channel_key, &plaintext, &pair_aad(pin))?;
    let ct_b64 = B64.encode(&envelope);

    ctx.relay_client
        .post_json_authed::<_, serde_json::Value>(
            "/pair/payload",
            &bearer,
            &PairPayloadReq {
                pin: pin.to_owned(),
                ciphertext_b64: ct_b64,
            },
        )
        .await?;

    // 끝났으면 session 클리어.
    {
        let mut guard = ctx.pairing_session.write().await;
        *guard = None;
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Joiner side
// ---------------------------------------------------------------------------

/// Step 1 (joiner) — accept deep-link / QR, generate keypair, upload to relay.
pub async fn joiner_join(ctx: &AppContext, pin: &str) -> Result<JoinerJoinDto, PairingError> {
    check_pin(pin)?;

    let keypair = kp::generate_keypair();
    let pub_b64 = B64.encode(keypair.pub_key);

    let resp: PairJoinResp = ctx
        .relay_client
        .post_json::<_, _>(
            "/pair/join",
            &PairJoinReq {
                pin: pin.to_owned(),
                joiner_pub_b64: pub_b64,
            },
        )
        .await?;

    let initiator_pub = decode_pub_key(&resp.initiator_pub_b64)?;
    {
        let mut guard = ctx.pairing_session.write().await;
        *guard = Some(PairingSession::Joiner {
            pin: pin.to_owned(),
            keypair,
            initiator_pub,
        });
    }
    Ok(JoinerJoinDto {
        initiator_pub_b64: resp.initiator_pub_b64,
        payload_ciphertext_b64: resp.payload_ciphertext_b64,
    })
}

/// Step 2 (joiner) — poll for initiator's payload.
pub async fn joiner_poll(ctx: &AppContext, pin: &str) -> Result<JoinerPollDto, PairingError> {
    check_pin(pin)?;
    {
        let guard = ctx.pairing_session.read().await;
        match guard.as_ref() {
            Some(PairingSession::Joiner { pin: stored, .. }) if stored == pin => {}
            Some(_) => return Err(PairingError::RoleMismatch { expected: "joiner" }),
            None => return Err(PairingError::NoActiveSession),
        }
    }
    let resp: PairPollResp = ctx
        .relay_client
        .get_json(&format!("/pair/poll?pin={pin}"))
        .await?;
    Ok(JoinerPollDto {
        payload_ciphertext_b64: resp.payload_ciphertext_b64,
    })
}

/// Step 3 (joiner) — derive channel, decrypt payload, init+unlock vault,
/// save session. Returns the resulting `user_id` for UI feedback.
pub async fn joiner_apply(
    ctx: &AppContext,
    pin: &str,
    payload_ciphertext_b64: &str,
) -> Result<String, PairingError> {
    check_pin(pin)?;

    let (priv_key, initiator_pub) = {
        let pair_guard = ctx.pairing_session.read().await;
        match pair_guard.as_ref() {
            Some(PairingSession::Joiner {
                pin: stored,
                keypair,
                initiator_pub,
            }) if stored == pin => (
                SecretBox::new(Box::new(*keypair.priv_key.expose_secret())),
                *initiator_pub,
            ),
            Some(_) => return Err(PairingError::RoleMismatch { expected: "joiner" }),
            None => return Err(PairingError::NoActiveSession),
        }
    };

    let channel_key = kp::derive_channel_key(&priv_key, &initiator_pub, pin)?;
    let envelope = B64
        .decode(payload_ciphertext_b64)
        .map_err(|e| PairingError::InvalidB64(e.to_string()))?;
    let plaintext = aead::decrypt(&channel_key, &envelope, &pair_aad(pin))?;
    let payload: PairingPayload = serde_json::from_slice(&plaintext)
        .map_err(|e| PairingError::Decode(format!("payload deserialize: {e}")))?;

    // Initialise + unlock vault with the received passphrase.
    let passphrase = SecretString::from(payload.master_passphrase.clone());
    ctx.initialize_vault(&passphrase)
        .await
        .map_err(|e| PairingError::Vault(e.to_string()))?;
    {
        let mut vault = ctx.vault.write().await;
        vault
            .unlock(passphrase.clone())
            .await
            .map_err(|e| PairingError::Vault(e.to_string()))?;
    }
    {
        let mut mp = ctx.master_passphrase.write().await;
        *mp = Some(passphrase);
    }

    // Save session into vault + memory cache.
    let now = time::OffsetDateTime::now_utc().unix_timestamp();
    let session = AuthSession::from_response(
        AuthTokensResponse {
            user_id: payload.user_id.clone(),
            access_token: payload.access_token,
            refresh_token: payload.refresh_token,
            token_type: "Bearer".to_string(),
            expires_in: payload.expires_at - now,
        },
        now,
    );
    let mut session_with_salts = session;
    session_with_salts.salt_auth = Some(payload.salt_auth);
    session_with_salts.salt_enc = Some(payload.salt_enc);

    {
        let mut vault = ctx.vault.write().await;
        save_session(&mut vault, &session_with_salts)
            .await
            .map_err(|e| PairingError::Vault(e.to_string()))?;
    }
    {
        let mut auth = ctx.auth_session.write().await;
        *auth = Some(session_with_salts);
    }

    let user_id = payload.user_id.clone();
    {
        let mut guard = ctx.pairing_session.write().await;
        *guard = None;
    }
    Ok(user_id)
}

/// Cancel any in-flight pairing (UI cancel button).
pub async fn cancel(ctx: &AppContext) {
    let mut guard = ctx.pairing_session.write().await;
    *guard = None;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    // Comprehensive wiremock-driven tests are in commands::sync (when the
    // Tauri command shells are added). The module here keeps a smoke test
    // for the role-guard logic that doesn't require relay or vault state.
    use super::*;

    #[test]
    fn check_pin_accepts_six_digits() {
        assert!(check_pin("012345").is_ok());
        assert!(check_pin("999999").is_ok());
    }

    #[test]
    fn check_pin_rejects_short() {
        assert!(matches!(
            check_pin("12345"),
            Err(PairingError::InvalidPin { got: 5 })
        ));
    }

    #[test]
    fn check_pin_rejects_non_digit() {
        assert!(matches!(
            check_pin("abcdef"),
            Err(PairingError::InvalidPin { .. })
        ));
    }

    #[test]
    fn decode_pub_key_rejects_bad_length() {
        let short = B64.encode([0u8; 16]);
        assert!(matches!(
            decode_pub_key(&short),
            Err(PairingError::InvalidPubKey(16))
        ));
    }

    #[test]
    fn pair_aad_distinguishes_pins() {
        assert_ne!(pair_aad("012345"), pair_aad("999999"));
    }
}
