// SPDX-License-Identifier: AGPL-3.0-or-later
//
// extension/components/BlastRadiusPreviewCard.tsx — M24-E Phase G-3-2
//
// "이 변경이 N개 항목에 영향" inline 카드.
// SaveBanner kind=update 분기 에서 inline 으로 삽입.
// T3: SaveBanner 의 closed shadow DOM 안에서 렌더 — host 페이지 JS/CSS 침범 차단.
//
// 보안:
//   - items 는 kind/label/status 만 — credential plaintext ❌
//   - onViewDetails → deep-link (credential_id, not plaintext)

import React from "react";
import type { BlastRadiusItem } from "@secretbank/shared";

// ---------------------------------------------------------------------------
// 공개 타입
// ---------------------------------------------------------------------------

export interface BlastRadiusPreviewCardProps {
  items: BlastRadiusItem[];
  total: number;
  hiddenCount: number;
  onViewDetails: () => void;
}

// ---------------------------------------------------------------------------
// 스타일 (inline — Shadow DOM 내 CSS 변수 미상속)
//
// severity 톤: amber (warning)
//   Light bg : oklch(0.98 0.014 65) — amber-50 근사
//   Light border: oklch(0.78 0.16 65) — amber-400 근사
//   Dark bg  : oklch(0.20 0.035 65)
//   Dark border: oklch(0.55 0.18 65)
// ---------------------------------------------------------------------------

const CARD_CSS = `
.sbr-card {
  margin-top: 10px;
  margin-bottom: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid oklch(0.78 0.16 65);
  background: oklch(0.98 0.014 65);
  font-family: system-ui, -apple-system, sans-serif;
  font-size: 13px;
  line-height: 1.5;
  color: oklch(0.16 0.04 250);
  box-sizing: border-box;
}
@media (prefers-color-scheme: dark) {
  .sbr-card {
    background: oklch(0.20 0.035 65);
    border-color: oklch(0.55 0.18 65);
    color: oklch(0.96 0.012 250);
  }
}
.sbr-title {
  font-weight: 700;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: oklch(0.55 0.18 65);
  margin-bottom: 6px;
}
@media (prefers-color-scheme: dark) {
  .sbr-title { color: oklch(0.72 0.18 65); }
}
.sbr-affects {
  font-size: 12px;
  margin-bottom: 8px;
  color: oklch(0.30 0.06 65);
}
@media (prefers-color-scheme: dark) {
  .sbr-affects { color: oklch(0.82 0.08 65); }
}
.sbr-items {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 8px;
}
.sbr-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 500;
  background: oklch(0.92 0.06 65);
  color: oklch(0.30 0.12 65);
  white-space: nowrap;
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
}
@media (prefers-color-scheme: dark) {
  .sbr-chip {
    background: oklch(0.28 0.05 65);
    color: oklch(0.88 0.10 65);
  }
}
.sbr-icon {
  flex-shrink: 0;
  font-style: normal;
}
.sbr-hidden {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 500;
  color: oklch(0.50 0.10 65);
  background: transparent;
  border: 1px dashed oklch(0.70 0.14 65);
}
@media (prefers-color-scheme: dark) {
  .sbr-hidden {
    color: oklch(0.72 0.12 65);
    border-color: oklch(0.55 0.14 65);
  }
}
.sbr-footer {
  display: flex;
  justify-content: flex-end;
}
.sbr-link {
  background: none;
  border: none;
  padding: 0;
  font-size: 12px;
  font-weight: 500;
  color: oklch(0.42 0.2 245);
  cursor: pointer;
  text-decoration: underline;
  font-family: inherit;
}
.sbr-link:hover { opacity: 0.8; }
.sbr-link:focus-visible {
  outline: 3px solid oklch(0.55 0.22 245);
  outline-offset: 2px;
  border-radius: 2px;
}
@media (prefers-color-scheme: dark) {
  .sbr-link { color: oklch(0.62 0.2 245); }
}
`;

// ---------------------------------------------------------------------------
// 아이콘 헬퍼 (Lucide 대신 inline SVG — shadow DOM / bundling 단순화)
// ---------------------------------------------------------------------------

function KindIcon({ kind }: { kind: BlastRadiusItem["kind"] }) {
  if (kind === "project") {
    // Folder icon
    return (
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="sbr-icon"
      >
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
      </svg>
    );
  }
  // deployment → Server icon
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="sbr-icon"
    >
      <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
      <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
      <line x1="6" y1="6" x2="6.01" y2="6" />
      <line x1="6" y1="18" x2="6.01" y2="18" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// BlastRadiusPreviewCard
// ---------------------------------------------------------------------------

export function BlastRadiusPreviewCard({
  items,
  total,
  hiddenCount,
  onViewDetails,
}: BlastRadiusPreviewCardProps) {
  // total=0 이면 렌더하지 않음 (caller 에서 이미 guard 하지만 defensive)
  if (total === 0) return null;

  return (
    <>
      <style>{CARD_CSS}</style>
      <div
        className="sbr-card"
        role="note"
        aria-label={`영향 범위: ${total}개 항목`}
        data-testid="blast-radius-card"
      >
        <div className="sbr-title">영향 범위 미리보기</div>
        <div className="sbr-affects">이 변경이 {total}개 항목에 영향:</div>
        <div className="sbr-items">
          {items.map((item, idx) => (
            <span key={idx} className="sbr-chip" title={item.label}>
              <KindIcon kind={item.kind} />
              {item.label}
            </span>
          ))}
          {hiddenCount > 0 && (
            <span className="sbr-hidden">+{hiddenCount}개 더</span>
          )}
        </div>
        <div className="sbr-footer">
          <button
            className="sbr-link"
            type="button"
            onClick={onViewDetails}
            aria-label="그래프에서 상세 보기"
          >
            그래프에서 보기 →
          </button>
        </div>
      </div>
    </>
  );
}
