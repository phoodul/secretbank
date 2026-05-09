// Secretbank Extension — Popup App (Phase A1 골격)
// 이 파일은 WXT popup entrypoint 의 루트 컴포넌트
// Phase A1: 빈 셸 동작 확인용 최소 UI
// Phase A5: @wxt-dev/i18n t() 통합 — 1개 문자열을 4 lang 번역으로 표시

import React from "react";
import type { CredentialKind } from "@secretbank/shared";
import { I18N_KEYS } from "@secretbank/shared";
import { Button } from "../../components/ui/button";
import { t } from "../../lib/i18n";

export default function App() {
  // @secretbank/shared 타입 사용 검증 (A2 DoD — 런타임 동작 확인)
  const _kind: CredentialKind = "password";
  void _kind;

  return (
    // F.2 Spec: 배경/전경색은 CSS 변수 토큰 사용
    <div
      style={{
        minWidth: "320px",
        minHeight: "480px",
        backgroundColor: "var(--color-background)",
        color: "var(--color-foreground)",
        padding: "1.5rem",
        fontFamily: "var(--font-sans)",
        display: "flex",
        flexDirection: "column",
        gap: "1rem",
        alignItems: "flex-start",
      }}
    >
      {/* A5: popup.title 을 t() 로 표시 — 4 lang 모두 browser.i18n.getMessage 로 resolve */}
      <h1
        style={{
          fontSize: "1.125rem",
          fontWeight: 600,
          color: "var(--color-foreground)",
          margin: 0,
        }}
      >
        {t(I18N_KEYS.POPUP_TITLE)}
      </h1>
      {/* A5: popup.greeting 을 t() 로 표시 */}
      <p
        style={{
          fontSize: "0.875rem",
          color: "var(--color-foreground)",
          margin: 0,
          opacity: 0.75,
        }}
      >
        {t(I18N_KEYS.POPUP_GREETING)}
      </p>
      {/* Phase A1 골격 확인용 버튼 */}
      <Button>{t(I18N_KEYS.PAIRING_START)}</Button>
    </div>
  );
}
