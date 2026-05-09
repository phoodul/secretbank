/**
 * @file storage.test.ts
 * @license AGPL-3.0-or-later
 *
 * B-5: chrome.storage.local typed wrapper 테스트.
 *
 * 검증 항목:
 *   1. getPairing — 데이터 없음 → null
 *   2. getPairing — 유효 데이터 → PairingStorage 반환
 *   3. getPairing — 스키마 불일치 → null (조용한 실패)
 *   4. setPairing — chrome.storage.local.set 호출 검증
 *   5. clearPairing — chrome.storage.local.remove 호출 검증
 *   6. round-trip: setPairing → getPairing
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { getPairing, setPairing, clearPairing, type PairingStorage } from "../storage.js";

// ---------------------------------------------------------------------------
// chrome.storage.local mock
// ---------------------------------------------------------------------------

/** 인메모리 스토어 */
let memStore: Record<string, unknown> = {};

function setupStorageMock() {
  (globalThis.chrome.storage.local as unknown as Record<string, unknown>).get = vi.fn(
    async (keys: string | string[] | Record<string, unknown>) => {
      if (typeof keys === "string") {
        return { [keys]: memStore[keys] };
      }
      if (Array.isArray(keys)) {
        const result: Record<string, unknown> = {};
        for (const k of keys) result[k] = memStore[k];
        return result;
      }
      // Record 형태
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
      const list = Array.isArray(keys) ? keys : [keys];
      for (const k of list) delete memStore[k];
    },
  );
}

// ---------------------------------------------------------------------------
// 유효한 PairingStorage 샘플
// ---------------------------------------------------------------------------

const VALID_PAIRING: PairingStorage = {
  extensionPriv: "dGVzdC1wcml2YXRlLWtleS1iYXNlNjQ=", // base64 dummy
  desktopPub: "dGVzdC1kZXNrdG9wLXB1Yi1iYXNlNjQ=",
  deviceId: "desktop-device-123",
  pairedAt: 1700000000000,
};

// ---------------------------------------------------------------------------
// 테스트
// ---------------------------------------------------------------------------

describe("storage — getPairing", () => {
  beforeEach(() => {
    memStore = {};
    setupStorageMock();
    vi.clearAllMocks();
    // vi.clearAllMocks 가 mock 함수를 리셋하므로 재설정
    setupStorageMock();
  });

  it("저장 데이터가 없으면 null 을 반환한다", async () => {
    const result = await getPairing();
    expect(result).toBeNull();
  });

  it("유효한 PairingStorage 가 있으면 파싱하여 반환한다", async () => {
    memStore["pairing"] = VALID_PAIRING;

    const result = await getPairing();
    expect(result).toEqual(VALID_PAIRING);
  });

  it("스키마 불일치(누락 필드) 시 null 을 반환한다 (조용한 실패)", async () => {
    // deviceId 누락
    memStore["pairing"] = {
      extensionPriv: "abc",
      desktopPub: "def",
      pairedAt: 1700000000000,
    };

    const result = await getPairing();
    expect(result).toBeNull();
  });

  it("스키마 불일치(잘못된 타입) 시 null 을 반환한다", async () => {
    // pairedAt 이 음수 (positive 아님)
    memStore["pairing"] = {
      extensionPriv: "abc",
      desktopPub: "def",
      deviceId: "dev",
      pairedAt: -1,
    };

    const result = await getPairing();
    expect(result).toBeNull();
  });

  it("chrome.storage.local.get 을 'pairing' 키로 호출한다", async () => {
    const getSpy = globalThis.chrome.storage.local.get as ReturnType<typeof vi.fn>;
    await getPairing();
    expect(getSpy).toHaveBeenCalledWith("pairing");
  });
});

describe("storage — setPairing", () => {
  beforeEach(() => {
    memStore = {};
    setupStorageMock();
    vi.clearAllMocks();
    setupStorageMock();
  });

  it("chrome.storage.local.set 을 올바른 키-값으로 호출한다", async () => {
    const setSpy = globalThis.chrome.storage.local.set as ReturnType<typeof vi.fn>;
    await setPairing(VALID_PAIRING);
    expect(setSpy).toHaveBeenCalledWith({ pairing: VALID_PAIRING });
  });

  it("setPairing 후 getPairing 으로 동일 데이터를 읽을 수 있다 (round-trip)", async () => {
    await setPairing(VALID_PAIRING);
    const result = await getPairing();
    expect(result).toEqual(VALID_PAIRING);
  });
});

describe("storage — clearPairing", () => {
  beforeEach(() => {
    memStore = {};
    setupStorageMock();
    vi.clearAllMocks();
    setupStorageMock();
  });

  it("chrome.storage.local.remove 를 'pairing' 키로 호출한다", async () => {
    const removeSpy = globalThis.chrome.storage.local.remove as ReturnType<typeof vi.fn>;
    await clearPairing();
    expect(removeSpy).toHaveBeenCalledWith("pairing");
  });

  it("clearPairing 후 getPairing 은 null 을 반환한다", async () => {
    await setPairing(VALID_PAIRING);
    await clearPairing();
    const result = await getPairing();
    expect(result).toBeNull();
  });
});
