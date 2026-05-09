// SPDX-License-Identifier: AGPL-3.0-or-later
//
// extension/components/GeneratorIcon.tsx — M24-E Phase E-1
//
// autocomplete="new-password" input 옆에 표시되는 floating generator 아이콘.
// T3: closed shadow DOM 에서 렌더 (GeneratorPanel 과 동일 host 규격).
// T-Z1: z-index 2147483646 (panel 은 2147483647) — host 페이지 충돌 방지.

import React, { useCallback, useEffect, useRef, useState } from "react";

export interface GeneratorIconProps {
  targetInput: HTMLInputElement;
  onActivate: () => void; // GeneratorPanel mount 요청
}

// KeyRound / Sparkles 를 Lucide 없이 SVG inline (shadow DOM 에서 외부 font ❌).
const KEY_SVG = (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="7.5" cy="15.5" r="5.5" />
    <path d="M21 2 L13 10" />
    <path d="M19 4 L21 6" />
    <path d="M16 7 L18 9" />
    <path d="M12 10 L10 12 L7.5 10" />
  </svg>
);

const ICON_CSS = `
:host { all: initial; }
.gi-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  border: none;
  background: oklch(0.5 0.18 264);
  color: #fff;
  cursor: pointer;
  opacity: 0.85;
  transition: opacity 0.12s, transform 0.1s;
  padding: 0;
  outline: none;
  box-shadow: 0 1px 4px oklch(0 0 0 / 0.18);
}
.gi-btn:hover { opacity: 1; transform: scale(1.08); }
.gi-btn:focus-visible { outline: 2px solid oklch(0.6 0.18 264); outline-offset: 2px; }
@media (prefers-color-scheme: dark) {
  .gi-btn { background: oklch(0.6 0.18 264); color: oklch(0.1 0.005 264); }
}
`;

export function GeneratorIcon({ targetInput, onActivate }: GeneratorIconProps) {
  function handleClick(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    onActivate();
  }

  return (
    <>
      <style>{ICON_CSS}</style>
      <button
        type="button"
        className="gi-btn"
        aria-label="Generate password"
        onClick={handleClick}
      >
        {KEY_SVG}
      </button>
    </>
  );
}

// ── Imperative mount helper (Shadow DOM 격리) ──────────────────────────────
// GeneratorIcon 은 React 외부 (content script) 에서 직접 DOM 에 마운트된다.
// T3: closed shadow DOM — host 페이지 JS/CSS 침범 차단.
// T-Z1: z-index 2147483646 — panel(2147483647) 아래, host 위.

import { createRoot, type Root } from "react-dom/client";
import { mountGeneratorPanel, isGeneratorPanelOpen } from "../lib/generator-panel-host";

export interface IconMount {
  update: (rect: DOMRect) => void;
  remove: () => void;
}

export function mountGeneratorIcon(
  targetInput: HTMLInputElement,
  doc: Document = document,
): IconMount {
  const host = doc.createElement("div");
  host.setAttribute("data-sb-generator-icon", "1");
  applyHostStyle(host, targetInput.getBoundingClientRect());
  doc.body.appendChild(host);

  // T3: closed shadow DOM.
  const shadow = host.attachShadow({ mode: "closed" });
  const mountPoint = doc.createElement("div");
  mountPoint.style.cssText = "pointer-events:auto;display:inline-flex;";
  shadow.appendChild(mountPoint);

  let panelUnmount: (() => void) | null = null;
  let isFocused = false;

  function activate() {
    if (isGeneratorPanelOpen()) return; // 이미 열려 있으면 skip.
    panelUnmount = mountGeneratorPanel({ targetInput }, doc);
  }

  const root: Root = createRoot(mountPoint);

  function render() {
    root.render(
      React.createElement(GeneratorIcon, { targetInput, onActivate: activate }),
    );
  }
  render();

  // input focus / blur 시 아이콘 가시성 제어.
  function onFocus() {
    isFocused = true;
    host.style.display = "block";
  }
  function onBlur() {
    isFocused = false;
    // panel 열려 있으면 아이콘 유지.
    if (!isGeneratorPanelOpen()) {
      // 짧은 delay — 아이콘 클릭 시 blur 가 먼저 발화하므로.
      setTimeout(() => {
        if (!isFocused && !isGeneratorPanelOpen()) {
          host.style.display = "none";
        }
      }, 150);
    }
  }

  targetInput.addEventListener("focus", onFocus);
  targetInput.addEventListener("blur", onBlur);

  // 초기 숨김 (focus 없으면 숨김).
  host.style.display = "none";

  return {
    update(rect: DOMRect) {
      applyHostStyle(host, rect);
    },
    remove() {
      targetInput.removeEventListener("focus", onFocus);
      targetInput.removeEventListener("blur", onBlur);
      root.unmount();
      host.remove();
      if (panelUnmount) {
        panelUnmount();
        panelUnmount = null;
      }
    },
  };
}

function applyHostStyle(host: HTMLElement, rect: DOMRect) {
  // input 의 우측 끝 + 수직 중앙에 absolute positioning.
  // T-Z1: z-index 2147483646.
  const top = rect.top + window.scrollY + (rect.height - 24) / 2;
  const left = rect.right + window.scrollX - 28; // 4px 내측 여백.
  host.style.cssText = [
    "all:initial",
    "position:absolute",
    `top:${top}px`,
    `left:${left}px`,
    "z-index:2147483646",
    "pointer-events:none",
  ].join(";");
}
