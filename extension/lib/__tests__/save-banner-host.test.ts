// SPDX-License-Identifier: AGPL-3.0-or-later
//
// extension/lib/__tests__/save-banner-host.test.ts — M24-E Phase D-3

import { JSDOM } from "jsdom";
import { describe, it, expect, vi, beforeEach } from "vitest";

// mountSaveBanner 는 React createRoot + render 를 사용하므로,
// jsdom 환경에서 host element 생성 + shadow attach 여부만 검증.
// React 렌더는 SaveBanner.test.tsx 에서 별도 커버.

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

describe("mountSaveBanner — host element + closed shadow", () => {
  let dom: JSDOM;
  let doc: Document;

  beforeEach(async () => {
    dom = new JSDOM("<!doctype html><html><body></body></html>", {
      url: "https://example.com/",
    });
    doc = dom.window.document;

    // 모듈 캐시 초기화 — 모듈 레벨 activeRoot/activeHost 리셋.
    vi.resetModules();
  });

  it("mount 후 host element 가 body 에 추가된다", async () => {
    const { mountSaveBanner } = await import("../save-banner-host");
    const props = {
      kind: "new" as const,
      siteName: "example.com",
      onSave: vi.fn(),
      onNever: vi.fn(),
      onDismiss: vi.fn(),
    };
    mountSaveBanner(props, doc);
    const host = doc.getElementById("secretbank-save-banner-host");
    expect(host).not.toBeNull();
  });

  it("host 의 shadowRoot 가 null (closed shadow)", async () => {
    const { mountSaveBanner } = await import("../save-banner-host");
    const props = {
      kind: "new" as const,
      siteName: "example.com",
      onSave: vi.fn(),
      onNever: vi.fn(),
      onDismiss: vi.fn(),
    };
    mountSaveBanner(props, doc);
    const host = doc.getElementById("secretbank-save-banner-host");
    // closed shadow root 이므로 host.shadowRoot === null.
    expect(host?.shadowRoot).toBeNull();
  });

  it("host 의 z-index 가 최대값", async () => {
    const { mountSaveBanner } = await import("../save-banner-host");
    const props = {
      kind: "new" as const,
      siteName: "example.com",
      onSave: vi.fn(),
      onNever: vi.fn(),
      onDismiss: vi.fn(),
    };
    mountSaveBanner(props, doc);
    const host = doc.getElementById("secretbank-save-banner-host");
    expect(host?.style.zIndex).toBe("2147483647");
  });

  it("unmount 함수 호출 시 host 가 DOM 에서 제거된다", async () => {
    const { mountSaveBanner } = await import("../save-banner-host");
    const props = {
      kind: "new" as const,
      siteName: "example.com",
      onSave: vi.fn(),
      onNever: vi.fn(),
      onDismiss: vi.fn(),
    };
    const unmount = mountSaveBanner(props, doc);
    expect(doc.getElementById("secretbank-save-banner-host")).not.toBeNull();
    unmount();
    expect(doc.getElementById("secretbank-save-banner-host")).toBeNull();
  });

  it("두 번 mount 시 이전 host 가 제거되고 새 host 하나만 존재한다", async () => {
    const { mountSaveBanner } = await import("../save-banner-host");
    const props = {
      kind: "new" as const,
      siteName: "example.com",
      onSave: vi.fn(),
      onNever: vi.fn(),
      onDismiss: vi.fn(),
    };
    mountSaveBanner(props, doc);
    mountSaveBanner({ ...props, siteName: "other.com" }, doc);
    const hosts = doc.querySelectorAll("#secretbank-save-banner-host");
    expect(hosts.length).toBe(1);
  });
});
