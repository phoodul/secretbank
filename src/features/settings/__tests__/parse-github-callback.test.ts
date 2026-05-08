import { describe, expect, it } from "vitest";

import { parseGithubCallbackUrl } from "../use-github-integration";

describe("parseGithubCallbackUrl", () => {
  it("parses installation_id from a well-formed callback URL", () => {
    expect(parseGithubCallbackUrl("Secretbank://github/callback?installation_id=12345")).toBe(
      12345,
    );
  });

  it("ignores unrelated query params (setup_action, code, state)", () => {
    expect(
      parseGithubCallbackUrl(
        "Secretbank://github/callback?installation_id=98765&setup_action=install&state=xyz",
      ),
    ).toBe(98765);
  });

  it("returns null when prefix does not match", () => {
    expect(parseGithubCallbackUrl("Secretbank://auth/callback?installation_id=1")).toBeNull();
    expect(parseGithubCallbackUrl("https://example.com/callback?installation_id=1")).toBeNull();
  });

  it("returns null when installation_id is missing", () => {
    expect(parseGithubCallbackUrl("Secretbank://github/callback?setup_action=install")).toBeNull();
  });

  it("rejects non-positive or non-integer installation_id", () => {
    expect(parseGithubCallbackUrl("Secretbank://github/callback?installation_id=0")).toBeNull();
    expect(parseGithubCallbackUrl("Secretbank://github/callback?installation_id=-1")).toBeNull();
    expect(parseGithubCallbackUrl("Secretbank://github/callback?installation_id=abc")).toBeNull();
    expect(parseGithubCallbackUrl("Secretbank://github/callback?installation_id=1.5")).toBeNull();
  });

  it("returns null on malformed URL", () => {
    expect(parseGithubCallbackUrl("not a url")).toBeNull();
  });
});
