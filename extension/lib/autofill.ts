// SPDX-License-Identifier: AGPL-3.0-or-later
//
// extension/lib/autofill.ts — M24-E Phase C-4
//
// 사용자 트리거 시 데스크톱에서 credential 받아 form 에 채운다.
// 흐름:
//   1. 페이지 host 가 issuer host 의 subdomain 인지 검증 (matchesIssuer)
//   2. HTTPS 강제 (hostFromHttpsUrl)
//   3. session token 보유 시 NMClient.sendMessage("reveal") → credential 수신
//   4. 만료 시 WebAuthn 재요청 (데스크톱 측 호출, 이번 sub-task 는 트리거만)
//   5. fillInput: input.value 설정 + input/change event dispatch (React/Vue 호환)

import type { DetectedForm } from "./form-detector";
import { hostFromHttpsUrl, matchesIssuer } from "./domain-match";

/** autofill 결과 — 호출자가 UI 표시 용도로 사용. */
export type AutofillResult =
  | { kind: "filled"; credentialId: string; usernameSet: boolean }
  | { kind: "no_match"; reason: "host" | "https" | "no_credential" }
  | { kind: "reveal_failed"; reason: "session_expired" | "user_rejected" | "transport" };

/** 데스크톱 측에서 받아온 credential plaintext payload. */
export interface RevealedCredential {
  credentialId: string;
  username?: string;
  password: string;
  /** issuer host root (예: `google.com`). 매칭 검증용. */
  issuerHost: string;
}

/**
 * `reveal` 메시지 전송 + 응답 수신 callback.
 * NMClient + PairingSession + session token 통합은 나중 sub-task (C-5/D)에서.
 * 이번 C-4 는 callback 인터페이스로 추상화.
 */
export interface AutofillTransport {
  /** 데스크톱에 reveal 요청. session 만료 시 데스크톱이 WebAuthn UI 띄움. */
  requestReveal: (params: {
    pageUrl: string;
    pageHost: string;
  }) => Promise<RevealedCredential | null>;
}

export interface AutofillContext {
  /** 현재 페이지 URL (location.href). HTTPS 검증용. */
  pageUrl: string;
  /** 데스크톱 통신 transport. */
  transport: AutofillTransport;
}

/**
 * 감지된 form 1개에 autofill 시도.
 *
 * @returns 결과 (UI 표시용)
 */
export async function autofillForm(
  form: DetectedForm,
  ctx: AutofillContext,
): Promise<AutofillResult> {
  // 1. HTTPS 검증.
  const pageHost = hostFromHttpsUrl(ctx.pageUrl);
  if (!pageHost) {
    return { kind: "no_match", reason: "https" };
  }

  // 2. 데스크톱에 reveal 요청 (session token / WebAuthn 처리는 데스크톱 측).
  let revealed: RevealedCredential | null;
  try {
    revealed = await ctx.transport.requestReveal({
      pageUrl: ctx.pageUrl,
      pageHost,
    });
  } catch (e) {
    return classifyTransportError(e);
  }

  if (!revealed) {
    return { kind: "no_match", reason: "no_credential" };
  }

  // 3. 도메인 매칭 — phishing 방어. 데스크톱이 받아준 issuerHost 가 페이지와 매칭되어야.
  if (!matchesIssuer(pageHost, revealed.issuerHost)) {
    return { kind: "no_match", reason: "host" };
  }

  // 4. fill — InputEvent + ChangeEvent dispatch.
  fillInput(form.passwordInput, revealed.password);
  let usernameSet = false;
  if (form.usernameInput && revealed.username) {
    fillInput(form.usernameInput, revealed.username);
    usernameSet = true;
  }

  return {
    kind: "filled",
    credentialId: revealed.credentialId,
    usernameSet,
  };
}

/**
 * input.value 설정 + 변경 event dispatch.
 * React / Vue 의 controlled input 도 inner state 업데이트하도록 native setter 사용.
 */
export function fillInput(input: HTMLInputElement, value: string): void {
  // React onChange 가 동작하도록 native setter 사용.
  // (https://github.com/facebook/react/issues/11488)
  const proto = Object.getPrototypeOf(input) as HTMLInputElement;
  const nativeSetter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (nativeSetter) {
    nativeSetter.call(input, value);
  } else {
    // jsdom 또는 비표준 환경 — fallback.
    input.value = value;
  }
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function classifyTransportError(e: unknown): AutofillResult {
  // ErrorClass 가 NMTimeout / NMDisconnected 등 — 단순화: "transport".
  if (e && typeof e === "object" && "i18nKey" in e) {
    const key = (e as { i18nKey?: string }).i18nKey;
    if (key === "nm_error_timeout") {
      return { kind: "reveal_failed", reason: "session_expired" };
    }
  }
  return { kind: "reveal_failed", reason: "transport" };
}
