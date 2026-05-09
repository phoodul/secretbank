/**
 * @file pairing.ts
 * @license AGPL-3.0-or-later
 *
 * Extension ↔ Desktop 페어링 및 Native Messaging 관련 타입.
 * B-4: X25519 ECDH + XChaCha20-Poly1305 페어링 프로토콜 메시지 union 확장.
 */

// ---------------------------------------------------------------------------
// 페어링 상태 머신
// ---------------------------------------------------------------------------

/**
 * Extension 과 Desktop 앱 간 페어링 상태.
 *
 * - `Idle`: 페어링 없음 (초기 상태)
 * - `Pairing`: QR 코드 표시 / 코드 입력 대기 중
 * - `Paired`: 페어링 완료, 세션 토큰 유효
 * - `Failed`: 페어링 실패 또는 세션 만료
 */
export type PairingState = "Idle" | "Pairing" | "Paired" | "Failed";

// ---------------------------------------------------------------------------
// 세션 토큰
// ---------------------------------------------------------------------------

/**
 * 페어링 성공 후 발급되는 세션 토큰.
 *
 * - `token`: HMAC-SHA256 기반 불투명 토큰 (base64url)
 * - `expires_at`: Unix timestamp (ms)
 */
export interface SessionToken {
  token: string;
  expires_at: number;
}

// ---------------------------------------------------------------------------
// Native Messaging 프로토콜 — Discriminated Union (B-4 확장)
// ---------------------------------------------------------------------------

/**
 * Extension → nm-host: 초기 연결 요청.
 *
 * ext_pub: Extension 측 X25519 공개키 (base64 인코딩, 32바이트).
 * extension_id: chrome.runtime.id 로 식별되는 확장 프로그램 ID.
 */
export interface NMMessageInit {
  type: "init";
  extension_id: string;
  version: string;
  ext_pub: string;
}

/**
 * nm-host → desktop IPC: Extension 의 페어링 요청을 데스크톱 앱에 중계.
 * B-6 에서 IPC 핸들러가 구현된다 — B-4 에서는 타입만 정의.
 */
export interface NMMessagePairRequest {
  type: "pair_request";
  extension_id: string;
  ext_pub: string;
}

/**
 * desktop → nm-host: 사용자가 페어링 승인/거부한 결과.
 *
 * approved=true 시 desktop_pub(base64) 포함.
 * approved=false 시 reason(선택) 포함.
 */
export interface NMMessagePairResponse {
  type: "pair_response";
  approved: boolean;
  desktop_pub?: string;
  reason?: string;
}

/**
 * nm-host → Extension: 페어링 완료 응답.
 *
 * desktop_pub: 데스크톱 X25519 공개키 (base64, 32바이트).
 * device_id: 데스크톱 디바이스 식별자.
 */
export interface NMMessagePaired {
  type: "paired";
  desktop_pub: string;
  device_id: string;
}

/** Extension → Desktop: 시크릿 reveal 요청 */
export interface NMMessageReveal {
  type: "reveal";
  credential_id: string;
  session_token: string;
}

/** Extension → Desktop: 새 시크릿 저장 요청 */
export interface NMMessageSave {
  type: "save";
  kind: import("./credential.js").CredentialKind;
  issuer_id: string;
  name: string;
  value: string;
  session_token: string;
}

// 하위 호환 — A2 의 "pair" 타입 (코드 제출 메시지)은 pair_response 로 통합.
// 기존 테스트가 "pair" type 을 직접 참조하는 경우를 위해 재-export 하지 않는다.

/**
 * Native Messaging 메시지 discriminated union.
 * B-4: X25519 페어링 메시지(init/pair_request/pair_response/paired) 추가.
 */
export type NMMessage =
  | NMMessageInit
  | NMMessagePairRequest
  | NMMessagePairResponse
  | NMMessagePaired
  | NMMessageReveal
  | NMMessageSave;

// ---------------------------------------------------------------------------
// 하위 호환 별칭 (A2 명명 유지 — 외부 consumer 가 직접 import 중)
// ---------------------------------------------------------------------------

/** @deprecated B-4 에서 NMMessageInit 로 통합 (extension_id + ext_pub 추가). */
export type NMMessagePair = NMMessagePairRequest;
