//! Tauri commands for vault state management (T021).
//!
//! Each command delegates to a pure helper function so unit tests
//! can exercise logic without a running Tauri app.

use secretbank_audit::AuditActor;
use secretbank_charter::{shamir_combine, Charter, ShamirShare};
use secretbank_storage::age_vault::{
    file::read_vault_file as read_vault_file_storage, CharterIssuance, CharterMode,
};
use serde::{Deserialize, Serialize};
use tauri::State;

use secretbank_storage::vault::{VaultError, VaultStorage};

use crate::context::AppContext;

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

#[derive(Debug, thiserror::Error, Serialize)]
#[serde(tag = "code", rename_all = "snake_case")]
pub enum VaultCommandError {
    #[error("vault already initialized")]
    AlreadyInitialized,

    #[error("vault not initialized")]
    NotInitialized,

    #[error("wrong password")]
    WrongPassword,

    #[error("vault not unlocked")]
    NotUnlocked,

    /// vault has no charter envelope (cannot recover via charter).
    #[error("charter absent")]
    CharterAbsent,

    /// charter does not unlock this vault (wrong charter or tampered envelope).
    #[error("charter invalid")]
    CharterInvalid,

    /// charter input failed to parse (bad word / wrong verifier / wrong word count).
    #[error("charter parse error: {detail}")]
    CharterParseError { detail: String },

    /// vault unlock blocked by an active charter cooldown (post-recovery anti-theft delay).
    #[error("cooldown active: {seconds_remaining}s remaining")]
    CooldownActive { seconds_remaining: u64 },

    #[error("internal error: {message}")]
    Internal { message: String },
}

impl From<VaultError> for VaultCommandError {
    fn from(e: VaultError) -> Self {
        match e {
            VaultError::WrongPassword => Self::WrongPassword,
            VaultError::NotUnlocked => Self::NotUnlocked,
            VaultError::Crypto(msg) if msg.contains("not initialized") => Self::NotInitialized,
            VaultError::Crypto(msg) if msg.contains("already initialized") => {
                Self::AlreadyInitialized
            }
            VaultError::Crypto(msg) if msg.contains("no charter envelope") => Self::CharterAbsent,
            VaultError::Crypto(msg) if msg.contains("does not unlock") => Self::CharterInvalid,
            other => Self::Internal {
                message: other.to_string(),
            },
        }
    }
}

impl From<std::io::Error> for VaultCommandError {
    fn from(e: std::io::Error) -> Self {
        Self::Internal {
            message: e.to_string(),
        }
    }
}

impl From<secretbank_storage::sqlite::StorageError> for VaultCommandError {
    fn from(e: secretbank_storage::sqlite::StorageError) -> Self {
        Self::Internal {
            message: e.to_string(),
        }
    }
}

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

/// Serializable vault status returned by [`vault_status`].
#[derive(Debug, Serialize)]
#[serde(rename_all = "snake_case", tag = "state")]
pub enum VaultStatus {
    Uninitialized,
    Locked,
    Unlocked,
}

// ---------------------------------------------------------------------------
// Charter (recovery) DTOs
// ---------------------------------------------------------------------------

/// Frontend-supplied charter mode.
#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CharterModeRequest {
    None,
    Single,
    Shamir2of3,
}

impl From<CharterModeRequest> for CharterMode {
    fn from(m: CharterModeRequest) -> Self {
        match m {
            CharterModeRequest::None => CharterMode::None,
            CharterModeRequest::Single => CharterMode::Single,
            CharterModeRequest::Shamir2of3 => CharterMode::Shamir2of3,
        }
    }
}

/// User-facing charter representation. The `formatted` field is the canonical
/// one for printing / clipboard ("WORD1 WORD2 ... - 1234"); `words` + `verifier`
/// are exposed for UIs that want to render their own layout.
#[derive(Debug, Serialize)]
pub struct CharterDto {
    pub words: Vec<String>,
    pub verifier: u16,
    pub formatted: String,
}

impl From<&Charter> for CharterDto {
    fn from(c: &Charter) -> Self {
        Self {
            words: c.words.to_vec(),
            verifier: c.verifier,
            formatted: c.formatted(),
        }
    }
}

