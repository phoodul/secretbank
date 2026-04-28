/**
 * /pair/* — Phase G-pair-2 Miniflare 회귀.
 *
 * 검증 매트릭스:
 *   - /pair/start: auth (401), invalid pub_key (400), 정상 발급 (PIN 6 digit)
 *   - /pair/join: invalid pin (400), expired channel (410), 정상 join 시
 *     initiator_pub 수신, 다른 joiner 충돌 (409)
 *   - /pair/payload: auth (401), 다른 user channel 시 403, 정상 업로드
 *   - /pair/poll: 미존재 pin (410), 정상 polling (204 → 200)
 *   - end-to-end round-trip: start → join → payload → poll
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
  await typedEnv.DB.prepare(
    `INSERT OR IGNORE INTO user (id, email, created_at) VALUES (?, ?, ?)`,
  )
    .bind(userId, email, Date.now())
    .run();
}

async function call(
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

const PUB_A_B64 = "QUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQT0";
const PUB_B_B64 = "QkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkI9";
const CT_PAYLOAD = "Y2lwaGVydGV4dC1ibG9i";

beforeEach(async () => {
  // pair channel + rate limit KV 초기화 — 다른 테스트 누적 영향 방지.
  for (const prefix of ["pair:", "ratelimit:pair:"]) {
    const list = await typedEnv.TOKEN_CACHE.list({ prefix });
    await Promise.all(list.keys.map((k) => typedEnv.TOKEN_CACHE.delete(k.name)));
  }
});

describe("/pair/start", () => {
  it("returns 401 without Bearer", async () => {
    const r = await call("POST", "/pair/start", { body: { initiator_pub_b64: PUB_A_B64 } });
    expect(r.status).toBe(401);
  });

  it("returns 400 with missing pub_key", async () => {
    const userId = "usr_pair_start_001";
    await ensureUser(userId, "ps1@example.com");
    const token = await mintAccessToken(typedEnv, userId);
    const r = await call("POST", "/pair/start", { token, body: {} });
    expect(r.status).toBe(400);
  });

  it("returns a 6-digit PIN with valid pub_key", async () => {
    const userId = "usr_pair_start_002";
    await ensureUser(userId, "ps2@example.com");
    const token = await mintAccessToken(typedEnv, userId);
    const r = await call("POST", "/pair/start", {
      token,
      body: { initiator_pub_b64: PUB_A_B64 },
    });
    expect(r.status).toBe(200);
    const body = (await r.json()) as { pin: string };
    expect(body.pin).toMatch(/^\d{6}$/);
  });
});

describe("/pair/join", () => {
  it("returns 400 with malformed pin", async () => {
    const r = await call("POST", "/pair/join", {
      body: { pin: "abc", joiner_pub_b64: PUB_B_B64 },
    });
    expect(r.status).toBe(400);
  });

  it("returns 410 for non-existent channel", async () => {
    const r = await call("POST", "/pair/join", {
      body: { pin: "999999", joiner_pub_b64: PUB_B_B64 },
    });
    expect(r.status).toBe(410);
  });

  it("returns initiator_pub_b64 after join", async () => {
    const userId = "usr_join_ok";
    await ensureUser(userId, "joinok@example.com");
    const token = await mintAccessToken(typedEnv, userId);
    const start = await call("POST", "/pair/start", {
      token,
      body: { initiator_pub_b64: PUB_A_B64 },
    });
    const { pin } = (await start.json()) as { pin: string };

    const join = await call("POST", "/pair/join", {
      body: { pin, joiner_pub_b64: PUB_B_B64 },
    });
    expect(join.status).toBe(200);
    const body = (await join.json()) as {
      initiator_pub_b64: string;
      payload_ciphertext_b64: string | null;
    };
    expect(body.initiator_pub_b64).toBe(PUB_A_B64);
    expect(body.payload_ciphertext_b64).toBeNull();
  });

  it("returns 409 when another joiner tries to take an in-use channel", async () => {
    const userId = "usr_join_taken";
    await ensureUser(userId, "joint@example.com");
    const token = await mintAccessToken(typedEnv, userId);
    const start = await call("POST", "/pair/start", {
      token,
      body: { initiator_pub_b64: PUB_A_B64 },
    });
    const { pin } = (await start.json()) as { pin: string };

    await call("POST", "/pair/join", {
      body: { pin, joiner_pub_b64: PUB_B_B64 },
    });
    // 다른 pub 으로 다시 join 시도
    const second = await call("POST", "/pair/join", {
      body: { pin, joiner_pub_b64: "T1RIRVI=" },
    });
    expect(second.status).toBe(409);
  });
});

describe("/pair/payload", () => {
  it("returns 401 without Bearer", async () => {
    const r = await call("POST", "/pair/payload", {
      body: { pin: "012345", ciphertext_b64: CT_PAYLOAD },
    });
    expect(r.status).toBe(401);
  });

  it("returns 403 when initiator's user_id mismatches the channel", async () => {
    const initiator = "usr_pair_pl_a";
    const other = "usr_pair_pl_b";
    await ensureUser(initiator, "pla@example.com");
    await ensureUser(other, "plb@example.com");
    const tokenA = await mintAccessToken(typedEnv, initiator);
    const tokenB = await mintAccessToken(typedEnv, other);
    const start = await call("POST", "/pair/start", {
      token: tokenA,
      body: { initiator_pub_b64: PUB_A_B64 },
    });
    const { pin } = (await start.json()) as { pin: string };

    const r = await call("POST", "/pair/payload", {
      token: tokenB,
      body: { pin, ciphertext_b64: CT_PAYLOAD },
    });
    expect(r.status).toBe(403);
  });

  it("returns 410 when channel is missing", async () => {
    const userId = "usr_pair_pl_missing";
    await ensureUser(userId, "plm@example.com");
    const token = await mintAccessToken(typedEnv, userId);
    const r = await call("POST", "/pair/payload", {
      token,
      body: { pin: "999999", ciphertext_b64: CT_PAYLOAD },
    });
    expect(r.status).toBe(410);
  });
});

describe("/pair/poll", () => {
  it("returns 400 for malformed pin", async () => {
    const r = await call("GET", "/pair/poll?pin=12");
    expect(r.status).toBe(400);
  });

  it("returns 410 for non-existent pin", async () => {
    const r = await call("GET", "/pair/poll?pin=999999");
    expect(r.status).toBe(410);
  });
});

describe("end-to-end pair round-trip", () => {
  it("start → join → payload → poll yields the same ciphertext", async () => {
    const userId = "usr_pair_e2e";
    await ensureUser(userId, "e2e@example.com");
    const token = await mintAccessToken(typedEnv, userId);

    // 1. initiator start
    const start = await call("POST", "/pair/start", {
      token,
      body: { initiator_pub_b64: PUB_A_B64 },
    });
    const { pin } = (await start.json()) as { pin: string };
    expect(pin).toMatch(/^\d{6}$/);

    // 2. joiner join
    const join = await call("POST", "/pair/join", {
      body: { pin, joiner_pub_b64: PUB_B_B64 },
    });
    expect(join.status).toBe(200);

    // 3. joiner polls — 아직 payload 없음 → 204
    const pollEmpty = await call("GET", `/pair/poll?pin=${pin}`);
    expect(pollEmpty.status).toBe(204);

    // 4. initiator uploads payload
    const payload = await call("POST", "/pair/payload", {
      token,
      body: { pin, ciphertext_b64: CT_PAYLOAD },
    });
    expect(payload.status).toBe(200);

    // 5. joiner polls — 받음
    const pollGot = await call("GET", `/pair/poll?pin=${pin}`);
    expect(pollGot.status).toBe(200);
    const body = (await pollGot.json()) as { payload_ciphertext_b64: string };
    expect(body.payload_ciphertext_b64).toBe(CT_PAYLOAD);
  });
});
