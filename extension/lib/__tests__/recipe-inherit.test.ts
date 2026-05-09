/**
 * @file recipe-inherit.test.ts
 * @license AGPL-3.0-or-later
 *
 * T-24-E-E2: extractRecipeFromInput / mergeRecipes / resolveRecipeForDomain 단위 테스트.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  extractRecipeFromInput,
  mergeRecipes,
  resolveRecipeForDomain,
  DEFAULT_RECIPE,
  type IssuerRecipePartial,
} from "../recipe-inherit.js";
import type { IssuerRecipe } from "@secretbank/shared";
import type { NMClient } from "../nm-client.js";

// ---------------------------------------------------------------------------
// 헬퍼 — HTMLInputElement mock 생성
// ---------------------------------------------------------------------------

function makeInput(attrs: {
  pattern?: string;
  minLength?: number;
  maxLength?: number;
}): HTMLInputElement {
  const el = document.createElement("input");
  el.type = "password";
  if (attrs.pattern !== undefined) el.pattern = attrs.pattern;
  if (attrs.minLength !== undefined) el.minLength = attrs.minLength;
  if (attrs.maxLength !== undefined) el.maxLength = attrs.maxLength;
  return el;
}

function makeRecipe(overrides: Partial<IssuerRecipe> = {}): IssuerRecipe {
  return { ...DEFAULT_RECIPE, ...overrides };
}

// ---------------------------------------------------------------------------
// extractRecipeFromInput
// ---------------------------------------------------------------------------

describe("extractRecipeFromInput", () => {
  // RI-T1: minlength / maxlength 추출
  it("RI-T1: minLength / maxLength 를 추출한다", () => {
    const input = makeInput({ minLength: 8, maxLength: 32 });
    const partial = extractRecipeFromInput(input);
    expect(partial.min).toBe(8);
    expect(partial.max).toBe(32);
  });

  // RI-T2: minlength 없으면 min = undefined
  it("RI-T2: minLength 없으면 min = undefined", () => {
    const input = makeInput({ maxLength: 64 });
    const partial = extractRecipeFromInput(input);
    expect(partial.min).toBeUndefined();
    expect(partial.max).toBe(64);
  });

  // RI-T3: maxLength = -1 (제한 없음) 이면 max = undefined
  it("RI-T3: maxLength = -1 (브라우저 기본값) 이면 max = undefined", () => {
    const input = makeInput({ minLength: 6 });
    // maxLength 설정 안 하면 브라우저 기본값 = -1
    const partial = extractRecipeFromInput(input);
    expect(partial.max).toBeUndefined();
  });

  // RI-T4: 단순 `[a-zA-Z0-9]{8,32}` pattern 파싱
  it("RI-T4: [a-zA-Z0-9]{8,32} 패턴 파싱", () => {
    const input = makeInput({ pattern: "[a-zA-Z0-9]{8,32}" });
    const partial = extractRecipeFromInput(input);
    expect(partial.min).toBe(8);
    expect(partial.max).toBe(32);
    expect(partial.uppercase).toBe(1);
    expect(partial.number).toBe(1);
  });

  // RI-T5: `[a-z]{6,20}` — 대문자/숫자 없음
  it("RI-T5: [a-z]{6,20} — uppercase=0, number=0", () => {
    const input = makeInput({ pattern: "[a-z]{6,20}" });
    const partial = extractRecipeFromInput(input);
    expect(partial.min).toBe(6);
    expect(partial.max).toBe(20);
    expect(partial.uppercase).toBe(0);
    expect(partial.number).toBe(0);
  });

  // RI-T6: 복잡한 패턴 → null (skip)
  it("RI-T6: 복잡한 패턴 (lookahead) → 필드 undefined", () => {
    const input = makeInput({ pattern: "(?=.*[A-Z]).{8,32}" });
    const partial = extractRecipeFromInput(input);
    // 복잡한 패턴은 파싱 포기 → 필드 모두 undefined
    expect(partial.min).toBeUndefined();
    expect(partial.max).toBeUndefined();
    expect(partial.uppercase).toBeUndefined();
  });

  // RI-T7: 속성 없는 input → 모두 undefined
  it("RI-T7: 속성 없는 input → 모두 undefined", () => {
    const input = makeInput({});
    const partial = extractRecipeFromInput(input);
    expect(partial.min).toBeUndefined();
    expect(partial.max).toBeUndefined();
    expect(partial.uppercase).toBeUndefined();
    expect(partial.number).toBeUndefined();
  });

  // RI-T8: `{n}` (단일 길이 quantifier)
  it("RI-T8: [A-Z]{16} → min=max=16", () => {
    const input = makeInput({ pattern: "[A-Z]{16}" });
    const partial = extractRecipeFromInput(input);
    expect(partial.min).toBe(16);
    expect(partial.max).toBe(16);
    expect(partial.uppercase).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// mergeRecipes
// ---------------------------------------------------------------------------

describe("mergeRecipes", () => {
  const preset = makeRecipe({ min: 12, max: 64 });
  const heuristic: IssuerRecipePartial = { min: 8, max: 32, uppercase: 0 };
  const userOverride = makeRecipe({ min: 20, max: 48 });

  // RM-T1: preset 이 있으면 그대로 반환
  it("RM-T1: preset 이 있으면 heuristic/user 무시", () => {
    const result = mergeRecipes(preset, heuristic, userOverride);
    expect(result).toEqual(preset);
  });

  // RM-T2: preset 없음 + user 있음 → user 가 heuristic 보다 우선
  it("RM-T2: preset 없고 user 있으면 user 우선 (heuristic 으로 보완)", () => {
    const result = mergeRecipes(undefined, heuristic, userOverride);
    // heuristic.min=8 이 user.min=20 보다 우선 (partial 에 명시됨)
    expect(result.min).toBe(8);
    // heuristic.uppercase=0 이 user.uppercase=1 보다 우선
    expect(result.uppercase).toBe(0);
    // heuristic 에 number 없음 → user.number 사용
    expect(result.number).toBe(userOverride.number);
  });

  // RM-T3: preset / user 없음 → heuristic + default
  it("RM-T3: preset/user 없으면 heuristic + default 병합", () => {
    const result = mergeRecipes(undefined, { min: 10 }, undefined);
    expect(result.min).toBe(10);
    expect(result.max).toBe(DEFAULT_RECIPE.max);
    expect(result.uppercase).toBe(DEFAULT_RECIPE.uppercase);
  });

  // RM-T4: 모두 없음 → default 그대로
  it("RM-T4: heuristic 도 비어 있으면 default 반환", () => {
    const result = mergeRecipes(undefined, {}, undefined);
    expect(result).toEqual(DEFAULT_RECIPE);
  });
});

// ---------------------------------------------------------------------------
// resolveRecipeForDomain (mock NMClient)
// ---------------------------------------------------------------------------

describe("resolveRecipeForDomain", () => {
  let nm: NMClient;

  beforeEach(() => {
    nm = {
      getRecipeForDomain: vi.fn(),
      upsertRecipeForDomain: vi.fn(),
    } as unknown as NMClient;
  });

  const SESSION = "mock-session-token";

  // RD-T1: nm-host 에서 preset 레시피 반환 → source = preset
  it("RD-T1: nm-host preset → source = preset", async () => {
    const presetRecipe = makeRecipe({ min: 12, max: 64 });
    vi.mocked(nm.getRecipeForDomain).mockResolvedValue({
      type: "get_recipe_for_domain_response",
      domain: "github.com",
      found: true,
      recipe: presetRecipe,
      source: "preset",
    });

    const input = makeInput({});
    const result = await resolveRecipeForDomain("github.com", input, nm, SESSION);

    expect(result.source).toBe("preset");
    expect(result.recipe).toEqual(presetRecipe);
  });

  // RD-T2: nm-host 에서 user 레시피 반환 → source = user
  it("RD-T2: nm-host user → source = user", async () => {
    const userRecipe = makeRecipe({ min: 20, max: 48 });
    vi.mocked(nm.getRecipeForDomain).mockResolvedValue({
      type: "get_recipe_for_domain_response",
      domain: "stripe.com",
      found: true,
      recipe: userRecipe,
      source: "user",
    });

    const input = makeInput({ minLength: 8, maxLength: 32 });
    const result = await resolveRecipeForDomain("stripe.com", input, nm, SESSION);

    // user 레시피가 있어도 heuristic 으로 보완 (min=8 이 user.min=20 보다 우선)
    expect(result.source).toBe("user");
    expect(result.recipe.min).toBe(8);
  });

  // RD-T3: nm-host 에서 found=false → heuristic 적용
  it("RD-T3: nm-host found=false → heuristic 적용", async () => {
    vi.mocked(nm.getRecipeForDomain).mockResolvedValue({
      type: "get_recipe_for_domain_response",
      domain: "unknown.com",
      found: false,
    });

    const input = makeInput({ minLength: 6, maxLength: 24 });
    const result = await resolveRecipeForDomain("unknown.com", input, nm, SESSION);

    expect(result.source).toBe("heuristic");
    expect(result.recipe.min).toBe(6);
    expect(result.recipe.max).toBe(24);
  });

  // RD-T4: nm-host 에러 → default fallback (silent)
  it("RD-T4: nm-host 에러 → default fallback", async () => {
    vi.mocked(nm.getRecipeForDomain).mockRejectedValue(new Error("connection error"));

    const input = makeInput({});
    const result = await resolveRecipeForDomain("broken.com", input, nm, SESSION);

    expect(result.source).toBe("default");
    expect(result.recipe).toEqual(DEFAULT_RECIPE);
  });

  // RD-T5: nm-host 에서 preset 반환 시 heuristic 무시
  it("RD-T5: preset 있으면 input heuristic 무시", async () => {
    const presetRecipe = makeRecipe({ min: 12, max: 64 });
    vi.mocked(nm.getRecipeForDomain).mockResolvedValue({
      type: "get_recipe_for_domain_response",
      domain: "preset.example.com",
      found: true,
      recipe: presetRecipe,
      source: "preset",
    });

    // input 에 다른 값이 있어도 preset 우선
    const input = makeInput({ minLength: 4, maxLength: 8 });
    const result = await resolveRecipeForDomain("preset.example.com", input, nm, SESSION);

    expect(result.source).toBe("preset");
    expect(result.recipe.min).toBe(12); // preset 값
  });

  // RD-T6: nm=undefined → heuristic 전용 동작 (domain=undefined case)
  it("RD-T6: input 만 있고 nm 없으면 heuristic 적용", async () => {
    vi.mocked(nm.getRecipeForDomain).mockResolvedValue({
      type: "get_recipe_for_domain_response",
      domain: "heuristic-only.com",
      found: false,
    });

    const input = makeInput({ minLength: 10, maxLength: 50 });
    const result = await resolveRecipeForDomain("heuristic-only.com", input, nm, SESSION);

    expect(result.source).toBe("heuristic");
    expect(result.recipe.min).toBe(10);
    expect(result.recipe.max).toBe(50);
  });
});
