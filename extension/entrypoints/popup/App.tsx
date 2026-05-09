/**
 * @file App.tsx
 * @license AGPL-3.0-or-later
 *
 * Popup 루트 컴포넌트 — ThemeProvider + Tab 기반 라우팅.
 *
 * Phase A6:
 *   - ThemeProvider (light/dark/system + localStorage/chrome.storage 동기화)
 *   - 4개 Tab: Pairing / Credentials / Save / Settings
 *   - 테마 토글 버튼 (상단 우측)
 *   - 빈 상태 각 placeholder 컴포넌트 표시
 *
 * MV3 popup 크기: max-width 400px × max-height 600px (body 설정)
 *
 * F.2 Spec:
 *   - 디자인 토큰만 사용 (hex 하드코딩 ❌)
 *   - prefers-reduced-motion 존중 (globals.css 에서 처리)
 *   - 키보드 fully accessible (Radix Tabs 자동 ARIA)
 */

import React, { useEffect, useState } from "react";
import type { CredentialKind } from "@secretbank/shared";
import { I18N_KEYS } from "@secretbank/shared";
import { ThemeProvider, useTheme } from "../../components/theme/theme-provider";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../../components/ui/tabs";
import PairingDialog from "./PairingDialog";
import CredentialList from "./CredentialList";
import SaveDialog from "./SaveDialog";
import Settings from "./Settings";
import { t } from "../../lib/i18n";
import { getMcpOptInCache } from "../../lib/storage";
import { NMClient } from "../../lib/nm-client";

