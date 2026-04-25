import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import worker from "../src/index";
import type { Env } from "../src/env";

const typedEnv = env as unknown as Env;

describe("GET /health", () => {
  it("returns 200 with correct JSON shape", async () => {
    const ctx = createExecutionContext();
    const req = new Request("http://localhost/health");
    const resp = await worker.fetch(req, typedEnv, ctx);
    await waitOnExecutionContext(ctx);

    expect(resp.status).toBe(200);

    const body = (await resp.json()) as Record<string, unknown>;
    expect(body.status).toBe("ok");
    expect(body.service).toBe("api-vault-relay");
    expect(body.version).toBe("0.1.0");
    expect(typeof body.time).toBe("string");
    // time 이 ISO 8601 형식인지 확인
    expect(new Date(body.time as string).getTime()).toBeGreaterThan(0);
  });

  it("returns content-type application/json", async () => {
    const ctx = createExecutionContext();
    const req = new Request("http://localhost/health");
    const resp = await worker.fetch(req, typedEnv, ctx);
    await waitOnExecutionContext(ctx);

    expect(resp.headers.get("content-type")).toContain("application/json");
  });
});
