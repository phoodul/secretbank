/**
 * Kill Switch — shared TypeScript types (T076)
 *
 * Mirrors the Rust command signatures in src-tauri/src/commands/kill_switch.rs.
 */

export interface KillSwitchRevokeInput {
  credId: string;
  token: string;
  alsoDeleteValue: boolean;
}
