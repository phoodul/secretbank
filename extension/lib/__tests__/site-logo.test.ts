// SPDX-License-Identifier: AGPL-3.0-or-later
//
// extension/lib/__tests__/site-logo.test.ts — M24-E Phase E-3
//
// Site Logo fallback chain 테스트.
// bundled SVG → favicon-proxy(캐시) → letter fallback

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { getSiteLogo, domainToSlug } from "../site-logo.js";
import { _resetDbForTest } from "../idb-cache.js";

// ---------------------------------------------------------------------------
// 환경 준비
// ---------------------------------------------------------------------------

beforeEach(() => {
  (globalThis as unknown as Record<string, unknown>).indexedDB = new IDBFactory();
  _resetDbForTest();

  // chrome.runtime.getURL mock
  (globalThis.chrome as unknown as Record<string, unknown>).runtime = {
    ...(globalThis.chrome.runtime ?? {}),
    getURL: (path: string) => `chrome-extension://fakeid/${path}`,
  };
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// domainToSlug 단위 테스트
// ---------------------------------------------------------------------------

describe("domainToSlug", () => {
  it("github.com → github", () => expect(domainToSlug("github.com")).toBe("github"));
  it("api.github.com → github", () => expect(domainToSlug("api.github.com")).toBe("github"));
  it("www.github.com → github", () => expect(domainToSlug("www.github.com")).toBe("github"));
  it("api.openai.com → openai", () => expect(domainToSlug("api.openai.com")).toBe("openai"));
  it("stripe.com → stripe", () => expect(domainToSlug("stripe.com")).toBe("stripe"));
  it("supabase.io → supabase", () => expect(domainToSlug("supabase.io")).toBe("supabase"));
  it("https://github.com/path → github", () =>
    expect(domainToSlug("https://github.com/path")).toBe("github"));
  it("github.com:443 → github", () => expect(domainToSlug("github.com:443")).toBe("github"));
});

// ---------------------------------------------------------------------------
// bundled SVG fallback (preset slug)
// ---------------------------------------------------------------------------

describe("getSiteLogo — bundled", () => {
  it("github.com 는 bundled SVG 반환", async () => {
    const result = await getSiteLogo("github.com");
    expect(result.kind).toBe("bundled");
    expect(result.url).toContain("icons/issuers/github.svg");
  });

  it("api.github.com 도 bundled SVG 반환 (slug 동일)", async () => {
    const result = await getSiteLogo("api.github.com");
    expect(result.kind).toBe("bundled");
  });

  it("google.com 는 bundled SVG 반환", async () => {
    const result = await getSiteLogo("google.com");
    expect(result.kind).toBe("bundled");
    expect(result.url).toContain("google.svg");
  });

  it("stripe.com 는 bundled SVG 반환", async () => {
    const result = await getSiteLogo("stripe.com");
    expect(result.kind).toBe("bundled");
  });
});

// ---------------------------------------------------------------------------
// favicon-proxy fallback (mock fetch)
// ---------------------------------------------------------------------------

describe("getSiteLogo — remote favicon", () => {
  it("preset 아닌 도메인 + 유효한 favicon → kind=remote, data URL 반환", async () => {
    const fakeBlob = new Blob(["<fake-png-data>".repeat(20)], { type: "image/png" });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(fakeBlob),
      }),
    );

    const result = await getSiteLogo("example.com");
    expect(result.kind).toBe("remote");
    expect(result.url).toMatch(/^data:image\/png/);
  });

  it("favicon fetch 실패(4xx) → letter fallback", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        blob: () => Promise.resolve(new Blob([], { type: "image/png" })),
      }),
    );

    const result = await getSiteLogo("nofavicon.example");
    expect(result.kind).toBe("letter");
    expect(result.letter).toBeTruthy();
    expect(result.bg).toMatch(/^oklch/);
  });

  it("favicon fetch timeout(AbortError) → letter fallback", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new DOMException("Aborted", "AbortError")),
    );

    const result = await getSiteLogo("slow.example");
    expect(result.kind).toBe("letter");
  });

  it("1×1 PNG (size < 200) → letter fallback", async () => {
    const tinyBlob = new Blob(["x"], { type: "image/png" }); // size=1 < 200
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(tinyBlob),
      }),
    );

    const result = await getSiteLogo("noicon.example");
    expect(result.kind).toBe("letter");
  });

  it("favicon 캐시 hit — fetch 두 번째 호출 시 fetch 미호출", async () => {
    const fakeBlob = new Blob(["<fake-icon-data>".repeat(20)], { type: "image/png" });
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(fakeBlob),
    });
    vi.stubGlobal("fetch", mockFetch);

    // 첫 호출 — cache miss → fetch 호출
    const r1 = await getSiteLogo("cached.example");
    expect(r1.kind).toBe("remote");
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // 두 번째 호출 — cache hit → fetch 미호출
    const r2 = await getSiteLogo("cached.example");
    expect(r2.kind).toBe("remote");
    expect(mockFetch).toHaveBeenCalledTimes(1); // 추가 호출 없음
  });
});

// ---------------------------------------------------------------------------
// letter fallback
// ---------------------------------------------------------------------------

describe("getSiteLogo — letter fallback", () => {
  it("letter 는 대문자 단일 문자", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network error")),
    );
    const result = await getSiteLogo("unknown.xyz");
    expect(result.kind).toBe("letter");
    expect(result.letter).toMatch(/^[A-Z]$/);
  });

  it("bg 는 oklch CSS 값", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network error")),
    );
    const result = await getSiteLogo("myapp.io");
    expect(result.bg).toMatch(/^oklch\(/);
  });

  it("같은 도메인은 항상 같은 bg 반환 (결정적)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network error")),
    );
    const r1 = await getSiteLogo("deterministic.com");
    _resetDbForTest(); // 캐시 리셋
    (globalThis as unknown as Record<string, unknown>).indexedDB = new IDBFactory();
    const r2 = await getSiteLogo("deterministic.com");
    expect(r1.bg).toBe(r2.bg);
    expect(r1.letter).toBe(r2.letter);
  });

  it("다른 도메인은 다른 bg (대부분)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network error")),
    );
    const r1 = await getSiteLogo("aaa.com");
    const r2 = await getSiteLogo("zzz.com");
    // 해시 충돌 가능성 있으나 이 두 도메인은 다른 hue
    expect(r1.bg).not.toBe(r2.bg);
  });
});

// ---------------------------------------------------------------------------
// Privacy 검증 — fetch 호출 시 user_id / session_token 미포함
// ---------------------------------------------------------------------------

describe("Privacy", () => {
  it("favicon fetch URL 에 host 만 포함, 사용자 정보 없음", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      blob: () => Promise.resolve(new Blob([], { type: "image/png" })),
    });
    vi.stubGlobal("fetch", fetchMock);

    await getSiteLogo("privacy-check.example");

    if (fetchMock.mock.calls.length > 0) {
      const url = fetchMock.mock.calls[0]![0] as string;
      expect(url).toContain("privacy-check.example");
      expect(url).not.toContain("user_id");
      expect(url).not.toContain("session");
      expect(url).not.toContain("token");
      expect(url).not.toContain("vault");
    }
  });

  it("fetch 옵션에 credentials: omit 설정", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      blob: () => Promise.resolve(new Blob([], { type: "image/png" })),
    });
    vi.stubGlobal("fetch", fetchMock);

    await getSiteLogo("credentials-check.example");

    if (fetchMock.mock.calls.length > 0) {
      const options = fetchMock.mock.calls[0]![1] as RequestInit;
      expect(options.credentials).toBe("omit");
    }
  });
});
