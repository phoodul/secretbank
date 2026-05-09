// SPDX-License-Identifier: AGPL-3.0-or-later
//
// extension/lib/multi-step-login.ts — M24-E Phase C-6
//
// Google / Microsoft 같은 "이메일 → 비밀번호" 다단계 로그인 흐름 감지.
//
// 휴리스틱:
//   - same-origin 인 상태에서 SPA route 또는 page transition 발생 +
//     `autocomplete="current-password"` 인 input 이 새로 등장 →
//     password step 도달.
//   - URL 또는 path 가 변경되어도 same hostname 이면 동일 issuer 로 간주.

import type { DetectedForm } from "./form-detector";

export type LoginStep = "username" | "password" | "unknown";

/**
 * 현재 detected forms 와 페이지 URL 로 multi-step login 의 어느 단계인지 분류.
 */
export function classifyLoginStep(forms: DetectedForm[], pageUrl: string): LoginStep {
  // current-password 가 보이면 password step.
  if (forms.some((f) => f.passwordPriority === "current-password")) {
    return "password";
  }
  // new-password 또는 type=password 도 password step (가입 흐름 포함).
  if (forms.some((f) => f.passwordInput.type === "password")) {
    return "password";
  }
  // username/email 만 있으면 username step.
  if (forms.some((f) => f.usernameInput && !f.passwordInput.type)) {
    return "username";
  }
  // URL path 휴리스틱: /signin /login /accounts 등 + form 0개 → username step 가능.
  try {
    const u = new URL(pageUrl);
    if (/sign-?in|log-?in|account/.test(u.pathname)) {
      return "username";
    }
  } catch {
    // invalid URL — unknown.
  }
  return "unknown";
}

/**
 * SPA route 변화 + form 변화 결합 분석.
 * 같은 hostname 이면 multi-step 의 다음 단계로 취급.
 */
export function isSameIssuer(prevUrl: string, currUrl: string): boolean {
  try {
    const a = new URL(prevUrl);
    const b = new URL(currUrl);
    return a.hostname === b.hostname;
  } catch {
    return false;
  }
}
