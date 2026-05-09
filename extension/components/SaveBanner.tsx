// SPDX-License-Identifier: AGPL-3.0-or-later
//
// extension/components/SaveBanner.tsx — M24-E Phase D-3, E-3
//
// "Save to Secretbank?" 인페이지 sticky banner.
// T3: closed shadow DOM 안에서만 렌더됨 — host 페이지 JS/CSS 침범 차단.
// E-3: Site Logo 표시 (bundled SVG → favicon-proxy → letter fallback).

import React, { useEffect, useRef, useState } from "react";
import { getSiteLogo, type SiteLogoResult } from "../lib/site-logo.js";

// T3: credential plaintext ❌ — siteName(도메인) 만 표시.
export interface SaveBannerProps {
  kind: "new" | "update";
  siteName: string;
  onSave: () => void;
  onNever: () => void;
  onDismiss: () => void;
}

const AUTO_DISMISS_MS = 5000;

// inline style — Shadow DOM 내 Tailwind 동작 어려움. px 기반 (rem 충돌 방지).
const BANNER_CSS = `
:host { all: initial; }
.sb-logo-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.sb-logo-img {
  width: 20px;
  height: 20px;
  border-radius: 4px;
  object-fit: contain;
  flex-shrink: 0;
}
.sb-logo-letter {
  width: 20px;
  height: 20px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  color: #fff;
  flex-shrink: 0;
}
.sb-banner {
  position: fixed;
  top: 16px;
  right: 16px;
  z-index: 2147483647;
  width: 360px;
  background: oklch(0.98 0.005 264);
  border: 1px solid oklch(0.88 0.01 264);
  border-radius: 12px;
  box-shadow: 0 4px 24px oklch(0 0 0 / 0.12);
  padding: 16px;
  font-family: system-ui, -apple-system, sans-serif;
  font-size: 14px;
  line-height: 1.5;
  color: oklch(0.2 0.01 264);
  box-sizing: border-box;
}
@media (prefers-color-scheme: dark) {
  .sb-banner {
    background: oklch(0.18 0.01 264);
    border-color: oklch(0.3 0.01 264);
    color: oklch(0.9 0.005 264);
  }
}
.sb-site {
  font-weight: 600;
  font-size: 13px;
  color: oklch(0.45 0.02 264);
}
@media (prefers-color-scheme: dark) {
  .sb-site { color: oklch(0.65 0.02 264); }
}
.sb-title {
  font-weight: 700;
  font-size: 15px;
  margin-bottom: 14px;
}
.sb-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.sb-btn {
  border: none;
  border-radius: 8px;
  padding: 7px 14px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: opacity 0.15s;
  font-family: inherit;
}
.sb-btn:hover { opacity: 0.85; }
.sb-btn:focus-visible {
  outline: 3px solid oklch(0.6 0.15 264);
  outline-offset: 2px;
}
.sb-btn-primary {
  background: oklch(0.5 0.18 264);
  color: oklch(0.98 0.005 264);
}
.sb-btn-ghost {
  background: transparent;
  color: oklch(0.45 0.01 264);
}
@media (prefers-color-scheme: dark) {
  .sb-btn-primary {
    background: oklch(0.6 0.18 264);
    color: oklch(0.1 0.005 264);
  }
  .sb-btn-ghost { color: oklch(0.65 0.01 264); }
}
.sb-btn-danger {
  background: transparent;
  color: oklch(0.55 0.18 25);
}
`;

export function SaveBanner({ kind, siteName, onSave, onNever, onDismiss }: SaveBannerProps) {
  const [hovered, setHovered] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [logo, setLogo] = useState<SiteLogoResult | null>(null);

  // E-3: Site Logo 비동기 로드 (banner 마운트 시 1회)
  useEffect(() => {
    let cancelled = false;
    getSiteLogo(siteName).then((result) => {
      if (!cancelled) setLogo(result);
    });
    return () => {
      cancelled = true;
    };
  }, [siteName]);

  useEffect(() => {
    if (hovered) {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      return;
    }
    timerRef.current = setTimeout(() => {
      onDismiss();
    }, AUTO_DISMISS_MS);
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [hovered, onDismiss]);

  const title = kind === "new" ? "Save to Secretbank?" : "Update saved password?";
  const primaryLabel = kind === "new" ? "Save" : "Update";

  return (
    <>
      <style>{BANNER_CSS}</style>
      <div
        className="sb-banner"
        role="dialog"
        aria-label={title}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {/* E-3: Site Logo + 사이트 이름 */}
        <div className="sb-logo-wrap">
          {logo?.kind === "bundled" || logo?.kind === "remote" ? (
            <img
              className="sb-logo-img"
              src={logo.url}
              alt={siteName}
              aria-hidden="true"
            />
          ) : logo?.kind === "letter" ? (
            <div
              className="sb-logo-letter"
              style={{ background: logo.bg }}
              aria-hidden="true"
            >
              {logo.letter}
            </div>
          ) : null}
          <div className="sb-site">{siteName}</div>
        </div>
        <div className="sb-title">{title}</div>
        <div className="sb-actions">
          <button className="sb-btn sb-btn-primary" onClick={onSave} type="button">
            {primaryLabel}
          </button>
          <button className="sb-btn sb-btn-danger" onClick={onNever} type="button">
            Never for this site
          </button>
          <button className="sb-btn sb-btn-ghost" onClick={onDismiss} type="button">
            Not now
          </button>
        </div>
      </div>
    </>
  );
}
