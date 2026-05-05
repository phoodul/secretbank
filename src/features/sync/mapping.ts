/**
 * EntityMapper — M9 Phase D framework (양방향 SQLite ↔ Y.Map 매퍼).
 *
 * project-decisions.md [2026-04-28] C 의 sync 화이트리스트 정책:
 *   credential / issuer / project / deployment / usage / settings.shared.*
 *
 * 각 엔티티는 `EntityMapper<TRow, TYValue>` 를 구현한다:
 *   - `entity` — 화이트리스트 ID, Y.Doc 의 root Y.Map key 와 일치
 *   - `toYMap(row)` — SQLite row → Y.Map value (device-local 필드 제외)
 *   - `fromYMap(value, id)` — Y.Map value → SQLite row (UI 가 쓸 형태)
 *
 * 단방향 변환만으로는 round-trip 무손실을 보장 못 하므로 invariant 회귀 가
 * `toYMap → fromYMap` 의 결과가 sync-relevant 필드를 동일하게 보존하는지
 * 검증한다 (device-local 필드는 round-trip 과정에서 소실되어도 OK — 호출자
 * 가 별도 path 로 보충).
 */

import type { Issuer } from "../inventory/use-issuers";
import type { CredentialFull, CredentialStatus, Env, Usage } from "../inventory/types";
import type { Deployment, DeploymentPlatform, Project } from "../projects/types";

// ---------------------------------------------------------------------------
// Whitelist of sync-eligible entities
// ---------------------------------------------------------------------------

export const SYNC_ENTITIES = [
  "credential",
  "issuer",
  "project",
  "deployment",
  "usage",
  "settings",
] as const;

export type SyncEntity = (typeof SYNC_ENTITIES)[number];

// ---------------------------------------------------------------------------
// EntityMapper interface
// ---------------------------------------------------------------------------

/**
 * 양방향 매퍼 — 모든 sync 대상 엔티티가 이 contract 를 만족한다.
 *
 * `TYValue` 는 Y.Map 의 value type — 평범한 plain object 여야 한다 (Y.Map
 * 은 deeply-observable 가 아니므로 nested CRDT 를 쓰면 sync 단위가 깨짐).
 */
export interface EntityMapper<TRow, TYValue extends Record<string, unknown>> {
  readonly entity: SyncEntity;
  toYMap(row: TRow): TYValue;
  fromYMap(value: TYValue, id: string): TRow;
}

// ---------------------------------------------------------------------------
// CredentialMapper — 첫 reference 구현
// ---------------------------------------------------------------------------

/**
 * Y.Map 에 저장되는 Credential metadata. project-decisions.md C 의
 * 화이트리스트:
 *   issuer_id, name, env, status, last_rotated_at, expires_at, scope,
 *   owner, rotation_policy_days, rotation_runbook_id, created_at
 *
 * **Device-local (Y.Map 에 안 들어감)**:
 *   - vault_ref — 디바이스별 age vault 의 entry 식별자 (디바이스마다 다름)
 *   - hash_hint — 디바이스 캐시
 *   - usages    — 별도 매퍼 (Phase D-2)
 *   - score     — 서버 무관, 디바이스 재계산
 */
export interface CredentialYValue extends Record<string, unknown> {
  issuer_id: string;
  name: string;
  env: Env;
  status: CredentialStatus;
  scope: string | null;
  created_at: number;
  last_rotated_at: number | null;
  expires_at: number | null;
  owner: string | null;
  rotation_policy_days: number | null;
  rotation_runbook_id: string | null;
}

export const credentialMapper: EntityMapper<CredentialFull, CredentialYValue> = {
  entity: "credential",
  toYMap(row) {
    return {
      issuer_id: row.issuer_id,
      name: row.name,
      env: row.env,
      status: row.status,
      scope: row.scope,
      created_at: row.created_at,
      last_rotated_at: row.last_rotated_at,
      expires_at: row.expires_at,
      owner: row.owner,
      rotation_policy_days: row.rotation_policy_days,
      rotation_runbook_id: row.rotation_runbook_id,
    };
  },
  fromYMap(value, id) {
    // Device-local fields default to safe empty values — caller is expected
    // to supply them from the local SQLite read path before persisting.
    return {
      id,
      issuer_id: value.issuer_id,
      name: value.name,
      env: value.env,
      scope: value.scope,
      vault_ref: "", // device-local, supplied by caller
      created_at: value.created_at,
      last_rotated_at: value.last_rotated_at,
      expires_at: value.expires_at,
      owner: value.owner,
      rotation_policy_days: value.rotation_policy_days,
      rotation_runbook_id: value.rotation_runbook_id,
      status: value.status,
      hash_hint: null, // device-local
      usages: [], // separate mapper (usageMapper)
      score: { total: 0, level: "safe", factors: [] }, // recomputed locally
      kind: "api_key", // device-local default; overwritten by caller from SQLite
      url: null, // device-local
      username: null, // device-local
    };
  },
};

// ---------------------------------------------------------------------------
// IssuerMapper — 모든 필드 sync (device-local 없음)
// ---------------------------------------------------------------------------

export interface IssuerYValue extends Record<string, unknown> {
  slug: string;
  display_name: string;
  docs_url: string | null;
  issue_url: string | null;
  status_url: string | null;
  security_feed_url: string | null;
  connector_id: string | null;
  icon_key: string | null;
  created_at: number;
  updated_at: number;
}

