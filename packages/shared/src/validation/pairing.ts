/**
 * @file validation/pairing.ts
 * @license AGPL-3.0-or-later
 *
 * Native Messaging 프로토콜 Zod schemas (placeholder).
 * A2 `NMMessage` discriminated union 과 1:1 대응.
 *
 * Phase B 에서 실제 암호화 프로토콜 확정 시 이 파일을 갱신한다.
 * 현재는 타입 안전성 확보용 placeholder 수준.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Extension → Desktop 메시지
// ---------------------------------------------------------------------------

/**
 * `init` — Extension → Desktop: 초기 연결 요청.
 * A2: NMMessageInit { type: "init"; version: string }
 */
export const NMMessageInitSchema = z.object({
  type: z.literal("init"),
  /** 확장 프로그램 버전 (semver 문자열) */
  version: z.string().min(1),
});

/**
 * `pair` — Extension → Desktop: 페어링 코드 제출.
 * A2: NMMessagePair { type: "pair"; code: string }
 */
export const NMMessagePairSchema = z.object({
  type: z.literal("pair"),
  /** 6자리 PIN 코드 (Phase B 에서 구체화) */
  code: z.string().min(1),
});

/**
 * `reveal` — Extension → Desktop: 시크릿 reveal 요청.
 * A2: NMMessageReveal { type: "reveal"; credential_id: string; session_token: string }
 */
export const NMMessageRevealSchema = z.object({
  type: z.literal("reveal"),
  /** 요청할 credential UUID */
  credential_id: z.string().min(1),
  /** 페어링 성공 후 발급된 세션 토큰 */
  session_token: z.string().min(1),
});

/**
 * `save` — Extension → Desktop: 새 시크릿 저장 요청.
 * A2: NMMessageSave { type: "save"; kind; issuer_id; name; value; session_token }
 */
export const NMMessageSaveSchema = z.object({
  type: z.literal("save"),
  /** Credential 종류 */
  kind: z.enum(["api_key", "password", "credit_card"]),
  /** 발급사 ID */
  issuer_id: z.string().min(1),
  /** 표시 이름 */
  name: z.string().min(1).max(256),
  /** 암호화되기 전 plaintext value (transit 구간만) */
  value: z.string().min(1),
  /** 세션 토큰 */
  session_token: z.string().min(1),
});

// ---------------------------------------------------------------------------
// NMMessage discriminated union
// ---------------------------------------------------------------------------

/**
 * Native Messaging 메시지 discriminated union.
 * `type` 필드로 분기. A2 `NMMessage` 와 동일 4가지 variant.
 */
export const NMMessageSchema = z.discriminatedUnion("type", [
  NMMessageInitSchema,
  NMMessagePairSchema,
  NMMessageRevealSchema,
  NMMessageSaveSchema,
]);

// ---------------------------------------------------------------------------
// 추론 타입 (A2 타입과 호환)
// ---------------------------------------------------------------------------

export type NMMessageInitValidated = z.infer<typeof NMMessageInitSchema>;
export type NMMessagePairValidated = z.infer<typeof NMMessagePairSchema>;
export type NMMessageRevealValidated = z.infer<typeof NMMessageRevealSchema>;
export type NMMessageSaveValidated = z.infer<typeof NMMessageSaveSchema>;
export type NMMessageValidated = z.infer<typeof NMMessageSchema>;
