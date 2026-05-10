// SPDX-License-Identifier: AGPL-3.0-or-later
//
// extension/components/CredentialCard.tsx — M24-E Phase E-4, G-1-2
//
// Popup credential 카드 컴포넌트.
//
// 표시 정보: Site Logo + issuer 이름 + domain + username(선택).
// password ❌ — 카드는 표시용 최소 정보만. T-CRED-1.
//
// autofill 버튼 클릭: onAutofill() → caller 가 활성 탭 content script 에 메시지 전송.
// 키보드 접근성: Tab navigation, Enter = autofill.
// hover 시에만 actions 버튼 표시 (compact UI).
//
// G-1-2 추가:
//   - hover 200ms delay → MiniGraph mount (실수 hover 차단)
//   - hover 해제 시 MiniGraph unmount
//   - 데이터 fetching: loading / error / ready
//   - 클릭 시 deep-link (openSecretbankDeepLink)

import React, { useEffect, useRef, useState } from "react";
import { getSiteLogo, type SiteLogoResult } from "../lib/site-logo.js";
import { MiniGraph } from "./MiniGraph.js";
import { openSecretbankDeepLink } from "../lib/deep-link.js";
import type { CredentialMiniGraph } from "@secretbank/shared";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface CredentialCardProps {
  id: string;
  issuer: string;
  domain: string;
  username?: string;
  onAutofill: () => void;
  onCopy: (field: "username" | "password") => void;
  /**
   * G-1-2: mini-graph 데이터 fetcher.
   * caller 가 nm-client.graphForCredential 래퍼로 주입 (popup 레이어 책임 분리).
   * undefined 이면 mini-graph 기능 비활성.
   */
  onFetchMiniGraph?: () => Promise<CredentialMiniGraph>;
}

// ---------------------------------------------------------------------------
// 인라인 CSS (popup Shadow DOM 바깥 — Tailwind 없이 CSS vars 사용)
// ---------------------------------------------------------------------------

const CARD_CSS = `
.cred-card {
  display: flex;
  flex-direction: column;
  gap: 0;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--color-border, oklch(0.88 0.01 264));
  background: var(--color-card, oklch(0.99 0.005 264));
  cursor: default;
  position: relative;
  transition: box-shadow 120ms, border-color 120ms;
  outline: none;
}
.cred-card:focus-within,
.cred-card:hover {
  border-color: var(--color-primary, oklch(0.5 0.18 264));
  box-shadow: 0 0 0 2px oklch(0.5 0.18 264 / 0.15);
}
/* 상단 행: Logo + 텍스트 + 액션 */
.cred-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
/* mini-graph 로딩 스켈레톤 */
.cred-minigraph-loading {
  margin-top: 8px;
  height: 110px;
  border-radius: 6px;
  background: var(--color-muted, oklch(0.94 0.01 264));
  animation: cred-pulse 1.2s ease-in-out infinite;
}
@keyframes cred-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
/* logo */
.cred-logo-wrap {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border-radius: 6px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: oklch(0.94 0.01 264);
}
.cred-logo-img {
  width: 32px;
  height: 32px;
  object-fit: contain;
}
.cred-logo-letter {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 700;
  color: #fff;
  border-radius: 6px;
}
/* info */
.cred-info {
  flex: 1;
  min-width: 0;
}
.cred-issuer {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-foreground, oklch(0.2 0.01 264));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cred-domain {
  font-size: 11px;
  color: var(--color-muted-foreground, oklch(0.5 0.01 264));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 1px;
}
.cred-username {
  font-size: 11px;
  color: var(--color-muted-foreground, oklch(0.5 0.01 264));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 1px;
}
/* actions — hover + focus-within 시 완전 불투명으로 전환. pointer-events 는 항상 활성. */
.cred-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 120ms;
}
.cred-card:hover .cred-actions,
.cred-card:focus-within .cred-actions {
  opacity: 1;
}
.cred-btn {
  border: none;
  border-radius: 5px;
  padding: 4px 8px;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  font-family: inherit;
  transition: opacity 100ms, background 100ms;
}
.cred-btn:hover { opacity: 0.8; }
.cred-btn:focus-visible {
  outline: 2px solid var(--color-primary, oklch(0.5 0.18 264));
  outline-offset: 1px;
}
.cred-btn-primary {
  background: var(--color-primary, oklch(0.5 0.18 264));
  color: var(--color-primary-foreground, oklch(0.98 0.005 264));
}
.cred-btn-ghost {
  background: oklch(0.93 0.01 264 / 0.7);
  color: var(--color-foreground, oklch(0.2 0.01 264));
}
@media (prefers-color-scheme: dark) {
  .cred-card {
    background: var(--color-card, oklch(0.18 0.01 264));
    border-color: var(--color-border, oklch(0.3 0.01 264));
  }
  .cred-logo-wrap { background: oklch(0.25 0.01 264); }
  .cred-issuer { color: var(--color-foreground, oklch(0.9 0.005 264)); }
  .cred-domain,
  .cred-username { color: var(--color-muted-foreground, oklch(0.6 0.01 264)); }
  .cred-btn-ghost {
    background: oklch(0.28 0.01 264 / 0.8);
    color: oklch(0.85 0.01 264);
  }
}
`;

