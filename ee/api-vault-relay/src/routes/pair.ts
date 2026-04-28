/**
 * /pair/* — M9 Phase G T092 (X25519 device pairing channel).
 *
 * 흐름 (자세한 설계는 api-vault-crypto::pairing 의 doc-comment 참조):
 *
 *   1. initiator (sign-in 한 디바이스 A) → POST /pair/start (Bearer access)
 *      body: { initiator_pub_b64 }
 *      resp: { pin: "012345" }   // 6자리 ASCII numeric, 5분 TTL
 *
 *   2. UI 가 deep-link / QR 로 PIN + initiator_pub_b64 출력
 *
 *   3. joiner (sign-in 안 된 디바이스 B) → POST /pair/join (auth 없음)
 *      body: { pin, joiner_pub_b64 }
 *      resp: { initiator_pub_b64, payload_ciphertext_b64 | null }
 *
 *   4. initiator → POST /pair/payload (Bearer access, same user)
 *      body: { pin, ciphertext_b64 }
 *      resp: 200
 *
 *   5. joiner → GET /pair/poll?pin=...
 *      resp: 200 { payload_ciphertext_b64 } 또는 204 (아직 없음)
 *
 * Channel state 는 Workers KV 에 5분 TTL 로 저장 (consume-once 는 아니지만
 * `complete` flag 로 finished 후 추가 access 차단).
 *
 * Auth 모델:
 *   - /pair/start, /pair/payload — Bearer access 검증 + payload 의 user_id
 *     가 channel state 의 user_id 와 일치해야 함 (initiator 가 자기 채널만
 *     쓸 수 있게).
 *   - /pair/join, /pair/poll — auth 없음. PIN 자체가 짧은 capability token
 *     (6자리 + 5분 + rate limit).
 */
import { Hono } from "hono";
import type { Context } from "hono";
import type { Env } from "../env";
import { verifyToken } from "../lib/jwt";
import { checkRateLimit } from "../lib/rate-limit";

export const pair = new Hono<{ Bindings: Env }>();

const PAIR_RATE_LIMIT = { bucket: "pair", limit: 30, windowMs: 60_000 };
const PIN_LENGTH = 6;
const PAIR_TTL_SECONDS = 5 * 60;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface PairChannel {
  user_id: string;
  initiator_pub_b64: string;
  joiner_pub_b64: string | null;
  payload_ciphertext_b64: string | null;
  created_at: number;
}

function pairKey(pin: string): string {
  return `pair:${pin}`;
}

async function getChannel(env: Env, pin: string): Promise<PairChannel | null> {
  const raw = await env.TOKEN_CACHE.get(pairKey(pin));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PairChannel;
  } catch {
    return null;
  }
}

async function setChannel(env: Env, pin: string, ch: PairChannel): Promise<void> {
  await env.TOKEN_CACHE.put(pairKey(pin), JSON.stringify(ch), {
    expirationTtl: PAIR_TTL_SECONDS,
  });
}

function generatePin(): string {
  const bytes = new Uint8Array(PIN_LENGTH);
  crypto.getRandomValues(bytes);
  let pin = "";
  for (let i = 0; i < PIN_LENGTH; i++) pin += String((bytes[i]! & 0xff) % 10);
  return pin;
}

