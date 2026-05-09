// SPDX-License-Identifier: AGPL-3.0-or-later

import { JSDOM } from "jsdom";
import { describe, it, expect, beforeEach, vi } from "vitest";

import {
  autofillForm,
  fillInput,
  type AutofillTransport,
  type RevealedCredential,
} from "../autofill";
import type { DetectedForm } from "../form-detector";

function makeForm(doc: Document): DetectedForm {
  const form = doc.createElement("form");
  const username = doc.createElement("input");
  username.type = "text";
  username.name = "username";
  const password = doc.createElement("input");
  password.type = "password";
  password.name = "password";
  form.appendChild(username);
  form.appendChild(password);
  doc.body.appendChild(form);
  return {
    formEl: form,
    passwordInput: password,
    passwordPriority: "current-password",
    usernameInput: username,
    usernamePriority: "autocomplete",
  };
}

describe("autofillForm — 흐름", () => {
  let doc: Document;
  let form: DetectedForm;
  let transport: AutofillTransport;
  let revealSpy: ReturnType<
    typeof vi.fn<
      (args: { pageUrl: string; pageHost: string }) => Promise<RevealedCredential | null>
    >
  >;

  beforeEach(() => {
    const dom = new JSDOM("<!doctype html><html><body></body></html>");
    doc = dom.window.document;
    form = makeForm(doc);
    revealSpy =
      vi.fn<(args: { pageUrl: string; pageHost: string }) => Promise<RevealedCredential | null>>();
    transport = { requestReveal: revealSpy };
  });

  it("HTTPS + 도메인 매치 + reveal 성공 → filled", async () => {
    revealSpy.mockResolvedValue({
      credentialId: "cred-1",
      username: "alice@example.com",
      password: "S3cret!",
      issuerHost: "google.com",
    });

    const result = await autofillForm(form, {
      pageUrl: "https://accounts.google.com/signin",
      transport,
    });

    expect(result).toEqual({
      kind: "filled",
      credentialId: "cred-1",
      usernameSet: true,
    });
    expect(form.passwordInput.value).toBe("S3cret!");
    expect(form.usernameInput?.value).toBe("alice@example.com");
  });

  it("HTTP URL → no_match (https 거부)", async () => {
    const result = await autofillForm(form, {
      pageUrl: "http://example.com/login",
      transport,
    });
    expect(result).toEqual({ kind: "no_match", reason: "https" });
    expect(revealSpy).not.toHaveBeenCalled();
  });

  it("issuer 도메인 mismatch (phishing) → no_match host", async () => {
    revealSpy.mockResolvedValue({
      credentialId: "cred-1",
      password: "x",
      issuerHost: "google.com",
    });
    const result = await autofillForm(form, {
      pageUrl: "https://g00gle.com/login",
      transport,
    });
    expect(result).toEqual({ kind: "no_match", reason: "host" });
    // password input 은 비어있어야 함 (fill 시도 ❌).
    expect(form.passwordInput.value).toBe("");
  });

  it("reveal 응답 null → no_match no_credential", async () => {
    revealSpy.mockResolvedValue(null);
    const result = await autofillForm(form, {
      pageUrl: "https://example.com/login",
      transport,
    });
    expect(result).toEqual({ kind: "no_match", reason: "no_credential" });
  });

  it("reveal 도중 timeout 에러 → reveal_failed session_expired", async () => {
    const err = Object.assign(new Error("timeout"), { i18nKey: "nm_error_timeout" });
    revealSpy.mockRejectedValue(err);
    const result = await autofillForm(form, {
      pageUrl: "https://example.com/login",
      transport,
    });
    expect(result).toEqual({
      kind: "reveal_failed",
      reason: "session_expired",
    });
  });

  it("reveal 도중 generic 에러 → reveal_failed transport", async () => {
    revealSpy.mockRejectedValue(new Error("boom"));
    const result = await autofillForm(form, {
      pageUrl: "https://example.com/login",
      transport,
    });
    expect(result).toEqual({ kind: "reveal_failed", reason: "transport" });
  });

  it("username 없으면 password 만 fill, usernameSet=false", async () => {
    // username input 제거.
    form.usernameInput = null;
    form.usernamePriority = null;
    revealSpy.mockResolvedValue({
      credentialId: "cred-2",
      password: "P@ss",
      issuerHost: "example.com",
    });
    const result = await autofillForm(form, {
      pageUrl: "https://example.com/login",
      transport,
    });
    expect(result).toEqual({
      kind: "filled",
      credentialId: "cred-2",
      usernameSet: false,
    });
    expect(form.passwordInput.value).toBe("P@ss");
  });

  it("revealed 에 username 없으면 usernameSet=false 그대로", async () => {
    revealSpy.mockResolvedValue({
      credentialId: "c",
      password: "x",
      issuerHost: "example.com",
    });
    const result = await autofillForm(form, {
      pageUrl: "https://example.com/login",
      transport,
    });
    expect(result).toEqual({
      kind: "filled",
      credentialId: "c",
      usernameSet: false,
    });
    expect(form.usernameInput?.value).toBe(""); // 변경 ❌
  });
});

describe("fillInput — input/change event dispatch", () => {
  it("value 설정 + input + change event 발생", () => {
    const dom = new JSDOM("<!doctype html><html><body></body></html>");
    const input = dom.window.document.createElement("input");
    input.type = "password";

    const events: string[] = [];
    input.addEventListener("input", () => events.push("input"));
    input.addEventListener("change", () => events.push("change"));

    fillInput(input, "S3cret");

    expect(input.value).toBe("S3cret");
    expect(events).toEqual(["input", "change"]);
  });
});
