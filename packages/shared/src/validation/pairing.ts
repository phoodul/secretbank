/**
 * @file validation/pairing.ts
 * @license AGPL-3.0-or-later
 *
 * Native Messaging 프로토콜 Zod schemas.
 * B-4: NMMessage discriminated union 을 X25519 페어링 메시지로 확장.
 *
 * types/pairing.ts 와 1:1 대응 — drift 발생 시 validation.test.ts 가 검출한다.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// 공통 — base64 32바이트 공개키 검증 헬퍼
// ---------------------------------------------------------------------------

/**
 * base64 인코딩된 32바이트 X25519 공개키 schema.
 * 표준 base64 (URL-safe 아닌 일반) 44자 = ceil(32/3)*4.
 * 빈 문자열 / undefined 는 거부.
 */
const pubKeyBase64Schema = z
  .string()
  .min(1)
  .regex(/^[A-Za-z0-9+/]+=*$/, "base64 공개키여야 합니다");

// ---------------------------------------------------------------------------
// Extension → nm-host 메시지
// ---------------------------------------------------------------------------

/**
 * `init` — Extension → nm-host: 초기 연결 + 페어링 키 교환 시작.
 * B-4: version 외에 extension_id + ext_pub(base64 X25519 공개키) 추가.
 */
export const NMMessageInitSchema = z.object({
  type: z.literal("init"),
  /** chrome.runtime.id (26자 알파뉴메릭) */
  extension_id: z.string().min(1),
  /** 확장 프로그램 버전 (semver 문자열) */
  version: z.string().min(1),
  /** Extension X25519 공개키 (base64, 32바이트) */
  ext_pub: pubKeyBase64Schema,
});

/**
 * `pair_request` — nm-host → desktop IPC: Extension 페어링 요청 중계.
 * B-6 IPC 핸들러에서 소비 — B-4 에서는 타입 정의만.
 */
export const NMMessagePairRequestSchema = z.object({
  type: z.literal("pair_request"),
  /** Extension 식별자 */
  extension_id: z.string().min(1),
  /** Extension X25519 공개키 (base64, 32바이트) */
  ext_pub: pubKeyBase64Schema,
});

/**
 * `pair_response` — desktop → nm-host: 사용자 승인/거부 결과.
 */
export const NMMessagePairResponseSchema = z.object({
  type: z.literal("pair_response"),
  /** true = 승인, false = 거부 */
  approved: z.boolean(),
  /** 데스크톱 X25519 공개키 (base64, 32바이트) — approved=true 시 존재 */
  desktop_pub: pubKeyBase64Schema.optional(),
  /** 거부 사유 (선택) */
  reason: z.string().optional(),
});

/**
 * `paired` — nm-host → Extension: 페어링 완료 응답.
 */
export const NMMessagePairedSchema = z.object({
  type: z.literal("paired"),
  /** 데스크톱 X25519 공개키 (base64, 32바이트) */
  desktop_pub: pubKeyBase64Schema,
  /** 데스크톱 디바이스 식별자 */
  device_id: z.string().min(1),
});

// ---------------------------------------------------------------------------
// 기존 메시지 (A2 호환 유지)
// ---------------------------------------------------------------------------

/**
 * `reveal` — Extension → Desktop: 시크릿 reveal 요청.
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
// A2 호환 — "pair" 타입 (코드 제출) — 기존 테스트 회귀 방지용
// ---------------------------------------------------------------------------

/**
 * `pair` — (레거시, A2 호환) Extension → Desktop: 페어링 코드 제출.
 * B-4 이후 pair_request/pair_response 로 분리되었으나 기존 schema 를 유지한다.
 */
export const NMMessagePairSchema = z.object({
  type: z.literal("pair"),
  /** 6자리 PIN 코드 */
  code: z.string().min(1),
});

// ---------------------------------------------------------------------------
// NMMessage discriminated union
// ---------------------------------------------------------------------------

/**
 * Native Messaging 메시지 discriminated union.
 * B-4: init/pair_request/pair_response/paired 추가.
 * 하위 호환: pair/reveal/save 유지.
 */
export const NMMessageSchema = z.discriminatedUnion("type", [
  NMMessageInitSchema,
  NMMessagePairRequestSchema,
  NMMessagePairResponseSchema,
  NMMessagePairedSchema,
  NMMessagePairSchema,
  NMMessageRevealSchema,
  NMMessageSaveSchema,
]);

// ---------------------------------------------------------------------------
// 추론 타입
// ---------------------------------------------------------------------------

export type NMMessageInitValidated = z.infer<typeof NMMessageInitSchema>;
export type NMMessagePairRequestValidated = z.infer<typeof NMMessagePairRequestSchema>;
export type NMMessagePairResponseValidated = z.infer<typeof NMMessagePairResponseSchema>;
export type NMMessagePairedValidated = z.infer<typeof NMMessagePairedSchema>;
export type NMMessagePairValidated = z.infer<typeof NMMessagePairSchema>;
export type NMMessageRevealValidated = z.infer<typeof NMMessageRevealSchema>;
export type NMMessageSaveValidated = z.infer<typeof NMMessageSaveSchema>;
export type NMMessageValidated = z.infer<typeof NMMessageSchema>;
