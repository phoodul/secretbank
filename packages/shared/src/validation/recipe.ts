/**
 * @file validation/recipe.ts
 * @license AGPL-3.0-or-later
 *
 * IssuerRecipe Zod schema — A2 `IssuerRecipe` interface 와 1:1 대응.
 * `z.infer<typeof IssuerRecipeSchema>` === IssuerRecipe.
 */

import { z } from "zod";

/**
 * 발급사(Issuer) 별 비밀번호 구성 규칙 schema.
 *
 * 제약:
 * - `min` ≤ `max` 는 `.refine()` 으로 검증
 * - `uppercase`, `number`, `special` ≥ 0
 * - `forbidden` 은 문자열 (빈 문자열 허용)
 */
export const IssuerRecipeSchema = z
  .object({
    /** 허용 최소 길이 (1 이상) */
    min: z.number().int().min(1),
    /** 허용 최대 길이 (min 이상 — refine 으로 검증) */
    max: z.number().int().min(1),
    /** 대문자 최소 포함 개수 */
    uppercase: z.number().int().min(0),
    /** 숫자 최소 포함 개수 */
    number: z.number().int().min(0),
    /** 특수문자 최소 포함 개수 */
    special: z.number().int().min(0),
    /** 사용 불가 문자 목록 (예: " '`\") */
    forbidden: z.string(),
  })
  .refine((data) => data.min <= data.max, {
    message: "min 은 max 보다 클 수 없습니다",
    path: ["max"],
  });

/** `z.infer` 추론 타입 — A2 `IssuerRecipe` 와 동일 구조. */
export type IssuerRecipeValidated = z.infer<typeof IssuerRecipeSchema>;
