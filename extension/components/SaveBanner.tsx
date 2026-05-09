// SPDX-License-Identifier: AGPL-3.0-or-later
//
// extension/components/SaveBanner.tsx — M24-E Phase D-3, E-3, G-3-2
//
// "Save to Secretbank?" 인페이지 sticky banner.
// T3: closed shadow DOM 안에서만 렌더됨 — host 페이지 JS/CSS 침범 차단.
// E-3: Site Logo 표시 (bundled SVG → favicon-proxy → letter fallback).
// G-3-2: kind=update 시 blast radius preview 카드 inline 표시.

import React, { useEffect, useRef, useState } from "react";
import { getSiteLogo, type SiteLogoResult } from "../lib/site-logo.js";
import { BlastRadiusPreviewCard } from "./BlastRadiusPreviewCard.js";
import type { BlastRadiusForHostResponse, BlastRadiusItem } from "@secretbank/shared";

// T3: credential plaintext ❌ — siteName(도메인) 만 표시.
export interface SaveBannerProps {
  kind: "new" | "update";
  siteName: string;
  onSave: () => void;
  onNever: () => void;
  onDismiss: () => void;
  /** G-3-2: kind=update 시 blast radius 데이터 (undefined = 로딩 중, null = 없음) */
  blastRadius?: BlastRadiusForHostResponse | null;
  /** G-3-2: 그래프 딥링크로 이동 */
  onViewBlastRadius?: () => void;
}

const AUTO_DISMISS_MS = 5000;

/*
 * inline style — Shadow DOM 내 Tailwind 동작 어려움. px 기반 (rem 충돌 방지).
 *
 * E-5 토큰 동기화 (2026-05-10):
 *   oklch 값은 extension/styles/globals.css 의 :root / .dark 토큰과 동일.
 *   shadow DOM 은 host :root CSS 변수를 상속받지 못하므로 직접 hardcode.
 *
 *   Light 배경 : oklch(0.985 0.006 250)  = --background
 *   Dark 배경  : oklch(0.14 0.04 252)    = --background (.dark)
 *   Light border: oklch(0.86 0.025 245)  = --border
 *   Dark border : oklch(0.45 0.08 245)   ≈ --border (.dark, 알파 제거)
 *   Light fg    : oklch(0.16 0.04 250)   = --foreground
 *   Dark fg     : oklch(0.96 0.012 250)  = --foreground (.dark)
 *   Light muted-fg: oklch(0.42 0.05 250) = --muted-foreground
 *   Dark muted-fg : oklch(0.7 0.03 250)  = --muted-foreground (.dark)
 *   Primary (light): oklch(0.42 0.2 245) = --primary
 *   Primary (dark) : oklch(0.62 0.2 245) = --primary (.dark)
 *   Destructive    : oklch(0.5 0.2 28) / oklch(0.62 0.22 28) = --destructive
 */
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
  color: oklch(0.985 0.005 250);
  flex-shrink: 0;
}
.sb-banner {
  position: fixed;
  top: 16px;
  right: 16px;
  z-index: 2147483647;
  width: 360px;
  background: oklch(0.985 0.006 250);
  border: 1px solid oklch(0.86 0.025 245);
  border-radius: 10px;
  box-shadow: 0 4px 24px oklch(0 0 0 / 0.12);
  padding: 16px;
  font-family: system-ui, -apple-system, sans-serif;
  font-size: 14px;
  line-height: 1.5;
  color: oklch(0.16 0.04 250);
  box-sizing: border-box;
}
@media (prefers-color-scheme: dark) {
  .sb-banner {
    background: oklch(0.14 0.04 252);
    border-color: oklch(0.45 0.08 245);
    color: oklch(0.96 0.012 250);
  }
}
.sb-site {
  font-weight: 600;
  font-size: 13px;
  color: oklch(0.42 0.05 250);
}
@media (prefers-color-scheme: dark) {
  .sb-site { color: oklch(0.7 0.03 250); }
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
  outline: 3px solid oklch(0.55 0.22 245);
  outline-offset: 2px;
}
.sb-btn-primary {
  background: oklch(0.42 0.2 245);
  color: oklch(0.985 0.005 250);
}
.sb-btn-ghost {
  background: transparent;
  color: oklch(0.42 0.05 250);
}
@media (prefers-color-scheme: dark) {
  .sb-btn-primary {
    background: oklch(0.62 0.2 245);
    color: oklch(0.99 0.005 250);
  }
  .sb-btn-ghost { color: oklch(0.7 0.03 250); }
}
.sb-btn-danger {
  background: transparent;
  color: oklch(0.5 0.2 28);
}
@media (prefers-color-scheme: dark) {
  .sb-btn-danger { color: oklch(0.62 0.22 28); }
}
`;

export function SaveBanner({
  kind,
  siteName,
  onSave,
  onNever,
  onDismiss,
  blastRadius,
  onViewBlastRadius,
}: SaveBannerProps) {
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
        {/* G-3-2: kind=update 시 blast radius preview 카드 */}
        {kind === "update" && blastRadius === undefined && (
          <div
            style={{
              marginTop: 10,
              marginBottom: 10,
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid oklch(0.78 0.16 65)",
              background: "oklch(0.98 0.014 65)",
              fontSize: 12,
              color: "oklch(0.50 0.10 65)",
              fontStyle: "italic",
            }}
            aria-label="영향 범위 로딩 중"
            data-testid="blast-radius-skeleton"
          >
            영향 범위 확인 중…
          </div>
        )}
        {kind === "update" && blastRadius !== undefined && blastRadius !== null && blastRadius.total > 0 && (
          <BlastRadiusPreviewCard
            items={blastRadius.affected as BlastRadiusItem[]}
            total={blastRadius.total}
            hiddenCount={blastRadius.hidden_count}
            onViewDetails={onViewBlastRadius ?? (() => {})}
          />
        )}
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
