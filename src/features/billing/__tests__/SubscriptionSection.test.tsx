import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import "@/lib/i18n";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { invoke } from "@tauri-apps/api/core";
import { SubscriptionSection } from "../SubscriptionSection";

const mockInvoke = vi.mocked(invoke);

function renderSection() {
  return render(
    <MemoryRouter>
      <SubscriptionSection />
    </MemoryRouter>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SubscriptionSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  // (a) Free 상태 렌더 — tier = free
  it("Free 상태: Free 배지가 표시된다", async () => {
    mockInvoke.mockResolvedValue({ tier: "free", pro_until: null, from_cache: false });
    renderSection();

    await waitFor(() => {
      expect(screen.getByText(/Free/i)).toBeInTheDocument();
    });
  });

  // (b) Pro 상태 렌더 — tier = pro
  it("Pro 상태: Pro 배지가 표시된다", async () => {
    const futureMs = Date.now() + 30 * 24 * 60 * 60 * 1000;
    mockInvoke.mockResolvedValue({
      tier: "pro",
      pro_until: futureMs,
      from_cache: false,
    });
    renderSection();

    // aria-label="Current plan" 인 badge 에 "Pro" 텍스트가 있는지 확인
    await waitFor(() => {
      const badge = screen.getByRole("generic", { name: /current plan/i });
      expect(badge.textContent).toMatch(/Pro/i);
    });
  });

  // (c) Set Pro 버튼 → entitlement_set_dev 호출
  it("날짜 입력 후 Set 버튼 클릭 시 entitlement_set_dev 가 호출된다", async () => {
    // Initial load: free
    mockInvoke.mockResolvedValueOnce({ tier: "free", pro_until: null, from_cache: false });
    // After setDev: pro
    mockInvoke.mockResolvedValueOnce(undefined); // entitlement_set_dev
    mockInvoke.mockResolvedValueOnce({ tier: "pro", pro_until: Date.now() + 86400000, from_cache: false }); // refresh

    const user = userEvent.setup();
    renderSection();

    await waitFor(() => {
      expect(screen.getByText(/Free/i)).toBeInTheDocument();
    });

    // "Set" 버튼은 여러 개일 수 있으므로 첫 번째(Set Pro 버튼) 사용
    const setButtons = screen.getAllByRole("button", { name: /^set$/i });
    await user.click(setButtons[0]);

    await waitFor(() => {
      const setCalls = mockInvoke.mock.calls.filter((c) => c[0] === "entitlement_set_dev");
      expect(setCalls.length).toBeGreaterThan(0);
      const payload = setCalls[0][1] as { input: { pro_until_unix_ms: number | null } };
      expect(payload.input.pro_until_unix_ms).toBeTypeOf("number");
    });
  });

  // (d) Reset to Free 버튼 → entitlement_set_dev with null
  it("Reset to Free 버튼 클릭 시 pro_until_unix_ms = null 로 entitlement_set_dev 가 호출된다", async () => {
    mockInvoke.mockResolvedValueOnce({
      tier: "pro",
      pro_until: Date.now() + 86400000,
      from_cache: false,
    });
    mockInvoke.mockResolvedValueOnce(undefined); // entitlement_set_dev
    mockInvoke.mockResolvedValueOnce({ tier: "free", pro_until: null, from_cache: false });

    const user = userEvent.setup();
    renderSection();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /reset/i })).toBeInTheDocument();
    });

    const resetBtn = screen.getByRole("button", { name: /reset/i });
    await user.click(resetBtn);

    await waitFor(() => {
      const setCalls = mockInvoke.mock.calls.filter((c) => c[0] === "entitlement_set_dev");
      expect(setCalls.length).toBeGreaterThan(0);
      const payload = setCalls[0][1] as { input: { pro_until_unix_ms: number | null } };
      expect(payload.input.pro_until_unix_ms).toBeNull();
    });
  });

  // (f) I1 회귀 — "Current plan" 라벨이 Badge 와 같은 컨테이너에 인접 배치된다
  it("I1: 'Current plan' 라벨과 tier 배지가 같은 그룹 안에 인접 렌더된다", async () => {
    mockInvoke.mockResolvedValue({
      tier: "pro",
      pro_until: Date.now() + 86400000,
      from_cache: false,
    });
    renderSection();

    const group = await screen.findByTestId("current-plan-group");
    // Label and badge must both live inside the same group element
    expect(group.textContent ?? "").toMatch(/Current plan/i);
    expect(group.textContent ?? "").toMatch(/Pro/i);
    // The aria-labelled badge must be a descendant of the group (adjacency proof)
    const badge = screen.getByRole("generic", { name: /current plan/i });
    expect(group.contains(badge)).toBe(true);
  });

  // (g) I2 회귀 — Pro 활성 시 disabled "Upgrade to Pro" 버튼은 노출되지 않는다
  it("I2: Pro 활성 시 'Upgrade to Pro' 버튼이 렌더되지 않는다", async () => {
    mockInvoke.mockResolvedValue({
      tier: "pro",
      pro_until: Date.now() + 86400000,
      from_cache: false,
    });
    renderSection();

    // Wait for the Pro badge to confirm tier resolution finished
    await waitFor(() => {
      const badge = screen.getByRole("generic", { name: /current plan/i });
      expect(badge.textContent).toMatch(/Pro/i);
    });

    // Upgrade button must be absent
    expect(screen.queryByRole("button", { name: /upgrade to pro/i })).toBeNull();
  });

  // (h) I2 회귀 — Free 일 때는 disabled "Upgrade to Pro" 버튼이 여전히 노출된다
  it("I2: Free 상태에서는 'Upgrade to Pro' disabled 버튼이 노출된다", async () => {
    mockInvoke.mockResolvedValue({ tier: "free", pro_until: null, from_cache: false });
    renderSection();

    const upgradeBtn = await screen.findByRole("button", { name: /upgrade to pro/i });
    expect(upgradeBtn).toBeDisabled();
  });

  // (e) 5분 자동 refresh 동작 (fake timer)
  it("5분 후 자동으로 entitlement_current 가 재호출된다", async () => {
    vi.useFakeTimers();

    mockInvoke.mockResolvedValue({ tier: "free", pro_until: null, from_cache: false });
    renderSection();

    // Initial load
    await act(async () => {
      await Promise.resolve();
    });

    const initialCallCount = mockInvoke.mock.calls.filter(
      (c) => c[0] === "entitlement_current",
    ).length;
    expect(initialCallCount).toBeGreaterThanOrEqual(1);

    // Advance 5 minutes
    await act(async () => {
      vi.advanceTimersByTime(5 * 60 * 1000 + 100);
      await Promise.resolve();
    });

    const afterCallCount = mockInvoke.mock.calls.filter(
      (c) => c[0] === "entitlement_current",
    ).length;
    expect(afterCallCount).toBeGreaterThan(initialCallCount);

    vi.useRealTimers();
  });
});
