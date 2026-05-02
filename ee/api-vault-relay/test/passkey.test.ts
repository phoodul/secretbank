/**
 * /auth/passkey/* — surface-level regressions.
 *
 * Full WebAuthn attestation/assertion flow needs a real authenticator (or a
 * synthetic one driven by `@simplewebauthn/browser`) and is exercised in the
 * desktop E2E suite. Here we lock in:
 *
 *   - input validation (400 on bad email, 410 on missing challenge)
 *   - state side-effects (user upsert, KV challenge written)
 *   - existence guards (404 when user/passkey missing on assert)
 */
import {
  applyD1Migrations,
  createExecutionContext,
  env,
  waitOnExecutionContext,
} from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import worker from "../src/index";
import type { Env } from "../src/env";

const typedEnv = env as unknown as Env & { TEST_MIGRATIONS: unknown[]; DB: D1Database };

beforeAll(async () => {
  await applyD1Migrations(typedEnv.DB, typedEnv.TEST_MIGRATIONS as never);
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

describe("POST /auth/passkey/register/start", () => {
  it("returns 400 for invalid email", async () => {
    const resp = await postJson("/auth/passkey/register/start", { email: "not-an-email" });
    expect(resp.status).toBe(400);
    const body = (await resp.json()) as { error: string };
    expect(body.error).toBe("invalid_email");
  });

  it("creates a user and writes a challenge to KV when called with a fresh email", async () => {
    const email = `alice-${Date.now()}@example.com`;
    const resp = await postJson("/auth/passkey/register/start", { email });
    expect(resp.status).toBe(200);

    const body = (await resp.json()) as {
      user_id: string;
      options: { challenge: string };
      salt_auth: string;
      salt_enc: string;
    };
    expect(body.user_id).toMatch(/^usr_/);
    expect(body.options.challenge).toBeTypeOf("string");
    expect(body.options.challenge.length).toBeGreaterThan(0);
    // Salts are base64url, 32 bytes → ~43 chars w/o padding.
    expect(body.salt_auth.length).toBeGreaterThanOrEqual(40);
    expect(body.salt_enc.length).toBeGreaterThanOrEqual(40);

    // KV challenge should now exist
    const kvVal = await typedEnv.TOKEN_CACHE.get(`passkey:reg:${email}`);
    expect(kvVal).not.toBeNull();
  });

  it("is idempotent — same email returns the same user_id and salts on a second call", async () => {
    const email = `bob-${Date.now()}@example.com`;
    const first = (await (await postJson("/auth/passkey/register/start", { email })).json()) as {
      user_id: string;
      salt_auth: string;
      salt_enc: string;
    };
    const second = (await (await postJson("/auth/passkey/register/start", { email })).json()) as {
      user_id: string;
      salt_auth: string;
      salt_enc: string;
    };

    expect(second.user_id).toBe(first.user_id);
    expect(second.salt_auth).toBe(first.salt_auth);
    expect(second.salt_enc).toBe(first.salt_enc);
  });
});

describe("POST /auth/passkey/register/verify", () => {
  it("returns 410 when challenge is absent (expired/never started)", async () => {
    const resp = await postJson("/auth/passkey/register/verify", {
      email: "no-challenge@example.com",
      response: {
        id: "abc",
        rawId: "abc",
        type: "public-key",
        response: {},
        clientExtensionResults: {},
      },
    });
    expect(resp.status).toBe(410);
    const body = (await resp.json()) as { error: string };
    expect(body.error).toBe("challenge_expired");
  });

  it("returns 400 for invalid payload (missing response)", async () => {
    const resp = await postJson("/auth/passkey/register/verify", { email: "x@y.z" });
    expect(resp.status).toBe(400);
  });
});

describe("POST /auth/passkey/assert/start", () => {
  it("returns 404 when user is unknown", async () => {
    const resp = await postJson("/auth/passkey/assert/start", {
      email: `nobody-${Date.now()}@example.com`,
    });
    expect(resp.status).toBe(404);
    const body = (await resp.json()) as { error: string };
    expect(body.error).toBe("user_not_found");
  });

  it("returns 404 with no_passkeys when user exists but has no passkeys", async () => {
    const email = `pkless-${Date.now()}@example.com`;
    // upsert user via register/start (user is created but no passkey row)
    await postJson("/auth/passkey/register/start", { email });

    const resp = await postJson("/auth/passkey/assert/start", { email });
    expect(resp.status).toBe(404);
    const body = (await resp.json()) as { error: string };
    expect(body.error).toBe("no_passkeys");
  });
});

describe("POST /auth/passkey/assert/verify", () => {
  it("returns 410 when challenge is absent", async () => {
    const resp = await postJson("/auth/passkey/assert/verify", {
      email: "x@y.z",
      response: {
        id: "abc",
        rawId: "abc",
        type: "public-key",
        response: {},
        clientExtensionResults: {},
      },
    });
    expect(resp.status).toBe(410);
  });
});
