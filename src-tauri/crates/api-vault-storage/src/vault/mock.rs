//! In-memory mock implementation of [`VaultStorage`] for unit and integration
//! testing. Secrets are stored as plain `Vec<u8>` in a `HashMap` — no actual
//! cryptography is performed.
//!
//! This module is compiled only when the `mock` feature or `#[cfg(test)]` is
//! active so it never ends up in production builds.

use std::collections::HashMap;

use async_trait::async_trait;
use secrecy::{ExposeSecret, SecretString};

use super::{SecretBytes, VaultError, VaultStorage};

/// In-memory vault for testing. Thread-safe via field-level ownership (no
/// shared references across async tasks). Wrap in `Arc<Mutex<…>>` when you
/// need to share across tasks.
pub struct MockVaultStorage {
    correct_password: String,
    unlocked: bool,
    secrets: HashMap<String, Vec<u8>>,
}

impl MockVaultStorage {
    /// Create a new `MockVaultStorage` that accepts only `correct_password`
    /// on [`VaultStorage::unlock`].
    pub fn new(correct_password: impl Into<String>) -> Self {
        Self {
            correct_password: correct_password.into(),
            unlocked: false,
            secrets: HashMap::new(),
        }
    }
}

#[async_trait]
impl VaultStorage for MockVaultStorage {
    async fn unlock(&mut self, password: SecretString) -> Result<(), VaultError> {
        // Constant-time comparison using subtle::ConstantTimeEq would be ideal
        // for production. For a mock, we still adopt the same habit to build
        // correct muscle memory — compare byte-by-byte via a XOR fold so that
        // timing does not leak the matching prefix length.
        let provided = password.expose_secret().as_bytes();
        let expected = self.correct_password.as_bytes();

        let match_result: u8 = if provided.len() != expected.len() {
            1 // lengths differ — fail without short-circuiting inner loop
        } else {
            provided
                .iter()
                .zip(expected.iter())
                .fold(0u8, |acc, (a, b)| acc | (a ^ b))
        };

        if match_result == 0 {
            self.unlocked = true;
            Ok(())
        } else {
            Err(VaultError::WrongPassword)
        }
    }

    async fn is_unlocked(&self) -> bool {
        self.unlocked
    }

    async fn lock(&mut self) -> Result<(), VaultError> {
        self.unlocked = false;
        // TODO: zeroize individual secret values stored in `self.secrets`
        // when a `SecretBytes`-aware storage type replaces the plain Vec<u8>
        // fields here.
        Ok(())
    }

    async fn put_secret(&mut self, path: &str, value: SecretBytes) -> Result<(), VaultError> {
        if !self.unlocked {
            return Err(VaultError::NotUnlocked);
        }
        self.secrets
            .insert(path.to_owned(), value.expose_secret().clone());
        Ok(())
    }

    async fn get_secret(&self, path: &str) -> Result<SecretBytes, VaultError> {
        if !self.unlocked {
            return Err(VaultError::NotUnlocked);
        }
        self.secrets
            .get(path)
            .map(|v| SecretBytes::new(v.clone()))
            .ok_or_else(|| VaultError::NotFound {
                path: path.to_owned(),
            })
    }

    async fn delete_secret(&mut self, path: &str) -> Result<(), VaultError> {
        if !self.unlocked {
            return Err(VaultError::NotUnlocked);
        }
        if self.secrets.remove(path).is_none() {
            return Err(VaultError::NotFound {
                path: path.to_owned(),
            });
        }
        Ok(())
    }

    async fn list_secrets(&self, prefix: &str) -> Result<Vec<String>, VaultError> {
        if !self.unlocked {
            return Err(VaultError::NotUnlocked);
        }
        let mut paths: Vec<String> = self
            .secrets
            .keys()
            .filter(|p| p.starts_with(prefix))
            .cloned()
            .collect();
        paths.sort();
        Ok(paths)
    }
}