#[derive(Debug, Serialize)]
pub struct ShamirShareDto {
    pub index: u8,
    pub words: Vec<String>,
    pub verifier: u16,
    pub formatted: String,
}

impl From<&ShamirShare> for ShamirShareDto {
    fn from(s: &ShamirShare) -> Self {
        Self {
            index: s.index,
            words: s.words.to_vec(),
            verifier: s.verifier,
            formatted: s.formatted(),
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum CharterIssuanceDto {
    None,
    Single { charter: CharterDto },
    Shamir2of3 { shares: Vec<ShamirShareDto> },
}

impl From<CharterIssuance> for CharterIssuanceDto {
    fn from(i: CharterIssuance) -> Self {
        match i {
            CharterIssuance::None => Self::None,
            CharterIssuance::Single(c) => Self::Single {
                charter: CharterDto::from(&c),
            },
            CharterIssuance::Shamir(shares) => Self::Shamir2of3 {
                shares: shares.iter().map(ShamirShareDto::from).collect(),
            },
        }
    }
}

/// Recovery input — either a single phrase, or a list of Shamir share strings.
#[derive(Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum CharterRecoveryInput {
    Single { phrase: String },
    Shamir { shares: Vec<String> },
}

// ---------------------------------------------------------------------------
// Pure logic helpers (unit-testable without Tauri)
// ---------------------------------------------------------------------------

pub async fn do_vault_unlock(
    vault: &mut dyn VaultStorage,
    password: &str,
) -> Result<(), VaultCommandError> {
    let secret = secrecy::SecretString::new(password.to_owned().into());
    vault.unlock(secret).await.map_err(VaultCommandError::from)
}

pub async fn do_vault_lock(vault: &mut dyn VaultStorage) -> Result<(), VaultCommandError> {
    vault.lock().await.map_err(VaultCommandError::from)
}

pub async fn do_vault_status(vault: &dyn VaultStorage, vault_file_exists: bool) -> VaultStatus {
    if !vault_file_exists {
        return VaultStatus::Uninitialized;
    }
    if vault.is_unlocked().await {
        VaultStatus::Unlocked
    } else {
        VaultStatus::Locked
    }
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn vault_init(
    password: String,
    state: State<'_, AppContext>,
) -> Result<(), VaultCommandError> {
    let vault_path = state.data_dir.join("vault.age");
    if vault_path.exists() {
        return Err(VaultCommandError::AlreadyInitialized);
    }

    let secret = secrecy::SecretString::new(password.into());
    state
        .initialize_vault(&secret)
        .await
        .map_err(VaultCommandError::from)?;

    state
        .audit
        .record(
            AuditActor::System,
            "vault.init",
            "vault",
            state.user_id.clone(),
            None,
        )
        .await;

    Ok(())
}

#[tauri::command]
pub async fn vault_unlock(
    password: String,
    state: State<'_, AppContext>,
    app_handle: tauri::AppHandle,
) -> Result<(), VaultCommandError> {
    // M23-E: charter cooldown — recovery 후 7일간 unlock 거부 (사용자가 settings 에서 활성화한 경우).
    if let Ok(Some(seconds_remaining)) =
        crate::services::charter_cooldown::check_active(&state.data_dir)
    {
        return Err(VaultCommandError::CooldownActive { seconds_remaining });
    }
    {
        let mut vault = state.vault.write().await;
        do_vault_unlock(vault.as_mut(), &password).await?;
    }
    // M9 Phase B-1: stash the master passphrase so the M8 verify flow and
    // M9 sync's `derive_session_keys` can reproduce `enc_key` without
    // re-prompting the user. Cleared in `vault_lock` (Drop auto-zeroize).
    //
    // Security note: see `AppContext::master_passphrase` doc — vault unlocked
    // already keeps the X25519 Identity in memory, so this does not widen the
    // attack surface. Decision: project-decisions.md [2026-04-28] B.
    {
        let mut guard = state.master_passphrase.write().await;
        *guard = Some(secrecy::SecretString::new(password.clone().into()));
    }
    // 볼트가 열렸으므로 저장된 API 키로 스케줄러를 재구성한다.
    if let Err(e) =
        crate::commands::vault_settings::reconfigure_feed_scheduler(&state, &app_handle).await
    {
        tracing::warn!(error = %e, "vault_unlock 후 스케줄러 재구성 실패 (비치명적)");
    }
    // 디바이스 서명 키 보장 — 실패해도 unlock 자체를 막지 않는다.
    {
        use crate::services::device_identity::{detect_platform, ensure_device_keys};
        let platform = detect_platform();
        match ensure_device_keys(
            state.vault.clone(),
            &state.pool,
            hostname_or_default(),
            platform,
        )
        .await
        {
            Ok(identity) => {
                let mut guard = state.device_identity.write().await;
                *guard = Some(identity);
            }
            Err(e) => {
                tracing::warn!(error = %e, "device identity 초기화 실패 (비치명적)");
            }
        }
    }

    // M8: 볼트가 열렸으니 영속된 인증 세션을 메모리로 끌어올린다.
    // 실패는 세션 없음으로 처리(사용자가 다시 sign-in 하도록).
    if let Err(e) = crate::commands::auth::hydrate_session_from_vault(&state).await {
        tracing::warn!(error = %e, "auth session hydrate 실패 (비치명적)");
    }

    state
        .audit
        .record(
            AuditActor::LocalUser,
            "vault.unlock",
            "vault",
            state.user_id.clone(),
            None,
        )
        .await;

    Ok(())
}

/// 호스트명 또는 기본값 `"this-device"` 를 반환한다.
fn hostname_or_default() -> String {
    std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .unwrap_or_else(|_| "this-device".to_owned())
}

#[tauri::command]
pub async fn vault_lock(state: State<'_, AppContext>) -> Result<(), VaultCommandError> {
    // 잠금 전에 먼저 audit 기록 (identity 가 있는 동안)
    state
        .audit
        .record(
            AuditActor::LocalUser,
            "vault.lock",
            "vault",
            state.user_id.clone(),
            None,
        )
        .await;

    // 디바이스 identity 클리어 (서명 키를 메모리에서 제거)
    {
        let mut guard = state.device_identity.write().await;
        *guard = None;
    }
    // M8: auth_session 메모리 캐시도 비운다 (영속본은 보존 — 다음 unlock 시
    // hydrate_session_from_vault 가 다시 끌어올린다). enc_key 는 AuthSession
    // 내부 필드이므로 자동 zeroize 된다.
    {
        let mut guard = state.auth_session.write().await;
        *guard = None;
    }
    // M9 Phase B-1: master_passphrase zeroize (SecretString Drop).
    {
        let mut guard = state.master_passphrase.write().await;
        *guard = None;
    }
    let mut vault = state.vault.write().await;
    do_vault_lock(vault.as_mut()).await
}

#[tauri::command]
pub async fn vault_status(state: State<'_, AppContext>) -> Result<VaultStatus, VaultCommandError> {
    let vault = state.vault.read().await;
    let vault_path = state.data_dir.join("vault.age");
    Ok(do_vault_status(vault.as_ref(), vault_path.exists()).await)
}

// ---------------------------------------------------------------------------
// M23-B-4: charter (recovery) commands
// ---------------------------------------------------------------------------

fn issuance_kind_label(i: &CharterIssuance) -> &'static str {
    match i {
        CharterIssuance::None => "none",
        CharterIssuance::Single(_) => "single",
        CharterIssuance::Shamir(_) => "shamir-2-of-3",
    }
}

pub fn parse_recovery_input(
    input: CharterRecoveryInput,
) -> Result<secretbank_charter::CharterSecret, VaultCommandError> {
    match input {
        CharterRecoveryInput::Single { phrase } => {
            let charter =
                Charter::parse(&phrase).map_err(|e| VaultCommandError::CharterParseError {
                    detail: e.to_string(),
                })?;
            charter
                .to_secret()
                .map_err(|e| VaultCommandError::CharterParseError {
                    detail: e.to_string(),
                })
        }
        CharterRecoveryInput::Shamir { shares } => {
            if shares.len() < 2 {
                return Err(VaultCommandError::CharterParseError {
                    detail: format!(
                        "need at least 2 shares to recover via Shamir, got {}",
                        shares.len()
                    ),
                });
            }
            let mut parsed: Vec<ShamirShare> = Vec::with_capacity(shares.len());
            for s in &shares {
                let sh =
                    ShamirShare::parse(s).map_err(|e| VaultCommandError::CharterParseError {
                        detail: e.to_string(),
                    })?;
                parsed.push(sh);
            }
            shamir_combine(&parsed).map_err(|e| VaultCommandError::CharterParseError {
                detail: e.to_string(),
            })
        }
    }
}

#[tauri::command]
pub async fn vault_init_with_charter(
    password: String,
    mode: CharterModeRequest,
    state: State<'_, AppContext>,
) -> Result<CharterIssuanceDto, VaultCommandError> {
    let vault_path = state.data_dir.join("vault.age");
    if vault_path.exists() {
        return Err(VaultCommandError::AlreadyInitialized);
    }
    let secret = secrecy::SecretString::new(password.into());
    let issuance = state
        .initialize_vault_with_charter(&secret, mode.into())
        .await?;
    let kind = issuance_kind_label(&issuance);
    state
        .audit
        .record(
            AuditActor::System,
            "vault.charter.issued",
            "vault",
            state.user_id.clone(),
            Some(serde_json::json!({ "mode": kind }).to_string()),
        )
        .await;
    Ok(issuance.into())
}

#[tauri::command]
pub async fn vault_recovery_unlock(
    recovery: CharterRecoveryInput,
    new_password: String,
    new_charter_mode: CharterModeRequest,
    state: State<'_, AppContext>,
) -> Result<CharterIssuanceDto, VaultCommandError> {
    let vault_path = state.data_dir.join("vault.age");
    if !vault_path.exists() {
        return Err(VaultCommandError::NotInitialized);
    }
    let charter_secret = parse_recovery_input(recovery)?;
    let new_pw = secrecy::SecretString::new(new_password.into());
    let issuance = state
        .recover_vault_with_charter(charter_secret, &new_pw, new_charter_mode.into())
        .await?;
    let kind = issuance_kind_label(&issuance);

    // M23-E: cooldown sidecar 갱신 — recovery 시각 기록 + (활성화된 경우) 7일 잠금.
    let cooldown_after = crate::services::charter_cooldown::apply_recovery_event(&state.data_dir)
        .map_err(|e| VaultCommandError::Internal {
        message: format!("cooldown sidecar write failed: {e}"),
    })?;

    state
        .audit
        .record(
            AuditActor::LocalUser,
            "vault.charter.recovered",
            "vault",
            state.user_id.clone(),
            Some(
                serde_json::json!({
                    "new_charter_mode": kind,
                    "cooldown_enabled": cooldown_after.enabled,
                    "cooldown_until_unix_ms": cooldown_after.cooldown_until_unix_ms,
                })
                .to_string(),
            ),
        )
        .await;
    Ok(issuance.into())
}

#[tauri::command]
pub async fn vault_has_charter(state: State<'_, AppContext>) -> Result<bool, VaultCommandError> {
    let vault_path = state.data_dir.join("vault.age");
    if !vault_path.exists() {
        return Ok(false);
    }
    let (header, _) = read_vault_file_storage(&vault_path).map_err(VaultCommandError::from)?;
    Ok(header.charter_envelope.is_some())
}

// ---------------------------------------------------------------------------
// Pure-logic tests for charter command DTOs / parsers (no Tauri runtime).
// ---------------------------------------------------------------------------

#[cfg(test)]
mod charter_command_tests {
    use super::*;
    use secretbank_charter::{shamir_split, CharterSecret};

    #[test]
    fn dto_round_trip_single_charter() {
        let secret = CharterSecret::random();
        let charter = Charter::from_secret(&secret);
        let dto = CharterDto::from(&charter);
        assert_eq!(dto.words.len(), 6);
        assert_eq!(dto.verifier, charter.verifier);
        assert!(dto.formatted.contains(&format!("{:04}", charter.verifier)));
    }

    #[test]
    fn dto_round_trip_shamir_share() {
        let secret = CharterSecret::random();
        let shares = shamir_split(&secret);
        let dto = ShamirShareDto::from(&shares[0]);
        assert_eq!(dto.words.len(), 7);
        assert!((1..=3).contains(&dto.index));
        assert!(dto.formatted.contains("Share"));
    }

    #[test]
    fn parse_recovery_single_round_trips() {
        let secret = CharterSecret::random();
        let charter = Charter::from_secret(&secret);
        let phrase = charter.formatted();
        let parsed = parse_recovery_input(CharterRecoveryInput::Single { phrase })
            .expect("single recovery parse");
        assert_eq!(parsed, secret);
    }

    #[test]
    fn parse_recovery_shamir_with_two_of_three_round_trips() {
        let secret = CharterSecret::random();
        let shares = shamir_split(&secret);
        let input = CharterRecoveryInput::Shamir {
            shares: vec![shares[0].formatted(), shares[2].formatted()],
        };
        let parsed = parse_recovery_input(input).expect("shamir 2-of-3 parse");
        assert_eq!(parsed, secret);
    }

    #[test]
    fn parse_recovery_shamir_rejects_single_share() {
        let secret = CharterSecret::random();
        let shares = shamir_split(&secret);
        let input = CharterRecoveryInput::Shamir {
            shares: vec![shares[0].formatted()],
        };
        let result = parse_recovery_input(input);
        match result {
            Err(VaultCommandError::CharterParseError { detail }) => {
                assert!(detail.contains("at least 2"));
            }
            other => panic!("expected CharterParseError, got {other:?}"),
        }
    }

    #[test]
    fn parse_recovery_single_rejects_typo() {
        // Construct a charter, then corrupt one word.
        let secret = CharterSecret::random();
        let charter = Charter::from_secret(&secret);
        let original = secretbank_charter::wordlist::index_of(&charter.words[2]).unwrap();
        let other = if original == 0 { 1 } else { 0 };
        let mut tampered = charter.words.clone();
        tampered[2] = secretbank_charter::wordlist::at(other).to_string();
        let bad = format!("{} - {:04}", tampered.join(" "), charter.verifier);
        let result = parse_recovery_input(CharterRecoveryInput::Single { phrase: bad });
        assert!(matches!(
            result,
            Err(VaultCommandError::CharterParseError { .. })
        ));
    }

    #[test]
    fn vault_command_error_maps_charter_absent_message() {
        let err: VaultCommandError =
            VaultError::Crypto("vault has no charter envelope (cannot recover via charter)".into())
                .into();
        assert!(matches!(err, VaultCommandError::CharterAbsent));
    }

    #[test]
    fn vault_command_error_maps_charter_invalid_message() {
        let err: VaultCommandError = VaultError::Crypto(
            "charter does not unlock this vault (wrong charter or tampered envelope)".into(),
        )
        .into();
        assert!(matches!(err, VaultCommandError::CharterInvalid));
    }

    #[test]
    fn issuance_dto_serializes_kind_tag() {
        let issuance: CharterIssuanceDto = CharterIssuance::None.into();
        let json = serde_json::to_value(&issuance).unwrap();
        assert_eq!(json.get("kind").and_then(|v| v.as_str()), Some("none"));

        let secret = CharterSecret::random();
        let single: CharterIssuanceDto =
            CharterIssuance::Single(Charter::from_secret(&secret)).into();
        let json = serde_json::to_value(&single).unwrap();
        assert_eq!(json.get("kind").and_then(|v| v.as_str()), Some("single"));

        let shares = shamir_split(&secret);
        let shamir: CharterIssuanceDto = CharterIssuance::Shamir(Box::new(shares)).into();
        let json = serde_json::to_value(&shamir).unwrap();
        assert_eq!(
            json.get("kind").and_then(|v| v.as_str()),
            Some("shamir2of3")
        );
    }
}

// Vault command unit tests have been moved to
// `secretbank-storage/tests/vault_commands_test.rs`
// to run within the already-compiled storage crate context.
