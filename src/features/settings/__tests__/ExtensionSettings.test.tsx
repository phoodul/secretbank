/**
 * @file ExtensionSettings.test.tsx
 * @license AGPL-3.0-or-later
 *
 * B-7: ExtensionSettings UI 테스트.
 *
 * 검증 항목:
 *   1. 로딩 스켈레톤 → 라디오 5개 렌더
 *   2. 현재 설정 (hours4) 이 checked 상태로 표시
 *   3. 다른 옵션 클릭 → confirm dialog 등장
 *   4. confirm dialog 취소 → 원래 값 복원, invoke 호출 없음
 *   5. confirm dialog 확인 → extension_session_settings_set invoke + 성공 토스트
 *   6. 같은 값 클릭 → dialog 없음
 *   7. invoke 실패 → 에러 토스트
 */

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

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { ExtensionSettings } from "../ExtensionSettings";

const mockInvoke = vi.mocked(invoke);

function renderComponent() {
  return render(
    <MemoryRouter>
      <ExtensionSettings />
    </MemoryRouter>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ExtensionSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 기본: extension_session_settings_get → hours4
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "extension_session_settings_get") {
        return Promise.resolve({ ttl: "hours4" });
      }
      if (cmd === "extension_session_settings_set") {
        return Promise.resolve(undefined);
      }
      return Promise.resolve(null);
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // 1. 5개 라디오 옵션 렌더
  it("TTL 라디오 5개가 렌더된다", async () => {
    renderComponent();

    await waitFor(() => {
      const radios = screen.getAllByRole("radio");
      expect(radios).toHaveLength(5);
    });
  });

  // 2. 현재 설정 (hours4) checked 확인
  it("현재 설정 hours4 가 checked 상태로 표시된다", async () => {
    renderComponent();

    await waitFor(() => {
      const radio = screen.getByRole("radio", { name: /4.*(hour|기본|デフォルト|默认)/i });
      expect(radio).toBeChecked();
    });
  });

  // 3. 다른 옵션 클릭 → confirm dialog 표시
  it("다른 TTL 옵션 클릭 시 confirm dialog 가 나타난다", async () => {
    const user = userEvent.setup();
    renderComponent();

    await waitFor(() => {
      expect(screen.getAllByRole("radio")).toHaveLength(5);
    });

    // "30 minutes" 라디오 클릭
    const mins30 = screen.getByRole("radio", { name: /30/i });
    await user.click(mins30);

    await waitFor(() => {
      // AlertDialog 제목 등장
      expect(
        screen.getByRole("alertdialog") ?? screen.getByText(/terminated|종료|終了|终止/i),
      ).toBeInTheDocument();
    });
  });

  // 4. confirm cancel → 원래 값 복원, invoke 없음
  it("confirm 취소 시 원래 값이 복원되고 settings_set 이 호출되지 않는다", async () => {
    const user = userEvent.setup();
    renderComponent();

    await waitFor(() => {
      expect(screen.getAllByRole("radio")).toHaveLength(5);
    });

    const mins30 = screen.getByRole("radio", { name: /30/i });
    await user.click(mins30);

    // dialog 대기
    await waitFor(() => {
      expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    });

    // Cancel 버튼 클릭
    const cancelBtn = screen.getByRole("button", { name: /cancel|취소|キャンセル|取消/i });
    await user.click(cancelBtn);

    await waitFor(() => {
      // dialog 닫힘
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });

    // extension_session_settings_set 호출 없음
    expect(mockInvoke).not.toHaveBeenCalledWith(
      "extension_session_settings_set",
      expect.anything(),
    );

    // 기존 hours4 checked 유지
    const hours4 = screen.getByRole("radio", { name: /4.*(hour|기본|デフォルト|默认)/i });
    expect(hours4).toBeChecked();
  });

  // 5. confirm 확인 → settings_set 호출 + 성공 토스트
  it("confirm 확인 시 extension_session_settings_set 이 호출되고 성공 토스트가 표시된다", async () => {
    const user = userEvent.setup();
    renderComponent();

    await waitFor(() => {
      expect(screen.getAllByRole("radio")).toHaveLength(5);
    });

    const mins30 = screen.getByRole("radio", { name: /30/i });
    await user.click(mins30);

    await waitFor(() => {
      expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    });

    // Apply 버튼 클릭
    const applyBtn = screen.getByRole("button", { name: /apply|적용|適用|应用/i });
    await user.click(applyBtn);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("extension_session_settings_set", {
        settings: { ttl: "mins30" },
      });
    });

    expect(toast.success).toHaveBeenCalled();
  });

  // 6. 같은 값 클릭 → dialog 없음
  it("현재 값과 같은 옵션 클릭 시 dialog 가 나타나지 않는다", async () => {
    const user = userEvent.setup();
    renderComponent();

    await waitFor(() => {
      expect(screen.getAllByRole("radio")).toHaveLength(5);
    });

    // hours4 (현재 값) 클릭
    const hours4 = screen.getByRole("radio", { name: /4.*(hour|기본|デフォルト|默认)/i });
    await user.click(hours4);

    // dialog 없음
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });

    expect(mockInvoke).not.toHaveBeenCalledWith(
      "extension_session_settings_set",
      expect.anything(),
    );
  });

  // 7. invoke 실패 → 에러 토스트
  it("extension_session_settings_set 실패 시 에러 토스트가 표시된다", async () => {
    const user = userEvent.setup();

    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "extension_session_settings_get") {
        return Promise.resolve({ ttl: "hours4" });
      }
      if (cmd === "extension_session_settings_set") {
        return Promise.reject(new Error("vault locked"));
      }
      return Promise.resolve(null);
    });

    renderComponent();

    await waitFor(() => {
      expect(screen.getAllByRole("radio")).toHaveLength(5);
    });

    const mins30 = screen.getByRole("radio", { name: /30/i });
    await user.click(mins30);

    await waitFor(() => {
      expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    });

    const applyBtn = screen.getByRole("button", { name: /apply|적용|適用|应用/i });
    await user.click(applyBtn);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled();
    });
  });
});
