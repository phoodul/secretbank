// SPDX-License-Identifier: AGPL-3.0-or-later
//
// extension/lib/deep-link.ts — M24-E Phase G-1-2
//
// Secretbank custom protocol deep-link 유틸리티.
//
// secretbank:// scheme — Tauri custom protocol (G-1-3 에서 데스크톱 등록 예정).
// 현재 구현: chrome.tabs.create 로 URL 열기 + 실패 시 clipboard fallback.
//
// 보안:
//   - credential plaintext ❌ — params 에 ID 만 (issuer/password 금지)
//   - URL 파라미터는 encodeURIComponent 로 이스케이프

// ---------------------------------------------------------------------------
// 공개 API
// ---------------------------------------------------------------------------

/**
 * Secretbank deep-link URL 을 열거나 실패 시 clipboard 에 복사한다.
 *
 * @param path  - URL path (예: "graph", "incidents", "railguard")
 * @param params - query parameters (예: { credential: "01JWXYZ..." })
 *
 * 성공: chrome.tabs.create 로 secretbank:// URL 열기
 * 실패: clipboard 에 URL 복사 (G-1-3 deep-link 미등록 시 사용자가 수동 붙여넣기)
 */
export function openSecretbankDeepLink(path: string, params: Record<string, string> = {}): void {
  const query = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");

  const url = query ? `secretbank://${path}?${query}` : `secretbank://${path}`;

  // chrome.tabs.create 로 deep-link 열기 시도
  chrome.tabs.create({ url }, () => {
    if (chrome.runtime.lastError) {
      // 실패 시 clipboard fallback — 사용자가 데스크톱 앱에 수동 입력
      _copyToClipboard(url);
    }
  });
}

// ---------------------------------------------------------------------------
// 내부 헬퍼
// ---------------------------------------------------------------------------

/**
 * 텍스트를 clipboard 에 복사한다.
 *
 * navigator.clipboard API 우선, 실패 시 execCommand 폴백.
 */
function _copyToClipboard(text: string): void {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).catch(() => {
      _execCommandCopy(text);
    });
  } else {
    _execCommandCopy(text);
  }
}

function _execCommandCopy(text: string): void {
  try {
    const el = document.createElement("textarea");
    el.value = text;
    el.style.position = "fixed";
    el.style.opacity = "0";
    document.body.appendChild(el);
    el.select();
    document.execCommand("copy");
    document.body.removeChild(el);
  } catch {
    // clipboard 복사 실패 — silent fail (deep-link G-1-3 완료 전 임시 폴백)
  }
}
