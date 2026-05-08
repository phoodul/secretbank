//! Tauri commands for credit card CRUD + reveal (Phase 3-A-5).
//!
//! # Security guarantees
//! - B.1-2: card_number_plain / cvc_plain are wrapped in `SecretBytes` immediately.
//! - B.1-3: CreditCardSummary never contains plaintext card number or CVC.
//! - B.1-6: audit log records action + credential_id only (no plaintext secrets).
//! - B.1-9: error messages are generic (no credential_id / vault paths).
//! - B.5-2: 30-second auto-clear is the frontend's responsibility after reveal.
//! - GATE 2-2: reveal returns plaintext once; frontend clears after 30 s.
//! - GATE 2-6: PIN field excluded (deferred to Phase 3-B / 4).

use secretbank_audit::AuditActor;
use secretbank_core::models::credit_card::{
    CardBrand, CreditCardInput, CreditCardMeta, CreditCardSummary,
};
use secretbank_core::{CredentialId, CredentialInput, CredentialKind, Env};
use secretbank_storage::sqlite::repositories::{credential::CredentialRepo, CreditCardMetaRepo};
use secretbank_storage::vault::{ExposeSecret, SecretBytes};
use serde::Serialize;
use tauri::State;
use time::format_description::well_known::Rfc3339;
use time::OffsetDateTime;

use crate::context::AppContext;

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

#[derive(Debug, thiserror::Error, Serialize)]
#[serde(tag = "code", rename_all = "snake_case")]
pub enum CreditCardCommandError {
    #[error("vault is locked")]
    VaultLocked,

    #[error("not found")]
    NotFound,

    #[error("internal error")]
    Internal,
}

impl From<secretbank_storage::sqlite::StorageError> for CreditCardCommandError {
    fn from(_: secretbank_storage::sqlite::StorageError) -> Self {
        Self::Internal
    }
}

