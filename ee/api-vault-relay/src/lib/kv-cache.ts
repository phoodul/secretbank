/** KV 에 캐시되는 installation token 구조 */
export interface CachedToken {
  token: string;
  expires_at: string;
}

const KEY_PREFIX = "gh:installation_token";
/** GitHub installation token 유효기간 1시간, 5분 여유를 두고 55분 TTL */
const TTL_SECONDS = 55 * 60;

function cacheKey(installationId: number): string {
  return `${KEY_PREFIX}:${installationId}`;
}

export async function getCachedToken(
  kv: KVNamespace,
  installationId: number,
): Promise<CachedToken | null> {
  const raw = await kv.get(cacheKey(installationId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CachedToken;
  } catch {
    return null;
  }
}

export async function putCachedToken(
  kv: KVNamespace,
  installationId: number,
  token: CachedToken,
): Promise<void> {
  await kv.put(cacheKey(installationId), JSON.stringify(token), {
    expirationTtl: TTL_SECONDS,
  });
}
