/**
 * @file pairing.ts
 * @license AGPL-3.0-or-later
 *
 * Extension ↔ Desktop 페어링 및 Native Messaging 관련 타입 (placeholder).
 * 실제 구현은 Phase A3~A5 에서 진행.
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
// Native Messaging 프로토콜 — Discriminated Union (placeholder)
// ---------------------------------------------------------------------------

/** Extension → Desktop: 초기 연결 요청 */
export interface NMMessageInit {
  type: "init";
  version: string;
}

/** Extension → Desktop: 페어링 코드 제출 */
export interface NMMessagePair {
  type: "pair";
  code: string;
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

/**
 * Native Messaging 메시지 discriminated union.
 * 실제 NM 통신 구현은 Phase A3 에서 진행.
 */
export type NMMessage = NMMessageInit | NMMessagePair | NMMessageReveal | NMMessageSave;
