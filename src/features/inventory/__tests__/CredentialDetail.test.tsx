/**
 * T027 — CredentialDetail Drawer 테스트
 */

import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import "@/lib/i18n";
import { CredentialDetail } from "../CredentialDetail";
import { MOCK_CREDENTIAL_FULL } from "./fixtures";

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

// listen mock — clipboard:countdown 핸들러만 캡처, 나머지는 무시
let eventHandler: ((e: { payload: { remaining: number } }) => void) | null = null;
let unlistenCalled = false;

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn((event: string, handler: (e: { payload: { remaining: number } }) => void) => {
    if (event === "clipboard:countdown") {
      eventHandler = handler;
      unlistenCalled = false;
      return Promise.resolve(() => {
        unlistenCalled = true;
        eventHandler = null;
      });
    }
    // incidents:updated 등 다른 이벤트는 no-op unlisten 반환
    return Promise.resolve(() => undefined);
  }),
}));

import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";

const mockInvoke = vi.mocked(invoke);
const mockToast = {
  success: vi.mocked(toast.success),
  error: vi.mocked(toast.error),
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_ID = "01HZAAAAAAAAAAAAAAAAAAAAAA";

interface RenderProps {
  open?: boolean;
  credentialId?: string | null;
  onClose?: () => void;
  onDeleted?: () => void;
}

function renderDetail({
  open = true,
  credentialId = DEFAULT_ID,
  onClose = vi.fn(),
  onDeleted = vi.fn(),
}: RenderProps = {}) {
  return render(
    <MemoryRouter>
      <CredentialDetail
        open={open}
        credentialId={credentialId}
        onClose={onClose}
        onDeleted={onDeleted}
      />
    </MemoryRouter>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CredentialDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    eventHandler = null;
    unlistenCalled = false;
    // 기본: credential_get 성공
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "credential_get") return Promise.resolve(MOCK_CREDENTIAL_FULL);
      if (cmd === "credential_delete") return Promise.resolve(undefined);
      if (cmd === "credential_copy_to_clipboard") return Promise.resolve(undefined);
      if (cmd === "incident_matches_for_credential") return Promise.resolve([]);
      return Promise.resolve(undefined);
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ------------------------------------------------------------------
  // 테스트 1: open=true 시 credential_get invoke 호출 (id 파라미터 확인)
  // ------------------------------------------------------------------
  it("open=true 시 credential_get을 id 파라미터로 호출한다", async () => {
    renderDetail();

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("credential_get", { id: DEFAULT_ID });
    });
  });

  // ------------------------------------------------------------------
  // 테스트 2: 로딩 중 스켈레톤, fetch 완료 후 실제 데이터 렌더
  // ------------------------------------------------------------------
  it("fetch 완료 후 name/hash_hint/scope 을 렌더한다", async () => {
    renderDetail();

    await waitFor(() => {
      expect(screen.getByText("OpenAI API Key")).toBeInTheDocument();
    });

    // hash_hint: "••••abc1"
    expect(screen.getByText(/••••abc1/)).toBeInTheDocument();
    // scope
    expect(screen.getByText("billing:read")).toBeInTheDocument();
  });

  // ------------------------------------------------------------------
  // 테스트 3: Rotate/Revoke 버튼 disabled
  // ------------------------------------------------------------------
  it("Rotate 버튼이 disabled 상태다", async () => {
    renderDetail();

    await waitFor(() => {
      expect(screen.getByText("OpenAI API Key")).toBeInTheDocument();
    });

    const rotateBtn = screen.getByRole("button", { name: /rotate/i });
    expect(rotateBtn).toBeDisabled();
  });

  it("Revoke 버튼이 disabled 상태다", async () => {
    renderDetail();

    await waitFor(() => {
      expect(screen.getByText("OpenAI API Key")).toBeInTheDocument();
    });

    const revokeBtn = screen.getByRole("button", { name: /revoke/i });
    expect(revokeBtn).toBeDisabled();
  });

  // ------------------------------------------------------------------
  // 테스트 4: Copy 버튼 클릭 → credential_copy_to_clipboard invoke 호출
  // ------------------------------------------------------------------
  it("Copy 버튼 클릭 시 credential_copy_to_clipboard를 id 파라미터로 호출한다", async () => {
    const user = userEvent.setup();
    renderDetail();

    await waitFor(() => {
      expect(screen.getByText("OpenAI API Key")).toBeInTheDocument();
    });

    const copyBtn = screen.getByRole("button", { name: /copy value/i });
    await user.click(copyBtn);

    expect(mockInvoke).toHaveBeenCalledWith("credential_copy_to_clipboard", {
      id: DEFAULT_ID,
    });
  });

  // ------------------------------------------------------------------
  // 테스트 5: clipboard:countdown 이벤트 {remaining:30} → Progress 표시
  // ------------------------------------------------------------------
  it("clipboard:countdown 이벤트 수신 시 Progress + 라벨을 렌더한다", async () => {
    renderDetail();

    await waitFor(() => {
      expect(screen.getByText("OpenAI API Key")).toBeInTheDocument();
    });

    // listen 구독 완료 대기
    await waitFor(() => {
      expect(eventHandler).not.toBeNull();
    });

    // 이벤트 발행
    act(() => {
      eventHandler!({ payload: { remaining: 30 } });
    });

    await waitFor(() => {
      expect(screen.getByText(/clipboard clears in 30s/i)).toBeInTheDocument();
    });

    // Progress 요소 확인
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  // ------------------------------------------------------------------
  // 테스트 6: remaining === 0 이 되면 Progress 숨김
  // ------------------------------------------------------------------
  it("remaining이 0이면 Progress를 숨긴다", async () => {
    renderDetail();

    await waitFor(() => {
      expect(screen.getByText("OpenAI API Key")).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(eventHandler).not.toBeNull();
    });

    // 30 → 0
    act(() => {
      eventHandler!({ payload: { remaining: 30 } });
    });
    await waitFor(() => {
      expect(screen.getByRole("progressbar")).toBeInTheDocument();
    });

    act(() => {
      eventHandler!({ payload: { remaining: 0 } });
    });
    await waitFor(() => {
      expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    });
  });

  // ------------------------------------------------------------------
  // 테스트 7: Delete 버튼 → AlertDialog → Confirm → delete invoke + callbacks
  // ------------------------------------------------------------------
  it("Delete 확인 시 credential_delete 호출 + onDeleted + onClose 호출", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onDeleted = vi.fn();
    renderDetail({ onClose, onDeleted });

    await waitFor(() => {
      expect(screen.getByText("OpenAI API Key")).toBeInTheDocument();
    });

    // Delete 버튼 클릭
    const deleteBtn = screen.getByRole("button", { name: /delete credential/i });
    await user.click(deleteBtn);

    // AlertDialog 열렸는지 확인
    await waitFor(() => {
      expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    });

    // Confirm 클릭
    const confirmBtn = screen.getByRole("button", { name: /^delete$/i });
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("credential_delete", { id: DEFAULT_ID });
      expect(mockToast.success).toHaveBeenCalled();
      expect(onDeleted).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });

  // ------------------------------------------------------------------
  // 테스트 8: Delete AlertDialog Cancel → delete invoke 미호출
  // ------------------------------------------------------------------
  it("Delete 취소 시 credential_delete를 호출하지 않는다", async () => {
    const user = userEvent.setup();
    renderDetail();

    await waitFor(() => {
      expect(screen.getByText("OpenAI API Key")).toBeInTheDocument();
    });

    const deleteBtn = screen.getByRole("button", { name: /delete credential/i });
    await user.click(deleteBtn);

    await waitFor(() => {
      expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    });

    const cancelBtn = screen.getByRole("button", { name: /cancel/i });
    await user.click(cancelBtn);

    // AlertDialog 닫힘 대기
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });

    // delete invoke 미호출 확인 (credential_get은 호출됨)
    expect(mockInvoke).not.toHaveBeenCalledWith("credential_delete", expect.anything());
  });

  // ------------------------------------------------------------------
  // 테스트 9: onClose 호출 시 unlisten이 불린다
  // ------------------------------------------------------------------
  it("Sheet가 닫히면 clipboard listen의 unlisten이 호출된다", async () => {
    const onClose = vi.fn();
    const { unmount } = renderDetail({ onClose });

    await waitFor(() => {
      expect(screen.getByText("OpenAI API Key")).toBeInTheDocument();
    });

    // listen 구독 완료 대기
    await waitFor(() => {
      expect(eventHandler).not.toBeNull();
    });

    // 컴포넌트 unmount → useEffect cleanup
    unmount();

    await waitFor(() => {
      expect(unlistenCalled).toBe(true);
    });
  });

  // ------------------------------------------------------------------
  // 테스트 10: credential_get 실패 → 에러 메시지 + Retry → 재호출
  // ------------------------------------------------------------------
  it("credential_get 실패 시 에러 메시지를 표시하고 Retry 클릭 시 재호출한다", async () => {
    const user = userEvent.setup();
    let callCount = 0;

    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "credential_get") {
        callCount++;
        if (callCount === 1) return Promise.reject("network error");
        return Promise.resolve(MOCK_CREDENTIAL_FULL);
      }
      return Promise.resolve(undefined);
    });

    renderDetail();

    // 에러 메시지 대기 — reject("network error")이므로 해당 문자열이 표시됨
    await waitFor(() => {
      expect(screen.getByText(/network error/i)).toBeInTheDocument();
    });

    // Retry 버튼 클릭
    const retryBtn = screen.getByRole("button", { name: /retry/i });
    await user.click(retryBtn);

    // 성공 후 이름 렌더
    await waitFor(() => {
      expect(screen.getByText("OpenAI API Key")).toBeInTheDocument();
    });

    expect(callCount).toBe(2);
  });
});