impl From<secretbank_storage::vault::VaultError> for CreditCardCommandError {
    fn from(e: secretbank_storage::vault::VaultError) -> Self {
        match e {
            secretbank_storage::vault::VaultError::NotUnlocked => Self::VaultLocked,
            _ => Self::Internal,
        }
    }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

fn now_iso8601() -> String {
    OffsetDateTime::now_utc()
        .format(&Rfc3339)
        .unwrap_or_else(|_| "1970-01-01T00:00:00Z".to_string())
}

fn meta_to_summary(meta: CreditCardMeta) -> CreditCardSummary {
    CreditCardSummary {
        credential_id: meta.credential_id,
        brand: meta.brand,
        expiry_month: meta.expiry_month,
        expiry_year: meta.expiry_year,
        cardholder_name: meta.cardholder_name,
        last_4: meta.last_4,
    }
}

// ---------------------------------------------------------------------------
// create_credit_card
// ---------------------------------------------------------------------------

/// Create a new credit card credential.
///
/// Stores card_number_plain and cvc_plain in the age vault under
/// `credit_cards/<id>/card_number` and `credit_cards/<id>/cvc`.
/// Returns a `CreditCardSummary` — no plaintext secrets (B.1-3).
#[tauri::command]
pub async fn create_credit_card(
    state: State<'_, AppContext>,
    input: CreditCardInput,
) -> Result<CreditCardSummary, CreditCardCommandError> {
    // 1. Vault unlock check
    {
        let vault = state.vault.read().await;
        if !vault.is_unlocked().await {
            return Err(CreditCardCommandError::VaultLocked);
        }
    }

    // 2. Generate credential ID and vault paths
    let id = CredentialId::new();
    let id_str = id.to_string();
    let card_number_path = format!("credit_cards/{id_str}/card_number");
    let cvc_path = format!("credit_cards/{id_str}/cvc");
    // We use card_number_path as the credential's vault_ref (primary slot)
    let vault_ref = card_number_path.clone();

    // 3. Insert credential row (kind = CreditCard)
    let name = if input.name.is_empty() {
        format!(
            "{} \u{2022}\u{2022}\u{2022}\u{2022} {}",
            brand_display(input.brand),
            input.last_4
        )
    } else {
        input.name.clone()
    };

    let cred_input = CredentialInput {
        issuer_id: input.issuer_id,
        name: name.clone(),
        env: Env::Prod,
        scope: None,
        rotation_policy_days: None,
        rotation_runbook_id: None,
        expires_at: None,
        owner: None,
        hash_hint: Some(input.last_4.clone()),
        kind: CredentialKind::CreditCard,
        url: None,
        username: None,
        primary_label: Some("Card Number".to_string()),
        secondary_label: Some("CVC".to_string()),
    };

    let cred_repo = CredentialRepo::new(&state.pool);
    cred_repo
        .insert_with_id(Some(id), &cred_input, vault_ref.clone())
        .await
        .map_err(|_| CreditCardCommandError::Internal)?;

    // 4. Wrap plaintext in SecretBytes immediately (B.1-2) and store in vault
    //    Both paths stored; flush keeps vault consistent.
    {
        let card_number_bytes = SecretBytes::new(input.card_number_plain.as_bytes().to_vec());
        let cvc_bytes = SecretBytes::new(input.cvc_plain.as_bytes().to_vec());

        let mut vault = state.vault.write().await;

        if let Err(vault_err) = vault.put_secret(&card_number_path, card_number_bytes).await {
            // Rollback: remove credential row
            let _ = cred_repo.delete(id).await;
            return Err(CreditCardCommandError::from(vault_err));
        }

        if let Err(vault_err) = vault.put_secret(&cvc_path, cvc_bytes).await {
            // Rollback: remove vault primary + credential row
            let _ = vault.delete_secret(&card_number_path).await;
            let _ = cred_repo.delete(id).await;
            return Err(CreditCardCommandError::from(vault_err));
        }

        vault
            .flush()
            .await
            .map_err(|_| CreditCardCommandError::Internal)?;
    }
    // card_number_plain and cvc_plain are dropped when `input` goes out of scope

    // 5. Insert credit_card_meta row (plaintext metadata only — no secrets)
    let now = now_iso8601();
    let meta = CreditCardMeta {
        credential_id: id,
        brand: input.brand,
        expiry_month: input.expiry_month,
        expiry_year: input.expiry_year,
        cardholder_name: input.cardholder_name.clone(),
        billing_address: input.billing_address.clone(),
        last_4: input.last_4.clone(),
    };

    let cc_repo = CreditCardMetaRepo::new(&state.pool);
    if cc_repo.insert(&meta, &now).await.is_err() {
        // Rollback vault secrets + credential row
        {
            let mut vault = state.vault.write().await;
            let _ = vault.delete_secret(&card_number_path).await;
            let _ = vault.delete_secret(&cvc_path).await;
        }
        let _ = cred_repo.delete(id).await;
        return Err(CreditCardCommandError::Internal);
    }

    // 6. Audit log — action + credential_id only (B.1-6)
    state
        .audit
        .record(
            AuditActor::LocalUser,
            "credit_card.create",
            "credential",
            &id_str,
            None,
        )
        .await;

    // 7. Return summary — no plaintext secrets (B.1-3)
    Ok(meta_to_summary(meta))
}

// ---------------------------------------------------------------------------
// list_credit_cards
// ---------------------------------------------------------------------------

/// List all credit card summaries (no vault access needed — metadata only).
#[tauri::command]
pub async fn list_credit_cards(
    state: State<'_, AppContext>,
) -> Result<Vec<CreditCardSummary>, CreditCardCommandError> {
    // Defense-in-depth: vault locked → return empty list (label leakage guard)
    {
        let vault = state.vault.read().await;
        if !vault.is_unlocked().await {
            return Ok(vec![]);
        }
    }

    let cc_repo = CreditCardMetaRepo::new(&state.pool);
    let metas = cc_repo
        .list_all()
        .await
        .map_err(|_| CreditCardCommandError::Internal)?;

    Ok(metas.into_iter().map(meta_to_summary).collect())
}

// ---------------------------------------------------------------------------
// reveal_card_number
// ---------------------------------------------------------------------------

/// Decrypt and return the card number once.
///
/// The frontend is responsible for clearing the value after 30 seconds (B.5-2 / GATE 2-2).
/// Error messages are generic — no credential ID or vault path (B.1-9).
#[tauri::command]
pub async fn reveal_card_number(
    state: State<'_, AppContext>,
    credential_id: String,
) -> Result<String, CreditCardCommandError> {
    // 1. Vault unlock check
    let vault = state.vault.read().await;
    if !vault.is_unlocked().await {
        return Err(CreditCardCommandError::VaultLocked);
    }

    // 2. Decrypt from vault
    let card_number_path = format!("credit_cards/{credential_id}/card_number");
    let secret_bytes = vault
        .get_secret(&card_number_path)
        .await
        .map_err(|e| match e {
            secretbank_storage::vault::VaultError::NotFound { .. } => {
                CreditCardCommandError::NotFound
            }
            secretbank_storage::vault::VaultError::NotUnlocked => {
                CreditCardCommandError::VaultLocked
            }
            _ => CreditCardCommandError::Internal,
        })?;

    let value = String::from_utf8(secret_bytes.expose_secret().clone())
        .map_err(|_| CreditCardCommandError::Internal)?;

    drop(vault); // release read lock before async audit

    // 3. Audit log — action + credential_id only (B.1-6)
    state
        .audit
        .record(
            AuditActor::LocalUser,
            "credit_card.reveal_card_number",
            "credential",
            &credential_id,
            None,
        )
        .await;

    // 4. Return plaintext once — frontend clears after 30 s (B.5-2)
    //    SecretBytes is dropped here → zeroize
    Ok(value)
}

// ---------------------------------------------------------------------------
// reveal_cvc
// ---------------------------------------------------------------------------

/// Decrypt and return the CVC once.
///
/// Same 30-second auto-clear responsibility applies (B.5-2 / GATE 2-2).
#[tauri::command]
pub async fn reveal_cvc(
    state: State<'_, AppContext>,
    credential_id: String,
) -> Result<String, CreditCardCommandError> {
    // 1. Vault unlock check
    let vault = state.vault.read().await;
    if !vault.is_unlocked().await {
        return Err(CreditCardCommandError::VaultLocked);
    }

    // 2. Decrypt from vault
    let cvc_path = format!("credit_cards/{credential_id}/cvc");
    let secret_bytes = vault.get_secret(&cvc_path).await.map_err(|e| match e {
        secretbank_storage::vault::VaultError::NotFound { .. } => CreditCardCommandError::NotFound,
        secretbank_storage::vault::VaultError::NotUnlocked => CreditCardCommandError::VaultLocked,
        _ => CreditCardCommandError::Internal,
    })?;

    let value = String::from_utf8(secret_bytes.expose_secret().clone())
        .map_err(|_| CreditCardCommandError::Internal)?;

    drop(vault); // release read lock before async audit

    // 3. Audit log — action + credential_id only (B.1-6)
    state
        .audit
        .record(
            AuditActor::LocalUser,
            "credit_card.reveal_cvc",
            "credential",
            &credential_id,
            None,
        )
        .await;

    // 4. Return plaintext once — frontend clears after 30 s (B.5-2)
    //    SecretBytes is dropped here → zeroize
    Ok(value)
}

// ---------------------------------------------------------------------------
// Brand display helper
// ---------------------------------------------------------------------------

fn brand_display(brand: CardBrand) -> &'static str {
    match brand {
        CardBrand::Visa => "Visa",
        CardBrand::Mastercard => "Mastercard",
        CardBrand::Amex => "Amex",
        CardBrand::Discover => "Discover",
        CardBrand::Jcb => "JCB",
        CardBrand::Diners => "Diners",
        CardBrand::Unknown => "Card",
    }
}

