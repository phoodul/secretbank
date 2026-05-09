// SPDX-License-Identifier: AGPL-3.0-or-later
//
// extension/lib/__tests__/form-detector-iframe.test.ts — M24-E Phase C-7

import { JSDOM } from "jsdom";
import { describe, it, expect } from "vitest";

import { detectForms } from "../form-detector";

describe("form-detector — same-origin iframe (C-7)", () => {
  it("same-origin iframe 안의 password input 도 detect", () => {
    const dom = new JSDOM(
      `<!doctype html><html><body>
        <iframe id=child srcdoc="<form><input type=password autocomplete=current-password name=ipw></form>"></iframe>
       </body></html>`,
      { url: "https://example.com/" },
    );
    const doc = dom.window.document;

    // iframe 의 contentDocument 가 srcdoc 로딩 후 사용 가능.
    const iframe = doc.getElementById("child") as HTMLIFrameElement;
    // jsdom 의 srcdoc 은 동기적으로 contentDocument 에 반영.
    if (!iframe.contentDocument?.querySelector("input")) {
      // srcdoc 가 비어있는 경우 직접 채우기 (jsdom 호환성).
      iframe.contentDocument!.body.innerHTML = `
        <form><input type=password autocomplete=current-password name=ipw></form>
      `;
    }

    const forms = detectForms(doc);
    expect(forms).toHaveLength(1);
    expect(forms[0]!.passwordInput.name).toBe("ipw");
  });

  it("light DOM + same-origin iframe 동시 detect", () => {
    const dom = new JSDOM(
      `<!doctype html><html><body>
        <form id=light><input type=password autocomplete=current-password name=lpw></form>
        <iframe id=child></iframe>
       </body></html>`,
      { url: "https://example.com/" },
    );
    const doc = dom.window.document;
    const iframe = doc.getElementById("child") as HTMLIFrameElement;
    iframe.contentDocument!.body.innerHTML = `
      <form><input type=password autocomplete=current-password name=ipw></form>
    `;

    const forms = detectForms(doc);
    expect(forms).toHaveLength(2);
    const names = forms.map((f) => f.passwordInput.name).sort();
    expect(names).toEqual(["ipw", "lpw"]);
  });

  it("cross-origin iframe 은 SecurityError 시 skip (best-effort)", () => {
    // jsdom 은 SecurityError 시뮬레이션 어려움 — getter 를 throw 로 stub.
    const dom = new JSDOM(
      `<!doctype html><html><body>
        <form><input type=password autocomplete=current-password name=lpw></form>
        <iframe id=child></iframe>
       </body></html>`,
      { url: "https://example.com/" },
    );
    const doc = dom.window.document;
    const iframe = doc.getElementById("child") as HTMLIFrameElement;
    Object.defineProperty(iframe, "contentDocument", {
      get() {
        throw new Error("SecurityError: cross-origin");
      },
    });

    // light DOM form 은 detect, iframe 은 skip.
    const forms = detectForms(doc);
    expect(forms).toHaveLength(1);
    expect(forms[0]!.passwordInput.name).toBe("lpw");
  });

  it("iframe 자체가 input 이 없어도 light DOM 영향 ❌", () => {
    const dom = new JSDOM(
      `<!doctype html><html><body>
        <form><input type=password autocomplete=current-password name=lpw></form>
        <iframe srcdoc="<p>empty iframe</p>"></iframe>
       </body></html>`,
      { url: "https://example.com/" },
    );

    const forms = detectForms(dom.window.document);
    expect(forms).toHaveLength(1);
    expect(forms[0]!.passwordInput.name).toBe("lpw");
  });
});
