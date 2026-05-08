//! Tauri commands for reading and manipulating the subscription entitlement.
//!
//! In the current stub phase (pre-M10) entitlement is controlled by the vault
//! key `settings/pro_until` (Unix milliseconds).  The `entitlement_set_dev`
//! command lets testers simulate a Pro subscription without going through the
//! payments flow.  Both commands are always compiled — `entitlement_set_dev`
//! is labelled as a developer tool in the UI and will be hidden once M10
//! payments replace the stub mechanism.

use serde::Deserialize;
use tauri::State;

use secretbank_audit::AuditActor;
use secretbank_storage::vault::{SecretBytes, VaultError};

use crate::context::AppContext;
use crate::entitlement::{current_entitlement, Entitlement, EntitlementError, VAULT_KEY_PRO_UNTIL};

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

/// Return the current entitlement for the active user.
///
/// Returns `VaultLocked` when the vault has not been unlocked.
#[tauri::command]
pub async fn entitlement_current(
    state: State<'_, AppContext>,
) -> Result<Entitlement, EntitlementError> {
    current_entitlement(&state).await
}

/// Input for `entitlement_set_dev`.
#[derive(Debug, Deserialize)]
pub struct EntitlementSetInput {
    /// Unix milliseconds. `Some(ts)` → set Pro until `ts`. `None` → reset to Free.
    pub pro_until_unix_ms: Option<i64>,
}

/// Developer / testing command — set or clear the Pro entitlement stub.
///
/// - `pro_until_unix_ms = Some(ts)` → stores `ts` as a decimal string in the
///   vault under `settings/pro_until` and flushes immediately.
/// - `pro_until_unix_ms = None` → deletes the key and flushes.
///
/// An audit entry is written with action `entitlement.set_dev` and a payload
/// indicating whether a value was set.
///
/// This command is always compiled.  The UI should label it clearly as a
/// developer tool.  It will be superseded by the M10 payments flow.
#[tauri::command]
pub async fn entitlement_set_dev(
    input: EntitlementSetInput,
    state: State<'_, AppContext>,
) -> Result<(), EntitlementError> {
    {
        let mut vault = state.vault.write().await;

        match input.pro_until_unix_ms {
            Some(ts) => {
                let value = ts.to_string();
                // Max 64 bytes — a 13-digit ms timestamp is well within limit.
                vault
                    .put_secret(VAULT_KEY_PRO_UNTIL, SecretBytes::new(value.into_bytes()))
                    .await
                    .map_err(EntitlementError::from)?;
            }
            None => match vault.delete_secret(VAULT_KEY_PRO_UNTIL).await {
                Ok(()) | Err(VaultError::NotFound { .. }) => {}
                Err(e) => return Err(EntitlementError::from(e)),
            },
        }

        vault.flush().await.map_err(EntitlementError::from)?;
    }

    let has_value = input.pro_until_unix_ms.is_some();
    state
        .audit
        .record(
            AuditActor::LocalUser,
            "entitlement.set_dev",
            "entitlement",
            "pro_until",
            Some(serde_json::json!({ "has_value": has_value }).to_string()),
        )
        .await;

    Ok(())
}
