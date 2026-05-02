import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

// i18n 초기화
import "@/lib/i18n";

import { CreateVaultDialog } from "../CreateVaultDialog";

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

const mockInvoke = vi.mocked(invoke);

function renderDialog(onSuccess = vi.fn(), onOpenChange = vi.fn()) {
  return render(
    <CreateVaultDialog open={true} onOpenChange={onOpenChange} onSuccess={onSuccess} />,
  );
}

describe("CreateVaultDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("두 패스프레이즈 입력과 만들기 버튼을 렌더링한다", () => {
    renderDialog();
    expect(screen.getByLabelText(/^passphrase$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/confirm passphrase/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /create vault/i })).toBeInTheDocument();
  });

  it("유효성 검사: 12자 미만이면 Create 버튼이 비활성화된다", async () => {
    const user = userEvent.setup();
    renderDialog();

    const passphraseInput = screen.getByLabelText(/^passphrase$/i);
    const confirmInput = screen.getByLabelText(/confirm passphrase/i);
    const createBtn = screen.getByRole("button", { name: /create vault/i });

    // 12자 미만 입력
    await user.type(passphraseInput, "short");
    await user.type(confirmInput, "short");

    expect(createBtn).toBeDisabled();
  });

  it("유효성 검사: 두 입력이 불일치하면 Create 버튼이 비활성화된다", async () => {
    const user = userEvent.setup();
    renderDialog();

    const passphraseInput = screen.getByLabelText(/^passphrase$/i);
    const confirmInput = screen.getByLabelText(/confirm passphrase/i);
    const createBtn = screen.getByRole("button", { name: /create vault/i });

    await user.type(passphraseInput, "mysecretpassword123");
    await user.type(confirmInput, "differentpassword123");

    expect(createBtn).toBeDisabled();
  });

  it("유효성 검사: 12자 이상 + 일치하면 Create 버튼이 활성화된다", async () => {
    const user = userEvent.setup();
    renderDialog();

    const passphraseInput = screen.getByLabelText(/^passphrase$/i);
    const confirmInput = screen.getByLabelText(/confirm passphrase/i);
    const createBtn = screen.getByRole("button", { name: /create vault/i });

    await user.type(passphraseInput, "mysecretpassword123");
    await user.type(confirmInput, "mysecretpassword123");

    expect(createBtn).not.toBeDisabled();
  });

  it("강도 미터: 짧은 패스프레이즈에 'Very weak' 레이블을 표시한다", async () => {
    const user = userEvent.setup();
    renderDialog();

    const passphraseInput = screen.getByLabelText(/^passphrase$/i);
    await user.type(passphraseInput, "password");

    // "Very weak" 또는 "Weak" 표시
    await waitFor(() => {
      const strengthText = screen.queryByText(/very weak|weak/i);
      expect(strengthText).toBeInTheDocument();
    });
  });

  it("강도 미터: 강한 패스프레이즈에 'Strong' 또는 'Very strong' 레이블을 표시한다", async () => {
    const user = userEvent.setup();
    renderDialog();

    const passphraseInput = screen.getByLabelText(/^passphrase$/i);
    // 충분히 복잡한 패스프레이즈
    await user.type(passphraseInput, "c0rr3ct-h0rs3-b4tt3ry-st4pl3");

    await waitFor(() => {
      // 강도 미터 내부의 텍스트만 확인 — 다이얼로그 설명의 "strong"과 구분하기 위해
      // aria-live 컨테이너 내부의 <p> 요소를 찾는다
      const strengthContainer = document.getElementById("passphrase-strength");
      expect(strengthContainer).toBeInTheDocument();
      expect(strengthContainer?.textContent).toMatch(/strong/i);
    });
  });

  it("기본값: Single Charter 모드가 선택되어 있다", () => {
    renderDialog();
    const single = screen.getByLabelText(/single charter/i) as HTMLInputElement;
    expect(single.checked).toBe(true);
  });

  it("성공 경로 (single): 패스프레이즈 + 모드 single 로 vault_init_with_charter 호출", async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    // backend → issuance Single
    mockInvoke.mockResolvedValueOnce({
      kind: "single",
      charter: {
        words: ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot"],
        verifier: 7042,
        formatted: "ALPHA BRAVO CHARLIE DELTA ECHO FOXTROT - 7042",
      },
    });

    renderDialog(onSuccess);

    await user.type(screen.getByLabelText(/^passphrase$/i), "mysecretpassword123");
    await user.type(screen.getByLabelText(/confirm passphrase/i), "mysecretpassword123");
    await user.click(screen.getByRole("button", { name: /create vault/i }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("vault_init_with_charter", {
        password: "mysecretpassword123",
        mode: "single",
      });
    });

    // Charter display 화면이 나타나야 한다
    await waitFor(() => {
      expect(screen.getByText(/Vault Charter/i)).toBeInTheDocument();
      expect(screen.getByText(/ALPHA/i)).toBeInTheDocument();
      expect(screen.getByText("7042")).toBeInTheDocument();
    });

    // "I've saved it" 버튼 클릭 → confirm overlay → "Yes" → onSuccess
    await user.click(screen.getByRole("button", { name: /I've saved it/i }));
    await user.click(screen.getByRole("button", { name: /Yes, I have it saved/i }));

    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it("Shamir 모드 선택 시 mode 'shamir2of3' 으로 invoke", async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValueOnce({
      kind: "shamir2of3",
      shares: [
        {
          index: 1,
          words: ["a", "b", "c", "d", "e", "f", "g"],
          verifier: 1,
          formatted: "Share 1 of 3: ...",
        },
        {
          index: 2,
          words: ["a", "b", "c", "d", "e", "f", "g"],
          verifier: 2,
          formatted: "Share 2 of 3: ...",
        },
        {
          index: 3,
          words: ["a", "b", "c", "d", "e", "f", "g"],
          verifier: 3,
          formatted: "Share 3 of 3: ...",
        },
      ],
    });

    renderDialog();
    await user.click(screen.getByLabelText(/Shamir 2-of-3/i));
    await user.type(screen.getByLabelText(/^passphrase$/i), "mysecretpassword123");
    await user.type(screen.getByLabelText(/confirm passphrase/i), "mysecretpassword123");
    await user.click(screen.getByRole("button", { name: /create vault/i }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("vault_init_with_charter", {
        password: "mysecretpassword123",
        mode: "shamir2of3",
      });
    });
  });

  it("None 모드 선택 시 mode 'none' 으로 invoke 후 즉시 onSuccess", async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    mockInvoke.mockResolvedValueOnce({ kind: "none" });

    renderDialog(onSuccess);
    await user.click(screen.getByLabelText(/Skip/i));
    await user.type(screen.getByLabelText(/^passphrase$/i), "mysecretpassword123");
    await user.type(screen.getByLabelText(/confirm passphrase/i), "mysecretpassword123");
    await user.click(screen.getByRole("button", { name: /create vault/i }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("vault_init_with_charter", {
        password: "mysecretpassword123",
        mode: "none",
      });
    });

    // None 모드는 issuance 표시 안 하고 즉시 onSuccess.
    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledTimes(1);
    });
  });
});
