import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// i18n 초기화 (실제 번역 문자열 사용)
import "@/lib/i18n";

import { LockScreen } from "../LockScreen";

// @tauri-apps/api/core 를 모듈 경계에서 모킹
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

// sonner toast 모킹
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import { invoke } from "@tauri-apps/api/core";

const mockInvoke = vi.mocked(invoke);

function renderLockScreen(showCreate = false, onSuccess = vi.fn()) {
  return render(<LockScreen showCreate={showCreate} onSuccess={onSuccess} />);
}

describe("LockScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default invoke mock — vault_has_charter (mount-time effect) returns false
    // unless a specific test overrides via mockResolvedValueOnce.
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "vault_has_charter") return false;
      return undefined;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("비밀번호 입력 필드와 잠금 해제 버튼을 렌더링한다", () => {
    renderLockScreen();
    expect(screen.getByLabelText(/passphrase/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /unlock/i })).toBeInTheDocument();
  });

  it("showCreate=false일 때 새 볼트 생성 링크를 표시하지 않는다", () => {
    renderLockScreen(false);
    expect(screen.queryByText(/create a new vault/i)).not.toBeInTheDocument();
  });

  it("showCreate=true일 때 새 볼트 생성 링크를 표시한다", () => {
    renderLockScreen(true);
    expect(screen.getByText(/create a new vault/i)).toBeInTheDocument();
  });

  it("성공 경로: invoke가 resolve하면 onSuccess를 호출한다", async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();

    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "vault_has_charter") return false;
      if (cmd === "vault_unlock") return undefined;
      return undefined;
    });

    renderLockScreen(false, onSuccess);

    const input = screen.getByLabelText(/passphrase/i);
    await user.type(input, "mysecretpassword");
    await user.click(screen.getByRole("button", { name: /unlock/i }));

    // VaultMechanism unlock animation runs ~1.3s before onSuccess fires.
    await waitFor(
      () => {
        expect(mockInvoke).toHaveBeenCalledWith("vault_unlock", {
          password: "mysecretpassword",
        });
        expect(onSuccess).toHaveBeenCalledTimes(1);
      },
      { timeout: 3000 },
    );
  });

  it("실패 경로: wrong_password 에러 시 인라인 에러 메시지를 표시한다", async () => {
    const user = userEvent.setup();

    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "vault_has_charter") return false;
      if (cmd === "vault_unlock") throw { code: "wrong_password" };
      return undefined;
    });

    renderLockScreen();

    const input = screen.getByLabelText(/passphrase/i);
    await user.type(input, "wrongpass");
    await user.click(screen.getByRole("button", { name: /unlock/i }));

    await waitFor(() => {
      expect(screen.getByText(/incorrect passphrase/i)).toBeInTheDocument();
    });
  });

  it("3회 연속 실패 후 쿨다운: 버튼이 비활성화되고 카운트다운이 표시된다", async () => {
    const user = userEvent.setup();

    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "vault_has_charter") return false;
      if (cmd === "vault_unlock") throw { code: "wrong_password" };
      return undefined;
    });

    renderLockScreen();

    const input = screen.getByLabelText(/passphrase/i);
    const unlockBtn = screen.getByRole("button", { name: /unlock/i });

    // 1회 실패
    await user.type(input, "a");
    await user.click(unlockBtn);
    await waitFor(() => expect(screen.getByText(/incorrect/i)).toBeInTheDocument());

    // 2회 실패
    await user.type(input, "b");
    await user.click(unlockBtn);
    await waitFor(() => expect(screen.getByText(/incorrect/i)).toBeInTheDocument());

    // 3회 실패 → 쿨다운 시작
    await user.type(input, "c");
    await user.click(unlockBtn);

    // 쿨다운 메시지가 표시되어야 한다
    await waitFor(
      () => {
        expect(screen.getByText(/retry in/i)).toBeInTheDocument();
      },
      { timeout: 3000 },
    );

    // 쿨다운 중 버튼이 비활성화되어 있어야 한다
    expect(unlockBtn).toBeDisabled();
  }, 15000);
});
