/**
 * @file storage.ts
 * @license AGPL-3.0-or-later
 *
 * chrome.storage.local 의 typed wrapper.
 *
 * 저장 데이터:
 *   - `pairing`: Extension ↔ Desktop 페어링 정보
 *
 * ⚠️  보안 한계 (위협 모델 T7):
 *   extensionPriv(X25519 개인키)는 chrome.storage.local 에 base64 평문으로 저장됨.
 *   브라우저 확장 권한 침해(악의적인 다른 확장, 로컬 디버거 접근) 시 노출 가능.
 *   chrome.storage.local 은 브라우저 프로파일 디렉토리에 SQLite 로 기록되며
 *   OS 수준 암호화(BitLocker/FileVault)에 의존한다.
 *   완화: 개인키는 페어링 1회용 ephemeral — 재페어링 시 새 키 생성.
 *   참조: docs/task_m24e.md 위협 모델 T7.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Zod schema — 저장 구조 정의
// ---------------------------------------------------------------------------

/**
 * chrome.storage.local 에 저장되는 페어링 정보 schema.
 *
 * extensionPriv: Extension 측 X25519 개인키 (base64, 32바이트).
 *   ※ chrome.storage.local 에 평문 저장됨 — 위협 모델 T7 참조.
 * desktopPub: Desktop 측 X25519 공개키 (base64, 32바이트).
 * deviceId: Desktop 디바이스 식별자.
 * pairedAt: 페어링 완료 시각 (Unix ms).
 */
export const PairingStorageSchema = z.object({
  extensionPriv: z.string().min(1),
  desktopPub: z.string().min(1),
  deviceId: z.string().min(1),
  pairedAt: z.number().int().positive(),
});

/** 페어링 저장 구조 타입 */
export type PairingStorage = z.infer<typeof PairingStorageSchema>;

// ---------------------------------------------------------------------------
// chrome.storage.local 키
// ---------------------------------------------------------------------------

const PAIRING_KEY = "pairing";

// ---------------------------------------------------------------------------
// 공개 API
// ---------------------------------------------------------------------------

/**
 * chrome.storage.local 에서 페어링 정보를 읽어온다.
 *
 * @returns PairingStorage 또는 null (저장 데이터 없거나 스키마 불일치)
 */
export async function getPairing(): Promise<PairingStorage | null> {
  const result = await chrome.storage.local.get(PAIRING_KEY);
  const raw = result[PAIRING_KEY];
  if (raw === undefined || raw === null) return null;

  // Zod 검증 — 구조 불일치 시 null 반환 (조용한 실패)
  const parsed = PairingStorageSchema.safeParse(raw);
  if (!parsed.success) return null;

  return parsed.data;
}

/**
 * chrome.storage.local 에 페어링 정보를 저장한다.
 *
 * ⚠️  extensionPriv 는 평문으로 저장됨 — 위협 모델 T7 참조.
 *
 * @param data PairingStorage 객체
 */
export async function setPairing(data: PairingStorage): Promise<void> {
  await chrome.storage.local.set({ [PAIRING_KEY]: data });
}

/**
 * chrome.storage.local 에서 페어링 정보를 삭제한다.
 * 재페어링 또는 페어링 초기화 시 호출한다.
 */
export async function clearPairing(): Promise<void> {
  await chrome.storage.local.remove(PAIRING_KEY);
}

// ---------------------------------------------------------------------------
// D-4: session token 캐시
// ---------------------------------------------------------------------------

const SESSION_TOKEN_KEY = "session_token";

/** B-7 HMAC-SHA256 세션 토큰 캐시 schema. */
const SessionTokenCacheSchema = z.object({
  token: z.string().min(1),
  expires_at: z.number().int().positive(),
});

export type SessionTokenCache = z.infer<typeof SessionTokenCacheSchema>;

