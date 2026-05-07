/**
 * CreditCardDetail — Phase 3-A-5 unit tests (D1–D7)
 *
 * 보안: 카드번호 평문을 console.log 하거나 스냅샷에 포함하지 않는다.
 *
 * 타이머 전략:
 *   - vi.useFakeTimers({ shouldAdvanceTime: false }) 는 @testing-library waitFor 내부
 *     setInterval 도 막으므로 사용 금지.
 *   - 대신 vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] }) 로
 *     setInterval 은 real 로 유지 → waitFor 정상 동작.
 *   - invoke promise 완료는 flushMicrotasks() 헬퍼로 처리.
 */

import { render, screen, act, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CreditCardDetail } from "../CreditCardDetail";
import type { CreditCardSummary } from "../CreditCardDetail";

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
// @tauri-apps/api/core mock
// ---------------------------------------------------------------------------

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

// ---------------------------------------------------------------------------
// sonner mock
// ---------------------------------------------------------------------------

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
const mockToastError = vi.mocked(toast.error);

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

const MOCK_CREDENTIAL: CreditCardSummary = {
  credential_id: "card-test-123",
  brand: "visa",
  expiry_month: 12,
  expiry_year: 2028,
  cardholder_name: "TEST USER",
  last_4: "1234",
};

const REVEALED_CARD_NUMBER = "4111111111111234";
const REVEALED_CVC = "321";

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function renderDetail(credential: CreditCardSummary = MOCK_CREDENTIAL) {
  return render(<CreditCardDetail credential={credential} />);
}

/**
 * Promise microtask 를 충분히 flush.
 * invoke 는 mock 이므로 즉시 resolve 되지만 React state update 까지
 * 여러 microtask queue 사이클이 필요하다.
 */
async function flushMicrotasks() {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
}

/**
 * 버튼 클릭 후 microtask 완전히 flush.
 * act() 로 감싸야 React 경고 없이 state update 반영됨.
 */
