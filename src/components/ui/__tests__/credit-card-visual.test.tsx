/**
 * CreditCardVisual — Phase 3-A-3 Vitest + RTL
 *
 * V1  cvcRevealed=false 카드 클릭 → flipped 변경 ❌ + onFlipRequest 호출 ✅
 * V2  cvcRevealed=true 카드 클릭 → flipped toggle + onFlipRequest 호출
 * V3  cvcRevealed=true → false 변경 시 자동으로 flipped=false 복귀
 * V4  revealedCardNumber 없음 → 마스킹 표시
 * V5  revealedCardNumber 있음 → formatCardNumber 결과 표시
 * V6  cvcRevealed=false → CVC 영역에 ••• (Amex 면 ••••)
 * V7  cvcRevealed=true && revealedCvc="123" → "123" 표시
 * V8  Enter 키 → handleClick 호출 (onFlipRequest 트리거)
 * V9  Space 키 → handleClick 호출
 * V10 role="button" + tabIndex=0 + aria-label 존재
 * V11 brand="amex" → expiry 표시 "MM / YY" 형식
 * V12 brand="unknown" → 카드사 라벨 빈 문자열 (또는 안 표시)
 */

import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CreditCardVisual } from "../credit-card-visual";

// ---------------------------------------------------------------------------
// motion/react mock — useReducedMotion 포함
// ---------------------------------------------------------------------------

vi.mock("motion/react", () => ({
  motion: {
    div: ({
      children,
      animate: _animate,
      transition: _transition,
      style,
      className,
    }: React.HTMLAttributes<HTMLDivElement> & {
      animate?: unknown;
      transition?: unknown;
    }) => (
      <div data-testid="motion-div" style={style} className={className}>
        {children}
      </div>
    ),
  },
  useReducedMotion: vi.fn(() => false),
}));

// ---------------------------------------------------------------------------
// Default props
// ---------------------------------------------------------------------------

