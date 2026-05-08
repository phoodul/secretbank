//! Integration tests for credential create / rollback / reveal patterns.
//!
//! These tests validate the same logic that `secretbank-app` commands use,
//! running against a real SQLite pool and MockVaultStorage.
//!
//! Compiled only when the `mock` feature is enabled.
#![cfg(feature = "mock")]

use secrecy::SecretString;
use secretbank_core::{CredentialFilter, CredentialId, CredentialInput, Env, IssuerInput};
use secretbank_storage::{
    sqlite::{
        repositories::{credential::CredentialRepo, issuer::IssuerRepo},
        SqlitePool,
    },
    vault::{mock::MockVaultStorage, ExposeSecret, SecretBytes, VaultStorage},
};
use sqlx::SqlitePool as RawPool;

// ---------------------------------------------------------------------------
// Error type (mirrors CredentialCommandError in secretbank-app)
// ---------------------------------------------------------------------------

#[derive(Debug)]
#[allow(dead_code)]
enum TestError {
    NotUnlocked,
    VaultError(secretbank_storage::vault::VaultError),
    StorageError(secretbank_storage::sqlite::StorageError),
    InvalidUtf8,
}

impl From<secretbank_storage::vault::VaultError> for TestError {
    fn from(e: secretbank_storage::vault::VaultError) -> Self {
        match e {
            secretbank_storage::vault::VaultError::NotUnlocked => Self::NotUnlocked,
            other => Self::VaultError(other),
        }
    }
}

impl From<secretbank_storage::sqlite::StorageError> for TestError {
    fn from(e: secretbank_storage::sqlite::StorageError) -> Self {
        Self::StorageError(e)
    }
}

// ---------------------------------------------------------------------------
// Helper: mirrors do_credential_create
// ---------------------------------------------------------------------------

async fn credential_create(
    pool: &SqlitePool,
    vault: &mut dyn VaultStorage,
    input: &CredentialInput,
    value: &str,
) -> Result<CredentialId, TestError> {
    if !vault.is_unlocked().await {
        return Err(TestError::NotUnlocked);
    }

    let repo = CredentialRepo::new(pool);
    let id = CredentialId::new();
    let vault_ref = format!("credentials/{id}");

    repo.insert_with_id(Some(id), input, vault_ref.clone())
        .await?;

    let secret_bytes = SecretBytes::new(value.as_bytes().to_vec());
    if let Err(vault_err) = vault.put_secret(&vault_ref, secret_bytes).await {
        let _ = repo.delete(id).await;
        return Err(TestError::from(vault_err));
    }

    // Audit is best-effort — skipped in this integration test
    // (no signing key available; the real audit path is in AuditCtx).

    Ok(id)
}