async function clickAndWait(btn: HTMLElement) {
  await act(async () => {
    fireEvent.click(btn);
    await flushMicrotasks();
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CreditCardDetail", () => {
  beforeEach(() => {
    // setTimeout / clearTimeout 만 fake — setInterval 은 real 유지 (waitFor 정상 동작)
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    mockInvoke.mockReset();
    vi.mocked(toast.success).mockReset();
    mockToastError.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // D1: reveal 버튼 클릭 → invoke("reveal_card_number") 호출 + 평문 표시
  it("D1: Reveal Card Number 클릭 → invoke 호출 + 평문 포맷 표시", async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "reveal_card_number") return Promise.resolve(REVEALED_CARD_NUMBER);
      return Promise.resolve(undefined);
    });

    renderDetail();

    // 초기: 마스킹 상태 (CreditCardVisual 앞면 + FieldRow 양쪽에 존재)
    const maskedInitial = screen.getAllByText("•••• •••• •••• 1234");
    expect(maskedInitial.length).toBeGreaterThan(0);

    const revealBtn = screen.getByRole("button", { name: /reveal card number/i });
    await clickAndWait(revealBtn);

    // invoke 호출 확인
    expect(mockInvoke).toHaveBeenCalledWith("reveal_card_number", {
      credentialId: "card-test-123",
    });

    // 평문 포맷 표시: formatCardNumber("4111111111111234", "visa") → "4111 1111 1111 1234"
    const revealedElements = screen.getAllByText("4111 1111 1111 1234");
    expect(revealedElements.length).toBeGreaterThan(0);
  });

  // D2: 30초 후 자동 클리어 (fake timer)
  it("D2: reveal 후 30초 경과 → 자동 마스킹 복귀", async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "reveal_card_number") return Promise.resolve(REVEALED_CARD_NUMBER);
      return Promise.resolve(undefined);
    });

    renderDetail();

    const revealBtn = screen.getByRole("button", { name: /reveal card number/i });
    await clickAndWait(revealBtn);

    // 평문 표시 확인
    const revealedElements = screen.getAllByText("4111 1111 1111 1234");
    expect(revealedElements.length).toBeGreaterThan(0);

    // 30초 타이머 진행 (setTimeout 이 fake 이므로 즉시 실행)
    // act() 는 내부 타이머 콜백 실행 + React state flush 를 모두 처리함
    act(() => {
      vi.runAllTimers();
    });

    // 마스킹 복귀: act() 완료 후 DOM 이 동기적으로 갱신됨
    const maskedBack = screen.getAllByText("•••• •••• •••• 1234");
    expect(maskedBack.length).toBeGreaterThan(0);
  });

  // D3: reveal 후 다시 클릭 → 즉시 클리어 (invoke는 1회만)
  it("D3: reveal 후 재클릭 → 즉시 클리어, invoke 추가 호출 없음", async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "reveal_card_number") return Promise.resolve(REVEALED_CARD_NUMBER);
      return Promise.resolve(undefined);
    });

    renderDetail();

    const revealBtn = screen.getByRole("button", { name: /reveal card number/i });

    // 첫 번째 클릭 → reveal
    await clickAndWait(revealBtn);

    const revealedElements = screen.getAllByText("4111 1111 1111 1234");
    expect(revealedElements.length).toBeGreaterThan(0);
    expect(mockInvoke).toHaveBeenCalledTimes(1);

    // 두 번째 클릭 → 즉시 클리어 (toggle, invoke 없음)
    const hideBtn = screen.getByRole("button", { name: /hide card number/i });
    await clickAndWait(hideBtn);

    const maskedBack = screen.getAllByText("•••• •••• •••• 1234");
    expect(maskedBack.length).toBeGreaterThan(0);

    // invoke 추가 호출 없음
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });

  // D4: unmount 시 clearTimeout (메모리 누수 방지)
  it("D4: unmount 시 카드번호 reveal 타이머 정리됨", async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "reveal_card_number") return Promise.resolve(REVEALED_CARD_NUMBER);
      return Promise.resolve(undefined);
    });

    const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");

    const { unmount } = renderDetail();

    const revealBtn = screen.getByRole("button", { name: /reveal card number/i });
    await clickAndWait(revealBtn);

    // reveal 완료 후 타이머가 걸린 상태
    const revealedElements = screen.getAllByText("4111 1111 1111 1234");
    expect(revealedElements.length).toBeGreaterThan(0);

    // clearTimeout 호출 횟수 초기화 (기존 호출 제외)
    clearTimeoutSpy.mockClear();

    // unmount → useEffect cleanup → cardNumTimer 에 대한 clearTimeout 호출
    unmount();

    expect(clearTimeoutSpy).toHaveBeenCalled();
    clearTimeoutSpy.mockRestore();
  });

  // D5: invoke 실패 → toast.error 표시
  it("D5: invoke 실패 → toast.error 호출", async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "reveal_card_number") return Promise.reject(new Error("Vault locked"));
      return Promise.resolve(undefined);
    });

    renderDetail();

    const revealBtn = screen.getByRole("button", { name: /reveal card number/i });
    await clickAndWait(revealBtn);

    expect(mockToastError).toHaveBeenCalledWith("Failed to reveal card number");

    // 마스킹 상태 유지
    const maskedElements = screen.getAllByText("•••• •••• •••• 1234");
    expect(maskedElements.length).toBeGreaterThan(0);
  });

  // D6: CVC reveal 시 CreditCardVisual 에 cvcRevealed=true prop 전달
  it("D6: CVC reveal 후 카드 비주얼이 CVC 표시 (cvcRevealed=true 반영)", async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "reveal_cvc") return Promise.resolve(REVEALED_CVC);
      return Promise.resolve(undefined);
    });

    renderDetail();

    const revealCvcBtn = screen.getByRole("button", { name: /reveal cvc/i });
    await clickAndWait(revealCvcBtn);

    expect(mockInvoke).toHaveBeenCalledWith("reveal_cvc", {
      credentialId: "card-test-123",
    });

    // cvcRevealed=true 반영:
    // - CreditCardVisual 뒷면 cvcDisplay = REVEALED_CVC ("321")
    // - FieldRow CVC 값 = REVEALED_CVC ("321")
    // 두 곳 모두에 "321" 이 나타남
    const cvcElements = screen.getAllByText(REVEALED_CVC);
    expect(cvcElements.length).toBeGreaterThan(0);
  });

  // D7: reveal 안 된 상태 → maskCardNumber 결과 표시
  it("D7: reveal 없는 초기 상태 → 마스킹 표시 (•••• •••• •••• 1234)", () => {
    renderDetail();

    // maskCardNumber("1234", "visa") = "•••• •••• •••• 1234"
    // CreditCardVisual 앞면 + FieldRow 양쪽에 동일 텍스트 → getAllByText 사용
    const maskedElements = screen.getAllByText("•••• •••• •••• 1234");
    expect(maskedElements.length).toBeGreaterThan(0);

    // Reveal Card Number 버튼 존재
    expect(screen.getByRole("button", { name: /reveal card number/i })).toBeInTheDocument();

    // invoke 미호출
    expect(mockInvoke).not.toHaveBeenCalled();
  });
});