export const issuerMapper: EntityMapper<Issuer, IssuerYValue> = {
  entity: "issuer",
  toYMap(row) {
    return {
      slug: row.slug,
      display_name: row.display_name,
      docs_url: row.docs_url,
      issue_url: row.issue_url,
      status_url: row.status_url,
      security_feed_url: row.security_feed_url,
      connector_id: row.connector_id,
      icon_key: row.icon_key,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  },
  fromYMap(value, id) {
    return {
      id,
      slug: value.slug,
      display_name: value.display_name,
      docs_url: value.docs_url,
      issue_url: value.issue_url,
      status_url: value.status_url,
      security_feed_url: value.security_feed_url,
      connector_id: value.connector_id,
      icon_key: value.icon_key,
      created_at: value.created_at,
      updated_at: value.updated_at,
    };
  },
};

// ---------------------------------------------------------------------------
// ProjectMapper — local_path 는 device-local (디바이스마다 path 다름)
// ---------------------------------------------------------------------------

export interface ProjectYValue extends Record<string, unknown> {
  name: string;
  repo_url: string | null;
  framework: string | null;
  runtime: string | null;
  created_at: number;
  updated_at: number;
}

export const projectMapper: EntityMapper<Project, ProjectYValue> = {
  entity: "project",
  toYMap(row) {
    return {
      name: row.name,
      repo_url: row.repo_url,
      framework: row.framework,
      runtime: row.runtime,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  },
  fromYMap(value, id) {
    return {
      id,
      name: value.name,
      repo_url: value.repo_url,
      framework: value.framework,
      runtime: value.runtime,
      local_path: null, // device-local — 사용자가 디바이스별로 따로 지정
      created_at: value.created_at,
      updated_at: value.updated_at,
    };
  },
};

// ---------------------------------------------------------------------------
// DeploymentMapper — 모든 필드 sync
// ---------------------------------------------------------------------------

export interface DeploymentYValue extends Record<string, unknown> {
  project_id: string;
  url: string;
  platform: DeploymentPlatform;
  env: "dev" | "staging" | "prod";
  created_at: number;
}

export const deploymentMapper: EntityMapper<Deployment, DeploymentYValue> = {
  entity: "deployment",
  toYMap(row) {
    return {
      project_id: row.project_id,
      url: row.url,
      platform: row.platform,
      env: row.env,
      created_at: row.created_at,
    };
  },
  fromYMap(value, id) {
    return {
      id,
      project_id: value.project_id,
      url: value.url,
      platform: value.platform,
      env: value.env,
      created_at: value.created_at,
    };
  },
};

// ---------------------------------------------------------------------------
// UsageMapper — Credential ↔ Project 관계, 모든 필드 sync
// ---------------------------------------------------------------------------

export interface UsageYValue extends Record<string, unknown> {
  credential_id: string;
  project_id: string;
  deployment_id: string | null;
  where_kind: "env_var" | "file_path" | "code_ref";
  where_value: string;
  verified_at: number | null;
  verified_by: "scan" | "manual" | "runtime" | null;
}

export const usageMapper: EntityMapper<Usage, UsageYValue> = {
  entity: "usage",
  toYMap(row) {
    return {
      credential_id: row.credential_id,
      project_id: row.project_id,
      deployment_id: row.deployment_id,
      where_kind: row.where_kind,
      where_value: row.where_value,
      verified_at: row.verified_at,
      verified_by: row.verified_by,
    };
  },
  fromYMap(value, id) {
    return {
      id,
      credential_id: value.credential_id,
      project_id: value.project_id,
      deployment_id: value.deployment_id,
      where_kind: value.where_kind,
      where_value: value.where_value,
      verified_at: value.verified_at,
      verified_by: value.verified_by,
    };
  },
};

// ---------------------------------------------------------------------------
// SettingMapper — 키-값 스토어 (project-decisions C 의 화이트리스트 정책)
// ---------------------------------------------------------------------------

/**
 * Sync 대상 setting key 의 명시 화이트리스트.
 *
 * 새 setting 을 추가할 때 sync 여부를 **명시적으로 opt-in** 해야 한다.
 * 누락된 setting 은 device-local 로 취급 (안전 기본값).
 *
 * 정책 (project-decisions.md [2026-04-28] C):
 *   - vault-level shared settings (auto-lock 시간, NVD API key 등) → sync
 *   - 디바이스별 UX preference (테마, language, sidebar 너비 등) → device-local
 */
export const SYNC_SETTING_KEYS: ReadonlySet<string> = new Set([
  "apivault.settings.security.auto_lock_minutes",
  "apivault.settings.integrations.nvd_api_key",
]);

export interface SettingRow {
  /** Setting key — 화이트리스트 검증 대상. */
  key: string;
  /** Stringified value (settings_get/set 와 동일 wire shape). */
  value: string;
}

export interface SettingYValue extends Record<string, unknown> {
  value: string;
}

export const settingMapper: EntityMapper<SettingRow, SettingYValue> = {
  entity: "settings",
  toYMap(row) {
    return { value: row.value };
  },
  fromYMap(value, id) {
    return { key: id, value: value.value };
  },
};

/**
 * 단순 헬퍼 — observe handler 가 들어오는 setting 변경이 sync 화이트리스트
 * 에 포함되는지 빠르게 검증할 때 사용.
 */
export function isSyncableSettingKey(key: string): boolean {
  return SYNC_SETTING_KEYS.has(key);
}

// ---------------------------------------------------------------------------
// Mapper registry — entity name → mapper (Phase D-2b 의 dispatch 용)
// ---------------------------------------------------------------------------

export const ENTITY_MAPPERS = {
  credential: credentialMapper,
  issuer: issuerMapper,
  project: projectMapper,
  deployment: deploymentMapper,
  usage: usageMapper,
  settings: settingMapper,
} as const satisfies Record<SyncEntity, EntityMapper<unknown, Record<string, unknown>>>;
