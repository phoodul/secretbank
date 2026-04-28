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

import type {
  CredentialFull,
  CredentialStatus,
  Env,
} from "../inventory/types";

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
      usages: [], // separate mapper (Phase D-2)
      score: { total: 0, level: "safe", factors: [] }, // recomputed locally
    };
  },
};
