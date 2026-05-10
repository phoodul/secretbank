/**
 * @file CredentialList.tsx
 * @license AGPL-3.0-or-later
 *
 * M24-E Phase E-4: Popup Credentials 탭 전체 구현.
 *
 * 기능:
 *   - 활성 탭 origin 추출 → 도메인 매칭 credential 우선 표시
 *   - 검색 필터 (issuer / domain / username fuzzy match)
 *   - vault locked 시 "Unlock vault on desktop" 안내 + 새로고침
 *   - 빈 상태: "No credentials saved" + "Open Secretbank" 버튼
 *   - autofill 버튼: 활성 탭 content script 에 C5 동일 메시지 전송
 *   - password copy: nm 통해 reveal (미구현 — password reveal 은 E-5 이후)
 *
 * 보안:
 *   - 카드는 issuer / domain / username 만 표시. password ❌ (T-CRED-1)
 *   - autofill = 사용자 명시적 click (자동 fill ❌)
 *   - 활성 탭 origin 만 검사 — 사용자가 신뢰하지 않은 탭 autofill ❌
 *
 * F.2 Spec:
 *   - 디자인 토큰만 사용 (hex 하드코딩 ❌)
 *   - 키보드 fully accessible
 */

import React, { useCallback, useEffect, useMemo, useReducer } from "react";
import type { CredentialListItem } from "@secretbank/shared";
import { NMClient } from "../../lib/nm-client";
import { getSessionToken } from "../../lib/storage";
import { CredentialCard } from "../../components/CredentialCard";

// ---------------------------------------------------------------------------
// 상태 머신
// ---------------------------------------------------------------------------

type Phase = "loading" | "locked" | "empty" | "ready" | "error";

interface State {
  phase: Phase;
  /** 전체 credential 목록 (도메인 필터 없는 전체) */
  items: CredentialListItem[];
  /** 활성 탭 origin (e.g. "github.com") */
  activeOrigin: string | null;
  /** 검색어 */
  query: string;
  errorMsg: string;
}

type Action =
  | { type: "LOADED"; items: CredentialListItem[]; activeOrigin: string | null }
  | { type: "LOCKED" }
  | { type: "ERROR"; msg: string }
  | { type: "SET_QUERY"; query: string }
  | { type: "RELOAD" };

