//! Tauri commands for managing GitHub App installations and scanning repos for
//! Secret Scanning alerts.
//!
//! Installation metadata is persisted inside the age vault under the key
//! `"settings/github_installations"` as JSON.
//!
//! Relay integration (token issuance) is stubbed in this task. The `Auth` token
//! used for GitHub API calls is a placeholder `"stub"` until the Cloudflare Workers
//! relay is deployed (T061).

use secretbank_connectors::{github::GithubConnector, Auth, RemoteKey, RepoRef};
use secretbank_storage::vault::{ExposeSecret, SecretBytes, VaultError};
use serde::{Deserialize, Serialize};
use tauri::State;
use thiserror::Error;
use time::OffsetDateTime;

use crate::context::AppContext;
use crate::entitlement::EntitlementError;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

pub const GITHUB_APP_INSTALL_URL: &str = "https://github.com/apps/secretbank/installations/new";

const VAULT_KEY: &str = "settings/github_installations";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/// Installation metadata stored inside the vault.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GithubInstallationStored {
    pub installation_id: u64,
    /// Unix timestamp in milliseconds.
    pub installed_at: i64,
    pub repos: Vec<RepoRef>,
}

/// Installation entry returned to the frontend.
#[derive(Debug, Serialize)]
pub struct GithubInstallation {
    pub installation_id: u64,
    /// Unix timestamp in milliseconds.
    pub installed_at: i64,
    pub repos: Vec<RepoRef>,
}

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

#[derive(Debug, Error, Serialize)]
#[serde(tag = "code", rename_all = "snake_case")]
pub enum GithubCommandError {
    #[error("vault locked — unlock to manage installations")]
    VaultLocked,
    #[error("relay error: {message}")]
    Relay { message: String },
    #[error("connector error: {message}")]
    Connector { message: String },
    #[error("internal: {message}")]
    Internal { message: String },
    #[error("pro feature — upgrade to Pro to use GitHub Secret Scanning")]
    NotPro,
}

impl From<EntitlementError> for GithubCommandError {
    fn from(e: EntitlementError) -> Self {
        match e {
            EntitlementError::VaultLocked => Self::VaultLocked,
            EntitlementError::NotPro => Self::NotPro,
            other => Self::Internal {
                message: other.to_string(),
            },
        }
    }
}

