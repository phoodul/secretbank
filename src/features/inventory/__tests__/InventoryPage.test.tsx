import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import "@/lib/i18n";
import { InventoryPage } from "../InventoryPage";
import { MOCK_CREDENTIALS, MOCK_CREDENTIAL_FULL } from "./fixtures";

// MemoryRouter with initialEntries helper
function renderPageWithRoute(initialEntry = "/") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <InventoryPage />
    </MemoryRouter>,
  );
}

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

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => undefined)),
}));

import { invoke } from "@tauri-apps/api/core";

const mockInvoke = vi.mocked(invoke);

function renderPage() {
  return render(
    <MemoryRouter>
      <InventoryPage />
    </MemoryRouter>,
  );
}

describe("InventoryPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Hide revoked 토글 기본값을 false로 설정해 모든 크리덴셜이 보이게 함
    localStorage.setItem("apivault:inventory:hideRevoked", "false");
    // credential_list → MOCK_CREDENTIALS, issuer_list → [], credential_get → MOCK_CREDENTIAL_FULL
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "issuer_list") return Promise.resolve([]);
      if (cmd === "credential_get") return Promise.resolve(MOCK_CREDENTIAL_FULL);
      if (cmd === "incident_matches_for_credential") return Promise.resolve([]);
      if (cmd === "audit_list") return Promise.resolve([]);
      // bulk revoke commands — no-op in Inventory tests
      if (cmd === "kill_switch_request_confirm_issuer") return Promise.resolve("mock-token");
      if (cmd === "kill_switch_revoke_issuer") return Promise.resolve({ revoked: 0, failed: [] });
      return Promise.resolve(MOCK_CREDENTIALS);
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
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
    // credential_list만 실패, issuer_list는 정상 (Dialog는 열리지 않으므로 issuer_list는 미호출)
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "issuer_list") return Promise.resolve([]);
      return Promise.reject("Network error");
    });
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Failed to load credentials")).toBeInTheDocument();
    });
  });

  it("Retry 버튼 클릭 시 invoke를 재호출한다", async () => {
    const user = userEvent.setup();
    let credentialCallCount = 0;
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "issuer_list") return Promise.resolve([]);
      // credential_list: 첫 번째는 실패, 이후는 성공
      credentialCallCount++;
      if (credentialCallCount === 1) return Promise.reject("error");
      return Promise.resolve(MOCK_CREDENTIALS);
    });
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

  it("Hide revoked 토글이 기본적으로 비활성화(false)이면 revoked 크리덴셜이 보인다", async () => {
    // beforeEach에서 hideRevoked=false로 설정됨
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("OpenAI API Key")).toBeInTheDocument();
    });

    // revoked 2개(AWS Access Key, Cloudflare API Key)가 표시되어야 함
    expect(screen.getByText("AWS Access Key")).toBeInTheDocument();
    expect(screen.getByText("Cloudflare API Key")).toBeInTheDocument();
  });

  it("Hide revoked 토글을 활성화(true)하면 revoked 크리덴셜이 사라진다", async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("AWS Access Key")).toBeInTheDocument();
    });

    // Hide revoked 체크박스 클릭
    const checkbox = screen.getByRole("checkbox", { name: /hide revoked/i });
    await user.click(checkbox);

    await waitFor(() => {
      expect(screen.queryByText("AWS Access Key")).not.toBeInTheDocument();
      expect(screen.queryByText("Cloudflare API Key")).not.toBeInTheDocument();
    });

    // active 크리덴셜은 여전히 표시
    expect(screen.getByText("OpenAI API Key")).toBeInTheDocument();
  });

  it("'+ Add credential' 버튼이 렌더링되고 클릭 가능하다", async () => {
    renderPage();

    await waitFor(() => {
      const addBtn = screen.getByRole("button", { name: /add credential/i });
      expect(addBtn).toBeInTheDocument();
      expect(addBtn).not.toBeDisabled();
    });
  });

  it("[T029 통합] /?action=create 로 렌더 시 CreateCredentialDialog가 자동으로 열린다", async () => {
    renderPageWithRoute("/?action=create");

    // CreateCredentialDialog의 타이틀이 보여야 함
    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
    expect(screen.getByText("Add credential")).toBeInTheDocument();
  });

  it("[T078] Issuer 필터가 'all'이면 bulk revoke 버튼이 숨겨진다", async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("OpenAI API Key")).toBeInTheDocument();
    });

    // issuer 필터가 '__all__'인 상태에서는 버튼이 없어야 함
    expect(screen.queryByTestId("bulk-revoke-action-btn")).not.toBeInTheDocument();
  });

  it("[T078] Issuer 필터를 특정 issuer로 설정하면 bulk revoke 버튼이 나타난다", async () => {
    const MOCK_ISSUER = {
      id: "01HZBBBBBBBBBBBBBBBBBBBBBB",
      slug: "openai",
      display_name: "OpenAI",
      docs_url: null,
      issue_url: null,
      status_url: null,
      security_feed_url: null,
      connector_id: null,
      icon_key: null,
      created_at: Date.now(),
      updated_at: Date.now(),
    };
    const user = userEvent.setup();

    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "issuer_list") return Promise.resolve([MOCK_ISSUER]);
      if (cmd === "credential_get") return Promise.resolve(MOCK_CREDENTIAL_FULL);
      if (cmd === "incident_matches_for_credential") return Promise.resolve([]);
      if (cmd === "audit_list") return Promise.resolve([]);
      if (cmd === "kill_switch_request_confirm_issuer") return Promise.resolve("mock-token");
      if (cmd === "kill_switch_revoke_issuer") return Promise.resolve({ revoked: 0, failed: [] });
      // issuer_id 필터 적용 — active 크리덴셜만 반환
      return Promise.resolve(
        MOCK_CREDENTIALS.filter(
          (c) => c.issuer_id === MOCK_ISSUER.id && c.status !== "revoked",
        ),
      );
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("OpenAI API Key")).toBeInTheDocument();
    });

    // Issuer 필터 선택
    const issuerTrigger = screen.getByRole("combobox", { name: /^issuer$/i });
    await user.click(issuerTrigger);

    const openAIOption = await screen.findByRole("option", { name: "OpenAI" });
    await user.click(openAIOption);

    // bulk revoke 버튼이 나타나야 함
    await waitFor(() => {
      expect(screen.getByTestId("bulk-revoke-action-btn")).toBeInTheDocument();
    });
  });

  it("[T027 통합] 카드 클릭 시 CredentialDetail Drawer가 열리고 credential_get이 호출된다", async () => {
    const user = userEvent.setup();
    renderPage();

    // 목록 로드 대기
    await waitFor(() => {
      expect(screen.getByText("OpenAI API Key")).toBeInTheDocument();
    });

    // 첫 번째 카드 클릭
    const card = screen.getByRole("button", { name: /openai api key/i });
    await user.click(card);

    // Drawer(Sheet) 헤더 확인 — SheetTitle은 heading role
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Credential details" })).toBeInTheDocument();
    });

    // credential_get 호출 확인
    expect(mockInvoke).toHaveBeenCalledWith("credential_get", {
      id: MOCK_CREDENTIALS[0].id,
    });
  });
});
