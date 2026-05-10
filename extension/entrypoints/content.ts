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
import {
  isDismissed,
  addDismissedHost,
  getCachedIncidents,
  setCachedIncidents,
  isRailguardDismissed,
  addRailguardDismissedHost,
} from "../lib/banner-cache";
import { mountSupplyChainBanner } from "../lib/supply-chain-host";
import { mountRailguardHintBanner } from "../lib/railguard-host";
import { openSecretbankDeepLink } from "../lib/deep-link";
import { isAiEditorHost } from "../lib/ai-editor-hosts";
import { getSessionToken } from "../lib/storage";
import { pushSiteContextIfEnabled } from "../lib/mcp-push";

// D-4: NMClient 싱글턴 — content script 생애 동안 유지 (reconnect 내장).
const _nmClient = new NMClient();

// E-1: new-password input → GeneratorIcon 마운트 맵 (input → IconMount).
const _iconMounts = new Map<HTMLInputElement, IconMount>();

// G-2-2: 현재 마운트된 supply chain banner unmount 함수
let _supplyChainUnmount: (() => void) | null = null;

// G-2-2: 마지막으로 체크한 host (SPA watcher 중복 방지)
let _lastCheckedHost = "";

// G-5: 현재 마운트된 railguard hint banner unmount 함수
let _railguardUnmount: (() => void) | null = null;

// G-5: 마지막으로 체크한 railguard host (SPA watcher 중복 방지)
let _lastRailguardCheckedHost = "";

// G-4-2: MCP push — form focus 첫 발생 추적 (페이지당 1회)
let _mcpPushTriggered = false;

