/**
 * /sync/* — Phase E-3 Miniflare 회귀.
 *
 * 검증 매트릭스:
 *   - Auth: Bearer 부재 → 401, 잘못된 token → 401
 *   - Validation: since 음수 → 400, missing ciphertext → 400, 1MB 초과 → 413
 *   - Happy path: POST → version 1, GET (since=0) → ciphertext 복원, GET
 *     (since=version) → 204, 두 번 push → version 2
 *   - Rate limit: 100 req/min/user, 101번째 → 429, 다른 user 는 격리
 */
import {
  applyD1Migrations,
  createExecutionContext,
  env,
  waitOnExecutionContext,
} from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import worker from "../src/index";
import type { Env } from "../src/env";
import { mintAccessToken } from "../src/lib/jwt";

const typedEnv = env as unknown as Env & {
  TEST_MIGRATIONS: unknown[];
  DB: D1Database;
  TOKEN_CACHE: KVNamespace;
};

beforeAll(async () => {
  await applyD1Migrations(typedEnv.DB, typedEnv.TEST_MIGRATIONS as never);
});

async function ensureUser(userId: string, email: string): Promise<void> {
  await typedEnv.DB.prepare(`INSERT OR IGNORE INTO user (id, email, created_at) VALUES (?, ?, ?)`)
    .bind(userId, email, Date.now())
    .run();
}

async function callSync(
  method: "GET" | "POST",
  path: string,
  opts: { token?: string; body?: unknown } = {},
): Promise<Response> {
  const ctx = createExecutionContext();
  const headers: Record<string, string> = {};
  if (opts.token) headers["Authorization"] = `Bearer ${opts.token}`;
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  const init: RequestInit = { method, headers };
  if (opts.body !== undefined) init.body = JSON.stringify(opts.body);
  const req = new Request(`http://localhost${path}`, init);
  const resp = await worker.fetch(req, typedEnv, ctx);
  await waitOnExecutionContext(ctx);
  return resp;
}

function makeCiphertextB64(byte: number, len: number): string {
  const arr = new Uint8Array(len).fill(byte);
  let bin = "";
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]!);
  return btoa(bin);
}

describe("/sync/snapshot — auth", () => {
  it("GET returns 401 when Authorization header is missing", async () => {
    const resp = await callSync("GET", "/sync/snapshot?since=0");
    expect(resp.status).toBe(401);
    const body = (await resp.json()) as { error: string };
    expect(body.error).toBe("missing_bearer_token");
  });

  it("POST returns 401 when token is malformed", async () => {
    const resp = await callSync("POST", "/sync/snapshot", {
      token: "not-a-valid-jwt",
      body: { ciphertext_b64: "AA==" },
    });
    expect(resp.status).toBe(401);
    const body = (await resp.json()) as { error: string };
    expect(body.error).toBe("invalid_access_token");
  });
});

describe("/sync/snapshot — validation", () => {
  it("GET rejects negative since with 400", async () => {
    const userId = "usr_sync_val_001";
    await ensureUser(userId, "val1@example.com");
    const token = await mintAccessToken(typedEnv, userId);
    const resp = await callSync("GET", "/sync/snapshot?since=-1", { token });
    expect(resp.status).toBe(400);
  });

  it("POST rejects missing ciphertext with 400", async () => {
    const userId = "usr_sync_val_002";
    await ensureUser(userId, "val2@example.com");
    const token = await mintAccessToken(typedEnv, userId);
    const resp = await callSync("POST", "/sync/snapshot", { token, body: {} });
    expect(resp.status).toBe(400);
    const body = (await resp.json()) as { error: string };
    expect(body.error).toBe("missing_ciphertext");
  });

  it("POST rejects payloads larger than 1MB with 413", async () => {
    const userId = "usr_sync_val_003";
    await ensureUser(userId, "val3@example.com");
    const token = await mintAccessToken(typedEnv, userId);
    const huge = makeCiphertextB64(0xab, 1024 * 1024 + 1);
    const resp = await callSync("POST", "/sync/snapshot", {
      token,
      body: { ciphertext_b64: huge },
    });
    expect(resp.status).toBe(413);
  });
});

