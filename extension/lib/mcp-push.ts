/**
 * @file mcp-push.ts
 * @license AGPL-3.0-or-later
 *
 * G-4-2: MCP context push — content-script push 트리거 + 빈도 제한.
 *
 * 옵션 C (single source of truth):
 *   opt-in 결정은 desktop ExtensionSettings 만 (privacy 안전성).
 *   매 push 전 ext_settings_get_mcp_opt_in RPC 호출 → 응답 5분 캐시.
 *   desktop opt-in 변경 시 최대 5분 후 반영.
 *
 * 빈도 제한:
 *   chrome.storage.session 의 host 별 last_push_at 기준 5분 1회.
 *   SPA 호스트 변경 시 별도 cooldown (host 별 독립 캐시 키).
 *
 * 데이터 최소화 (privacy):
 *   credential plaintext ❌ — McpCredentialMeta (id + name + issuer) 만 전송.
 */

import type { McpCredentialMeta } from "@secretbank/shared";
import type { NMClient } from "./nm-client.js";
import { getMcpOptInCache, setMcpOptInCache, getMcpLastPush, setMcpLastPush } from "./storage.js";

// ---------------------------------------------------------------------------
// 상수
// ---------------------------------------------------------------------------

/** MCP push 빈도 제한 — 동일 host 5분 1회 */
const MCP_PUSH_COOLDOWN_MS = 5 * 60 * 1000;

/** opt-in 캐시 TTL — desktop 변경 최대 5분 후 반영 */
const MCP_OPT_IN_CACHE_TTL_MS = 5 * 60 * 1000;

// ---------------------------------------------------------------------------
// opt-in 조회 (옵션 C)
// ---------------------------------------------------------------------------

/**
 * desktop ExtensionSettings 의 MCP opt-in 값을 조회한다.
 *
 * 1. chrome.storage.session 캐시 hit → 즉시 반환 (5분 TTL).
 * 2. cache miss → ext_settings_get_mcp_opt_in RPC → 결과 캐시 저장.
 * 3. RPC 실패 / 연결 없음 → false (opt-out) 반환 (fail-safe).
 *
 * @param sessionToken HMAC 세션 토큰
 * @param nm NMClient 싱글턴 (이미 connect() 된 상태여야 함)
 */
async function fetchMcpOptIn(sessionToken: string, nm: NMClient): Promise<boolean> {
  // 1. 캐시 확인
  const cached = await getMcpOptInCache();
  if (cached !== null) return cached;

  // 2. RPC 호출
  try {
    const response = await nm.extSettingsGetMcpOptIn(sessionToken);
    const enabled = response.ok ? response.enabled : false;
    // 결과 캐시 (5분)
    await setMcpOptInCache(enabled, MCP_OPT_IN_CACHE_TTL_MS);
    return enabled;
  } catch {
    // RPC 실패 → fail-safe: opt-out 으로 처리 (privacy 우선)
    return false;
  }
}

// ---------------------------------------------------------------------------
// 빈도 제한 확인
// ---------------------------------------------------------------------------

/**
 * 동일 host 에 대해 5분 cooldown 이 지났는지 확인한다.
 *
 * @param host 정규화된 hostname
 * @returns true = push 가능, false = cooldown 중 (skip)
 */
async function isCooldownExpired(host: string): Promise<boolean> {
  const lastPush = await getMcpLastPush(host);
  if (lastPush === undefined) return true;
  return Date.now() - lastPush >= MCP_PUSH_COOLDOWN_MS;
}

// ---------------------------------------------------------------------------
// 공개 API
// ---------------------------------------------------------------------------

/**
 * opt-in 검사 + 빈도 제한 통과 시 현재 사이트 컨텍스트를 MCP queue 에 push 한다.
 *
 * - opt-in OFF (desktop) → silently skip (no RPC to mcp_context_push)
 * - 5분 내 동일 host 재호출 → silently skip
 * - opt-in ON + cooldown 경과 → mcpContextPush RPC 호출
 *
 * @param host 현재 페이지 hostname
 * @param credentialMeta 매칭된 credential 목록 (id + name + issuer 만)
 * @param sessionToken HMAC 세션 토큰
 * @param nm NMClient 싱글턴
 */
export async function pushSiteContextIfEnabled(
  host: string,
  credentialMeta: McpCredentialMeta[],
  sessionToken: string,
  nm: NMClient,
): Promise<void> {
  if (!host) return;

  // opt-in 검사 (옵션 C — desktop single source of truth, 5분 캐시)
  const optedIn = await fetchMcpOptIn(sessionToken, nm);
  if (!optedIn) return; // silently skip

  // 빈도 제한 (5분 cooldown per host)
  const canPush = await isCooldownExpired(host);
  if (!canPush) return; // silently skip

  // push 수행
  try {
    await nm.mcpContextPush(host, credentialMeta, sessionToken);
  } catch {
    // push 실패 → silent ignore (spam 방지를 위해 cooldown 은 기록하지 않음)
    return;
  }

  // cooldown 기록 (push 성공 후)
  await setMcpLastPush(host, Date.now());
}
