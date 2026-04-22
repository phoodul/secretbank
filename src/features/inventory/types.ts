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
}

/** credential_list 커맨드에 전달하는 필터 */
export interface CredentialFilter {
  issuer_id?: string;
  env?: Env;
  status?: CredentialStatus;
  expiring_within_days?: number;
}
