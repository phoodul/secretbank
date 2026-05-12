import { describe, expect, it } from "vitest";

import { parseOAuthCallbackUrl } from "../use-deep-link-callback";

describe("parseOAuthCallbackUrl — loopback HTTP callback", () => {
  it("parses well-formed loopback callback (provider via event field)", () => {
    expect(
      parseOAuthCallbackUrl({
        provider: "github",
        url: "http://127.0.0.1:8765/?code=the-code&state=deadbeef",
      }),
    ).toEqual({
      provider: "github",
      code: "the-code",
      state: "deadbeef",
    });
  });

  it("accepts localhost as well as 127.0.0.1", () => {
    expect(
      parseOAuthCallbackUrl({
        provider: "google",
        url: "http://localhost:54321/?code=c&state=s",
      }),
    ).toEqual({ provider: "google", code: "c", state: "s" });
  });

  it("rejects non-loopback host (anti-CSRF)", () => {
    expect(
      parseOAuthCallbackUrl({
        provider: "google",
        url: "https://evil.com/?code=x&state=y",
      }),
    ).toBeNull();
  });

  it("returns null when code/state missing", () => {
    expect(
      parseOAuthCallbackUrl({ provider: "github", url: "http://127.0.0.1:8765/?state=y" }),
    ).toBeNull();
    expect(
      parseOAuthCallbackUrl({ provider: "github", url: "http://127.0.0.1:8765/?code=x" }),
    ).toBeNull();
  });

  it("returns null when provider missing", () => {
    expect(
      parseOAuthCallbackUrl({ provider: "", url: "http://127.0.0.1:8765/?code=x&state=y" }),
    ).toBeNull();
  });

  it("returns null on malformed URL", () => {
    expect(parseOAuthCallbackUrl({ provider: "github", url: "not a url" })).toBeNull();
  });
});
