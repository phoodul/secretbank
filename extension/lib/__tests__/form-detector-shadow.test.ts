// SPDX-License-Identifier: AGPL-3.0-or-later
//
// extension/lib/__tests__/form-detector-shadow.test.ts — M24-E Phase C-3
//
// Open Shadow DOM 재귀 + Closed Shadow Root composedPath 헬퍼 검증.

import { JSDOM } from "jsdom";
import { describe, it, expect, beforeEach } from "vitest";

import { detectForms, inputFromComposedPath } from "../form-detector";

describe("form-detector — Shadow DOM (C-3)", () => {
  let doc: Document;
  let win: typeof globalThis;

  beforeEach(() => {
    const dom = new JSDOM("<!doctype html><html><body></body></html>", {
      pretendToBeVisual: true,
    });
    doc = dom.window.document;
    // jsdom 의 HTMLInputElement 가 globalThis.HTMLInputElement 와 다르므로
    // inputFromComposedPath 의 instanceof 검사는 dom.window 의 prototype 사용.
    win = dom.window as unknown as typeof globalThis;
    // global instanceof 가 동작하도록 override (테스트 한정).
    (globalThis as unknown as { HTMLInputElement: typeof HTMLInputElement }).HTMLInputElement =
      dom.window.HTMLInputElement;
  });

  it("open shadow root 안의 password input 도 detect", () => {
    // <my-login> custom element 에 open shadow root 부착.
    const host = doc.createElement("div");
    host.id = "host";
    doc.body.appendChild(host);
    const sr = host.attachShadow({ mode: "open" });
    sr.innerHTML = `
      <form>
        <input type=email name=email autocomplete=username>
        <input type=password name=pw autocomplete=current-password>
      </form>
    `;

    const forms = detectForms(doc);
    expect(forms).toHaveLength(1);
    const f = forms[0]!;
    expect(f.passwordPriority).toBe("current-password");
    expect(f.passwordInput.name).toBe("pw");
    expect(f.usernameInput?.name).toBe("email");
    expect(f.usernamePriority).toBe("autocomplete");
  });

  it("light DOM + open shadow root 동시 detect (multiple)", () => {
    // light DOM 의 form.
    doc.body.innerHTML = `
      <form id=light><input type=password autocomplete=current-password name=lpw></form>
      <div id=host></div>
    `;
    // shadow tree 에도 form.
    const host = doc.getElementById("host")!;
    const sr = host.attachShadow({ mode: "open" });
    sr.innerHTML = `<form><input type=password autocomplete=current-password name=spw></form>`;

    const forms = detectForms(doc);
    expect(forms).toHaveLength(2);
    const names = forms.map((f) => f.passwordInput.name).sort();
    expect(names).toEqual(["lpw", "spw"]);
  });

  it("closed shadow root 는 detectForms 로 접근 불가 (best-effort)", () => {
    const host = doc.createElement("div");
    doc.body.appendChild(host);
    // Closed shadow root — host.shadowRoot 는 null 반환.
    host.attachShadow({ mode: "closed" }).innerHTML = `
      <form><input type=password autocomplete=current-password></form>
    `;

    expect(host.shadowRoot).toBeNull();
    const forms = detectForms(doc);
    expect(forms).toHaveLength(0);
  });

  it("inputFromComposedPath: composedPath() 의 첫 input 반환", () => {
    const input = doc.createElement("input");
    input.type = "password";

    // Mock event with composedPath returning [input, parent, ...].
    const div = doc.createElement("div");
    div.appendChild(input);
    const fakeEvent = {
      composedPath: () => [input, div, doc.body, doc],
    } as unknown as Event;

    expect(inputFromComposedPath(fakeEvent)).toBe(input);
  });

  it("inputFromComposedPath: input 없으면 null", () => {
    const fakeEvent = {
      composedPath: () => [doc.body, doc],
    } as unknown as Event;

    expect(inputFromComposedPath(fakeEvent)).toBeNull();
  });

  it("inputFromComposedPath: composedPath 미지원 시 null", () => {
    const fakeEvent = {} as Event;
    expect(inputFromComposedPath(fakeEvent)).toBeNull();
  });

  it("nested open shadow root (3 depth) 도 모두 traverse", () => {
    // host1 → shadow1 → host2 → shadow2 → host3 → shadow3 → input
    const host1 = doc.createElement("div");
    doc.body.appendChild(host1);
    const sr1 = host1.attachShadow({ mode: "open" });
    const host2 = doc.createElement("div");
    sr1.appendChild(host2);
    const sr2 = host2.attachShadow({ mode: "open" });
    const host3 = doc.createElement("div");
    sr2.appendChild(host3);
    const sr3 = host3.attachShadow({ mode: "open" });
    sr3.innerHTML = `
      <input type=password autocomplete=current-password name=deep>
    `;

    const forms = detectForms(doc);
    expect(forms).toHaveLength(1);
    expect(forms[0]!.passwordInput.name).toBe("deep");
  });

  it("closed shadow root 가 light DOM 안에 섞여 있어도 light DOM 만큼은 detect", () => {
    // light DOM form.
    doc.body.innerHTML = `<form id=visible><input type=password autocomplete=current-password name=v></form>`;
    // 그 옆에 closed shadow.
    const host = doc.createElement("div");
    doc.body.appendChild(host);
    host.attachShadow({ mode: "closed" }).innerHTML = `
      <input type=password autocomplete=current-password name=hidden>
    `;

    const forms = detectForms(doc);
    expect(forms).toHaveLength(1);
    expect(forms[0]!.passwordInput.name).toBe("v");
  });
});
