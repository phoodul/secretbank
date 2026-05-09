/**
 * @file recipe.ts
 * @license AGPL-3.0-or-later
 *
 * Issuer 별 비밀번호 생성 레시피 타입.
 * Extension 의 비밀번호 자동 생성(A4~A5) 및 데스크톱 generator 에서 공통 사용.
 */

/**
 * 발급사(Issuer) 별 비밀번호 구성 규칙.
 *
 * - `min` / `max`: 허용 길이 범위
 * - `uppercase`: 대문자 최소 개수
 * - `number`: 숫자 최소 개수
 * - `special`: 특수문자 최소 개수
 * - `forbidden`: 사용 불가 문자 목록 (예: " ' ` \ )
 */
export interface IssuerRecipe {
  min: number;
  max: number;
  uppercase: number;
  number: number;
  special: number;
  forbidden: string;
}
