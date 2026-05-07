import { describe, expect, it } from "vitest";
import { detectBrand, formatCardNumber, getBrandGradient, maskCardNumber } from "../card-utils";

// ---------------------------------------------------------------------------
// detectBrand
// ---------------------------------------------------------------------------

describe("detectBrand", () => {
  // --- Visa ---
  it("D1: Visa 16자리 → visa", () => {
    expect(detectBrand("4111111111111111")).toBe("visa");
  });

  // --- Mastercard ---
  it("D2: Mastercard 51-55 range → mastercard", () => {
    expect(detectBrand("5500005555555559")).toBe("mastercard");
  });

  it("D3: Mastercard 2221-2720 range → mastercard", () => {
    expect(detectBrand("2221001234567890")).toBe("mastercard");
  });

  // --- Amex ---
  it("D4: Amex 37 prefix, 15자리 → amex", () => {
    expect(detectBrand("378282246310005")).toBe("amex");
  });

  it("D5: Amex 34 prefix → amex", () => {
    expect(detectBrand("371449635398431")).toBe("amex");
  });

  // --- Discover ---
  it("D6: Discover 6011 → discover", () => {
    expect(detectBrand("6011111111111117")).toBe("discover");
  });

  it("D7: Discover 622126-622925 range → discover", () => {
    expect(detectBrand("6221260000000000")).toBe("discover");
  });

  // --- JCB ---
  it("D8: JCB 3528-3589 range → jcb", () => {
    expect(detectBrand("3530111333300000")).toBe("jcb");
  });

  // --- Diners ---
  it("D9: Diners 36 prefix → diners", () => {
    expect(detectBrand("36006666333344")).toBe("diners");
  });

  it("D10: Diners 300 prefix → diners", () => {
    expect(detectBrand("30000000000004")).toBe("diners");
  });

  // --- Unknown / Edge ---
  it("D11: 9 로 시작하는 번호 → unknown", () => {
    expect(detectBrand("9999999999999999")).toBe("unknown");
  });

  it("D12: 빈 문자열 → unknown", () => {
    expect(detectBrand("")).toBe("unknown");
  });

  it("D13: 비숫자 입력 → unknown (fuzz-safe, throw 없음)", () => {
    expect(detectBrand("abc")).toBe("unknown");
  });

  it("D14: 하이픈 포함 Visa 번호 → visa (하이픈 무시)", () => {
    expect(detectBrand("4111-1111-1111-1111")).toBe("visa");
  });
});

// ---------------------------------------------------------------------------
// formatCardNumber
// ---------------------------------------------------------------------------

describe("formatCardNumber", () => {
  it("F1: Visa 16자리 → 4-4-4-4 포맷", () => {
    expect(formatCardNumber("4111111111111111", "visa")).toBe("4111 1111 1111 1111");
  });

  it("F2: Amex 15자리 → 4-6-5 포맷", () => {
    expect(formatCardNumber("378282246310005", "amex")).toBe("3782 822463 10005");
  });

  it("F3: 짧은 입력 (3자) → 그대로 반환 (안전 처리)", () => {
    expect(formatCardNumber("123", "visa")).toBe("123");
  });

  it("F4: Amex 8자 → 부분 포맷 (4-4)", () => {
    expect(formatCardNumber("12345678", "amex")).toBe("1234 5678");
  });

  it("F5: 하이픈 포함 Visa 번호 → 4-4-4-4 포맷 (하이픈 정규화)", () => {
    expect(formatCardNumber("4111-1111-1111-1111", "visa")).toBe("4111 1111 1111 1111");
  });
});

// ---------------------------------------------------------------------------
// maskCardNumber
// ---------------------------------------------------------------------------

describe("maskCardNumber", () => {
  it("M1: Visa last4 → •••• •••• •••• 1234", () => {
    expect(maskCardNumber("1234", "visa")).toBe("•••• •••• •••• 1234");
  });

  it("M2: Amex last4 → •••• •••••• •5678", () => {
    expect(maskCardNumber("5678", "amex")).toBe("•••• •••••• •5678");
  });

  it("M3: 2자 입력 → padding 후 •••• •••• •••• ••12", () => {
    expect(maskCardNumber("12", "visa")).toBe("•••• •••• •••• ••12");
  });
});

// ---------------------------------------------------------------------------
// getBrandGradient
// ---------------------------------------------------------------------------

describe("getBrandGradient", () => {
  it("G1: visa → oklch 형식 from/to 반환", () => {
    const gradient = getBrandGradient("visa");
    expect(gradient.from).toMatch(/^oklch\(/);
    expect(gradient.to).toMatch(/^oklch\(/);
  });

  it("G2: unknown → unknown 그레이디언트 반환 (oklch 형식)", () => {
    const gradient = getBrandGradient("unknown");
    expect(gradient.from).toMatch(/^oklch\(/);
    expect(gradient.to).toMatch(/^oklch\(/);
  });

  it("G3: 모든 브랜드에 대해 from/to 모두 oklch 형식", () => {
    const brands = ["visa", "mastercard", "amex", "discover", "jcb", "diners", "unknown"] as const;
    for (const brand of brands) {
      const g = getBrandGradient(brand);
      expect(g.from, `${brand}.from`).toMatch(/^oklch\(/);
      expect(g.to, `${brand}.to`).toMatch(/^oklch\(/);
    }
  });
});
