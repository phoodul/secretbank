import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import "@/lib/i18n";
import { CreateCredentialDialog } from "../CreateCredentialDialog";
import type { Issuer } from "../use-issuers";

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
  },
}));

import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";

const mockInvoke = vi.mocked(invoke);
const mockToast = {
  success: vi.mocked(toast.success),
  error: vi.mocked(toast.error),
};

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const MOCK_ISSUERS: Issuer[] = [
  {
    id: "01HZBBBBBBBBBBBBBBBBBBBBBB",
    slug: "openai",
    display_name: "OpenAI",
    docs_url: "https://platform.openai.com/docs",
    issue_url: "https://platform.openai.com/account/api-keys",
    status_url: null,
    security_feed_url: null,
    connector_id: null,
    icon_key: "openai",
    default_primary_label: null,
    default_secondary_label: null,
    created_at: 1700000000000,
    updated_at: 1700000000000,
  },
  {
    id: "01HZBBBBBBBBBBBBBBBBBBBBBC",
    slug: "stripe",
    display_name: "Stripe",
    docs_url: "https://stripe.com/docs",
    issue_url: "https://dashboard.stripe.com/apikeys",
    status_url: null,
    security_feed_url: null,
    connector_id: null,
    icon_key: "stripe",
    default_primary_label: null,
    default_secondary_label: null,
    created_at: 1700000000000,
    updated_at: 1700000000000,
  },
  {
    id: "01HZBBBBBBBBBBBBBBBBBBBBBD",
    slug: "github",
    display_name: "GitHub",
    docs_url: "https://docs.github.com/rest",
    issue_url: "https://github.com/settings/tokens",
    status_url: null,
    security_feed_url: null,
    connector_id: null,
    icon_key: "github",
    default_primary_label: null,
    default_secondary_label: null,
    created_at: 1700000000000,
    updated_at: 1700000000000,
  },
  {
    id: "01HZBBBBBBBBBBBBBBBBBBBBBS",
    slug: "supabase",
    display_name: "Supabase",
    docs_url: "https://supabase.com/docs/reference",
    issue_url: "https://supabase.com/dashboard/account/tokens",
    status_url: null,
    security_feed_url: null,
    connector_id: null,
    icon_key: "supabase",
    default_primary_label: null,
    default_secondary_label: null,
    created_at: 1700000000000,
    updated_at: 1700000000000,
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderDialog(
  props: {
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    onSuccess?: () => void;
  } = {},
) {
  const onOpenChange = props.onOpenChange ?? vi.fn();
  const onSuccess = props.onSuccess ?? vi.fn();
  const open = props.open ?? true;

  const result = render(
    <CreateCredentialDialog open={open} onOpenChange={onOpenChange} onSuccess={onSuccess} />,
  );
  return { ...result, onOpenChange, onSuccess };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  // issuer_list 기본 mock: MOCK_ISSUERS 반환
  mockInvoke.mockImplementation((cmd: string) => {
    if (cmd === "issuer_list") return Promise.resolve(MOCK_ISSUERS);
    return Promise.resolve("01HZNEWCREDID00000000000");
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CreateCredentialDialog", () => {
  it("open=true일 때 주요 필드가 렌더링된다", async () => {
    renderDialog();

    // Dialog 타이틀
    expect(await screen.findByText("Add credential")).toBeInTheDocument();

    // Issuer combobox 버튼
    expect(screen.getByRole("combobox", { name: /issuer/i })).toBeInTheDocument();

    // Name
    expect(screen.getByPlaceholderText("e.g. Production key")).toBeInTheDocument();

    // Value
    expect(screen.getByPlaceholderText("Paste your API key")).toBeInTheDocument();

    // Env select
    expect(screen.getByRole("combobox", { name: /environment/i })).toBeInTheDocument();

    // Scope
    expect(screen.getByPlaceholderText("Optional, e.g. billing:read")).toBeInTheDocument();

    // Expires at (date input) — type=date 속성으로 식별
    const dateInput = document.querySelector('input[type="date"]');
    expect(dateInput).toBeInTheDocument();
  });

  it("Name 비우고 제출 → 에러 메시지 표시, invoke 미호출", async () => {
    const user = userEvent.setup();
    renderDialog();

    // issuer 선택
    const issuerBtn = await screen.findByRole("combobox", { name: /issuer/i });
    await user.click(issuerBtn);
    const openAiItem = await screen.findByText("OpenAI");
    await user.click(openAiItem);

    // value 입력
    const valueInput = screen.getByPlaceholderText("Paste your API key");
    await user.type(valueInput, "sk-test-1234567890");

    // name은 비워둔 채 제출
    const submitBtn = screen.getByRole("button", { name: /save credential/i });
    await user.click(submitBtn);

    await waitFor(() => {
      // zod string().min(1) 에러
      expect(screen.getByRole("button", { name: /save credential/i })).toBeInTheDocument();
    });

    expect(mockInvoke).not.toHaveBeenCalledWith("credential_create", expect.anything());
  });

  it("Value 비우고 제출 → 에러 메시지 표시, invoke 미호출", async () => {
    const user = userEvent.setup();
    renderDialog();

    // issuer 선택
    const issuerBtn = await screen.findByRole("combobox", { name: /issuer/i });
    await user.click(issuerBtn);
    const openAiItem = await screen.findByText("OpenAI");
    await user.click(openAiItem);

    // name 입력
    const nameInput = screen.getByPlaceholderText("e.g. Production key");
    await user.type(nameInput, "My Key");

    // value는 비워둔 채 제출
    const submitBtn = screen.getByRole("button", { name: /save credential/i });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /save credential/i })).toBeInTheDocument();
    });

    expect(mockInvoke).not.toHaveBeenCalledWith("credential_create", expect.anything());
  });

  it("Issuer 미선택 채 제출 → invoke 미호출", async () => {
    const user = userEvent.setup();
    renderDialog();

    // issuer_list 로드 대기
    await screen.findByRole("combobox", { name: /issuer/i });

    // name, value 입력
    const nameInput = screen.getByPlaceholderText("e.g. Production key");
    await user.type(nameInput, "My Key");

    const valueInput = screen.getByPlaceholderText("Paste your API key");
    await user.type(valueInput, "sk-test-1234567890");

    // issuer 미선택 채 제출
    const submitBtn = screen.getByRole("button", { name: /save credential/i });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /save credential/i })).toBeInTheDocument();
    });

    expect(mockInvoke).not.toHaveBeenCalledWith("credential_create", expect.anything());
  });

  it("모든 필드 유효 제출 → invoke('credential_create', ...) 인자 검증", async () => {
    const user = userEvent.setup();
    renderDialog();

    // issuer 선택
    const issuerBtn = await screen.findByRole("combobox", { name: /issuer/i });
    await user.click(issuerBtn);
    const openAiItem = await screen.findByText("OpenAI");
    await user.click(openAiItem);

    // name 입력
    const nameInput = screen.getByPlaceholderText("e.g. Production key");
    await user.type(nameInput, "Prod Key");

    // value 입력
    const valueInput = screen.getByPlaceholderText("Paste your API key");
    await user.type(valueInput, "sk-testkey1234");

    // url, username, scope, expires_at 비워둠 (optional)

    const submitBtn = screen.getByRole("button", { name: /save credential/i });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("credential_create", {
        args: {
          kind: "api_key",
          issuer_id: "01HZBBBBBBBBBBBBBBBBBBBBBB",
          name: "Prod Key",
          url: undefined,
          username: undefined,
          env: "prod",
          scope: undefined,
          expires_at: undefined,
          hash_hint: "1234", // "sk-testkey1234".slice(-4)
          primary_label: undefined,
          secondary_label: undefined,
          value: "sk-testkey1234",
          secondary_value: undefined,
        },
      });
    });
  });

  it("성공 시 onSuccess 콜 + onOpenChange(false) 호출", async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    const onOpenChange = vi.fn();
    renderDialog({ onSuccess, onOpenChange });

    // issuer 선택
    const issuerBtn = await screen.findByRole("combobox", { name: /issuer/i });
    await user.click(issuerBtn);
    const openAiItem = await screen.findByText("OpenAI");
    await user.click(openAiItem);

    const nameInput = screen.getByPlaceholderText("e.g. Production key");
    await user.type(nameInput, "Prod Key");

    const valueInput = screen.getByPlaceholderText("Paste your API key");
    await user.type(valueInput, "sk-secret0001");

    const submitBtn = screen.getByRole("button", { name: /save credential/i });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledTimes(1);
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it("성공 시 toast.success 호출", async () => {
    const user = userEvent.setup();
    renderDialog();

    // issuer 선택
    const issuerBtn = await screen.findByRole("combobox", { name: /issuer/i });
    await user.click(issuerBtn);
    const openAiItem = await screen.findByText("OpenAI");
    await user.click(openAiItem);

    const nameInput = screen.getByPlaceholderText("e.g. Production key");
    await user.type(nameInput, "Key A");

    const valueInput = screen.getByPlaceholderText("Paste your API key");
    await user.type(valueInput, "sk-abcdefgh");

    const submitBtn = screen.getByRole("button", { name: /save credential/i });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(mockToast.success).toHaveBeenCalledWith("Credential saved");
    });
  });

  it("show/hide 토글: 기본 type=password, 버튼 클릭 후 type=text", async () => {
    const user = userEvent.setup();
    renderDialog();

    // issuer_list 로드 대기
    await screen.findByRole("combobox", { name: /issuer/i });

    const valueInput = screen.getByPlaceholderText("Paste your API key");
    expect(valueInput).toHaveAttribute("type", "password");

    const showBtn = screen.getByRole("button", { name: /show value/i });
    await user.click(showBtn);

    expect(valueInput).toHaveAttribute("type", "text");

    const hideBtn = screen.getByRole("button", { name: /hide value/i });
    await user.click(hideBtn);

    expect(valueInput).toHaveAttribute("type", "password");
  });

  it("Value 입력이 autoComplete='new-password' + aria-autocomplete='none' 속성을 가진다", async () => {
    renderDialog();

    // issuer_list 로드 대기
    await screen.findByRole("combobox", { name: /issuer/i });

    const valueInput = screen.getByPlaceholderText("Paste your API key");
    expect(valueInput).toHaveAttribute("autocomplete", "new-password");
    expect(valueInput).toHaveAttribute("aria-autocomplete", "none");
  });

  it("invoke 실패 시 toast.error 호출, onOpenChange 호출 안 됨", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "issuer_list") return Promise.resolve(MOCK_ISSUERS);
      return Promise.reject(new Error("internal error"));
    });

    renderDialog({ onOpenChange });

    // issuer 선택
    const issuerBtn = await screen.findByRole("combobox", { name: /issuer/i });
    await user.click(issuerBtn);
    const openAiItem = await screen.findByText("OpenAI");
    await user.click(openAiItem);

    const nameInput = screen.getByPlaceholderText("e.g. Production key");
    await user.type(nameInput, "Fail Key");

    const valueInput = screen.getByPlaceholderText("Paste your API key");
    await user.type(valueInput, "sk-willfail0");

    const submitBtn = screen.getByRole("button", { name: /save credential/i });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith("Failed to save credential");
    });

    // dialog가 닫히지 않아야 함 (open=true가 계속 전달된 상태이므로 onOpenChange(false) 미호출)
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("scope 입력 시 invoke args에 포함되고, 빈 값이면 undefined로 전달된다", async () => {
    const user = userEvent.setup();
    renderDialog();

    // issuer 선택
    const issuerBtn = await screen.findByRole("combobox", { name: /issuer/i });
    await user.click(issuerBtn);
    const openAiItem = await screen.findByText("OpenAI");
    await user.click(openAiItem);

    const nameInput = screen.getByPlaceholderText("e.g. Production key");
    await user.type(nameInput, "Scoped Key");

    const valueInput = screen.getByPlaceholderText("Paste your API key");
    await user.type(valueInput, "sk-scoped9999");

    const scopeInput = screen.getByPlaceholderText("Optional, e.g. billing:read");
    await user.type(scopeInput, "billing:read");

    const submitBtn = screen.getByRole("button", { name: /save credential/i });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        "credential_create",
        expect.objectContaining({
          args: expect.objectContaining({
            scope: "billing:read",
          }),
        }),
      );
    });
  });

  it("expires_at 입력 시 ms timestamp로 변환되어 invoke에 전달된다", async () => {
    const user = userEvent.setup();
    renderDialog();

    // issuer 선택
    const issuerBtn = await screen.findByRole("combobox", { name: /issuer/i });
    await user.click(issuerBtn);
    const openAiItem = await screen.findByText("OpenAI");
    await user.click(openAiItem);

    const nameInput = screen.getByPlaceholderText("e.g. Production key");
    await user.type(nameInput, "Expiring Key");

    const valueInput = screen.getByPlaceholderText("Paste your API key");
    await user.type(valueInput, "sk-expire1234");

    // date input에 값 설정 — type=date 속성으로 직접 조회
    const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement;
    if (dateInput) {
      await user.type(dateInput, "2027-12-31");
    }

    const submitBtn = screen.getByRole("button", { name: /save credential/i });
    await user.click(submitBtn);

    await waitFor(() => {
      const calls = mockInvoke.mock.calls.filter((c) => c[0] === "credential_create");
      expect(calls.length).toBeGreaterThan(0);
      const args = calls[0][1] as { args: { expires_at?: number } };
      expect(typeof args.args.expires_at).toBe("number");
      expect(args.args.expires_at).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // URL auto-detect 테스트 (M24 2-1b)
  // ---------------------------------------------------------------------------

  it("URL 입력 → issuer 콤보박스가 자동으로 Supabase 로 변경된다", async () => {
    const user = userEvent.setup();
    renderDialog();

    // issuer_list 로드 대기
    await screen.findByRole("combobox", { name: /issuer/i });

    // URL 입력
    const urlInput = screen.getByPlaceholderText("https://api.example.com (optional)");
    await user.type(urlInput, "https://supabase.com/dashboard");

    // issuer 콤보박스에 Supabase 가 표시되어야 함
    await waitFor(() => {
      expect(screen.getByRole("combobox", { name: /issuer/i })).toHaveTextContent("Supabase");
    });
  });

  it("사용자가 issuer 명시 선택 후 URL 변경 → issuer 변경되지 않음 (lock)", async () => {
    const user = userEvent.setup();
    renderDialog();

    // issuer 직접 선택 (GitHub)
    const issuerBtn = await screen.findByRole("combobox", { name: /issuer/i });
    await user.click(issuerBtn);
    const githubItem = await screen.findByText("GitHub");
    await user.click(githubItem);

    // GitHub 선택 확인
    await waitFor(() => {
      expect(screen.getByRole("combobox", { name: /issuer/i })).toHaveTextContent("GitHub");
    });

    // URL 에 Supabase 도메인 입력
    const urlInput = screen.getByPlaceholderText("https://api.example.com (optional)");
    await user.type(urlInput, "https://supabase.com/dashboard");

    // issuer가 GitHub 그대로여야 함 (lock 이 걸렸으므로)
    await waitFor(() => {
      expect(screen.getByRole("combobox", { name: /issuer/i })).toHaveTextContent("GitHub");
    });
  });

  it("kind=password 선택 → username 필드 표시", async () => {
    const user = userEvent.setup();
    renderDialog();

    await screen.findByRole("combobox", { name: /issuer/i });

    // 초기: username 필드 없음
    expect(screen.queryByPlaceholderText("e.g. user@example.com")).not.toBeInTheDocument();

    // kind=password 선택 — SelectItem은 listbox role 로 렌더됨, getAllByRole 로 접근
    const kindSelect = screen.getByRole("combobox", { name: /credential type/i });
    await user.click(kindSelect);
    // listbox 내 "Password" option 클릭
    const passwordOption = await screen.findByRole("option", { name: "Password" });
    await user.click(passwordOption);

    // username 필드 표시
    expect(await screen.findByPlaceholderText("e.g. user@example.com")).toBeInTheDocument();
  });

  it("kind=password → api_key 로 되돌리면 username 필드 숨김", async () => {
    const user = userEvent.setup();
    renderDialog();

    await screen.findByRole("combobox", { name: /issuer/i });

    // kind=password 선택
    const kindSelect = screen.getByRole("combobox", { name: /credential type/i });
    await user.click(kindSelect);
    const passwordOption = await screen.findByRole("option", { name: "Password" });
    await user.click(passwordOption);

    // username 필드 보임
    expect(await screen.findByPlaceholderText("e.g. user@example.com")).toBeInTheDocument();

    // kind=api_key 로 되돌리기
    await user.click(kindSelect);
    const apiKeyOption = await screen.findByRole("option", { name: "API Key" });
    await user.click(apiKeyOption);

    // username 필드 숨김
    await waitFor(() => {
      expect(screen.queryByPlaceholderText("e.g. user@example.com")).not.toBeInTheDocument();
    });
  });

  it("secondary 토글 ON 후 submit → secondary_value + secondary_label + primary_label 포함", async () => {
    const user = userEvent.setup();

    // Replace MOCK_ISSUERS Supabase entry with one that has default labels set
    const SUPABASE_WITH_LABELS = {
      id: "01HZBBBBBBBBBBBBBBBBBBBBBS",
      slug: "supabase",
      display_name: "Supabase",
      docs_url: null,
      issue_url: null,
      status_url: null,
      security_feed_url: null,
      connector_id: null,
      icon_key: "supabase",
      default_primary_label: "Public Key",
      default_secondary_label: "Secret Key",
      created_at: 1700000000000,
      updated_at: 1700000000000,
    };
    const issuersWithLabels = [
      ...MOCK_ISSUERS.filter((i) => i.slug !== "supabase"),
      SUPABASE_WITH_LABELS,
    ];
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "issuer_list") return Promise.resolve(issuersWithLabels);
      return Promise.resolve("01HZNEWCREDID00000000001");
    });

    renderDialog();

    // issuer 선택 (Supabase)
    const issuerBtn = await screen.findByRole("combobox", { name: /issuer/i });
    await user.click(issuerBtn);
    const supabaseItem = await screen.findByText("Supabase");
    await user.click(supabaseItem);

    // secondary 필드가 자동으로 나타나야 함 (default_secondary_label != null → has_secondary = true)
    expect(await screen.findByText("Secondary label")).toBeInTheDocument();
    expect(screen.getByText("Secondary value")).toBeInTheDocument();

    // name, value 입력
    const nameInput = screen.getByPlaceholderText("e.g. Production key");
    await user.type(nameInput, "Pair Key");

    const valueInput = screen.getByPlaceholderText("Paste your API key");
    await user.type(valueInput, "pk-public-1234");

    // secondary_value 입력 (type=password 이므로 password inputs 중 두 번째)
    const passwordInputs = document.querySelectorAll('input[type="password"]');
    const secondaryValueInput = passwordInputs[1] as HTMLInputElement;
    await user.type(secondaryValueInput, "sk-secret-5678");

    const submitBtn = screen.getByRole("button", { name: /save credential/i });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        "credential_create",
        expect.objectContaining({
          args: expect.objectContaining({
            primary_label: "Public Key",
            secondary_label: "Secret Key",
            secondary_value: "sk-secret-5678",
          }),
        }),
      );
    });
  });
});

// ---------------------------------------------------------------------------
// InventoryPage 통합: add 버튼 클릭 시 Dialog 열림
// ---------------------------------------------------------------------------

import { InventoryPage } from "../InventoryPage";
import { MOCK_CREDENTIALS } from "./fixtures";

describe("InventoryPage - add 버튼 통합", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "credential_list") return Promise.resolve(MOCK_CREDENTIALS);
      if (cmd === "issuer_list") return Promise.resolve(MOCK_ISSUERS);
      return Promise.resolve(null);
    });
  });

  it("'+ Add credential' 버튼 클릭 시 Dialog가 열린다", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <InventoryPage />
      </MemoryRouter>,
    );

    // 목록 로드 대기
    await waitFor(() => {
      expect(screen.getByText("OpenAI API Key")).toBeInTheDocument();
    });

    // 버튼이 더 이상 disabled가 아님
    const addBtn = screen.getByRole("button", { name: /add credential/i });
    expect(addBtn).not.toBeDisabled();

    await user.click(addBtn);

    // Dialog 열림
    await waitFor(() => {
      expect(screen.getByText("Add credential")).toBeInTheDocument();
    });
  });
});
