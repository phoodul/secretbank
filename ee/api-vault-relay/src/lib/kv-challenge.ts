/**
 * Short-lived challenge / state storage in KV.
 *
 * Used by:
 * - Passkey register/assert flow (challenge — 5 min TTL)
 * - OAuth start/callback flow (state + PKCE verifier — 5 min TTL)
 *
 * Keys are scoped: "passkey:reg:<email>", "passkey:assert:<email>",
 * "oauth:state:<provider>:<state>".
 */

const TTL_SECONDS = 5 * 60;

interface ChallengeRecord<T> {
  v: T;
  /** unix seconds when this record expires */
  exp: number;
}

export async function putChallenge<T>(
  kv: KVNamespace,
  key: string,
  value: T,
  ttlSeconds: number = TTL_SECONDS,
): Promise<void> {
  const record: ChallengeRecord<T> = {
    v: value,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  await kv.put(key, JSON.stringify(record), { expirationTtl: ttlSeconds });
}

/**
 * Get-and-consume — returns the value and immediately deletes the entry
 * to prevent challenge reuse.
 */
export async function consumeChallenge<T>(
  kv: KVNamespace,
  key: string,
): Promise<T | null> {
  const raw = await kv.get(key);
  if (!raw) return null;
  await kv.delete(key);
  try {
    const record = JSON.parse(raw) as ChallengeRecord<T>;
    if (record.exp < Math.floor(Date.now() / 1000)) return null;
    return record.v;
  } catch {
    return null;
  }
}
