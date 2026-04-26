import { describe, expect, it } from "vitest";

import { resolveSubjectLabel } from "../use-subject-labels";

const EMPTY_MAPS = {
  credentials: new Map<string, string>(),
  projects: new Map<string, string>(),
};

describe("resolveSubjectLabel", () => {
  // ---------------------------------------------------------------------------
  // H2 regression: short literal subject ids must render verbatim.
  // ---------------------------------------------------------------------------

  it("shows literal short ids as-is (vault:default, not vault:efault)", () => {
    expect(resolveSubjectLabel("vault", "default", EMPTY_MAPS)).toBe("vault:default");
  });

  it("shows other non-ulid literal ids as-is", () => {
    expect(resolveSubjectLabel("settings", "auto-lock", EMPTY_MAPS)).toBe(
      "settings:auto-lock",
    );
    expect(resolveSubjectLabel("incident", "feed", EMPTY_MAPS)).toBe("incident:feed");
  });

  // ---------------------------------------------------------------------------
  // Existing behavior: ULID-shaped ids still get tail-truncated to 6 chars.
  // ---------------------------------------------------------------------------

  it("truncates a 26-char ULID to its last 6 characters", () => {
    const ulid = "01HXY7Q3X8WJZ5VK0NMA2C9F3R"; // 26 chars, Crockford
    expect(resolveSubjectLabel("issuer", ulid, EMPTY_MAPS)).toBe("issuer:2C9F3R");
  });

  it("falls back to credential:<short-ulid> when no name is registered", () => {
    const ulid = "01HXY7Q3X8WJZ5VK0NMA2C9F3R";
    expect(resolveSubjectLabel("credential", ulid, EMPTY_MAPS)).toBe(
      "credential:2C9F3R",
    );
  });

  it("returns 'name (…ulid)' when the credential name is known", () => {
    const ulid = "01HXY7Q3X8WJZ5VK0NMA2C9F3R";
    const maps = {
      credentials: new Map([[ulid, "OpenAI Prod"]]),
      projects: new Map<string, string>(),
    };
    expect(resolveSubjectLabel("credential", ulid, maps)).toBe(
      "OpenAI Prod (…2C9F3R)",
    );
  });

  it("returns 'name (…ulid)' when the project name is known", () => {
    const ulid = "01HXY7Q3X8WJZ5VK0NMA2C9F3R";
    const maps = {
      credentials: new Map<string, string>(),
      projects: new Map([[ulid, "checkout-svc"]]),
    };
    expect(resolveSubjectLabel("project", ulid, maps)).toBe(
      "checkout-svc (…2C9F3R)",
    );
  });

  // ---------------------------------------------------------------------------
  // Edge cases on the ULID shape detector.
  // ---------------------------------------------------------------------------

  it("treats 25-char and 27-char strings as literal (not ULIDs)", () => {
    const tooShort = "01HXY7Q3X8WJZ5VK0NMA2C9F3"; // 25
    const tooLong = "01HXY7Q3X8WJZ5VK0NMA2C9F3RR"; // 27
    expect(resolveSubjectLabel("misc", tooShort, EMPTY_MAPS)).toBe(`misc:${tooShort}`);
    expect(resolveSubjectLabel("misc", tooLong, EMPTY_MAPS)).toBe(`misc:${tooLong}`);
  });
});
