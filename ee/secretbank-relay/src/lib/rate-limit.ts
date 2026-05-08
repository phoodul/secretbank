/**
 * Lightweight per-user rate limiter on top of Workers KV.
 *
 * Strategy: **fixed window**.
 *   - key = `ratelimit:<bucket>:<subject>:<window-id>`
 *   - window-id = floor(now_ms / windowMs) — 같은 창 안의 모든 요청은 같은 키
 *     를 공유.
 *   - 카운터를 increment 하고, 첫 호출 시 expirationTtl 로 자동 만료.
 *
 * Trade-off: sliding window 가 정확하지만 KV 의 list-and-sum 비용이 발생.
 * Fixed window 는 경계 burst (window 끝 + 다음 window 시작) 가 이론적으로
 * 한도의 2배까지 가능하지만, 100 req/min 같은 보호 목적에는 충분.
 *
 * **eventual consistency** : KV 는 region 별 캐시라 카운터가 짧은 시차 동안
 * 부정확할 수 있다. 우리 목적 (악의적 폭주 보호) 에는 무관.
 */

export interface RateLimitOptions {
  /** 식별자: 보통 "sync" / "auth-refresh" 같은 endpoint family. */
  bucket: string;
  /** 최대 요청 수. */
  limit: number;
  /** 창 길이 (ms). 60_000 = 1분. */
  windowMs: number;
}

export interface RateLimitDecision {
  ok: boolean;
  /** 현재 창에서 남은 요청 수. ok=false 면 0. */
  remaining: number;
  /** 다음 창 시작까지 ms. */
  resetMs: number;
}

/**
 * 사용자 식별자(보통 JWT sub) 별로 카운터 증가 후 결정.
 *
 * 카운트 제한을 넘긴 호출도 **카운터 증가는 하지 않는다** — 악성 클라이언트
 * 가 spam 으로 KV 쓰기 비용을 폭증시키는 걸 막기 위함.
 */
export async function checkRateLimit(
  kv: KVNamespace,
  subject: string,
  opts: RateLimitOptions,
): Promise<RateLimitDecision> {
  const now = Date.now();
  const windowId = Math.floor(now / opts.windowMs);
  const key = `ratelimit:${opts.bucket}:${subject}:${windowId}`;
  const ttlSeconds = Math.max(1, Math.ceil(opts.windowMs / 1000));
  const resetMs = (windowId + 1) * opts.windowMs - now;

  const raw = await kv.get(key);
  const current = raw ? Number.parseInt(raw, 10) : 0;
  const safeCurrent = Number.isFinite(current) && current >= 0 ? current : 0;

  if (safeCurrent >= opts.limit) {
    return { ok: false, remaining: 0, resetMs };
  }

  const next = safeCurrent + 1;
  await kv.put(key, String(next), { expirationTtl: ttlSeconds });

  return {
    ok: true,
    remaining: Math.max(0, opts.limit - next),
    resetMs,
  };
}