// ── 테마 토글 버튼 (sun/moon 아이콘) ──────────────────────────────────────────
function ThemeToggleButton() {
  const { theme, setTheme } = useTheme();

  // 현재 테마에 따른 다음 토글 대상
  const nextTheme = theme === "dark" ? "light" : "dark";
  // 토글 아이콘 (system 모드에서도 light ↔ dark 로 전환)
  const icon = theme === "dark" ? "☀️" : "🌙";

  return (
    <button
      aria-label={t(I18N_KEYS.POPUP_THEME_TOGGLE)}
      onClick={() => setTheme(nextTheme)}
      style={{
        background: "none",
        border: "none",
        cursor: "pointer",
        padding: "0.25rem",
        fontSize: "1rem",
        lineHeight: 1,
        borderRadius: "var(--radius-sm)",
        color: "var(--color-muted-foreground)",
        // hover 효과는 CSS 클래스 없이 인라인 제한 — Tailwind 불필요
        transition: "color 150ms",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      title={t(I18N_KEYS.POPUP_THEME_TOGGLE)}
    >
      <span role="img" aria-hidden="true">
        {icon}
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// G-4-2: MCP 활성 인디케이터 (opt-in ON 시만 표시)
// ---------------------------------------------------------------------------

/**
 * MCP 컨텍스트 push 활성 인디케이터.
 *
 * 마운트 시 getMcpOptInCache() 로 캐시 조회,
 * cache miss 시 ext_settings_get_mcp_opt_in RPC 호출 (세션 토큰 없으면 skip).
 * 클릭 시 Settings 탭으로 이동.
 */
interface McpIndicatorProps {
  onClickSettings: () => void;
}

function McpActiveIndicator({ onClickSettings }: McpIndicatorProps) {
  const [mcpActive, setMcpActive] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;

    async function fetchOptIn() {
      // 1. 캐시 먼저 확인
      const cached = await getMcpOptInCache();
      if (cached !== null) {
        if (!cancelled) setMcpActive(cached);
        return;
      }

      // 2. cache miss → RPC 호출 (세션 토큰 필요)
      try {
        const { getSessionToken } = await import("../../lib/storage.js");
        const session = await getSessionToken();
        if (session === null) return;

        const nm = new NMClient();
        await nm.connect();
        const resp = await nm.extSettingsGetMcpOptIn(session.token);
        nm.disconnect();

        if (!cancelled && resp.ok) {
          setMcpActive(resp.enabled);
          // 결과를 캐시에 저장 (5분)
          const { setMcpOptInCache } = await import("../../lib/storage.js");
          await setMcpOptInCache(resp.enabled);
        }
      } catch {
        // 연결 실패 / RPC 오류 → 인디케이터 숨김 (fail-safe)
      }
    }

    void fetchOptIn();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!mcpActive) return null;

  return (
    <button
      aria-label={t(I18N_KEYS.MCP_CONTEXT_INDICATOR)}
      title={t(I18N_KEYS.MCP_CONTEXT_INDICATOR)}
      onClick={onClickSettings}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.25rem",
        background: "none",
        border: "none",
        cursor: "pointer",
        padding: "0.1875rem 0.375rem",
        borderRadius: "9999px",
        fontSize: "0.6875rem",
        fontWeight: 600,
        lineHeight: 1,
        color: "var(--color-primary)",
        // 녹색 점 표시는 ::before 대신 인라인 dot span 으로 구현
        transition: "opacity 150ms",
      }}
    >
      {/* 녹색 활성 점 */}
      <span
        aria-hidden="true"
        style={{
          display: "inline-block",
          width: "0.4375rem",
          height: "0.4375rem",
          borderRadius: "9999px",
          background: "oklch(65% 0.22 142)", // 녹색 (design token 없는 경우 oklch 직접 사용)
          flexShrink: 0,
        }}
      />
      <span>MCP</span>
    </button>
  );
}

// ── 내부 앱 (ThemeProvider 내부에서만 useTheme 호출 가능) ─────────────────────
function AppInner() {
  // @secretbank/shared 타입 사용 검증 (A2 DoD)
  const _kind: CredentialKind = "password";
  void _kind;

  // G-4-2: Settings 탭으로 이동을 위한 상태
  const [activeTab, setActiveTab] = useState<string>("pairing");

  return (
    // MV3 popup 크기: max 400×600px. body min-width 는 globals.css 에서 320px.
    <div
      style={{
        width: "400px",
        maxWidth: "400px",
        minHeight: "480px",
        maxHeight: "600px",
        backgroundColor: "var(--color-background)",
        color: "var(--color-foreground)",
        fontFamily: "var(--font-sans)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* 헤더 영역 */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0.75rem 1rem 0.5rem",
          borderBottom: "1px solid var(--color-border)",
          flexShrink: 0,
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: "0.9375rem",
            fontWeight: 700,
            color: "var(--color-primary)",
            letterSpacing: "-0.01em",
          }}
        >
          {t(I18N_KEYS.POPUP_TITLE)}
        </h1>
        {/* 우상단: MCP 인디케이터 + 테마 토글 */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
          <McpActiveIndicator onClickSettings={() => setActiveTab("settings")} />
          <ThemeToggleButton />
        </div>
      </header>

      {/* Tab 라우팅 영역 */}
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* TabsList — 상단 탭 네비게이션 */}
        <TabsList
          style={{
            margin: "0.5rem 0.75rem 0",
            flexShrink: 0,
          }}
          // Radix Tabs 는 Arrow key 로 탭 전환을 자동 처리한다
          aria-label="Popup navigation"
        >
          <TabsTrigger value="pairing">{t(I18N_KEYS.POPUP_TABS_PAIRING)}</TabsTrigger>
          <TabsTrigger value="credentials">{t(I18N_KEYS.POPUP_TABS_CREDENTIALS)}</TabsTrigger>
          <TabsTrigger value="save">{t(I18N_KEYS.POPUP_TABS_SAVE)}</TabsTrigger>
          <TabsTrigger value="settings">{t(I18N_KEYS.POPUP_TABS_SETTINGS)}</TabsTrigger>
        </TabsList>

        {/* TabsContent — 각 화면 placeholder */}
        <div
          style={{
            flex: 1,
            overflow: "auto",
          }}
        >
          <TabsContent value="pairing">
            <PairingDialog />
          </TabsContent>
          <TabsContent value="credentials">
            <CredentialList />
          </TabsContent>
          <TabsContent value="save">
            <SaveDialog />
          </TabsContent>
          <TabsContent value="settings">
            <Settings />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

// ── 루트 App — ThemeProvider 로 감싼다 ───────────────────────────────────────
export default function App() {
  return (
    <ThemeProvider defaultTheme="system" storageKey="secretbank-extension-theme">
      <AppInner />
    </ThemeProvider>
  );
}
