//! Vault storage abstraction layer.
//!
//! This module defines the [`VaultStorage`] trait and supporting types that
//! decouple vault I/O from any specific encryption backend. Concrete
//! implementations (e.g. `AgeVaultStorage`) can be swapped without touching
//! call sites.
//!
//! ## Zero-Knowledge principle
//!
//! All plaintext secret material lives **only in memory** and only while the
//! vault is unlocked. Nothing plaintext is ever written to disk or sent over
//! the network; the storage layer deals exclusively in ciphertext.

use async_trait::async_trait;
use secrecy::{SecretBox, SecretString};

// Re-export for downstream crates.
pub use secrecy::ExposeSecret;

/// Opaque wrapper around a heap-allocated byte buffer that is **zeroed on
/// drop**. Use [`ExposeSecret`] to access the inner bytes.
///
/// The newtype prevents accidental `Debug`/`Display` leakage and makes the
/// "this is secret" intent explicit at the type level.
#[derive(Debug)]
pub struct SecretBytes(pub SecretBox<Vec<u8>>);

impl SecretBytes {
    /// Wrap a plaintext byte buffer in a `SecretBytes` that will be zeroed
    /// when dropped.
    pub fn new(bytes: Vec<u8>) -> Self {
        Self(SecretBox::new(Box::new(bytes)))
    }
}

impl ExposeSecret<Vec<u8>> for SecretBytes {
    fn expose_secret(&self) -> &Vec<u8> {
        self.0.expose_secret()
    }
}

/// Errors produced by [`VaultStorage`] implementations.
#[derive(Debug, thiserror::Error)]
pub enum VaultError {
    /// The supplied password did not match the vault's master credential.
    #[error("wrong password")]
    WrongPassword,

    /// An operation that requires an unlocked vault was attempted before
    /// calling [`VaultStorage::unlock`].
    #[error("vault is not unlocked")]
    NotUnlocked,

    /// The requested secret path does not exist in the vault.
    #[error("secret not found: {path}")]
    NotFound { path: String },

    /// A file-system or OS I/O error occurred.
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),

    /// An encryption or decryption operation failed. The inner message
    /// intentionally uses a generic string so that implementation details
    /// (algorithm, nonce, etc.) are not exposed to callers.
    #[error("crypto error: {0}")]
    Crypto(String),

    /// An internal serialization or deserialization step failed.
    #[error("serialization error: {0}")]
    Serialization(String),
}

/// Trait for reading and writing secrets to an encrypted vault.
///
/// Implementations must ensure that:
/// - Plaintext secret material never leaves memory (Zero-Knowledge principle).
/// - All returned [`SecretBytes`] values are zeroed when dropped.
/// - `&self` methods are safe to call concurrently (implementations should use
///   interior mutability, e.g. `Arc<RwLock<…>>`).
#[async_trait]
pub trait VaultStorage: Send + Sync {
    /// Unlock the vault using the supplied `password`.
    ///
    /// Derives (or verifies) the master key from `password`. On success the
    /// vault transitions to the *unlocked* state; subsequent `put_secret` /
    /// `get_secret` calls will succeed.
    ///
    /// Returns [`VaultError::WrongPassword`] if the password is incorrect.
    async fn unlock(&mut self, password: SecretString) -> Result<(), VaultError>;

    /// Return `true` if the vault is currently unlocked.
    ///
    /// This is a lightweight status check — no I/O is performed.
    async fn is_unlocked(&self) -> bool;

    /// Lock the vault, clearing any cached key material from memory.
    ///
    /// After calling `lock`, secret material derived during `unlock` must be
    /// zeroized. Subsequent `get_secret` / `put_secret` calls will return
    /// [`VaultError::NotUnlocked`] until `unlock` is called again.
    async fn lock(&mut self) -> Result<(), VaultError>;

    /// Store `value` at `path`, overwriting any existing entry.
    ///
    /// `path` is an opaque slash-separated identifier (e.g.
    /// `"openai/production/key"`). Returns [`VaultError::NotUnlocked`] if
    /// the vault has not been unlocked.
    async fn put_secret(&mut self, path: &str, value: SecretBytes) -> Result<(), VaultError>;

    /// Retrieve the secret stored at `path`.
    ///
    /// Returns [`VaultError::NotFound`] when `path` does not exist and
    /// [`VaultError::NotUnlocked`] if the vault is locked.
    async fn get_secret(&self, path: &str) -> Result<SecretBytes, VaultError>;

    /// Remove the secret at `path` from the vault.
    ///
    /// Returns [`VaultError::NotFound`] if `path` does not exist and
    /// [`VaultError::NotUnlocked`] if the vault is locked.
    async fn delete_secret(&mut self, path: &str) -> Result<(), VaultError>;

    /// List all secret paths whose names begin with `prefix`.
    ///
    /// The returned list is sorted lexicographically. Pass `""` to list all
    /// paths. Returns [`VaultError::NotUnlocked`] if the vault is locked.
    async fn list_secrets(&self, prefix: &str) -> Result<Vec<String>, VaultError>;

    /// Flush in-memory records to disk while keeping the vault unlocked.
    ///
    /// Re-encrypts the current in-memory records and atomically writes them to
    /// the vault file. Clears the `dirty` flag on success. Returns
    /// [`VaultError::NotUnlocked`] if the vault is locked.
    ///
    /// Unlike [`lock`], `flush` does **not** zeroize key material — the vault
    /// stays in the *unlocked* state after this call.
    async fn flush(&mut self) -> Result<(), VaultError>;
}

#[cfg(any(test, feature = "mock"))]
pub mod mock;
