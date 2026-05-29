export type Env = "dev" | "staging" | "prod";
export type CredentialStatus = "active" | "revoked" | "compromised";
/** Rust CredentialKind (serde rename_all = "snake_case") */
export type CredentialKind = "api_key" | "password" | "credit_card" | "other";

// ---------------------------------------------------------------------------
// Security score (T040) — mirrors secretbank_core::security_score
// ---------------------------------------------------------------------------

export type ScoreLevel = "safe" | "warn" | "danger";
export type FactorSeverity = "info" | "warn" | "danger";
export type FactorCode =
  | "expired"
  | "expiring_soon"
  | "rotation_overdue"
  | "no_rotation_history"
  | "no_scope"
  | "revoked"
  | "compromised";

export interface ScoreFactor {
  code: FactorCode;
  severity: FactorSeverity;
  penalty: number;
  days: number | null;
}

export interface ScoreBreakdown {
  total: number;
  level: ScoreLevel;
  factors: ScoreFactor[];
}

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
  /** Server-computed security score (T040). */
  score: ScoreBreakdown;
  /** API key (default) or general password (M24). Rust default = "api_key". */
  kind: CredentialKind;
  /** Password-only — origin URL for autofill matching. null for API keys. */
  url: string | null;
  /** Password-only — login identifier. null for API keys. */
  username: string | null;
  /** `true` when secondary_value_ref is set. Indicates a pair-secret credential. */
  has_secondary: boolean;
  /** Display label for the primary value. null = type-based fallback. */
  primary_label: string | null;
  /** Display label for the secondary value. null when no secondary exists. */
  secondary_label: string | null;
  /** kind="other" 일 때 사용자 정의 종류명 (예: "Token", "SSH key"). 그 외 null. */
  custom_kind_label?: string | null;
  // credit_card 전용 — kind="credit_card" 일 때만 non-null (B.5-3)
  card_brand?: import("@/lib/card-utils").CardBrand;
  /** 마지막 4자리만 저장 (B.5-3: 전체 카드번호 금지) */
  card_last_4?: string;
  card_expiry_month?: number;
  card_expiry_year?: number;
  card_cardholder_name?: string;
}

/** credential_list 커맨드에 전달하는 필터 */
export interface CredentialFilter {
  issuer_id?: string;
  env?: Env;
  status?: CredentialStatus;
  expiring_within_days?: number;
  /** Filter by kind. undefined = all kinds. */
  kind?: CredentialKind;
}

export type UsageWhereKind = "env_var" | "file_path" | "code_ref";
export type UsageVerifiedBy = "scan" | "manual" | "runtime";

/** credential_get 커맨드가 반환하는 Usage 원소 (Rust `secretbank_core::Usage`) */
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
  /** Server-computed security score (T040). */
  score: ScoreBreakdown;
  /** API key (default) or general password (M24). Rust default = "api_key". */
  kind: CredentialKind;
  /** Password-only — origin URL for autofill matching. null for API keys. */
  url: string | null;
  /** Password-only — login identifier. null for API keys. */
  username: string | null;
  /** Vault entry reference for the secondary secret. null = single-secret. */
  secondary_value_ref: string | null;
  /** Display label for the primary value. null = type-based fallback. */
  primary_label: string | null;
  /** Display label for the secondary value. null when no secondary exists. */
  secondary_label: string | null;
  /** kind="other" 일 때 사용자 정의 종류명. 그 외 null. */
  custom_kind_label?: string | null;
}
