// SPDX-License-Identifier: AGPL-3.0-or-later
//
// extension/lib/shadow-container.ts — M24-E Phase C-8
//
// 확장이 인페이지에 그리는 모든 UI 컨테이너는 Closed Shadow Root 로 격리한다.
// 외부 페이지 JS 가 `host.shadowRoot` 로 접근 ❌ + 외부 CSS 영향 ❌.

export interface ShadowContainer {
  /** 호스트 element (페이지 DOM 안). */
  host: HTMLElement;
  /** Closed shadow root — 페이지에서 접근 불가능. */
  root: ShadowRoot;
  /** 정리 시 호출. */
  destroy(): void;
}

/**
 * 페이지 body 에 host element + closed shadow root 부착.
 * z-index 매우 높게 + position fixed (다른 페이지 element 위로 올라옴).
 */
export function createShadowContainer(doc: Document, hostId: string): ShadowContainer {
  // 기존 host 가 있으면 재사용 (idempotent).
  let host = doc.getElementById(hostId) as HTMLElement | null;
  if (!host) {
    host = doc.createElement("div");
    host.id = hostId;
    // 외부 CSS 가 host 의 위치를 흔들 수 없도록 inline style 우선.
    host.style.cssText = [
      "all: initial",
      "position: fixed",
      "top: 0",
      "right: 0",
      "z-index: 2147483647", // max int32
      "pointer-events: none", // 자식만 받음
    ].join(";");
    doc.body.appendChild(host);
  }
  const root = host.attachShadow({ mode: "closed" });
  return {
    host,
    root,
    destroy() {
      host?.remove();
    },
  };
}
