// SPDX-License-Identifier: AGPL-3.0-or-later
//
// extension/components/SupplyChainBanner.tsx — M24-E Phase G-2-2
//
// Supply chain incident in-page sticky banner.
// T3: closed shadow DOM 안에서만 렌더됨 — host 페이지 JS/CSS 침범 차단.
//
// 위협 모델:
//   - Closed Shadow DOM (T3) — z-index: 2147483647, 페이지 최상단 sticky
//   - LOW severity 는 G-2-1 백엔드에서 필터 (defensive: 여기서도 skip)
//   - host 도메인만 표시 — credential plaintext ❌

import React from "react";

import type { IncidentMatchSummary } from "@secretbank/shared";

// ---------------------------------------------------------------------------
// 공개 타입
// ---------------------------------------------------------------------------

export type BannerSeverity = "medium" | "high" | "critical";

export interface SupplyChainBannerProps {
  /** 현재 방문 중인 호스트 (예: "github.com") */
  host: string;
  /** 가장 심각한 incident 요약 */
  incident: IncidentMatchSummary;
  /** "자세히 보기" 클릭 → desktop deep-link 열기 */
  onView: () => void;
  /** "7일간 숨기기" 클릭 */
  onDismiss: () => void;
}

// ---------------------------------------------------------------------------
// 색상 토큰 (Shadow DOM — host :root CSS 변수 미상속)
// ---------------------------------------------------------------------------

// severity 별 색상 (light / dark 구분 불가 → ambient-safe fallback)
const SEVERITY_COLORS: Record<BannerSeverity, { bg: string; border: string; badge: string }> = {
  critical: {
    bg: "oklch(0.97 0.015 25)",
    border: "oklch(0.75 0.18 25)",
    badge: "oklch(0.5 0.22 25)",
  },
  high: {
    bg: "oklch(0.97 0.015 25)",
    border: "oklch(0.75 0.18 25)",
    badge: "oklch(0.5 0.22 25)",
  },
  medium: {
    bg: "oklch(0.98 0.014 65)",
    border: "oklch(0.78 0.16 65)",
    badge: "oklch(0.55 0.18 65)",
  },
};

const BANNER_CSS = `
:host { all: initial; }
.scb-banner {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 2147483647;
  padding: 10px 20px;
  display: flex;
  align-items: center;
  gap: 12px;
  font-family: system-ui, -apple-system, sans-serif;
  font-size: 13px;
  line-height: 1.4;
  color: oklch(0.16 0.04 250);
  box-sizing: border-box;
  flex-wrap: wrap;
}
@media (prefers-color-scheme: dark) {
  .scb-banner { color: oklch(0.96 0.012 250); }
}
.scb-icon {
  font-size: 16px;
  flex-shrink: 0;
}
.scb-body {
  flex: 1;
  min-width: 200px;
}
.scb-host {
  font-weight: 700;
}
.scb-badge {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 700;
  color: oklch(0.99 0.005 250);
  margin-left: 6px;
  vertical-align: middle;
}
.scb-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
  flex-wrap: wrap;
}
.scb-btn {
  border: none;
  border-radius: 6px;
  padding: 5px 12px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: opacity 0.15s;
  font-family: inherit;
  white-space: nowrap;
}
.scb-btn:hover { opacity: 0.85; }
.scb-btn:focus-visible {
  outline: 3px solid oklch(0.55 0.22 245);
  outline-offset: 2px;
}
.scb-btn-primary {
  background: oklch(0.42 0.2 245);
  color: oklch(0.985 0.005 250);
}
@media (prefers-color-scheme: dark) {
  .scb-btn-primary {
    background: oklch(0.62 0.2 245);
    color: oklch(0.99 0.005 250);
  }
}
.scb-btn-ghost {
  background: transparent;
  color: oklch(0.42 0.05 250);
  border: 1px solid oklch(0.7 0.03 250);
}
@media (prefers-color-scheme: dark) {
  .scb-btn-ghost {
    color: oklch(0.7 0.03 250);
    border-color: oklch(0.5 0.04 250);
  }
}
`;

// ---------------------------------------------------------------------------
// severity 표시 헬퍼
// ---------------------------------------------------------------------------

function normalizeSeverity(s: IncidentMatchSummary["severity"]): BannerSeverity | null {
  if (s === "critical" || s === "high" || s === "medium") return s;
  // low / info → banner 미표시 (defensive)
  return null;
}

function severityLabel(s: BannerSeverity): string {
  switch (s) {
    case "critical":
      return "CRITICAL";
    case "high":
      return "HIGH";
    case "medium":
      return "MEDIUM";
  }
}

// published_at → "N일 전" 텍스트
function daysAgoText(publishedAt: number | null): string {
  if (publishedAt === null) return "";
  const diffMs = Date.now() - publishedAt;
  const days = Math.floor(diffMs / (24 * 3600 * 1000));
  if (days < 1) return "오늘";
  return `${days}일 전`;
}

// ---------------------------------------------------------------------------
// SupplyChainBanner 컴포넌트
// ---------------------------------------------------------------------------

export function SupplyChainBanner({ host, incident, onView, onDismiss }: SupplyChainBannerProps) {
  const severity = normalizeSeverity(incident.severity);
  // LOW/INFO 는 defensive skip — 백엔드에서 이미 필터됐어야 하지만 방어적 처리
  if (severity === null) return null;

  const colors = SEVERITY_COLORS[severity];
  const ago = daysAgoText(incident.published_at);

  const bannerStyle: React.CSSProperties = {
    background: colors.bg,
    borderBottom: `2px solid ${colors.border}`,
  };

  const badgeStyle: React.CSSProperties = {
    background: colors.badge,
  };

  return (
    <>
      <style>{BANNER_CSS}</style>
      <div
        className="scb-banner"
        style={bannerStyle}
        role="alert"
        aria-label={`보안 사고: ${host}`}
      >
        <span className="scb-icon" aria-hidden="true">
          ⚠
        </span>
        <div className="scb-body">
          <span className="scb-host">{host}</span>
          {ago && ` 이(가) ${ago} 보안 사고가 보고됐습니다`}
          {!ago && " 에서 보안 사고가 보고됐습니다"}
          {incident.title && ` — ${incident.title}`}
          {". 비밀번호 변경 권장."}
          <span className="scb-badge" style={badgeStyle} aria-label={`심각도: ${severity}`}>
            {severityLabel(severity)}
          </span>
        </div>
        <div className="scb-actions">
          <button
            className="scb-btn scb-btn-primary"
            type="button"
            onClick={onView}
            aria-label="자세히 보기"
          >
            자세히 보기
          </button>
          <button
            className="scb-btn scb-btn-ghost"
            type="button"
            onClick={onDismiss}
            aria-label="7일간 숨기기"
          >
            7일간 숨기기
          </button>
        </div>
      </div>
    </>
  );
}
