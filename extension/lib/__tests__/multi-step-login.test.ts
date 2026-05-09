// SPDX-License-Identifier: AGPL-3.0-or-later

import { JSDOM } from "jsdom";
import { describe, it, expect } from "vitest";

import { classifyLoginStep, isSameIssuer } from "../multi-step-login";
import { detectForms } from "../form-detector";

function loadHtml(html: string): Document {
  return new JSDOM(html).window.document;
}

describe("classifyLoginStep — multi-step 단계 분류", () => {
  it("current-password 등장 → password step", () => {
    const doc = loadHtml(`<form><input type=password autocomplete=current-password></form>`);
    const forms = detectForms(doc);
    expect(classifyLoginStep(forms, "https://accounts.google.com/signin/v2")).toBe("password");
  });

  it("type=password (autocomplete 없음) → password step", () => {
    const doc = loadHtml(`<form><input type=password name=pwd></form>`);
    const forms = detectForms(doc);
    expect(classifyLoginStep(forms, "https://example.com/login")).toBe("password");
  });

  it("password input 없고 URL path /signin → username step", () => {
    const doc = loadHtml(`<form><input type=email name=email></form>`);
    const forms = detectForms(doc);
    expect(classifyLoginStep(forms, "https://accounts.google.com/signin/identifier")).toBe(
      "username",
    );
  });

  it("password 없고 URL path 도 무관 → unknown", () => {
    const doc = loadHtml(`<form><input type=text name=q></form>`);
    const forms = detectForms(doc);
    expect(classifyLoginStep(forms, "https://example.com/dashboard")).toBe("unknown");
  });

  it("invalid URL → unknown", () => {
    const doc = loadHtml(`<body></body>`);
    const forms = detectForms(doc);
    expect(classifyLoginStep(forms, "not a url")).toBe("unknown");
  });
});

describe("isSameIssuer — multi-step 의 page transition 검증", () => {
  it("같은 hostname → true", () => {
    expect(
      isSameIssuer(
        "https://accounts.google.com/signin",
        "https://accounts.google.com/signin/v2/challenge/pwd",
      ),
    ).toBe(true);
  });

  it("같은 root domain 이지만 다른 subdomain → false (보수적)", () => {
    // multi-step 은 보통 동일 subdomain 안에서 진행 (accounts.google.com).
    expect(isSameIssuer("https://accounts.google.com/", "https://mail.google.com/")).toBe(false);
  });

  it("다른 도메인 → false (phishing 방어)", () => {
    expect(isSameIssuer("https://google.com/", "https://g00gle.com/")).toBe(false);
  });

  it("invalid URL → false", () => {
    expect(isSameIssuer("not a url", "https://example.com/")).toBe(false);
    expect(isSameIssuer("https://example.com/", "")).toBe(false);
  });
});
