// SPDX-License-Identifier: AGPL-3.0-or-later
//
// extension/lib/spa-watcher.ts — M24-E Phase C-2
//
// SPA (React / Vue / Angular) 의 동적 DOM 변경을 감지하여 form-detector 를 재실행한다.
//
// 감지 신호:
//   1. MutationObserver: body 의 childList + subtree
//   2. History API hook: pushState / replaceState / popstate
//
// debounce 200ms 로 burst 변경 합치기.

import { detectForms, type DetectedForm } from "./form-detector";

export interface SpaWatcherOptions {
  /** 변경 감지 후 form-detector 호출 전 지연 (ms). default = 200. */
  debounceMs?: number;
  /** form 목록 변경 시 호출. ms 변경 없는 동안 호출되지 않음. */
  onChange: (forms: DetectedForm[]) => void;
  /** 초기 1회 scan 즉시 실행 여부. default = true. */
  initialScan?: boolean;
}

export interface SpaWatcher {
  /** 현재 detected forms (cached). */
  current(): DetectedForm[];
  /** 강제 재scan + onChange 호출. debounce 무시. */
  rescan(): void;
  /** observer + history hook 해제. */
  stop(): void;
}

/**
 * Document 의 동적 DOM 변경 + URL 변경 감지 + form-detector 재실행.
 */
export function watchForms(doc: Document, opts: SpaWatcherOptions): SpaWatcher {
  const debounceMs = opts.debounceMs ?? 200;
  const onChange = opts.onChange;
  let cached: DetectedForm[] = [];
  let pendingTimer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  function doScan() {
    if (stopped) return;
    cached = detectForms(doc);
    onChange(cached);
  }

  function scheduleScan() {
    if (stopped) return;
    if (pendingTimer !== null) {
      clearTimeout(pendingTimer);
    }
    pendingTimer = setTimeout(() => {
      pendingTimer = null;
      doScan();
    }, debounceMs);
  }

  // 1. MutationObserver: body 의 childList + subtree.
  const observer = new MutationObserver(() => {
    scheduleScan();
  });
  observer.observe(doc.body, {
    childList: true,
    subtree: true,
    // attributes 는 input 의 type / autocomplete 변경 가능성 때문에 cover.
    attributes: true,
    attributeFilter: ["type", "autocomplete", "name"],
  });

  // 2. History API hook — pushState / replaceState wrap.
  // window 가 없으면 (SSR / non-browser) skip.
  const win = (doc.defaultView ?? null) as (Window & typeof globalThis) | null;
  const originalPushState = win?.history.pushState.bind(win.history);
  const originalReplaceState = win?.history.replaceState.bind(win.history);
  let popstateHandler: (() => void) | null = null;

  if (win && originalPushState && originalReplaceState) {
    win.history.pushState = function (...args: Parameters<History["pushState"]>) {
      const result = originalPushState(...args);
      scheduleScan();
      return result;
    };
    win.history.replaceState = function (...args: Parameters<History["replaceState"]>) {
      const result = originalReplaceState(...args);
      scheduleScan();
      return result;
    };
    popstateHandler = () => scheduleScan();
    win.addEventListener("popstate", popstateHandler);
  }

  // 초기 scan (default true, debounce 무시 즉시 호출).
  if (opts.initialScan !== false) {
    cached = detectForms(doc);
    onChange(cached);
  }

  return {
    current: () => cached,
    rescan: () => {
      if (pendingTimer !== null) {
        clearTimeout(pendingTimer);
        pendingTimer = null;
      }
      doScan();
    },
    stop: () => {
      stopped = true;
      if (pendingTimer !== null) {
        clearTimeout(pendingTimer);
        pendingTimer = null;
      }
      observer.disconnect();
      if (win) {
        if (originalPushState) {
          win.history.pushState = originalPushState;
        }
        if (originalReplaceState) {
          win.history.replaceState = originalReplaceState;
        }
        if (popstateHandler) {
          win.removeEventListener("popstate", popstateHandler);
        }
      }
    },
  };
}