impl From<VaultError> for GithubCommandError {
    fn from(e: VaultError) -> Self {
        match e {
            VaultError::NotUnlocked => Self::VaultLocked,
            other => Self::Internal {
                message: other.to_string(),
            },
        }
    }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/// Read the stored installation list from the vault.
/// Returns an empty vec if the key does not exist yet.
async fn read_installations(
    ctx: &AppContext,
) -> Result<Vec<GithubInstallationStored>, GithubCommandError> {
    let vault = ctx.vault.read().await;
    match vault.get_secret(VAULT_KEY).await {
        Ok(bytes) => {
            let json = String::from_utf8(bytes.expose_secret().clone()).map_err(|e| {
                GithubCommandError::Internal {
                    message: format!("UTF-8 decode: {e}"),
                }
            })?;
            serde_json::from_str(&json).map_err(|e| GithubCommandError::Internal {
                message: format!("JSON decode: {e}"),
            })
        }
        Err(VaultError::NotFound { .. }) => Ok(Vec::new()),
        Err(VaultError::NotUnlocked) => Err(GithubCommandError::VaultLocked),
        Err(e) => Err(GithubCommandError::Internal {
            message: e.to_string(),
        }),
    }
}

/// Overwrite the stored installation list in the vault and flush.
async fn write_installations(
    ctx: &AppContext,
    list: &[GithubInstallationStored],
) -> Result<(), GithubCommandError> {
    let json = serde_json::to_string(list).map_err(|e| GithubCommandError::Internal {
        message: format!("JSON encode: {e}"),
    })?;
    let mut vault = ctx.vault.write().await;
    vault
        .put_secret(VAULT_KEY, SecretBytes::new(json.into_bytes()))
        .await?;
    vault.flush().await?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

/// GitHub App installation ページ URL を返す (外部ブラウザで開く用).
#[tauri::command]
pub fn github_install_url() -> String {
    GITHUB_APP_INSTALL_URL.into()
}

/// Save (or update) a GitHub App installation.
///
/// If an entry with the same `installation_id` already exists it is updated
/// (the `installed_at` field is refreshed to now). Otherwise a new entry is
/// appended.
#[tauri::command]
pub async fn github_save_installation(
    installation_id: u64,
    state: State<'_, AppContext>,
) -> Result<(), GithubCommandError> {
    let mut list = read_installations(&state).await?;

    let now_ms = OffsetDateTime::now_utc().unix_timestamp() * 1000;

    if let Some(existing) = list
        .iter_mut()
        .find(|e| e.installation_id == installation_id)
    {
        existing.installed_at = now_ms;
    } else {
        list.push(GithubInstallationStored {
            installation_id,
            installed_at: now_ms,
            repos: Vec::new(),
        });
    }

    write_installations(&state, &list).await?;

    state
        .audit
        .record(
            secretbank_audit::AuditActor::LocalUser,
            "github.installation_save",
            "github_installation",
            installation_id.to_string(),
            None,
        )
        .await;

    Ok(())
}

/// List all saved GitHub App installations.
#[tauri::command]
pub async fn github_list_installations(
    state: State<'_, AppContext>,
) -> Result<Vec<GithubInstallation>, GithubCommandError> {
    // Check vault is unlocked first.
    {
        let vault = state.vault.read().await;
        // A lightweight check: try to access any secret to surface NotUnlocked.
        // We use the known key so we can also handle the "no entry yet" case.
        match vault.get_secret(VAULT_KEY).await {
            Ok(_) | Err(VaultError::NotFound { .. }) => {}
            Err(VaultError::NotUnlocked) => return Err(GithubCommandError::VaultLocked),
            Err(e) => {
                return Err(GithubCommandError::Internal {
                    message: e.to_string(),
                })
            }
        }
    }

    let list = read_installations(&state).await?;
    Ok(list
        .into_iter()
        .map(|s| GithubInstallation {
            installation_id: s.installation_id,
            installed_at: s.installed_at,
            repos: s.repos,
        })
        .collect())
}

/// Remove a GitHub App installation.
#[tauri::command]
pub async fn github_remove_installation(
    installation_id: u64,
    state: State<'_, AppContext>,
) -> Result<(), GithubCommandError> {
    let mut list = read_installations(&state).await?;
    list.retain(|e| e.installation_id != installation_id);
    write_installations(&state, &list).await?;

    state
        .audit
        .record(
            secretbank_audit::AuditActor::LocalUser,
            "github.installation_remove",
            "github_installation",
            installation_id.to_string(),
            None,
        )
        .await;

    Ok(())
}

/// Scan a single repo for Secret Scanning alerts.
///
/// Uses a stub token (`"stub"`) until the Cloudflare Workers relay (T061) is
/// deployed and real installation tokens can be obtained.
#[derive(Debug, Deserialize)]
pub struct ScanInput {
    pub installation_id: u64,
    pub owner: String,
    pub repo: String,
}

#[tauri::command]
pub async fn github_scan_repo(
    input: ScanInput,
    state: State<'_, AppContext>,
) -> Result<Vec<RemoteKey>, GithubCommandError> {
    // Pro gate: Secret Scanning is a Pro-only feature.
    crate::entitlement::require_pro(&state)
        .await
        .map_err(GithubCommandError::from)?;

    // Verify the installation exists.
    let list = read_installations(&state).await?;
    if !list
        .iter()
        .any(|e| e.installation_id == input.installation_id)
    {
        return Err(GithubCommandError::Internal {
            message: format!("installation {} not found", input.installation_id),
        });
    }

    // Stub auth until relay is deployed (T061).
    let auth = Auth::GithubInstallation {
        installation_id: input.installation_id,
        token: "stub".to_owned(),
    };

    let connector = GithubConnector::new(input.installation_id, "https://relay.secretbank.app");
    connector
        .list_secret_scanning_alerts_for_repo(&auth, &input.owner, &input.repo)
        .await
        .map_err(|e| GithubCommandError::Connector {
            message: e.to_string(),
        })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use secretbank_storage::vault::{mock::MockVaultStorage, VaultStorage as _};
    use secrecy::SecretString;

    use super::*;

    /// Vault 에 직접 installation list 를 읽고 쓰는 헬퍼 (command layer 우회).
    async fn raw_read(
        vault: &(dyn secretbank_storage::vault::VaultStorage + Send + Sync),
    ) -> Vec<GithubInstallationStored> {
        match vault.get_secret(VAULT_KEY).await {
            Ok(bytes) => {
                let json = String::from_utf8(bytes.expose_secret().clone()).unwrap();
                serde_json::from_str(&json).unwrap()
            }
            Err(VaultError::NotFound { .. }) => Vec::new(),
            Err(e) => panic!("raw_read error: {e}"),
        }
    }

    async fn raw_write(
        vault: &mut (dyn secretbank_storage::vault::VaultStorage + Send + Sync),
        list: &[GithubInstallationStored],
    ) {
        let json = serde_json::to_string(list).unwrap();
        vault
            .put_secret(VAULT_KEY, SecretBytes::new(json.into_bytes()))
            .await
            .unwrap();
        vault.flush().await.unwrap();
    }

    // -----------------------------------------------------------------------
    // 1. save → list 라운드트립
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn save_then_list_roundtrip() {
        let mut vault = MockVaultStorage::new("pw");
        vault
            .unlock(SecretString::from("pw".to_owned()))
            .await
            .unwrap();

        // 초기: 비어 있음
        let initial = raw_read(&vault).await;
        assert!(initial.is_empty());

        // 저장
        let now_ms = OffsetDateTime::now_utc().unix_timestamp() * 1000;
        let entry = GithubInstallationStored {
            installation_id: 42,
            installed_at: now_ms,
            repos: vec![RepoRef {
                owner: "acme".to_owned(),
                repo: "backend".to_owned(),
            }],
        };
        raw_write(&mut vault, &[entry]).await;

        // 읽기
        let list = raw_read(&vault).await;
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].installation_id, 42);
        assert_eq!(list[0].repos.len(), 1);
        assert_eq!(list[0].repos[0].owner, "acme");
    }

