// SPDX-License-Identifier: AGPL-3.0-or-later
//
// extension/lib/__tests__/spa-watcher.test.ts — M24-E Phase C-2
//
// MutationObserver + History API hook 검증.

import { JSDOM } from "jsdom";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { watchForms, type SpaWatcher } from "../spa-watcher";
import type { DetectedForm } from "../form-detector";

describe("spa-watcher", () => {
  let dom: JSDOM;
  let doc: Document;
  let watcher: SpaWatcher | null = null;
  let calls: DetectedForm[][];

  beforeEach(() => {
    dom = new JSDOM("<!doctype html><html><body></body></html>", {
      url: "https://example.com/",
      pretendToBeVisual: true,
    });
    doc = dom.window.document;
    calls = [];
    vi.useFakeTimers();
  });

  afterEach(() => {
    if (watcher) {
      watcher.stop();
      watcher = null;
    }
    vi.useRealTimers();
    dom.window.close();
  });

  it("초기 scan 1회 즉시 호출 (initialScan=true)", () => {
    doc.body.innerHTML = `<form><input type=password autocomplete=current-password name=p></form>`;
    watcher = watchForms(doc, { onChange: (f) => calls.push(f) });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toHaveLength(1);
  });

  it("initialScan=false 시 초기 호출 ❌", () => {
    doc.body.innerHTML = `<form><input type=password autocomplete=current-password></form>`;
    watcher = watchForms(doc, {
      onChange: (f) => calls.push(f),
      initialScan: false,
    });
    expect(calls).toHaveLength(0);
  });

  it("동적 input 추가 시 200ms debounce 후 onChange 호출", async () => {
    watcher = watchForms(doc, {
      onChange: (f) => calls.push(f),
      initialScan: false,
    });

    // 동적 form 추가.
    const form = doc.createElement("form");
    form.innerHTML = `<input type=password autocomplete=current-password name=p>`;
    doc.body.appendChild(form);

    // debounce 미만 시점 → 미호출.
    await vi.advanceTimersByTimeAsync(199);
    expect(calls).toHaveLength(0);

    // 200ms 도달 → 1회 호출.
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toHaveLength(1);
  });

  it("burst 변경 → debounce 합쳐 1회만 호출", async () => {
    watcher = watchForms(doc, {
      onChange: (f) => calls.push(f),
      initialScan: false,
    });

    // 5개 input 연속 추가 (각 50ms 간격) — debounce 가 마지막 한 번에 합침.
    for (let i = 0; i < 5; i++) {
      const form = doc.createElement("form");
      form.innerHTML = `<input type=password name=p${i}>`;
      doc.body.appendChild(form);
      await vi.advanceTimersByTimeAsync(50);
    }

    // 마지막 mutation 후 200ms 도달 — 1회만 호출.
    await vi.advanceTimersByTimeAsync(200);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toHaveLength(5);
  });

  it("pushState 시 재scan 트리거", async () => {
    watcher = watchForms(doc, {
      onChange: (f) => calls.push(f),
      initialScan: false,
    });

    // pushState 호출 (URL 변경).
    dom.window.history.pushState({}, "", "/login");

    await vi.advanceTimersByTimeAsync(200);
    // pushState 자체로 DOM 변경 ❌ 이지만 form-detector 가 재호출됨 (현재 form 0개).
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual([]);
  });

  it("popstate 시 재scan 트리거", async () => {
    watcher = watchForms(doc, {
      onChange: (f) => calls.push(f),
      initialScan: false,
    });

    dom.window.history.pushState({}, "", "/page1");
    await vi.advanceTimersByTimeAsync(200);
    calls.length = 0;

    // popstate 시뮬레이션.
    dom.window.dispatchEvent(new dom.window.Event("popstate"));
    await vi.advanceTimersByTimeAsync(200);
    expect(calls).toHaveLength(1);
  });

  it("rescan() 호출 시 debounce 무시 즉시 호출", () => {
    doc.body.innerHTML = `<form><input type=password autocomplete=current-password></form>`;
    watcher = watchForms(doc, {
      onChange: (f) => calls.push(f),
      initialScan: false,
    });

    expect(calls).toHaveLength(0);
    watcher.rescan();
    expect(calls).toHaveLength(1);
  });

  it("current() 가 마지막 cached forms 반환", async () => {
    watcher = watchForms(doc, {
      onChange: (f) => calls.push(f),
      initialScan: false,
    });

    expect(watcher.current()).toEqual([]);

    const form = doc.createElement("form");
    form.innerHTML = `<input type=password autocomplete=current-password>`;
    doc.body.appendChild(form);
    await vi.advanceTimersByTimeAsync(200);

    expect(watcher.current()).toHaveLength(1);
  });

  it("stop() 후 mutation 발생해도 onChange 미호출", async () => {
    watcher = watchForms(doc, {
      onChange: (f) => calls.push(f),
      initialScan: false,
    });
    watcher.stop();

    const form = doc.createElement("form");
    form.innerHTML = `<input type=password autocomplete=current-password>`;
    doc.body.appendChild(form);
    await vi.advanceTimersByTimeAsync(500);

    expect(calls).toHaveLength(0);
  });

  it("stop() 후 pushState 호출해도 onChange 미호출 (history hook 해제)", async () => {
    watcher = watchForms(doc, {
      onChange: (f) => calls.push(f),
      initialScan: false,
    });
    watcher.stop();

    dom.window.history.pushState({}, "", "/after-stop");
    await vi.advanceTimersByTimeAsync(500);
    expect(calls).toHaveLength(0);
  });
});
