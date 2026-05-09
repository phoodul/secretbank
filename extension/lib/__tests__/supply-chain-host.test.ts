// SPDX-License-Identifier: AGPL-3.0-or-later
//
// extension/lib/__tests__/supply-chain-host.test.ts — M24-E Phase G-2-2

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

describe("mountSupplyChainBanner — host element + closed shadow", () => {
  let dom: JSDOM;
  let doc: Document;

  const mockIncident = {
    incident_id: "01HZ_TEST",
    severity: "high" as const,
    title: "Test breach",
    published_at: Date.now() - 86400000,
    source: "nvd" as const,
  };

  const baseProps = {
    host: "github.com",
    incident: mockIncident,
    onView: vi.fn(),
    onDismiss: vi.fn(),
  };

  beforeEach(async () => {
    dom = new JSDOM("<!doctype html><html><body></body></html>", {
      url: "https://github.com/",
    });
    doc = dom.window.document;

    // 모듈 캐시 초기화 — 모듈 레벨 activeRoot/activeHost 리셋
    vi.resetModules();
  });

  it("mount 후 host element 가 body 에 추가된다", async () => {
    const { mountSupplyChainBanner } = await import("../supply-chain-host");
    mountSupplyChainBanner(baseProps, doc);
    const host = doc.getElementById("secretbank-supply-chain-banner-host");
    expect(host).not.toBeNull();
  });

  it("host 의 shadowRoot 가 null (closed shadow)", async () => {
    const { mountSupplyChainBanner } = await import("../supply-chain-host");
    mountSupplyChainBanner(baseProps, doc);
    const host = doc.getElementById("secretbank-supply-chain-banner-host");
    // closed shadow root 이므로 host.shadowRoot === null
    expect(host?.shadowRoot).toBeNull();
  });

  it("host 의 z-index 가 최대값", async () => {
    const { mountSupplyChainBanner } = await import("../supply-chain-host");
    mountSupplyChainBanner(baseProps, doc);
    const host = doc.getElementById("secretbank-supply-chain-banner-host");
    expect(host?.style.zIndex).toBe("2147483647");
  });

  it("host 가 position:fixed top:0 으로 설정된다", async () => {
    const { mountSupplyChainBanner } = await import("../supply-chain-host");
    mountSupplyChainBanner(baseProps, doc);
    const host = doc.getElementById("secretbank-supply-chain-banner-host");
    expect(host?.style.position).toBe("fixed");
    expect(host?.style.top).toBe("0px");
  });

  it("unmount 함수 호출 시 host 가 DOM 에서 제거된다", async () => {
    const { mountSupplyChainBanner } = await import("../supply-chain-host");
    const unmount = mountSupplyChainBanner(baseProps, doc);
    expect(doc.getElementById("secretbank-supply-chain-banner-host")).not.toBeNull();
    unmount();
    expect(doc.getElementById("secretbank-supply-chain-banner-host")).toBeNull();
  });

  it("두 번 mount 시 이전 host 가 제거되고 새 host 하나만 존재한다", async () => {
    const { mountSupplyChainBanner } = await import("../supply-chain-host");
    mountSupplyChainBanner(baseProps, doc);
    mountSupplyChainBanner({ ...baseProps, host: "stripe.com" }, doc);
    const hosts = doc.querySelectorAll("#secretbank-supply-chain-banner-host");
    expect(hosts.length).toBe(1);
  });

  it("unmount 후 재mount 시 새 host element 추가", async () => {
    const { mountSupplyChainBanner } = await import("../supply-chain-host");
    const unmount = mountSupplyChainBanner(baseProps, doc);
    unmount();
    mountSupplyChainBanner({ ...baseProps, host: "stripe.com" }, doc);
    const host = doc.getElementById("secretbank-supply-chain-banner-host");
    expect(host).not.toBeNull();
  });
});
