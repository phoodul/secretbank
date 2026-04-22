import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import "@/lib/i18n";
import { InventoryPage } from "../InventoryPage";
import { MOCK_CREDENTIALS } from "./fixtures";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import { invoke } from "@tauri-apps/api/core";

const mockInvoke = vi.mocked(invoke);

function renderPage() {
  return render(<InventoryPage />);
}

describe("InventoryPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockResolvedValue(MOCK_CREDENTIALS);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("10개 credential 카드를 렌더링한다", async () => {
    renderPage();

    await waitFor(() => {
      // 로딩 스켈레톤이 사라지고 카드가 렌더링되어야 함
      expect(screen.queryByText("OpenAI API Key")).toBeInTheDocument();
    });

    // 10개 카드의 이름이 모두 보여야 함
    for (const c of MOCK_CREDENTIALS) {
      expect(screen.getByText(c.name)).toBeInTheDocument();
    }
  });

  it("빈 상태 메시지가 초기에는 보이지 않는다 (데이터가 있을 때)", async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.queryByText("No credentials yet")).not.toBeInTheDocument();
    });
  });

  it("데이터가 없으면 빈 상태를 표시한다", async () => {
    mockInvoke.mockResolvedValue([]);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("No credentials yet")).toBeInTheDocument();
    });
  });

  it("검색어 입력 시 name이 일치하는 카드만 표시한다", async () => {
    const user = userEvent.setup();
    renderPage();

    // 데이터 로드 대기
    await waitFor(() => {
      expect(screen.getByText("OpenAI API Key")).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText("Search by name…");
    await user.type(input, "GitHub");

    // "GitHub Token Dev"만 남아야 함
    await waitFor(() => {
      expect(screen.getByText("GitHub Token Dev")).toBeInTheDocument();
      expect(screen.queryByText("OpenAI API Key")).not.toBeInTheDocument();
      expect(screen.queryByText("Stripe Secret Key")).not.toBeInTheDocument();
    });
  });

  it("검색어를 지우면 전체 목록이 복원된다", async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("OpenAI API Key")).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText("Search by name…");
    await user.type(input, "Stripe");

    await waitFor(() => {
      expect(screen.getByText("Stripe Secret Key")).toBeInTheDocument();
      expect(screen.queryByText("OpenAI API Key")).not.toBeInTheDocument();
    });

    await user.clear(input);

    await waitFor(() => {
      expect(screen.getByText("OpenAI API Key")).toBeInTheDocument();
    });
  });

  it("대소문자 구분 없이 검색된다", async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("AWS Access Key")).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText("Search by name…");
    await user.type(input, "aws");

    await waitFor(() => {
      expect(screen.getByText("AWS Access Key")).toBeInTheDocument();
      expect(screen.queryByText("OpenAI API Key")).not.toBeInTheDocument();
    });
  });

  it("로드 실패 시 에러 배너를 표시한다", async () => {
    mockInvoke.mockRejectedValue("Network error");
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Failed to load credentials")).toBeInTheDocument();
    });
  });

  it("Retry 버튼 클릭 시 invoke를 재호출한다", async () => {
    const user = userEvent.setup();
    mockInvoke.mockRejectedValueOnce("error").mockResolvedValue(MOCK_CREDENTIALS);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Failed to load credentials")).toBeInTheDocument();
    });

    const retryBtn = screen.getByRole("button", { name: /retry/i });
    await user.click(retryBtn);

    await waitFor(() => {
      expect(screen.queryByText("Failed to load credentials")).not.toBeInTheDocument();
      expect(screen.getByText("OpenAI API Key")).toBeInTheDocument();
    });

    // invoke가 2번 호출되어야 함 (초기 + Retry)
    expect(mockInvoke).toHaveBeenCalledTimes(2);
  });

  it("Status 필터 'revoked' 선택 시 invoke가 filter={status:'revoked'}로 재호출된다", async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("OpenAI API Key")).toBeInTheDocument();
    });

    // mockInvoke 호출 횟수 리셋 (초기 로드 이후)
    mockInvoke.mockClear();
    mockInvoke.mockResolvedValue(MOCK_CREDENTIALS.filter((c) => c.status === "revoked"));

    // Status select 클릭 — aria-label="Status" 로 찾기
    const statusTrigger = screen.getByRole("combobox", { name: /^status$/i });
    await user.click(statusTrigger);

    // Revoked 옵션 선택
    const revokedOption = await screen.findByRole("option", { name: /^revoked$/i });
    await user.click(revokedOption);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("credential_list", {
        filter: { status: "revoked" },
      });
    });
  });

  it("'+ Add credential' 버튼이 disabled 상태로 렌더링된다", async () => {
    renderPage();

    await waitFor(() => {
      const addBtn = screen.getByRole("button", { name: /add credential/i });
      expect(addBtn).toBeDisabled();
    });
  });
});
