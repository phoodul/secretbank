/**
 * @file nm-errors.ts
 * @license AGPL-3.0-or-later
 *
 * Native Messaging 클라이언트 에러 타입.
 *
 * i18n 연동: 에러 메시지는 i18n 키 문자열로 노출하여 B-5 PairingDialog 가
 * t(error.i18nKey) 로 사용자 문자열을 렌더링할 수 있게 한다.
 */

// ---------------------------------------------------------------------------
// NM 에러 기반 클래스
// ---------------------------------------------------------------------------

/** Native Messaging 에러 기반 클래스 */
export abstract class NMError extends Error {
  /** i18n 키 — B-5 PairingDialog 가 번역 문자열을 가져올 때 사용 */
  abstract readonly i18nKey: string;
}

// ---------------------------------------------------------------------------
// NMNotInstalled
// ---------------------------------------------------------------------------

/**
 * nm-host 가 OS 에 등록되지 않아 연결이 불가한 경우.
 *
 * Chrome 은 "Specified native messaging host not found." 메시지로 이를 알린다.
 * 이 메시지 검출 시 NMNotInstalled 를 throw 한다.
 */
export class NMNotInstalled extends NMError {
  readonly i18nKey = "nm_error_not_installed";

  constructor() {
    super("nm-host 가 설치되지 않았습니다. Secretbank 데스크톱 앱을 먼저 설치해 주세요.");
    this.name = "NMNotInstalled";
  }
}

// ---------------------------------------------------------------------------
// NMDisconnected
// ---------------------------------------------------------------------------

/**
 * Port 가 정상적으로 또는 예상치 못하게 끊어진 경우.
 *
 * reconnect 재시도 소진 후 영구 실패로 전환될 때 발생한다.
 */
export class NMDisconnected extends NMError {
  readonly i18nKey = "nm_error_disconnected";

  constructor(message = "Native Messaging 연결이 끊어졌습니다.") {
    super(message);
    this.name = "NMDisconnected";
  }
}

// ---------------------------------------------------------------------------
// NMProtocolError
// ---------------------------------------------------------------------------

/**
 * 수신된 메시지의 형식이 NMMessage union 스키마와 일치하지 않는 경우.
 */
export class NMProtocolError extends NMError {
  readonly i18nKey = "nm_error_protocol";

  constructor(message = "Native Messaging 프로토콜 오류가 발생했습니다.") {
    super(message);
    this.name = "NMProtocolError";
  }
}

// ---------------------------------------------------------------------------
// NMTimeout
// ---------------------------------------------------------------------------

/**
 * 응답 대기 타임아웃.
 *
 * sendMessage 에 대한 응답이 지정된 시간 내에 도착하지 않은 경우.
 * (현재 NM 은 fire-and-forget 이므로 향후 request/reply 패턴 도입 시 사용)
 */
export class NMTimeout extends NMError {
  readonly i18nKey = "nm_error_timeout";

  constructor(timeoutMs = 5000) {
    super(`Native Messaging 응답 타임아웃 (${timeoutMs}ms).`);
    this.name = "NMTimeout";
  }
}

// ---------------------------------------------------------------------------
// Chrome lastError 검출 유틸리티
// ---------------------------------------------------------------------------

/** Chrome "not found" 에러 메시지 — 이 문자열 포함 시 NMNotInstalled 로 변환 */
const NOT_INSTALLED_MSG = "Specified native messaging host not found.";

/**
 * chrome.runtime.lastError 메시지를 NMError 로 변환한다.
 *
 * @param lastError - chrome.runtime.lastError 값
 * @returns 분류된 NMError 또는 null (에러 없음)
 */
export function classifyLastError(lastError: chrome.runtime.LastError | undefined): NMError | null {
  if (!lastError) return null;
  const msg = lastError.message ?? "";
  if (msg.includes(NOT_INSTALLED_MSG)) {
    return new NMNotInstalled();
  }
  return new NMDisconnected(msg);
}

// ---------------------------------------------------------------------------
// NMDisconnectReason
// ---------------------------------------------------------------------------

/** onDisconnect 콜백에 전달되는 단절 원인 */
export type NMDisconnectReason =
  | { kind: "not_installed"; error: NMNotInstalled }
  | { kind: "disconnected"; error: NMDisconnected }
  | { kind: "max_retries_exceeded"; error: NMDisconnected };
