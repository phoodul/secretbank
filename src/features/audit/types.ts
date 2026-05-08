/**
 * TypeScript mirrors of Rust audit DTOs (T073).
 *
 * Matches:
 *   secretbank-app/src/commands/audit.rs — AuditEntry, AuditListInput,
 *   PerDeviceVerification, ChainVerifyReport
 */

export type AuditActor = "local-user" | "system" | "connector";

/** Mirrors Rust `AuditEntry`. Binary fields are hex-encoded; timestamps are Unix ms. */
export interface AuditEntry {
  id: string;
  seq: number;
  device_id: string | null;
  /** "local-user" | "system" | "connector" */
  actor: AuditActor;
  /** e.g. "credential.create" */
  action: string;
  /** e.g. "credential" */
  subject_kind: string;
  subject_id: string;
  payload_json: string | null;
  /** Unix timestamp in milliseconds (UTC) */
  created_at_ms: number;
  /** SHA-256 of the previous entry (64 hex chars) */
  prev_hash_hex: string;
  /** SHA-256 of this entry (64 hex chars) */
  entry_hash_hex: string;
  /** ed25519 signature (128 hex chars) */
  signature_hex: string;
}

/** Mirrors Rust `AuditListInput`. All fields optional. */
export interface AuditListInput {
  subject_kind?: string;
  subject_id?: string;
  action_prefix?: string;
  device_id?: string;
  limit?: number;
  offset?: number;
}

/** Mirrors Rust `PerDeviceVerification`. */
export interface PerDeviceVerification {
  /** "__system__:<entry_id>" for orphan system entries */
  device_id: string;
  valid_count: number;
  first_invalid_seq: number | null;
}

/** Mirrors Rust `ChainVerifyReport`. */
export interface ChainVerifyReport {
  devices: PerDeviceVerification[];
  total_entries: number;
  all_valid: boolean;
}

// Re-export from shared util — consumers can import from either location.
export type { ActionFamily } from "./action-family";
export { actionFamily } from "./action-family";
