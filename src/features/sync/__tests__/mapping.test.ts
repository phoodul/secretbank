/**
 * M9 Phase D-1 — mapping framework 회귀.
 *
 * Phase D-1 의 스코프는 framework 자체:
 *   - SyncEntity 화이트리스트가 project-decisions.md C 와 일치
 *   - origin marker 가 Yjs transaction.origin 으로 round-trip
 *   - credentialMapper 의 toYMap/fromYMap round-trip 이 sync-relevant 필드
 *     를 무손실 보존
 *   - device-local 필드 (vault_ref / hash_hint / usages / score) 는 매퍼에
 *     포함되지 않는다
 */
import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import type { CredentialFull } from "../../inventory/types";
import { credentialMapper, SYNC_ENTITIES } from "../mapping";
import { ORIGIN_LOCAL_DB, ORIGIN_REMOTE, isSyncOrigin, runWithOrigin } from "../origin";

function fixture(): CredentialFull {
  return {
    id: "crd_01HZZZ",
    issuer_id: "iss_openai",
    name: "Production API key",
    env: "prod",
    scope: "scope:read",
    vault_ref: "device-only-ref-99",
    created_at: 1_700_000_000_000,
    last_rotated_at: 1_710_000_000_000,
    expires_at: 1_800_000_000_000,
    owner: "alice@example.com",
    rotation_policy_days: 90,
    rotation_runbook_id: "rb_01",
    status: "active",
    hash_hint: "ab12",
    usages: [
      {
        id: "usg_1",
        credential_id: "crd_01HZZZ",
        project_id: "prj_a",
        deployment_id: null,
        where_kind: "env_var",
        where_value: "OPENAI_API_KEY",
        verified_at: null,
        verified_by: null,
      },
    ],
    score: { total: 80, level: "safe", factors: [] },
  };
}

describe("SYNC_ENTITIES whitelist (Phase D-1)", () => {
  it("matches the project-decisions.md [2026-04-28] C policy", () => {
    expect([...SYNC_ENTITIES]).toEqual([
      "credential",
      "issuer",
      "project",
      "deployment",
      "usage",
      "settings",
    ]);
  });
});

describe("origin markers (Phase D-1)", () => {
  it("Y.Doc.transact propagates the origin into observe handlers", () => {
    const doc = new Y.Doc();
    const map = doc.getMap<string>("credential");
    const observed: unknown[] = [];

    map.observe((_e, txn) => observed.push(txn.origin));

    runWithOrigin(doc, ORIGIN_LOCAL_DB, () => {
      map.set("crd_a", "blob");
    });

    expect(observed).toEqual([ORIGIN_LOCAL_DB]);
    doc.destroy();
  });

  it("isSyncOrigin discriminates framework origins from user origins", () => {
    expect(isSyncOrigin(ORIGIN_LOCAL_DB)).toBe(true);
    expect(isSyncOrigin(ORIGIN_REMOTE)).toBe(true);
    expect(isSyncOrigin(undefined)).toBe(false);
    expect(isSyncOrigin("user-edit")).toBe(false);
    expect(isSyncOrigin(Symbol("other"))).toBe(false);
  });
});

describe("credentialMapper (Phase D-1)", () => {
  it("toYMap omits device-local fields", () => {
    const ymap = credentialMapper.toYMap(fixture());
    // Sanity — sync-relevant fields are present.
    expect(ymap.issuer_id).toBe("iss_openai");
    expect(ymap.name).toBe("Production API key");
    expect(ymap.status).toBe("active");
    // Device-local fields must NOT appear.
    expect(ymap).not.toHaveProperty("vault_ref");
    expect(ymap).not.toHaveProperty("hash_hint");
    expect(ymap).not.toHaveProperty("usages");
    expect(ymap).not.toHaveProperty("score");
    expect(ymap).not.toHaveProperty("id");
  });

  it("toYMap → fromYMap round-trips sync-relevant fields", () => {
    const original = fixture();
    const ymap = credentialMapper.toYMap(original);
    const restored = credentialMapper.fromYMap(ymap, original.id);

    expect(restored.id).toBe(original.id);
    expect(restored.issuer_id).toBe(original.issuer_id);
    expect(restored.name).toBe(original.name);
    expect(restored.env).toBe(original.env);
    expect(restored.status).toBe(original.status);
    expect(restored.scope).toBe(original.scope);
    expect(restored.created_at).toBe(original.created_at);
    expect(restored.last_rotated_at).toBe(original.last_rotated_at);
    expect(restored.expires_at).toBe(original.expires_at);
    expect(restored.owner).toBe(original.owner);
    expect(restored.rotation_policy_days).toBe(original.rotation_policy_days);
    expect(restored.rotation_runbook_id).toBe(original.rotation_runbook_id);
  });

  it("fromYMap fills device-local fields with safe defaults", () => {
    const ymap = credentialMapper.toYMap(fixture());
    const restored = credentialMapper.fromYMap(ymap, "crd_X");
    // Caller must supply these from the local SQLite read path.
    expect(restored.vault_ref).toBe("");
    expect(restored.hash_hint).toBeNull();
    expect(restored.usages).toEqual([]);
    expect(restored.score.factors).toEqual([]);
  });

  it("entity name matches the whitelist key", () => {
    expect(credentialMapper.entity).toBe("credential");
    expect(SYNC_ENTITIES).toContain(credentialMapper.entity);
  });
});
