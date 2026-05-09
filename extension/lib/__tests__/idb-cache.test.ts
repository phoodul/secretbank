// SPDX-License-Identifier: AGPL-3.0-or-later
//
// extension/lib/__tests__/idb-cache.test.ts — M24-E Phase E-3
//
// IndexedDB 캐시 헬퍼 테스트.
// fake-indexeddb 를 사용해 jsdom 환경에서 IDB 를 시뮬레이션.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { idbGet, idbSet, _resetDbForTest } from "../idb-cache.js";

// ---------------------------------------------------------------------------
// fake-indexeddb 주입
// ---------------------------------------------------------------------------

beforeEach(() => {
  // 각 테스트마다 새 IDB 인스턴스 사용
  (globalThis as unknown as Record<string, unknown>).indexedDB = new IDBFactory();
  _resetDbForTest();
});

// ---------------------------------------------------------------------------
// chrome.storage.local 보조 캐시 mock (IDB 실패 시 사용)
// ---------------------------------------------------------------------------

let memStore: Record<string, unknown> = {};

beforeEach(() => {
  memStore = {};
  (globalThis.chrome.storage.local as unknown as Record<string, unknown>).get = vi.fn(
    async (keys: string | string[] | Record<string, unknown>) => {
      if (typeof keys === "string") return { [keys]: memStore[keys] };
      if (Array.isArray(keys)) {
        const result: Record<string, unknown> = {};
        for (const k of keys) result[k] = memStore[k];
        return result;
      }
      const result: Record<string, unknown> = {};
      for (const k of Object.keys(keys)) result[k] = memStore[k];
      return result;
    },
  );
  (globalThis.chrome.storage.local as unknown as Record<string, unknown>).set = vi.fn(
    async (items: Record<string, unknown>) => {
      Object.assign(memStore, items);
    },
  );
  (globalThis.chrome.storage.local as unknown as Record<string, unknown>).remove = vi.fn(
    async (keys: string | string[]) => {
      const ks = Array.isArray(keys) ? keys : [keys];
      for (const k of ks) delete memStore[k];
    },
  );
});

// ---------------------------------------------------------------------------
// 테스트
// ---------------------------------------------------------------------------

describe("idbGet / idbSet", () => {
  it("캐시 miss — 저장되지 않은 키는 null 반환", async () => {
    const result = await idbGet("nonexistent");
    expect(result).toBeNull();
  });

  it("캐시 hit — 저장 후 동일 키로 읽으면 값 반환", async () => {
    await idbSet("testkey", { data: "hello" }, 60_000);
    const result = await idbGet<{ data: string }>("testkey");
    expect(result).not.toBeNull();
    expect(result!.value.data).toBe("hello");
  });

  it("TTL 만료 — expires_at 이 지난 항목은 null 반환", async () => {
    // 이미 만료된 TTL (-1ms) 로 저장
    await idbSet("expired-key", "stale-value", -1);
    const result = await idbGet("expired-key");
    expect(result).toBeNull();
  });

  it("expires_at 이 미래이면 값 반환", async () => {
    await idbSet("future-key", 42, 86_400_000);
    const result = await idbGet<number>("future-key");
    expect(result).not.toBeNull();
    expect(result!.value).toBe(42);
    expect(result!.expires_at).toBeGreaterThan(Date.now());
  });

  it("다른 키는 서로 영향 없음", async () => {
    await idbSet("key-a", "value-a", 60_000);
    await idbSet("key-b", "value-b", 60_000);

    const a = await idbGet<string>("key-a");
    const b = await idbGet<string>("key-b");

    expect(a!.value).toBe("value-a");
    expect(b!.value).toBe("value-b");
  });

  it("덮어쓰기 — 같은 키에 새 값 저장 시 이전 값 교체", async () => {
    await idbSet("overwrite-key", "first", 60_000);
    await idbSet("overwrite-key", "second", 60_000);
    const result = await idbGet<string>("overwrite-key");
    expect(result!.value).toBe("second");
  });
});

describe("chrome.storage.local fallback (IDB 실패 시)", () => {
  it("IDB 사용 불가 시 chrome.storage.local 에 저장", async () => {
    // IDB 를 broken 으로 교체
    (globalThis as unknown as Record<string, unknown>).indexedDB = {
      open: () => {
        const req = {} as unknown as IDBOpenDBRequest;
        setTimeout(() => {
          (req as unknown as { error: DOMException | null }).error = new DOMException(
            "IDB disabled",
          );
          if (req.onerror) {
            req.onerror(new Event("error"));
          }
        }, 0);
        return req;
      },
    };
    _resetDbForTest();

    await idbSet("fallback-key", "fallback-value", 60_000);
    // chrome.storage.local 에 저장되었는지 확인
    const stored = Object.entries(memStore).find(([k]) => k.includes("fallback-key"));
    expect(stored).toBeTruthy();
  });
});
