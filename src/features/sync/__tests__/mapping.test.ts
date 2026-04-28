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
import type { Issuer } from "../../inventory/use-issuers";
import type { Deployment, Project } from "../../projects/types";
import {
  credentialMapper,
  deploymentMapper,
  ENTITY_MAPPERS,
  isSyncableSettingKey,
  issuerMapper,
  projectMapper,
  settingMapper,
  SYNC_ENTITIES,
  SYNC_SETTING_KEYS,
  usageMapper,
} from "../mapping";
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

// ---------------------------------------------------------------------------
// Phase D-2a — 5 추가 엔티티 매퍼
// ---------------------------------------------------------------------------

describe("issuerMapper (Phase D-2a)", () => {
  function fx(): Issuer {
    return {
      id: "iss_01",
      slug: "openai",
      display_name: "OpenAI",
      docs_url: "https://platform.openai.com/docs",
      issue_url: "https://platform.openai.com/api-keys",
      status_url: "https://status.openai.com",
      security_feed_url: null,
      connector_id: null,
      icon_key: "openai",
      created_at: 1_700_000_000_000,
      updated_at: 1_710_000_000_000,
    };
  }

  it("toYMap → fromYMap round-trips all fields (no device-local fields)", () => {
    const original = fx();
    const restored = issuerMapper.fromYMap(issuerMapper.toYMap(original), original.id);
    expect(restored).toEqual(original);
  });

  it("entity name matches the whitelist key", () => {
    expect(issuerMapper.entity).toBe("issuer");
  });
});

describe("projectMapper (Phase D-2a)", () => {
  function fx(): Project {
    return {
      id: "prj_01",
      name: "Acme web",
      repo_url: "https://github.com/acme/web",
      framework: "next",
      runtime: "node",
      local_path: "/Users/alice/code/acme-web",
      created_at: 1_700_000_000_000,
      updated_at: 1_710_000_000_000,
    };
  }

  it("toYMap omits local_path (device-local)", () => {
    const ymap = projectMapper.toYMap(fx());
    expect(ymap).not.toHaveProperty("local_path");
  });

  it("fromYMap defaults local_path to null (caller supplies from local SQLite)", () => {
    const ymap = projectMapper.toYMap(fx());
    const restored = projectMapper.fromYMap(ymap, "prj_01");
    expect(restored.local_path).toBeNull();
  });

  it("round-trips sync-relevant fields", () => {
    const original = fx();
    const restored = projectMapper.fromYMap(projectMapper.toYMap(original), original.id);
    expect(restored).toEqual({ ...original, local_path: null });
  });
});

describe("deploymentMapper (Phase D-2a)", () => {
  function fx(): Deployment {
    return {
      id: "dep_01",
      project_id: "prj_01",
      url: "https://app.acme.com",
      platform: "vercel",
      env: "prod",
      created_at: 1_700_000_000_000,
    };
  }

  it("round-trips all fields", () => {
    const original = fx();
    const restored = deploymentMapper.fromYMap(deploymentMapper.toYMap(original), original.id);
    expect(restored).toEqual(original);
  });
});

describe("usageMapper (Phase D-2a)", () => {
  it("round-trips all fields", () => {
    const original = {
      id: "usg_01",
      credential_id: "crd_01",
      project_id: "prj_01",
      deployment_id: "dep_01",
      where_kind: "env_var" as const,
      where_value: "OPENAI_API_KEY",
      verified_at: 1_700_000_000_000,
      verified_by: "scan" as const,
    };
    const restored = usageMapper.fromYMap(usageMapper.toYMap(original), original.id);
    expect(restored).toEqual(original);
  });
});

describe("settingMapper + SYNC_SETTING_KEYS (Phase D-2a)", () => {
  it("isSyncableSettingKey is true for whitelisted keys, false otherwise", () => {
    expect(isSyncableSettingKey("apivault.settings.security.auto_lock_minutes")).toBe(true);
    expect(isSyncableSettingKey("apivault.settings.integrations.nvd_api_key")).toBe(true);
    expect(isSyncableSettingKey("apivault.settings.ui.theme")).toBe(false);
    expect(isSyncableSettingKey("apivault.settings.ui.language")).toBe(false);
    expect(isSyncableSettingKey("")).toBe(false);
  });

  it("toYMap → fromYMap round-trips key-value pair", () => {
    const original = {
      key: "apivault.settings.security.auto_lock_minutes",
      value: "15",
    };
    const restored = settingMapper.fromYMap(settingMapper.toYMap(original), original.key);
    expect(restored).toEqual(original);
  });

  it("entity is 'settings' (matches the whitelist)", () => {
    expect(settingMapper.entity).toBe("settings");
    expect(SYNC_ENTITIES).toContain(settingMapper.entity);
  });

  it("SYNC_SETTING_KEYS contains policy-required entries", () => {
    expect(SYNC_SETTING_KEYS.size).toBeGreaterThanOrEqual(2);
    expect(SYNC_SETTING_KEYS.has("apivault.settings.security.auto_lock_minutes")).toBe(true);
  });
});

describe("ENTITY_MAPPERS registry (Phase D-2a)", () => {
  it("covers every entity in the SYNC_ENTITIES whitelist", () => {
    for (const entity of SYNC_ENTITIES) {
      expect(ENTITY_MAPPERS).toHaveProperty(entity);
      expect(ENTITY_MAPPERS[entity].entity).toBe(entity);
    }
  });

  it("has exactly 6 entries (no leakage of unrelated keys)", () => {
    expect(Object.keys(ENTITY_MAPPERS).sort()).toEqual(
      [...SYNC_ENTITIES].sort(),
    );
  });
});