function initState(): State {
  return {
    phase: "loading",
    items: [],
    activeOrigin: null,
    query: "",
    errorMsg: "",
  };
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "LOADED":
      return {
        ...state,
        phase: action.items.length === 0 ? "empty" : "ready",
        items: action.items,
        activeOrigin: action.activeOrigin,
        errorMsg: "",
      };
    case "LOCKED":
      return { ...state, phase: "locked", items: [], errorMsg: "" };
    case "ERROR":
      return { ...state, phase: "error", errorMsg: action.msg };
    case "SET_QUERY":
      return { ...state, query: action.query };
    case "RELOAD":
      return { ...initState() };
    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// 헬퍼 — 활성 탭 origin 추출
// ---------------------------------------------------------------------------

async function getActiveTabOrigin(): Promise<string | null> {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = tabs[0]?.url;
    if (!url) return null;
    const { hostname } = new URL(url);
    return hostname || null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// 헬퍼 — 도메인 우선순위 정렬
// 활성 탭 origin 을 포함하는 credential 을 상위로 올린다.
// ---------------------------------------------------------------------------

function sortByDomain(
  items: CredentialListItem[],
  activeOrigin: string | null,
): CredentialListItem[] {
  if (!activeOrigin) return items;
  const priority = items.filter((i) =>
    i.domain ? activeOrigin.includes(i.domain) || i.domain.includes(activeOrigin) : false,
  );
  const rest = items.filter((i) =>
    i.domain ? !activeOrigin.includes(i.domain) && !i.domain.includes(activeOrigin) : true,
  );
  return [...priority, ...rest];
}

// ---------------------------------------------------------------------------
// 헬퍼 — 검색 필터 (대소문자 무시, issuer/domain/username 모두 검색)
// ---------------------------------------------------------------------------

function filterByQuery(items: CredentialListItem[], query: string): CredentialListItem[] {
  if (!query.trim()) return items;
  const q = query.trim().toLowerCase();
  return items.filter(
    (i) =>
      i.issuer.toLowerCase().includes(q) ||
      i.domain.toLowerCase().includes(q) ||
      (i.username?.toLowerCase().includes(q) ?? false),
  );
}

// ---------------------------------------------------------------------------
// 헬퍼 — autofill 메시지를 활성 탭 content script 에 전송
// C5 autofill-trigger 와 동일 메시지 형태.
// ---------------------------------------------------------------------------

async function sendAutofillToActiveTab(credentialId: string): Promise<void> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tabId = tabs[0]?.id;
  if (!tabId) return;
  await chrome.tabs.sendMessage(tabId, {
    type: "autofill_credential",
    credential_id: credentialId,
  });
}

// ---------------------------------------------------------------------------
// CredentialList 컴포넌트
// ---------------------------------------------------------------------------

const LIST_CSS = `
.cl-root {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--color-background);
  color: var(--color-foreground);
  font-family: var(--font-sans, system-ui, sans-serif);
}
.cl-search-wrap {
  padding: 8px 12px 4px;
  flex-shrink: 0;
}
.cl-search {
  width: 100%;
  box-sizing: border-box;
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid var(--color-border, oklch(0.88 0.01 264));
  background: var(--color-background);
  color: var(--color-foreground);
  font-size: 12px;
  font-family: inherit;
  outline: none;
  transition: border-color 120ms;
}
.cl-search:focus {
  border-color: var(--color-primary, oklch(0.5 0.18 264));
}
.cl-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px 8px 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.cl-section-label {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--color-muted-foreground, oklch(0.5 0.01 264));
  padding: 4px 4px 2px;
}
/* 상태 화면 */
.cl-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 2rem 1.5rem;
  text-align: center;
  flex: 1;
}
.cl-state-icon {
  font-size: 2rem;
  line-height: 1;
  color: var(--color-primary);
}
.cl-state-title {
  font-weight: 600;
  font-size: 0.875rem;
  margin: 0;
  color: var(--color-foreground);
}
.cl-state-msg {
  font-size: 0.75rem;
  color: var(--color-muted-foreground);
  margin: 0;
  line-height: 1.5;
}
.cl-action-btn {
  padding: 7px 14px;
  border-radius: 7px;
  border: none;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  font-family: inherit;
  background: var(--color-primary, oklch(0.5 0.18 264));
  color: var(--color-primary-foreground, oklch(0.98 0.005 264));
  transition: opacity 120ms;
}
.cl-action-btn:hover { opacity: 0.85; }
.cl-action-btn:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}
.cl-action-btn-ghost {
  background: transparent;
  color: var(--color-primary, oklch(0.5 0.18 264));
  text-decoration: underline;
  text-underline-offset: 2px;
}
`;

export default function CredentialList() {
  const [state, dispatch] = useReducer(reducer, undefined, initState);

  // 데이터 로드
  const load = useCallback(async () => {
    // 1. 세션 토큰 확인
    const session = await getSessionToken();
    if (!session) {
      dispatch({ type: "LOCKED" });
      return;
    }

    // 2. 활성 탭 origin 추출
    const activeOrigin = await getActiveTabOrigin();

    // 3. NMClient 연결 + 목록 조회
    const client = new NMClient();
    try {
      await client.connect();
      const resp = await client.credentialListVisible(undefined, session.token);
      client.disconnect();

      if (!resp.ok || resp.error === "vault_locked") {
        dispatch({ type: "LOCKED" });
        return;
      }

      const items: CredentialListItem[] = resp.items ?? [];
      dispatch({ type: "LOADED", items, activeOrigin });
    } catch {
      client.disconnect();
      dispatch({ type: "LOCKED" });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // 검색 + 도메인 우선 정렬 결과
  const displayed = useMemo(() => {
    const sorted = sortByDomain(state.items, state.activeOrigin);
    return filterByQuery(sorted, state.query);
  }, [state.items, state.activeOrigin, state.query]);

  // 도메인 매칭 credential 개수 (섹션 구분용)
  const matchCount = useMemo(() => {
    if (!state.activeOrigin) return 0;
    return displayed.filter(
      (i) =>
        i.domain &&
        (state.activeOrigin!.includes(i.domain) || i.domain.includes(state.activeOrigin!)),
    ).length;
  }, [displayed, state.activeOrigin]);

  // autofill 핸들러
  async function handleAutofill(credentialId: string) {
    try {
      await sendAutofillToActiveTab(credentialId);
      // popup 닫기 (autofill 완료 신호)
      window.close();
    } catch {
      // content script 없는 탭 (about:blank 등) — 무시
    }
  }

  // copy 핸들러 (password는 reveal 미구현 — E-5 이후)
  async function handleCopy(field: "username" | "password", item: CredentialListItem) {
    if (field === "username" && item.username) {
      await navigator.clipboard.writeText(item.username).catch(() => {});
    }
    // password copy: credential_id 를 reveal 하여 클립보드 복사 (E-5 이후 구현)
    // 현재는 no-op
  }

  // Open Secretbank 데스크톱 앱 — 새 탭 열기
  function openDesktopApp() {
    chrome.tabs.create({ url: "https://secretbank.app/guide.html" });
    window.close();
  }

  // ── 렌더 분기 ──────────────────────────────────────────────────────────────

  if (state.phase === "loading") {
    return (
      <>
        <style>{LIST_CSS}</style>
        <div className="cl-root">
          <div className="cl-state">
            <div className="cl-state-icon" aria-hidden="true">
              ⏳
            </div>
            <p className="cl-state-title">Loading…</p>
          </div>
        </div>
      </>
    );
  }

  if (state.phase === "locked") {
    return (
      <>
        <style>{LIST_CSS}</style>
        <div className="cl-root">
          <div className="cl-state">
            <div className="cl-state-icon" aria-hidden="true">
              🔒
            </div>
            <p className="cl-state-title">Vault is locked</p>
            <p className="cl-state-msg">
              Open the Secretbank desktop app and unlock your vault, then refresh.
            </p>
            <button
              type="button"
              className="cl-action-btn"
              onClick={() => dispatch({ type: "RELOAD" })}
            >
              Refresh
            </button>
          </div>
        </div>
      </>
    );
  }

  if (state.phase === "error") {
    return (
      <>
        <style>{LIST_CSS}</style>
        <div className="cl-root">
          <div className="cl-state">
            <div className="cl-state-icon" aria-hidden="true">
              ⚠️
            </div>
            <p className="cl-state-title">Connection error</p>
            <p className="cl-state-msg">{state.errorMsg}</p>
            <button
              type="button"
              className="cl-action-btn"
              onClick={() => {
                dispatch({ type: "RELOAD" });
                void load();
              }}
            >
              Retry
            </button>
          </div>
        </div>
      </>
    );
  }

  if (
    state.phase === "empty" ||
    (state.phase === "ready" && displayed.length === 0 && !state.query)
  ) {
    return (
      <>
        <style>{LIST_CSS}</style>
        <div className="cl-root">
          <div className="cl-state">
            <div className="cl-state-icon" aria-hidden="true">
              🗝️
            </div>
            <p className="cl-state-title">No credentials saved</p>
            <p className="cl-state-msg">Save a password from any website to see it here.</p>
            <button
              type="button"
              className="cl-action-btn cl-action-btn-ghost"
              onClick={openDesktopApp}
            >
              Open Secretbank
            </button>
          </div>
        </div>
      </>
    );
  }

  // ready — 카드 목록
  return (
    <>
      <style>{LIST_CSS}</style>
      <div className="cl-root">
        {/* 검색 인풋 */}
        <div className="cl-search-wrap">
          <input
            type="search"
            className="cl-search"
            placeholder="Search credentials…"
            aria-label="Search credentials"
            value={state.query}
            onChange={(e) => dispatch({ type: "SET_QUERY", query: e.target.value })}
          />
        </div>

        {/* 카드 목록 */}
        <div className="cl-list" role="list">
          {/* 검색 결과 없음 */}
          {displayed.length === 0 && state.query && (
            <div className="cl-state" style={{ flex: "none", padding: "1.5rem 1rem" }}>
              <p className="cl-state-msg">No results for "{state.query}"</p>
            </div>
          )}

          {/* 도메인 매칭 섹션 레이블 */}
          {matchCount > 0 && state.activeOrigin && !state.query && (
            <div className="cl-section-label" aria-hidden="true">
              {state.activeOrigin}
            </div>
          )}

          {displayed.map((item) => (
            <div key={item.credential_id} role="listitem">
              <CredentialCard
                id={item.credential_id}
                issuer={item.issuer}
                domain={item.domain}
                username={item.username}
                onAutofill={() => void handleAutofill(item.credential_id)}
                onCopy={(field) => void handleCopy(field, item)}
              />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
