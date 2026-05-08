import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import "@/lib/i18n";

// ---------- Mocks ----------

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

// react-hotkeys-hook — noop in unit tests (AppShell integrates this)
vi.mock("react-hotkeys-hook", () => ({
  useHotkeys: vi.fn(),
}));

// useNavigate spy
const mockNavigate = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// theme provider — setTheme spy
const mockSetTheme = vi.fn();
vi.mock("@/components/theme/theme-provider", () => ({
  useTheme: () => ({ theme: "light", setTheme: mockSetTheme }),
}));

// ---------- Imports after mocks ----------

import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { CommandPalette } from "../CommandPalette";

const mockInvoke = vi.mocked(invoke);

function renderPalette(open = true, onOpenChange = vi.fn()) {
  return render(
    <MemoryRouter>
      <CommandPalette open={open} onOpenChange={onOpenChange} />
    </MemoryRouter>,
  );
}

describe("CommandPalette", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // 1. open=false → Dialog 안 렌더
  it("open=false 일 때 Dialog 콘텐츠를 렌더링하지 않는다", () => {
    renderPalette(false);
    expect(screen.queryByPlaceholderText("Type a command or search…")).not.toBeInTheDocument();
  });

  // 2. open=true → 검색 input + 그룹 2개 렌더
  it("open=true 일 때 검색 input과 Navigation/Actions 그룹을 렌더링한다", async () => {
    renderPalette(true);
    await waitFor(() => {
      expect(screen.getByPlaceholderText("Type a command or search…")).toBeInTheDocument();
    });
    expect(screen.getByText("Navigation")).toBeInTheDocument();
    expect(screen.getByText("Actions")).toBeInTheDocument();
  });

  // 3. Navigation 그룹에 5개 항목 존재
  it("Navigation 그룹에 5개 항목이 있다", async () => {
    renderPalette(true);
    await waitFor(() => {
      expect(screen.getByText("Inventory")).toBeInTheDocument();
    });
    expect(screen.getByText("Graph")).toBeInTheDocument();
    expect(screen.getByText("Incidents")).toBeInTheDocument();
    expect(screen.getByText("Audit Log")).toBeInTheDocument();
    expect(screen.getByText("Settings")).toBeInTheDocument();
  });

  // 4. Actions 그룹에 5개 항목 존재
  it("Actions 그룹에 5개 항목이 있다", async () => {
    renderPalette(true);
    await waitFor(() => {
      expect(screen.getByText("Create credential")).toBeInTheDocument();
    });
    expect(screen.getByText("Lock vault")).toBeInTheDocument();
    expect(screen.getByText("Switch to light theme")).toBeInTheDocument();
    expect(screen.getByText("Switch to dark theme")).toBeInTheDocument();
    expect(screen.getByText("Use system theme")).toBeInTheDocument();
  });

  // 5. Navigation item 클릭 → navigate 호출 + onOpenChange(false)
  it("Navigation 항목 클릭 시 navigate를 호출하고 palette를 닫는다", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    renderPalette(true, onOpenChange);

    await waitFor(() => expect(screen.getByText("Graph")).toBeInTheDocument());
    await user.click(screen.getByText("Graph"));

    expect(mockNavigate).toHaveBeenCalledWith("/graph");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  // 6. "Create credential" 클릭 → navigate("/?action=create")
  it("'Create credential' 클릭 시 navigate('/?action=create')를 호출한다", async () => {
    const user = userEvent.setup();
    renderPalette(true);

    await waitFor(() => expect(screen.getByText("Create credential")).toBeInTheDocument());
    await user.click(screen.getByText("Create credential"));

    expect(mockNavigate).toHaveBeenCalledWith("/?action=create");
  });

  // 7. "Lock vault" 클릭 → invoke("vault_lock") + vault-lock event + toast.success + onOpenChange(false)
  it("'Lock vault' 클릭 시 invoke vault_lock, CustomEvent dispatch, toast.success, palette close를 수행한다", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    mockInvoke.mockResolvedValueOnce(undefined);

    const dispatchSpy = vi.spyOn(window, "dispatchEvent");

    renderPalette(true, onOpenChange);

    await waitFor(() => expect(screen.getByText("Lock vault")).toBeInTheDocument());
    await user.click(screen.getByText("Lock vault"));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("vault_lock");
      expect(dispatchSpy).toHaveBeenCalledWith(expect.any(CustomEvent));
      expect(toast.success).toHaveBeenCalledWith("Vault locked");
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    dispatchSpy.mockRestore();
  });

  // 8. "Switch to dark theme" 클릭 → setTheme("dark")
  it("'Switch to dark theme' 클릭 시 setTheme('dark')를 호출한다", async () => {
    const user = userEvent.setup();
    renderPalette(true);

    await waitFor(() => expect(screen.getByText("Switch to dark theme")).toBeInTheDocument());
    await user.click(screen.getByText("Switch to dark theme"));

    expect(mockSetTheme).toHaveBeenCalledWith("dark");
  });

  // 9. 검색어 "settings" 입력 시 Settings item 포함 (cmdk 자체 필터링)
  it("검색어 'settings' 입력 시 Settings 항목이 보인다", async () => {
    const user = userEvent.setup();
    renderPalette(true);

    const input = await screen.findByPlaceholderText("Type a command or search…");
    await user.type(input, "settings");

    // cmdk가 필터링하므로 Settings는 보여야 함
    await waitFor(() => {
      expect(screen.getByText("Settings")).toBeInTheDocument();
    });
  });

  // 10. action 실행 시 localStorage에 recent id 저장
  it("action 실행 시 localStorage에 최근 사용 id가 저장된다", async () => {
    const user = userEvent.setup();
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem");

    renderPalette(true);

    await waitFor(() => expect(screen.getByText("Inventory")).toBeInTheDocument());
    await user.click(screen.getByText("Inventory"));

    expect(setItemSpy).toHaveBeenCalledWith(
      "Secretbank:command-palette:recent",
      expect.stringContaining("nav.inventory"),
    );

    setItemSpy.mockRestore();
  });

  // 11. localStorage에 recent 있을 때 "Recent" 그룹 상단 렌더
  it("localStorage에 recent가 있을 때 'Recent' 그룹이 렌더링된다", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation((key) => {
      if (key === "Secretbank:command-palette:recent") {
        return JSON.stringify(["nav.inventory", "nav.settings"]);
      }
      return null;
    });

    renderPalette(true);

    await waitFor(() => {
      expect(screen.getByText("Recent")).toBeInTheDocument();
    });
  });
});
