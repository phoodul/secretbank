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

// theme provider
const mockSetTheme = vi.fn();
vi.mock("@/components/theme/theme-provider", () => ({
  useTheme: () => ({ theme: "light", setTheme: mockSetTheme }),
}));

// plugin-shell openUrl mock
const mockOpen = vi.fn().mockResolvedValue(undefined);
vi.mock("@tauri-apps/plugin-shell", () => ({
  open: mockOpen,
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { SettingsPage } from "../SettingsPage";

const mockInvoke = vi.mocked(invoke);

function renderPage() {
  return render(
    <MemoryRouter>
      <SettingsPage />
    </MemoryRouter>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SettingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 기본: settings_get → null (기본값 5 사용)
    mockInvoke.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // 1. 초기 렌더 — 3섹션 heading 존재
  it("Appearance / Security / About 섹션 heading 이 렌더링된다", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /appearance/i })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: /security/i })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: /about/i })).toBeInTheDocument();
    });
  });

  // 2. Theme Tabs — Dark 클릭 → setTheme("dark") 호출
  it("Theme Tab 'Dark' 클릭 시 setTheme(\"dark\") 를 호출한다", async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: /dark/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("tab", { name: /dark/i }));
    expect(mockSetTheme).toHaveBeenCalledWith("dark");
  });

  // 3. Theme Tabs — System 클릭 → setTheme("system") 호출
  it("Theme Tab 'System' 클릭 시 setTheme(\"system\") 를 호출한다", async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: /system/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("tab", { name: /system/i }));
    expect(mockSetTheme).toHaveBeenCalledWith("system");
  });

  // 4. 마운트 시 settings_get invoke 호출 (key: AUTO_LOCK_KEY)
  it("마운트 시 AUTO_LOCK_KEY 로 settings_get 을 호출한다", async () => {
    renderPage();

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("settings_get", {
        key: "apivault.settings.security.auto_lock_minutes",
      });
    });
  });

  // 5. Auto-lock Select — 로딩 완료 후 4개 옵션 렌더 확인
  it("Auto-lock 로딩 완료 후 Select 가 렌더링된다", async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.queryByTestId("skeleton")).not.toBeInTheDocument();
      expect(screen.getByRole("combobox", { name: /auto-lock/i })).toBeInTheDocument();
    });
  });

  // 6. settings_get "30" 반환 → Select 에 "30 minutes" 표시
  it('settings_get 이 "30" 이면 Auto-lock Select 에 "30 minutes" 가 표시된다', async () => {
    mockInvoke.mockResolvedValueOnce("30");

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole("combobox", { name: /auto-lock/i })).toHaveTextContent(/30 minutes/i);
    });
  });

  // 7. Auto-lock Select 변경 → settings_set invoke 호출
  it("Auto-lock Select 변경 시 settings_set invoke 를 호출한다", async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValueOnce(null); // settings_get → null (기본값 5)
    mockInvoke.mockResolvedValueOnce(undefined); // settings_set

    renderPage();

    // Auto-lock Select 로딩 완료 대기
    await waitFor(() => {
      expect(screen.getByRole("combobox", { name: /auto-lock/i })).toBeInTheDocument();
    });

    const trigger = screen.getByRole("combobox", { name: /auto-lock/i });
    await user.click(trigger);

    // "15 minutes" 옵션 선택
    const option = await screen.findByRole("option", { name: /15 minutes/i });
    await user.click(option);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("settings_set", {
        key: "apivault.settings.security.auto_lock_minutes",
        value: "15",
      });
    });
  });

  // 8. settings_set 실패 → toast.error 호출
  it("settings_set 실패 시 toast.error 를 호출한다", async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValueOnce(null); // settings_get
    mockInvoke.mockRejectedValueOnce(new Error("db error")); // settings_set

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole("combobox", { name: /auto-lock/i })).toBeInTheDocument();
    });

    const trigger = screen.getByRole("combobox", { name: /auto-lock/i });
    await user.click(trigger);

    const option = await screen.findByRole("option", { name: /15 minutes/i });
    await user.click(option);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled();
    });
  });

  // 9. About 섹션 — version / license 링크 존재
  it("About 섹션에 version 과 license 버튼이 렌더링된다", async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/0\.1\.0/)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /agpl/i })).toBeInTheDocument();
    });
  });

  // 10. License 버튼 클릭 → openUrl(AGPL URL) 호출
  it("License 버튼 클릭 시 AGPL URL 로 open 을 호출한다", async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /agpl/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /agpl/i }));

    await waitFor(() => {
      expect(mockOpen).toHaveBeenCalledWith(expect.stringContaining("gnu.org/licenses/agpl"));
    });
  });
});
