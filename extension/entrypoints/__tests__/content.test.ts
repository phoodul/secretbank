// SPDX-License-Identifier: AGPL-3.0-or-later
//
// extension/entrypoints/__tests__/content.test.ts — D-1 ISOLATED world 테스트

import { describe, it, expect, beforeEach, vi } from "vitest";
import { JSDOM } from "jsdom";

import {
  installFormSubmitListener,
  installMainWorldMessageListener,
  type FormSubmitContext,
  type HookEventContext,
} from "../content";
import type { MainToIsolatedMsg } from "../content-main";

// ── form submit listener 테스트 ───────────────────────────────────────────────

describe("installFormSubmitListener — form submit 캡처", () => {
  let dom: JSDOM;
  let doc: Document;

  beforeEach(() => {
    dom = new JSDOM("<!doctype html><html><body></body></html>", {
      url: "https://example.com/",
    });
    doc = dom.window.document;
  });

  function makeLoginForm(doc: Document): HTMLFormElement {
    const form = doc.createElement("form");
    form.action = "/login";
    const username = doc.createElement("input");
    username.type = "text";
    username.name = "username";
    const password = doc.createElement("input");
    password.type = "password";
    password.name = "password";
    form.appendChild(username);
    form.appendChild(password);
    doc.body.appendChild(form);
    return form;
  }

  it("password input 있는 form submit → onCapture 호출", () => {
    const captured: FormSubmitContext[] = [];
    const stop = installFormSubmitListener(doc, (ctx) => captured.push(ctx));

    const form = makeLoginForm(doc);
    form.dispatchEvent(new dom.window.Event("submit", { bubbles: true }));

    expect(captured).toHaveLength(1);
    expect(captured[0]!.eventType).toBe("form-submit");
    expect(captured[0]!.hasPassword).toBe(true);
    expect(captured[0]!.domain).toBe("example.com");
    stop();
  });

  it("username input 있으면 hasUsername = true", () => {
    const captured: FormSubmitContext[] = [];
    const stop = installFormSubmitListener(doc, (ctx) => captured.push(ctx));

    const form = makeLoginForm(doc);
    form.dispatchEvent(new dom.window.Event("submit", { bubbles: true }));

    expect(captured[0]!.hasUsername).toBe(true);
    stop();
  });

  it("password input 없는 form submit → onCapture 미호출", () => {
    const captured: FormSubmitContext[] = [];
    const stop = installFormSubmitListener(doc, (ctx) => captured.push(ctx));

    const form = doc.createElement("form");
    const searchInput = doc.createElement("input");
    searchInput.type = "text";
    searchInput.name = "q";
    form.appendChild(searchInput);
    doc.body.appendChild(form);
    form.dispatchEvent(new dom.window.Event("submit", { bubbles: true }));

    expect(captured).toHaveLength(0);
    stop();
  });

  it("form action URL 이 actionUrl 에 반영됨", () => {
    const captured: FormSubmitContext[] = [];
    const stop = installFormSubmitListener(doc, (ctx) => captured.push(ctx));

    const form = makeLoginForm(doc);
    form.action = "/auth/login";
    form.dispatchEvent(new dom.window.Event("submit", { bubbles: true }));

    expect(captured[0]!.actionUrl).toBe("https://example.com/auth/login");
    stop();
  });

  it("stop() 후 submit 이벤트 → onCapture 미호출", () => {
    const captured: FormSubmitContext[] = [];
    const stop = installFormSubmitListener(doc, (ctx) => captured.push(ctx));
    stop();

    const form = makeLoginForm(doc);
    form.dispatchEvent(new dom.window.Event("submit", { bubbles: true }));

    expect(captured).toHaveLength(0);
  });

  it("timestamp 가 Number 이고 최근 값", () => {
    const before = Date.now();
    const captured: FormSubmitContext[] = [];
    const stop = installFormSubmitListener(doc, (ctx) => captured.push(ctx));

    const form = makeLoginForm(doc);
    form.dispatchEvent(new dom.window.Event("submit", { bubbles: true }));
    const after = Date.now();

    expect(captured[0]!.timestamp).toBeGreaterThanOrEqual(before);
    expect(captured[0]!.timestamp).toBeLessThanOrEqual(after);
    stop();
  });
});

// ── installMainWorldMessageListener 테스트 ────────────────────────────────────

