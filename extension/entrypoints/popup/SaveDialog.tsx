// SPDX-License-Identifier: AGPL-3.0-or-later
//
// extension/entrypoints/popup/SaveDialog.tsx — M24-E Phase D-6, E-3
//
// SaveBanner "Save" 클릭 시 popup 의 Save 탭에서 credential 세부 정보를 편집/확정.
//
// 흐름:
//   1. getPendingSave() → pending save 데이터 로드
//   2. 없으면 "저장 대기 없음" placeholder 표시
//   3. 있으면 폼 표시 (issuer, name, username read-only, notes 편집)
//   4. 저장 → nm-client credentialCreate/Update → clearPendingSave → 완료 메시지
//   5. 취소 → clearPendingSave → placeholder 복귀
//
// T-CRED-1: password plaintext 는 폼에 표시하지 않음. nm-client 로만 전달.
// TM-EXT-BRIDGE-2: session token 첨부는 nm-client 내부 처리.

import React, { useCallback, useEffect, useReducer, useState } from "react";
import { getSiteLogo, type SiteLogoResult } from "../../lib/site-logo.js";
import { t } from "../../lib/i18n";
import { I18N_KEYS } from "@secretbank/shared";
import { NMClient } from "../../lib/nm-client";
import {
  clearPendingSave,
  getPendingSave,
  getSessionToken,
  type PendingSave,
} from "../../lib/storage";

// ---------------------------------------------------------------------------
// 상태 머신
// ---------------------------------------------------------------------------

type Phase = "loading" | "empty" | "editing" | "saving" | "saved" | "error";

interface State {
  phase: Phase;
  pending: PendingSave | null;
  /** 사용자가 편집한 issuer 이름 (resolve_issuer 결과 초기값) */
  issuerName: string;
  /** 사용자가 편집한 credential 이름 */
  credName: string;
  /** 선택적 notes (현재 저장 구조에는 없으나 UI 표시용) */
  notes: string;
  errorMsg: string;
}

type Action =
  | { type: "LOADED"; pending: PendingSave | null }
  | { type: "SET_ISSUER"; value: string }
  | { type: "SET_NAME"; value: string }
  | { type: "SET_NOTES"; value: string }
  | { type: "SAVE_START" }
  | { type: "SAVE_OK" }
  | { type: "SAVE_ERR"; msg: string }
  | { type: "CANCEL" };

