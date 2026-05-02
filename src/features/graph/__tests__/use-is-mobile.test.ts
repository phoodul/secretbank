/**
 * T048: Tests for useIsMobile hook.
 *
 * The hook wraps usePlatform() from src/lib/platform.ts.
 * We mock the platform module to control the returned value.
 */

import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useIsMobile", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns desktop when usePlatform returns desktop", async () => {
    vi.doMock("@/lib/platform", () => ({
      usePlatform: () => "desktop",
      getPlatform: () => "desktop",
    }));

    const { useIsMobile } = await import("../use-is-mobile");
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe("desktop");
  });

  it("returns mobile when usePlatform returns mobile", async () => {
    vi.doMock("@/lib/platform", () => ({
      usePlatform: () => "mobile",
      getPlatform: () => "mobile",
    }));

    const { useIsMobile } = await import("../use-is-mobile");
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe("mobile");
  });

  it("returns desktop when usePlatform returns web", async () => {
    vi.doMock("@/lib/platform", () => ({
      usePlatform: () => "web",
      getPlatform: () => "web",
    }));

    const { useIsMobile } = await import("../use-is-mobile");
    const { result } = renderHook(() => useIsMobile());
    // 'web' maps to 'desktop' for graph purposes
    expect(result.current).toBe("desktop");
  });
});