export default defineContentScript({
  matches: ["<all_urls>"],
  runAt: "document_idle",
  main() {
    installFormSubmitListener(document);
    installMainWorldMessageListener(window);
    installGeneratorIcons(document);
    // G-2-2: supply chain banner — 페이지 로드 시 즉시 + SPA URL 변경 감지
    void checkSupplyChainForCurrentHost();
    installSupplyChainHostWatcher(window);
    // G-5: RAILGUARD hint banner — AI 에디터 사이트 감지
    void checkRailguardForCurrentHost();
    installRailguardHostWatcher(window);
    // G-4-2: MCP context push — DOMContentLoaded 이후 즉시 시도 + form focus 첫 occurrence
    void triggerMcpPushOnPageLoad();
    installMcpPushFormFocusListener(document);
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

// ---------------------------------------------------------------------------
// G-2-2: Supply chain banner 로직
// ---------------------------------------------------------------------------

/**
 * 현재 페이지 host 에 대해 incident 체크를 수행하고 banner 를 마운트한다.
 *
 * 흐름:
 *   1. host 추출
 *   2. isDismissed 체크 → true 면 종료
 *   3. getCachedIncidents → cache hit 면 캐시 사용 / miss 면 RPC 호출
 *   4. severity ≥ MEDIUM incident 있으면 banner 마운트
 */
export async function checkSupplyChainForCurrentHost(): Promise<void> {
  const host = document.location?.hostname ?? "";
  if (!host) return;

  // 동일 host 중복 체크 방지 (SPA watcher 연속 호출 시)
  if (host === _lastCheckedHost) return;
  _lastCheckedHost = host;

  // 기존 banner unmount
  if (_supplyChainUnmount !== null) {
    _supplyChainUnmount();
    _supplyChainUnmount = null;
  }

  try {
    // dismiss 체크
    const dismissed = await isDismissed(host);
    if (dismissed) return;

    // 캐시 조회
    let response = await getCachedIncidents(host);

    if (response === null) {
      // RPC 호출 — session token 필요
      const session = await getSessionToken();
      if (session === null) return; // 세션 없으면 skip (vault 잠금 상태)

      await _nmClient.connect().catch(() => null);
      if (!_nmClient.isConnected()) return;

      response = await _nmClient.incidentCheckForHost(host, session.token);
      // 캐시 저장 (1h TTL)
      await setCachedIncidents(host, response);
    }

    // 매칭 없거나 오류 → banner 미표시
    if (!response.ok || !response.matches || response.matches.length === 0) return;

    // severity ≥ MEDIUM 인 첫 번째 incident (이미 서버에서 필터됨)
    const topIncident = response.matches[0];
    if (!topIncident) return;

    // banner 마운트
    _supplyChainUnmount = mountSupplyChainBanner({
      host,
      incident: topIncident,
      onView: () => {
        openSecretbankDeepLink("incidents", { host });
      },
      onDismiss: () => {
        void addDismissedHost(host).then(() => {
          if (_supplyChainUnmount !== null) {
            _supplyChainUnmount();
            _supplyChainUnmount = null;
          }
        });
      },
    });
  } catch {
    // 네트워크 오류 / RPC 실패 — silent fail (banner 미표시)
  }
}

/**
 * SPA URL 변경 시 supply chain 체크 재실행.
 * pushState / replaceState / popstate 감지.
 */
export function installSupplyChainHostWatcher(win: Window): () => void {
  const originalPushState = win.history.pushState.bind(win.history);
  const originalReplaceState = win.history.replaceState.bind(win.history);

  function onNavigate() {
    // host 변경 시에만 재체크 (_lastCheckedHost 비교는 checkSupplyChainForCurrentHost 내부)
    _lastCheckedHost = ""; // 강제 리셋 — URL 변경 시 항상 재체크
    void checkSupplyChainForCurrentHost();
    // G-4-2: SPA 이동 시 MCP push 플래그 리셋 (새 host 에 대해 재트리거)
    _mcpPushTriggered = false;
    void triggerMcpPushOnPageLoad();
  }

  win.history.pushState = function (...args: Parameters<History["pushState"]>) {
    const result = originalPushState(...args);
    onNavigate();
    return result;
  };

  win.history.replaceState = function (...args: Parameters<History["replaceState"]>) {
    const result = originalReplaceState(...args);
    onNavigate();
    return result;
  };

  const popstateHandler = () => onNavigate();
  win.addEventListener("popstate", popstateHandler);

  return () => {
    win.history.pushState = originalPushState;
    win.history.replaceState = originalReplaceState;
    win.removeEventListener("popstate", popstateHandler);
  };
}

// ---------------------------------------------------------------------------
// G-4-2: MCP context push 트리거
// ---------------------------------------------------------------------------

/**
 * 페이지 로드 시 (DOMContentLoaded 이후 — runAt: document_idle) MCP push 를 시도한다.
 *
 * 흐름:
 *   1. session token 확인 — 없으면 skip (vault 잠금)
 *   2. credentialListVisible(host) 로 credential meta 추출
 *   3. pushSiteContextIfEnabled 호출 (opt-in + cooldown 내부 검사)
 */
export async function triggerMcpPushOnPageLoad(): Promise<void> {
  const host = document.location?.hostname ?? "";
  if (!host) return;

  const session = await getSessionToken();
  if (session === null) return; // vault 잠금 — skip

  try {
    await _nmClient.connect().catch(() => null);
    if (!_nmClient.isConnected()) return;

    // credential meta 추출 (E-4 credentialListVisible 재사용)
    const listResp = await _nmClient.credentialListVisible(host, session.token);
    const credentialMeta = (listResp.items ?? []).map((c) => ({
      id: c.credential_id,
      name: c.issuer ?? host,
      issuer: c.issuer ?? host,
    }));

    await pushSiteContextIfEnabled(host, credentialMeta, session.token, _nmClient);
  } catch {
    // 네트워크 오류 / RPC 실패 — silent fail
  }
}

/**
 * form input 의 focus 첫 발생 시 MCP push 를 트리거한다.
 *
 * 페이지당 1회 (이미 triggerMcpPushOnPageLoad 가 실행되었으면 추가 skip).
 * form input focus 는 사용자가 실제로 페이지와 상호작용 중임을 나타낸다.
 *
 * @param doc Document — 테스트 주입을 위해 파라미터화
 */
export function installMcpPushFormFocusListener(doc: Document): () => void {
  function handleFocusIn(event: FocusEvent): void {
    const target = event.target as HTMLElement | null;
    if (!target) return;

    // input / textarea / select 요소 focus 에만 반응 (form 관련 요소)
    const tag = target.tagName?.toUpperCase();
    if (tag !== "INPUT" && tag !== "TEXTAREA" && tag !== "SELECT") return;

    // 페이지당 1회
    if (_mcpPushTriggered) return;
    _mcpPushTriggered = true;

    void triggerMcpPushOnPageLoad();
  }

  doc.addEventListener("focusin", handleFocusIn, { capture: true, passive: true });
  return () => doc.removeEventListener("focusin", handleFocusIn, { capture: true });
}

// ---------------------------------------------------------------------------
// G-5: RAILGUARD hint banner 로직
// ---------------------------------------------------------------------------

/**
 * 현재 페이지 host 가 AI 에디터 사이트인지 확인하고 banner 를 마운트한다.
 *
 * 흐름:
 *   1. host 추출
 *   2. isAiEditorHost 체크 → 비-AI 사이트면 종료 (false positive 방지)
 *   3. isRailguardDismissed 체크 → true 면 종료 (7일 TTL)
 *   4. banner 마운트
 */
export async function checkRailguardForCurrentHost(): Promise<void> {
  const host = document.location?.hostname ?? "";
  if (!host) return;

  // 동일 host 중복 체크 방지 (SPA watcher 연속 호출 시)
  if (host === _lastRailguardCheckedHost) return;
  _lastRailguardCheckedHost = host;

  // 기존 banner unmount
  if (_railguardUnmount !== null) {
    _railguardUnmount();
    _railguardUnmount = null;
  }

  // 비-AI 사이트 → false positive 방지, 즉시 종료
  if (!isAiEditorHost(host)) return;

  try {
    // dismiss 체크 (7일 TTL)
    const dismissed = await isRailguardDismissed(host);
    if (dismissed) return;

    // banner 마운트
    _railguardUnmount = mountRailguardHintBanner({
      host,
      onCreate: () => {
        openSecretbankDeepLink("railguard");
      },
      onDismiss: () => {
        void addRailguardDismissedHost(host).then(() => {
          if (_railguardUnmount !== null) {
            _railguardUnmount();
            _railguardUnmount = null;
          }
        });
      },
    });
  } catch {
    // 네트워크 오류 / 스토리지 실패 — silent fail (banner 미표시)
  }
}

/**
 * SPA URL 변경 시 RAILGUARD banner 체크 재실행.
 * pushState / replaceState / popstate 감지.
 */
export function installRailguardHostWatcher(win: Window): () => void {
  const originalPushState = win.history.pushState.bind(win.history);
  const originalReplaceState = win.history.replaceState.bind(win.history);

  function onNavigate() {
    // host 변경 시에만 재체크 (_lastRailguardCheckedHost 비교는 내부)
    _lastRailguardCheckedHost = ""; // 강제 리셋 — URL 변경 시 항상 재체크
    void checkRailguardForCurrentHost();
  }

  win.history.pushState = function (...args: Parameters<History["pushState"]>) {
    const result = originalPushState(...args);
    onNavigate();
    return result;
  };

  win.history.replaceState = function (...args: Parameters<History["replaceState"]>) {
    const result = originalReplaceState(...args);
    onNavigate();
    return result;
  };

  const popstateHandler = () => onNavigate();
  win.addEventListener("popstate", popstateHandler);

  return () => {
    win.history.pushState = originalPushState;
    win.history.replaceState = originalReplaceState;
    win.removeEventListener("popstate", popstateHandler);
  };
}
