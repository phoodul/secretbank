import { Hono } from "hono";
import type { Env } from "../../env";
import { requireUserAuth } from "../../lib/auth";
import { fetchInstallationToken, GitHubApiError } from "../../lib/github-app";
import { getCachedToken, putCachedToken } from "../../lib/kv-cache";

export const githubIntegrations = new Hono<{
  Bindings: Env;
  Variables: { userId: string };
}>();

/**
 * POST /integrations/github/installation-token
 *
 * Body: { installation_id: number }
 * Response: { token: string, expires_at: string }
 *
 * KV 캐시 hit 시 GitHub API 를 호출하지 않는다 (55분 TTL).
 * TODO(T086 M8): user_id 와 installation_id 매핑 검증 (D1 query).
 */
githubIntegrations.post(
  "/installation-token",
  requireUserAuth,
  async (c) => {
    let body: { installation_id?: unknown };
    try {
      body = await c.req.json<{ installation_id?: unknown }>();
    } catch {
      return c.json({ error: "invalid_json" }, 400);
    }

    const installationId = body.installation_id;
    if (typeof installationId !== "number" || !Number.isInteger(installationId)) {
      return c.json({ error: "missing_installation_id" }, 400);
    }

    // KV 캐시 확인
    const cached = await getCachedToken(c.env.TOKEN_CACHE, installationId);
    if (cached) {
      return c.json(cached);
    }

    // GitHub API 호출
    try {
      const fresh = await fetchInstallationToken(
        c.env.GITHUB_APP_ID,
        c.env.GITHUB_APP_PRIVATE_KEY,
        installationId,
      );
      await putCachedToken(c.env.TOKEN_CACHE, installationId, fresh);
      return c.json(fresh);
    } catch (err) {
      if (err instanceof GitHubApiError) {
        if (err.status === 401 || err.status === 404) {
          return c.json(
            { error: "github_api_error", status: err.status, detail: err.body },
            502,
          );
        }
        return c.json(
          { error: "github_api_error", status: err.status, detail: err.body },
          502,
        );
      }
      throw err;
    }
  },
);
