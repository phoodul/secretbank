/**
 * TypeScript mirrors of Rust security check types (Phase 2-2B).
 *
 * Matches:
 *   src-tauri/crates/api-vault-app/src/commands/security_check.rs
 */

// ---------------------------------------------------------------------------
// Alert kind — mirrors Rust alert_kind strings
// ---------------------------------------------------------------------------

export type AlertKind =
  | "compromised_password"
  | "weak_password"
  | "reused_password"
  | "missing_two_factor"
  | "unsecured_website";

// ---------------------------------------------------------------------------
// SecurityAlertView — mirrors Rust SecurityAlertView DTO
// ---------------------------------------------------------------------------

export interface SecurityAlertView {
  id: string;
  credential_id: string;
  alert_kind: AlertKind;
  /** Parsed JSON metadata (exposure_count / score / also_used_by / domain / url) */
  alert_meta: Record<string, unknown>;
  dismissed_at: string | null;
  checked_at: string;
}

// ---------------------------------------------------------------------------
// SecurityCheckSummary — mirrors Rust SecurityCheckSummary
// ---------------------------------------------------------------------------

export interface SecurityCheckSummary {
  total_credentials_checked: number;
  alerts_count_by_kind: Record<string, number>;
  hibp_called: boolean;
  hibp_failed: boolean;
  completed_at: string;
}

// ---------------------------------------------------------------------------
// ListFilter — mirrors Rust ListFilter (tag = "kind")
// ---------------------------------------------------------------------------

export type ListFilter =
  | { kind: "all" }
  | { kind: "by_kind"; alert_kind: string }
  | { kind: "by_credential"; credential_id: string };

// ---------------------------------------------------------------------------
// SecurityCheckError — mirrors Rust SecurityCheckCommandError
// ---------------------------------------------------------------------------

export interface SecurityCheckError {
  code: "vault_locked" | "internal";
}

// ---------------------------------------------------------------------------
// Priority order (highest = 0)
// ---------------------------------------------------------------------------

export const ALERT_KIND_PRIORITY: Record<AlertKind, number> = {
  compromised_password: 0,
  weak_password: 1,
  reused_password: 2,
  missing_two_factor: 3,
  unsecured_website: 4,
};
