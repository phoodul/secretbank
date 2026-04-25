import {
  env,
  createExecutionContext,
  waitOnExecutionContext,
} from "cloudflare:test";
import { describe, it, expect, vi } from "vitest";
import worker from "../src/index";
import type { Env } from "../src/env";

// cloudflare:test の env を Env 型にキャスト
const typedEnv = env as unknown as Env;

describe("POST /integrations/github/installation-token", () => {
  // Authorization 헤더 없음 → 401
  it("returns 401 when Authorization header is missing", async () => {
    const ctx = createExecutionContext();
    const req = new Request(
      "http://localhost/integrations/github/installation-token",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ installation_id: 12345 }),
      },
    );
    const resp = await worker.fetch(req, typedEnv, ctx);
    await waitOnExecutionContext(ctx);

    expect(resp.status).toBe(401);
    const body = (await resp.json()) as Record<string, unknown>;
    expect(body.error).toBe("missing_auth");
  });

  // installation_id 누락 → 400
  it("returns 400 when installation_id is missing", async () => {
    const ctx = createExecutionContext();
    const req = new Request(
      "http://localhost/integrations/github/installation-token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-token",
        },
        body: JSON.stringify({}),
      },
    );
    const resp = await worker.fetch(req, typedEnv, ctx);
    await waitOnExecutionContext(ctx);

    expect(resp.status).toBe(400);
    const body = (await resp.json()) as Record<string, unknown>;
    expect(body.error).toBe("missing_installation_id");
  });

  // installation_id 가 숫자 아님 → 400
  it("returns 400 when installation_id is not a number", async () => {
    const ctx = createExecutionContext();
    const req = new Request(
      "http://localhost/integrations/github/installation-token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-token",
        },
        body: JSON.stringify({ installation_id: "not-a-number" }),
      },
    );
    const resp = await worker.fetch(req, typedEnv, ctx);
    await waitOnExecutionContext(ctx);

    expect(resp.status).toBe(400);
    const body = (await resp.json()) as Record<string, unknown>;
    expect(body.error).toBe("missing_installation_id");
  });

  // KV 캐시 hit — GitHub API 호출 없이 캐시된 토큰 반환
  it("returns cached token without calling GitHub API when cache hit", async () => {
    const cachedToken = {
      token: "ghs_cached_token",
      expires_at: "2099-01-01T00:00:00Z",
    };

    // KV 에 미리 캐시 데이터 삽입
    const cacheKey = "gh:installation_token:99999";
    await typedEnv.TOKEN_CACHE.put(cacheKey, JSON.stringify(cachedToken), {
      expirationTtl: 3300,
    });

    // fetch mock — 이 경우 GitHub API 가 호출되면 안 됨
    const fetchSpy = vi.fn((_url: RequestInfo | URL, _init?: RequestInit) =>
      Promise.resolve(
        new Response(JSON.stringify({ token: "should_not_appear" }), {
          status: 200,
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchSpy);

    const ctx = createExecutionContext();
    const req = new Request(
      "http://localhost/integrations/github/installation-token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-token",
        },
        body: JSON.stringify({ installation_id: 99999 }),
      },
    );
    const resp = await worker.fetch(req, typedEnv, ctx);
    await waitOnExecutionContext(ctx);

    expect(resp.status).toBe(200);
    const body = (await resp.json()) as Record<string, unknown>;
    expect(body.token).toBe("ghs_cached_token");

    // GitHub API URL 로 fetch 가 호출되지 않아야 함
    const githubCalls = fetchSpy.mock.calls.filter((call) => {
      const url = call[0];
      return typeof url === "string" && url.includes("api.github.com");
    });
    expect(githubCalls.length).toBe(0);

    vi.unstubAllGlobals();
  });

  // GitHub API 401 mock → 릴레이가 4xx/5xx 반환
  it("returns error status when GitHub App private key is invalid", async () => {
    // env.GITHUB_APP_PRIVATE_KEY 가 빈 문자열이므로 JWT 서명 실패 → 500 응답
    const ctx = createExecutionContext();
    const req = new Request(
      "http://localhost/integrations/github/installation-token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-token",
        },
        body: JSON.stringify({ installation_id: 77777 }),
      },
    );
    const resp = await worker.fetch(req, typedEnv, ctx);
    await waitOnExecutionContext(ctx);

    // 빈 private key 로 JWT 서명 불가 → 500
    expect(resp.status).toBeGreaterThanOrEqual(400);
  });
});
