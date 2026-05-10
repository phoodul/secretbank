// SPDX-License-Identifier: AGPL-3.0-or-later
//
// extension/lib/generator-panel-host.ts — M24-E Phase E-1
//
// GeneratorPanel 을 Closed Shadow DOM 에 React root 로 마운트.
// T3: closed shadow DOM — host JS/CSS 침범 차단 (D-3 save-banner-host 패턴 재사용).
// T-CRED-1: panel 닫힘(unmount) 시 React state cleanup → generated password 메모리 해제.

import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { GeneratorPanel, type GeneratorPanelProps } from "../components/GeneratorPanel";

const HOST_ID = "secretbank-generator-panel-host";

let activeRoot: Root | null = null;
let activeHost: HTMLElement | null = null;

export interface MountOptions {
  // targetInput 의 getBoundingClientRect() 기반으로 panel 을 위에 표시.
  targetInput: HTMLInputElement;
}

export function mountGeneratorPanel(options: MountOptions, doc: Document = document): () => void {
  // 기존 panel 이 있으면 먼저 unmount (single panel 유지).
  if (activeRoot !== null) {
    activeRoot.unmount();
    activeRoot = null;
  }
  if (activeHost !== null) {
    activeHost.remove();
    activeHost = null;
  }

  const { targetInput } = options;
  const rect = targetInput.getBoundingClientRect();

  // z-index: 2147483647 (최대값) — T-Z1: host 페이지 z-index 충돌 방지.
  const host = doc.createElement("div");
  host.id = HOST_ID;
  host.style.cssText = [
    "all:initial",
    "position:fixed",
    `top:${Math.max(0, rect.top - 8)}px`,
    `left:${rect.left}px`,
    "z-index:2147483647",
    "pointer-events:none",
  ].join(";");
  doc.body.appendChild(host);

  // T3: closed shadow DOM — 페이지 JS 가 shadowRoot 접근 ❌.
  const shadow = host.attachShadow({ mode: "closed" });

  const mountPoint = doc.createElement("div");
  mountPoint.style.cssText = "pointer-events:auto;";
  shadow.appendChild(mountPoint);

  function unmount() {
    // T-CRED-1: unmount → React state cleanup → generated password 해제.
    root.unmount();
    host.remove();
    if (activeRoot === root) activeRoot = null;
    if (activeHost === host) activeHost = null;
  }

  const props: GeneratorPanelProps = {
    targetInput,
    onClose: unmount,
  };

  const root = createRoot(mountPoint);
  root.render(React.createElement(GeneratorPanel, props));

  activeRoot = root;
  activeHost = host;

  return unmount;
}

// panel 이 현재 열려 있는지 확인 (GeneratorIcon 의 상태 동기화용).
export function isGeneratorPanelOpen(): boolean {
  return activeRoot !== null;
}