async function requireAuth(
  c: Context<{ Bindings: Env }>,
): Promise<{ ok: true; userId: string } | { ok: false; res: Response }> {
  const auth = c.req.header("authorization") ?? c.req.header("Authorization");
  if (!auth || !auth.startsWith("Bearer ")) {
    return { ok: false, res: c.json({ error: "missing_bearer_token" }, 401) };
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

function isB64(s: unknown): s is string {
  return (
    typeof s === "string" &&
    s.length > 0 &&
    s.length <= 4096 &&
    /^[A-Za-z0-9+/=_-]+$/.test(s)
  );
}

// ---------------------------------------------------------------------------
// POST /pair/start — initiator 가 채널 시작 (Bearer 필수)
// ---------------------------------------------------------------------------
pair.post("/start", async (c) => {
  const auth = await requireAuth(c);
  if (!auth.ok) return auth.res;

  const rl = await checkRateLimit(c.env.TOKEN_CACHE, auth.userId, PAIR_RATE_LIMIT);
  if (!rl.ok) {
    return c.json({ error: "rate_limited", reset_ms: rl.resetMs }, 429, {
      "Retry-After": String(Math.ceil(rl.resetMs / 1000)),
    });
  }

  const body = (await c.req.json().catch(() => null)) as
    | { initiator_pub_b64?: unknown }
    | null;
  if (!body || !isB64(body.initiator_pub_b64)) {
    return c.json({ error: "missing_or_invalid_pub_key" }, 400);
  }

  // 짧은 PIN 충돌 회피 — 8회 시도. 매 시도 KV.get 한 번씩 확인.
  let pin = "";
  let attempt = 0;
  while (attempt < 8) {
    pin = generatePin();
    const existing = await c.env.TOKEN_CACHE.get(pairKey(pin));
    if (!existing) break;
    attempt++;
  }
  if (attempt === 8) return c.json({ error: "pin_collision" }, 503);

  const channel: PairChannel = {
    user_id: auth.userId,
    initiator_pub_b64: body.initiator_pub_b64,
    joiner_pub_b64: null,
    payload_ciphertext_b64: null,
    created_at: Date.now(),
  };
  await setChannel(c.env, pin, channel);
  return c.json({ pin });
});

// ---------------------------------------------------------------------------
// POST /pair/join — joiner 가 자기 pub 업로드 + initiator pub 회수
// ---------------------------------------------------------------------------
pair.post("/join", async (c) => {
  // PIN 자체가 capability — auth 없음. 다만 anon rate limit 적용.
  const rl = await checkRateLimit(
    c.env.TOKEN_CACHE,
    c.req.header("cf-connecting-ip") ?? "anon",
    PAIR_RATE_LIMIT,
  );
  if (!rl.ok) {
    return c.json({ error: "rate_limited", reset_ms: rl.resetMs }, 429, {
      "Retry-After": String(Math.ceil(rl.resetMs / 1000)),
    });
  }

  const body = (await c.req.json().catch(() => null)) as
    | { pin?: unknown; joiner_pub_b64?: unknown }
    | null;
  if (
    !body ||
    typeof body.pin !== "string" ||
    body.pin.length !== PIN_LENGTH ||
    !/^\d+$/.test(body.pin) ||
    !isB64(body.joiner_pub_b64)
  ) {
    return c.json({ error: "invalid_payload" }, 400);
  }

  const ch = await getChannel(c.env, body.pin);
  if (!ch) return c.json({ error: "channel_expired" }, 410);

  // 한 번 join 한 joiner 와 다른 pub 업로드 거부 (race / replay 방지)
  if (ch.joiner_pub_b64 && ch.joiner_pub_b64 !== body.joiner_pub_b64) {
    return c.json({ error: "channel_taken" }, 409);
  }

  ch.joiner_pub_b64 = body.joiner_pub_b64;
  await setChannel(c.env, body.pin, ch);
  return c.json({
    initiator_pub_b64: ch.initiator_pub_b64,
    payload_ciphertext_b64: ch.payload_ciphertext_b64,
  });
});

// ---------------------------------------------------------------------------
// POST /pair/payload — initiator 가 AEAD payload 업로드 (Bearer + same user)
// ---------------------------------------------------------------------------
pair.post("/payload", async (c) => {
  const auth = await requireAuth(c);
  if (!auth.ok) return auth.res;

  const rl = await checkRateLimit(c.env.TOKEN_CACHE, auth.userId, PAIR_RATE_LIMIT);
  if (!rl.ok) {
    return c.json({ error: "rate_limited", reset_ms: rl.resetMs }, 429, {
      "Retry-After": String(Math.ceil(rl.resetMs / 1000)),
    });
  }

  const body = (await c.req.json().catch(() => null)) as
    | { pin?: unknown; ciphertext_b64?: unknown }
    | null;
  if (
    !body ||
    typeof body.pin !== "string" ||
    body.pin.length !== PIN_LENGTH ||
    !isB64(body.ciphertext_b64)
  ) {
    return c.json({ error: "invalid_payload" }, 400);
  }

  const ch = await getChannel(c.env, body.pin);
  if (!ch) return c.json({ error: "channel_expired" }, 410);
  if (ch.user_id !== auth.userId) {
    return c.json({ error: "channel_user_mismatch" }, 403);
  }

  ch.payload_ciphertext_b64 = body.ciphertext_b64;
  await setChannel(c.env, body.pin, ch);
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// GET /pair/poll?pin=... — joiner polling (auth 없음)
// ---------------------------------------------------------------------------
pair.get("/poll", async (c) => {
  const rl = await checkRateLimit(
    c.env.TOKEN_CACHE,
    c.req.header("cf-connecting-ip") ?? "anon",
    PAIR_RATE_LIMIT,
  );
  if (!rl.ok) {
    return c.json({ error: "rate_limited", reset_ms: rl.resetMs }, 429, {
      "Retry-After": String(Math.ceil(rl.resetMs / 1000)),
    });
  }

  const pin = c.req.query("pin") ?? "";
  if (pin.length !== PIN_LENGTH || !/^\d+$/.test(pin)) {
    return c.json({ error: "invalid_pin" }, 400);
  }
  const ch = await getChannel(c.env, pin);
  if (!ch) return c.json({ error: "channel_expired" }, 410);
  if (!ch.payload_ciphertext_b64) return new Response(null, { status: 204 });
  return c.json({ payload_ciphertext_b64: ch.payload_ciphertext_b64 });
});
