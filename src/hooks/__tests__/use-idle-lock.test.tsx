import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// useAutoLockMinutes 모킹 — renderHook rerender 로 값 변경 가능
vi.mock("@/features/settings/use-settings", () => ({
  useAutoLockMinutes: vi.fn(),
}));

// invoke 모킹
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";
import { useAutoLockMinutes } from "@/features/settings/use-settings";
import type { AutoLockMinutes } from "@/features/settings/use-settings";
import { useIdleLock } from "../use-idle-lock";

const mockInvoke = vi.mocked(invoke);
const mockUseAutoLockMinutes = vi.mocked(useAutoLockMinutes);

/** Promise/microtask 큐를 비운다 — fake timers 환경에서 queueMicrotask 사용 */
const flushPromises = () => new Promise<void>((r) => queueMicrotask(r));

/** useAutoLockMinutes 반환값 헬퍼 */
function makeMinutes(value: AutoLockMinutes) {
  return { value, loading: false, setValue: vi.fn() };
}

describe("useIdleLock", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mockInvoke.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // -----------------------------------------------------------------------
  // 1. minutes=0 (Never): 리스너/타이머 없음
  // -----------------------------------------------------------------------
  it("minutes=0이면 1시간 경과해도 invoke를 호출하지 않는다", () => {
    mockUseAutoLockMinutes.mockReturnValue(makeMinutes(0));
    renderHook(() => useIdleLock());

    vi.advanceTimersByTime(60 * 60 * 1000);

    expect(mockInvoke).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // 2. minutes=5: 5분 경과 후 vault_lock 호출
  // -----------------------------------------------------------------------
  it("minutes=5이면 5분 경과 후 invoke('vault_lock')을 호출한다", async () => {
    mockUseAutoLockMinutes.mockReturnValue(makeMinutes(5));
    renderHook(() => useIdleLock());

    // 5분 경과
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);

    expect(mockInvoke).toHaveBeenCalledWith("vault_lock");
  });

  // -----------------------------------------------------------------------
  // 3. mousemove 이벤트로 타이머 리셋
  // -----------------------------------------------------------------------
  it("2분 후 mousemove 발생 시 타이머 리셋 — 추가 5분 후에 invoke 호출", async () => {
    mockUseAutoLockMinutes.mockReturnValue(makeMinutes(5));
    renderHook(() => useIdleLock());

    // 2분 경과
    await vi.advanceTimersByTimeAsync(2 * 60 * 1000);
    expect(mockInvoke).not.toHaveBeenCalled();

    // mousemove → 타이머 리셋
    window.dispatchEvent(new MouseEvent("mousemove"));

    // 추가 4분 59초 경과 (리셋 후 아직 5분 미만)
    await vi.advanceTimersByTimeAsync(4 * 60 * 1000 + 59 * 1000);
    expect(mockInvoke).not.toHaveBeenCalled();

    // 추가 1초 → 리셋 후 정확히 5분 경과
    await vi.advanceTimersByTimeAsync(1000);
    expect(mockInvoke).toHaveBeenCalledWith("vault_lock");
  });

  // -----------------------------------------------------------------------
  // 4. keydown 이벤트로 타이머 리셋
  // -----------------------------------------------------------------------
  it("keydown 이벤트 발생 시 타이머가 리셋되어 5분 내에 invoke 안 함", async () => {
    mockUseAutoLockMinutes.mockReturnValue(makeMinutes(5));
    renderHook(() => useIdleLock());

    // 4분 경과 후 keydown
    await vi.advanceTimersByTimeAsync(4 * 60 * 1000);
    window.dispatchEvent(new KeyboardEvent("keydown"));

    // 추가 4분 경과 (리셋 후 4분 — 아직 5분 미만)
    await vi.advanceTimersByTimeAsync(4 * 60 * 1000);
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // 5. touchstart 이벤트로 타이머 리셋
  // -----------------------------------------------------------------------
  it("touchstart 이벤트 발생 시 타이머가 리셋된다", async () => {
    mockUseAutoLockMinutes.mockReturnValue(makeMinutes(5));
    renderHook(() => useIdleLock());

    // 4분 경과 후 touchstart
    await vi.advanceTimersByTimeAsync(4 * 60 * 1000);
    window.dispatchEvent(new TouchEvent("touchstart"));

    // 추가 4분 경과 — invoke 없음
    await vi.advanceTimersByTimeAsync(4 * 60 * 1000);
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // 6. lock 후 "vault-lock" CustomEvent dispatch 검증
  // -----------------------------------------------------------------------
  it("vault_lock 성공 후 'vault-lock' CustomEvent를 dispatch한다", async () => {
    mockUseAutoLockMinutes.mockReturnValue(makeMinutes(5));
    mockInvoke.mockResolvedValue(undefined);

    const dispatchSpy = vi.spyOn(window, "dispatchEvent");

    renderHook(() => useIdleLock());

    // 5분 경과 → setTimeout 콜백 실행
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    // invoke() Promise resolve → dispatchEvent 호출을 microtask 큐에서 flush
    await flushPromises();

    expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ type: "vault-lock" }));
  });

  // -----------------------------------------------------------------------
  // 7. minutes 5→0 변경 시 타이머/리스너 해제
  // -----------------------------------------------------------------------
  it("minutes가 5→0으로 변경되면 기존 타이머가 해제되어 invoke를 호출하지 않는다", async () => {
    mockUseAutoLockMinutes.mockReturnValue(makeMinutes(5));
    const { rerender } = renderHook(() => useIdleLock());

    // 3분 경과 (아직 lock 안 됨)
    await vi.advanceTimersByTimeAsync(3 * 60 * 1000);
    expect(mockInvoke).not.toHaveBeenCalled();

    // minutes=0 으로 변경 → effect cleanup + early return
    mockUseAutoLockMinutes.mockReturnValue(makeMinutes(0));
    rerender();

    // 추가 3분 경과 (기존 타이머가 해제됐으므로 invoke 없음)
    await vi.advanceTimersByTimeAsync(3 * 60 * 1000);
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // 8. unmount 시 리스너 cleanup 검증
  // -----------------------------------------------------------------------
  it("unmount 시 window.removeEventListener를 호출한다", () => {
    mockUseAutoLockMinutes.mockReturnValue(makeMinutes(5));

    const removeListenerSpy = vi.spyOn(window, "removeEventListener");

    const { unmount } = renderHook(() => useIdleLock());
    unmount();

    // mousemove, keydown, touchstart, wheel, scroll — 5개 이벤트
    expect(removeListenerSpy).toHaveBeenCalledTimes(5);
  });

  // -----------------------------------------------------------------------
  // 9. invoke 실패 시 console.error 호출, 크래시 없음
  // -----------------------------------------------------------------------
  it("invoke가 reject되면 console.error를 호출하고 앱이 크래시하지 않는다", async () => {
    mockUseAutoLockMinutes.mockReturnValue(makeMinutes(5));
    mockInvoke.mockRejectedValue(new Error("lock failed"));

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    renderHook(() => useIdleLock());

    // 5분 경과 → setTimeout 콜백 실행
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    // invoke() reject → catch 블록을 microtask 큐에서 flush
    await flushPromises();

    expect(errorSpy).toHaveBeenCalledWith("auto-lock failed", expect.any(Error));

    errorSpy.mockRestore();
  });
});
