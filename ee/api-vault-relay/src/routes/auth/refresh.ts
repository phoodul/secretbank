/**
 * POST /auth/refresh
 *
 * body: { refresh_token: string }
 * resp: { user_id, access_token, refresh_token, token_type, expires_in }
 *
 * Refresh rotation: every successful refresh issues a brand-new refresh token,
 * so a leaked refresh token has at most a 30-day window. (Future: track jti in
 * KV for explicit revocation lists; for now we rely on TTL + key rotation.)
 */
import { Hono } from "hono";
import type { Env } from "../../env";
import { mintTokenPair, verifyToken } from "../../lib/jwt";

export const refreshAuth = new Hono<{ Bindings: Env }>();

refreshAuth.post("/", async (c) => {
  const body = (await c.req.json().catch(() => null)) as { refresh_token?: unknown } | null;
  if (!body || typeof body.refresh_token !== "string" || body.refresh_token.length === 0) {
    return c.json({ error: "missing_refresh_token" }, 400);
  }

  let claims;
  try {
    claims = await verifyToken(c.env, body.refresh_token, "refresh");
  } catch (e) {
    return c.json(
      { error: "invalid_refresh_token", detail: String((e as Error).message) },
      401,
    );
  }

  const tokens = await mintTokenPair(c.env, claims.sub);
  return c.json({ user_id: claims.sub, ...tokens });
});
