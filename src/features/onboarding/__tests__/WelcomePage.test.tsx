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

const navigateSpy = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigateSpy };
});

// CreateCredentialDialog 는 내부 Tauri 의존이 많아 간단한 stub 으로 대체
interface MockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}
vi.mock("@/features/inventory/CreateCredentialDialog", () => ({
  CreateCredentialDialog: ({ open, onOpenChange, onSuccess }: MockDialogProps) =>
    open ? (
      <div role="dialog" aria-label="mock-create-dialog">
        <button type="button" onClick={() => onSuccess()}>
          mock submit
        </button>
        <button type="button" onClick={() => onOpenChange(false)}>
          mock close
        </button>
      </div>
    ) : null,
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { invoke } from "@tauri-apps/api/core";
import { WelcomePage } from "../WelcomePage";

const mockInvoke = vi.mocked(invoke);

function renderPage() {
  return render(
    <MemoryRouter>
      <WelcomePage />
    </MemoryRouter>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("WelcomePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // settings_get → null (onboarding_done=false 기본값)
    mockInvoke.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("첫 렌더 시 Step 1 ('Drop your project folder') 를 표시한다", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /welcome to Secretbank/i })).toBeInTheDocument();
      expect(
        screen.getByRole("heading", { name: /drop your project folder/i }),
      ).toBeInTheDocument();
      expect(screen.getByText(/step 1 of 3/i)).toBeInTheDocument();
    });
  });

  it("'Next' 버튼 클릭 시 Step 2 (수동 등록) 로 진행한다", async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^next$/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /^next$/i }));

    expect(
      screen.getByRole("heading", { name: /add your first key manually/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/step 2 of 3/i)).toBeInTheDocument();
  });

  it("Step 2 에서 'Add your first key' 클릭 시 Create dialog 가 열린다", async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^next$/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /^next$/i }));

    await user.click(screen.getByRole("button", { name: /add your first key/i }));

    expect(screen.getByRole("dialog", { name: /mock-create-dialog/i })).toBeInTheDocument();
  });

  it("Create dialog 성공 콜백 시 Step 3 ('You're all set') 로 이동한다", async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^next$/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /^next$/i }));
    await user.click(screen.getByRole("button", { name: /add your first key/i }));

    // mock dialog 의 success 버튼
    await user.click(screen.getByRole("button", { name: /mock submit/i }));

    expect(screen.getByRole("heading", { name: /you're all set/i })).toBeInTheDocument();
    expect(screen.getByText(/step 3 of 3/i)).toBeInTheDocument();
  });

  it("Step 3 'Open Inventory' 클릭 시 settings_set(onboarding.done=true) 후 / 로 이동한다", async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^next$/i })).toBeInTheDocument();
    });

    // Step1 → Step2 → (dialog) → Step3
    await user.click(screen.getByRole("button", { name: /^next$/i }));
    await user.click(screen.getByRole("button", { name: /add your first key/i }));
    await user.click(screen.getByRole("button", { name: /mock submit/i }));

    await user.click(screen.getByRole("button", { name: /open inventory/i }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("settings_set", {
        key: "secretbank.settings.onboarding.done",
        value: "true",
      });
      expect(navigateSpy).toHaveBeenCalledWith("/", { replace: true });
    });
  });

  it("'Skip for now' 클릭 시 onboarding.done=true 저장 후 / 로 이동한다", async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /skip for now/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /skip for now/i }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("settings_set", {
        key: "secretbank.settings.onboarding.done",
        value: "true",
      });
      expect(navigateSpy).toHaveBeenCalledWith("/", { replace: true });
    });
  });
});
