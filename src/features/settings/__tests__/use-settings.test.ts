import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";

import { AUTO_LOCK_KEY, useAutoLockMinutes, useSetting } from "../use-settings";

const mockInvoke = vi.mocked(invoke);

describe("useSetting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  // 1. 마운트 시 settings_get 호출
  it("마운트 시 settings_get 을 호출한다", async () => {
    mockInvoke.mockResolvedValueOnce(null);

    renderHook(() =>
      useSetting({
        key: "test.key",
        defaultValue: "default",
        parse: (r) => r,
        serialize: (v) => v,
      }),
    );

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("settings_get", { key: "test.key" });
    });
  });

  // 2. settings_get 반환값 파싱
  it("settings_get 이 값을 반환하면 parse 결과를 value 로 노출한다", async () => {
    mockInvoke.mockResolvedValueOnce("42");

    const { result } = renderHook(() =>
      useSetting({
        key: "test.num",
        defaultValue: 0,
        parse: (r) => Number(r),
        serialize: (v) => String(v),
      }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.value).toBe(42);
  });

  // 3. setValue → settings_set 호출 + 낙관적 업데이트
  it("setValue 호출 시 settings_set invoke 를 호출하고 낙관적 업데이트한다", async () => {
    mockInvoke.mockResolvedValueOnce("5"); // settings_get
    mockInvoke.mockResolvedValueOnce(undefined); // settings_set

    const { result } = renderHook(() =>
      useSetting({
        key: "test.num",
        defaultValue: 0,
        parse: (r) => Number(r),
        serialize: (v) => String(v),
      }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.setValue(99);
    });

    expect(mockInvoke).toHaveBeenCalledWith("settings_set", { key: "test.num", value: "99" });
    expect(result.current.value).toBe(99);
  });

  // 4. settings_set 실패 → 이전 값 복원 + toast.error
  it("settings_set 실패 시 이전 값으로 복원하고 toast.error 를 호출한다", async () => {
    mockInvoke.mockResolvedValueOnce("5"); // settings_get
    mockInvoke.mockRejectedValueOnce(new Error("db error")); // settings_set

    const { result } = renderHook(() =>
      useSetting({
        key: "test.num",
        defaultValue: 0,
        parse: (r) => Number(r),
        serialize: (v) => String(v),
      }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.value).toBe(5);

    await act(async () => {
      await result.current.setValue(99);
    });

    // 복원
    expect(result.current.value).toBe(5);
    expect(toast.error).toHaveBeenCalled();
  });
});

describe("useAutoLockMinutes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 5. AUTO_LOCK_KEY 로 settings_get 호출
  it("마운트 시 AUTO_LOCK_KEY 로 settings_get 을 호출한다", async () => {
    mockInvoke.mockResolvedValueOnce(null);
    renderHook(() => useAutoLockMinutes());

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("settings_get", { key: AUTO_LOCK_KEY });
    });
  });

  // 6. null 반환 시 기본값 5
  it("settings_get 이 null 이면 defaultValue=5 를 반환한다", async () => {
    mockInvoke.mockResolvedValueOnce(null);
    const { result } = renderHook(() => useAutoLockMinutes());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.value).toBe(5);
  });

  // 7. "30" 반환 시 30 파싱
  it('settings_get 이 "30" 이면 value=30 을 반환한다', async () => {
    mockInvoke.mockResolvedValueOnce("30");
    const { result } = renderHook(() => useAutoLockMinutes());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.value).toBe(30);
  });

  // 8. 잘못된 값이면 기본값 5 로 폴백
  it("settings_get 이 유효하지 않은 값이면 5 로 폴백한다", async () => {
    mockInvoke.mockResolvedValueOnce("999");
    const { result } = renderHook(() => useAutoLockMinutes());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.value).toBe(5);
  });
});
