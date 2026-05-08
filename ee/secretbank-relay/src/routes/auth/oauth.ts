/**
 * /auth/oauth/* — OAuth 2.0 (GitHub + Google).
 *
 * - POST /auth/oauth/:provider/start
 *     body: { redirect_uri: string }
 *     resp: { state: string, authorize_url: string }
 *     KV: oauth:state:<provider>:<state> → { redirect_uri, created_at }
 *
 * - POST /auth/oauth/:provider/callback
 *     body: { code: string, state: string }
 *     resp: { user_id, access_token, refresh_token, ..., salt_auth, salt_enc }
 *     side effect: user upsert by email (or by oauth_account when email missing),
 *                  oauth_account upsert (provider, provider_id), JWT pair
 *
 * Why POST for callback? The browser redirect ultimately needs to land back
 * on the desktop app via deep-link. A common pattern is for the relay to
 * serve a tiny HTML page that performs window.opener.postMessage or a
 * deep-link redirect. For now we expose the JSON endpoint directly so the
 * desktop client can call it after capturing the code via deep-link.
 */
import { Hono } from "hono";
import type { Env } from "../../env";
import { mintTokenPair } from "../../lib/jwt";
import { consumeChallenge, putChallenge } from "../../lib/kv-challenge";
import {
  buildAuthorizeUrl,
  exchangeCode,
  isProvider,
  isProviderEnabled,
  OAuthError,
  type Provider,
} from "../../lib/oauth";
import { bufferToBase64Url } from "../../lib/webauthn";

export const oauthAuth = new Hono<{ Bindings: Env }>();

interface StatePayload {
  redirect_uri: string;
  created_at: number;
}

function isValidEmail(s: unknown): s is string {
  return (
    typeof s === "string" && s.length > 0 && s.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)
  );
}

