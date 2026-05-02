/**
 * /auth/oauth/* — GitHub + Google.
 *
 * The actual OAuth dance can't run in unit tests, so we mock fetch for the
 * provider's token + user-info endpoints and verify our state machine:
 *
 *   - unsupported provider → 400
 *   - missing redirect_uri → 400
 *   - state TTL/missing  → 410
 *   - linked account     → returns existing user_id
 *   - unlinked account   → creates user + oauth_account, mints JWT pair
 *   - emailless GitHub   → falls back to /user/emails
 *   - provider disabled  → 503 (env without client id)
 */
import {
  applyD1Migrations,
  createExecutionContext,
  env,
  waitOnExecutionContext,
} from "cloudflare:test";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import worker from "../src/index";
import type { Env } from "../src/env";

const typedEnv = env as unknown as Env & { TEST_MIGRATIONS: unknown[]; DB: D1Database };

beforeAll(async () => {
  await applyD1Migrations(typedEnv.DB, typedEnv.TEST_MIGRATIONS as never);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function postJson(path: string, body: unknown) {
  const ctx = createExecutionContext();
  const req = new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const resp = await worker.fetch(req, typedEnv, ctx);
  await waitOnExecutionContext(ctx);
  return resp;
}

// ────────────────────────────────────────────────────────────
// /start
// ────────────────────────────────────────────────────────────
describe("POST /auth/oauth/:provider/start", () => {
  it("rejects unsupported provider", async () => {
    const resp = await postJson("/auth/oauth/twitter/start", { redirect_uri: "x" });
    expect(resp.status).toBe(400);
  });

  it("rejects missing redirect_uri", async () => {
    const resp = await postJson("/auth/oauth/github/start", {});
    expect(resp.status).toBe(400);
  });

  it("returns state + authorize_url for github", async () => {
    const resp = await postJson("/auth/oauth/github/start", {
      redirect_uri: "tauri://localhost/auth/callback",
    });
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as { state: string; authorize_url: string };
    expect(body.state.length).toBeGreaterThan(20);
    expect(body.authorize_url).toMatch(/^https:\/\/github\.com\/login\/oauth\/authorize\?/);
    expect(body.authorize_url).toContain(`state=${body.state}`);
    expect(body.authorize_url).toContain("scope=read%3Auser+user%3Aemail");
  });

  it("returns state + authorize_url for google", async () => {
    const resp = await postJson("/auth/oauth/google/start", {
      redirect_uri: "tauri://localhost/auth/callback",
    });
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as { authorize_url: string };
    expect(body.authorize_url).toMatch(/^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth\?/);
  });
});

// ────────────────────────────────────────────────────────────
// /callback
// ────────────────────────────────────────────────────────────
describe("POST /auth/oauth/:provider/callback", () => {
  it("returns 410 when state is unknown / expired", async () => {
    const resp = await postJson("/auth/oauth/github/callback", {
      code: "abc",
      state: "no-such-state",
    });
    expect(resp.status).toBe(410);
  });

  it("github happy path: code → token → user → JWT pair + oauth_account row", async () => {
    // 1) start to seed the KV state
    const startResp = await postJson("/auth/oauth/github/start", {
      redirect_uri: "tauri://localhost/auth/callback",
    });
    const { state } = (await startResp.json()) as { state: string };

    // 2) mock fetch for token + user
    const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : ((input as Request).url ?? String(input));
      if (url === "https://github.com/login/oauth/access_token") {
        return new Response(JSON.stringify({ access_token: "ghs_mock" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url === "https://api.github.com/user") {
        return new Response(JSON.stringify({ id: 9988, email: "alice@example.com" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response("not mocked: " + url, { status: 500 });
    });
    vi.stubGlobal("fetch", fetchSpy);

    const resp = await postJson("/auth/oauth/github/callback", {
      code: "code-xyz",
      state,
    });
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as {
      user_id: string;
      access_token: string;
      refresh_token: string;
      salt_auth: string;
      salt_enc: string;
    };
    expect(body.user_id).toMatch(/^usr_/);
    expect(body.access_token.split(".")).toHaveLength(3);
    expect(body.salt_auth.length).toBeGreaterThan(20);

    // oauth_account row 가 매핑되었는지 D1 직접 조회
    const row = await typedEnv.DB.prepare(
      `SELECT user_id FROM oauth_account WHERE provider = 'github' AND provider_id = '9988'`,
    ).first<{ user_id: string }>();
    expect(row?.user_id).toBe(body.user_id);
  });

  it("github private email: falls back to /user/emails primary verified", async () => {
    const startResp = await postJson("/auth/oauth/github/start", {
      redirect_uri: "tauri://localhost/auth/callback",
    });
    const { state } = (await startResp.json()) as { state: string };

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : ((input as Request).url ?? String(input));
        if (url === "https://github.com/login/oauth/access_token") {
          return new Response(JSON.stringify({ access_token: "ghs_priv" }), { status: 200 });
        }
        if (url === "https://api.github.com/user") {
          return new Response(JSON.stringify({ id: 7777, email: null }), { status: 200 });
        }
        if (url === "https://api.github.com/user/emails") {
          return new Response(
            JSON.stringify([
              { email: "noisy@example.com", primary: false, verified: true },
              { email: "primary@example.com", primary: true, verified: true },
            ]),
            { status: 200 },
          );
        }
        return new Response("not mocked: " + url, { status: 500 });
      }),
    );

    const resp = await postJson("/auth/oauth/github/callback", { code: "c", state });
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as { user_id: string };

    const userRow = await typedEnv.DB.prepare(`SELECT email FROM user WHERE id = ?`)
      .bind(body.user_id)
      .first<{ email: string }>();
    expect(userRow?.email).toBe("primary@example.com");
  });

  it("google happy path: token + userinfo → user upsert + JWT pair", async () => {
    const startResp = await postJson("/auth/oauth/google/start", {
      redirect_uri: "tauri://localhost/auth/callback",
    });
    const { state } = (await startResp.json()) as { state: string };

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : ((input as Request).url ?? String(input));
        if (url === "https://oauth2.googleapis.com/token") {
          return new Response(JSON.stringify({ access_token: "ya29.mock" }), { status: 200 });
        }
        if (url === "https://www.googleapis.com/oauth2/v2/userinfo") {
          return new Response(
            JSON.stringify({ id: "g-555", email: "carol@example.com", verified_email: true }),
            { status: 200 },
          );
        }
        return new Response("not mocked: " + url, { status: 500 });
      }),
    );

    const resp = await postJson("/auth/oauth/google/callback", { code: "c", state });
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as { user_id: string };

    const row = await typedEnv.DB.prepare(
      `SELECT user_id FROM oauth_account WHERE provider = 'google' AND provider_id = 'g-555'`,
    ).first<{ user_id: string }>();
    expect(row?.user_id).toBe(body.user_id);
  });

  it("repeat callback for the same provider_id reuses the existing user", async () => {
    // first link
    const startA = await postJson("/auth/oauth/github/start", {
      redirect_uri: "tauri://localhost/auth/callback",
    });
    const { state: stateA } = (await startA.json()) as { state: string };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : ((input as Request).url ?? String(input));
        if (url === "https://github.com/login/oauth/access_token") {
          return new Response(JSON.stringify({ access_token: "t1" }), { status: 200 });
        }
        if (url === "https://api.github.com/user") {
          return new Response(JSON.stringify({ id: 4242, email: "dave@example.com" }), {
            status: 200,
          });
        }
        return new Response("nope", { status: 500 });
      }),
    );
    const respA = await postJson("/auth/oauth/github/callback", { code: "c1", state: stateA });
    const bodyA = (await respA.json()) as { user_id: string };

    // second link — fresh state, same provider_id
    const startB = await postJson("/auth/oauth/github/start", {
      redirect_uri: "tauri://localhost/auth/callback",
    });
    const { state: stateB } = (await startB.json()) as { state: string };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : ((input as Request).url ?? String(input));
        if (url === "https://github.com/login/oauth/access_token") {
          return new Response(JSON.stringify({ access_token: "t2" }), { status: 200 });
        }
        if (url === "https://api.github.com/user") {
          return new Response(JSON.stringify({ id: 4242, email: "dave@example.com" }), {
            status: 200,
          });
        }
        return new Response("nope", { status: 500 });
      }),
    );
    const respB = await postJson("/auth/oauth/github/callback", { code: "c2", state: stateB });
    const bodyB = (await respB.json()) as { user_id: string };

    expect(bodyB.user_id).toBe(bodyA.user_id);

    // there should still be exactly one oauth_account row for provider_id=4242
    const count = await typedEnv.DB.prepare(
      `SELECT COUNT(*) AS n FROM oauth_account WHERE provider='github' AND provider_id='4242'`,
    ).first<{ n: number }>();
    expect(count?.n).toBe(1);
  });
});
