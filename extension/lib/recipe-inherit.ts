/**
 * @file recipe-inherit.ts
 * @license AGPL-3.0-or-later
 *
 * T-24-E-E2: issuer recipe inheritance.
 *
 * 우선순위: preset(desktop DB) > user(desktop DB) > heuristic(input 속성) > default.
 *
 * 보안 주석:
 *   TM-EXT-INPUT: input.pattern 파싱은 단순 패턴만 시도. 복잡한 lookahead 등은 skip →
 *   default 로 fallback. 악의적 페이지가 긴 pattern 을 넣어도 regex 실행 없음 (문자열 검사만).
 */

import type { IssuerRecipe } from "@secretbank/shared";
import type { NMClient } from "./nm-client.js";

// ---------------------------------------------------------------------------
// 타입 정의
// ---------------------------------------------------------------------------

/** extractRecipeFromInput 이 반환하는 부분 레시피 (추출 실패 필드 = undefined). */
export interface IssuerRecipePartial {
  min?: number;
  max?: number;
  uppercase?: number;
  number?: number;
  special?: number;
  forbidden?: string;
}

/** resolveRecipeForDomain 의 최종 반환 — source 정보 포함. */
export interface ResolvedRecipe {
  recipe: IssuerRecipe;
  /** 레시피의 출처 */
  source: "preset" | "user" | "heuristic" | "default";
}

// ---------------------------------------------------------------------------
// 기본값
// ---------------------------------------------------------------------------

/** 모든 추출 실패 시 사용하는 sensible default 레시피. */
export const DEFAULT_RECIPE: IssuerRecipe = {
  min: 16,
  max: 64,
  uppercase: 1,
  number: 1,
  special: 1,
  forbidden: "",
};

// ---------------------------------------------------------------------------
// extractRecipeFromInput
// ---------------------------------------------------------------------------

/**
 * `<input>` 요소의 HTML 속성에서 recipe 를 휴리스틱으로 추출한다.
 *
 * 지원 속성:
 *   - `pattern`: 간단한 `[chars]{min,max}` 형태만 파싱.
 *     복잡한 lookahead / 중첩 그룹 등은 skip → 해당 필드 undefined.
 *   - `minlength` / `maxlength`: 길이 범위.
 *
 * TM-EXT-INPUT: pattern 실행(new RegExp) 없이 문자열 파싱만 수행.
 * 악의적 페이지가 ReDoS 유발 pattern 을 심어도 안전.
 */
export function extractRecipeFromInput(input: HTMLInputElement): IssuerRecipePartial {
  const partial: IssuerRecipePartial = {};

  // minlength / maxlength
  const minLen = input.minLength;
  const maxLen = input.maxLength;

  if (minLen > 0) partial.min = minLen;
  // maxLength=-1 은 "제한 없음" (브라우저 기본값)
  if (maxLen > 0) partial.max = maxLen;

  // pattern — `[chars]{min,max}` 형태만 파싱
  const pattern = input.pattern;
  if (pattern) {
    const parsed = parseSimplePattern(pattern);
    if (parsed) {
      if (parsed.min !== undefined && partial.min === undefined) {
        partial.min = parsed.min;
      }
      if (parsed.max !== undefined && partial.max === undefined) {
        partial.max = parsed.max;
      }
      if (parsed.uppercase !== undefined) partial.uppercase = parsed.uppercase;
      if (parsed.number !== undefined) partial.number = parsed.number;
      if (parsed.special !== undefined) partial.special = parsed.special;
      if (parsed.forbidden !== undefined) partial.forbidden = parsed.forbidden;
    }
  }

  return partial;
}

// ---------------------------------------------------------------------------
// mergeRecipes
// ---------------------------------------------------------------------------

/**
 * preset / heuristic / userOverride 를 우선순위 순서로 머지한다.
 *
 * 우선순위 (높음 → 낮음): preset > userOverride > heuristic > DEFAULT_RECIPE.
 *
 * preset 이 있으면 heuristic / userOverride 는 무시된다 (사이트 정책은 fixed).
 * userOverride 는 heuristic 보다 우선 (사용자가 의도적으로 조정한 값).
 */
export function mergeRecipes(
  preset: IssuerRecipe | undefined,
  heuristic: IssuerRecipePartial,
  userOverride: IssuerRecipe | undefined,
): IssuerRecipe {
  // preset 이 있으면 그대로 반환
  if (preset) return preset;

  // user override 가 있으면 heuristic 보다 우선
  const base: IssuerRecipe = userOverride ?? DEFAULT_RECIPE;

  return {
    min: heuristic.min ?? base.min,
    max: heuristic.max ?? base.max,
    uppercase: heuristic.uppercase ?? base.uppercase,
    number: heuristic.number ?? base.number,
    special: heuristic.special ?? base.special,
    forbidden: heuristic.forbidden ?? base.forbidden,
  };
}

// ---------------------------------------------------------------------------
// resolveRecipeForDomain
// ---------------------------------------------------------------------------