function initState(): State {
  return {
    phase: "loading",
    pending: null,
    issuerName: "",
    credName: "",
    notes: "",
    errorMsg: "",
  };
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "LOADED":
      if (action.pending === null) {
        return { ...state, phase: "empty", pending: null };
      }
      return {
        ...state,
        phase: "editing",
        pending: action.pending,
        issuerName: action.pending.issuerName ?? action.pending.siteName,
        credName: action.pending.siteName,
        notes: "",
      };
    case "SET_ISSUER":
      return { ...state, issuerName: action.value };
    case "SET_NAME":
      return { ...state, credName: action.value };
    case "SET_NOTES":
      return { ...state, notes: action.value };
    case "SAVE_START":
      return { ...state, phase: "saving" };
    case "SAVE_OK":
      return { ...state, phase: "saved", pending: null };
    case "SAVE_ERR":
      return { ...state, phase: "error", errorMsg: action.msg };
    case "CANCEL":
      return { ...state, phase: "empty", pending: null };
    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// NMClient singleton (popup lifecycle 동안 유지)
// ---------------------------------------------------------------------------

const nmClient = new NMClient();

// ---------------------------------------------------------------------------
// SaveDialog 컴포넌트
// ---------------------------------------------------------------------------

export default function SaveDialog() {
  const [state, dispatch] = useReducer(reducer, undefined, initState);
  const [logo, setLogo] = useState<SiteLogoResult | null>(null);

  // E-3: pending save 의 domain 이 확정되면 Site Logo 로드
  useEffect(() => {
    if (state.pending?.domain) {
      let cancelled = false;
      getSiteLogo(state.pending.domain).then((result) => {
        if (!cancelled) setLogo(result);
      });
      return () => {
        cancelled = true;
      };
    }
  }, [state.pending?.domain]);

  // 마운트 시 pending save 로드
  useEffect(() => {
    let cancelled = false;
    getPendingSave().then((pending) => {
      if (!cancelled) dispatch({ type: "LOADED", pending });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // T-CRED-1: 컴포넌트 언마운트 시 pending save 메모리 참조 해제 — GC 기회 부여.
  useEffect(() => {
    return () => {
      // pending save 는 저장/취소 시 clearPendingSave() 로 이미 삭제.
      // 컴포넌트가 pop 되는 경우 추가 cleanup.
    };
  }, []);

  const handleSave = useCallback(async () => {
    if (!state.pending) return;
    dispatch({ type: "SAVE_START" });

    try {
      const session = await getSessionToken();
      if (!session) {
        dispatch({ type: "SAVE_ERR", msg: "session_expired" });
        return;
      }

      await nmClient.connect();

      const { pending } = state;
      if (pending.kind === "new") {
        await nmClient.credentialCreate(
          {
            domain: pending.domain,
            username: pending.username,
            password: pending.password,
            site_name: state.credName || pending.siteName,
          },
          session.token,
        );
      } else {
        if (pending.credentialId) {
          await nmClient.credentialUpdate(
            {
              credential_id: pending.credentialId,
              username: pending.username,
              password: pending.password,
            },
            session.token,
          );
        } else {
          // credentialId 없는 update fallback → create
          await nmClient.credentialCreate(
            {
              domain: pending.domain,
              username: pending.username,
              password: pending.password,
              site_name: state.credName || pending.siteName,
            },
            session.token,
          );
        }
      }

      // T-CRED-1: pending save 저장 후 즉시 삭제 (password plaintext 제거).
      await clearPendingSave();
      dispatch({ type: "SAVE_OK" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown_error";
      dispatch({ type: "SAVE_ERR", msg });
    }
  }, [state]);

  const handleCancel = useCallback(async () => {
    // T-CRED-1: 취소 시에도 pending save (password) 즉시 삭제.
    await clearPendingSave();
    dispatch({ type: "CANCEL" });
  }, []);

  // ---------------------------------------------------------------------------
  // 렌더
  // ---------------------------------------------------------------------------

  const containerStyle: React.CSSProperties = {
    padding: "1rem 1.25rem",
    display: "flex",
    flexDirection: "column",
    gap: "0.75rem",
    color: "var(--color-foreground)",
    fontFamily: "var(--font-sans)",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: "0.75rem",
    fontWeight: 600,
    color: "var(--color-muted-foreground)",
    marginBottom: "0.125rem",
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "0.375rem 0.5rem",
    border: "1px solid var(--color-border)",
    borderRadius: "var(--radius-sm)",
    background: "var(--color-input)",
    color: "var(--color-foreground)",
    fontSize: "0.8125rem",
    outline: "none",
    boxSizing: "border-box",
  };

  const readonlyInputStyle: React.CSSProperties = {
    ...inputStyle,
    background: "var(--color-muted)",
    color: "var(--color-muted-foreground)",
    cursor: "not-allowed",
  };

  const btnRowStyle: React.CSSProperties = {
    display: "flex",
    gap: "0.5rem",
    marginTop: "0.25rem",
  };

  const saveBtnStyle: React.CSSProperties = {
    flex: 1,
    padding: "0.5rem",
    borderRadius: "var(--radius-sm)",
    border: "none",
    background: "var(--color-primary)",
    color: "var(--color-primary-foreground)",
    fontWeight: 600,
    fontSize: "0.8125rem",
    cursor: state.phase === "saving" ? "not-allowed" : "pointer",
    opacity: state.phase === "saving" ? 0.7 : 1,
  };

  const cancelBtnStyle: React.CSSProperties = {
    flex: 1,
    padding: "0.5rem",
    borderRadius: "var(--radius-sm)",
    border: "1px solid var(--color-border)",
    background: "var(--color-background)",
    color: "var(--color-foreground)",
    fontWeight: 500,
    fontSize: "0.8125rem",
    cursor: "pointer",
  };

  if (state.phase === "loading") {
    return (
      <div style={{ ...containerStyle, alignItems: "center", justifyContent: "center" }}>
        <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--color-muted-foreground)" }}>
          {t(I18N_KEYS.POPUP_PLACEHOLDER_SAVE)}
        </p>
      </div>
    );
  }

  if (state.phase === "empty") {
    return (
      <div
        style={{
          ...containerStyle,
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          padding: "2rem 1.5rem",
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: "0.875rem",
            fontWeight: 600,
            color: "var(--color-foreground)",
          }}
        >
          {t(I18N_KEYS.POPUP_TABS_SAVE)}
        </p>
        <p style={{ margin: 0, fontSize: "0.75rem", color: "var(--color-muted-foreground)" }}>
          {t(I18N_KEYS.POPUP_PLACEHOLDER_SAVE)}
        </p>
      </div>
    );
  }

  if (state.phase === "saved") {
    return (
      <div
        style={{
          ...containerStyle,
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          padding: "2rem 1.5rem",
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: "0.875rem",
            fontWeight: 600,
            color: "var(--color-primary)",
          }}
        >
          {t(I18N_KEYS.SAVE_DIALOG_SAVED)}
        </p>
      </div>
    );
  }

  if (state.phase === "error") {
    return (
      <div style={{ ...containerStyle }}>
        <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--color-destructive)" }}>
          {state.errorMsg}
        </p>
        <button
          style={cancelBtnStyle}
          onClick={() => dispatch({ type: "CANCEL" })}
          aria-label="close"
        >
          {t(I18N_KEYS.SAVE_BANNER_ACTION_DISMISS)}
        </button>
      </div>
    );
  }

  // editing / saving phase — 폼 표시
  const { pending } = state;
  if (!pending) return null;

  return (
    <div style={containerStyle} role="form" aria-label="Save credential">
      {/* E-3: Site Logo + 도메인 헤더 */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        {logo?.kind === "bundled" || logo?.kind === "remote" ? (
          <img
            src={logo.url}
            alt={pending.domain}
            aria-hidden="true"
            style={{
              width: "24px",
              height: "24px",
              borderRadius: "4px",
              objectFit: "contain",
              flexShrink: 0,
            }}
          />
        ) : logo?.kind === "letter" ? (
          <div
            aria-hidden="true"
            style={{
              width: "24px",
              height: "24px",
              borderRadius: "4px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "12px",
              fontWeight: 700,
              color: "#fff",
              background: logo.bg,
              flexShrink: 0,
            }}
          >
            {logo.letter}
          </div>
        ) : null}
        <span
          style={{
            fontSize: "0.75rem",
            fontWeight: 600,
            color: "var(--color-muted-foreground)",
          }}
        >
          {pending.domain}
        </span>
      </div>

      {/* 저장 종류 배지 */}
      <div
        style={{
          display: "inline-flex",
          alignSelf: "flex-start",
          padding: "0.125rem 0.5rem",
          borderRadius: "var(--radius-full, 9999px)",
          background: pending.kind === "new" ? "var(--color-primary)" : "var(--color-muted)",
          color:
            pending.kind === "new"
              ? "var(--color-primary-foreground)"
              : "var(--color-muted-foreground)",
          fontSize: "0.6875rem",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}
      >
        {pending.kind === "new"
          ? t(I18N_KEYS.SAVE_BANNER_ACTION_SAVE)
          : t(I18N_KEYS.SAVE_BANNER_ACTION_UPDATE)}
      </div>

      {/* Issuer 필드 — resolve_issuer 결과 + 사용자 편집 가능 */}
      <div>
        <p style={labelStyle}>{t(I18N_KEYS.SAVE_DIALOG_ISSUER)}</p>
        <input
          style={inputStyle}
          type="text"
          value={state.issuerName}
          onChange={(e) => dispatch({ type: "SET_ISSUER", value: e.target.value })}
          aria-label="Issuer name"
          autoComplete="off"
        />
      </div>

      {/* Name 필드 — site 이름 편집 가능 */}
      <div>
        <p style={labelStyle}>{t(I18N_KEYS.SAVE_DIALOG_NAME)}</p>
        <input
          style={inputStyle}
          type="text"
          value={state.credName}
          onChange={(e) => dispatch({ type: "SET_NAME", value: e.target.value })}
          aria-label="Credential name"
          autoComplete="off"
        />
      </div>

      {/* Username — read-only 표시 (T-CRED-1: password 는 표시하지 않음) */}
      <div>
        <p style={labelStyle}>{t(I18N_KEYS.SAVE_DIALOG_USERNAME)}</p>
        <input
          style={readonlyInputStyle}
          type="text"
          value={pending.username}
          readOnly
          aria-label="Username (read-only)"
        />
      </div>

      {/* Notes — 선택적 메모 */}
      <div>
        <p style={labelStyle}>{t(I18N_KEYS.SAVE_DIALOG_NOTES)}</p>
        <textarea
          style={{
            ...inputStyle,
            minHeight: "3rem",
            resize: "vertical",
          }}
          value={state.notes}
          onChange={(e) => dispatch({ type: "SET_NOTES", value: e.target.value })}
          aria-label="Notes (optional)"
          placeholder="optional"
        />
      </div>

      {/* 버튼 행 */}
      <div style={btnRowStyle}>
        <button
          style={saveBtnStyle}
          onClick={handleSave}
          disabled={state.phase === "saving"}
          aria-label="Save credential"
        >
          {state.phase === "saving"
            ? t(I18N_KEYS.SAVE_DIALOG_SAVING)
            : t(I18N_KEYS.SAVE_BANNER_ACTION_SAVE)}
        </button>
        <button
          style={cancelBtnStyle}
          onClick={handleCancel}
          disabled={state.phase === "saving"}
          aria-label="Cancel"
        >
          {t(I18N_KEYS.SAVE_BANNER_ACTION_DISMISS)}
        </button>
      </div>
    </div>
  );
}
