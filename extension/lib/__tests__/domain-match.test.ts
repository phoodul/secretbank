// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, it, expect } from "vitest";
import { matchesIssuer, hostFromHttpsUrl } from "../domain-match";

describe("matchesIssuer — phishing 방어", () => {
  it("정확 일치 (root host)", () => {
    expect(matchesIssuer("google.com", "google.com")).toBe(true);
  });

  it("subdomain 매치 (accounts.google.com → google.com)", () => {
    expect(matchesIssuer("accounts.google.com", "google.com")).toBe(true);
    expect(matchesIssuer("mail.google.com", "google.com")).toBe(true);
    expect(matchesIssuer("a.b.c.google.com", "google.com")).toBe(true);
  });

  it("homograph / typo 거부", () => {
    expect(matchesIssuer("g00gle.com", "google.com")).toBe(false);
    expect(matchesIssuer("googel.com", "google.com")).toBe(false);
  });

  it("evil prefix 거부 (evilgoogle.com 은 google.com 의 subdomain ❌)", () => {
    expect(matchesIssuer("evilgoogle.com", "google.com")).toBe(false);
    expect(matchesIssuer("notgoogle.com", "google.com")).toBe(false);
  });

  it("cross-TLD 거부 (google.co 는 google.com 와 무관)", () => {
    expect(matchesIssuer("google.co", "google.com")).toBe(false);
    expect(matchesIssuer("google.org", "google.com")).toBe(false);
  });

  it("대소문자 무시", () => {
    expect(matchesIssuer("ACCOUNTS.GOOGLE.COM", "google.com")).toBe(true);
    expect(matchesIssuer("Google.com", "GOOGLE.COM")).toBe(true);
  });

  it("trailing dot 정규화", () => {
    expect(matchesIssuer("google.com.", "google.com")).toBe(true);
    expect(matchesIssuer("accounts.google.com..", "google.com.")).toBe(true);
  });

  it("빈 문자열 거부", () => {
    expect(matchesIssuer("", "google.com")).toBe(false);
    expect(matchesIssuer("google.com", "")).toBe(false);
    expect(matchesIssuer("", "")).toBe(false);
  });
});

describe("hostFromHttpsUrl", () => {
  it("HTTPS URL 의 host 반환", () => {
    expect(hostFromHttpsUrl("https://accounts.google.com/signin")).toBe("accounts.google.com");
  });

  it("HTTP URL 거부 (autofill 보안)", () => {
    expect(hostFromHttpsUrl("http://example.com")).toBeNull();
  });

  it("invalid URL → null", () => {
    expect(hostFromHttpsUrl("not a url")).toBeNull();
    expect(hostFromHttpsUrl("")).toBeNull();
  });

  it("file:// / chrome-extension:// 거부", () => {
    expect(hostFromHttpsUrl("file:///etc/passwd")).toBeNull();
    expect(hostFromHttpsUrl("chrome-extension://abc/popup.html")).toBeNull();
  });

  it("host 소문자 + trailing dot 제거", () => {
    expect(hostFromHttpsUrl("https://Google.com.")).toBe("google.com");
  });
});
