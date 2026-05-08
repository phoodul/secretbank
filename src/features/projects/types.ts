/** project_* 커맨드가 다루는 Rust Project 타입 (secretbank_core::Project) */
export interface Project {
  id: string;
  name: string;
  repo_url: string | null;
  framework: string | null;
  runtime: string | null;
  local_path: string | null;
  /** ms timestamp */
  created_at: number;
  /** ms timestamp */
  updated_at: number;
}

/** project_create 커맨드가 받는 입력 (secretbank_core::ProjectInput) */
export interface ProjectInput {
  name: string;
  repo_url: string | null;
  framework: string | null;
  runtime: string | null;
  local_path: string | null;
}

/** project_update 커맨드가 받는 patch (secretbank_core::ProjectPatch).
 * 필드가 undefined 면 변경 없음, null 이면 빈 문자열 업데이트 — Rust 측은 Option<String> 이므로
 * JSON 에서 null 을 보내면 Some(null) 이 아닌 "필드 누락"으로 처리해야 한다. 따라서 patch 는
 * 서버에서 필드 생략 시 변경 없음으로 취급. name 을 제외한 필드는 "비우기" 가 필요할 때
 * 빈 문자열(`""`) 대신 null 을 전달하면 Rust Option::Some(String) 으로 빈값이 저장될 수 있다. */
export interface ProjectPatch {
  name?: string;
  repo_url?: string | null;
  framework?: string | null;
  runtime?: string | null;
  local_path?: string | null;
}

/** deployment_* 커맨드가 다루는 Rust Deployment 타입 (secretbank_core::Deployment) */
export type DeploymentPlatform = "vercel" | "railway" | "fly" | "netlify" | "other";

export interface Deployment {
  id: string;
  project_id: string;
  url: string;
  platform: DeploymentPlatform;
  env: "dev" | "staging" | "prod";
  /** ms timestamp */
  created_at: number;
}

/** deployment_create 입력 (secretbank_core::DeploymentInput) */
export interface DeploymentInput {
  project_id: string;
  url: string;
  platform: DeploymentPlatform;
  env: "dev" | "staging" | "prod";
}

/** deployment_update patch (secretbank_core::DeploymentPatch) — 모든 필드 optional */
export interface DeploymentPatch {
  url?: string;
  platform?: DeploymentPlatform;
  env?: "dev" | "staging" | "prod";
}

/** usage_list_for_project 반환 타입 */
export interface ProjectUsage {
  id: string;
  credential_id: string;
  project_id: string;
  deployment_id: string | null;
  where_kind: "env_var" | "file_path" | "code_ref";
  where_value: string;
  verified_at: number | null;
  verified_by: "scan" | "manual" | "runtime" | null;
}
