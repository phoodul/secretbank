// SPDX-License-Identifier: AGPL-3.0-or-later
//
// extension/lib/__tests__/banner-cache.test.ts — M24-E Phase G-2-2

import { describe, it, expect, vi, beforeEach } from "vitest";

// chrome.storage.local mock — vitest-setup.ts 에서 전역으로 주입되지만
// 테스트별 상태 격리를 위해 여기서 직접 제어한다.

function makeStorageMock() {
  const store: Record<string, unknown> = {};
  return {
    _store: store,
    get: vi.fn(async (key: string | string[]) => {
      const keys = Array.isArray(key) ? key : [key];
      const result: Record<string, unknown> = {};
      for (const k of keys) {
        if (k in store) result[k] = store[k];
      }
      return result;
    }),
    set: vi.fn(async (items: Record<string, unknown>) => {
      Object.assign(store, items);
    }),
    remove: vi.fn(async (keys: string | string[]) => {
      const ks = Array.isArray(keys) ? keys : [keys];
      for (const k of ks) delete store[k];
    }),
    clear: vi.fn(async () => {
      for (const k of Object.keys(store)) delete store[k];
    }),
  };
}

describe("banner-cache — dismiss 큐 (7일 TTL)", () => {
  let storageMock: ReturnType<typeof makeStorageMock>;

  beforeEach(async () => {
    storageMock = makeStorageMock();
    // chrome.storage.local 만 스텁으로 교체
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis.chrome.storage as any).local = storageMock;
    // 모듈 캐시 초기화 (import 재실행)
    vi.resetModules();
  });

  it("addDismissedHost + isDismissed → true 반환", async () => {
    const { addDismissedHost, isDismissed } = await import("../banner-cache");
    await addDismissedHost("github.com");
    expect(await isDismissed("github.com")).toBe(true);
  });

  it("dismiss 되지 않은 host → isDismissed false", async () => {
    const { isDismissed } = await import("../banner-cache");
    expect(await isDismissed("stripe.com")).toBe(false);
  });

  it("7일 TTL 만료 후 isDismissed false", async () => {
    const { addDismissedHost, isDismissed } = await import("../banner-cache");

    // 8일 전으로 시간 조작
    const past = Date.now() - 8 * 24 * 3600 * 1000;
    vi.spyOn(Date, "now").mockReturnValueOnce(past);
    await addDismissedHost("lastpass.com");
    vi.restoreAllMocks();

    expect(await isDismissed("lastpass.com")).toBe(false);
  });

  it("6일 후에는 아직 dismiss 유효", async () => {
    const { addDismissedHost, isDismissed } = await import("../banner-cache");

    const past = Date.now() - 6 * 24 * 3600 * 1000;
    vi.spyOn(Date, "now").mockReturnValueOnce(past);
    await addDismissedHost("openai.com");
    vi.restoreAllMocks();

    expect(await isDismissed("openai.com")).toBe(true);
  });

  it("getDismissedHosts — 만료되지 않은 host 만 반환", async () => {
    const { addDismissedHost, getDismissedHosts } = await import("../banner-cache");

    // 유효한 dismiss
    await addDismissedHost("github.com");

    // 8일 전 dismiss (만료됨)
    const past = Date.now() - 8 * 24 * 3600 * 1000;
    vi.spyOn(Date, "now").mockReturnValueOnce(past);
    await addDismissedHost("old-site.com");
    vi.restoreAllMocks();

    const hosts = await getDismissedHosts();
    expect(hosts).toContain("github.com");
    expect(hosts).not.toContain("old-site.com");
  });

  it("여러 host 를 각각 dismiss 가능", async () => {
    const { addDismissedHost, isDismissed } = await import("../banner-cache");

    await addDismissedHost("github.com");
    await addDismissedHost("stripe.com");

    expect(await isDismissed("github.com")).toBe(true);
    expect(await isDismissed("stripe.com")).toBe(true);
    expect(await isDismissed("openai.com")).toBe(false);
  });
});

describe("banner-cache — incident 응답 캐시 (1h TTL)", () => {
  let storageMock: ReturnType<typeof makeStorageMock>;

  beforeEach(async () => {
    storageMock = makeStorageMock();
    // chrome.storage.local 만 스텁으로 교체
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis.chrome.storage as any).local = storageMock;
    vi.resetModules();
  });

  const mockResponse = {
    type: "incident_check_for_host_response" as const,
    ok: true,
    matches: [
      {
        incident_id: "01HZ_TEST",
        severity: "high" as const,
        title: "Test CVE",
        published_at: Date.now() - 86400000,
        source: "nvd" as const,
      },
    ],
  };

  it("setCachedIncidents + getCachedIncidents → 캐시 히트", async () => {
    const { setCachedIncidents, getCachedIncidents } = await import("../banner-cache");

    await setCachedIncidents("github.com", mockResponse);
    const cached = await getCachedIncidents("github.com");

    expect(cached).not.toBeNull();
    expect(cached?.ok).toBe(true);
    expect(cached?.matches?.[0]?.severity).toBe("high");
  });

  it("캐시 없는 host → null 반환", async () => {
    const { getCachedIncidents } = await import("../banner-cache");
    expect(await getCachedIncidents("unknown.com")).toBeNull();
  });

  it("1시간 TTL 만료 후 null 반환", async () => {
    const { setCachedIncidents, getCachedIncidents } = await import("../banner-cache");

    // 2시간 전에 캐시 저장 (1h TTL)
    const past = Date.now() - 2 * 3600 * 1000;
    vi.spyOn(Date, "now").mockReturnValueOnce(past);
    await setCachedIncidents("github.com", mockResponse, 3600_000);
    vi.restoreAllMocks();

    // 현재 시간에 조회 → 만료됨
    expect(await getCachedIncidents("github.com")).toBeNull();
  });

  it("30분 후에는 캐시 유효", async () => {
    const { setCachedIncidents, getCachedIncidents } = await import("../banner-cache");

    const past = Date.now() - 30 * 60 * 1000;
    vi.spyOn(Date, "now").mockReturnValueOnce(past);
    await setCachedIncidents("github.com", mockResponse, 3600_000);
    vi.restoreAllMocks();

    expect(await getCachedIncidents("github.com")).not.toBeNull();
  });

  it("커스텀 TTL 적용 가능", async () => {
    const { setCachedIncidents, getCachedIncidents } = await import("../banner-cache");

    const past = Date.now() - 500;
    vi.spyOn(Date, "now").mockReturnValueOnce(past);
    // TTL = 200ms → 500ms 후 만료
    await setCachedIncidents("github.com", mockResponse, 200);
    vi.restoreAllMocks();

    expect(await getCachedIncidents("github.com")).toBeNull();
  });

  it("여러 host 캐시 독립 동작", async () => {
    const { setCachedIncidents, getCachedIncidents } = await import("../banner-cache");

    await setCachedIncidents("github.com", mockResponse);
    await setCachedIncidents("stripe.com", { ...mockResponse, ok: false });

    const github = await getCachedIncidents("github.com");
    const stripe = await getCachedIncidents("stripe.com");

    expect(github?.ok).toBe(true);
    expect(stripe?.ok).toBe(false);
  });
});
