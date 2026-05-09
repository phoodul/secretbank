/**
 * @file recipe.ts
 * @license AGPL-3.0-or-later
 *
 * IssuerRecipe 기반 무작위 비밀번호 생성기.
 *
 * 보안 원칙:
 *   - CSPRNG 전용: `crypto.getRandomValues` 사용. `Math.random` 절대 사용 금지.
 *   - 생성 방법: 직접 구성(direct assembly) + 섞기(shuffle)
 *     1. 필수 문자(대문자·숫자·특수문자) 요구 개수를 우선 채운다.
 *     2. 나머지 길이를 허용된 문자 풀에서 무작위로 채운다.
 *     3. Fisher-Yates shuffle 로 최종 위치를 섞는다.
 *     이 방식은 generate-and-check(무한 루프 위험) 없이 정책을 100% 만족한다.
 */

import type { IssuerRecipe } from "../types/recipe.js";

/** 비밀번호 생성에 사용하는 문자 집합 */
const CHAR_SETS = {
  lowercase: "abcdefghijklmnopqrstuvwxyz",
  uppercase: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  number: "0123456789",
  special: "!@#$%^&*()-_=+[]{}|;:,.<>?",
} as const;

/**
 * CSPRNG 로 안전한 랜덤 정수를 생성한다 (편향 제거 포함).
 *
 * @param max - 반환값의 상한 (배타적). max <= 2^32 이어야 한다.
 * @returns [0, max) 범위의 정수
 */
function secureRandomInt(max: number): number {
  if (max <= 0) throw new RangeError("max 는 양수이어야 합니다");
  // 편향 제거(rejection sampling)
  const limit = Math.floor(0x1_0000_0000 / max) * max;
  const buf = new Uint32Array(1);
  let n: number;
  do {
    crypto.getRandomValues(buf);
    n = buf[0] ?? 0;
  } while (n >= limit);
  return n % max;
}

/**
 * 주어진 문자 풀에서 CSPRNG 로 문자 하나를 선택한다.
 *
 * @param pool - 선택 대상 문자 풀 문자열
 * @returns 풀에서 무작위로 선택된 문자
 */
function pickChar(pool: string): string {
  if (pool.length === 0) throw new Error("문자 풀이 비어 있습니다");
  const char = pool[secureRandomInt(pool.length)];
  if (char === undefined) throw new Error("pool 인덱스 오류");
  return char;
}

/**
 * Fisher-Yates shuffle 을 CSPRNG 로 수행한다 (in-place).
 *
 * @param arr - 섞을 배열 (원본을 수정한다)
 */
function shuffleInPlace(arr: string[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = secureRandomInt(i + 1);
    // TypeScript 구조 분해를 사용하지 않고 명시적으로 교환 (noUncheckedIndexedAccess 대응)
    const tmp = arr[i];
    const other = arr[j];
    if (tmp === undefined || other === undefined) continue;
    arr[i] = other;
    arr[j] = tmp;
  }
}

/**
 * forbidden 문자열에 포함되지 않은 문자만 남긴다.
 *
 * @param pool     - 원본 문자 풀
 * @param forbidden - 제거할 문자 목록
 * @returns forbidden 을 제거한 문자 풀
 */
function removeForbidden(pool: string, forbidden: string): string {
  if (!forbidden) return pool;
  return pool
    .split("")
    .filter((c) => !forbidden.includes(c))
    .join("");
}

/**
 * IssuerRecipe 정책을 만족하는 무작위 비밀번호를 생성한다.
 *
 * @param recipe - 발급사 비밀번호 규칙
 * @returns 정책을 만족하는 무작위 비밀번호 문자열
 *
 * @throws {Error} recipe 정책이 수행 불가능한 경우 (예: min > max, 필수 수 합계 > max)
 *
 * @example
 * generateFromRecipe({ min: 12, max: 20, uppercase: 1, number: 1, special: 1, forbidden: "" })
 * // "aB3$xyzQwerty" 형태의 무작위 문자열
 */
export function generateFromRecipe(recipe: IssuerRecipe): string {
  const { min, max, uppercase, number, special, forbidden } = recipe;

  // 정책 유효성 검사
  if (min < 1) throw new RangeError("min 은 1 이상이어야 합니다");
  if (max < min) throw new RangeError("max 는 min 이상이어야 합니다");
  if (uppercase < 0 || number < 0 || special < 0) {
    throw new RangeError("uppercase/number/special 은 0 이상이어야 합니다");
  }

  const requiredTotal = uppercase + number + special;
  if (requiredTotal > max) {
    throw new RangeError(`필수 문자 합계(${requiredTotal})가 max(${max})를 초과합니다`);
  }

  // 실제 생성 길이: [min, max] 범위에서 무작위 선택
  const length = min + (max > min ? secureRandomInt(max - min + 1) : 0);

  // forbidden 을 제거한 각 문자 풀 구성
  const poolLower = removeForbidden(CHAR_SETS.lowercase, forbidden);
  const poolUpper = removeForbidden(CHAR_SETS.uppercase, forbidden);
  const poolNum = removeForbidden(CHAR_SETS.number, forbidden);
  const poolSpecial = removeForbidden(CHAR_SETS.special, forbidden);

  // 유효성: 각 필수 문자 풀이 비어 있지 않은지 확인
  if (uppercase > 0 && poolUpper.length === 0) {
    throw new Error("대문자 풀이 forbidden 으로 인해 비어 있습니다");
  }
  if (number > 0 && poolNum.length === 0) {
    throw new Error("숫자 풀이 forbidden 으로 인해 비어 있습니다");
  }
  if (special > 0 && poolSpecial.length === 0) {
    throw new Error("특수문자 풀이 forbidden 으로 인해 비어 있습니다");
  }

  // 나머지 길이를 채울 "전체 허용 풀" 구성
  // 최소한 lowercase 는 포함되어야 하므로, 비어 있으면 uppercase 로 대체
  const poolAll =
    [poolLower, poolUpper, poolNum, poolSpecial].filter((p) => p.length > 0).join("") ||
    CHAR_SETS.uppercase; // 최후 방어

  // Step 1: 필수 문자를 먼저 채운다
  const chars: string[] = [];

  for (let i = 0; i < uppercase; i++) chars.push(pickChar(poolUpper));
  for (let i = 0; i < number; i++) chars.push(pickChar(poolNum));
  for (let i = 0; i < special; i++) chars.push(pickChar(poolSpecial));

  // Step 2: 나머지 길이를 전체 풀에서 채운다
  const remaining = length - requiredTotal;
  for (let i = 0; i < remaining; i++) chars.push(pickChar(poolAll));

  // Step 3: Fisher-Yates shuffle 로 위치를 섞는다
  shuffleInPlace(chars);

  return chars.join("");
}
