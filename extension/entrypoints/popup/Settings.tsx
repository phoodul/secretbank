/**
 * @file Settings.tsx
 * @license AGPL-3.0-or-later
 *
 * B-7: Extension popup 설정 화면.
 *
 * Session timeout 설정을 표시하고, 변경은 데스크톱 앱에서 하도록 안내한다.
 * Tauri 앱이 source of truth — Extension 은 read-only 뷰.
 *
 * F.2 Spec:
 *   - 디자인 토큰만 사용 (hex 하드코딩 ❌)
 *   - prefers-reduced-motion 존중
 *   - 키보드 접근 가능
 *   - i18n 4 locale
 *   - 빈 상태 / 명확한 에러 처리
 */

import React, { useEffect, useState } from "react";
import { I18N_KEYS } from "@secretbank/shared";
import { t } from "../../lib/i18n";
import { NMClient } from "../../lib/nm-client";

// ---------------------------------------------------------------------------
// 타입 — Rust SessionTtlOption serde snake_case 와 일치
// ---------------------------------------------------------------------------

type SessionTtlOption = "mins30" | "hour1" | "hours4" | "hours8" | "until_lock";

interface SessionSettings {
  ttl: SessionTtlOption;
}

// ---------------------------------------------------------------------------
// TTL 옵션 레이블 매핑 (i18n 키)
// ---------------------------------------------------------------------------

const TTL_LABEL_KEYS: Record<SessionTtlOption, string> = {
  mins30: I18N_KEYS.SESSION_TTL_MINS30,
  hour1: I18N_KEYS.SESSION_TTL_HOUR1,
  hours4: I18N_KEYS.SESSION_TTL_HOURS4,
  hours8: I18N_KEYS.SESSION_TTL_HOURS8,
  until_lock: I18N_KEYS.SESSION_TTL_UNTIL_LOCK,
};

// ---------------------------------------------------------------------------
// NMClient 로 session settings 조회
// ---------------------------------------------------------------------------

async function fetchSessionSettings(): Promise<SessionSettings | null> {
  try {
    const client = new NMClient();
    await client.connect();
    // Native Messaging 을 통해 데스크톱에 설정 조회 요청
    // 현재 B-7 에서 NM 메시지 타입이 없으면 chrome.storage fallback
    // → 데스크톱 앱 연결 없이 chrome.storage 에서 캐시된 값 읽기
    client.disconnect();
    return null;
  } catch {
    return null;
  }
}

// chrome.storage.local 에서 캐시된 session settings 읽기
async function getCachedSettings(): Promise<SessionSettings | null> {
  try {
    const result = await chrome.storage.local.get("session_settings");
    const raw = result["session_settings"];
    if (!raw || typeof raw !== "object") return null;
    if (typeof raw.ttl !== "string") return null;
    return raw as SessionSettings;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// 컴포넌트
// ---------------------------------------------------------------------------

export default function Settings() {
  const [settings, setSettings] = useState<SessionSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    getCachedSettings()
      .then((cached) => {
        if (!cancelled) {
          setSettings(cached);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const currentLabel = settings != null ? t(TTL_LABEL_KEYS[settings.ttl]) : null;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "1rem",
        padding: "1.25rem 1rem",
        color: "var(--color-foreground)",
      }}
    >
      {/* ── 섹션: Session Timeout ── */}
      <section aria-labelledby="settings-session-heading">
        <h2
          id="settings-session-heading"
          style={{
            margin: "0 0 0.25rem",
            fontSize: "0.8125rem",
            fontWeight: 600,
            color: "var(--color-foreground)",
          }}
        >
          {t(I18N_KEYS.SESSION_SETTINGS_TITLE)}
        </h2>
        <p
          style={{
            margin: "0 0 0.75rem",
            fontSize: "0.6875rem",
            color: "var(--color-muted-foreground)",
            lineHeight: 1.5,
          }}
        >
          {t(I18N_KEYS.SESSION_TTL_DESCRIPTION)}
        </p>

        {/* 현재 TTL 표시 */}
        {loading ? (
          <div
            aria-busy="true"
            style={{
              height: "1.25rem",
              width: "8rem",
              borderRadius: "0.25rem",
              background: "var(--color-muted)",
              animation: "pulse 1.5s ease-in-out infinite",
            }}
          />
        ) : (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            {/* 현재 값 배지 */}
            <span
              style={{
                fontSize: "0.75rem",
                fontWeight: 500,
                padding: "0.125rem 0.5rem",
                borderRadius: "9999px",
                background: "var(--color-primary)",
                color: "var(--color-primary-foreground)",
              }}
            >
              {currentLabel ?? t(I18N_KEYS.SESSION_TTL_HOURS4)}
            </span>
          </div>
        )}
      </section>

      {/* ── 구분선 ── */}
      <hr
        style={{
          border: "none",
          borderTop: "1px solid var(--color-border)",
          margin: 0,
        }}
        aria-hidden="true"
      />

      {/* ── 안내: 데스크톱 앱에서 변경 ── */}
      <section aria-labelledby="settings-desktop-hint-heading">
        <p
          id="settings-desktop-hint-heading"
          style={{
            margin: 0,
            fontSize: "0.6875rem",
            color: "var(--color-muted-foreground)",
            lineHeight: 1.5,
            display: "flex",
            alignItems: "flex-start",
            gap: "0.375rem",
          }}
        >
          {/* 아이콘 */}
          <span aria-hidden="true" style={{ fontSize: "0.875rem", lineHeight: 1.4 }}>
            ℹ️
          </span>
          <span>
            {/* 설정 변경은 데스크톱 앱 Settings → Security → Extension Session 에서 */}
            To change the session timeout, open the <strong>Secretbank desktop app</strong> →
            Settings → Security → Extension Session.
          </span>
        </p>
      </section>
    </div>
  );
}
