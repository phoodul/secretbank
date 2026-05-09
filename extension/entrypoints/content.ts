// SPDX-License-Identifier: AGPL-3.0-or-later
//
// extension/entrypoints/content.ts — M24-E Phase D-1 (ISOLATED world) / D-2 리팩터
//
// ISOLATED world content script:
//   1. form submit 이벤트 감지 (detectForms 재사용)
//   2. MAIN world 로부터 xhr-post / fetch-post metadata 수신 (origin + source 검증)
//
// 보안 (T2 — postMessage 도청 방어):
//   installWorldListener() 가 origin + source 이중 검증을 강제.
//   plaintext credential 은 이 모듈에서 DOM 직접 읽는다 (postMessage 경유 ❌).

import { detectForms } from "../lib/form-detector";
import { installWorldListener } from "../lib/world-bridge";
import type { WorldBridgePayload } from "../lib/world-bridge";
import { handleFormSubmit } from "../lib/save-handler";
import type { AutocompleteHint } from "../lib/save-handler";
import { NMClient } from "../lib/nm-client";
import { mountGeneratorIcon } from "../components/GeneratorIcon";
import type { IconMount } from "../components/GeneratorIcon";

// D-4: NMClient 싱글턴 — content script 생애 동안 유지 (reconnect 내장).
const _nmClient = new NMClient();

// E-1: new-password input → GeneratorIcon 마운트 맵 (input → IconMount).
const _iconMounts = new Map<HTMLInputElement, IconMount>();

export default defineContentScript({
  matches: ["<all_urls>"],
  runAt: "document_idle",
  main() {
    installFormSubmitListener(document);
    installMainWorldMessageListener(window);
    installGeneratorIcons(document);
  },
});

/**
 * new-password autocomplete input 을 감지하여 GeneratorIcon 을 마운트한다.
 * C2 SPA watcher 와 호환 — DOM 변경 시 재scan 후 추가/제거.
 */
export function installGeneratorIcons(doc: Document): () => void {
  function syncIcons() {
    const forms = detectForms(doc);
    const activeInputs = new Set<HTMLInputElement>();

    for (const form of forms) {
      // E-1: priority "new-password" 인 password input 만 대상.
      if (form.passwordPriority !== "new-password") continue;
      const input = form.passwordInput;
      activeInputs.add(input);

      if (!_iconMounts.has(input)) {
        const mount = mountGeneratorIcon(input, doc);
        _iconMounts.set(input, mount);
      }
    }

    // 사라진 input 의 icon 제거.
    for (const [input, mount] of _iconMounts) {
      if (!activeInputs.has(input)) {
        mount.remove();
        _iconMounts.delete(input);
      }
    }
  }

  syncIcons();

  // MutationObserver — SPA DOM 변경 감지.
  const observer = new MutationObserver(() => syncIcons());
  observer.observe(doc.body ?? doc.documentElement, { childList: true, subtree: true });

  return () => {
    observer.disconnect();
    for (const mount of _iconMounts.values()) {
      mount.remove();
    }
    _iconMounts.clear();
  };
}

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
    const domain = doc.location?.hostname ?? "";
    const ctx: FormSubmitContext = {
      eventType: "form-submit",
      domain,
      actionUrl: resolveActionUrl(form, doc),
      hasPassword: first.passwordInput != null,
      hasUsername: first.usernameInput != null,
      timestamp: Date.now(),
    };

    if (onCapture) {
      onCapture(ctx);
    }

    // D-4: form input 직접 읽기 (T2 방어 — postMessage 경유 ❌).
    const username = first.usernameInput?.value ?? "";
    const password = first.passwordInput?.value ?? "";
    // T-CRED-1: password 는 handleFormSubmit 내부에서만 사용, 종료 시 null 처리됨.
    if (!password) return; // 빈 password 는 저장 불필요.

    // autocomplete hint 추출 — passwordPriority → AutocompleteHint 변환.
    const hint = passwordPriorityToHint(first.passwordPriority);

    void handleFormSubmit(
      { domain, siteName: domain, username, password, autocompleteHint: hint },
      _nmClient,
    );
  }

  doc.addEventListener("submit", handleSubmit, { capture: true });
  return () => doc.removeEventListener("submit", handleSubmit, { capture: true });
}

/**
 * MAIN world 의 XHR/fetch hook postMessage 수신.
 * D-2: installWorldListener() 로 위임 — origin + source 이중 검증 강제 (T2 방어).
 * payload 가 xhr-post / fetch-post 인 경우만 처리.
 */
export function installMainWorldMessageListener(
  win: Window,
  onCapture?: (ctx: HookEventContext) => void,
): () => void {
  // T2: postMessage 도청 방어 — origin + source 강제 (installWorldListener 내부).
  return installWorldListener((payload: WorldBridgePayload) => {
    if (payload.kind !== "xhr-post" && payload.kind !== "fetch-post") return;

    // 실제 input value 는 DOM 직접 읽기 (postMessage payload 에 없음 — T2 방어).
    const detected = detectForms(win.document);
    const first = detected[0];

    const ctx: HookEventContext = {
      eventType: payload.kind,
      domain: payload.domain,
      actionUrl: payload.actionUrl,
      hasPassword: first?.passwordInput != null,
      hasUsername: first?.usernameInput != null,
      timestamp: payload.timestamp,
    };

    if (onCapture) {
      onCapture(ctx);
    }
    // D-3 에서 SaveBanner 호출 예정 — D-2 에서는 캡처만.
  }, win);
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

// D-4: PasswordPriority → AutocompleteHint 변환 헬퍼.
function passwordPriorityToHint(
  priority: import("../lib/form-detector").PasswordPriority,
): AutocompleteHint {
  if (priority === "new-password") return "new-password";
  if (priority === "current-password") return "current-password";
  return null;
}
