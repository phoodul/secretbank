/**
 * use-pair-initiator — Phase G-pair-4a 회귀.
 *
 * fake timers + mock invoke 로 polling 흐름을 격리 검증.
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";

import { buildPairDeepLink, usePairInitiator } from "../use-pair-initiator";

const mockInvoke = vi.mocked(invoke);

describe("buildPairDeepLink", () => {
  it("returns apivault://pair?pin=<pin>&pub=<pub>", () => {
    const link = buildPairDeepLink("012345", "ABCxyz_-=");
    expect(link.startsWith("apivault://pair?")).toBe(true);
    expect(link).toContain("pin=012345");
    expect(link).toContain("pub=ABCxyz_-%3D"); // = is percent-encoded
  });
});

describe("usePairInitiator (Phase G-pair-4a)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("start sets status='waiting_for_joiner' with pin + deepLink", async () => {
    mockInvoke.mockImplementation(async (cmd: unknown) => {
      if (cmd === "sync_pair_initiator_start") {
        return { pin: "111111", initiator_pub_b64: "ABC" };
      }
      throw new Error(`unexpected ${String(cmd)}`);
    });

    const { result } = renderHook(() => usePairInitiator({ pollIntervalMs: 100 }));

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.status).toBe("waiting_for_joiner");
    expect(result.current.pin).toBe("111111");
    expect(result.current.deepLink).toContain("pin=111111");
  });

  it("transitions to 'completed' once joiner_pub arrives via polling", async () => {
    mockInvoke.mockImplementation(async (cmd: unknown) => {
      if (cmd === "sync_pair_initiator_start") {
        return { pin: "222222", initiator_pub_b64: "AAA" };
      }
      if (cmd === "sync_pair_initiator_poll") {
        return { joiner_pub_b64: "JOINER_PUB" };
      }
      if (cmd === "sync_pair_initiator_finalize") {
        return undefined;
      }
      throw new Error(`unexpected ${String(cmd)}`);
    });

    const { result } = renderHook(() => usePairInitiator({ pollIntervalMs: 50 }));

    await act(async () => {
      await result.current.start();
    });
    expect(result.current.status).toBe("waiting_for_joiner");

    // polling 1회 → joiner_pub 즉시 → finalize → completed.
    // microtask drain 을 위해 Promise.resolve 두 번 추가 (poll → finalize).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.status).toBe("completed");
    expect(mockInvoke).toHaveBeenCalledWith(
      "sync_pair_initiator_finalize",
      expect.objectContaining({ pin: "222222", joinerPubB64: "JOINER_PUB" }),
    );
  });

  it("transitions to 'error' when start fails", async () => {
    mockInvoke.mockImplementation(async (cmd: unknown) => {
      if (cmd === "sync_pair_initiator_start") {
        const err = { code: "no_sync_session", message: "sign in first" };
        throw err;
      }
      throw new Error(`unexpected ${String(cmd)}`);
    });
    const { result } = renderHook(() => usePairInitiator({ pollIntervalMs: 100 }));
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.status).toBe("error");
    expect(result.current.errorMessage).toBe("sign in first");
  });

  it("cancel sets status='cancelled' and invokes sync_pair_cancel", async () => {
    mockInvoke.mockImplementation(async (cmd: unknown) => {
      if (cmd === "sync_pair_initiator_start") return { pin: "333333", initiator_pub_b64: "X" };
      if (cmd === "sync_pair_initiator_poll") return { joiner_pub_b64: null };
      if (cmd === "sync_pair_cancel") return undefined;
      throw new Error(`unexpected ${String(cmd)}`);
    });
    const { result } = renderHook(() => usePairInitiator({ pollIntervalMs: 100 }));
    await act(async () => {
      await result.current.start();
    });

    await act(async () => {
      await result.current.cancel();
    });
    expect(result.current.status).toBe("cancelled");
    expect(mockInvoke).toHaveBeenCalledWith("sync_pair_cancel");
  });

  it("polling errors are surfaced but polling continues", async () => {
    let pollCount = 0;
    mockInvoke.mockImplementation(async (cmd: unknown) => {
      if (cmd === "sync_pair_initiator_start") return { pin: "444444", initiator_pub_b64: "Y" };
      if (cmd === "sync_pair_initiator_poll") {
        pollCount++;
        if (pollCount === 1) {
          throw { code: "rate_limited", message: "wait" };
        }
        return { joiner_pub_b64: null };
      }
      throw new Error(`unexpected ${String(cmd)}`);
    });
    const { result } = renderHook(() => usePairInitiator({ pollIntervalMs: 50 }));
    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60);
    });
    expect(pollCount).toBe(1);
    expect(result.current.status).toBe("waiting_for_joiner");
    expect(result.current.errorMessage).toBe("wait");

    // 다음 polling 도 정상 진행
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60);
    });
    expect(pollCount).toBe(2);
    expect(result.current.status).toBe("waiting_for_joiner");
  });
});
