/**
 * T076 — KillSwitchDialog 테스트 (5개 이상)
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "@/lib/i18n";
import { KillSwitchDialog } from "../KillSwitchDialog";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

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

import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";

const mockInvoke = vi.mocked(invoke);
const mockToast = {
  success: vi.mocked(toast.success),
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CRED_ID = "cred-abc-123";
const CRED_NAME = "OpenAI API Key";
const MOCK_TOKEN = "a".repeat(32);

function renderDialog({
  open = true,
  credentialId = CRED_ID,
  credentialName = CRED_NAME,
  onOpenChange = vi.fn(),
  onRevoked = vi.fn(),
} = {}) {
  return render(
    <KillSwitchDialog
      open={open}
      onOpenChange={onOpenChange}
      credentialId={credentialId}
      credentialName={credentialName}
      onRevoked={onRevoked}
    />,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("KillSwitchDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "kill_switch_request_confirm") return Promise.resolve(MOCK_TOKEN);
      if (cmd === "kill_switch_revoke") return Promise.resolve(undefined);
      return Promise.resolve(undefined);
    });
  });

  // ------------------------------------------------------------------
  // (a) Continue 버튼: 이름 미일치 → disabled
  // ------------------------------------------------------------------
  it("(a) 자격증명 이름이 정확히 일치하지 않으면 Continue 버튼이 비활성화된다", async () => {
    const user = userEvent.setup();
    renderDialog();

    const continueBtn = screen.getByTestId("kill-switch-continue");
    expect(continueBtn).toBeDisabled();

    // 부분 입력
    const nameInput = screen.getByTestId("kill-switch-name-input");
    await user.type(nameInput, "OpenAI");
    expect(continueBtn).toBeDisabled();

    // 잘못된 케이스
    await user.clear(nameInput);
    await user.type(nameInput, "openai api key");
    expect(continueBtn).toBeDisabled();
  });

  // ------------------------------------------------------------------
  // (b) 정확한 이름 입력 + Continue 클릭 → kill_switch_request_confirm 호출
  // ------------------------------------------------------------------
  it("(b) 정확한 이름 입력 후 Continue 클릭 시 kill_switch_request_confirm을 호출한다", async () => {
    const user = userEvent.setup();
    renderDialog();

    const nameInput = screen.getByTestId("kill-switch-name-input");
    await user.type(nameInput, CRED_NAME);

    const continueBtn = screen.getByTestId("kill-switch-continue");
    expect(continueBtn).not.toBeDisabled();

    await user.click(continueBtn);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("kill_switch_request_confirm", {
        credId: CRED_ID,
      });
    });
  });

  // ------------------------------------------------------------------
  // (c) 토큰 수신 후 "I understand" 버튼 표시 → kill_switch_revoke 호출 + token + alsoDeleteValue
  // ------------------------------------------------------------------
  it("(c) 토큰 수신 후 confirm 버튼이 나타나고, 클릭 시 kill_switch_revoke를 토큰과 alsoDeleteValue로 호출한다", async () => {
    const user = userEvent.setup();
    renderDialog();

    // Step 1: 이름 입력 + Continue
    const nameInput = screen.getByTestId("kill-switch-name-input");
    await user.type(nameInput, CRED_NAME);

    // alsoDeleteValue 체크박스 선택
    const alsoDeleteCheckbox = screen.getByTestId("kill-switch-also-delete");
    await user.click(alsoDeleteCheckbox);

    const continueBtn = screen.getByTestId("kill-switch-continue");
    await user.click(continueBtn);

    // Step 2: "I understand" 버튼 대기
    await waitFor(() => {
      expect(screen.getByTestId("kill-switch-confirm")).toBeInTheDocument();
    });

    const confirmBtn = screen.getByTestId("kill-switch-confirm");
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("kill_switch_revoke", {
        input: {
          credId: CRED_ID,
          token: MOCK_TOKEN,
          alsoDeleteValue: true,
        },
      });
    });
  });

  // ------------------------------------------------------------------
  // (d) 성공 toast + onRevoked 콜백 호출
  // ------------------------------------------------------------------
  it("(d) 폐기 성공 시 toast.success를 호출하고 onRevoked 콜백을 실행한다", async () => {
    const user = userEvent.setup();
    const onRevoked = vi.fn();
    renderDialog({ onRevoked });

    // Step 1
    const nameInput = screen.getByTestId("kill-switch-name-input");
    await user.type(nameInput, CRED_NAME);
    await user.click(screen.getByTestId("kill-switch-continue"));

    // Step 2
    await waitFor(() => {
      expect(screen.getByTestId("kill-switch-confirm")).toBeInTheDocument();
    });
    await user.click(screen.getByTestId("kill-switch-confirm"));

    // toast 는 즉시 호출되지만, onRevoked 는 I4 hotfix 로 1500ms 후 setTimeout
    // + microtask 안에서 호출된다 (Radix compose-refs 무한 루프 방지).
    await waitFor(() => {
      expect(mockToast.success).toHaveBeenCalledWith(
        expect.stringMatching(/revoked/i),
      );
    });
    await waitFor(() => expect(onRevoked).toHaveBeenCalled(), { timeout: 3000 });
  });

  // ------------------------------------------------------------------
  // (e) 에러 경로: invoke 실패 → 에러 표시, 다이얼로그 열린 채로 유지, Retry 가능
  // ------------------------------------------------------------------
  it("(e) kill_switch_request_confirm 실패 시 에러를 표시하고 다이얼로그를 열린 채로 유지한다", async () => {
    const user = userEvent.setup();
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "kill_switch_request_confirm")
        return Promise.reject("network timeout");
      return Promise.resolve(undefined);
    });

    renderDialog();

    const nameInput = screen.getByTestId("kill-switch-name-input");
    await user.type(nameInput, CRED_NAME);
    await user.click(screen.getByTestId("kill-switch-continue"));

    // 에러 표시 대기
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    // 다이얼로그는 여전히 열려 있음 (Continue 버튼이 다시 보임)
    expect(screen.getByTestId("kill-switch-continue")).toBeInTheDocument();
    // 에러 메시지 표시
    expect(screen.getByText(/network timeout/i)).toBeInTheDocument();

    // Retry: 이름 입력칸이 유지되어 다시 Continue 클릭 가능
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "kill_switch_request_confirm") return Promise.resolve(MOCK_TOKEN);
      if (cmd === "kill_switch_revoke") return Promise.resolve(undefined);
      return Promise.resolve(undefined);
    });

    // 이름이 이미 입력되어 있어도 state가 error로 바뀌므로 다시 입력
    await user.clear(nameInput);
    await user.type(nameInput, CRED_NAME);
    await user.click(screen.getByTestId("kill-switch-continue"));

    await waitFor(() => {
      expect(screen.getByTestId("kill-switch-confirm")).toBeInTheDocument();
    });
  });
});