describe("installMainWorldMessageListener — MAIN world postMessage 수신", () => {
  let dom: JSDOM;
  let win: JSDOM["window"];

  beforeEach(() => {
    dom = new JSDOM(
      `<!doctype html><html><body>
        <form action="/login">
          <input type="text" name="username"/>
          <input type="password" name="password"/>
        </form>
      </body></html>`,
      { url: "https://example.com/" },
    );
    win = dom.window;
  });

  function sendMainMsg(
    win: JSDOM["window"],
    payload: Partial<MainToIsolatedMsg>,
    origin = "https://example.com",
  ): void {
    const event = new win.MessageEvent("message", {
      data: payload,
      origin,
    });
    win.dispatchEvent(event);
  }

  it("유효한 secretbank-main-hook 메시지 → onCapture 호출", () => {
    const captured: HookEventContext[] = [];
    const stop = installMainWorldMessageListener(win as unknown as Window, (ctx) =>
      captured.push(ctx),
    );

    sendMainMsg(win, {
      type: "secretbank-main-hook",
      eventType: "fetch-post",
      domain: "example.com",
      actionUrl: "https://example.com/login",
      timestamp: Date.now(),
    });

    expect(captured).toHaveLength(1);
    expect(captured[0]!.eventType).toBe("fetch-post");
    expect(captured[0]!.domain).toBe("example.com");
    stop();
  });

  it("origin mismatch → onCapture 미호출 (T2 방어)", () => {
    const captured: HookEventContext[] = [];
    const stop = installMainWorldMessageListener(win as unknown as Window, (ctx) =>
      captured.push(ctx),
    );

    // 악의적인 다른 origin 에서 보내는 postMessage.
    sendMainMsg(
      win,
      {
        type: "secretbank-main-hook",
        eventType: "fetch-post",
        domain: "evil.com",
        actionUrl: "https://evil.com/steal",
        timestamp: Date.now(),
      },
      "https://evil.com",
    );

    expect(captured).toHaveLength(0);
    stop();
  });

  it("type 이 다른 메시지 → 무시", () => {
    const captured: HookEventContext[] = [];
    const stop = installMainWorldMessageListener(win as unknown as Window, (ctx) =>
      captured.push(ctx),
    );

    sendMainMsg(win, { type: "other-extension-msg" } as unknown as Partial<MainToIsolatedMsg>);

    expect(captured).toHaveLength(0);
    stop();
  });

  it("password input 있는 DOM → hasPassword = true", () => {
    const captured: HookEventContext[] = [];
    const stop = installMainWorldMessageListener(win as unknown as Window, (ctx) =>
      captured.push(ctx),
    );

    sendMainMsg(win, {
      type: "secretbank-main-hook",
      eventType: "xhr-post",
      domain: "example.com",
      actionUrl: "https://example.com/login",
      timestamp: Date.now(),
    });

    expect(captured[0]!.hasPassword).toBe(true);
    stop();
  });

  it("stop() 후 메시지 → onCapture 미호출", () => {
    const captured: HookEventContext[] = [];
    const stop = installMainWorldMessageListener(win as unknown as Window, (ctx) =>
      captured.push(ctx),
    );
    stop();

    sendMainMsg(win, {
      type: "secretbank-main-hook",
      eventType: "fetch-post",
      domain: "example.com",
      actionUrl: "https://example.com/login",
      timestamp: Date.now(),
    });

    expect(captured).toHaveLength(0);
  });

  it("xhr-post 이벤트타입도 처리", () => {
    const captured: HookEventContext[] = [];
    const stop = installMainWorldMessageListener(win as unknown as Window, (ctx) =>
      captured.push(ctx),
    );

    sendMainMsg(win, {
      type: "secretbank-main-hook",
      eventType: "xhr-post",
      domain: "example.com",
      actionUrl: "https://example.com/signin",
      timestamp: Date.now(),
    });

    expect(captured[0]!.eventType).toBe("xhr-post");
    stop();
  });

  it("payload 에 plaintext credential 없음 — domain/actionUrl/timestamp 만 있음", () => {
    // T2 방어 검증: payload 에 username/password 필드가 없음을 타입으로 보장.
    const captured: HookEventContext[] = [];
    const stop = installMainWorldMessageListener(win as unknown as Window, (ctx) =>
      captured.push(ctx),
    );

    const msg: MainToIsolatedMsg = {
      type: "secretbank-main-hook",
      eventType: "fetch-post",
      domain: "example.com",
      actionUrl: "https://example.com/login",
      timestamp: Date.now(),
    };

    // MainToIsolatedMsg 에 username/password 필드가 없음을 타입 검사로 확인.
    // @ts-expect-error — 의도적 타입 오류: plaintext 는 인터페이스에 없어야 함.
    const _check: { username: string } = msg;

    sendMainMsg(win, msg);
    expect(captured[0]!.hasPassword).toBe(true); // DOM 직접 읽음 — payload 에서 온 게 아님.
    stop();
  });
});
