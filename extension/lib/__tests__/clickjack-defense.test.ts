// SPDX-License-Identifier: AGPL-3.0-or-later

import { JSDOM } from "jsdom";
import { describe, it, expect, beforeEach, vi } from "vitest";

import { installClickjackDefense, isClickOnHost, isSuspectOverlay } from "../clickjack-defense";
import { createShadowContainer } from "../shadow-container";

describe("createShadowContainer — Closed Shadow Root", () => {
  let dom: JSDOM;
  let doc: Document;

  beforeEach(() => {
    dom = new JSDOM("<!doctype html><html><body></body></html>", {
      url: "https://example.com/",
    });
    doc = dom.window.document;
  });

  it("Closed shadow root: host.shadowRoot 는 null", () => {
    const container = createShadowContainer(doc, "secretbank-overlay");
    expect(container.host.shadowRoot).toBeNull();
    expect(container.root).toBeTruthy();
    container.destroy();
  });

  it("z-index 매우 높음 + position fixed", () => {
    const container = createShadowContainer(doc, "secretbank-overlay");
    expect(container.host.style.position).toBe("fixed");
    expect(container.host.style.zIndex).toBe("2147483647");
    container.destroy();
  });

  it("destroy 후 host 가 DOM 에서 제거됨", () => {
    const container = createShadowContainer(doc, "secretbank-overlay");
    expect(doc.getElementById("secretbank-overlay")).toBe(container.host);
    container.destroy();
    expect(doc.getElementById("secretbank-overlay")).toBeNull();
  });

  it("같은 hostId 재호출 시 closed shadow 재부착 ❌ (NotSupportedError)", () => {
    createShadowContainer(doc, "secretbank-overlay");
    // Closed shadow root 는 한 번만 부착 가능. consumer 가 destroy 후 재호출.
    expect(() => createShadowContainer(doc, "secretbank-overlay")).toThrow();
  });
});

describe("isSuspectOverlay — DOM Clickjacking 휴리스틱", () => {
  let dom: JSDOM;
  let doc: Document;

  beforeEach(() => {
    dom = new JSDOM("<!doctype html><html><body></body></html>", {
      url: "https://example.com/",
      pretendToBeVisual: true,
    });
    doc = dom.window.document;
  });

  it("position=fixed + z-index 매우 높음 + opacity<0.1 → suspect", () => {
    const el = doc.createElement("div");
    el.style.cssText = "position: fixed; z-index: 2147483646; opacity: 0.05; pointer-events: auto;";
    doc.body.appendChild(el);
    expect(isSuspectOverlay(el)).toBe(true);
  });

  it("opacity 정상 (0.5) → not suspect", () => {
    const el = doc.createElement("div");
    el.style.cssText = "position: fixed; z-index: 2147483646; opacity: 0.5; pointer-events: auto;";
    doc.body.appendChild(el);
    expect(isSuspectOverlay(el)).toBe(false);
  });

  it("z-index 낮음 → not suspect", () => {
    const el = doc.createElement("div");
    el.style.cssText = "position: fixed; z-index: 100; opacity: 0; pointer-events: auto;";
    doc.body.appendChild(el);
    expect(isSuspectOverlay(el)).toBe(false);
  });

  it("position=static → not suspect", () => {
    const el = doc.createElement("div");
    el.style.cssText = "position: static; z-index: 2147483646; opacity: 0; pointer-events: auto;";
    doc.body.appendChild(el);
    expect(isSuspectOverlay(el)).toBe(false);
  });

  it("pointer-events=none → not suspect (click 전달 안 됨)", () => {
    const el = doc.createElement("div");
    el.style.cssText = "position: fixed; z-index: 2147483646; opacity: 0; pointer-events: none;";
    doc.body.appendChild(el);
    expect(isSuspectOverlay(el)).toBe(false);
  });

  it("visibility=hidden + pointer-events=auto → suspect", () => {
    const el = doc.createElement("div");
    el.style.cssText =
      "position: absolute; z-index: 2147483700; visibility: hidden; pointer-events: auto;";
    doc.body.appendChild(el);
    expect(isSuspectOverlay(el)).toBe(true);
  });
});

describe("isClickOnHost — composedPath 검증", () => {
  let doc: Document;

  beforeEach(() => {
    const dom = new JSDOM("<!doctype html><html><body></body></html>");
    doc = dom.window.document;
  });

  it("composedPath 에 host 있으면 true", () => {
    const host = doc.createElement("div");
    host.id = "secretbank-overlay";
    const child = doc.createElement("button");
    host.appendChild(child);
    doc.body.appendChild(host);

    const ev = {
      composedPath: () => [child, host, doc.body, doc],
    } as unknown as Event;

    expect(isClickOnHost(ev, "secretbank-overlay")).toBe(true);
  });

  it("composedPath 에 host 없으면 false (clickjack 의심)", () => {
    const ev = {
      composedPath: () => [doc.body, doc],
    } as unknown as Event;

    expect(isClickOnHost(ev, "secretbank-overlay")).toBe(false);
  });

  it("composedPath 미지원 → false (보수적 거부)", () => {
    const ev = {} as Event;
    expect(isClickOnHost(ev, "secretbank-overlay")).toBe(false);
  });
});

describe("installClickjackDefense — MutationObserver", () => {
  let dom: JSDOM;
  let doc: Document;

  beforeEach(() => {
    dom = new JSDOM("<!doctype html><html><body></body></html>", {
      url: "https://example.com/",
      pretendToBeVisual: true,
    });
    doc = dom.window.document;
  });

  it("suspect overlay 가 추가되면 onSuspectOverlay 호출", async () => {
    const callback = vi.fn();
    const defense = installClickjackDefense(doc, "secretbank-overlay", {
      onSuspectOverlay: callback,
    });

    const overlay = doc.createElement("div");
    overlay.style.cssText =
      "position: fixed; z-index: 2147483646; opacity: 0.05; pointer-events: auto;";
    doc.body.appendChild(overlay);

    // MutationObserver microtask flush.
    await new Promise((r) => setTimeout(r, 0));

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(overlay);
    defense.stop();
  });

  it("정상 element 추가 → onSuspectOverlay 미호출", async () => {
    const callback = vi.fn();
    const defense = installClickjackDefense(doc, "secretbank-overlay", {
      onSuspectOverlay: callback,
    });

    const normal = doc.createElement("div");
    normal.textContent = "hello";
    doc.body.appendChild(normal);

    await new Promise((r) => setTimeout(r, 0));

    expect(callback).not.toHaveBeenCalled();
    defense.stop();
  });

  it("자체 host (hostId) 추가는 무시", async () => {
    const callback = vi.fn();
    const defense = installClickjackDefense(doc, "secretbank-overlay", {
      onSuspectOverlay: callback,
    });

    const ours = doc.createElement("div");
    ours.id = "secretbank-overlay";
    ours.style.cssText = "position: fixed; z-index: 2147483647; opacity: 0;";
    doc.body.appendChild(ours);

    await new Promise((r) => setTimeout(r, 0));

    expect(callback).not.toHaveBeenCalled();
    defense.stop();
  });

  it("stop 후 mutation 발생해도 callback 미호출", async () => {
    const callback = vi.fn();
    const defense = installClickjackDefense(doc, "secretbank-overlay", {
      onSuspectOverlay: callback,
    });
    defense.stop();

    const overlay = doc.createElement("div");
    overlay.style.cssText = "position: fixed; z-index: 2147483646; opacity: 0;";
    doc.body.appendChild(overlay);

    await new Promise((r) => setTimeout(r, 0));

    expect(callback).not.toHaveBeenCalled();
  });
});
