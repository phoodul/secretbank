/**
 * /auth/passkey/* — WebAuthn (Passkey) registration & authentication.
 *
 * Flow:
 *   register/start  → upsert user (issue salt_auth, salt_enc) + KV challenge
 *                     + return PublicKeyCredentialCreationOptionsJSON
 *   register/verify → consume challenge, verifyRegistrationResponse, INSERT passkey,
 *                     mint access+refresh JWT pair
 *   assert/start    → find user, fetch passkeys, KV challenge
 *                     + return PublicKeyCredentialRequestOptionsJSON + salts
 *   assert/verify   → consume challenge, verifyAuthenticationResponse,
 *                     UPDATE sign_count, mint JWT pair
 *
 * salt_auth / salt_enc are returned as base64url so the desktop client can
 * derive (auth_hash) and (enc_key) deterministically across devices —
 * Zero-Knowledge: server never sees enc_key.
 */
import { Hono } from "hono";
import type { Env } from "../../env";
import { mintTokenPair } from "../../lib/jwt";
import { consumeChallenge, putChallenge } from "../../lib/kv-challenge";
import {
  base64UrlToBuffer,
  beginAuthentication,
  beginRegistration,
  bufferToBase64Url,
  finishAuthentication,
  finishRegistration,
} from "../../lib/webauthn";
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";

export const passkeyAuth = new Hono<{ Bindings: Env }>();

// ────────────────────────────────────────────────────────────
// Email validation — RFC-friendly subset
// ────────────────────────────────────────────────────────────
function isValidEmail(s: unknown): s is string {
  if (typeof s !== "string") return false;
  if (s.length === 0 || s.length > 320) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

// ────────────────────────────────────────────────────────────
// User repo helpers (D1 SQL — keep narrow & co-located for auditability)
// ────────────────────────────────────────────────────────────
interface UserRow {
  id: string;
  email: string;
  salt_auth: ArrayBuffer | null;
  salt_enc: ArrayBuffer | null;
}

interface PasskeyRow {
  id: string;
  user_id: string;
  credential_id: ArrayBuffer;
  public_key: ArrayBuffer;
  sign_count: number;
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
    salt_auth: saltAuth.buffer.slice(saltAuth.byteOffset, saltAuth.byteOffset + saltAuth.byteLength),
    salt_enc: saltEnc.buffer.slice(saltEnc.byteOffset, saltEnc.byteOffset + saltEnc.byteLength),
  };
}

async function listPasskeysForUser(db: D1Database, userId: string): Promise<PasskeyRow[]> {
  const result = await db
    .prepare(
      `SELECT id, user_id, credential_id, public_key, sign_count
         FROM passkey WHERE user_id = ?`,
    )
    .bind(userId)
    .all<PasskeyRow>();
  return result.results ?? [];
}

async function findPasskeyByCredentialId(
  db: D1Database,
  credentialIdBytes: Uint8Array,
): Promise<PasskeyRow | null> {
  return db
    .prepare(
      `SELECT id, user_id, credential_id, public_key, sign_count
         FROM passkey WHERE credential_id = ?`,
    )
    .bind(credentialIdBytes)
    .first<PasskeyRow>();
}

