// SPDX-License-Identifier: AGPL-3.0-or-later
//
// extension/lib/autofill-trigger.ts — M24-E Phase C-5
//
// 사용자 트리거 시점 선택 (page load 자동 fill ❌, 보안 우선).
// 3 trigger 옵션:
//   1. focus: input focus 시 → 콜백 호출 (consumer 가 inline overlay 버튼 표시)
//   2. hotkey: Cmd+Shift+L (macOS) / Ctrl+Shift+L (other) → 활성 input fill
//   3. (popup 트리거는 별도 — popup → background → tab 으로 메시지)
//
// 본 모듈 = 트리거 감지 + onTrigger 콜백 발화. autofill 실행은 consumer.

import type { DetectedForm } from "./form-detector";

export type TriggerSource = "focus" | "hotkey";

export interface TriggerEvent {
  source: TriggerSource;
  /** 활성 input (focus 또는 hotkey 시점). */
  input: HTMLInputElement;
  /** input 이 속한 detected form (없으면 null). */
  detectedForm: DetectedForm | null;
}

export interface TriggerOptions {
  /** 어떤 source 활성화. default = ["focus", "hotkey"]. */
  enabled?: TriggerSource[];
  /** 트리거 시 호출. consumer 가 autofill 실행. */
  onTrigger: (event: TriggerEvent) => void;
  /** 현재 detected forms 를 반환하는 함수 (spa-watcher.current() 등). */
  getForms: () => DetectedForm[];
}

export interface AutofillTrigger {
  stop(): void;
}

/**
 * Document 에 focus + hotkey listener 등록.
 *
 * focus listener 는 password input 또는 username input 이 focus 될 때만 발화.
 * hotkey 는 활성 input 이 password input 일 때만 발화 (다른 element 시 ignore).
 */
export function installTrigger(doc: Document, opts: TriggerOptions): AutofillTrigger {
  const enabled = new Set<TriggerSource>(opts.enabled ?? ["focus", "hotkey"]);
  const win = (doc.defaultView ?? null) as Window | null;

  function findFormForInput(input: HTMLInputElement): DetectedForm | null {
    const forms = opts.getForms();
    for (const f of forms) {
      if (f.passwordInput === input || f.usernameInput === input) {
        return f;
      }
    }
    return null;
  }

  let focusHandler: ((e: Event) => void) | null = null;
  let keyHandler: ((e: KeyboardEvent) => void) | null = null;

  if (enabled.has("focus")) {
    focusHandler = (e: Event) => {
      // cross-realm 안전: instanceof 대신 tagName 검사.
      // 테스트가 별도 JSDOM 인스턴스를 사용하면 globalThis.HTMLInputElement 와
      // doc 의 HTMLInputElement 가 다른 prototype chain → instanceof 가 false.
      const target = e.target as HTMLElement | null;
      if (!target || target.tagName !== "INPUT") return;
      const input = target as HTMLInputElement;
      const detectedForm = findFormForInput(input);
      if (!detectedForm) return; // password / username input 만.
      opts.onTrigger({ source: "focus", input, detectedForm });
    };
    // focusin 은 bubbles=true 이므로 default phase 에서 doc 가 받는다.
    // capture 옵션은 jsdom 에서 변형되어 listener 미발화 케이스 발생 → false.
    doc.addEventListener("focusin", focusHandler);
  }

  if (enabled.has("hotkey") && win) {
    keyHandler = (e: KeyboardEvent) => {
      if (!isAutofillHotkey(e)) return;
      const active = doc.activeElement as HTMLElement | null;
      if (!active || active.tagName !== "INPUT") return;
      const input = active as HTMLInputElement;
      const detectedForm = findFormForInput(input);
      if (!detectedForm) return;
      e.preventDefault();
      opts.onTrigger({ source: "hotkey", input, detectedForm });
    };
    win.addEventListener("keydown", keyHandler);
  }

  return {
    stop() {
      if (focusHandler) {
        doc.removeEventListener("focusin", focusHandler);
        focusHandler = null;
      }
      if (keyHandler && win) {
        win.removeEventListener("keydown", keyHandler);
        keyHandler = null;
      }
    },
  };
}

/**
 * Cmd+Shift+L (macOS) 또는 Ctrl+Shift+L (other).
 * Chrome browser shortcut 충돌 방지 위해 alt 가 눌리지 않은 경우만.
 */
export function isAutofillHotkey(e: KeyboardEvent): boolean {
  if (e.key !== "L" && e.key !== "l") return false;
  if (!e.shiftKey) return false;
  // metaKey (Cmd) on macOS, ctrlKey on other.
  if (!e.metaKey && !e.ctrlKey) return false;
  if (e.altKey) return false;
  return true;
}
