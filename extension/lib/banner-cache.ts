// SPDX-License-Identifier: AGPL-3.0-or-later
//
// extension/lib/banner-cache.ts — M24-E Phase G-2-2
//
// SupplyChainBanner 용 dismiss 큐 + incident 응답 캐시.
//
// 저장소: chrome.storage.local
//   dismissed_hosts: secretbank_supply_dismissed_v1 — Record<host, dismissed_at_unix_ms>
//   incident cache:  secretbank_supply_cache_v1     — Record<host, {response, expires_at}>

import type { NMMessageIncidentCheckForHostResponse } from "@secretbank/shared";

// ---------------------------------------------------------------------------
// 상수
// ---------------------------------------------------------------------------

const DISMISSED_KEY = "secretbank_supply_dismissed_v1";
const CACHE_KEY = "secretbank_supply_cache_v1";

const DISMISS_TTL_MS = 7 * 24 * 3600 * 1000; // 7일
const INCIDENT_CACHE_TTL_MS = 60 * 60 * 1000; // 1시간

// ---------------------------------------------------------------------------
// 내부 타입
// ---------------------------------------------------------------------------

type DismissedRecord = Record<string, number>; // host → dismissed_at_unix_ms

interface CachedIncidentEntry {
  response: NMMessageIncidentCheckForHostResponse;
  expires_at: number;
}

type CacheRecord = Record<string, CachedIncidentEntry>; // host → entry

// ---------------------------------------------------------------------------
// dismiss 큐
// ---------------------------------------------------------------------------

/**
 * dismiss 된 host 목록을 읽는다 (만료 항목 포함).
 */
async function _getDismissedRecord(): Promise<DismissedRecord> {
  const result = await chrome.storage.local.get(DISMISSED_KEY);
  const raw = result[DISMISSED_KEY];
  if (raw === null || raw === undefined || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }
  return raw as DismissedRecord;
}

/**
 * host 가 dismiss 상태인지 확인한다 (7일 TTL 적용).
 *
 * @returns true 이면 banner 미표시
 */
export async function isDismissed(host: string): Promise<boolean> {
  const record = await _getDismissedRecord();
  const dismissedAt = record[host];
  if (dismissedAt === undefined) return false;
  return Date.now() - dismissedAt < DISMISS_TTL_MS;
}

/**
 * host 를 dismiss 큐에 추가한다 (현재 시각으로 기록).
 */
export async function addDismissedHost(host: string): Promise<void> {
  const record = await _getDismissedRecord();
  record[host] = Date.now();
  await chrome.storage.local.set({ [DISMISSED_KEY]: record });
}

/**
 * 유효한(만료되지 않은) dismiss host 목록을 반환한다.
 */
export async function getDismissedHosts(): Promise<string[]> {
  const record = await _getDismissedRecord();
  const now = Date.now();
  return Object.entries(record)
    .filter(([, dismissedAt]) => now - dismissedAt < DISMISS_TTL_MS)
    .map(([host]) => host);
}

// ---------------------------------------------------------------------------
// incident 응답 캐시 (1h TTL)
// ---------------------------------------------------------------------------

/**
 * 캐시 레코드를 읽는다.
 */
async function _getCacheRecord(): Promise<CacheRecord> {
  const result = await chrome.storage.local.get(CACHE_KEY);
  const raw = result[CACHE_KEY];
  if (raw === null || raw === undefined || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }
  return raw as CacheRecord;
}

/**
 * host 의 캐시된 incident 응답을 읽는다.
 *
 * @returns 유효한 캐시 항목 또는 null (캐시 미스 / 만료)
 */
export async function getCachedIncidents(
  host: string,
): Promise<NMMessageIncidentCheckForHostResponse | null> {
  const record = await _getCacheRecord();
  const entry = record[host];
  if (entry === undefined) return null;
  if (entry.expires_at < Date.now()) return null;
  return entry.response;
}

/**
 * host 의 incident 응답을 캐시에 저장한다.
 *
 * @param ttl_ms TTL 밀리초 (기본 1시간)
 */
export async function setCachedIncidents(
  host: string,
  response: NMMessageIncidentCheckForHostResponse,
  ttl_ms: number = INCIDENT_CACHE_TTL_MS,
): Promise<void> {
  const record = await _getCacheRecord();
  record[host] = {
    response,
    expires_at: Date.now() + ttl_ms,
  };
  await chrome.storage.local.set({ [CACHE_KEY]: record });
}