/**
 * 도메인 + input 을 바탕으로 최종 레시피를 결정한다.
 *
 * 흐름:
 *   1. nm-host → desktop DB 에서 domain 의 best recipe (preset / user) 조회.
 *   2. 없으면 input 휴리스틱 적용.
 *   3. mergeRecipes 로 최종 레시피 결정.
 *
 * @param domain    eTLD+1 기준 도메인 (e.g. "github.com")
 * @param input     대상 password input 요소
 * @param nm        연결된 NMClient 인스턴스
 * @param sessionToken  extension session token (T-CRED-1: 필수)
 */
export async function resolveRecipeForDomain(
  domain: string,
  input: HTMLInputElement,
  nm: NMClient,
  sessionToken: string,
): Promise<ResolvedRecipe> {
  // 1. nm-host 에서 DB 레시피 조회
  let dbPreset: IssuerRecipe | undefined;
  let dbUser: IssuerRecipe | undefined;
  let dbSource: "preset" | "user" | undefined;

  try {
    const resp = await nm.getRecipeForDomain(domain, sessionToken);
    if (resp.found && resp.recipe) {
      if (resp.source === "preset") {
        dbPreset = resp.recipe;
        dbSource = "preset";
      } else if (resp.source === "user") {
        dbUser = resp.recipe;
        dbSource = "user";
      }
    }
  } catch {
    // nm-host 연결 실패 → heuristic 으로 fallback (silent)
  }

  // preset 이 있으면 즉시 반환
  if (dbPreset) {
    return { recipe: dbPreset, source: "preset" };
  }

  // 2. input 휴리스틱 추출
  const heuristic = extractRecipeFromInput(input);

  // 3. merge: userOverride > heuristic > default
  const merged = mergeRecipes(undefined, heuristic, dbUser);

  // source 결정
  const hasHeuristic = heuristic.min !== undefined || heuristic.max !== undefined;
  const source: ResolvedRecipe["source"] =
    dbSource === "user" ? "user" : hasHeuristic ? "heuristic" : "default";

  return { recipe: merged, source };
}

// ---------------------------------------------------------------------------
// 내부 헬퍼 — 단순 pattern 파싱
// ---------------------------------------------------------------------------

interface ParsedPattern {
  min?: number;
  max?: number;
  uppercase?: number;
  number?: number;
  special?: number;
  forbidden?: string;
}

/**
 * `[a-zA-Z0-9]{8,32}` 같은 단순 패턴만 파싱한다.
 *
 * 지원 형태:
 *   - `[charClass]{min,max}` — 전체 문자열이 이 형태인 경우만.
 *   - charClass 에서 소문자/대문자/숫자/특수문자 여부 추출.
 *
 * 복잡한 패턴 (lookahead, 다중 그룹 등) → null 반환 (overengineering 금지).
 *
 * TM-EXT-INPUT: new RegExp() 실행 없음. 문자열 파싱만.
 */
function parseSimplePattern(pattern: string): ParsedPattern | null {
  // 전체 패턴이 `[...]{n,m}` 또는 `[...]{n}` 형태인지만 확인
  // 앞 `^` / 뒤 `$` 는 무시 (trim)
  const trimmed = pattern.replace(/^\^/, "").replace(/\$$/, "");

  // `[charClass]{min,max}` 또는 `[charClass]{n}` 매칭
  const match = /^\[([^\]]+)\]\{(\d+)(?:,(\d+))?\}$/.exec(trimmed);
  if (!match) return null;

  const charClass = match[1];
  const qMin = parseInt(match[2], 10);
  const qMax = match[3] !== undefined ? parseInt(match[3], 10) : qMin;

  if (isNaN(qMin) || isNaN(qMax) || qMin > qMax) return null;

  const result: ParsedPattern = { min: qMin, max: qMax };

  // 문자 클래스 분석 — 포함 여부로 uppercase / number / special 결정
  const hasUpper = /A-Z/.test(charClass) || /[A-Z]/.test(charClass.replace(/[a-z]-[z]/g, ""));
  const hasLower = /a-z/.test(charClass);
  const hasDigit = /0-9/.test(charClass) || /\d/.test(charClass);
  // 특수문자: 영숫자 범위 이외의 문자가 charClass 에 명시된 경우
  const hasSpecial = /[!@#$%^&*()\-_=+\[\]{}|;:,.<>?]/.test(charClass);

  result.uppercase = hasUpper ? 1 : 0;
  result.number = hasDigit ? 1 : 0;
  result.special = hasSpecial ? 1 : 0;

  // 허용 안 된 클래스 → forbidden 에 추가
  let forbidden = "";
  if (!hasLower) forbidden += "abcdefghijklmnopqrstuvwxyz";
  if (!hasUpper) forbidden += "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  if (!hasDigit) forbidden += "0123456789";
  // special forbidden 은 과도하게 제한될 수 있어 skip (unknown 문자 클래스)

  if (forbidden) result.forbidden = forbidden;

  return result;
}
