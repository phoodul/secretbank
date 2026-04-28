/**
 * /sync — M9 Phase E (encrypted CRDT relay).
 *
 * Zero-Knowledge: 릴레이는 AEAD envelope 만 본다. 평문 Y.Doc 은 절대 모름.
 *
 * - GET  /sync/snapshot?since=<int>
 *     resp: 200 { version, ciphertext_b64 } (변경 있음)
 *           204                              (변경 없음 = since == version)
 *
 * - POST /sync/snapshot
 *     body: { ciphertext_b64 }
 *     resp: 200 { version }
 *     side effect: encrypted_doc row 의 ciphertext 갱신 + version++.
 *
 * Phase E-2 는 골격만 — JWT 보호 / rate limit / Miniflare 회귀는 E-3 에서.
 */
import { Hono } from "hono";
import type { Context } from "hono";
import type { Env } from "../env";
import { verifyToken } from "../lib/jwt";

export const sync = new Hono<{ Bindings: Env }>();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Authorization 헤더에서 Bearer access token 을 검증해 user_id 를 반환.
 * 실패 시 적절한 4xx 응답.
 */
async function requireAuth(
  c: Context<{ Bindings: Env }>,
): Promise<{ ok: true; userId: string } | { ok: false; res: Response }> {
  const auth = c.req.header("authorization") ?? c.req.header("Authorization");
  if (!auth || !auth.startsWith("Bearer ")) {
    return {
      ok: false,
      res: c.json({ error: "missing_bearer_token" }, 401),
    };
  }
  const token = auth.slice("Bearer ".length).trim();
  if (token.length === 0) {
    return { ok: false, res: c.json({ error: "missing_bearer_token" }, 401) };
  }
  try {
    const claims = await verifyToken(c.env, token, "access");
    return { ok: true, userId: claims.sub };
  } catch (e) {
    return {
      ok: false,
      res: c.json(
        { error: "invalid_access_token", detail: String((e as Error).message) },
        401,
      ),
    };
  }
}

function bufferToBase64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin);
}

function base64ToBytes(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ---------------------------------------------------------------------------
// GET /sync/snapshot?since=<int>
// ---------------------------------------------------------------------------
sync.get("/snapshot", async (c) => {
  const auth = await requireAuth(c);
  if (!auth.ok) return auth.res;

  const sinceRaw = c.req.query("since");
  const since = sinceRaw != null ? Number.parseInt(sinceRaw, 10) : 0;
  if (!Number.isFinite(since) || since < 0) {
    return c.json({ error: "invalid_since" }, 400);
  }

  const row = await c.env.DB.prepare(
    "SELECT version, ciphertext FROM encrypted_doc WHERE user_id = ?",
  )
    .bind(auth.userId)
    .first<{ version: number; ciphertext: ArrayBuffer | null }>();

  if (!row) {
    // 아직 한 번도 push 한 적 없는 사용자.
    return c.json({ version: 0, ciphertext_b64: null });
  }
  if (row.version <= since) {
    // 변경 없음 — body 없는 204 로 절약.
    return new Response(null, { status: 204 });
  }
  return c.json({
    version: row.version,
    ciphertext_b64: row.ciphertext ? bufferToBase64(row.ciphertext) : null,
  });
});

// ---------------------------------------------------------------------------
// POST /sync/snapshot
// ---------------------------------------------------------------------------
sync.post("/snapshot", async (c) => {
  const auth = await requireAuth(c);
  if (!auth.ok) return auth.res;

  const body = (await c.req.json().catch(() => null)) as
    | { ciphertext_b64?: unknown }
    | null;
  if (!body || typeof body.ciphertext_b64 !== "string" || body.ciphertext_b64.length === 0) {
    return c.json({ error: "missing_ciphertext" }, 400);
  }

  let ct: Uint8Array;
  try {
    ct = base64ToBytes(body.ciphertext_b64);
  } catch {
    return c.json({ error: "invalid_base64" }, 400);
  }

  // Reasonable upper bound — Y.Doc 한 개의 CRDT update 가 1MB 를 넘으면 의도
  // 적이지 않은 큰 덩어리. 추후 정량 데이터 기반으로 조정.
  const MAX_BYTES = 1024 * 1024;
  if (ct.byteLength > MAX_BYTES) {
    return c.json({ error: "payload_too_large" }, 413);
  }

  const now = Date.now();
  // UPSERT — 첫 push 시 row insert, 이후 push 마다 version + 1.
  await c.env.DB.prepare(
    `INSERT INTO encrypted_doc (user_id, version, ciphertext, created_at, updated_at)
     VALUES (?, 1, ?, ?, ?)
     ON CONFLICT (user_id) DO UPDATE SET
       version = version + 1,
       ciphertext = excluded.ciphertext,
       updated_at = excluded.updated_at`,
  )
    .bind(auth.userId, ct, now, now)
    .run();

  const row = await c.env.DB.prepare(
    "SELECT version FROM encrypted_doc WHERE user_id = ?",
  )
    .bind(auth.userId)
    .first<{ version: number }>();

  return c.json({ version: row?.version ?? 1 });
});