function randomState(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function bufferToUint8(b: ArrayBuffer | Uint8Array | null): Uint8Array {
  if (b === null) return new Uint8Array(0);
  if (b instanceof Uint8Array) return b;
  return new Uint8Array(b);
}

// ────────────────────────────────────────────────────────────
// User / oauth_account repo helpers (D1)
// ────────────────────────────────────────────────────────────
interface UserRow {
  id: string;
  email: string;
  salt_auth: ArrayBuffer | null;
  salt_enc: ArrayBuffer | null;
}

interface OAuthAccountRow {
  id: string;
  user_id: string;
  provider: string;
  provider_id: string;
}

async function findOAuthAccount(
  db: D1Database,
  provider: Provider,
  providerId: string,
): Promise<OAuthAccountRow | null> {
  return db
    .prepare(
      `SELECT id, user_id, provider, provider_id FROM oauth_account
        WHERE provider = ? AND provider_id = ?`,
    )
    .bind(provider, providerId)
    .first<OAuthAccountRow>();
}

async function findUserByEmail(db: D1Database, email: string): Promise<UserRow | null> {
  return db
    .prepare("SELECT id, email, salt_auth, salt_enc FROM user WHERE email = ?")
    .bind(email)
    .first<UserRow>();
}

async function findUserById(db: D1Database, id: string): Promise<UserRow | null> {
  return db
    .prepare("SELECT id, email, salt_auth, salt_enc FROM user WHERE id = ?")
    .bind(id)
    .first<UserRow>();
}

async function createUser(db: D1Database, email: string): Promise<UserRow> {
  const id = `usr_${crypto.randomUUID().replace(/-/g, "")}`;
  const now = Date.now();
  const saltAuth = crypto.getRandomValues(new Uint8Array(32));
  const saltEnc = crypto.getRandomValues(new Uint8Array(32));

  await db
    .prepare(
      `INSERT INTO user (id, email, created_at, salt_auth, salt_enc, plan)
       VALUES (?, ?, ?, ?, ?, 'free')`,
    )
    .bind(id, email, now, saltAuth, saltEnc)
    .run();

  return {
    id,
    email,
    salt_auth: saltAuth.buffer.slice(
      saltAuth.byteOffset,
      saltAuth.byteOffset + saltAuth.byteLength,
    ),
    salt_enc: saltEnc.buffer.slice(saltEnc.byteOffset, saltEnc.byteOffset + saltEnc.byteLength),
  };
}

async function insertOAuthAccount(
  db: D1Database,
  userId: string,
  provider: Provider,
  providerId: string,
  email: string | null,
): Promise<void> {
  const id = `oa_${crypto.randomUUID().replace(/-/g, "")}`;
  await db
    .prepare(
      `INSERT INTO oauth_account (id, user_id, provider, provider_id, email, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, userId, provider, providerId, email, Date.now())
    .run();
}

// ────────────────────────────────────────────────────────────
// POST /auth/oauth/:provider/start
// ────────────────────────────────────────────────────────────
oauthAuth.post("/:provider/start", async (c) => {
  const provider = c.req.param("provider");
  if (!isProvider(provider)) return c.json({ error: "unsupported_provider" }, 400);

  if (!isProviderEnabled(provider, c.env)) {
    return c.json({ error: "provider_disabled" }, 503);
  }

  const body = (await c.req.json().catch(() => null)) as { redirect_uri?: unknown } | null;
  if (!body || typeof body.redirect_uri !== "string" || body.redirect_uri.length === 0) {
    return c.json({ error: "missing_redirect_uri" }, 400);
  }

  const state = randomState();
  await putChallenge<StatePayload>(c.env.TOKEN_CACHE, `oauth:state:${provider}:${state}`, {
    redirect_uri: body.redirect_uri,
    created_at: Date.now(),
  });

  const authorize_url = buildAuthorizeUrl({
    provider,
    env: c.env,
    state,
    redirectUri: body.redirect_uri,
  });

  return c.json({ state, authorize_url });
});

// ────────────────────────────────────────────────────────────
// POST /auth/oauth/:provider/callback
// ────────────────────────────────────────────────────────────
oauthAuth.post("/:provider/callback", async (c) => {
  const provider = c.req.param("provider");
  if (!isProvider(provider)) return c.json({ error: "unsupported_provider" }, 400);

  const body = (await c.req.json().catch(() => null)) as {
    code?: unknown;
    state?: unknown;
  } | null;
  if (!body || typeof body.code !== "string" || typeof body.state !== "string") {
    return c.json({ error: "invalid_payload" }, 400);
  }

  const stored = await consumeChallenge<StatePayload>(
    c.env.TOKEN_CACHE,
    `oauth:state:${provider}:${body.state}`,
  );
  if (!stored) return c.json({ error: "state_expired" }, 410);

  let exchanged;
  try {
    exchanged = await exchangeCode(provider, c.env, body.code, stored.redirect_uri);
  } catch (e) {
    if (e instanceof OAuthError) {
      return c.json({ error: e.code, detail: e.message }, e.status as 400 | 500 | 502 | 503);
    }
    throw e;
  }

  // 1) If we already linked this provider account, reuse it.
  const linked = await findOAuthAccount(c.env.DB, provider, exchanged.providerId);
  if (linked) {
    const u = await findUserById(c.env.DB, linked.user_id);
    if (!u) return c.json({ error: "user_missing" }, 500);
    const tokens = await mintTokenPair(c.env, u.id);
    return c.json({
      user_id: u.id,
      ...tokens,
      salt_auth: bufferToBase64Url(bufferToUint8(u.salt_auth)),
      salt_enc: bufferToBase64Url(bufferToUint8(u.salt_enc)),
    });
  }

  // 2) Otherwise, link to an existing user by email or create a new user.
  let user: UserRow | null = null;
  if (exchanged.email && isValidEmail(exchanged.email)) {
    user = await findUserByEmail(c.env.DB, exchanged.email);
    if (!user) user = await createUser(c.env.DB, exchanged.email);
  } else {
    // Email-less providers — synthesise an internal email so we have
    // a stable identifier on the user row (UNIQUE NOT NULL constraint).
    const synthetic = `${provider}+${exchanged.providerId}@oauth.secretbank.local`;
    user = await findUserByEmail(c.env.DB, synthetic);
    if (!user) user = await createUser(c.env.DB, synthetic);
  }

  await insertOAuthAccount(c.env.DB, user.id, provider, exchanged.providerId, exchanged.email);

  const tokens = await mintTokenPair(c.env, user.id);
  return c.json({
    user_id: user.id,
    ...tokens,
    salt_auth: bufferToBase64Url(bufferToUint8(user.salt_auth)),
    salt_enc: bufferToBase64Url(bufferToUint8(user.salt_enc)),
  });
});
