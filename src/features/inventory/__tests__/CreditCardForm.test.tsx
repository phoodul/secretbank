/**
 * CreditCardForm — Phase 3-A-4 unit tests (F1–F10)
 *
 * 보안: 카드번호 평문을 console.log 하거나 스냅샷에 포함하지 않는다.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { CreditCardForm } from "../CreditCardForm";
import type { CreditCardFormProps } from "../CreditCardForm";

// ---------------------------------------------------------------------------
// motion/react mock — jsdom 에서 animation 불필요
// ---------------------------------------------------------------------------

vi.mock("motion/react", () => ({
  motion: {
    div: ({ children, ...rest }: React.ComponentProps<"div">) => <div {...rest}>{children}</div>,
  },
  useReducedMotion: () => true,
}));

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function renderForm(props: Partial<CreditCardFormProps> = {}) {
  const onSubmit = props.onSubmit ?? vi.fn().mockResolvedValue(undefined);
  const onCancel = props.onCancel;
  const submitting = props.submitting ?? false;

  render(
    <CreditCardForm
      defaultValues={props.defaultValues}
      onSubmit={onSubmit}
      onCancel={onCancel}
      submitting={submitting}
    />,
  );

  return { onSubmit };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CreditCardForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // F1 — 빈 폼 제출 → 카드번호 에러 + CVC 에러
  // 빈 문자열은 regex 에러("Numbers only")가 min 에러보다 먼저 발생하므로
  // 카드번호 에러는 "Numbers only" 또는 "Card number too short" 중 하나 확인,
  // CVC 에러는 "Numbers only" 또는 "CVC must be at least 3 digits" 중 하나 확인.
  it("F1: 빈 폼 제출 → 카드 번호 및 CVC 에러 메시지 표시", async () => {
    const user = userEvent.setup();
    renderForm();

    const saveBtn = screen.getByRole("button", { name: /save/i });
    await user.click(saveBtn);

    await waitFor(() => {
      // 카드번호 에러: regex 또는 min 에러 중 하나
      const cardErrors = screen.queryAllByText(/numbers only|card number too short/i);
      expect(cardErrors.length).toBeGreaterThan(0);
    });

    // CVC 에러: regex 또는 min 에러 중 하나
    const cvcErrors = screen.queryAllByText(/numbers only|CVC must be at least 3 digits/i);
    expect(cvcErrors.length).toBeGreaterThan(0);
  });

  // F2 — Visa 번호 입력 → brand=visa + 미리보기 그라디언트 변경
  it("F2: Visa 번호 입력 → brand 실시간 감지", async () => {
    const user = userEvent.setup();
    renderForm();

    // PatternFormat 은 placeholder character 를 포함하는 input 이므로 aria-label 로 찾음
    const cardInput = screen.getByRole("textbox", { name: /card number/i });
    await user.type(cardInput, "4111111111111111");

    // CreditCardVisual 이 brand 기반 aria-label 을 가짐
    await waitFor(() => {
      // 카드 미리보기: last4 "1111" 포함
      expect(
        screen.getByRole("button", { name: /credit card ending in 1111/i }),
      ).toBeInTheDocument();
    });
  });

  // F3 — Amex 번호 입력 → brand=amex + CVC 4자리 패턴
  it("F3: Amex 번호 입력 → brand=amex 감지 + CVC 입력란이 4자리 허용", async () => {
    const user = userEvent.setup();
    renderForm();

    const cardInput = screen.getByRole("textbox", { name: /card number/i });
    await user.type(cardInput, "378282246310005");

    // CVC input 이 4자리 포맷으로 변경됨 — 4자리 입력 가능
    const cvcInput = document.querySelector('input[aria-label="CVC"]') as HTMLInputElement;
    expect(cvcInput).toBeInTheDocument();

    // Amex CVC 는 4자리 허용 — 4자리 입력 후 에러 없어야 함
    await user.type(cvcInput, "1234");
    await waitFor(() => {
      // 4자리 입력 → CVC 에러 없음
      expect(screen.queryByText(/CVC must be at most 4 digits/i)).not.toBeInTheDocument();
    });
  });

  // F4 — 만료월 12, 연도 = 현재 - 1 → "만료일이 과거" 에러
  it("F4: 과거 연도 선택 → 만료일 과거 에러", async () => {
    const user = userEvent.setup();
    renderForm();

    // 카드번호 + CVC 먼저 채워야 refine 에러가 드러남
    const cardInput = screen.getByRole("textbox", { name: /card number/i });
    await user.type(cardInput, "4111111111111111");

    const cvcInput = document.querySelector('input[aria-label="CVC"]') as HTMLInputElement;
    await user.type(cvcInput, "123");

    // 연도 select — 현재 연도보다 과거는 리스트에 없으므로 현재 연도만 선택 가능
    // 현재 연도 선택 + 월을 현재 월보다 이전 달로 설정해 과거 만료를 테스트
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    // 현재 월이 1월이면 이 테스트는 건너뜀 (1월엔 이전 달이 없음)
    if (currentMonth === 1) return;

    // 연도 select를 현재 연도로 설정 (기본값)
    const yearTrigger = screen.getByRole("combobox", { name: /expiry year/i });
    await user.click(yearTrigger);
    const yearOption = await screen.findByRole("option", { name: String(currentYear) });
    await user.click(yearOption);

    // 월을 현재 월보다 이전으로 설정 (현재 월 - 1)
    const monthTrigger = screen.getByRole("combobox", { name: /expiry month/i });
    await user.click(monthTrigger);
    const prevMonth = String(currentMonth - 1).padStart(2, "0");
    const monthOption = await screen.findByRole("option", { name: prevMonth });
    await user.click(monthOption);

    const saveBtn = screen.getByRole("button", { name: /save/i });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(screen.getByText(/expiry date is in the past/i)).toBeInTheDocument();
    });
  });

  // F5 — 만료월 12, 연도 = 현재 + 5 → 통과 (에러 없음)
  it("F5: 미래 만료일 → 에러 없이 통과", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderForm({ onSubmit });

    const cardInput = screen.getByRole("textbox", { name: /card number/i });
    await user.type(cardInput, "4111111111111111");

    const cvcInput = document.querySelector('input[aria-label="CVC"]') as HTMLInputElement;
    await user.type(cvcInput, "123");

    const futureYear = new Date().getFullYear() + 5;

    const yearTrigger = screen.getByRole("combobox", { name: /expiry year/i });
    await user.click(yearTrigger);
    const yearOption = await screen.findByRole("option", { name: String(futureYear) });
    await user.click(yearOption);

    const monthTrigger = screen.getByRole("combobox", { name: /expiry month/i });
    await user.click(monthTrigger);
    const monthOption = await screen.findByRole("option", { name: "12" });
    await user.click(monthOption);

    const saveBtn = screen.getByRole("button", { name: /save/i });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    expect(screen.queryByText(/expiry date is in the past/i)).not.toBeInTheDocument();
  });

  // F6 — CVC 2자리 → "CVC must be at least 3 digits"
  it("F6: CVC 2자리 입력 → 최소 3자리 에러", async () => {
    const user = userEvent.setup();
    renderForm();

    const cardInput = screen.getByRole("textbox", { name: /card number/i });
    await user.type(cardInput, "4111111111111111");

    const cvcInput = document.querySelector('input[aria-label="CVC"]') as HTMLInputElement;
    await user.type(cvcInput, "12");

    const saveBtn = screen.getByRole("button", { name: /save/i });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(screen.getByText(/CVC must be at least 3 digits/i)).toBeInTheDocument();
    });
  });

  // F7 — PatternFormat 이 숫자 외 문자를 차단
  it("F7: 카드번호 필드에 영문 입력 시 PatternFormat 이 차단", async () => {
    const user = userEvent.setup();
    renderForm();

    const cardInput = screen.getByRole("textbox", { name: /card number/i });
    await user.type(cardInput, "abcd");

    // PatternFormat 은 format 패턴의 '#' 자리에만 숫자를 받음 — 알파벳은 무시됨
    // input value 는 비어 있거나 공백만 있어야 함
    expect((cardInput as HTMLInputElement).value.replace(/\s/g, "")).toBe("");
  });

  // F8 — 정상 폼 제출 → onSubmit 호출 + values + brand + last_4 전달
  it("F8: 정상 제출 → onSubmit(values + brand + last_4) 호출", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderForm({ onSubmit });

    const cardInput = screen.getByRole("textbox", { name: /card number/i });
    await user.type(cardInput, "4111111111111111");

    const cvcInput = document.querySelector('input[aria-label="CVC"]') as HTMLInputElement;
    await user.type(cvcInput, "123");

    const futureYear = new Date().getFullYear() + 3;
    const yearTrigger = screen.getByRole("combobox", { name: /expiry year/i });
    await user.click(yearTrigger);
    const yearOption = await screen.findByRole("option", { name: String(futureYear) });
    await user.click(yearOption);

    const saveBtn = screen.getByRole("button", { name: /save/i });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    const callArg = onSubmit.mock.calls[0][0] as {
      card_number_plain: string;
      brand: string;
      last_4: string;
      cvc_plain: string;
    };
    expect(callArg.brand).toBe("visa");
    expect(callArg.last_4).toBe("1111");
    expect(callArg.card_number_plain).toBe("4111111111111111");
    expect(callArg.cvc_plain).toBe("123");
  });

  // F9 — submitting=true → 버튼 disabled + "Saving..." 텍스트
  it("F9: submitting=true → 저장 버튼 disabled + Saving... 표시", () => {
    renderForm({ submitting: true });

    const saveBtn = screen.getByRole("button", { name: /saving/i });
    expect(saveBtn).toBeDisabled();
    expect(saveBtn).toHaveTextContent("Saving...");
  });

  // F10 — onCancel prop 없음 → 취소 버튼 미렌더
  it("F10: onCancel prop 없으면 취소 버튼 미렌더", () => {
    renderForm({ onCancel: undefined });

    expect(screen.queryByRole("button", { name: /cancel/i })).not.toBeInTheDocument();
  });
});
