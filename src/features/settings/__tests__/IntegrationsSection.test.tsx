import { render, screen, waitFor } from "@testing-library/react";
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

vi.mock("@tauri-apps/plugin-shell", () => ({
  open: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { IntegrationsSection } from "../IntegrationsSection";

const mockInvoke = vi.mocked(invoke);

function renderSection() {
  return render(
    <MemoryRouter>
      <IntegrationsSection />
    </MemoryRouter>,
  );
}

// Helper: 잠금 해제 상태 + 키 없음 기본 설정
function setupUnlockedNoKey() {
  mockInvoke
    .mockResolvedValueOnce({ state: "unlocked" }) // vault_status
    .mockResolvedValueOnce(null); // vault_setting_get nvd_api_key
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("IntegrationsSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // (a) Renders NVD key field when vault unlocked + no key
  it("볼트가 잠금 해제 상태이고 키가 없을 때 NVD 키 입력 필드가 렌더링된다", async () => {
    setupUnlockedNoKey();
    renderSection();

    // password input은 getByLabelText 로 접근
    await waitFor(() => {
      expect(screen.getByLabelText(/NVD API Key/i)).toBeInTheDocument();
    });

    // 잠금 경고 없음
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  // (b) Shows "Configured (hidden)" state when key exists
  it("키가 이미 설정된 경우 Configured (hidden) 플레이스홀더가 표시된다", async () => {
    mockInvoke
      .mockResolvedValueOnce({ state: "unlocked" }) // vault_status
      .mockResolvedValueOnce("existing-nvd-api-key"); // vault_setting_get

    renderSection();

    await waitFor(() => {
      const input = screen.getByLabelText(/NVD API Key/i);
      expect(input).toHaveAttribute("placeholder", "Configured (hidden)");
    });
  });

  // (c) Save calls vault_setting_set with entered value
  it("Save 버튼 클릭 시 vault_setting_set 을 입력된 값으로 호출한다", async () => {
    const user = userEvent.setup();
    setupUnlockedNoKey();
    mockInvoke.mockResolvedValueOnce(undefined); // vault_setting_set

    renderSection();

    // vault_status 로딩이 완료돼 input 이 활성화될 때까지 대기
    await waitFor(() => {
      expect(screen.getByLabelText(/NVD API Key/i)).not.toBeDisabled();
    });

    const input = screen.getByLabelText(/NVD API Key/i);
    await user.type(input, "my-nvd-key-123");

    // Save 버튼이 활성화될 때까지 대기
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /save/i })).not.toBeDisabled();
    });

    await user.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("vault_setting_set", {
        key: "nvd_api_key",
        value: "my-nvd-key-123",
      });
    });

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalled();
    });
  });

  // (d) Clear calls vault_setting_set with null
  it("Clear 버튼 클릭 시 vault_setting_set 을 null 로 호출한다", async () => {
    const user = userEvent.setup();
    mockInvoke
      .mockResolvedValueOnce({ state: "unlocked" }) // vault_status
      .mockResolvedValueOnce("existing-key") // vault_setting_get
      .mockResolvedValueOnce(undefined); // vault_setting_set (clear)

    renderSection();

    // existingKey 가 설정된 후 Clear 버튼이 활성화됨
    await waitFor(() => {
      const clearBtn = screen.getByRole("button", { name: /clear/i });
      expect(clearBtn).not.toBeDisabled();
    });

    await user.click(screen.getByRole("button", { name: /clear/i }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("vault_setting_set", {
        key: "nvd_api_key",
        value: null,
      });
    });

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalled();
    });
  });

  // (e) Shows locked warning when vault_status returns Locked
  it("볼트가 잠겨 있을 때 잠금 경고 메시지가 표시된다", async () => {
    mockInvoke.mockResolvedValueOnce({ state: "locked" }); // vault_status

    renderSection();

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
    expect(screen.getByRole("alert")).toHaveTextContent(/unlock the vault/i);

    // 버튼들은 비활성화
    expect(screen.getByRole("button", { name: /save/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /clear/i })).toBeDisabled();
  });

  // (f) Toggles show/hide (input type toggles between password and text)
  it("Show/Hide 토글 클릭 시 input type 이 password ↔ text 로 전환된다", async () => {
    const user = userEvent.setup();
    setupUnlockedNoKey();

    renderSection();

    await waitFor(() => {
      expect(screen.getByLabelText(/NVD API Key/i)).toBeInTheDocument();
    });

    // 초기: type="password"
    expect(screen.getByLabelText(/NVD API Key/i)).toHaveAttribute("type", "password");

    // Show 버튼 클릭 → type="text"
    const showBtn = screen.getByRole("button", { name: /show/i });
    await user.click(showBtn);
    expect(screen.getByLabelText(/NVD API Key/i)).toHaveAttribute("type", "text");

    // Hide 버튼 클릭 → type="password"
    const hideBtn = screen.getByRole("button", { name: /hide/i });
    await user.click(hideBtn);
    expect(screen.getByLabelText(/NVD API Key/i)).toHaveAttribute("type", "password");
  });
});