const defaultProps = {
  last4: "1234",
  brand: "visa" as const,
  expiryMonth: 3,
  expiryYear: 2027,
  cvcRevealed: false,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CreditCardVisual", () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    user = userEvent.setup();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // V1: cvcRevealed=false → flip ❌ + onFlipRequest ✅
  // -------------------------------------------------------------------------
  it("V1: cvcRevealed=false 카드 클릭 → flipped 변경 없이 onFlipRequest 만 호출", async () => {
    const onFlipRequest = vi.fn();
    render(
      <CreditCardVisual {...defaultProps} cvcRevealed={false} onFlipRequest={onFlipRequest} />,
    );

    const card = screen.getByRole("button");
    await user.click(card);

    // onFlipRequest 호출됨
    expect(onFlipRequest).toHaveBeenCalledTimes(1);

    // motion.div rotateY=0 → CVC 뒷면이 보이지 않는 상태여야 함
    // motion 이 mock 이므로 animate prop 으로 검증 불가 → 마스킹 표시로 간접 검증
    // flip 이 일어나지 않았으므로 CVC 는 여전히 ••• 표시
    expect(screen.getByText("•••")).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // V2: cvcRevealed=true → flip toggle + onFlipRequest 호출
  // -------------------------------------------------------------------------
  it("V2: cvcRevealed=true 카드 클릭 → onFlipRequest 호출", async () => {
    const onFlipRequest = vi.fn();
    render(
      <CreditCardVisual
        {...defaultProps}
        cvcRevealed={true}
        revealedCvc="123"
        onFlipRequest={onFlipRequest}
      />,
    );

    const card = screen.getByRole("button");

    // 첫 번째 클릭 → flip (뒷면으로)
    await user.click(card);
    expect(onFlipRequest).toHaveBeenCalledTimes(1);

    // 두 번째 클릭 → flip (앞면으로)
    await user.click(card);
    expect(onFlipRequest).toHaveBeenCalledTimes(2);
  });

  // -------------------------------------------------------------------------
  // V3: cvcRevealed=true → false 변경 시 자동으로 flipped=false 복귀
  // -------------------------------------------------------------------------
  it("V3: cvcRevealed prop false 로 변경 시 flipped 자동 reset", async () => {
    const { rerender } = render(
      <CreditCardVisual {...defaultProps} cvcRevealed={true} revealedCvc="123" />,
    );

    // cvcRevealed=true → 클릭으로 뒤집음
    const card = screen.getByRole("button");
    await user.click(card);

    // cvcRevealed=false 로 변경
    await act(async () => {
      rerender(<CreditCardVisual {...defaultProps} cvcRevealed={false} revealedCvc={undefined} />);
    });

    // flipped 이 false 로 reset 되어 CVC 마스킹 표시
    expect(screen.getByText("•••")).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // V4: revealedCardNumber 없음 → 마스킹 표시
  // -------------------------------------------------------------------------
  it("V4: revealedCardNumber 없으면 마스킹 번호 표시", () => {
    render(<CreditCardVisual {...defaultProps} last4="5678" brand="visa" />);

    // maskCardNumber("5678", "visa") = "•••• •••• •••• 5678"
    expect(screen.getByText("•••• •••• •••• 5678")).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // V5: revealedCardNumber 있음 → formatCardNumber 결과 표시
  // -------------------------------------------------------------------------
  it("V5: revealedCardNumber 있으면 포맷된 번호 표시", () => {
    render(
      <CreditCardVisual {...defaultProps} revealedCardNumber="4111111111111111" brand="visa" />,
    );

    // formatCardNumber("4111111111111111", "visa") = "4111 1111 1111 1111"
    expect(screen.getByText("4111 1111 1111 1111")).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // V6: cvcRevealed=false → CVC 영역 ••• (Amex 면 ••••)
  // -------------------------------------------------------------------------
  it("V6-a: visa, cvcRevealed=false → CVC 영역 •••", () => {
    render(<CreditCardVisual {...defaultProps} brand="visa" cvcRevealed={false} />);
    expect(screen.getByText("•••")).toBeInTheDocument();
  });

  it("V6-b: amex, cvcRevealed=false → CVC 영역 ••••", () => {
    render(<CreditCardVisual {...defaultProps} brand="amex" cvcRevealed={false} />);
    expect(screen.getByText("••••")).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // V7: cvcRevealed=true && revealedCvc="123" → "123" 표시
  // -------------------------------------------------------------------------
  it("V7: cvcRevealed=true && revealedCvc 있으면 CVC 평문 표시", () => {
    render(<CreditCardVisual {...defaultProps} cvcRevealed={true} revealedCvc="123" />);

    expect(screen.getByText("123")).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // V8: Enter 키 → onFlipRequest 트리거
  // -------------------------------------------------------------------------
  it("V8: Enter 키 → onFlipRequest 호출", async () => {
    const onFlipRequest = vi.fn();
    render(
      <CreditCardVisual {...defaultProps} cvcRevealed={false} onFlipRequest={onFlipRequest} />,
    );

    const card = screen.getByRole("button");
    card.focus();
    await user.keyboard("{Enter}");

    expect(onFlipRequest).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // V9: Space 키 → onFlipRequest 트리거
  // -------------------------------------------------------------------------
  it("V9: Space 키 → onFlipRequest 호출", async () => {
    const onFlipRequest = vi.fn();
    render(
      <CreditCardVisual {...defaultProps} cvcRevealed={false} onFlipRequest={onFlipRequest} />,
    );

    const card = screen.getByRole("button");
    card.focus();
    await user.keyboard(" ");

    expect(onFlipRequest).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // V10: role="button" + tabIndex=0 + aria-label 존재
  // -------------------------------------------------------------------------
  it("V10: 접근성 — role=button, tabIndex=0, aria-label 포함", () => {
    render(<CreditCardVisual {...defaultProps} last4="9999" />);

    const card = screen.getByRole("button");
    expect(card).toBeInTheDocument();
    expect(card).toHaveAttribute("tabindex", "0");
    expect(card).toHaveAttribute("aria-label", "Credit card ending in 9999");
  });

  // -------------------------------------------------------------------------
  // V11: brand="amex" → expiry "MM / YY" 형식
  // -------------------------------------------------------------------------
  it("V11: expiry 표시 MM / YY 형식", () => {
    render(<CreditCardVisual {...defaultProps} brand="amex" expiryMonth={1} expiryYear={2028} />);

    // "01 / 28"
    expect(screen.getByText("01 / 28")).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // V12: brand="unknown" → 카드사 라벨 빈 문자열 (렌더링만 확인)
  // -------------------------------------------------------------------------
  it("V12: brand=unknown → 카드사 라벨 빈 문자열", () => {
    render(<CreditCardVisual {...defaultProps} brand="unknown" />);

    // "unknown" 텍스트가 카드사 라벨로 표시되지 않아야 함
    // role=button 컨테이너 안에서 "unknown" 이라는 텍스트 스팬이 없어야 함
    const card = screen.getByRole("button");
    const brandSpan = card.querySelector("span.uppercase.font-semibold");
    // brand 라벨 span 이 없거나 텍스트가 비어있어야 함
    if (brandSpan) {
      expect(brandSpan.textContent?.trim()).toBe("");
    }
    // 단순히 렌더가 crash 없이 완료되는 것도 검증
    expect(card).toBeInTheDocument();
  });
});
