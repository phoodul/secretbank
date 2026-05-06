import { describe, expect, it } from "vitest";
import { matchIssuerByUrl } from "../match-issuer-by-url";

describe("matchIssuerByUrl", () => {
  // ----- Edge cases: no match / bad input -----

  it("빈 문자열 → undefined", () => {
    expect(matchIssuerByUrl("")).toBeUndefined();
  });

  it("whitespace-only → undefined", () => {
    expect(matchIssuerByUrl("   ")).toBeUndefined();
  });

  it("URL 로 파싱 불가능한 문자열 → undefined", () => {
    expect(matchIssuerByUrl("not a url at all !!!")).toBeUndefined();
  });

  it("매칭 도메인 없는 URL → undefined", () => {
    expect(matchIssuerByUrl("https://example.com")).toBeUndefined();
  });

  // ----- Security: subdomain-safe check -----

  it("evil-stripe.com → undefined (evil prefix, stripe suffix)", () => {
    expect(matchIssuerByUrl("https://evil-stripe.com")).toBeUndefined();
  });

  it("stripe.com.attacker.io → undefined (stripe.com 은 subdomain 이 아닌 부분 문자열)", () => {
    expect(matchIssuerByUrl("https://stripe.com.attacker.io")).toBeUndefined();
  });

  // ----- Exact domain matches -----

  it("https://supabase.com/dashboard → supabase", () => {
    const result = matchIssuerByUrl("https://supabase.com/dashboard");
    expect(result?.slug).toBe("supabase");
  });

  it("https://github.com/settings → github", () => {
    const result = matchIssuerByUrl("https://github.com/settings");
    expect(result?.slug).toBe("github");
  });

  // ----- www stripping -----

  it("https://www.stripe.com → stripe (www 제거 후 매칭)", () => {
    const result = matchIssuerByUrl("https://www.stripe.com");
    expect(result?.slug).toBe("stripe");
  });

  // ----- Subdomain match -----

  it("https://platform.openai.com/account → openai (subdomain)", () => {
    const result = matchIssuerByUrl("https://platform.openai.com/account");
    expect(result?.slug).toBe("openai");
  });

  // ----- Protocol-less input -----

  it("github.com (protocol 없음) → github", () => {
    const result = matchIssuerByUrl("github.com");
    expect(result?.slug).toBe("github");
  });

  // ----- Case-insensitive -----

  it("HTTP://OPENAI.COM/ → openai (대문자)", () => {
    const result = matchIssuerByUrl("HTTP://OPENAI.COM/");
    expect(result?.slug).toBe("openai");
  });

  // ----- Other presets -----

  it("https://vercel.com/account/tokens → vercel", () => {
    const result = matchIssuerByUrl("https://vercel.com/account/tokens");
    expect(result?.slug).toBe("vercel");
  });

  it("https://app.vercel.app → vercel (vercel.app subdomain)", () => {
    const result = matchIssuerByUrl("https://app.vercel.app");
    expect(result?.slug).toBe("vercel");
  });

  it("https://console.anthropic.com/settings/keys → anthropic", () => {
    const result = matchIssuerByUrl("https://console.anthropic.com/settings/keys");
    expect(result?.slug).toBe("anthropic");
  });

  it("https://claude.ai → anthropic (claude.ai 도메인)", () => {
    const result = matchIssuerByUrl("https://claude.ai");
    expect(result?.slug).toBe("anthropic");
  });

  it("https://dash.cloudflare.com/profile/api-tokens → cloudflare", () => {
    const result = matchIssuerByUrl("https://dash.cloudflare.com/profile/api-tokens");
    expect(result?.slug).toBe("cloudflare");
  });

  it("https://my-worker.workers.dev → cloudflare (workers.dev subdomain)", () => {
    const result = matchIssuerByUrl("https://my-worker.workers.dev");
    expect(result?.slug).toBe("cloudflare");
  });

  it("https://console.aws.amazon.com/iam → aws (aws.amazon.com subdomain)", () => {
    const result = matchIssuerByUrl("https://console.aws.amazon.com/iam");
    expect(result?.slug).toBe("aws");
  });

  it("https://s3.amazonaws.com/bucket → aws (amazonaws.com subdomain)", () => {
    const result = matchIssuerByUrl("https://s3.amazonaws.com/bucket");
    expect(result?.slug).toBe("aws");
  });

  it("https://amazon.com → undefined (amazon.com 자체는 매핑 안 됨 — 너무 광범위)", () => {
    expect(matchIssuerByUrl("https://amazon.com")).toBeUndefined();
  });

  it("https://vendors.paddle.com/authentication → paddle", () => {
    const result = matchIssuerByUrl("https://vendors.paddle.com/authentication");
    expect(result?.slug).toBe("paddle");
  });

  it("https://storage.googleapis.com → google (googleapis.com subdomain)", () => {
    const result = matchIssuerByUrl("https://storage.googleapis.com");
    expect(result?.slug).toBe("google");
  });

  it("https://google.com → undefined (google.com 자체는 매핑 안 됨 — 너무 광범위)", () => {
    expect(matchIssuerByUrl("https://google.com")).toBeUndefined();
  });
});
