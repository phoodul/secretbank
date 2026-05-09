// SPDX-License-Identifier: AGPL-3.0-or-later
//
// extension/lib/world-bridge.ts — M24-E Phase D-2 (world-bridge)
//
// MAIN world ↔ ISOLATED world postMessage 래퍼.
// origin + source 검증을 강제하여 T2(postMessage 도청) 방어.
//
// API:
//   postToWorld(payload, win?)         — target origin 을 항상 win.location.origin 으로 고정.
//   installWorldListener(handler, win?) — origin + source 이중 검증 후 handler 호출.
//
// 사용 측에서 '*' 또는 임의 origin 을 전달하는 코드 경로를 컴파일 타임에 원천 차단한다.

// ── payload 타입 ─────────────────────────────────────────────────────────────

/**
 * MAIN world → ISOLATED world 로 전달되는 metadata-only discriminated union.
 * T2 방어: plaintext credential(username/password) 절대 포함 ❌.
 */
export type WorldBridgePayload =
  | {
      kind: "form-submit";
      domain: string; // window.location.hostname
      actionUrl: string; // 제출 form action URL (절대 경로)
      timestamp: number;
    }
  | {
      kind: "xhr-post";
      domain: string;
      actionUrl: string;
      timestamp: number;
    }
  | {
      kind: "fetch-post";
      domain: string;
      actionUrl: string;
      timestamp: number;
    };

// 런타임 검증: discriminated union narrow — zod 없이 inline narrow.
function isValidPayload(data: unknown): data is WorldBridgePayload {
  if (typeof data !== "object" || data === null) return false;
  const d = data as Record<string, unknown>;
  if (d["kind"] !== "form-submit" && d["kind"] !== "xhr-post" && d["kind"] !== "fetch-post")
    return false;
  if (typeof d["domain"] !== "string") return false;
  if (typeof d["actionUrl"] !== "string") return false;
  if (typeof d["timestamp"] !== "number") return false;
  return true;
}

// ── postToWorld ───────────────────────────────────────────────────────────────

/**
 * MAIN world → ISOLATED world 로 metadata-only payload 를 전달.
 *
 * target origin 은 항상 win.location.origin 으로 고정 — 사용 측이 '*' 를
 * 전달할 수 있는 파라미터가 존재하지 않는 설계 (T2: postMessage 도청 방어).
 */
export function postToWorld(payload: WorldBridgePayload, win: Window = window): void {
  // T2: postMessage 도청 방어 — origin + source 강제.
  win.postMessage(payload, win.location.origin);
}

// ── installWorldListener ──────────────────────────────────────────────────────

/**
 * ISOLATED world 에서 MAIN world postMessage 를 수신.
 * 아래 두 조건을 모두 만족해야만 handler 를 호출한다:
 *   1. event.origin === win.location.origin  (동일 origin 강제)
 *   2. event.source === win                  (동일 window 강제 — iframe/opener 차단)
 *
 * 검증 실패 시 조용히 drop (에러 throw ❌ — 공격자에게 단서 제공 방지).
 * payload 런타임 검증 실패 시도 조용히 drop.
 *
 * @returns 리스너 제거 함수 (cleanup 용).
 */
export function installWorldListener(
  handler: (payload: WorldBridgePayload) => void,
  win: Window = window,
): () => void {
  function handleMessage(event: MessageEvent): void {
    // T2: postMessage 도청 방어 — origin + source 강제.
    if (event.origin !== win.location.origin) return; // origin mismatch → drop
    if (event.source !== win) return; // 타 frame / window.opener → drop

    // 런타임 payload 검증 — 알 수 없는 kind/필드 누락은 조용히 거부.
    if (!isValidPayload(event.data)) return;

    handler(event.data);
  }

  win.addEventListener("message", handleMessage);
  return () => win.removeEventListener("message", handleMessage);
}
