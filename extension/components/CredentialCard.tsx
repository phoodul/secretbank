// SPDX-License-Identifier: AGPL-3.0-or-later
//
// extension/components/CredentialCard.tsx — M24-E Phase E-4
//
// Popup credential 카드 컴포넌트.
//
// 표시 정보: Site Logo + issuer 이름 + domain + username(선택).
// password ❌ — 카드는 표시용 최소 정보만. T-CRED-1.
//
// autofill 버튼 클릭: onAutofill() → caller 가 활성 탭 content script 에 메시지 전송.
// 키보드 접근성: Tab navigation, Enter = autofill.
// hover 시에만 actions 버튼 표시 (compact UI).

import React, { useEffect, useState } from "react";
import { getSiteLogo, type SiteLogoResult } from "../lib/site-logo.js";

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
}

// ---------------------------------------------------------------------------
// 인라인 CSS (popup Shadow DOM 바깥 — Tailwind 없이 CSS vars 사용)
// ---------------------------------------------------------------------------

const CARD_CSS = `
.cred-card {
  display: flex;
  align-items: center;
  gap: 10px;
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
    <div
      className="cred-logo-letter"
      style={{ background: logo.bg }}
      aria-hidden="true"
    >
      {logo.letter}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CredentialCard 메인 컴포넌트
// ---------------------------------------------------------------------------

export function CredentialCard({
  id: _id,
  issuer,
  domain,
  username,
  onAutofill,
  onCopy,
}: CredentialCardProps) {
  // Enter 키 = autofill (카드 자체에 tabIndex 부여)
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
      >
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
    </>
  );
}
