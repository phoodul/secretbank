// SPDX-License-Identifier: AGPL-3.0-or-later
//
// extension/lib/__tests__/form-detector.test.ts — M24-E Phase C-1
//
// 5 fixture 의 form 감지 우선순위 검증.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { JSDOM } from "jsdom";
import { describe, it, expect, beforeEach } from "vitest";

import { detectForms } from "../form-detector";

const FIXTURES_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", "__fixtures__");

function loadFixture(name: string): Document {
  const html = readFileSync(resolve(FIXTURES_DIR, `${name}.html`), "utf-8");
  const dom = new JSDOM(html);
  return dom.window.document;
}

describe("form-detector — 5 fixture", () => {
  it("google-signin: autocomplete current-password + autocomplete username", () => {
    const doc = loadFixture("google-signin");
    const forms = detectForms(doc);

    expect(forms).toHaveLength(1);
    const f = forms[0]!;
    expect(f.passwordPriority).toBe("current-password");
    expect(f.passwordInput.name).toBe("Passwd");
    expect(f.usernameInput?.name).toBe("identifier");
    expect(f.usernamePriority).toBe("autocomplete");
    expect(f.formEl?.id).toBe("challenge");
  });

  it("github-signin: autocomplete current-password + autocomplete username", () => {
    const doc = loadFixture("github-signin");
    const forms = detectForms(doc);

    expect(forms).toHaveLength(1);
    const f = forms[0]!;
    expect(f.passwordPriority).toBe("current-password");
    expect(f.passwordInput.name).toBe("password");
    expect(f.usernameInput?.name).toBe("login");
    expect(f.usernamePriority).toBe("autocomplete");
  });

  it("stripe-signup: autocomplete new-password + autocomplete email", () => {
    const doc = loadFixture("stripe-signup");
    const forms = detectForms(doc);

    expect(forms).toHaveLength(1);
    const f = forms[0]!;
    expect(f.passwordPriority).toBe("new-password");
    expect(f.passwordInput.name).toBe("password");
    expect(f.usernameInput?.name).toBe("email");
    expect(f.usernamePriority).toBe("autocomplete");
  });

  it("phishing-no-autocomplete: type-password + name-regex username", () => {
    const doc = loadFixture("phishing-no-autocomplete");
    const forms = detectForms(doc);

    expect(forms).toHaveLength(1);
    const f = forms[0]!;
    expect(f.passwordPriority).toBe("type-password");
    expect(f.passwordInput.name).toBe("user_pwd");
    expect(f.usernameInput?.name).toBe("user_login");
    expect(f.usernamePriority).toBe("name-regex");
  });

  it("multi-step-form: 2 separate forms — username form + password form 모두 detect", () => {
    const doc = loadFixture("multi-step-form");
    const forms = detectForms(doc);

    // password input 이 1개 (step2-password 의 input) → 1 DetectedForm.
    // username 후보는 같은 form 안에서 찾는다 → step2-password 안에 username 없음 → null.
    // 단, formEl 이 step2-password 와 일치해야 함.
    expect(forms).toHaveLength(1);
    const f = forms[0]!;
    expect(f.passwordPriority).toBe("current-password");
    expect(f.formEl?.id).toBe("step2-password");
    // step1 의 email 은 다른 form 이므로 매칭 ❌.
    expect(f.usernameInput).toBeNull();
  });
});

describe("form-detector — 우선순위 단위 검증", () => {
  let doc: Document;

  beforeEach(() => {
    doc = new JSDOM("<!doctype html><html><body></body></html>").window.document;
  });

  it("current-password 가 new-password / type-password / name-regex 보다 우선", () => {
    doc.body.innerHTML = `
      <form>
        <input name="username" autocomplete="username" />
        <input name="pwd1" autocomplete="new-password" type="password" />
        <input name="pwd2" autocomplete="current-password" type="password" />
      </form>
    `;
    const forms = detectForms(doc);
    // 2 password → 2 DetectedForm
    expect(forms).toHaveLength(2);
    // 우선순위 = current → new (입력 순서와 무관)
    const priorities = forms.map((f) => f.passwordPriority);
    // 정렬은 DOM 순서이지만 classify 가 각각 정확해야 함.
    expect(priorities).toContain("current-password");
    expect(priorities).toContain("new-password");
  });

  it("type=password (autocomplete 없음) 가 name-regex 보다 우선", () => {
    doc.body.innerHTML = `
      <form>
        <input name="password" type="password" />
      </form>
    `;
    const forms = detectForms(doc);
    expect(forms).toHaveLength(1);
    expect(forms[0]!.passwordPriority).toBe("type-password");
  });

  it("type=text + name=password (비표준) → name-regex 로 detect", () => {
    doc.body.innerHTML = `
      <form>
        <input name="password" type="text" />
      </form>
    `;
    const forms = detectForms(doc);
    expect(forms).toHaveLength(1);
    expect(forms[0]!.passwordPriority).toBe("name-regex");
  });

  it("password 없으면 빈 배열 반환", () => {
    doc.body.innerHTML = `
      <form>
        <input name="email" type="email" />
        <input name="comment" type="text" />
      </form>
    `;
    const forms = detectForms(doc);
    expect(forms).toEqual([]);
  });

  it("type=email 이 name-regex 보다 우선 (username 후보)", () => {
    doc.body.innerHTML = `
      <form>
        <input name="account_id" type="text" />
        <input name="contact" type="email" />
        <input name="password" type="password" autocomplete="current-password" />
      </form>
    `;
    const forms = detectForms(doc);
    expect(forms).toHaveLength(1);
    expect(forms[0]!.usernamePriority).toBe("type-email");
    expect(forms[0]!.usernameInput?.name).toBe("contact");
  });

  it("floating input (form 없음) 도 detect — formEl=null", () => {
    doc.body.innerHTML = `
      <input name="username" autocomplete="username" />
      <input name="password" type="password" autocomplete="current-password" />
    `;
    const forms = detectForms(doc);
    expect(forms).toHaveLength(1);
    expect(forms[0]!.formEl).toBeNull();
    expect(forms[0]!.usernameInput?.name).toBe("username");
  });
});