describe("/sync/snapshot — happy path round-trip", () => {
  it("POST then GET returns the same ciphertext, then GET (since=version) is 204", async () => {
    const userId = "usr_sync_rt_001";
    await ensureUser(userId, "rt1@example.com");
    const token = await mintAccessToken(typedEnv, userId);

    const ct = makeCiphertextB64(0xcd, 256);

    const post1 = await callSync("POST", "/sync/snapshot", {
      token,
      body: { ciphertext_b64: ct },
    });
    expect(post1.status).toBe(200);
    const j1 = (await post1.json()) as { version: number };
    expect(j1.version).toBe(1);

    const get1 = await callSync("GET", "/sync/snapshot?since=0", { token });
    expect(get1.status).toBe(200);
    const j2 = (await get1.json()) as { version: number; ciphertext_b64: string };
    expect(j2.version).toBe(1);
    expect(j2.ciphertext_b64).toBe(ct);

    const get2 = await callSync("GET", `/sync/snapshot?since=${j2.version}`, { token });
    expect(get2.status).toBe(204);
  });

  it("two POSTs increment version monotonically", async () => {
    const userId = "usr_sync_rt_002";
    await ensureUser(userId, "rt2@example.com");
    const token = await mintAccessToken(typedEnv, userId);

    const a = await callSync("POST", "/sync/snapshot", {
      token,
      body: { ciphertext_b64: makeCiphertextB64(0x01, 16) },
    });
    const b = await callSync("POST", "/sync/snapshot", {
      token,
      body: { ciphertext_b64: makeCiphertextB64(0x02, 16) },
    });
    expect(((await a.json()) as { version: number }).version).toBe(1);
    expect(((await b.json()) as { version: number }).version).toBe(2);
  });

  it("GET on a fresh user returns version=0 with null ciphertext", async () => {
    const userId = "usr_sync_rt_003";
    await ensureUser(userId, "rt3@example.com");
    const token = await mintAccessToken(typedEnv, userId);

    const resp = await callSync("GET", "/sync/snapshot?since=0", { token });
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as { version: number; ciphertext_b64: string | null };
    expect(body.version).toBe(0);
    expect(body.ciphertext_b64).toBeNull();
  });
});

describe("/sync/values — Phase F-1 (per-credential LWW channel)", () => {
  it("POST 400 when credential_id is missing", async () => {
    const userId = "usr_val_001";
    await ensureUser(userId, "v1@example.com");
    const token = await mintAccessToken(typedEnv, userId);
    const resp = await callSync("POST", "/sync/values", {
      token,
      body: { ciphertext_b64: "AA==" },
    });
    expect(resp.status).toBe(400);
    const body = (await resp.json()) as { error: string };
    expect(body.error).toBe("missing_credential_id");
  });

  it("POST 400 when credential_id exceeds 64 chars", async () => {
    const userId = "usr_val_002";
    await ensureUser(userId, "v2@example.com");
    const token = await mintAccessToken(typedEnv, userId);
    const resp = await callSync("POST", "/sync/values", {
      token,
      body: { credential_id: "x".repeat(65), ciphertext_b64: "AA==" },
    });
    expect(resp.status).toBe(400);
    const body = (await resp.json()) as { error: string };
    expect(body.error).toBe("invalid_credential_id");
  });

  it("POST 413 for envelopes larger than 64KB", async () => {
    const userId = "usr_val_003";
    await ensureUser(userId, "v3@example.com");
    const token = await mintAccessToken(typedEnv, userId);
    const huge = makeCiphertextB64(0xab, 64 * 1024 + 1);
    const resp = await callSync("POST", "/sync/values", {
      token,
      body: { credential_id: "crd_huge", ciphertext_b64: huge },
    });
    expect(resp.status).toBe(413);
  });

  it("POST then GET round-trips a single credential value", async () => {
    const userId = "usr_val_rt_001";
    await ensureUser(userId, "vrt1@example.com");
    const token = await mintAccessToken(typedEnv, userId);

    const ct = makeCiphertextB64(0xdd, 32);
    const post = await callSync("POST", "/sync/values", {
      token,
      body: { credential_id: "crd_rt_1", ciphertext_b64: ct },
    });
    expect(post.status).toBe(200);
    const j1 = (await post.json()) as { version: number; updated_at: number };
    expect(j1.version).toBe(1);

    const get = await callSync("GET", "/sync/values?since=0", { token });
    expect(get.status).toBe(200);
    const j2 = (await get.json()) as {
      values: { credential_id: string; version: number; ciphertext_b64: string }[];
    };
    expect(j2.values).toHaveLength(1);
    expect(j2.values[0]!.credential_id).toBe("crd_rt_1");
    expect(j2.values[0]!.ciphertext_b64).toBe(ct);
    expect(j2.values[0]!.version).toBe(1);
  });

  it("two POSTs of same credential_id increment version, GET returns latest only", async () => {
    const userId = "usr_val_rt_002";
    await ensureUser(userId, "vrt2@example.com");
    const token = await mintAccessToken(typedEnv, userId);

    const a = await callSync("POST", "/sync/values", {
      token,
      body: { credential_id: "crd_x", ciphertext_b64: makeCiphertextB64(0x01, 16) },
    });
    const b = await callSync("POST", "/sync/values", {
      token,
      body: { credential_id: "crd_x", ciphertext_b64: makeCiphertextB64(0x02, 16) },
    });
    expect(((await a.json()) as { version: number }).version).toBe(1);
    expect(((await b.json()) as { version: number }).version).toBe(2);

    const get = await callSync("GET", "/sync/values?since=0", { token });
    const j = (await get.json()) as {
      values: { credential_id: string; version: number }[];
    };
    expect(j.values).toHaveLength(1);
    expect(j.values[0]!.version).toBe(2);
  });

  it("GET ?since=<recent ms> returns only credentials updated after that ms", async () => {
    const userId = "usr_val_since_001";
    await ensureUser(userId, "vsince@example.com");
    const token = await mintAccessToken(typedEnv, userId);

    // 첫 push
    await callSync("POST", "/sync/values", {
      token,
      body: { credential_id: "crd_old", ciphertext_b64: makeCiphertextB64(0xaa, 8) },
    });
    // since 검사 boundary 직전 — 1 ms 후의 timestamp 를 cutoff 로
    const cutoff = Date.now();
    // 약간의 시간 보장 — D1 prepare 가 같은 ms 안에 끝날 수 있으므로 sleep
    await new Promise((r) => setTimeout(r, 5));

    await callSync("POST", "/sync/values", {
      token,
      body: { credential_id: "crd_new", ciphertext_b64: makeCiphertextB64(0xbb, 8) },
    });

    const resp = await callSync("GET", `/sync/values?since=${cutoff}`, { token });
    const body = (await resp.json()) as { values: { credential_id: string }[] };
    const ids = body.values.map((v) => v.credential_id);
    expect(ids).toContain("crd_new");
    expect(ids).not.toContain("crd_old");
  });

  it("GET 401 when Bearer is missing (auth-protected like /sync/snapshot)", async () => {
    const resp = await callSync("GET", "/sync/values?since=0");
    expect(resp.status).toBe(401);
  });
});

