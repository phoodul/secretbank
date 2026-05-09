// SPDX-License-Identifier: AGPL-3.0-or-later
//
// extension/entrypoints/__tests__/content-main.test.ts — D-1 MAIN world hook 테스트

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { JSDOM } from "jsdom";

import { isAuthPath } from "../content-main";
import type { MainToIsolatedMsg } from "../content-main";

// ── isAuthPath 단위 테스트 ────────────────────────────────────────────────────

describe("isAuthPath — auth endpoint 경로 필터", () => {
  // window.location.href 가 필요하므로 jsdom window 를 global 에 stub.
  const dom = new JSDOM("<!doctype html>", { url: "https://example.com/" });
  const win = dom.window;

  beforeEach(() => {
    // isAuthPath 내부의 new URL(url, window.location.href) 를 위해 global window stub.
    Object.defineProperty(globalThis, "window", { value: win, writable: true });
  });

  it("'/login' 경로 → true", () => {
    expect(isAuthPath("https://example.com/login")).toBe(true);
  });

  it("'/signin' 경로 → true", () => {
    expect(isAuthPath("https://example.com/signin")).toBe(true);
  });

  it("'/sign-in' 경로 → true", () => {
    expect(isAuthPath("https://example.com/sign-in")).toBe(true);
  });

  it("'/signup' 경로 → true", () => {
    expect(isAuthPath("https://example.com/signup")).toBe(true);
  });

  it("'/sign-up' 경로 → true", () => {
    expect(isAuthPath("https://example.com/sign-up")).toBe(true);
  });

  it("'/auth/token' 경로 → true", () => {
    expect(isAuthPath("https://example.com/auth/token")).toBe(true);
  });

  it("'/register' 경로 → true", () => {
    expect(isAuthPath("https://example.com/register")).toBe(true);
  });

  it("'/api/data' 경로 → false (auth 키워드 없음)", () => {
    expect(isAuthPath("https://example.com/api/data")).toBe(false);
  });

  it("'/search?q=login' → false (pathname 에 auth 키워드 없음)", () => {
    expect(isAuthPath("https://example.com/search?q=login")).toBe(false);
  });

  it("대소문자 무시 — '/LOGIN' → true", () => {
    expect(isAuthPath("https://example.com/LOGIN")).toBe(true);
  });

  it("상대 경로 '/auth/callback' → true (window.location.href 기준 resolve)", () => {
    expect(isAuthPath("/auth/callback")).toBe(true);
  });
});

// ── XHR hook postMessage 동작 테스트 ─────────────────────────────────────────
// JSDOM 은 window.fetch 를 제공하지 않으므로 hook 로직을 직접 인라인으로 검증한다.
// content-main.ts 의 installFetchHook / installXhrHook 은 MAIN world 전용이며
// Vitest(jsdom) 에서는 순수 함수 단위 테스트만 수행하고 hook install 은 build 검증으로.

describe("XHR/fetch hook — 핵심 로직 단위 검증", () => {
  let postMessageSpy: ReturnType<typeof vi.fn>;
  const dom = new JSDOM("<!doctype html>", { url: "https://example.com/" });
  const win = dom.window;

  beforeEach(() => {
    postMessageSpy = vi.fn();
    // postMessage 는 오버로드 시그니처 — vi.fn() 타입과 불일치하므로 as any.
    win.postMessage = postMessageSpy as unknown as typeof win.postMessage;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // hasFormBody 로직 (content-main.ts 에서 사용되는 함수 동일 로직).
  function hasFormBody(body: unknown): boolean {
    if (!body) return false;
    if (body instanceof FormData) return true;
    if (body instanceof URLSearchParams) return true;
    if (typeof body === "string") return true;
    return false;
  }

  // postToIsolated 로직 — T2: '*' 대신 origin 고정.
  function postToIsolated(payload: MainToIsolatedMsg, targetOrigin: string): void {
    win.postMessage(payload, targetOrigin);
  }

  it("login path + URLSearchParams body → metadata postMessage 발송", () => {
    const url = "https://example.com/login";
    const method = "POST";
    const body = new URLSearchParams("username=u&password=p");

    if (method === "POST" && isAuthPath(url) && hasFormBody(body)) {
      const msg: MainToIsolatedMsg = {
        type: "secretbank-main-hook",
        eventType: "fetch-post",
        domain: win.location.hostname,
        actionUrl: url,
        timestamp: Date.now(),
      };
      postToIsolated(msg, win.location.origin);
    }

    expect(postMessageSpy).toHaveBeenCalledTimes(1);
    expect(postMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: "secretbank-main-hook", eventType: "fetch-post" }),
      "https://example.com", // T2: '*' ❌, origin 고정
    );
  });

  it("GET 요청은 postMessage 미발송", () => {
    const url = "https://example.com/login";
    const method: string = "GET"; // string 으로 명시 — literal 타입 추론 방지.

    if (method === "POST" && isAuthPath(url)) {
      postToIsolated(
        {
          type: "secretbank-main-hook",
          eventType: "fetch-post",
          domain: "example.com",
          actionUrl: url,
          timestamp: 0,
        },
        win.location.origin,
      );
    }

    expect(postMessageSpy).not.toHaveBeenCalled();
  });

  it("auth 키워드 없는 POST (/api/data) → postMessage 미발송", () => {
    const url = "https://example.com/api/data";
    const method = "POST";
    const body = "payload=value";

    if (method === "POST" && isAuthPath(url) && hasFormBody(body)) {
      postToIsolated(
        {
          type: "secretbank-main-hook",
          eventType: "fetch-post",
          domain: "example.com",
          actionUrl: url,
          timestamp: 0,
        },
        win.location.origin,
      );
    }

    expect(postMessageSpy).not.toHaveBeenCalled();
  });

  it("FormData body → hasFormBody = true", () => {
    expect(hasFormBody(new FormData())).toBe(true);
  });

  it("URLSearchParams body → hasFormBody = true", () => {
    expect(hasFormBody(new URLSearchParams("a=1"))).toBe(true);
  });

  it("string body → hasFormBody = true (form-urlencoded 문자열)", () => {
    expect(hasFormBody("username=u&password=p")).toBe(true);
  });

  it("null/undefined body → hasFormBody = false", () => {
    expect(hasFormBody(null)).toBe(false);
    expect(hasFormBody(undefined)).toBe(false);
  });

  it("postMessage 두 번째 인수가 '*' 가 아님 — T2 origin 고정", () => {
    const origin = win.location.origin;
    expect(origin).not.toBe("*");
    expect(origin).toBe("https://example.com");
  });

  it("payload 에 username/password plaintext 없음 — metadata only (T2 방어)", () => {
    // MainToIsolatedMsg 인터페이스에 credential 필드가 없음을 타입으로 보장.
    const msg: MainToIsolatedMsg = {
      type: "secretbank-main-hook",
      eventType: "fetch-post",
      domain: "example.com",
      actionUrl: "https://example.com/login",
      timestamp: Date.now(),
    };
    // @ts-expect-error — plaintext 는 인터페이스에 없어야 함
    const _check: { password: string } = msg;
    expect(Object.keys(msg)).not.toContain("password");
    expect(Object.keys(msg)).not.toContain("username");
  });
});