    // -----------------------------------------------------------------------
    // 2. 동일 installation_id 두 번 save → 1개만 유지 (갱신)
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn duplicate_save_upserts() {
        let mut vault = MockVaultStorage::new("pw");
        vault
            .unlock(SecretString::from("pw".to_owned()))
            .await
            .unwrap();

        let now_ms = OffsetDateTime::now_utc().unix_timestamp() * 1000;
        let first = GithubInstallationStored {
            installation_id: 99,
            installed_at: now_ms,
            repos: Vec::new(),
        };
        raw_write(&mut vault, &[first]).await;

        // 같은 ID 로 다시 저장 (installed_at 변경)
        let mut list = raw_read(&vault).await;
        let later_ms = now_ms + 60_000;
        if let Some(existing) = list.iter_mut().find(|e| e.installation_id == 99) {
            existing.installed_at = later_ms;
        }
        raw_write(&mut vault, &list).await;

        let final_list = raw_read(&vault).await;
        assert_eq!(final_list.len(), 1, "upsert should not duplicate");
        assert_eq!(final_list[0].installed_at, later_ms);
    }

    // -----------------------------------------------------------------------
    // 3. remove 후 list 빈 배열
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn remove_clears_entry() {
        let mut vault = MockVaultStorage::new("pw");
        vault
            .unlock(SecretString::from("pw".to_owned()))
            .await
            .unwrap();

        let now_ms = OffsetDateTime::now_utc().unix_timestamp() * 1000;
        let entry = GithubInstallationStored {
            installation_id: 7,
            installed_at: now_ms,
            repos: Vec::new(),
        };
        raw_write(&mut vault, &[entry]).await;

        // remove
        let mut list = raw_read(&vault).await;
        list.retain(|e| e.installation_id != 7);
        raw_write(&mut vault, &list).await;

        let final_list = raw_read(&vault).await;
        assert!(final_list.is_empty());
    }

    // -----------------------------------------------------------------------
    // 4. vault locked → VaultError::NotUnlocked 매핑
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn locked_vault_returns_vault_locked() {
        let vault = MockVaultStorage::new("pw");
        // unlock 없이 read 시도
        let result = vault.get_secret(VAULT_KEY).await;
        assert!(matches!(result, Err(VaultError::NotUnlocked)));

        // VaultError → GithubCommandError 변환
        let err: GithubCommandError = VaultError::NotUnlocked.into();
        assert!(matches!(err, GithubCommandError::VaultLocked));
    }
}