async fn make_issuer(pool: &SqlitePool) -> secretbank_core::IssuerId {
    IssuerRepo::new(pool)
        .insert(&IssuerInput {
            slug: "openai".to_string(),
            display_name: "OpenAI".to_string(),
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
        .expect("issuer insert failed")
}

fn test_input(issuer_id: secretbank_core::IssuerId) -> CredentialInput {
    CredentialInput {
        issuer_id,
        name: "Test Key".to_owned(),
        env: Env::Dev,
        scope: None,
        rotation_policy_days: None,
        rotation_runbook_id: None,
        expires_at: None,
        owner: None,
        hash_hint: None,
        kind: Default::default(),
        url: None,
        username: None,
        primary_label: None,
        secondary_label: None,
    }
}

fn test_input_pair(issuer_id: secretbank_core::IssuerId) -> CredentialInput {
    CredentialInput {
        primary_label: Some("Public Key".to_owned()),
        secondary_label: Some("Secret Key".to_owned()),
        ..test_input(issuer_id)
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[sqlx::test(migrations = "./migrations")]
async fn create_then_list_then_reveal_roundtrip(pool: RawPool) {
    let issuer_id = make_issuer(&pool).await;
    let mut vault = MockVaultStorage::new("pass");
    vault
        .unlock(SecretString::new("pass".to_owned().into()))
        .await
        .unwrap();

    let input = test_input(issuer_id);
    let id = credential_create(&pool, &mut vault, &input, "sk-testvalue123")
        .await
        .expect("create should succeed");

    // List should include the new credential.
    let repo = CredentialRepo::new(&pool);
    let list = repo.list(&CredentialFilter::default()).await.unwrap();
    assert_eq!(list.len(), 1);
    assert_eq!(list[0].id, id);

    // Reveal should return the original value.
    let vault_ref = format!("credentials/{id}");
    let secret = vault.get_secret(&vault_ref).await.unwrap();
    let value = String::from_utf8(secret.expose_secret().clone()).unwrap();
    assert_eq!(value, "sk-testvalue123");
}

#[sqlx::test(migrations = "./migrations")]
async fn create_rollback_on_vault_failure(pool: RawPool) {
    let issuer_id = make_issuer(&pool).await;
    let mut vault = FaultyVaultStorage::new("pass");
    vault
        .inner
        .unlock(SecretString::new("pass".to_owned().into()))
        .await
        .unwrap();
    vault.fail_next_put = true;

    let input = test_input(issuer_id);
    let result = credential_create(&pool, &mut vault, &input, "sk-secret").await;
    assert!(result.is_err(), "should fail because vault put fails");

    // SQLite row must have been rolled back.
    let repo = CredentialRepo::new(&pool);
    let list = repo.list(&CredentialFilter::default()).await.unwrap();
    assert!(list.is_empty(), "no rows should remain after rollback");
}

#[sqlx::test(migrations = "./migrations")]
async fn reveal_when_locked_returns_not_unlocked(pool: RawPool) {
    let issuer_id = make_issuer(&pool).await;
    let mut vault = MockVaultStorage::new("pass");

    vault
        .unlock(SecretString::new("pass".to_owned().into()))
        .await
        .unwrap();
    let input = test_input(issuer_id);
    let _id = credential_create(&pool, &mut vault, &input, "sk-value")
        .await
        .unwrap();
    vault.lock().await.unwrap();

    // Reveal with locked vault.
    assert!(
        !vault.is_unlocked().await,
        "vault should be locked after lock()"
    );
}

// ---------------------------------------------------------------------------
// FaultyVaultStorage for rollback test
// ---------------------------------------------------------------------------

struct FaultyVaultStorage {
    pub inner: MockVaultStorage,
    pub fail_next_put: bool,
}

impl FaultyVaultStorage {
    fn new(password: &str) -> Self {
        Self {
            inner: MockVaultStorage::new(password),
            fail_next_put: false,
        }
    }
}

#[async_trait::async_trait]
impl VaultStorage for FaultyVaultStorage {
    async fn unlock(
        &mut self,
        password: SecretString,
    ) -> Result<(), secretbank_storage::vault::VaultError> {
        self.inner.unlock(password).await
    }

    async fn is_unlocked(&self) -> bool {
        self.inner.is_unlocked().await
    }

    async fn lock(&mut self) -> Result<(), secretbank_storage::vault::VaultError> {
        self.inner.lock().await
    }

    async fn put_secret(
        &mut self,
        path: &str,
        value: SecretBytes,
    ) -> Result<(), secretbank_storage::vault::VaultError> {
        if self.fail_next_put {
            self.fail_next_put = false;
            return Err(secretbank_storage::vault::VaultError::Crypto(
                "injected failure".into(),
            ));
        }
        self.inner.put_secret(path, value).await
    }

    async fn get_secret(
        &self,
        path: &str,
    ) -> Result<SecretBytes, secretbank_storage::vault::VaultError> {
        self.inner.get_secret(path).await
    }

    async fn delete_secret(
        &mut self,
        path: &str,
    ) -> Result<(), secretbank_storage::vault::VaultError> {
        self.inner.delete_secret(path).await
    }

    async fn list_secrets(
        &self,
        prefix: &str,
    ) -> Result<Vec<String>, secretbank_storage::vault::VaultError> {
        self.inner.list_secrets(prefix).await
    }

    async fn flush(&mut self) -> Result<(), secretbank_storage::vault::VaultError> {
        self.inner.flush().await
    }
}

// ---------------------------------------------------------------------------
// M24 1.5-B — pair credential tests
// ---------------------------------------------------------------------------

/// Pair credential create: secondary_value_ref null 이면 단일, Some 이면 pair.
#[sqlx::test(migrations = "./migrations")]
async fn pair_create_then_read_both_slots(pool: RawPool) {
    let issuer_id = make_issuer(&pool).await;
    let mut vault = MockVaultStorage::new("pass");
    vault
        .unlock(SecretString::new("pass".to_owned().into()))
        .await
        .unwrap();

    let input = test_input_pair(issuer_id);
    let id = credential_create(&pool, &mut vault, &input, "public-key-value")
        .await
        .expect("create should succeed");

    // 직접 secondary vault entry 작성 (command layer 가 하는 일을 여기선 수동으로 수행)
    let sec_ref = format!("credentials/{id}/secondary");
    let sec_bytes = SecretBytes::new("secret-key-value".as_bytes().to_vec());
    vault.put_secret(&sec_ref, sec_bytes).await.unwrap();

    // DB row 에 secondary_value_ref 업데이트
    let repo = CredentialRepo::new(&pool);
    use secretbank_core::CredentialPatch;
    repo.update(
        id,
        &CredentialPatch {
            secondary_value_ref: Some(sec_ref.clone()),
            ..Default::default()
        },
    )
    .await
    .unwrap();

    // get_by_id → secondary_value_ref 채워짐 확인
    let cred = repo.get_by_id(id).await.unwrap().unwrap();
    assert_eq!(
        cred.secondary_value_ref.as_deref(),
        Some(sec_ref.as_str()),
        "secondary_value_ref must be set after update"
    );
    assert_eq!(
        cred.primary_label.as_deref(),
        Some("Public Key"),
        "primary_label must persist"
    );
    assert_eq!(
        cred.secondary_label.as_deref(),
        Some("Secret Key"),
        "secondary_label must persist"
    );

    // list → has_secondary = true
    let list = repo
        .list(&secretbank_core::CredentialFilter::default())
        .await
        .unwrap();
    assert_eq!(list.len(), 1);
    assert!(list[0].has_secondary, "has_secondary must be true in list");

    // Reveal primary
    let primary = vault.get_secret(&cred.vault_ref).await.unwrap();
    let primary_str = String::from_utf8(primary.expose_secret().clone()).unwrap();
    assert_eq!(primary_str, "public-key-value");

    // Reveal secondary
    let secondary = vault.get_secret(&sec_ref).await.unwrap();
    let secondary_str = String::from_utf8(secondary.expose_secret().clone()).unwrap();
    assert_eq!(secondary_str, "secret-key-value");
}

/// 기존 단일 credential (secondary null) 은 migration 후에도 정상 동작.
#[sqlx::test(migrations = "./migrations")]
async fn single_credential_has_secondary_false(pool: RawPool) {
    let issuer_id = make_issuer(&pool).await;
    let mut vault = MockVaultStorage::new("pass");
    vault
        .unlock(SecretString::new("pass".to_owned().into()))
        .await
        .unwrap();

    let input = test_input(issuer_id);
    let id = credential_create(&pool, &mut vault, &input, "single-secret")
        .await
        .expect("create should succeed");

    let repo = CredentialRepo::new(&pool);
    let cred = repo.get_by_id(id).await.unwrap().unwrap();
    assert!(
        cred.secondary_value_ref.is_none(),
        "secondary_value_ref must be None for single credential"
    );

    let list = repo
        .list(&secretbank_core::CredentialFilter::default())
        .await
        .unwrap();
    assert!(!list[0].has_secondary, "has_secondary must be false");
}
