// SPDX-License-Identifier: AGPL-3.0-or-later
//
// extension/entrypoints/content.ts — M24-E Phase D-1 (ISOLATED world)
//
// ISOLATED world content script:
//   1. form submit 이벤트 감지 (detectForms 재사용)
//   2. MAIN world 로부터 xhr-post / fetch-post metadata 수신 (origin 검증 필수)
//
// 보안 (T2 — postMessage 도청 방어):
//   MAIN → ISOLATED postMessage 수신 시 event.origin 을 반드시 검증.
//   plaintext credential 은 이 모듈에서 DOM 직접 읽는다 (postMessage 경유 ❌).

import { detectForms } from "../lib/form-detector";
import type { MainToIsolatedMsg } from "./content-main";

export default defineContentScript({
  matches: ["<all_urls>"],
  runAt: "document_idle",
  main() {
    installFormSubmitListener(document);
    installMainWorldMessageListener(window);
  },
});

// form submit 이벤트가 담는 캡처 컨텍스트.
export interface FormSubmitContext {
  eventType: "form-submit";
  domain: string;
  actionUrl: string;
  hasPassword: boolean;
  hasUsername: boolean;
  timestamp: number;
}

// MAIN world 로부터 수신한 hook 이벤트.
export interface HookEventContext {
  eventType: "xhr-post" | "fetch-post";
  domain: string;
  actionUrl: string;
  hasPassword: boolean;
  hasUsername: boolean;
  timestamp: number;
}

export type CaptureContext = FormSubmitContext | HookEventContext;

/**
 * form submit 이벤트 리스너 등록.
 * password input 없는 form 은 무시 (T4 — 관련 없는 form 필터링).
 */
export function installFormSubmitListener(
  doc: Document,
  onCapture?: (ctx: FormSubmitContext) => void,
): () => void {
  function handleSubmit(event: Event): void {
    const form = event.target as HTMLFormElement | null;
    if (!form || form.tagName !== "FORM") return;

    // detectForms 는 form 내 password input 을 반드시 찾아야 발화.
    const detected = detectForms(form);
    if (detected.length === 0) return; // password input 없는 form 은 무시.

    const first = detected[0]!;
    const ctx: FormSubmitContext = {
      eventType: "form-submit",
      domain: doc.location?.hostname ?? "",
      actionUrl: resolveActionUrl(form, doc),
      hasPassword: first.passwordInput != null,
      hasUsername: first.usernameInput != null,
      timestamp: Date.now(),
    };

    if (onCapture) {
      onCapture(ctx);
    }
    // D-3 에서 SaveBanner 호출 예정 — D-1 에서는 캡처만.
  }

  doc.addEventListener("submit", handleSubmit, { capture: true });
  return () => doc.removeEventListener("submit", handleSubmit, { capture: true });
}

/**
 * MAIN world 의 XHR/fetch hook postMessage 수신.
 * origin 검증 필수 — mismatch 시 조용히 거부 (T2 방어).
 */
export function installMainWorldMessageListener(
  win: Window,
  onCapture?: (ctx: HookEventContext) => void,
): () => void {
  function handleMessage(event: MessageEvent): void {
    // T2: origin mismatch 는 조용히 무시 — '*' 수신 절대 ❌.
    if (event.origin !== win.location.origin) return;

    const data = event.data as Partial<MainToIsolatedMsg> | null;
    if (!data || data.type !== "secretbank-main-hook") return;
    if (data.eventType !== "xhr-post" && data.eventType !== "fetch-post") return;

    // 실제 input value 는 DOM 직접 읽기 (postMessage payload 에 없음 — T2 방어).
    const detected = detectForms(win.document);
    const first = detected[0];

    const ctx: HookEventContext = {
      eventType: data.eventType,
      domain: data.domain ?? win.location.hostname,
      actionUrl: data.actionUrl ?? "",
      hasPassword: first?.passwordInput != null,
      hasUsername: first?.usernameInput != null,
      timestamp: data.timestamp ?? Date.now(),
    };

    if (onCapture) {
      onCapture(ctx);
    }
    // D-3 에서 SaveBanner 호출 예정 — D-1 에서는 캡처만.
  }

  win.addEventListener("message", handleMessage);
  return () => win.removeEventListener("message", handleMessage);
}

function resolveActionUrl(form: HTMLFormElement, doc: Document): string {
  const action = form.getAttribute("action");
  if (!action) return doc.location?.href ?? "";
  try {
    return new URL(action, doc.location?.href ?? "").href;
  } catch {
    return action;
  }
}