async function insertPasskey(
  db: D1Database,
  userId: string,
  credentialIdBytes: Uint8Array,
  publicKeyBytes: Uint8Array,
  signCount: number,
  transports: string[] | null,
): Promise<void> {
  const id = `pk_${crypto.randomUUID().replace(/-/g, "")}`;
  await db
    .prepare(
      `INSERT INTO passkey (id, user_id, credential_id, public_key, sign_count, transports, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      userId,
      credentialIdBytes,
      publicKeyBytes,
      signCount,
      transports ? JSON.stringify(transports) : null,
      Date.now(),
    )
    .run();
}

async function updatePasskeyCounter(
  db: D1Database,
  passkeyId: string,
  newCounter: number,
): Promise<void> {
  await db
    .prepare(`UPDATE passkey SET sign_count = ? WHERE id = ?`)
    .bind(newCounter, passkeyId)
    .run();
}

function bufferToUint8(b: ArrayBuffer | Uint8Array | null): Uint8Array {
  if (b === null) return new Uint8Array(0);
  if (b instanceof Uint8Array) return b;
  return new Uint8Array(b);
}

// ────────────────────────────────────────────────────────────
// POST /auth/passkey/register/start
// ────────────────────────────────────────────────────────────
passkeyAuth.post("/register/start", async (c) => {
  const body = await c.req.json().catch(() => null) as { email?: unknown } | null;
  if (!body || !isValidEmail(body.email)) {
    return c.json({ error: "invalid_email" }, 400);
  }
  const email = body.email;

  let user = await findUserByEmail(c.env.DB, email);
  if (!user) {
    user = await createUser(c.env.DB, email);
  }

  const existing = await listPasskeysForUser(c.env.DB, user.id);
  const excludeIds = existing.map((p) => bufferToBase64Url(bufferToUint8(p.credential_id)));

  const options = await beginRegistration({
    env: c.env,
    userId: user.id,
    userName: email,
    excludeCredentialIds: excludeIds,
  });

  await putChallenge(c.env.TOKEN_CACHE, `passkey:reg:${email}`, options.challenge);

  return c.json({
    user_id: user.id,
    options,
    salt_auth: bufferToBase64Url(bufferToUint8(user.salt_auth)),
    salt_enc: bufferToBase64Url(bufferToUint8(user.salt_enc)),
  });
});

// ────────────────────────────────────────────────────────────
// POST /auth/passkey/register/verify
// ────────────────────────────────────────────────────────────
passkeyAuth.post("/register/verify", async (c) => {
  const body = await c.req.json().catch(() => null) as {
    email?: unknown;
    response?: unknown;
  } | null;
  if (!body || !isValidEmail(body.email) || !body.response || typeof body.response !== "object") {
    return c.json({ error: "invalid_payload" }, 400);
  }
  const email = body.email;
  const response = body.response as RegistrationResponseJSON;

  const challenge = await consumeChallenge<string>(c.env.TOKEN_CACHE, `passkey:reg:${email}`);
  if (!challenge) return c.json({ error: "challenge_expired" }, 410);

  const user = await findUserByEmail(c.env.DB, email);
  if (!user) return c.json({ error: "user_missing" }, 404);

  let verification;
  try {
    verification = await finishRegistration(c.env, response, challenge);
  } catch (e) {
    return c.json({ error: "registration_failed", detail: String((e as Error).message) }, 400);
  }
  if (!verification.verified || !verification.registrationInfo) {
    return c.json({ error: "registration_failed" }, 400);
  }

  const info = verification.registrationInfo;
  await insertPasskey(
    c.env.DB,
    user.id,
    base64UrlToBuffer(info.credential.id),
    info.credential.publicKey,
    info.credential.counter,
    info.credential.transports ?? null,
  );

  const tokens = await mintTokenPair(c.env, user.id);
  return c.json({ user_id: user.id, ...tokens });
});

// ────────────────────────────────────────────────────────────
// POST /auth/passkey/assert/start
// ────────────────────────────────────────────────────────────
passkeyAuth.post("/assert/start", async (c) => {
  const body = await c.req.json().catch(() => null) as { email?: unknown } | null;
  if (!body || !isValidEmail(body.email)) {
    return c.json({ error: "invalid_email" }, 400);
  }
  const email = body.email;

  const user = await findUserByEmail(c.env.DB, email);
  if (!user) return c.json({ error: "user_not_found" }, 404);

  const passkeys = await listPasskeysForUser(c.env.DB, user.id);
  if (passkeys.length === 0) return c.json({ error: "no_passkeys" }, 404);

  const allowIds = passkeys.map((p) => bufferToBase64Url(bufferToUint8(p.credential_id)));
  const options = await beginAuthentication({ env: c.env, allowCredentialIds: allowIds });

  await putChallenge(c.env.TOKEN_CACHE, `passkey:assert:${email}`, options.challenge);

  return c.json({
    user_id: user.id,
    options,
    salt_auth: bufferToBase64Url(bufferToUint8(user.salt_auth)),
    salt_enc: bufferToBase64Url(bufferToUint8(user.salt_enc)),
  });
});

// ────────────────────────────────────────────────────────────
// POST /auth/passkey/assert/verify
// ────────────────────────────────────────────────────────────
passkeyAuth.post("/assert/verify", async (c) => {
  const body = await c.req.json().catch(() => null) as {
    email?: unknown;
    response?: unknown;
  } | null;
  if (!body || !isValidEmail(body.email) || !body.response || typeof body.response !== "object") {
    return c.json({ error: "invalid_payload" }, 400);
  }
  const email = body.email;
  const response = body.response as AuthenticationResponseJSON;

  const challenge = await consumeChallenge<string>(c.env.TOKEN_CACHE, `passkey:assert:${email}`);
  if (!challenge) return c.json({ error: "challenge_expired" }, 410);

  const passkey = await findPasskeyByCredentialId(c.env.DB, base64UrlToBuffer(response.id));
  if (!passkey) return c.json({ error: "credential_not_found" }, 404);

  const user = await findUserById(c.env.DB, passkey.user_id);
  if (!user || user.email !== email) return c.json({ error: "credential_email_mismatch" }, 403);

  let verification;
  try {
    verification = await finishAuthentication({
      env: c.env,
      response,
      expectedChallenge: challenge,
      storedCredential: {
        id: bufferToBase64Url(bufferToUint8(passkey.credential_id)),
        publicKey: bufferToUint8(passkey.public_key),
        counter: passkey.sign_count,
      },
    });
  } catch (e) {
    return c.json({ error: "auth_failed", detail: String((e as Error).message) }, 401);
  }
  if (!verification.verified) return c.json({ error: "auth_failed" }, 401);

  await updatePasskeyCounter(
    c.env.DB,
    passkey.id,
    verification.authenticationInfo.newCounter,
  );

  const tokens = await mintTokenPair(c.env, user.id);
  return c.json({ user_id: user.id, ...tokens });
});
