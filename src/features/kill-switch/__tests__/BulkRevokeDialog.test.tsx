/**
 * T078 — BulkRevokeDialog 테스트 (4개 이상)
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "@/lib/i18n";
import { BulkRevokeDialog } from "../BulkRevokeDialog";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => undefined)),
}));

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

const mockInvoke = vi.mocked(invoke);
const mockListen = vi.mocked(listen);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ISSUER_ID = "issuer-abc-123";
const ISSUER_NAME = "OpenAI";
const CREDENTIAL_COUNT = 3;
const MOCK_TOKEN = "b".repeat(32);
const MOCK_BULK_RESULT = { revoked: 3, failed: [] };

function renderDialog({
  open = true,
  issuerId = ISSUER_ID,
  issuerName = ISSUER_NAME,
  credentialCount = CREDENTIAL_COUNT,
  onOpenChange = vi.fn(),
  onCompleted = vi.fn(),
} = {}) {
  return render(
    <BulkRevokeDialog
      open={open}
      onOpenChange={onOpenChange}
      issuerId={issuerId}
      issuerName={issuerName}
      credentialCount={credentialCount}
      onCompleted={onCompleted}
    />,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("BulkRevokeDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListen.mockResolvedValue(() => undefined);
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "kill_switch_request_confirm_issuer") return Promise.resolve(MOCK_TOKEN);
      if (cmd === "kill_switch_revoke_issuer") return Promise.resolve(MOCK_BULK_RESULT);
      return Promise.resolve(undefined);
    });
  });

  // ------------------------------------------------------------------
  // (a) Continue 버튼: 이름 미일치 → disabled
  // ------------------------------------------------------------------
  it("(a) 발급사 이름이 정확히 일치하지 않으면 Continue 버튼이 비활성화된다", async () => {
    const user = userEvent.setup();
    renderDialog();

    const continueBtn = screen.getByTestId("bulk-revoke-continue");
    expect(continueBtn).toBeDisabled();

    // 부분 입력
    const nameInput = screen.getByTestId("bulk-revoke-name-input");
    await user.type(nameInput, "Open");
    expect(continueBtn).toBeDisabled();

    // 잘못된 케이스
    await user.clear(nameInput);
    await user.type(nameInput, "openai");
    expect(continueBtn).toBeDisabled();
  });

  // ------------------------------------------------------------------
  // (b) 정확한 이름 입력 + Continue 클릭 → kill_switch_request_confirm_issuer 호출
  // ------------------------------------------------------------------
  it("(b) 정확한 이름 입력 후 Continue 클릭 시 kill_switch_request_confirm_issuer를 호출한다", async () => {
    const user = userEvent.setup();
    renderDialog();

    const nameInput = screen.getByTestId("bulk-revoke-name-input");
    await user.type(nameInput, ISSUER_NAME);

    const continueBtn = screen.getByTestId("bulk-revoke-continue");
    expect(continueBtn).not.toBeDisabled();

    await user.click(continueBtn);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("kill_switch_request_confirm_issuer", {
        issuerId: ISSUER_ID,
      });
    });
  });

  // ------------------------------------------------------------------
  // (c) kill-switch:progress 이벤트 → 프로그레스 업데이트
  // ------------------------------------------------------------------
  it("(c) kill-switch:progress 이벤트가 도착하면 진행 상황이 업데이트된다", async () => {
    const user = userEvent.setup();

    // listen 콜백을 외부에서 트리거할 수 있도록 캡처
    let progressCallback: ((event: { payload: { revoked: number; total: number } }) => void) | null = null;
    mockListen.mockImplementation((eventName, handler) => {
      if (eventName === "kill-switch:progress") {
        progressCallback = handler as typeof progressCallback;
      }
      return Promise.resolve(() => undefined);
    });

    // revoke_issuer를 resolve하기 전에 progress를 발생시키기 위해 지연
    let resolveRevoke!: (v: unknown) => void;
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "kill_switch_request_confirm_issuer") return Promise.resolve(MOCK_TOKEN);
      if (cmd === "kill_switch_revoke_issuer") {
        return new Promise((resolve) => {
          resolveRevoke = resolve;
        });
      }
      return Promise.resolve(undefined);
    });

    renderDialog();

    // Step 1: 이름 입력 + Continue
    const nameInput = screen.getByTestId("bulk-revoke-name-input");
    await user.type(nameInput, ISSUER_NAME);
    await user.click(screen.getByTestId("bulk-revoke-continue"));

    // Step 2: confirm 버튼 대기
    await waitFor(() => {
      expect(screen.getByTestId("bulk-revoke-confirm")).toBeInTheDocument();
    });

    // confirm 클릭
    await user.click(screen.getByTestId("bulk-revoke-confirm"));

    // listen이 호출되어 프로그레스 핸들러가 등록될 때까지 대기
    await waitFor(() => {
      expect(progressCallback).not.toBeNull();
    });

    // 프로그레스 이벤트 트리거
    progressCallback!({ payload: { revoked: 2, total: 3 } });

    // "Revoked 2 of 3" 텍스트 확인
    await waitFor(() => {
      expect(screen.getByText(/2.*3/)).toBeInTheDocument();
    });

    // 완료 처리
    resolveRevoke(MOCK_BULK_RESULT);
  });

  // ------------------------------------------------------------------
  // (d) 성공 요약 표시
  // ------------------------------------------------------------------
  it("(d) 모두 성공하면 성공 요약이 표시된다", async () => {
    const user = userEvent.setup();
    renderDialog();

    // Step 1
    const nameInput = screen.getByTestId("bulk-revoke-name-input");
    await user.type(nameInput, ISSUER_NAME);
    await user.click(screen.getByTestId("bulk-revoke-continue"));

    // Step 2
    await waitFor(() => {
      expect(screen.getByTestId("bulk-revoke-confirm")).toBeInTheDocument();
    });
    await user.click(screen.getByTestId("bulk-revoke-confirm"));

    // 완료 상태 대기 — "Revoked 3 credentials." 텍스트
    await waitFor(() => {
      expect(screen.getByText(/revoked 3 credentials/i)).toBeInTheDocument();
    });
  });

  // ------------------------------------------------------------------
  // (e) 실패 포함 시 실패 목록 표시
  // ------------------------------------------------------------------
  it("(e) 일부 실패 시 실패 항목 목록을 표시한다", async () => {
    const user = userEvent.setup();
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "kill_switch_request_confirm_issuer") return Promise.resolve(MOCK_TOKEN);
      if (cmd === "kill_switch_revoke_issuer") {
        return Promise.resolve({
          revoked: 2,
          failed: [{ credential_id: "cred-fail-1", message: "vault locked" }],
        });
      }
      return Promise.resolve(undefined);
    });

    renderDialog();

    // Step 1
    await user.type(screen.getByTestId("bulk-revoke-name-input"), ISSUER_NAME);
    await user.click(screen.getByTestId("bulk-revoke-continue"));

    await waitFor(() => {
      expect(screen.getByTestId("bulk-revoke-confirm")).toBeInTheDocument();
    });
    await user.click(screen.getByTestId("bulk-revoke-confirm"));

    await waitFor(() => {
      expect(screen.getByText(/revoked 2.*failed.*1/i)).toBeInTheDocument();
    });
  });
});
