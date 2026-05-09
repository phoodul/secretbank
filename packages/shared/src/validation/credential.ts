/**
 * @file validation/credential.ts
 * @license AGPL-3.0-or-later
 *
 * Credential Zod schemas — A2 `CredentialKind` 와 1:1 대응.
 * `z.infer<typeof XxxSchema>` 가 A2 타입과 호환된다.
 *
 * Rust CredentialKind (serde rename_all = "snake_case"):
 *   ApiKey    → "api_key"
 *   Password  → "password"
 *   CreditCard → "credit_card"
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// CredentialKind 리터럴 enum
// ---------------------------------------------------------------------------

/** Rust `CredentialKind` 와 동일한 3개 variant. */
export const CredentialKindSchema = z.enum(["api_key", "password", "credit_card"]);

// ---------------------------------------------------------------------------
// kind 별 metadata — discriminated union
// ---------------------------------------------------------------------------

/**
 * ApiKey metadata.
 * value 는 별도 vault 에 저장되므로 여기에 포함하지 않는다.
 */
export const ApiKeyMetaSchema = z.object({
  kind: z.literal("api_key"),
  /** 표시 이름 (예: "Stripe secret key") */
  name: z.string().min(1).max(256),
  /** 발급사 ID (선택) */
  issuer_id: z.string().max(128).optional(),
});

/**
 * Password metadata.
 * M24 Phase 2-2B 일반 비밀번호 vault 용.
 */
export const PasswordMetaSchema = z.object({
  kind: z.literal("password"),
  /** 표시 이름 */
  name: z.string().min(1).max(256),
  /** 로그인 URL (선택) */
  url: z.string().url().optional(),
  /** 사용자 이름 / 이메일 (선택) */
  username: z.string().max(256).optional(),
});

/**
 * CreditCard metadata.
 * M24 Phase 3-A 결제 카드 vault 용.
 * 카드번호·CVC·만료·소유자 모두 포함 (vault 암호화 대상).
 */
export const CreditCardMetaSchema = z.object({
  kind: z.literal("credit_card"),
  /** 표시 이름 (예: "Shinhan Visa") */
  name: z.string().min(1).max(256),
  /**
   * 카드번호 — 공백/하이픈 제거 후 13~19자리 숫자.
   * Luhn 검사는 런타임에서 선택적으로 수행.
   */
  card_number: z.string().regex(/^\d{13,19}$/, "카드번호는 13~19자리 숫자여야 합니다"),
  /**
   * CVC / CVV — 3~4자리 숫자.
   */
  cvc: z.string().regex(/^\d{3,4}$/, "CVC는 3~4자리 숫자여야 합니다"),
  /**
   * 만료 월 — MM 형식 (01~12).
   */
  expiry_month: z.string().regex(/^(0[1-9]|1[0-2])$/, "만료 월은 01~12여야 합니다"),
  /**
   * 만료 연 — YY 또는 YYYY 형식.
   */
  expiry_year: z.string().regex(/^\d{2}(\d{2})?$/, "만료 연도는 YY 또는 YYYY여야 합니다"),
  /** 카드 소유자 이름 (선택) */
  holder: z.string().max(128).optional(),
});

/**
 * Credential metadata discriminated union.
 * `kind` 필드로 분기.
 */
export const CredentialMetaSchema = z.discriminatedUnion("kind", [
  ApiKeyMetaSchema,
  PasswordMetaSchema,
  CreditCardMetaSchema,
]);

// ---------------------------------------------------------------------------
// 추론 타입 (A2 타입과 호환)
// ---------------------------------------------------------------------------

export type CredentialKindInferred = z.infer<typeof CredentialKindSchema>;
export type ApiKeyMeta = z.infer<typeof ApiKeyMetaSchema>;
export type PasswordMeta = z.infer<typeof PasswordMetaSchema>;
export type CreditCardMeta = z.infer<typeof CreditCardMetaSchema>;
export type CredentialMeta = z.infer<typeof CredentialMetaSchema>;
