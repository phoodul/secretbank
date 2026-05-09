// SPDX-License-Identifier: AGPL-3.0-or-later
//
// extension/lib/__tests__/world-bridge.test.ts — D-2 world-bridge 단위 테스트

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { JSDOM } from "jsdom";

import { postToWorld, installWorldListener } from "../world-bridge";
import type { WorldBridgePayload } from "../world-bridge";

// ── fixture ─────────────────────────────────────────────────────────────────

const VALID_PAYLOAD: WorldBridgePayload = {
  kind: "fetch-post",
  domain: "example.com",
  actionUrl: "https://example.com/login",
  timestamp: 1234567890,
};

const XHR_PAYLOAD: WorldBridgePayload = {
  kind: "xhr-post",
  domain: "example.com",
  actionUrl: "https://example.com/signin",
  timestamp: 1234567891,
};

const FORM_PAYLOAD: WorldBridgePayload = {
  kind: "form-submit",
  domain: "example.com",
  actionUrl: "https://example.com/auth",
  timestamp: 1234567892,
};

// ── postToWorld 테스트 ────────────────────────────────────────────────────────

describe("postToWorld — target origin 강제 (T2 방어)", () => {
  let dom: JSDOM;
  let win: JSDOM["window"];
  let postMessageSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    dom = new JSDOM("<!doctype html>", { url: "https://example.com/" });
    win = dom.window;
    postMessageSpy = vi.fn();
    win.postMessage = postMessageSpy as unknown as typeof win.postMessage;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("두 번째 인수가 항상 win.location.origin 으로 고정됨 — '*' 불가", () => {
    postToWorld(VALID_PAYLOAD, win as unknown as Window);

    expect(postMessageSpy).toHaveBeenCalledTimes(1);
    const [, targetOrigin] = postMessageSpy.mock.calls[0] as [unknown, string];
    expect(targetOrigin).toBe("https://example.com");
    expect(targetOrigin).not.toBe("*");
  });

  it("payload 가 그대로 첫 번째 인수로 전달됨", () => {
    postToWorld(VALID_PAYLOAD, win as unknown as Window);

    expect(postMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "fetch-post", domain: "example.com" }),
      "https://example.com",
    );
  });

  it("xhr-post payload 도 origin 고정으로 전달됨", () => {
    postToWorld(XHR_PAYLOAD, win as unknown as Window);

    const [, targetOrigin] = postMessageSpy.mock.calls[0] as [unknown, string];
    expect(targetOrigin).toBe("https://example.com");
    expect(targetOrigin).not.toBe("*");
  });

  it("사용자가 임의 string 을 두 번째 인수로 전달하는 경로 존재하지 않음 — 시그니처에 targetOrigin 파라미터 없음", () => {
    // postToWorld(payload, win) — 세 번째 파라미터로 targetOrigin 을 넘길 수 없음을
    // 타입 레벨에서 검증 (호출 시 인수 개수가 2개가 최대).
    // @ts-expect-error — 세 번째 인수는 존재하지 않아야 함
    postToWorld(VALID_PAYLOAD, win as unknown as Window, "https://evil.com");
  });
});

// ── installWorldListener 테스트 ───────────────────────────────────────────────