// ---------------------------------------------------------------------------
// Tests (CC1 ~ CC5)
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use secretbank_audit::AuditActor;
    use secretbank_core::{CredentialInput, Env, IssuerId, IssuerInput};
    use secretbank_storage::sqlite::repositories::credential::CredentialRepo;
    use secretbank_storage::sqlite::repositories::issuer::IssuerRepo;
    use secretbank_storage::vault::mock::MockVaultStorage;
    use secretbank_storage::vault::{ExposeSecret, VaultStorage as _};
    use secretbank_storage::AuditRepo;
    use secrecy::SecretString;
    use tokio::sync::{Mutex, RwLock};

    use crate::audit_ctx::AuditCtx;
    use crate::commands::kill_switch::{ConfirmTokenStore, IssuerConfirmTokenStore};
    use crate::context::AppContext;
    use crate::services::device_identity::DeviceIdentity;

    use super::*;

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    async fn make_pool() -> (tempfile::TempDir, sqlx::SqlitePool) {
        let dir = tempfile::tempdir().expect("tempdir");
        let db_path = dir.path().join("test.db");
        let pool = secretbank_storage::sqlite::init_pool(&db_path)
            .await
            .expect("init_pool");
        (dir, pool)
    }

    async fn make_unlocked_vault() -> MockVaultStorage {
        let mut v = MockVaultStorage::new("pw");
        v.unlock(SecretString::from("pw".to_owned())).await.unwrap();
        v
    }

    async fn seed_issuer(pool: &sqlx::SqlitePool) -> IssuerId {
        IssuerRepo::new(pool)
            .insert(&IssuerInput {
                slug: format!("test-issuer-{}", ulid::Ulid::new()),
                display_name: "Test Issuer".to_string(),
                docs_url: None,
                issue_url: None,
                status_url: None,
                security_feed_url: None,
                connector_id: None,
                icon_key: None,
                default_primary_label: None,
                default_secondary_label: None,
                domains: vec![],
            })
            .await
            .expect("issuer insert")
    }

    fn make_ctx(pool: Arc<sqlx::SqlitePool>, vault: MockVaultStorage) -> AppContext {
        let vault_box: Box<dyn secretbank_storage::vault::VaultStorage + Send + Sync> =
            Box::new(vault);
        let vault_arc = Arc::new(RwLock::new(vault_box));
        let device_identity: Arc<RwLock<Option<DeviceIdentity>>> = Arc::new(RwLock::new(None));
        let audit = Arc::new(AuditCtx::new(pool.clone(), device_identity.clone()));
        AppContext {
            vault: vault_arc,
            pool,
            data_dir: std::path::PathBuf::from("/tmp/test"),
            user_id: "test".to_string(),
            clipboard_controller: Arc::new(Mutex::new(None)),
            feed_scheduler: Arc::new(Mutex::new(None)),
            device_identity,
            audit,
            kill_switch_tokens: Arc::new(ConfirmTokenStore::default()),
            issuer_kill_switch_tokens: Arc::new(IssuerConfirmTokenStore::default()),
            import_sessions: Arc::new(crate::import::ImportSessionStore::new()),
            relay_client: Arc::new(
                crate::services::relay_client::RelayClient::new(
                    url::Url::parse("http://localhost").unwrap(),
                )
                .unwrap(),
            ),
            auth_session: Arc::new(RwLock::new(None)),
            master_passphrase: Arc::new(RwLock::new(None)),
            db_change_emitter: crate::services::sync_emit::noop_emitter(),
            pairing_session: Arc::new(RwLock::new(None)),
        }
    }

    fn make_input(issuer_id: IssuerId) -> CreditCardInput {
        CreditCardInput {
            issuer_id,
            name: "My Visa".to_string(),
            brand: CardBrand::Visa,
            expiry_month: 12,
            expiry_year: 2030,
            cardholder_name: Some("Alice".to_string()),
            billing_address: None,
            last_4: "4242".to_string(),
            card_number_plain: "4111111111114242".to_string(),
            cvc_plain: "123".to_string(),
        }
    }

    // -----------------------------------------------------------------------
    // CC1: vault locked 상태 reveal_card_number → VaultLocked 에러 (B.1-9)
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn cc1_reveal_card_number_vault_locked_returns_error() {
        let (_dir, pool) = make_pool().await;
        let pool = Arc::new(pool);
        // Locked vault (not unlocked)
        let vault = MockVaultStorage::new("pw");
        let ctx = make_ctx(pool.clone(), vault);

        let result = reveal_card_number_inner(&ctx, "fake-id".to_string()).await;
        assert!(
            matches!(result, Err(CreditCardCommandError::VaultLocked)),
            "vault locked → VaultLocked error"
        );
    }

    // -----------------------------------------------------------------------
    // CC2: reveal_card_number → audit log row 생성 (B.1-6)
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn cc2_reveal_card_number_records_audit() {
        use crate::services::device_identity::ensure_device_keys;
        use secretbank_core::DevicePlatform;

        let (_dir, pool) = make_pool().await;
        let pool = Arc::new(pool);
        let mut vault = make_unlocked_vault().await;
        let issuer_id = seed_issuer(&pool).await;

        // Pre-seed vault secret directly
        let cred_id = CredentialId::new();
        let cred_id_str = cred_id.to_string();
        let card_number_path = format!("credit_cards/{cred_id_str}/card_number");
        let vault_ref = card_number_path.clone();

        let cred_repo = CredentialRepo::new(&pool);
        cred_repo
            .insert_with_id(
                Some(cred_id),
                &CredentialInput {
                    issuer_id,
                    name: "Test Card".to_string(),
                    env: Env::Prod,
                    scope: None,
                    owner: None,
                    rotation_policy_days: None,
                    rotation_runbook_id: None,
                    expires_at: None,
                    hash_hint: Some("4242".to_string()),
                    kind: CredentialKind::CreditCard,
                    url: None,
                    username: None,
                    primary_label: None,
                    secondary_label: None,
                },
                vault_ref.clone(),
            )
            .await
            .unwrap();

        let card_bytes =
            secretbank_storage::vault::SecretBytes::new("4111111111114242".as_bytes().to_vec());
        vault
            .put_secret(&card_number_path, card_bytes)
            .await
            .unwrap();

        // Build ctx with device identity for audit
        let vault_for_id: Arc<
            RwLock<Box<dyn secretbank_storage::vault::VaultStorage + Send + Sync>>,
        > = {
            let mut v = MockVaultStorage::new("pw");
            v.unlock(SecretString::from("pw".to_owned())).await.unwrap();
            Arc::new(RwLock::new(Box::new(v)))
        };
        let identity = ensure_device_keys(
            vault_for_id,
            pool.as_ref(),
            "test-device",
            DevicePlatform::Linux,
        )
        .await
        .expect("ensure_device_keys");

        let vault_box: Box<dyn secretbank_storage::vault::VaultStorage + Send + Sync> =
            Box::new(vault);
        let vault_arc = Arc::new(RwLock::new(vault_box));
        let device_identity: Arc<RwLock<Option<DeviceIdentity>>> =
            Arc::new(RwLock::new(Some(identity)));
        let audit = Arc::new(AuditCtx::new(pool.clone(), device_identity.clone()));
        let ctx = AppContext {
            vault: vault_arc,
            pool: pool.clone(),
            data_dir: std::path::PathBuf::from("/tmp/test"),
            user_id: "test".to_string(),
            clipboard_controller: Arc::new(Mutex::new(None)),
            feed_scheduler: Arc::new(Mutex::new(None)),
            device_identity,
            audit,
            kill_switch_tokens: Arc::new(ConfirmTokenStore::default()),
            issuer_kill_switch_tokens: Arc::new(IssuerConfirmTokenStore::default()),
            import_sessions: Arc::new(crate::import::ImportSessionStore::new()),
            relay_client: Arc::new(
                crate::services::relay_client::RelayClient::new(
                    url::Url::parse("http://localhost").unwrap(),
                )
                .unwrap(),
            ),
            auth_session: Arc::new(RwLock::new(None)),
            master_passphrase: Arc::new(RwLock::new(None)),
            db_change_emitter: crate::services::sync_emit::noop_emitter(),
            pairing_session: Arc::new(RwLock::new(None)),
        };

        let result = reveal_card_number_inner(&ctx, cred_id_str.clone()).await;
        assert!(result.is_ok(), "reveal should succeed: {:?}", result);

        let audit_repo = AuditRepo::new(pool.as_ref());
        let entries = audit_repo.list_for_verify().await.unwrap();
        let reveal_entries: Vec<_> = entries
            .iter()
            .filter(|e| e.action == "credit_card.reveal_card_number")
            .collect();
        assert_eq!(
            reveal_entries.len(),
            1,
            "expected 1 audit entry for reveal_card_number, got {}",
            reveal_entries.len()
        );
    }

    // -----------------------------------------------------------------------
    // CC3: create_credit_card → credit_card_meta + vault put_secret + audit
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn cc3_create_credit_card_full_chain() {
        use crate::services::device_identity::ensure_device_keys;
        use secretbank_core::DevicePlatform;

        let (_dir, pool) = make_pool().await;
        let pool = Arc::new(pool);
        let vault = make_unlocked_vault().await;
        let issuer_id = seed_issuer(&pool).await;

        let vault_for_id: Arc<
            RwLock<Box<dyn secretbank_storage::vault::VaultStorage + Send + Sync>>,
        > = {
            let mut v = MockVaultStorage::new("pw");
            v.unlock(SecretString::from("pw".to_owned())).await.unwrap();
            Arc::new(RwLock::new(Box::new(v)))
        };
        let identity = ensure_device_keys(
            vault_for_id,
            pool.as_ref(),
            "test-device",
            DevicePlatform::Linux,
        )
        .await
        .expect("ensure_device_keys");

        let vault_box: Box<dyn secretbank_storage::vault::VaultStorage + Send + Sync> =
            Box::new(vault);
        let vault_arc = Arc::new(RwLock::new(vault_box));
        let device_identity: Arc<RwLock<Option<DeviceIdentity>>> =
            Arc::new(RwLock::new(Some(identity)));
        let audit = Arc::new(AuditCtx::new(pool.clone(), device_identity.clone()));
        let ctx = AppContext {
            vault: vault_arc,
            pool: pool.clone(),
            data_dir: std::path::PathBuf::from("/tmp/test"),
            user_id: "test".to_string(),
            clipboard_controller: Arc::new(Mutex::new(None)),
            feed_scheduler: Arc::new(Mutex::new(None)),
            device_identity,
            audit,
            kill_switch_tokens: Arc::new(ConfirmTokenStore::default()),
            issuer_kill_switch_tokens: Arc::new(IssuerConfirmTokenStore::default()),
            import_sessions: Arc::new(crate::import::ImportSessionStore::new()),
            relay_client: Arc::new(
                crate::services::relay_client::RelayClient::new(
                    url::Url::parse("http://localhost").unwrap(),
                )
                .unwrap(),
            ),
            auth_session: Arc::new(RwLock::new(None)),
            master_passphrase: Arc::new(RwLock::new(None)),
            db_change_emitter: crate::services::sync_emit::noop_emitter(),
            pairing_session: Arc::new(RwLock::new(None)),
        };

        let input = make_input(issuer_id);
        let summary = create_credit_card_inner(&ctx, input).await.unwrap();

        // CreditCardSummary has no secret fields
        assert_eq!(summary.last_4, "4242");
        assert_eq!(summary.brand, CardBrand::Visa);
        assert_eq!(summary.expiry_month, 12);
        assert_eq!(summary.expiry_year, 2030);
        assert_eq!(summary.cardholder_name.as_deref(), Some("Alice"));

        let cred_id_str = summary.credential_id.to_string();

        // credit_card_meta row exists
        let cc_repo = CreditCardMetaRepo::new(&pool);
        let meta = cc_repo
            .get_by_credential(&cred_id_str)
            .await
            .unwrap()
            .expect("meta should exist");
        assert_eq!(meta.last_4, "4242");

        // vault secrets exist
        let vault_guard = ctx.vault.read().await;
        let card_bytes = vault_guard
            .get_secret(&format!("credit_cards/{cred_id_str}/card_number"))
            .await
            .unwrap();
        let card_str = String::from_utf8(card_bytes.expose_secret().clone()).unwrap();
        assert_eq!(card_str, "4111111111114242");

        let cvc_bytes = vault_guard
            .get_secret(&format!("credit_cards/{cred_id_str}/cvc"))
            .await
            .unwrap();
        let cvc_str = String::from_utf8(cvc_bytes.expose_secret().clone()).unwrap();
        assert_eq!(cvc_str, "123");
        drop(vault_guard);

        // audit log entry
        let audit_repo = AuditRepo::new(pool.as_ref());
        let entries = audit_repo.list_for_verify().await.unwrap();
        let create_entries: Vec<_> = entries
            .iter()
            .filter(|e| e.action == "credit_card.create")
            .collect();
        assert_eq!(
            create_entries.len(),
            1,
            "expected 1 credit_card.create audit entry"
        );
    }

    // -----------------------------------------------------------------------
    // CC4: list_credit_cards → 평문 secret 미포함 (B.1-3)
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn cc4_list_credit_cards_no_secrets() {
        let (_dir, pool) = make_pool().await;
        let pool = Arc::new(pool);
        let vault = make_unlocked_vault().await;
        let issuer_id = seed_issuer(&pool).await;
        let ctx = make_ctx(pool.clone(), vault);

        // Seed one meta row directly
        let cred_id = CredentialId::new();
        let cred_repo = CredentialRepo::new(&pool);
        cred_repo
            .insert_with_id(
                Some(cred_id),
                &CredentialInput {
                    issuer_id,
                    name: "Test Card".to_string(),
                    env: Env::Prod,
                    scope: None,
                    owner: None,
                    rotation_policy_days: None,
                    rotation_runbook_id: None,
                    expires_at: None,
                    hash_hint: Some("9999".to_string()),
                    kind: CredentialKind::CreditCard,
                    url: None,
                    username: None,
                    primary_label: None,
                    secondary_label: None,
                },
                format!("credit_cards/{cred_id}/card_number"),
            )
            .await
            .unwrap();

        let cc_repo = CreditCardMetaRepo::new(&pool);
        cc_repo
            .insert(
                &CreditCardMeta {
                    credential_id: cred_id,
                    brand: CardBrand::Mastercard,
                    expiry_month: 6,
                    expiry_year: 2028,
                    cardholder_name: None,
                    billing_address: None,
                    last_4: "9999".to_string(),
                },
                &now_iso8601(),
            )
            .await
            .unwrap();

        let list = list_credit_cards_inner(&ctx).await.unwrap();
        assert_eq!(list.len(), 1);

        // Verify via JSON serialisation that no card_number / cvc fields exist
        let json = serde_json::to_value(&list[0]).unwrap();
        assert!(
            json.get("card_number").is_none(),
            "no card_number in summary"
        );
        assert!(json.get("cvc").is_none(), "no cvc in summary");
        assert!(
            json.get("card_number_plain").is_none(),
            "no card_number_plain in summary"
        );
        assert!(json.get("cvc_plain").is_none(), "no cvc_plain in summary");
    }

    // -----------------------------------------------------------------------
    // CC5: reveal_cvc vault locked → VaultLocked + unlocked → CVC 반환
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn cc5_reveal_cvc_locked_and_unlocked() {
        let (_dir, pool) = make_pool().await;
        let pool = Arc::new(pool);

        // Locked
        let locked_vault = MockVaultStorage::new("pw");
        let ctx_locked = make_ctx(pool.clone(), locked_vault);
        let result = reveal_cvc_inner(&ctx_locked, "fake-id".to_string()).await;
        assert!(
            matches!(result, Err(CreditCardCommandError::VaultLocked)),
            "locked vault → VaultLocked"
        );

        // Unlocked
        let mut unlocked_vault = make_unlocked_vault().await;
        let issuer_id = seed_issuer(&pool).await;

        let cred_id = CredentialId::new();
        let cred_id_str = cred_id.to_string();
        let cvc_path = format!("credit_cards/{cred_id_str}/cvc");
        let cvc_bytes = secretbank_storage::vault::SecretBytes::new("321".as_bytes().to_vec());
        unlocked_vault
            .put_secret(&cvc_path, cvc_bytes)
            .await
            .unwrap();

        let cred_repo = CredentialRepo::new(&pool);
        cred_repo
            .insert_with_id(
                Some(cred_id),
                &CredentialInput {
                    issuer_id,
                    name: "CVC test".to_string(),
                    env: Env::Prod,
                    scope: None,
                    owner: None,
                    rotation_policy_days: None,
                    rotation_runbook_id: None,
                    expires_at: None,
                    hash_hint: Some("1234".to_string()),
                    kind: CredentialKind::CreditCard,
                    url: None,
                    username: None,
                    primary_label: None,
                    secondary_label: None,
                },
                format!("credit_cards/{cred_id_str}/card_number"),
            )
            .await
            .unwrap();

        let ctx_unlocked = make_ctx(pool.clone(), unlocked_vault);
        let cvc = reveal_cvc_inner(&ctx_unlocked, cred_id_str.clone())
            .await
            .unwrap();
        assert_eq!(cvc, "321", "CVC should be decrypted correctly");
    }

    // -----------------------------------------------------------------------
    // Inner helper functions (mirror command logic without Tauri State)
    // -----------------------------------------------------------------------

    async fn create_credit_card_inner(
        ctx: &AppContext,
        input: CreditCardInput,
    ) -> Result<CreditCardSummary, CreditCardCommandError> {
        {
            let vault = ctx.vault.read().await;
            if !vault.is_unlocked().await {
                return Err(CreditCardCommandError::VaultLocked);
            }
        }

        let id = CredentialId::new();
        let id_str = id.to_string();
        let card_number_path = format!("credit_cards/{id_str}/card_number");
        let cvc_path = format!("credit_cards/{id_str}/cvc");
        let vault_ref = card_number_path.clone();

        let name = if input.name.is_empty() {
            format!(
                "{} \u{2022}\u{2022}\u{2022}\u{2022} {}",
                brand_display(input.brand),
                input.last_4
            )
        } else {
            input.name.clone()
        };

        let cred_input = CredentialInput {
            issuer_id: input.issuer_id,
            name,
            env: Env::Prod,
            scope: None,
            rotation_policy_days: None,
            rotation_runbook_id: None,
            expires_at: None,
            owner: None,
            hash_hint: Some(input.last_4.clone()),
            kind: CredentialKind::CreditCard,
            url: None,
            username: None,
            primary_label: Some("Card Number".to_string()),
            secondary_label: Some("CVC".to_string()),
        };

        let cred_repo = CredentialRepo::new(&ctx.pool);
        cred_repo
            .insert_with_id(Some(id), &cred_input, vault_ref)
            .await
            .map_err(|_| CreditCardCommandError::Internal)?;

        {
            let card_number_bytes = SecretBytes::new(input.card_number_plain.as_bytes().to_vec());
            let cvc_bytes = SecretBytes::new(input.cvc_plain.as_bytes().to_vec());
            let mut vault = ctx.vault.write().await;
            vault
                .put_secret(&card_number_path, card_number_bytes)
                .await
                .map_err(|_| CreditCardCommandError::Internal)?;
            vault
                .put_secret(&cvc_path, cvc_bytes)
                .await
                .map_err(|_| CreditCardCommandError::Internal)?;
            vault
                .flush()
                .await
                .map_err(|_| CreditCardCommandError::Internal)?;
        }

        let now = now_iso8601();
        let meta = CreditCardMeta {
            credential_id: id,
            brand: input.brand,
            expiry_month: input.expiry_month,
            expiry_year: input.expiry_year,
            cardholder_name: input.cardholder_name,
            billing_address: input.billing_address,
            last_4: input.last_4,
        };

        let cc_repo = CreditCardMetaRepo::new(&ctx.pool);
        cc_repo
            .insert(&meta, &now)
            .await
            .map_err(|_| CreditCardCommandError::Internal)?;

        ctx.audit
            .record(
                AuditActor::LocalUser,
                "credit_card.create",
                "credential",
                &id_str,
                None,
            )
            .await;

        Ok(meta_to_summary(meta))
    }

    async fn list_credit_cards_inner(
        ctx: &AppContext,
    ) -> Result<Vec<CreditCardSummary>, CreditCardCommandError> {
        {
            let vault = ctx.vault.read().await;
            if !vault.is_unlocked().await {
                return Ok(vec![]);
            }
        }
        let cc_repo = CreditCardMetaRepo::new(&ctx.pool);
        let metas = cc_repo
            .list_all()
            .await
            .map_err(|_| CreditCardCommandError::Internal)?;
        Ok(metas.into_iter().map(meta_to_summary).collect())
    }

    async fn reveal_card_number_inner(
        ctx: &AppContext,
        credential_id: String,
    ) -> Result<String, CreditCardCommandError> {
        let vault = ctx.vault.read().await;
        if !vault.is_unlocked().await {
            return Err(CreditCardCommandError::VaultLocked);
        }
        let card_number_path = format!("credit_cards/{credential_id}/card_number");
        let secret_bytes = vault
            .get_secret(&card_number_path)
            .await
            .map_err(|e| match e {
                secretbank_storage::vault::VaultError::NotFound { .. } => {
                    CreditCardCommandError::NotFound
                }
                secretbank_storage::vault::VaultError::NotUnlocked => {
                    CreditCardCommandError::VaultLocked
                }
                _ => CreditCardCommandError::Internal,
            })?;
        let value = String::from_utf8(secret_bytes.expose_secret().clone())
            .map_err(|_| CreditCardCommandError::Internal)?;
        drop(vault);
        ctx.audit
            .record(
                AuditActor::LocalUser,
                "credit_card.reveal_card_number",
                "credential",
                &credential_id,
                None,
            )
            .await;
        Ok(value)
    }

    async fn reveal_cvc_inner(
        ctx: &AppContext,
        credential_id: String,
    ) -> Result<String, CreditCardCommandError> {
        let vault = ctx.vault.read().await;
        if !vault.is_unlocked().await {
            return Err(CreditCardCommandError::VaultLocked);
        }
        let cvc_path = format!("credit_cards/{credential_id}/cvc");
        let secret_bytes = vault.get_secret(&cvc_path).await.map_err(|e| match e {
            secretbank_storage::vault::VaultError::NotFound { .. } => {
                CreditCardCommandError::NotFound
            }
            secretbank_storage::vault::VaultError::NotUnlocked => {
                CreditCardCommandError::VaultLocked
            }
            _ => CreditCardCommandError::Internal,
        })?;
        let value = String::from_utf8(secret_bytes.expose_secret().clone())
            .map_err(|_| CreditCardCommandError::Internal)?;
        drop(vault);
        ctx.audit
            .record(
                AuditActor::LocalUser,
                "credit_card.reveal_cvc",
                "credential",
                &credential_id,
                None,
            )
            .await;
        Ok(value)
    }
}
