export type Env = "dev" | "staging" | "prod";
export type CredentialStatus = "active" | "revoked" | "compromised";

/** credential_list 커맨드가 반환하는 원소 */
export interface CredentialSummary {
  id: string;
  issuer_id: string;
  name: string;
  env: Env;
  status: CredentialStatus;
  /** ms timestamp (nullable) */
  expires_at: number | null;
  /** Last 4 characters of the secret. Used for duplicate detection. */
  hash_hint: string | null;
}

/** credential_list 커맨드에 전달하는 필터 */
export interface CredentialFilter {
  issuer_id?: string;
  env?: Env;
  status?: CredentialStatus;
  expiring_within_days?: number;
}

export type UsageWhereKind = "env_var" | "file_path" | "code_ref";
export type UsageVerifiedBy = "scan" | "manual" | "runtime";

/** credential_get 커맨드가 반환하는 Usage 원소 (Rust `api_vault_core::Usage`) */
export interface Usage {
  id: string;
  credential_id: string;
  project_id: string;
  deployment_id: string | null;
  where_kind: UsageWhereKind;
  /** e.g. "OPENAI_API_KEY" or "/apps/web/.env.local" */
  where_value: string;
  /** ms timestamp */
  verified_at: number | null;
  verified_by: UsageVerifiedBy | null;
}

/**
 * credential_get 커맨드가 반환하는 전체 뷰.
 * Rust 측: `#[serde(flatten)] credential: Credential` + `usages: Vec<Usage>`
 * → JSON은 Credential 필드들이 평면화된 구조.
 */
export interface CredentialFull {
  id: string;
  issuer_id: string;
  name: string;
  env: Env;
  scope: string | null;
  vault_ref: string;
  created_at: number;
  last_rotated_at: number | null;
  expires_at: number | null;
  owner: string | null;
  rotation_policy_days: number | null;
  rotation_runbook_id: string | null;
  status: CredentialStatus;
  hash_hint: string | null;
  usages: Usage[];
}
