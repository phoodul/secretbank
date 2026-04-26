/**
 * JWT lib — verifyToken sanity + use-claim enforcement.
 */
import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { mintTokenPair, verifyToken } from "../src/lib/jwt";
import type { Env } from "../src/env";

const typedEnv = env as unknown as Env;

describe("jwt mint/verify", () => {
  it("mintTokenPair returns a usable access + refresh pair", async () => {
    const pair = await mintTokenPair(typedEnv, "usr_test_123");

    expect(pair.token_type).toBe("Bearer");
    expect(pair.expires_in).toBe(3600);
    expect(pair.access_token.split(".")).toHaveLength(3);
    expect(pair.refresh_token.split(".")).toHaveLength(3);

    const accessClaims = await verifyToken(typedEnv, pair.access_token, "access");
    expect(accessClaims.sub).toBe("usr_test_123");
    expect(accessClaims.use).toBe("access");

    const refreshClaims = await verifyToken(typedEnv, pair.refresh_token, "refresh");
    expect(refreshClaims.sub).toBe("usr_test_123");
    expect(refreshClaims.use).toBe("refresh");
  });

  it("rejects an access token when refresh use is expected (and vice versa)", async () => {
    const pair = await mintTokenPair(typedEnv, "usr_test_456");

    await expect(verifyToken(typedEnv, pair.access_token, "refresh")).rejects.toThrow(
      /unexpected_token_use/,
    );
    await expect(verifyToken(typedEnv, pair.refresh_token, "access")).rejects.toThrow(
      /unexpected_token_use/,
    );
  });

  it("rejects garbage tokens", async () => {
    await expect(verifyToken(typedEnv, "not.a.jwt", "access")).rejects.toThrow();
  });
});
