// SPDX-License-Identifier: AGPL-3.0-or-later
//
// extension/lib/__tests__/railguard-host.test.ts — M24-E Phase G-5

import { JSDOM } from "jsdom";
import { describe, it, expect, vi, beforeEach } from "vitest";

// React DOM 마운트는 async microtask 가 필요하므로 act 없이 DOM 구조만 검증.
// createRoot 는 mock 처리.

vi.mock("react-dom/client", () => ({
  createRoot: vi.fn(() => ({
    render: vi.fn(),
    unmount: vi.fn(),
  })),
}));

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return { ...actual, createElement: vi.fn() };
});

describe("mountRailguardHintBanner — host element + closed shadow", () => {
  let dom: JSDOM;
  let doc: Document;

  const baseProps = {
    host: "chatgpt.com",
    onCreate: vi.fn(),
    onDismiss: vi.fn(),
  };

  beforeEach(async () => {
    dom = new JSDOM("<!doctype html><html><body></body></html>", {
      url: "https://chatgpt.com/",
    });
    doc = dom.window.document;

    // 모듈 캐시 초기화 — 모듈 레벨 activeRoot/activeHost 리셋
    vi.resetModules();
  });

  it("mount 후 host element 가 body 에 추가된다", async () => {
    const { mountRailguardHintBanner } = await import("../railguard-host");
    mountRailguardHintBanner(baseProps, doc);
    const host = doc.getElementById("secretbank-railguard-hint-host");
    expect(host).not.toBeNull();
  });

  it("host 의 shadowRoot 가 null (closed shadow)", async () => {
    const { mountRailguardHintBanner } = await import("../railguard-host");
    mountRailguardHintBanner(baseProps, doc);
    const host = doc.getElementById("secretbank-railguard-hint-host");
    // closed shadow root 이므로 host.shadowRoot === null
    expect(host?.shadowRoot).toBeNull();
  });

  it("host 의 z-index 가 최대값", async () => {
    const { mountRailguardHintBanner } = await import("../railguard-host");
    mountRailguardHintBanner(baseProps, doc);
    const host = doc.getElementById("secretbank-railguard-hint-host");
    expect(host?.style.zIndex).toBe("2147483647");
  });

  it("host 가 position:fixed 으로 설정된다", async () => {
    const { mountRailguardHintBanner } = await import("../railguard-host");
    mountRailguardHintBanner(baseProps, doc);
    const host = doc.getElementById("secretbank-railguard-hint-host");
    expect(host?.style.position).toBe("fixed");
  });

  it("host 가 top:0 right:0 으로 설정된다 (우상단 사이드바)", async () => {
    const { mountRailguardHintBanner } = await import("../railguard-host");
    mountRailguardHintBanner(baseProps, doc);
    const host = doc.getElementById("secretbank-railguard-hint-host");
    expect(host?.style.top).toBe("0px");
    expect(host?.style.right).toBe("0px");
  });

  it("unmount 함수 호출 시 host 가 DOM 에서 제거된다", async () => {
    const { mountRailguardHintBanner } = await import("../railguard-host");
    const unmount = mountRailguardHintBanner(baseProps, doc);
    expect(doc.getElementById("secretbank-railguard-hint-host")).not.toBeNull();
    unmount();
    expect(doc.getElementById("secretbank-railguard-hint-host")).toBeNull();
  });

  it("두 번 mount 시 이전 host 가 제거되고 새 host 하나만 존재한다", async () => {
    const { mountRailguardHintBanner } = await import("../railguard-host");
    mountRailguardHintBanner(baseProps, doc);
    mountRailguardHintBanner({ ...baseProps, host: "cursor.com" }, doc);
    const hosts = doc.querySelectorAll("#secretbank-railguard-hint-host");
    expect(hosts.length).toBe(1);
  });

  it("unmount 후 재mount 시 새 host element 추가", async () => {
    const { mountRailguardHintBanner } = await import("../railguard-host");
    const unmount = mountRailguardHintBanner(baseProps, doc);
    unmount();
    mountRailguardHintBanner({ ...baseProps, host: "claude.ai" }, doc);
    const host = doc.getElementById("secretbank-railguard-hint-host");
    expect(host).not.toBeNull();
  });
});
