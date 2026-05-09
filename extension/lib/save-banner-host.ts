// SPDX-License-Identifier: AGPL-3.0-or-later
//
// extension/lib/save-banner-host.ts — M24-E Phase D-3
//
// SaveBanner 를 Closed Shadow DOM 에 React root 로 마운트.
// T3: closed shadow DOM — host JS/CSS 침범 차단. host 페이지 JS 가 banner DOM 접근 ❌.

import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { SaveBanner, type SaveBannerProps } from "../components/SaveBanner";

const HOST_ID = "secretbank-save-banner-host";

let activeRoot: Root | null = null;
let activeHost: HTMLElement | null = null;

export function mountSaveBanner(props: SaveBannerProps, doc: Document = document): () => void {
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
  host.style.cssText =
    "all:initial;position:fixed;top:0;right:0;z-index:2147483647;pointer-events:none;";
  doc.body.appendChild(host);

  // T3: closed shadow DOM — 페이지 JS 가 shadowRoot 접근 ❌.
  const shadow = host.attachShadow({ mode: "closed" });

  const mountPoint = doc.createElement("div");
  mountPoint.style.cssText = "pointer-events:auto;";
  shadow.appendChild(mountPoint);

  const root = createRoot(mountPoint);
  root.render(React.createElement(SaveBanner, props));

  activeRoot = root;
  activeHost = host;

  return function unmount() {
    root.unmount();
    host.remove();
    if (activeRoot === root) activeRoot = null;
    if (activeHost === host) activeHost = null;
  };
}
