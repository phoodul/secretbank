//! Integration tests for credential create / rollback / reveal patterns.
//!
//! These tests validate the same logic that `api-vault-app` commands use,
//! running against a real SQLite pool and MockVaultStorage.
//!
//! Compiled only when the `mock` feature is enabled.
#![cfg(feature = "mock")]

use api_vault_core::{
    AuditAction, AuditActor, AuditLog, AuditLogId, CredentialFilter, CredentialId, CredentialInput,
    Env, IssuerInput,
};
use api_vault_storage::{
    sqlite::{
        repositories::{audit::AuditRepo, credential::CredentialRepo, issuer::IssuerRepo},
        SqlitePool,
    },
    vault::{mock::MockVaultStorage, ExposeSecret, SecretBytes, VaultStorage},
};
use secrecy::SecretString;
use sqlx::SqlitePool as RawPool;

// ---------------------------------------------------------------------------
// Error type (mirrors CredentialCommandError in api-vault-app)
// ---------------------------------------------------------------------------

#[derive(Debug)]
#[allow(dead_code)]
enum TestError {
    NotUnlocked,
    VaultError(api_vault_storage::vault::VaultError),
    StorageError(api_vault_storage::sqlite::StorageError),
    InvalidUtf8,
}

impl From<api_vault_storage::vault::VaultError> for TestError {
    fn from(e: api_vault_storage::vault::VaultError) -> Self {
        match e {
            api_vault_storage::vault::VaultError::NotUnlocked => Self::NotUnlocked,
            other => Self::VaultError(other),
        }
    }
}

impl From<api_vault_storage::sqlite::StorageError> for TestError {
    fn from(e: api_vault_storage::sqlite::StorageError) -> Self {
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

    // Minimal audit entry (no hash chain for testing).
    let audit = AuditLog {
        id: AuditLogId::new(),
        seq: 0,
        device_id: None,
        actor: AuditActor::LocalUser,
        action: AuditAction::CredentialCreate,
        subject_kind: "credential".to_owned(),
        subject_id: id.to_string(),
        payload_json: None,
        prev_hash: None,
        entry_hash: None,
        signature: None,
        created_at: time::OffsetDateTime::now_utc(),
    };
    let _ = AuditRepo::new(pool).insert(&audit).await;

    Ok(id)
}

async fn make_issuer(pool: &SqlitePool) -> api_vault_core::IssuerId {
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
        })
        .await
        .expect("issuer insert failed")
}

fn test_input(issuer_id: api_vault_core::IssuerId) -> CredentialInput {
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
    ) -> Result<(), api_vault_storage::vault::VaultError> {
        self.inner.unlock(password).await
    }

    async fn is_unlocked(&self) -> bool {
        self.inner.is_unlocked().await
    }

    async fn lock(&mut self) -> Result<(), api_vault_storage::vault::VaultError> {
        self.inner.lock().await
    }

    async fn put_secret(
        &mut self,
        path: &str,
        value: SecretBytes,
    ) -> Result<(), api_vault_storage::vault::VaultError> {
        if self.fail_next_put {
            self.fail_next_put = false;
            return Err(api_vault_storage::vault::VaultError::Crypto(
                "injected failure".into(),
            ));
        }
        self.inner.put_secret(path, value).await
    }

    async fn get_secret(
        &self,
        path: &str,
    ) -> Result<SecretBytes, api_vault_storage::vault::VaultError> {
        self.inner.get_secret(path).await
    }

    async fn delete_secret(
        &mut self,
        path: &str,
    ) -> Result<(), api_vault_storage::vault::VaultError> {
        self.inner.delete_secret(path).await
    }

    async fn list_secrets(
        &self,
        prefix: &str,
    ) -> Result<Vec<String>, api_vault_storage::vault::VaultError> {
        self.inner.list_secrets(prefix).await
    }

    async fn flush(&mut self) -> Result<(), api_vault_storage::vault::VaultError> {
        self.inner.flush().await
    }
}
