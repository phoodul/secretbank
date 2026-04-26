/**
 * Session JWT signing/verification.
 *
 * Algorithm: HS256 (HMAC-SHA-256). HMAC is sufficient for a single-issuer
 * relay where the same Worker that mints tokens also verifies them.
 * (ES256 with imported PKCS#8 PEM is supported by jose but adds operational
 * overhead — key rotation, multi-region distribution — that we don't need yet.
 * If we later split issuer/verifier across services, switch to ES256.)
 *
 * Why not use a long-lived JWT? Sessions are 1h. Refresh tokens (T086) live
 * 30 days and are stored in the on-device age vault.
 */
import { jwtVerify, SignJWT } from "jose";
import type { Env } from "../env";

export const JWT_ISSUER = "api-vault-relay";
export const JWT_AUDIENCE = "api-vault-app";

/** Access token TTL — 1 hour */
export const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
/** Refresh token TTL — 30 days */
export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

/**
 * Resolve the HMAC secret. In production this is `JWT_SIGNING_KEY` (a long
 * random string injected via `wrangler secret put`). In dev/test we fall
 * back to a deterministic dev secret so unit tests don't require manual
 * setup. **Never deploy with the dev fallback.**
 */
function resolveSigningKey(env: Env): Uint8Array {
  const raw = env.JWT_SIGNING_KEY?.trim();
  const secret = raw && raw.length >= 32
    ? raw
    : `dev-only-fallback:${env.RP_ID || "localhost"}:please-set-JWT_SIGNING_KEY`;
  return new TextEncoder().encode(secret);
}

export interface SessionClaims {
  /** user_id (D1 user.id) */
  sub: string;
  /** intended use — "access" or "refresh" */
  use: "access" | "refresh";
  /** issued at (seconds) */
  iat: number;
  /** expiry (seconds) */
  exp: number;
  /** JWT id — random per token, used for revocation list (future) */
  jti: string;
}

function randomJti(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function mintAccessToken(env: Env, userId: string): Promise<string> {
  const key = resolveSigningKey(env);
  return new SignJWT({ use: "access", jti: randomJti() })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(userId)
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(key);
}

export async function mintRefreshToken(env: Env, userId: string): Promise<string> {
  const key = resolveSigningKey(env);
  return new SignJWT({ use: "refresh", jti: randomJti() })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(userId)
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${REFRESH_TOKEN_TTL_SECONDS}s`)
    .sign(key);
}

export async function verifyToken(
  env: Env,
  token: string,
  expectedUse: SessionClaims["use"],
): Promise<SessionClaims> {
  const key = resolveSigningKey(env);
  const { payload } = await jwtVerify(token, key, {
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });
  if (payload.use !== expectedUse) {
    throw new Error(`unexpected_token_use: ${String(payload.use)}`);
  }
  if (typeof payload.sub !== "string" || payload.sub.length === 0) {
    throw new Error("missing_sub");
  }
  // jose 가 iat/exp 를 number 로 보장하고, 위에서 issuer/audience 도 검증함.
  return {
    sub: payload.sub,
    use: payload.use as SessionClaims["use"],
    iat: payload.iat as number,
    exp: payload.exp as number,
    jti: (payload.jti as string | undefined) ?? "",
  };
}

/** Mint an access+refresh pair (used after passkey/oauth verification). */
export async function mintTokenPair(env: Env, userId: string) {
  const [access, refresh] = await Promise.all([
    mintAccessToken(env, userId),
    mintRefreshToken(env, userId),
  ]);
  return {
    access_token: access,
    refresh_token: refresh,
    token_type: "Bearer" as const,
    expires_in: ACCESS_TOKEN_TTL_SECONDS,
  };
}