/** chrome.storage.local 에서 세션 토큰을 읽는다. 만료된 토큰은 null 반환. */
export async function getSessionToken(): Promise<SessionTokenCache | null> {
  const result = await chrome.storage.local.get(SESSION_TOKEN_KEY);
  const raw = result[SESSION_TOKEN_KEY];
  if (raw === undefined || raw === null) return null;
  const parsed = SessionTokenCacheSchema.safeParse(raw);
  if (!parsed.success) return null;
  // 만료 검사 — 만료된 토큰은 null (재인증 필요 신호)
  if (parsed.data.expires_at < Date.now()) return null;
  return parsed.data;
}

/** chrome.storage.local 에 세션 토큰을 저장한다. */
export async function setSessionToken(data: SessionTokenCache): Promise<void> {
  await chrome.storage.local.set({ [SESSION_TOKEN_KEY]: data });
}

/** chrome.storage.local 에서 세션 토큰을 삭제한다. */
export async function clearSessionToken(): Promise<void> {
  await chrome.storage.local.remove(SESSION_TOKEN_KEY);
}

// ---------------------------------------------------------------------------
// D-4: never save 도메인 목록
// ---------------------------------------------------------------------------

const NEVER_SAVE_KEY = "secretbank_never_save_domains";

/** never save 도메인 목록을 읽는다. */
export async function getNeverSaveDomains(): Promise<string[]> {
  const result = await chrome.storage.local.get(NEVER_SAVE_KEY);
  const raw = result[NEVER_SAVE_KEY];
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is string => typeof v === "string");
}

/** 도메인을 never save 목록에 추가한다. 중복 무시. */
export async function addNeverSaveDomain(domain: string): Promise<void> {
  const existing = await getNeverSaveDomains();
  if (existing.includes(domain)) return;
  await chrome.storage.local.set({ [NEVER_SAVE_KEY]: [...existing, domain] });
}

// ---------------------------------------------------------------------------
// D-6: pending save — SaveBanner "Save" 클릭 시 popup 으로 전달할 임시 데이터
// ---------------------------------------------------------------------------

const PENDING_SAVE_KEY = "secretbank_pending_save";

/** SaveDialog 에 표시할 pending save 데이터 schema. */
export const PendingSaveSchema = z.object({
  /** 저장 종류: 신규 생성 또는 기존 업데이트 */
  kind: z.enum(["new", "update"]),
  domain: z.string().min(1),
  siteName: z.string(),
  username: z.string(),
  /** T-CRED-1: password plaintext — popup 닫힘 시 즉시 삭제 필수. */
  password: z.string(),
  /** 기존 credential ID (update 시 필수) */
  credentialId: z.string().optional(),
  /** resolve_issuer_for_domain 결과 (nm-host 가 반환한 issuer 이름) */
  issuerName: z.string().optional(),
  /** 저장 요청 시각 (ms) — 5분 TTL, 이후 자동 무효 */
  createdAt: z.number().int().positive(),
});

export type PendingSave = z.infer<typeof PendingSaveSchema>;

/** chrome.storage.local 에 pending save 를 기록한다. */
export async function setPendingSave(data: PendingSave): Promise<void> {
  await chrome.storage.local.set({ [PENDING_SAVE_KEY]: data });
}

/** chrome.storage.local 에서 pending save 를 읽는다. 5분 TTL 초과 시 null 반환. */
export async function getPendingSave(): Promise<PendingSave | null> {
  const result = await chrome.storage.local.get(PENDING_SAVE_KEY);
  const raw = result[PENDING_SAVE_KEY];
  if (raw === undefined || raw === null) return null;
  const parsed = PendingSaveSchema.safeParse(raw);
  if (!parsed.success) return null;
  // 5분 TTL 검사 — T-CRED-1: 만료된 pending save 는 삭제.
  if (Date.now() - parsed.data.createdAt > 5 * 60 * 1000) {
    await clearPendingSave();
    return null;
  }
  return parsed.data;
}

