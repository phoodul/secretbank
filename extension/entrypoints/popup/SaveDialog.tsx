/**
 * @file SaveDialog.tsx
 * @license AGPL-3.0-or-later
 *
 * Phase A6 placeholder — 감지된 크리덴셜 저장 다이얼로그 화면.
 * 실제 구현은 Phase D (content script 감지 + 저장 흐름) 에서 진행.
 *
 * F.2 Spec:
 *   - 디자인 토큰만 사용 (hex 하드코딩 ❌)
 *   - 빈 상태에 "준비 중" 메시지 + Phase 안내
 */

import React from "react";
import { t } from "../../lib/i18n";
import { I18N_KEYS } from "@secretbank/shared";

export default function SaveDialog() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "0.75rem",
        padding: "2rem 1.5rem",
        textAlign: "center",
        color: "var(--color-foreground)",
      }}
    >
      {/* 아이콘 영역 */}
      <div
        aria-hidden="true"
        style={{
          fontSize: "2rem",
          lineHeight: 1,
          color: "var(--color-primary)",
        }}
      >
        💾
      </div>
      {/* 제목 */}
      <p
        style={{
          margin: 0,
          fontWeight: 600,
          fontSize: "0.875rem",
          color: "var(--color-foreground)",
        }}
      >
        {t(I18N_KEYS.POPUP_TABS_SAVE)}
      </p>
      {/* placeholder 메시지 */}
      <p
        style={{
          margin: 0,
          fontSize: "0.75rem",
          color: "var(--color-muted-foreground)",
          lineHeight: 1.5,
        }}
      >
        {t(I18N_KEYS.POPUP_PLACEHOLDER_SAVE)}
      </p>
    </div>
  );
}
