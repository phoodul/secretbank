// SPDX-License-Identifier: AGPL-3.0-or-later
//
// extension/lib/__tests__/generator-panel-host.test.ts — M24-E Phase E-1
//
// D-3 save-banner-host.test.ts 패턴 재사용.
// React createRoot 는 mock 처리 — DOM 구조 (host/shadow) 만 검증.

import { JSDOM } from "jsdom";
import { describe, it, expect, vi, beforeEach } from "vitest";

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

vi.mock("../../components/GeneratorPanel", () => ({
  GeneratorPanel: vi.fn(() => null),
}));

describe("mountGeneratorPanel — host element + closed shadow", () => {
  let dom: JSDOM;
  let doc: Document;
  let targetInput: HTMLInputElement;

  beforeEach(async () => {
    dom = new JSDOM("<!doctype html><html><body></body></html>", {
      url: "https://example.com/",
    });
    doc = dom.window.document;
    targetInput = doc.createElement("input");
    targetInput.type = "password";
    doc.body.appendChild(targetInput);

    // 모듈 캐시 초기화 — 모듈 레벨 activeRoot/activeHost 리셋.
    vi.resetModules();
  });

  it("mount 후 host element 가 body 에 추가된다", async () => {
    const { mountGeneratorPanel } = await import("../generator-panel-host");
    // getBoundingClientRect mock (jsdom 은 항상 0 반환).
    targetInput.getBoundingClientRect = () => ({
      top: 100,
      left: 50,
      right: 300,
      bottom: 130,
      width: 250,
      height: 30,
      x: 50,
      y: 100,
      toJSON: () => ({}),
    });
    mountGeneratorPanel({ targetInput }, doc);
    const host = doc.getElementById("secretbank-generator-panel-host");
    expect(host).not.toBeNull();
  });

  it("host 의 shadowRoot 가 null (closed shadow)", async () => {
    const { mountGeneratorPanel } = await import("../generator-panel-host");
    targetInput.getBoundingClientRect = () => ({
      top: 100,
      left: 50,
      right: 300,
      bottom: 130,
      width: 250,
      height: 30,
      x: 50,
      y: 100,
      toJSON: () => ({}),
    });
    mountGeneratorPanel({ targetInput }, doc);
    const host = doc.getElementById("secretbank-generator-panel-host");
    // closed shadow root 이므로 host.shadowRoot === null.
    expect(host?.shadowRoot).toBeNull();
  });

  it("host 의 z-index 가 2147483647", async () => {
    const { mountGeneratorPanel } = await import("../generator-panel-host");
    targetInput.getBoundingClientRect = () => ({
      top: 100,
      left: 50,
      right: 300,
      bottom: 130,
      width: 250,
      height: 30,
      x: 50,
      y: 100,
      toJSON: () => ({}),
    });
    mountGeneratorPanel({ targetInput }, doc);
    const host = doc.getElementById("secretbank-generator-panel-host");
    expect(host?.style.zIndex).toBe("2147483647");
  });

  it("unmount 함수 호출 시 host 가 DOM 에서 제거된다", async () => {
    const { mountGeneratorPanel } = await import("../generator-panel-host");
    targetInput.getBoundingClientRect = () => ({
      top: 100,
      left: 50,
      right: 300,
      bottom: 130,
      width: 250,
      height: 30,
      x: 50,
      y: 100,
      toJSON: () => ({}),
    });
    const unmount = mountGeneratorPanel({ targetInput }, doc);
    expect(doc.getElementById("secretbank-generator-panel-host")).not.toBeNull();
    unmount();
    expect(doc.getElementById("secretbank-generator-panel-host")).toBeNull();
  });

  it("두 번 mount 시 이전 host 가 제거되고 새 host 하나만 존재한다", async () => {
    const { mountGeneratorPanel } = await import("../generator-panel-host");
    targetInput.getBoundingClientRect = () => ({
      top: 100,
      left: 50,
      right: 300,
      bottom: 130,
      width: 250,
      height: 30,
      x: 50,
      y: 100,
      toJSON: () => ({}),
    });
    const input2 = doc.createElement("input");
    input2.getBoundingClientRect = () => ({
      top: 200,
      left: 50,
      right: 300,
      bottom: 230,
      width: 250,
      height: 30,
      x: 50,
      y: 200,
      toJSON: () => ({}),
    });
    doc.body.appendChild(input2);

    mountGeneratorPanel({ targetInput }, doc);
    mountGeneratorPanel({ targetInput: input2 }, doc);

    const hosts = doc.querySelectorAll("#secretbank-generator-panel-host");
    expect(hosts.length).toBe(1);
  });

  it("isGeneratorPanelOpen() — mount 후 true", async () => {
    const { mountGeneratorPanel, isGeneratorPanelOpen } = await import("../generator-panel-host");
    targetInput.getBoundingClientRect = () => ({
      top: 100,
      left: 50,
      right: 300,
      bottom: 130,
      width: 250,
      height: 30,
      x: 50,
      y: 100,
      toJSON: () => ({}),
    });
    mountGeneratorPanel({ targetInput }, doc);
    expect(isGeneratorPanelOpen()).toBe(true);
  });

  it("isGeneratorPanelOpen() — unmount 후 false", async () => {
    const { mountGeneratorPanel, isGeneratorPanelOpen } = await import("../generator-panel-host");
    targetInput.getBoundingClientRect = () => ({
      top: 100,
      left: 50,
      right: 300,
      bottom: 130,
      width: 250,
      height: 30,
      x: 50,
      y: 100,
      toJSON: () => ({}),
    });
    const unmount = mountGeneratorPanel({ targetInput }, doc);
    unmount();
    expect(isGeneratorPanelOpen()).toBe(false);
  });
});
