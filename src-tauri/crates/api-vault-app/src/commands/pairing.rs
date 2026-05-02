//! Tauri commands for M9 Phase G T092 device pairing. Wraps
//! `services::pairing` so the renderer can drive the X25519 pairing flow
//! from the Settings → Sync UI (Phase G-pair-4).

use serde::Serialize;
use tauri::State;
use thiserror::Error;

use crate::context::AppContext;
use crate::services::pairing::{
    self as svc, InitiatorPollDto, InitiatorStartDto, JoinerJoinDto, JoinerPollDto, PairingError,
};

#[derive(Debug, Error, Serialize)]
#[serde(tag = "code", rename_all = "snake_case")]
pub enum PairingCommandError {
    #[error("no sync session — sign in and unlock the vault before pairing")]
    NoSyncSession,
    #[error("master passphrase unavailable — vault must be unlocked first")]
    NoMasterPassphrase,
    #[error("no active pairing session")]
    NoActiveSession,
    #[error("role mismatch (expected {expected})")]
    RoleMismatch { expected: String },
    #[error("invalid pin: {message}")]
    InvalidPin { message: String },
    #[error("invalid base64 from peer: {message}")]
    InvalidB64 { message: String },
    #[error("invalid pub key length")]
    InvalidPubKey,
    #[error("relay rejected request (HTTP {status}): {body}")]
    Relay { status: u16, body: String },
    #[error("relay network error: {message}")]
    Network { message: String },
    #[error("internal: {message}")]
    Internal { message: String },
}

impl From<PairingError> for PairingCommandError {
    fn from(e: PairingError) -> Self {
        match e {
            PairingError::NoSyncSession => Self::NoSyncSession,
            PairingError::NoMasterPassphrase => Self::NoMasterPassphrase,
            PairingError::NoActiveSession => Self::NoActiveSession,
            PairingError::RoleMismatch { expected } => Self::RoleMismatch {
                expected: expected.to_owned(),
            },
            PairingError::InvalidPin { got } => Self::InvalidPin {
                message: format!("expected 6 digits, got {got}"),
            },
            PairingError::InvalidB64(message) => Self::InvalidB64 { message },
            PairingError::InvalidPubKey(_) => Self::InvalidPubKey,
            PairingError::Relay(r) => match r {
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
            PairingError::Kdf(k) => Self::Internal {
                message: k.to_string(),
            },
            PairingError::Aead(a) => Self::Internal {
                message: a.to_string(),
            },
            PairingError::Vault(m) | PairingError::Decode(m) => Self::Internal { message: m },
        }
    }
}

#[tauri::command]
pub async fn sync_pair_initiator_start(
    state: State<'_, AppContext>,
) -> Result<InitiatorStartDto, PairingCommandError> {
    Ok(svc::initiator_start(&state).await?)
}

#[tauri::command]
pub async fn sync_pair_initiator_poll(
    pin: String,
    state: State<'_, AppContext>,
) -> Result<InitiatorPollDto, PairingCommandError> {
    Ok(svc::initiator_poll(&state, &pin).await?)
}

#[tauri::command]
pub async fn sync_pair_initiator_finalize(
    pin: String,
    joiner_pub_b64: String,
    state: State<'_, AppContext>,
) -> Result<(), PairingCommandError> {
    svc::initiator_finalize(&state, &pin, &joiner_pub_b64).await?;
    Ok(())
}

#[tauri::command]
pub async fn sync_pair_joiner_join(
    pin: String,
    state: State<'_, AppContext>,
) -> Result<JoinerJoinDto, PairingCommandError> {
    Ok(svc::joiner_join(&state, &pin).await?)
}

#[tauri::command]
pub async fn sync_pair_joiner_poll(
    pin: String,
    state: State<'_, AppContext>,
) -> Result<JoinerPollDto, PairingCommandError> {
    Ok(svc::joiner_poll(&state, &pin).await?)
}

#[tauri::command]
pub async fn sync_pair_joiner_apply(
    pin: String,
    payload_ciphertext_b64: String,
    state: State<'_, AppContext>,
) -> Result<String, PairingCommandError> {
    Ok(svc::joiner_apply(&state, &pin, &payload_ciphertext_b64).await?)
}

#[tauri::command]
pub async fn sync_pair_cancel(state: State<'_, AppContext>) -> Result<(), PairingCommandError> {
    svc::cancel(&state).await;
    Ok(())
}
