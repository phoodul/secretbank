import { describe, expect, it } from "vitest";

import { parseOAuthCallbackUrl } from "../use-deep-link-callback";

describe("parseOAuthCallbackUrl", () => {
  it("parses well-formed callback URL with provider/code/state", () => {
    const url =
      "apivault://auth/callback?provider=github&code=the-code&state=deadbeef";
    expect(parseOAuthCallbackUrl(url)).toEqual({
      provider: "github",
      code: "the-code",
      state: "deadbeef",
    });
  });

  it("returns null when scheme/path do not match", () => {
    expect(
      parseOAuthCallbackUrl("https://example.com/callback?code=x&state=y"),
    ).toBeNull();
    expect(
      parseOAuthCallbackUrl("apivault://other?provider=google&code=x&state=y"),
    ).toBeNull();
  });

  it("returns null when any required param is missing", () => {
    expect(
      parseOAuthCallbackUrl("apivault://auth/callback?code=x&state=y"),
    ).toBeNull();
    expect(
      parseOAuthCallbackUrl(
        "apivault://auth/callback?provider=github&state=y",
      ),
    ).toBeNull();
    expect(
      parseOAuthCallbackUrl(
        "apivault://auth/callback?provider=github&code=x",
      ),
    ).toBeNull();
  });

  it("returns null on malformed URL", () => {
    expect(parseOAuthCallbackUrl("not a url")).toBeNull();
  });
});