/** pending save 를 삭제한다. 저장/취소/TTL 만료 시 호출. T-CRED-1. */
export async function clearPendingSave(): Promise<void> {
  await chrome.storage.local.remove(PENDING_SAVE_KEY);
}

// ---------------------------------------------------------------------------
// G-4-2: MCP opt-in 응답 캐시 (chrome.storage.session — 탭/세션 범위)
// ---------------------------------------------------------------------------

/** MCP opt-in 캐시 엔트리 schema (chrome.storage.session) */
const MCP_OPT_IN_CACHE_KEY = "secretbank_mcp_opt_in_cache_v1";
const MCP_OPT_IN_CACHE_DEFAULT_TTL_MS = 5 * 60 * 1000; // 5분

interface McpOptInCache {
  enabled: boolean;
  expires_at: number;
}

/**
 * chrome.storage.session 에서 MCP opt-in 캐시를 읽는다.
 * 만료되었거나 없으면 null 반환.
 */
export async function getMcpOptInCache(): Promise<boolean | null> {
  try {
    const result = await chrome.storage.session.get(MCP_OPT_IN_CACHE_KEY);
    const raw = result[MCP_OPT_IN_CACHE_KEY] as McpOptInCache | undefined;
    if (raw === undefined || raw === null) return null;
    if (raw.expires_at < Date.now()) return null;
    return raw.enabled;
  } catch {
    return null;
  }
}

/**
 * chrome.storage.session 에 MCP opt-in 캐시를 저장한다.
 *
 * @param value opt-in 값 (true = ON)
 * @param ttl_ms TTL (기본 5분)
 */
export async function setMcpOptInCache(
  value: boolean,
  ttl_ms: number = MCP_OPT_IN_CACHE_DEFAULT_TTL_MS,
): Promise<void> {
  const entry: McpOptInCache = {
    enabled: value,
    expires_at: Date.now() + ttl_ms,
  };
  await chrome.storage.session.set({ [MCP_OPT_IN_CACHE_KEY]: entry });
}

// ---------------------------------------------------------------------------
// G-4-2: MCP 마지막 push 시각 캐시 (chrome.storage.session — host 별 cooldown)
// ---------------------------------------------------------------------------

/** MCP last push 타임스탬프 맵 키 (chrome.storage.session) */
const MCP_LAST_PUSH_KEY = "secretbank_mcp_last_push_v1";

/**
 * chrome.storage.session 에서 특정 host 의 마지막 push 시각(ms)을 읽는다.
 *
 * @param host 정규화된 hostname
 * @returns timestamp ms, 없으면 undefined
 */
export async function getMcpLastPush(host: string): Promise<number | undefined> {
  try {
    const result = await chrome.storage.session.get(MCP_LAST_PUSH_KEY);
    const map = result[MCP_LAST_PUSH_KEY] as Record<string, number> | undefined;
    if (!map || typeof map !== "object") return undefined;
    const ts = map[host];
    return typeof ts === "number" ? ts : undefined;
  } catch {
    return undefined;
  }
}

/**
 * chrome.storage.session 에 특정 host 의 마지막 push 시각을 기록한다.
 *
 * @param host 정규화된 hostname
 * @param timestamp_ms Unix ms
 */
export async function setMcpLastPush(host: string, timestamp_ms: number): Promise<void> {
  try {
    // 기존 맵을 읽어 merge (다른 host cooldown 보존)
    const result = await chrome.storage.session.get(MCP_LAST_PUSH_KEY);
    const existing = (result[MCP_LAST_PUSH_KEY] as Record<string, number> | undefined) ?? {};
    await chrome.storage.session.set({
      [MCP_LAST_PUSH_KEY]: { ...existing, [host]: timestamp_ms },
    });
  } catch {
    // session storage 실패 시 silent ignore (cooldown 없이 다음 push 허용)
  }
}