describe("installWorldListener — origin + source 이중 검증 (T2 방어)", () => {
  let dom: JSDOM;
  let win: JSDOM["window"];

  beforeEach(() => {
    dom = new JSDOM(`<!doctype html><html><body></body></html>`, { url: "https://example.com/" });
    win = dom.window;
  });

  /**
   * win 에 MessageEvent 를 dispatch 하는 헬퍼.
   * source 를 명시하지 않으면 jsdom MessageEventInit 기본값(null) 이 사용됨.
   */
  function dispatchMessage(
    payload: unknown,
    origin = "https://example.com",
    source?: EventTarget | null,
  ): void {
    const event = new win.MessageEvent("message", {
      data: payload,
      origin,
      source: source as MessageEventSource | null | undefined,
    });
    win.dispatchEvent(event);
  }

  it("정상 origin + source=win → handler 호출 + payload 전달", () => {
    const received: WorldBridgePayload[] = [];
    const stop = installWorldListener((p) => received.push(p), win as unknown as Window);

    // source 를 win 으로 설정해야 event.source === win 검증 통과.
    dispatchMessage(VALID_PAYLOAD, "https://example.com", win);

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual(VALID_PAYLOAD);
    stop();
  });

  it("origin mismatch → handler 미호출 (T2 방어)", () => {
    const received: WorldBridgePayload[] = [];
    const stop = installWorldListener((p) => received.push(p), win as unknown as Window);

    dispatchMessage(VALID_PAYLOAD, "https://evil.com", win);

    expect(received).toHaveLength(0);
    stop();
  });

  it("source !== win (iframe/opener) → handler 미호출 (T2 방어)", () => {
    const received: WorldBridgePayload[] = [];
    const stop = installWorldListener((p) => received.push(p), win as unknown as Window);

    // source 를 null 로 보내면 event.source !== win → drop.
    dispatchMessage(VALID_PAYLOAD, "https://example.com", null);

    expect(received).toHaveLength(0);
    stop();
  });

  it("payload kind 누락 → handler 미호출 (런타임 검증 실패)", () => {
    const received: WorldBridgePayload[] = [];
    const stop = installWorldListener((p) => received.push(p), win as unknown as Window);

    dispatchMessage(
      { domain: "example.com", actionUrl: "https://example.com/login", timestamp: 0 },
      "https://example.com",
      win,
    );

    expect(received).toHaveLength(0);
    stop();
  });

  it("payload kind 알 수 없음 → handler 미호출 (런타임 검증 실패)", () => {
    const received: WorldBridgePayload[] = [];
    const stop = installWorldListener((p) => received.push(p), win as unknown as Window);

    dispatchMessage(
      {
        kind: "unknown-event",
        domain: "example.com",
        actionUrl: "https://example.com/",
        timestamp: 0,
      },
      "https://example.com",
      win,
    );

    expect(received).toHaveLength(0);
    stop();
  });

  it("payload domain 필드 누락 → handler 미호출", () => {
    const received: WorldBridgePayload[] = [];
    const stop = installWorldListener((p) => received.push(p), win as unknown as Window);

    dispatchMessage(
      { kind: "fetch-post", actionUrl: "https://example.com/login", timestamp: 0 },
      "https://example.com",
      win,
    );

    expect(received).toHaveLength(0);
    stop();
  });

  it("payload timestamp 누락 → handler 미호출", () => {
    const received: WorldBridgePayload[] = [];
    const stop = installWorldListener((p) => received.push(p), win as unknown as Window);

    dispatchMessage(
      { kind: "fetch-post", domain: "example.com", actionUrl: "https://example.com/login" },
      "https://example.com",
      win,
    );

    expect(received).toHaveLength(0);
    stop();
  });

  it("stop() 후 메시지 → handler 미호출", () => {
    const received: WorldBridgePayload[] = [];
    const stop = installWorldListener((p) => received.push(p), win as unknown as Window);
    stop();

    dispatchMessage(VALID_PAYLOAD, "https://example.com", win);

    expect(received).toHaveLength(0);
  });

  it("xhr-post payload 도 정상 처리", () => {
    const received: WorldBridgePayload[] = [];
    const stop = installWorldListener((p) => received.push(p), win as unknown as Window);

    dispatchMessage(XHR_PAYLOAD, "https://example.com", win);

    expect(received).toHaveLength(1);
    expect((received[0] as Extract<WorldBridgePayload, { kind: "xhr-post" }>).kind).toBe(
      "xhr-post",
    );
    stop();
  });

  it("form-submit payload 도 정상 처리", () => {
    const received: WorldBridgePayload[] = [];
    const stop = installWorldListener((p) => received.push(p), win as unknown as Window);

    dispatchMessage(FORM_PAYLOAD, "https://example.com", win);

    expect(received).toHaveLength(1);
    expect((received[0] as Extract<WorldBridgePayload, { kind: "form-submit" }>).kind).toBe(
      "form-submit",
    );
    stop();
  });

  it("null payload → handler 미호출", () => {
    const received: WorldBridgePayload[] = [];
    const stop = installWorldListener((p) => received.push(p), win as unknown as Window);

    dispatchMessage(null, "https://example.com", win);

    expect(received).toHaveLength(0);
    stop();
  });

  it("payload 에 plaintext credential 필드 없음 — T2 타입 보장", () => {
    // WorldBridgePayload 가 username/password 를 포함하지 않음을 컴파일 타임에 확인.
    const p: WorldBridgePayload = VALID_PAYLOAD;
    // @ts-expect-error — password 는 타입에 없어야 함
    const _check: { password: string } = p;
    expect(Object.keys(p)).not.toContain("password");
    expect(Object.keys(p)).not.toContain("username");
  });
});
