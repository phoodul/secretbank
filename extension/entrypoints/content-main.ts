// SPDX-License-Identifier: AGPL-3.0-or-later
//
// extension/entrypoints/content-main.ts — M24-E Phase D-1 (MAIN world) / D-2 리팩터
//
// MAIN world content script: XMLHttpRequest.prototype.send + window.fetch hook.
// 수상한 auth endpoint POST 감지 → ISOLATED world 에 metadata only 전달.
//
// 보안 (T2 — postMessage 도청 방어):
//   plaintext credential 을 postMessage 로 전달 ❌ — metadata(도메인·이벤트타입·URL) only.
//   실제 input value 는 ISOLATED 측에서 DOM 직접 읽는다.
//   postToWorld() 가 target origin 을 window.location.origin 으로 강제, '*' ❌.

import { postToWorld } from "../lib/world-bridge";
import type { WorldBridgePayload } from "../lib/world-bridge";

export default defineUnlistedScript(() => {
  installXhrHook();
  installFetchHook();
});

// auth-related path 키워드 필터 — content.ts 에서도 단위 테스트 가능하도록 export.
export function isAuthPath(urlString: string): boolean {
  try {
    const url = new URL(urlString, window.location.href);
    return AUTH_PATH_RE.test(url.pathname);
  } catch {
    return false;
  }
}

const AUTH_PATH_RE = /login|signin|sign-in|signup|sign-up|auth|register/i;

// MAIN → ISOLATED postMessage payload (metadata only — T2 방어).
// D-2: WorldBridgePayload 의 xhr-post | fetch-post variant 를 재export.
export type MainToIsolatedMsg = Extract<WorldBridgePayload, { kind: "xhr-post" | "fetch-post" }>;

// D-2: world-bridge.ts 의 postToWorld 로 위임 — target origin 강제 보장.
function postToIsolated(payload: MainToIsolatedMsg): void {
  // T2: postMessage 도청 방어 — postToWorld 가 origin 을 window.location.origin 으로 강제.
  postToWorld(payload);
}

function installXhrHook(): void {
  const originalSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function (body?: Document | XMLHttpRequestBodyInit | null) {
    // method 는 open() 시점에 결정 → _method 로 저장 (open hook 필요).
    const method: string = (this as XHRWithMeta)._sbMethod ?? "";
    const url: string = (this as XHRWithMeta)._sbUrl ?? "";
    if (method.toUpperCase() === "POST" && isAuthPath(url) && hasFormBody(body)) {
      postToIsolated({
        kind: "xhr-post",
        domain: window.location.hostname,
        actionUrl: toAbsoluteUrl(url),
        timestamp: Date.now(),
      });
    }
    return originalSend.call(this, body);
  };

  const originalOpen = XMLHttpRequest.prototype.open;
  // open() 오버로드 중 method + url 을 캡처.
  XMLHttpRequest.prototype.open = function (method: string, url: string | URL, ...rest: unknown[]) {
    (this as XHRWithMeta)._sbMethod = method;
    (this as XHRWithMeta)._sbUrl = String(url);
    // @ts-expect-error — rest args forwarding (오버로드 시그니처 완전 일치 어려움).
    return originalOpen.call(this, method, url, ...rest);
  };
}

interface XHRWithMeta extends XMLHttpRequest {
  _sbMethod?: string;
  _sbUrl?: string;
}

function installFetchHook(): void {
  const originalFetch = window.fetch;
  window.fetch = function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const method = (init?.method ?? "GET").toUpperCase();
    const url = input instanceof Request ? input.url : String(input);
    if (method === "POST" && isAuthPath(url) && hasFormBody(init?.body)) {
      postToIsolated({
        kind: "fetch-post",
        domain: window.location.hostname,
        actionUrl: toAbsoluteUrl(url),
        timestamp: Date.now(),
      });
    }
    return originalFetch.call(this, input, init);
  };
}

// FormData 또는 URLSearchParams body 만 form credential 제출로 간주.
function hasFormBody(body: unknown): boolean {
  if (!body) return false;
  if (typeof FormData !== "undefined" && body instanceof FormData) return true;
  if (typeof URLSearchParams !== "undefined" && body instanceof URLSearchParams) return true;
  if (typeof body === "string") return true; // application/x-www-form-urlencoded string
  return false;
}

function toAbsoluteUrl(url: string): string {
  try {
    return new URL(url, window.location.href).href;
  } catch {
    return url;
  }
}
