// SPDX-License-Identifier: AGPL-3.0-or-later
//
// extension/lib/idb-cache.ts — M24-E Phase E-3
//
// IndexedDB 기반 KV 캐시 헬퍼.
// DB: secretbank-cache-v1 / store: kv / TTL: 24h(86400000ms)
// IDB 사용 불가(Safari private mode 등)시 chrome.storage.local 보조 캐시로 fallback.

const DB_NAME = "secretbank-cache-v1";
const STORE_NAME = "kv";
const DB_VERSION = 1;

// ---------------------------------------------------------------------------
// IndexedDB 내부 헬퍼
// ---------------------------------------------------------------------------

interface CacheEntry<T> {
  value: T;
  expires_at: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise !== null) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = (e) => resolve((e.target as IDBOpenDBRequest).result);
    req.onerror = () => {
      dbPromise = null;
      reject(req.error);
    };
  });
  return dbPromise;
}

async function idbGetRaw<T>(key: string): Promise<CacheEntry<T> | null> {
  const db = await openDb();
  return new Promise<CacheEntry<T> | null>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = () => resolve((req.result as CacheEntry<T>) ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function idbSetRaw<T>(key: string, entry: CacheEntry<T>): Promise<void> {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const req = tx.objectStore(STORE_NAME).put(entry, key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// ---------------------------------------------------------------------------
// chrome.storage.local 보조 캐시 (IDB 실패 시 fallback)
// ---------------------------------------------------------------------------

const STORAGE_PREFIX = "idbcache:";

async function storageGet<T>(key: string): Promise<CacheEntry<T> | null> {
  try {
    const result = await chrome.storage.local.get(STORAGE_PREFIX + key);
    const raw = result[STORAGE_PREFIX + key];
    if (raw == null) return null;
    return raw as CacheEntry<T>;
  } catch {
    return null;
  }
}

async function storageSet<T>(key: string, entry: CacheEntry<T>): Promise<void> {
  try {
    await chrome.storage.local.set({ [STORAGE_PREFIX + key]: entry });
  } catch {
    // 보조 캐시 저장 실패는 무시
  }
}

// ---------------------------------------------------------------------------
// 공개 API
// ---------------------------------------------------------------------------

/**
 * 캐시에서 값을 읽는다.
 * 만료된 항목은 null 반환 (TTL 검사는 호출자 책임이지만 여기서도 검사).
 */
export async function idbGet<T>(key: string): Promise<CacheEntry<T> | null> {
  // IDB 우선 시도
  try {
    const entry = await idbGetRaw<T>(key);
    if (entry === null) return null;
    if (entry.expires_at < Date.now()) return null;
    return entry;
  } catch {
    // IDB 실패 → chrome.storage.local fallback
  }
  const entry = await storageGet<T>(key);
  if (entry === null) return null;
  if (entry.expires_at < Date.now()) return null;
  return entry;
}

/**
 * 캐시에 값을 저장한다.
 * @param key   캐시 키
 * @param value 저장할 값
 * @param ttl_ms TTL 밀리초 (기본 86400000 = 24h)
 */
export async function idbSet<T>(
  key: string,
  value: T,
  ttl_ms: number = 86_400_000,
): Promise<void> {
  const entry: CacheEntry<T> = {
    value,
    expires_at: Date.now() + ttl_ms,
  };
  // IDB 먼저 저장
  try {
    await idbSetRaw(key, entry);
    return;
  } catch {
    // IDB 실패 → chrome.storage.local fallback
  }
  await storageSet(key, entry);
}

/** 테스트 / 재접속 시 DB 인스턴스 재설정. */
export function _resetDbForTest(): void {
  dbPromise = null;
}
