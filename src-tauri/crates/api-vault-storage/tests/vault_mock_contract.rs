//! Contract tests for `VaultStorage` using `MockVaultStorage`.
//!
//! These 7 scenarios verify the behavioural contract that every
//! `VaultStorage` implementation must satisfy.

use api_vault_storage::vault::{
    mock::MockVaultStorage, ExposeSecret, SecretBytes, VaultError, VaultStorage,
};
use secrecy::SecretString;

fn secret_str(s: &str) -> SecretString {
    SecretString::from(s)
}

fn secret_bytes(b: &[u8]) -> SecretBytes {
    SecretBytes::new(b.to_vec())
}

// ── 1. unlock with correct password ──────────────────────────────────────────

#[tokio::test]
async fn unlock_with_correct_password_succeeds() {
    let mut vault = MockVaultStorage::new("correct-horse");
    assert!(!vault.is_unlocked().await);

    vault
        .unlock(secret_str("correct-horse"))
        .await
        .expect("unlock should succeed with the correct password");

    assert!(vault.is_unlocked().await);
}

// ── 2. unlock with wrong password ────────────────────────────────────────────

#[tokio::test]
async fn unlock_with_wrong_password_fails_with_wrongpassword() {
    let mut vault = MockVaultStorage::new("correct-horse");

    let err = vault
        .unlock(secret_str("wrong-guess"))
        .await
        .expect_err("unlock should fail with a wrong password");

    assert!(
        matches!(err, VaultError::WrongPassword),
        "expected WrongPassword, got: {err}"
    );
}

// ── 3. put / get roundtrip ────────────────────────────────────────────────────

#[tokio::test]
async fn put_get_roundtrip() {
    let mut vault = MockVaultStorage::new("s3cr3t");
    vault.unlock(secret_str("s3cr3t")).await.unwrap();

    let payload = b"super-secret-api-key-value";
    vault
        .put_secret("openai/prod/key", secret_bytes(payload))
        .await
        .expect("put_secret should succeed when unlocked");

    let retrieved = vault
        .get_secret("openai/prod/key")
        .await
        .expect("get_secret should return the stored value");

    assert_eq!(retrieved.expose_secret().as_slice(), payload);
}

// ── 4. get before unlock ──────────────────────────────────────────────────────

#[tokio::test]
async fn get_before_unlock_fails_with_notunlocked() {
    let vault = MockVaultStorage::new("s3cr3t");

    let err = vault
        .get_secret("openai/prod/key")
        .await
        .expect_err("get_secret should fail before unlock");

    assert!(
        matches!(err, VaultError::NotUnlocked),
        "expected NotUnlocked, got: {err}"
    );
}

// ── 5. delete removes secret ──────────────────────────────────────────────────

#[tokio::test]
async fn delete_removes_secret() {
    let mut vault = MockVaultStorage::new("s3cr3t");
    vault.unlock(secret_str("s3cr3t")).await.unwrap();

    vault
        .put_secret("stripe/prod/key", secret_bytes(b"sk_live_xxx"))
        .await
        .unwrap();

    vault
        .delete_secret("stripe/prod/key")
        .await
        .expect("delete_secret should succeed");

    let err = vault
        .get_secret("stripe/prod/key")
        .await
        .expect_err("get_secret after delete should fail");

    assert!(
        matches!(err, VaultError::NotFound { ref path } if path == "stripe/prod/key"),
        "expected NotFound(stripe/prod/key), got: {err}"
    );
}

// ── 6. delete missing path returns NotFound ───────────────────────────────────

#[tokio::test]
async fn delete_missing_path_fails_with_notfound() {
    let mut vault = MockVaultStorage::new("s3cr3t");
    vault.unlock(secret_str("s3cr3t")).await.unwrap();

    let err = vault
        .delete_secret("does/not/exist")
        .await
        .expect_err("delete_secret on a missing path should fail");

    assert!(
        matches!(err, VaultError::NotFound { ref path } if path == "does/not/exist"),
        "expected NotFound(does/not/exist), got: {err}"
    );
}

// ── 7. list_secrets filters by prefix ────────────────────────────────────────

#[tokio::test]
async fn list_secrets_with_prefix_filters_correctly() {
    let mut vault = MockVaultStorage::new("s3cr3t");
    vault.unlock(secret_str("s3cr3t")).await.unwrap();

    vault
        .put_secret("openai/prod/key", secret_bytes(b"v1"))
        .await
        .unwrap();
    vault
        .put_secret("openai/staging/key", secret_bytes(b"v2"))
        .await
        .unwrap();
    vault
        .put_secret("stripe/prod/key", secret_bytes(b"v3"))
        .await
        .unwrap();

    let openai_paths = vault
        .list_secrets("openai/")
        .await
        .expect("list_secrets should succeed when unlocked");

    assert_eq!(
        openai_paths,
        vec!["openai/prod/key", "openai/staging/key"],
        "list should return only openai/ paths in sorted order"
    );

    let all_paths = vault.list_secrets("").await.unwrap();
    assert_eq!(all_paths.len(), 3, "empty prefix should return all paths");
}
