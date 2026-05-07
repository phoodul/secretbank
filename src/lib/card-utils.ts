/**
 * card-utils.ts — Phase 3-A-2
 *
 * BIN 감지 / 카드사별 oklch 그레이디언트 / 번호 포맷팅 / 마스킹.
 *
 * 보안 규칙 (B.5-5):
 *  - detectBrand 는 내부적으로 prefix 6자 (slice(0,6)) 만 사용.
 *  - 카드번호 전체를 console.log 하거나 외부 전송 금지.
 *  - 모든 함수는 throw 없이 safe 처리 (fuzz-safe).
 *
 * 스타일 규칙 (F.2-1):
 *  - 색상은 oklch() 함수 표기만 사용. hex 하드코딩 ❌.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Payment card brand.
 * Rust `CardBrand` enum (`serde rename_all = "lowercase"`) 과 1:1 정합.
 * variant: visa | mastercard | amex | discover | jcb | diners | unknown
 */
export type CardBrand = "visa" | "mastercard" | "amex" | "discover" | "jcb" | "diners" | "unknown";

// ---------------------------------------------------------------------------
// BIN detection
// ---------------------------------------------------------------------------

/**
 * BIN prefix 6자로 카드 브랜드 감지.
 *
 * B.5-5: prefix 6자만 사용. 전체 번호를 받아도 내부에서 slice(0, 6) 만 참조.
 *
 * IIN Ranges (Wikipedia "Payment card number" 기준, 사양과 일치 확인):
 *  - Visa:       4 (첫 자리)
 *  - Mastercard: 51–55 또는 2221–2720
 *  - Amex:       34 또는 37
 *  - Discover:   6011, 622126–622925 (UnionPay 협력), 64–65
 *  - JCB:        3528–3589
 *  - Diners:     36, 38, 300–305
 *
 * @param cardNumber raw 카드번호 (공백/하이픈 포함 가능. 내부에서 제거 후 처리).
 * @returns CardBrand — 비숫자 입력 또는 매칭 없음 시 "unknown" (절대 throw ❌).
 */
export function detectBrand(cardNumber: string): CardBrand {
  // 공백·하이픈 제거
  const num = cardNumber.replace(/[\s-]/g, "");
  if (num.length < 1) return "unknown";

  // B.5-5: prefix 6자만 — 짧은 입력 대비 "0" 패딩 후 파싱
  const prefix6 = num.slice(0, 6).padEnd(6, "0");

  const p1 = parseInt(num.charAt(0), 10);
  const p2 = parseInt(num.slice(0, 2), 10);
  const p3 = parseInt(num.slice(0, 3), 10);
  const p4 = parseInt(num.slice(0, 4), 10);
  const p6 = parseInt(prefix6, 10);

  // NaN 비교는 항상 false → 비숫자 입력 자동으로 "unknown" 반환 (fuzz-safe).

  // Visa: 4
  if (p1 === 4) return "visa";

  // Mastercard: 51-55 또는 2221-2720
  if (p2 >= 51 && p2 <= 55) return "mastercard";
  if (p4 >= 2221 && p4 <= 2720) return "mastercard";

  // Amex: 34, 37
  if (p2 === 34 || p2 === 37) return "amex";

  // Discover: 6011, 622126-622925, 64-65
  if (p4 === 6011) return "discover";
  if (p6 >= 622126 && p6 <= 622925) return "discover";
  if (p2 === 64 || p2 === 65) return "discover";

  // JCB: 3528-3589
  if (p4 >= 3528 && p4 <= 3589) return "jcb";

  // Diners: 36, 38, 300-305
  if (p2 === 36 || p2 === 38) return "diners";
  if (p3 >= 300 && p3 <= 305) return "diners";

  return "unknown";
}

// ---------------------------------------------------------------------------
// Brand gradient tokens
// ---------------------------------------------------------------------------

/**
 * 카드사별 oklch 그레이디언트 토큰.
 * F.2-1: hex 하드코딩 ❌, oklch() 함수 표기만 사용.
 */
const BRAND_GRADIENTS: Record<CardBrand, { from: string; to: string }> = {
  visa: { from: "oklch(0.35 0.12 270)", to: "oklch(0.55 0.18 250)" },
  mastercard: { from: "oklch(0.45 0.22 25)", to: "oklch(0.35 0.18 350)" },
  amex: { from: "oklch(0.45 0.15 160)", to: "oklch(0.35 0.12 180)" },
  discover: { from: "oklch(0.55 0.18 60)", to: "oklch(0.45 0.22 45)" },
  jcb: { from: "oklch(0.40 0.18 250)", to: "oklch(0.35 0.15 150)" },
  diners: { from: "oklch(0.45 0.08 220)", to: "oklch(0.35 0.05 220)" },
  unknown: { from: "oklch(0.40 0.02 0)", to: "oklch(0.30 0.02 0)" },
};

/**
 * 카드사별 oklch 그레이디언트 from/to 토큰 반환.
 *
 * @param brand CardBrand
 * @returns `{ from: string; to: string }` — oklch() CSS 함수 문자열
 */
export function getBrandGradient(brand: CardBrand): { from: string; to: string } {
  return BRAND_GRADIENTS[brand];
}

// ---------------------------------------------------------------------------
// Format
// ---------------------------------------------------------------------------

/**
 * 원시 숫자 문자열 → 그룹핑 포맷 (공백 구분).
 *
 * - Amex (15자리): 4-6-5 → "3782 822463 10005"
 * - 기타 (16자리): 4-4-4-4 → "4111 1111 1111 1111"
 *
 * 짧은 입력 (입력 중 상태) 도 안전 처리 — 가능한 만큼만 포맷 (절대 throw ❌).
 *
 * @param raw 원시 카드번호 (공백·하이픈 포함 가능)
 * @param brand CardBrand
 * @returns 포맷된 문자열
 */
export function formatCardNumber(raw: string, brand: CardBrand): string {
  const digits = raw.replace(/\D/g, "");

  if (brand === "amex") {
    // 4-6-5 그룹핑 (최대 15자리)
    const a = digits.slice(0, 4);
    const b = digits.slice(4, 10);
    const c = digits.slice(10, 15);
    return [a, b, c].filter((s) => s.length > 0).join(" ");
  }

  // 4-4-4-4 그룹핑 (최대 16자리)
  const groups: string[] = [];
  for (let i = 0; i < digits.length && i < 16; i += 4) {
    groups.push(digits.slice(i, i + 4));
  }
  return groups.join(" ");
}

// ---------------------------------------------------------------------------
// Mask
// ---------------------------------------------------------------------------

/**
 * 마스킹 표시 — 마지막 4자만 노출.
 *
 * - Amex:  "•••• •••••• •1234" (5자 그룹 앞 1자 마스킹 + last4 표시)
 * - 기타:  "•••• •••• •••• 1234"
 *
 * 4자 미만 입력은 앞쪽에 "•" 패딩 (예: "12" → "••12").
 *
 * @param last4 마지막 4자 (또는 그보다 짧을 경우 padding 적용)
 * @param brand CardBrand
 * @returns 마스킹된 표시 문자열
 */
export function maskCardNumber(last4: string, brand: CardBrand): string {
  // 4자 미만 입력 대비: 앞쪽 "•" 패딩 후 뒤에서 4자 취득
  const safeLast4 = last4.padStart(4, "•").slice(-4);

  if (brand === "amex") {
    // "•••• •••••• •" + last4 (5자 그룹의 첫 1자 마스킹)
    return `•••• •••••• •${safeLast4}`;
  }

  // "•••• •••• •••• " + last4
  return `•••• •••• •••• ${safeLast4}`;
}
