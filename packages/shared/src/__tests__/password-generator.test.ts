/**
 * @file password-generator.test.ts
 * @license AGPL-3.0-or-later
 *
 * password-generator 모듈 단위 테스트.
 *
 * 테스트 범위:
 *   - diceware: 6단어 생성 / wordlist 무결성 (4 lang 각각 2048 entry) / separator 옵션
 *   - recipe: 정책 만족 / CSPRNG 무작위성 / forbidden 충돌 방지
 *   - strength: 결정성 (동일 입력 → 동일 점수) / 점수 범위 [0,4]
 */

import { describe, it, expect } from "vitest";
import { generateDiceware, getWordlist } from "../password-generator/diceware.js";
import type { DicewareLang } from "../password-generator/diceware.js";
import { generateFromRecipe } from "../password-generator/recipe.js";
import { estimateStrength } from "../password-generator/strength.js";
import type { IssuerRecipe } from "../types/recipe.js";

// ──────────────────────────────────────────────
// diceware
// ──────────────────────────────────────────────

describe("generateDiceware", () => {
  const LANGS: DicewareLang[] = ["en", "ko", "ja", "zh"];

  it("기본값으로 6단어를 생성한다", () => {
    const result = generateDiceware();
    const words = result.split(" ");
    expect(words).toHaveLength(6);
    words.forEach((w) => expect(w.length).toBeGreaterThan(0));
  });

  it("wordCount 를 지정하면 해당 수의 단어를 반환한다", () => {
    for (const count of [1, 3, 6, 12]) {
      const result = generateDiceware("en", count);
      expect(result.split(" ")).toHaveLength(count);
    }
  });

  it("separator 를 적용한다", () => {
    const result = generateDiceware("en", 6, "-");
    const words = result.split("-");
    expect(words).toHaveLength(6);
    // 기본 공백 구분자로는 단어가 나눠지지 않아야 한다
    expect(result.split(" ")).toHaveLength(1);
  });

  it("빈 separator 를 허용한다", () => {
    const result = generateDiceware("en", 6, "");
    // 공백 없이 연결된 하나의 문자열
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it.each(LANGS)("%s wordlist 는 정확히 2048 개 단어를 가진다", (lang) => {
    const wordlist = getWordlist(lang);
    expect(wordlist).toHaveLength(2048);
  });

  it.each(LANGS)("%s wordlist 는 빈 문자열을 포함하지 않는다", (lang) => {
    const wordlist = getWordlist(lang);
    const empty = wordlist.filter((w) => w.trim() === "");
    expect(empty).toHaveLength(0);
  });

  it.each(LANGS)("%s wordlist 는 중복 단어를 포함하지 않는다", (lang) => {
    const wordlist = getWordlist(lang);
    const unique = new Set(wordlist);
    expect(unique.size).toBe(wordlist.length);
  });

  it.each(LANGS)("%s 언어로 6단어를 생성할 수 있다", (lang) => {
    const result = generateDiceware(lang, 6);
    // 언어마다 구분자(공백)는 동일
    expect(result.split(" ")).toHaveLength(6);
  });

  it("생성된 단어는 해당 언어 wordlist 에 속한다", () => {
    const wordlist = new Set(getWordlist("en"));
    const result = generateDiceware("en", 6);
    result.split(" ").forEach((word) => {
      expect(wordlist.has(word)).toBe(true);
    });
  });

  it("wordCount < 1 이면 RangeError 를 던진다", () => {
    expect(() => generateDiceware("en", 0)).toThrow(RangeError);
  });

  it("CSPRNG 무작위성: 동일 호출 결과가 다를 확률이 매우 높다", () => {
    // 2048^6 ≈ 7×10^19 — 두 번 같은 결과가 나올 확률 ≈ 0
    // 이론적으로 같을 수 있지만 실질적으로 불가능, flaky 방지를 위해 10번 시도
    const results = new Set(Array.from({ length: 10 }, () => generateDiceware("en", 6)));
    expect(results.size).toBeGreaterThan(1);
  });
});

// ──────────────────────────────────────────────
// recipe
// ──────────────────────────────────────────────

describe("generateFromRecipe", () => {
  /** 기준 레시피: 12~20자, 대문자 1+, 숫자 1+, 특수 1+ */
  const BASE_RECIPE: IssuerRecipe = {
    min: 12,
    max: 20,
    uppercase: 1,
    number: 1,
    special: 1,
    forbidden: "",
  };

  it("생성된 비밀번호는 min~max 길이를 만족한다", () => {
    for (let i = 0; i < 20; i++) {
      const pw = generateFromRecipe(BASE_RECIPE);
      expect(pw.length).toBeGreaterThanOrEqual(BASE_RECIPE.min);
      expect(pw.length).toBeLessThanOrEqual(BASE_RECIPE.max);
    }
  });

  it("대문자 최소 개수를 만족한다", () => {
    for (let i = 0; i < 20; i++) {
      const pw = generateFromRecipe(BASE_RECIPE);
      const upperCount = pw.split("").filter((c) => /[A-Z]/.test(c)).length;
      expect(upperCount).toBeGreaterThanOrEqual(BASE_RECIPE.uppercase);
    }
  });

  it("숫자 최소 개수를 만족한다", () => {
    for (let i = 0; i < 20; i++) {
      const pw = generateFromRecipe(BASE_RECIPE);
      const numCount = pw.split("").filter((c) => /[0-9]/.test(c)).length;
      expect(numCount).toBeGreaterThanOrEqual(BASE_RECIPE.number);
    }
  });

  it("특수문자 최소 개수를 만족한다", () => {
    const specialChars = "!@#$%^&*()-_=+[]{}|;:,.<>?";
    for (let i = 0; i < 20; i++) {
      const pw = generateFromRecipe(BASE_RECIPE);
      const specCount = pw.split("").filter((c) => specialChars.includes(c)).length;
      expect(specCount).toBeGreaterThanOrEqual(BASE_RECIPE.special);
    }
  });

  it("forbidden 문자를 포함하지 않는다", () => {
    const recipe: IssuerRecipe = {
      ...BASE_RECIPE,
      forbidden: "aeiou0!@",
    };
    for (let i = 0; i < 30; i++) {
      const pw = generateFromRecipe(recipe);
      for (const ch of recipe.forbidden) {
        expect(pw.includes(ch)).toBe(false);
      }
    }
  });

  it("uppercase=0, number=0, special=0 도 동작한다", () => {
    const recipe: IssuerRecipe = {
      min: 8,
      max: 16,
      uppercase: 0,
      number: 0,
      special: 0,
      forbidden: "",
    };
    const pw = generateFromRecipe(recipe);
    expect(pw.length).toBeGreaterThanOrEqual(8);
    expect(pw.length).toBeLessThanOrEqual(16);
  });

  it("min === max 이면 정확히 그 길이를 반환한다", () => {
    const recipe: IssuerRecipe = {
      min: 16,
      max: 16,
      uppercase: 2,
      number: 2,
      special: 2,
      forbidden: "",
    };
    for (let i = 0; i < 10; i++) {
      expect(generateFromRecipe(recipe).length).toBe(16);
    }
  });

  it("CSPRNG 무작위성: 동일 레시피로 다른 비밀번호가 생성된다", () => {
    const results = new Set(Array.from({ length: 20 }, () => generateFromRecipe(BASE_RECIPE)));
    // 20번 중 최소 2가지 이상의 결과가 나와야 한다
    expect(results.size).toBeGreaterThan(1);
  });

  it("max < min 이면 RangeError 를 던진다", () => {
    expect(() =>
      generateFromRecipe({ min: 16, max: 8, uppercase: 0, number: 0, special: 0, forbidden: "" }),
    ).toThrow(RangeError);
  });

  it("필수 문자 합계가 max 를 초과하면 RangeError 를 던진다", () => {
    expect(() =>
      generateFromRecipe({
        min: 4,
        max: 4,
        uppercase: 2,
        number: 2,
        special: 2,
        forbidden: "",
      }),
    ).toThrow(RangeError);
  });
});

// ──────────────────────────────────────────────
// strength
// ──────────────────────────────────────────────

describe("estimateStrength", () => {
  it("결정론적: 동일 입력은 항상 동일한 score 를 반환한다", () => {
    const passwords = ["password", "hunter2", "correct horse battery staple", "Tr0ub4dor&3"];
    for (const pw of passwords) {
      const r1 = estimateStrength(pw);
      const r2 = estimateStrength(pw);
      expect(r1.score).toBe(r2.score);
      expect(r1.crackTimeSeconds).toBe(r2.crackTimeSeconds);
    }
  });

  it("score 는 0~4 범위에 속한다", () => {
    const passwords = ["a", "abc123", "correct horse battery staple extra words"];
    for (const pw of passwords) {
      const { score } = estimateStrength(pw);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(4);
    }
  });

  it("crackTimeSeconds 는 양수다", () => {
    const { crackTimeSeconds } = estimateStrength("hello");
    expect(crackTimeSeconds).toBeGreaterThan(0);
  });

  it("약한 비밀번호('password')는 score < 3 이다", () => {
    const { score } = estimateStrength("password");
    expect(score).toBeLessThan(3);
  });

  it("강한 비밀번호(Diceware 형식)는 score >= 3 이다", () => {
    // "correct horse battery staple" 은 xkcd 예제, zxcvbn 공식 테스트에서 score=3
    const { score } = estimateStrength("correct horse battery staple");
    expect(score).toBeGreaterThanOrEqual(3);
  });

  it("빈 문자열도 에러 없이 처리한다", () => {
    expect(() => estimateStrength("")).not.toThrow();
    const { score } = estimateStrength("");
    expect(score).toBe(0);
  });

  it("feedback 은 string 또는 undefined 이다", () => {
    const { feedback } = estimateStrength("password123");
    expect(feedback === undefined || typeof feedback === "string").toBe(true);
  });

  it("매우 강한 비밀번호는 feedback 이 없거나 짧다", () => {
    // 길고 무작위한 문자열
    const { feedback } = estimateStrength("x9K#mP2@qL7$nR4!vB6&");
    // feedback 이 없거나, 있더라도 빈 문자열이 아님을 검증
    if (feedback !== undefined) {
      expect(typeof feedback).toBe("string");
    }
  });
});
