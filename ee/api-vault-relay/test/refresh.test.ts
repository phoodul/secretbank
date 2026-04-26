import {
  createExecutionContext,
  env,
  waitOnExecutionContext,
} from "cloudflare:test";
import { describe, expect, it } from "vitest";
import worker from "../src/index";
import { mintTokenPair } from "../src/lib/jwt";
import type { Env } from "../src/env";

const typedEnv = env as unknown as Env;

async function postRefresh(body: unknown) {
  const ctx = createExecutionContext();
  const req = new Request("http://localhost/auth/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const resp = await worker.fetch(req, typedEnv, ctx);
  await waitOnExecutionContext(ctx);
  return resp;
}

describe("POST /auth/refresh", () => {
  it("rejects missing refresh_token", async () => {
    const resp = await postRefresh({});
    expect(resp.status).toBe(400);
  });

  it("rejects garbage tokens", async () => {
    const resp = await postRefresh({ refresh_token: "definitely-not-a-jwt" });
    expect(resp.status).toBe(401);
  });

  it("rejects an access token used as refresh", async () => {
    const pair = await mintTokenPair(typedEnv, "usr_refresh_001");
    const resp = await postRefresh({ refresh_token: pair.access_token });
    expect(resp.status).toBe(401);
    const body = (await resp.json()) as { error: string; detail?: string };
    expect(body.error).toBe("invalid_refresh_token");
  });

  it("rotates valid refresh tokens into a new access+refresh pair", async () => {
    const original = await mintTokenPair(typedEnv, "usr_refresh_002");

    const resp = await postRefresh({ refresh_token: original.refresh_token });
    expect(resp.status).toBe(200);

    const body = (await resp.json()) as {
      user_id: string;
      access_token: string;
      refresh_token: string;
    };
    expect(body.user_id).toBe("usr_refresh_002");
    expect(body.access_token.split(".")).toHaveLength(3);
    expect(body.refresh_token.split(".")).toHaveLength(3);
    expect(body.access_token).not.toBe(original.access_token);
    expect(body.refresh_token).not.toBe(original.refresh_token);
  });
});
