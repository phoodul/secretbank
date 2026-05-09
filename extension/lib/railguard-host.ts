// SPDX-License-Identifier: AGPL-3.0-or-later
//
// extension/lib/railguard-host.ts — M24-E Phase G-5
//
// RailguardHintBanner 를 Closed Shadow DOM 에 React root 로 마운트.
// G-2-2 supply-chain-host 패턴 그대로 재사용.
//
// T3: closed shadow DOM — host JS/CSS 침범 차단. host 페이지 JS 가 banner DOM 접근 ❌.

import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { RailguardHintBanner, type RailguardHintBannerProps } from "../components/RailguardHintBanner";

const HOST_ID = "secretbank-railguard-hint-host";

let activeRoot: Root | null = null;
let activeHost: HTMLElement | null = null;

/**
 * RailguardHintBanner 를 Closed Shadow DOM 에 마운트한다.
 *
 * @returns unmount 함수 (호출 시 banner 제거)
 */
export function mountRailguardHintBanner(
  props: RailguardHintBannerProps,
  doc: Document = document,
): () => void {
  // 기존 banner 가 있으면 먼저 unmount (single banner 유지).
  if (activeRoot !== null) {
    activeRoot.unmount();
    activeRoot = null;
  }
  if (activeHost !== null) {
    activeHost.remove();
    activeHost = null;
  }

  const host = doc.createElement("div");
  host.id = HOST_ID;
  // T3: inline style — 외부 CSS 가 host 위치를 흔들 수 없도록.
  // position:fixed / top-right 는 RailguardHintBanner CSS 내부에서 설정.
  host.style.cssText =
    "all:initial;position:fixed;top:0;right:0;z-index:2147483647;pointer-events:none;";
  doc.body.appendChild(host);

  // T3: closed shadow DOM — 페이지 JS 가 shadowRoot 접근 ❌.
  const shadow = host.attachShadow({ mode: "closed" });

  const mountPoint = doc.createElement("div");
  mountPoint.style.cssText = "pointer-events:auto;";
  shadow.appendChild(mountPoint);

  const root = createRoot(mountPoint);
  root.render(React.createElement(RailguardHintBanner, props));

  activeRoot = root;
  activeHost = host;

  return function unmount() {
    root.unmount();
    host.remove();
    if (activeRoot === root) activeRoot = null;
    if (activeHost === host) activeHost = null;
  };
}
