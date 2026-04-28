import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";

import { parsePairDeepLink, usePairJoiner } from "../use-pair-joiner";

const mockInvoke = vi.mocked(invoke);

describe("parsePairDeepLink", () => {
  it("parses apivault://pair?pin=...&pub=...", () => {
    const r = parsePairDeepLink("apivault://pair?pin=012345&pub=ABC123");
    expect(r).toEqual({ pin: "012345", initiatorPubB64: "ABC123" });
  });

  it("returns null on wrong protocol", () => {
    expect(parsePairDeepLink("https://pair?pin=012345&pub=A")).toBeNull();
  });

  it("returns null on non-numeric or short pin", () => {
    expect(parsePairDeepLink("apivault://pair?pin=abc&pub=A")).toBeNull();
    expect(parsePairDeepLink("apivault://pair?pin=12345&pub=A")).toBeNull();
  });

  it("returns null when pub is missing", () => {
    expect(parsePairDeepLink("apivault://pair?pin=012345")).toBeNull();
  });
});

describe("usePairJoiner (Phase G-pair-4b)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("rejects malformed pin in start()", async () => {
    const { result } = renderHook(() => usePairJoiner({ pollIntervalMs: 50 }));
    await act(async () => {
      await result.current.start({ pin: "abc" });
    });
    expect(result.current.status).toBe("error");
    expect(result.current.errorMessage).toMatch(/6 digits/);
  });

  it("immediately applies when initiator's payload is already there at join", async () => {
    mockInvoke.mockImplementation(async (cmd: unknown) => {
      if (cmd === "sync_pair_joiner_join") {
        return {
          initiator_pub_b64: "INIT_PUB",
          payload_ciphertext_b64: "ENVELOPE",
        };
      }
      if (cmd === "sync_pair_joiner_apply") return "usr_alice";
      throw new Error(`unexpected ${String(cmd)}`);
    });

    const { result } = renderHook(() => usePairJoiner({ pollIntervalMs: 50 }));
    await act(async () => {
      await result.current.start({ pin: "111111" });
    });

    expect(result.current.status).toBe("completed");
    expect(result.current.userId).toBe("usr_alice");
    expect(mockInvoke).toHaveBeenCalledWith(
      "sync_pair_joiner_apply",
      expect.objectContaining({ pin: "111111", payloadCiphertextB64: "ENVELOPE" }),
    );
  });

  it("polls when payload not yet present, then applies on arrival", async () => {
    let pollCount = 0;
    mockInvoke.mockImplementation(async (cmd: unknown) => {
      if (cmd === "sync_pair_joiner_join") {
        return { initiator_pub_b64: "INIT", payload_ciphertext_b64: null };
      }
      if (cmd === "sync_pair_joiner_poll") {
        pollCount++;
        return {
          payload_ciphertext_b64: pollCount >= 1 ? "ENVELOPE2" : null,
        };
      }
      if (cmd === "sync_pair_joiner_apply") return "usr_bob";
      throw new Error(`unexpected ${String(cmd)}`);
    });

    const { result } = renderHook(() => usePairJoiner({ pollIntervalMs: 50 }));
    await act(async () => {
      await result.current.start({ pin: "222222" });
    });
    expect(result.current.status).toBe("waiting_for_payload");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.status).toBe("completed");
    expect(result.current.userId).toBe("usr_bob");
  });

  it("transitions to error when join itself fails", async () => {
    mockInvoke.mockImplementation(async (cmd: unknown) => {
      if (cmd === "sync_pair_joiner_join") {
        throw { code: "channel_expired", message: "expired" };
      }
      throw new Error(`unexpected ${String(cmd)}`);
    });
    const { result } = renderHook(() => usePairJoiner({ pollIntervalMs: 50 }));
    await act(async () => {
      await result.current.start({ pin: "333333" });
    });
    expect(result.current.status).toBe("error");
    expect(result.current.errorMessage).toBe("expired");
  });

  it("cancel sets status='cancelled' and invokes sync_pair_cancel", async () => {
    mockInvoke.mockImplementation(async (cmd: unknown) => {
      if (cmd === "sync_pair_joiner_join") {
        return { initiator_pub_b64: "X", payload_ciphertext_b64: null };
      }
      if (cmd === "sync_pair_joiner_poll") return { payload_ciphertext_b64: null };
      if (cmd === "sync_pair_cancel") return undefined;
      throw new Error(`unexpected ${String(cmd)}`);
    });
    const { result } = renderHook(() => usePairJoiner({ pollIntervalMs: 50 }));
    await act(async () => {
      await result.current.start({ pin: "444444" });
    });
    await act(async () => {
      await result.current.cancel();
    });
    expect(result.current.status).toBe("cancelled");
    expect(mockInvoke).toHaveBeenCalledWith("sync_pair_cancel");
  });
});
