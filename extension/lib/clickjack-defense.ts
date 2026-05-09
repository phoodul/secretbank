// SPDX-License-Identifier: AGPL-3.0-or-later
//
// extension/lib/clickjack-defense.ts — M24-E Phase C-8
//
// 2025년 Marek Tóth 의 DOM-based Extension Clickjacking 공격 방어.
// (NordPass / ProtonPass / Dashlane 의 패치 기법 동일 채택.)
//
// 위협:
//   페이지 JS 가 확장의 in-page UI 위에 transparent overlay 를 삽입 →
//   사용자 click 이 우리 UI 를 거치지 않고 페이지 JS 의 의도된 target 로.
//
// 방어 (3 계층):
//   1. UI 호스트 = Closed Shadow Root (shadow-container.ts) — DOM 침투 ❌
//   2. MutationObserver 가 host 위에 transparent overlay 삽입 감지
//   3. composedPath() 로 click event 의 진짜 target 검증

/**
 * 컨테이너 host 위에 transparent overlay 가 삽입되는지 MutationObserver 로 감시.
 * 발견 시 콜백 호출 (consumer 가 UI 를 일시 비활성화 / 사용자 경고 표시).
 *
 * 휴리스틱:
 *   - host 의 z-index 보다 큰 (또는 같은) z-index 를 갖는 overlay element
 *   - opacity < 0.1 또는 visibility=hidden 이면서 pointer-events=auto
 *   - position=fixed | absolute
 */
export interface ClickjackDefense {
  stop(): void;
}

export interface ClickjackDefenseOptions {
  /** clickjack 의심 element 발견 시 호출. */
  onSuspectOverlay: (overlay: HTMLElement) => void;
}

export function installClickjackDefense(
  doc: Document,
  hostId: string,
  opts: ClickjackDefenseOptions,
): ClickjackDefense {
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const added of Array.from(m.addedNodes)) {
        if (!isElement(added)) continue;
        if ((added as HTMLElement).id === hostId) continue;
        if (isSuspectOverlay(added as HTMLElement)) {
          opts.onSuspectOverlay(added as HTMLElement);
        }
        // 자식까지 포함.
        const descendants = (added as HTMLElement).querySelectorAll("*");
        for (const d of Array.from(descendants)) {
          if (isSuspectOverlay(d as HTMLElement)) {
            opts.onSuspectOverlay(d as HTMLElement);
          }
        }
      }
    }
  });
  observer.observe(doc.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["style", "class"],
  });

  return {
    stop() {
      observer.disconnect();
    },
  };
}

/**
 * Click event 의 composedPath() 첫 번째 element 가 우리 host 인지 검증.
 * 다른 element 가 위에 있으면 clickjack 의심.
 */
export function isClickOnHost(event: Event, hostId: string): boolean {
  const path = event.composedPath?.() ?? [];
  for (const node of path) {
    if (!isElement(node)) continue;
    if ((node as HTMLElement).id === hostId) return true;
  }
  return false;
}

function isElement(node: unknown): node is Element {
  return (
    typeof node === "object" &&
    node !== null &&
    "tagName" in node &&
    typeof (node as { tagName?: unknown }).tagName === "string"
  );
}

/**
 * suspect overlay 휴리스틱:
 *   1. position 이 fixed 또는 absolute
 *   2. z-index 가 매우 높음 (>= 2147483600 — 우리 host 에 근접)
 *   3. opacity < 0.1 또는 visibility=hidden 이면서 pointer-events 가 none 아님
 */
export function isSuspectOverlay(el: HTMLElement): boolean {
  const win = el.ownerDocument?.defaultView;
  if (!win) return false;
  const cs = win.getComputedStyle(el);
  if (cs.position !== "fixed" && cs.position !== "absolute") return false;
  const z = parseInt(cs.zIndex, 10);
  if (Number.isNaN(z) || z < 2147483600) return false;
  const op = parseFloat(cs.opacity);
  const transparent = (Number.isFinite(op) && op < 0.1) || cs.visibility === "hidden";
  if (!transparent) return false;
  if (cs.pointerEvents === "none") return false;
  return true;
}