// ---------------------------------------------------------------------------
// SiteLogo 서브컴포넌트
// ---------------------------------------------------------------------------

function SiteLogo({ domain }: { domain: string }) {
  const [logo, setLogo] = useState<SiteLogoResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (domain) {
      getSiteLogo(domain).then((result) => {
        if (!cancelled) setLogo(result);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [domain]);

  if (!logo) {
    // 로딩 중: 빈 회색 박스
    return <div className="cred-logo-wrap" aria-hidden="true" />;
  }

  if (logo.kind === "bundled" || logo.kind === "remote") {
    return (
      <div className="cred-logo-wrap" aria-hidden="true">
        <img className="cred-logo-img" src={logo.url} alt="" />
      </div>
    );
  }

  // letter fallback
  return (
    <div className="cred-logo-letter" style={{ background: logo.bg }} aria-hidden="true">
      {logo.letter}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CredentialCard 메인 컴포넌트
// ---------------------------------------------------------------------------

export function CredentialCard({
  id,
  issuer,
  domain,
  username,
  onAutofill,
  onCopy,
  onFetchMiniGraph,
}: CredentialCardProps) {
  // ── G-1-2: hover 200ms delay + MiniGraph 상태 ────────────────────────────────
  const [miniGraphStatus, setMiniGraphStatus] = useState<"hidden" | "loading" | "error" | "ready">(
    "hidden",
  );
  const [miniGraphData, setMiniGraphData] = useState<CredentialMiniGraph | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef(false);

  // 컴포넌트 언마운트 시 타이머 + abort 정리
  useEffect(() => {
    return () => {
      if (hoverTimerRef.current !== null) {
        clearTimeout(hoverTimerRef.current);
      }
      abortRef.current = true;
    };
  }, []);

  function handleMouseEnter() {
    if (!onFetchMiniGraph) return;
    // 이미 ready 상태이면 재요청 불필요
    if (miniGraphStatus === "ready") return;

    abortRef.current = false;
    hoverTimerRef.current = setTimeout(async () => {
      hoverTimerRef.current = null;
      if (abortRef.current) return;
      setMiniGraphStatus("loading");
      try {
        const data = await onFetchMiniGraph();
        if (abortRef.current) return;
        setMiniGraphData(data);
        setMiniGraphStatus("ready");
      } catch {
        if (!abortRef.current) setMiniGraphStatus("error");
      }
    }, 200);
  }

  function handleMouseLeave() {
    if (hoverTimerRef.current !== null) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    abortRef.current = true;
    // mini-graph 숨기기 (unmount 효과)
    setMiniGraphStatus("hidden");
    setMiniGraphData(null);
  }

  function handleDeepLink() {
    openSecretbankDeepLink("graph", { credential: id });
  }

  // ── Enter 키 = autofill ─────────────────────────────────────────────────────
  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      onAutofill();
    }
  }

  return (
    <>
      <style>{CARD_CSS}</style>
      <div
        className="cred-card"
        role="article"
        aria-label={`${issuer} credential`}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {/* 상단 행: Logo + 정보 + 액션 버튼 */}
        <div className="cred-row">
          {/* Site Logo */}
          <SiteLogo domain={domain} />

          {/* 텍스트 정보 */}
          <div className="cred-info">
            <div className="cred-issuer" title={issuer}>
              {issuer}
            </div>
            {domain && (
              <div className="cred-domain" title={domain}>
                {domain}
              </div>
            )}
            {username && (
              <div className="cred-username" title={username}>
                {username}
              </div>
            )}
          </div>

          {/* 액션 버튼 — hover / focus-within 시만 표시 */}
          <div className="cred-actions" aria-label="Actions">
            <button
              type="button"
              className="cred-btn cred-btn-primary"
              onClick={onAutofill}
              aria-label={`Autofill ${issuer}`}
              tabIndex={0}
            >
              Autofill
            </button>
            {username && (
              <button
                type="button"
                className="cred-btn cred-btn-ghost"
                onClick={() => onCopy("username")}
                aria-label="Copy username"
                tabIndex={0}
              >
                User
              </button>
            )}
            <button
              type="button"
              className="cred-btn cred-btn-ghost"
              onClick={() => onCopy("password")}
              aria-label="Copy password"
              tabIndex={0}
            >
              Pass
            </button>
          </div>
        </div>

        {/* G-1-2: Mini-graph 영역 — hover 200ms 후 표시 */}
        {miniGraphStatus === "loading" && (
          <div
            className="cred-minigraph-loading"
            aria-label="Loading graph"
            data-testid="minigraph-loading"
          />
        )}
        {miniGraphStatus === "ready" && miniGraphData !== null && (
          <MiniGraph data={miniGraphData} onClick={handleDeepLink} />
        )}
        {/* error: 조용히 fail — UI 변화 없음 */}
      </div>
    </>
  );
}
