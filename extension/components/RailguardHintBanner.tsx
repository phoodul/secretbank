// SPDX-License-Identifier: AGPL-3.0-or-later
//
// extension/components/RailguardHintBanner.tsx — M24-E Phase G-5
//
// AI 에디터 사이트 방문 시 표시되는 sidebar 고정 경고 banner.
// Closed Shadow DOM 안에서만 렌더됨 — host 페이지 JS/CSS 침범 차단.
//
// 위협 모델:
//   - Closed Shadow DOM (T3) — z-index: 2147483647, 페이지 우측 상단 고정
//   - amber severity 톤 (G-2-2 MEDIUM 색상 동일)
//   - RAILGUARD 룰 생성 클릭 → secretbank://railguard deep-link

import React from "react";

// ---------------------------------------------------------------------------
// 공개 타입
// ---------------------------------------------------------------------------

export interface RailguardHintBannerProps {
  /** 현재 방문 중인 AI 에디터 호스트 (예: "chatgpt.com") */
  host: string;
  /** "RAILGUARD 룰 생성" 클릭 → secretbank://railguard deep-link 열기 */
  onCreate: () => void;
  /** "이 도메인 1주 미표시" 클릭 */
  onDismiss: () => void;
}

// ---------------------------------------------------------------------------
// 색상 토큰 (Shadow DOM — host :root CSS 변수 미상속, amber severity)
// G-2-2 MEDIUM 색상과 동일 톤
// ---------------------------------------------------------------------------

const BANNER_BG = "oklch(0.98 0.014 65)";
const BANNER_BORDER = "oklch(0.78 0.16 65)";
const BADGE_BG = "oklch(0.55 0.18 65)";

const BANNER_CSS = `
:host { all: initial; }
.rhb-banner {
  position: fixed;
  top: 12px;
  right: 12px;
  z-index: 2147483647;
  max-width: 340px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  font-family: system-ui, -apple-system, sans-serif;
  font-size: 13px;
  line-height: 1.45;
  color: oklch(0.16 0.04 250);
  box-sizing: border-box;
  border-radius: 10px;
  border: 2px solid ${BANNER_BORDER};
  background: ${BANNER_BG};
  box-shadow: 0 4px 16px oklch(0 0 0 / 0.12);
}
@media (prefers-color-scheme: dark) {
  .rhb-banner {
    background: oklch(0.22 0.025 65);
    border-color: oklch(0.58 0.14 65);
    color: oklch(0.94 0.012 250);
    box-shadow: 0 4px 16px oklch(0 0 0 / 0.32);
  }
}
.rhb-header {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}
.rhb-icon {
  font-size: 15px;
  flex-shrink: 0;
  margin-top: 1px;
}
.rhb-body {
  flex: 1;
  font-size: 12.5px;
}
.rhb-badge {
  display: inline-block;
  padding: 1px 7px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 700;
  color: oklch(0.99 0.005 250);
  background: ${BADGE_BG};
  margin-bottom: 5px;
}
.rhb-text {
  margin: 0;
  font-size: 12.5px;
}
.rhb-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.rhb-btn {
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
.rhb-btn:hover { opacity: 0.85; }
.rhb-btn:focus-visible {
  outline: 3px solid oklch(0.55 0.22 245);
  outline-offset: 2px;
}
.rhb-btn-primary {
  background: oklch(0.58 0.18 65);
  color: oklch(0.985 0.005 250);
  flex: 1;
  min-width: 0;
  text-align: center;
}
@media (prefers-color-scheme: dark) {
  .rhb-btn-primary {
    background: oklch(0.68 0.16 65);
    color: oklch(0.99 0.005 250);
  }
}
.rhb-btn-ghost {
  background: transparent;
  color: oklch(0.42 0.05 250);
  border: 1px solid oklch(0.7 0.03 250);
  flex-shrink: 0;
}
@media (prefers-color-scheme: dark) {
  .rhb-btn-ghost {
    color: oklch(0.7 0.03 250);
    border-color: oklch(0.5 0.04 250);
  }
}
`;

// ---------------------------------------------------------------------------
// RailguardHintBanner 컴포넌트
// ---------------------------------------------------------------------------

export function RailguardHintBanner({ host, onCreate, onDismiss }: RailguardHintBannerProps) {
  return (
    <>
      <style>{BANNER_CSS}</style>
      <div
        className="rhb-banner"
        role="alert"
        aria-label={`RAILGUARD 경고: ${host}`}
      >
        <div className="rhb-header">
          <span className="rhb-icon" aria-hidden="true">⚠</span>
          <div className="rhb-body">
            <div className="rhb-badge" aria-label="AI 에디터 위험 경고">RAILGUARD</div>
            <p className="rhb-text">
              AI 에 API 키·비밀번호 입력 시 secretbank Kill Switch 적용 ❌. 키 노출 위험.
            </p>
          </div>
        </div>
        <div className="rhb-actions">
          <button
            className="rhb-btn rhb-btn-primary"
            type="button"
            onClick={onCreate}
            aria-label="RAILGUARD 룰 자동 생성"
          >
            RAILGUARD 룰 생성 →
          </button>
          <button
            className="rhb-btn rhb-btn-ghost"
            type="button"
            onClick={onDismiss}
            aria-label="이 도메인 1주일 미표시"
          >
            1주 숨기기
          </button>
        </div>
      </div>
    </>
  );
}