describe("/sync/snapshot — rate limit", () => {
  beforeEach(async () => {
    // 각 테스트 시작 시 KV 의 ratelimit 카운터를 초기화 — 다른 테스트 누적 영향 방지.
    // (Miniflare 는 namespace 별 격리지만 windowId 겹침 가능)
    const list = await typedEnv.TOKEN_CACHE.list({ prefix: "ratelimit:sync:" });
    await Promise.all(list.keys.map((k) => typedEnv.TOKEN_CACHE.delete(k.name)));
  });

  it("429 after exceeding 100 req/min", async () => {
    const userId = "usr_sync_rl_001";
    await ensureUser(userId, "rl1@example.com");
    const token = await mintAccessToken(typedEnv, userId);

    // 100 GET 호출 — 모두 200 또는 204 (fresh user 라 200 with version=0).
    for (let i = 0; i < 100; i++) {
      const resp = await callSync("GET", "/sync/snapshot?since=0", { token });
      expect([200, 204]).toContain(resp.status);
    }

    // 101번째는 429.
    const limited = await callSync("GET", "/sync/snapshot?since=0", { token });
    expect(limited.status).toBe(429);
    const body = (await limited.json()) as { error: string };
    expect(body.error).toBe("rate_limited");
    expect(limited.headers.get("Retry-After")).toMatch(/^\d+$/);
  });

  it("rate limit is per-user — different user is unaffected", async () => {
    const userA = "usr_sync_rl_iso_a";
    const userB = "usr_sync_rl_iso_b";
    await ensureUser(userA, "iso-a@example.com");
    await ensureUser(userB, "iso-b@example.com");
    const tokenA = await mintAccessToken(typedEnv, userA);
    const tokenB = await mintAccessToken(typedEnv, userB);

    // user A 를 100번 호출 (모두 OK)
    for (let i = 0; i < 100; i++) {
      const resp = await callSync("GET", "/sync/snapshot?since=0", { token: tokenA });
      expect([200, 204]).toContain(resp.status);
    }
    // user A 는 다음 호출 시 429
    const limitedA = await callSync("GET", "/sync/snapshot?since=0", { token: tokenA });
    expect(limitedA.status).toBe(429);

    // user B 는 같은 시점에 정상 응답
    const okB = await callSync("GET", "/sync/snapshot?since=0", { token: tokenB });
    expect([200, 204]).toContain(okB.status);
  });
});
