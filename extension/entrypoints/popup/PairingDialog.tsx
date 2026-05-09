/**
 * @file PairingDialog.tsx
 * @license AGPL-3.0-or-later
 *
 * B-5: Extension 측 페어링 UI — 4단계 상태 머신.
 *
 * 상태:
 *   uninitialized → pending → paired
 *                ↘ error
 *
 * F.2 Spec:
 *   - 디자인 토큰만 사용 (hex 하드코딩 ❌)
 *   - prefers-reduced-motion 존중 (스피너 회전 @media로 비활성)
 *   - 키보드 fully accessible (Tab → Enter)
 *   - 빈 상태 친절한 CTA ("페어링 시작" 버튼)
 *   - pending 상태에서 스켈레톤/스피너
 *   - 명확한 에러 + 다음 액션 안내
 *   - i18n 4 lang (en/ko/ja/zh_CN)
 *
 * 보안 한계 (위협 모델 T7):
 *   extensionPriv(X25519 개인키)는 chrome.storage.local 에 base64 평문으로 저장됨.
 *   브라우저 확장 권한 침해 시 노출 가능. chrome.storage.local 은 브라우저
 *   프로파일 내 SQLite 파일에 기록되며 OS 수준 암호화에 의존한다.
 *   위협 모델 T7 참조: docs/task_m24e.md.
 */

import React, { useReducer, useEffect, useCallback } from "react";
import { t } from "../../lib/i18n";
import { I18N_KEYS } from "@secretbank/shared";
import { NMClient } from "../../lib/nm-client";
import {
  PairingSession,
  parsePairedMessage,
  restoreFromStorage,
  saveToStorage,
  clearStorage,
} from "../../lib/pairing";
import { NMNotInstalled } from "../../lib/nm-errors";
import type { PairingStorage } from "../../lib/storage";

// ---------------------------------------------------------------------------
// 상태 머신 타입
// ---------------------------------------------------------------------------

/** PairingDialog 4단계 상태 */
type PairingPhase = "uninitialized" | "pending" | "paired" | "error";

/** PairingDialog 에러 종류 */
type PairingErrorKind = "not_installed" | "rejected" | "timeout" | "protocol";

/** 상태 머신 state */
interface PairingState {
  phase: PairingPhase;
  /** paired 상태일 때 디바이스 ID */
  deviceId: string | null;
  /** error 상태일 때 에러 종류 */
  errorKind: PairingErrorKind | null;
}

/** 상태 머신 action */
type PairingAction =
  | { type: "START_PAIRING" }
  | { type: "PAIRING_SUCCESS"; deviceId: string }
  | { type: "PAIRING_ERROR"; errorKind: PairingErrorKind }
  | { type: "RESTORE_PAIRED"; deviceId: string }
  | { type: "RESET" };

// ---------------------------------------------------------------------------
// 상태 머신 reducer
// ---------------------------------------------------------------------------

const initialState: PairingState = {
  phase: "uninitialized",
  deviceId: null,
  errorKind: null,
};

function pairingReducer(state: PairingState, action: PairingAction): PairingState {
  switch (action.type) {
    case "START_PAIRING":
      return { phase: "pending", deviceId: null, errorKind: null };
    case "PAIRING_SUCCESS":
      return { phase: "paired", deviceId: action.deviceId, errorKind: null };
    case "PAIRING_ERROR":
      return { phase: "error", deviceId: null, errorKind: action.errorKind };
    case "RESTORE_PAIRED":
      return { phase: "paired", deviceId: action.deviceId, errorKind: null };
    case "RESET":
      return initialState;
    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// 페어링 타임아웃 (ms)
// ---------------------------------------------------------------------------

/**
 * 페어링 타임아웃 (ms).
 * 테스트에서 fake timer + vi.advanceTimersByTime 으로 제어 가능하도록 export.
 */
export const PAIRING_TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// 에러 메시지 i18n 키 매핑
// ---------------------------------------------------------------------------
const ERROR_KEY_MAP: Record<PairingErrorKind, string> = {
  not_installed: I18N_KEYS.PAIRING_ERROR_NOT_INSTALLED,
  rejected: I18N_KEYS.PAIRING_ERROR_REJECTED,
  timeout: I18N_KEYS.PAIRING_ERROR_TIMEOUT,
  protocol: I18N_KEYS.PAIRING_ERROR_PROTOCOL,
};

// ---------------------------------------------------------------------------
// 컴포넌트
// ---------------------------------------------------------------------------

export default function PairingDialog() {
  const [state, dispatch] = useReducer(pairingReducer, initialState);

  // 초기 마운트: chrome.storage.local 에서 기존 페어링 정보 복원
  useEffect(() => {
    let cancelled = false;
    restoreFromStorage().then((stored: PairingStorage | null) => {
      if (cancelled) return;
      if (stored) {
        dispatch({ type: "RESTORE_PAIRED", deviceId: stored.deviceId });
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // 페어링 시작 핸들러
  const handleStartPairing = useCallback(async () => {
    dispatch({ type: "START_PAIRING" });

    // 재페어링 시 기존 스토리지 초기화
    await clearStorage();

    const client = new NMClient();
    // chrome.runtime.id 가 없는 테스트 환경 대비 fallback
    const extId =
      typeof chrome !== "undefined" && chrome.runtime?.id
        ? chrome.runtime.id
        : "secretbank-extension";
    const session = new PairingSession(extId, "1.0.0");

    // 타임아웃 처리
    const timeoutId = setTimeout(() => {
      client.disconnect();
      dispatch({ type: "PAIRING_ERROR", errorKind: "timeout" });
    }, PAIRING_TIMEOUT_MS);

    try {
      await client.connect();
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof NMNotInstalled) {
        dispatch({ type: "PAIRING_ERROR", errorKind: "not_installed" });
      } else {
        dispatch({ type: "PAIRING_ERROR", errorKind: "protocol" });
      }
      return;
    }

    // paired 메시지 수신 대기
    const unsub = client.onMessage((msg) => {
      // pair_response (approved=false) 처리
      if (
        typeof msg === "object" &&
        msg !== null &&
        "type" in msg &&
        msg.type === "pair_response"
      ) {
        const pr = msg as { type: "pair_response"; approved: boolean };
        if (!pr.approved) {
          clearTimeout(timeoutId);
          unsub();
          client.disconnect();
          dispatch({ type: "PAIRING_ERROR", errorKind: "rejected" });
          return;
        }
      }

      // paired 메시지 처리
      if (typeof msg === "object" && msg !== null && "type" in msg && msg.type === "paired") {
        clearTimeout(timeoutId);
        unsub();
        try {
          const paired = parsePairedMessage(msg);
          session.processPairedMessage(paired);
          saveToStorage(session)
            .then(() => {
              dispatch({ type: "PAIRING_SUCCESS", deviceId: paired.device_id });
            })
            .catch(() => {
              // 스토리지 저장 실패 시에도 페어링 성공으로 처리
              dispatch({ type: "PAIRING_SUCCESS", deviceId: paired.device_id });
            })
            .finally(() => {
              client.disconnect();
            });
        } catch {
          client.disconnect();
          dispatch({ type: "PAIRING_ERROR", errorKind: "protocol" });
        }
      }
    });

    // init 메시지 전송
    try {
      await client.sendMessage(session.buildInitMessage());
    } catch {
      clearTimeout(timeoutId);
      unsub();
      client.disconnect();
      dispatch({ type: "PAIRING_ERROR", errorKind: "protocol" });
    }
  }, []);

  // 재페어링 핸들러
  const handleRePair = useCallback(() => {
    dispatch({ type: "RESET" });
    // 상태 리셋 후 startPairing 호출
    // RESET 이 동기적으로 dispatch 되고 다음 틱에 phase 가 uninitialized 로 변경됨.
    // 버튼이 uninitialized 상태에서 다시 보이므로 사용자가 직접 클릭.
  }, []);

  // ---------------------------------------------------------------------------
  // 렌더
  // ---------------------------------------------------------------------------

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "1rem",
        padding: "1.5rem 1.25rem",
        textAlign: "center",
        color: "var(--color-foreground)",
        minHeight: "220px",
        justifyContent: "center",
      }}
    >
      {state.phase === "uninitialized" && <UninitializedView onStart={handleStartPairing} />}
      {state.phase === "pending" && <PendingView />}
      {state.phase === "paired" && (
        <PairedView deviceId={state.deviceId ?? ""} onRePair={handleRePair} />
      )}
      {state.phase === "error" && (
        <ErrorView errorKind={state.errorKind ?? "protocol"} onRetry={handleStartPairing} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 하위 뷰 컴포넌트
// ---------------------------------------------------------------------------

interface UninitializedViewProps {
  onStart: () => void;
}

/** uninitialized 상태 — 페어링 시작 CTA */
function UninitializedView({ onStart }: UninitializedViewProps) {
  return (
    <>
      {/* 아이콘 */}
      <div
        aria-hidden="true"
        style={{
          fontSize: "2rem",
          lineHeight: 1,
          color: "var(--color-primary)",
        }}
      >
        🔗
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
        {t(I18N_KEYS.POPUP_TABS_PAIRING)}
      </p>

      {/* 설명 */}
      <p
        style={{
          margin: 0,
          fontSize: "0.75rem",
          color: "var(--color-muted-foreground)",
          lineHeight: 1.5,
          maxWidth: "240px",
        }}
      >
        {t(I18N_KEYS.PAIRING_OPEN_APP)}
      </p>

      {/* CTA 버튼 — Tab + Enter 접근 가능 */}
      <button
        type="button"
        onClick={onStart}
        style={{
          marginTop: "0.25rem",
          padding: "0.5rem 1.25rem",
          fontSize: "0.8125rem",
          fontWeight: 600,
          borderRadius: "var(--radius-md)",
          border: "none",
          backgroundColor: "var(--color-primary)",
          color: "var(--color-primary-foreground)",
          cursor: "pointer",
          transition: "opacity 150ms",
        }}
        onMouseOver={(e) => {
          (e.currentTarget as HTMLButtonElement).style.opacity = "0.85";
        }}
        onMouseOut={(e) => {
          (e.currentTarget as HTMLButtonElement).style.opacity = "1";
        }}
      >
        {t(I18N_KEYS.PAIRING_START)}
      </button>
    </>
  );
}

/** pending 상태 — 스피너 + 대기 메시지 */
function PendingView() {
  return (
    <>
      {/* 스피너 — prefers-reduced-motion 시 회전 비활성 (globals.css @media 처리) */}
      <div
        role="status"
        aria-label={t(I18N_KEYS.PAIRING_PENDING)}
        style={{
          width: "32px",
          height: "32px",
          borderRadius: "50%",
          border: "3px solid var(--color-border)",
          borderTopColor: "var(--color-primary)",
          animation: "spin 0.8s linear infinite",
        }}
      />

      {/* 스피너 CSS keyframes — inline style 에 keyframes 삽입 불가하므로 style tag 사용 */}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @media (prefers-reduced-motion: reduce) {
          [style*="spin"] { animation: none !important; }
        }
      `}</style>

      <p
        style={{
          margin: 0,
          fontSize: "0.8125rem",
          color: "var(--color-muted-foreground)",
          lineHeight: 1.5,
        }}
      >
        {t(I18N_KEYS.PAIRING_PENDING)}
      </p>

      {/* 스켈레톤 — 데스크톱 앱 다이얼로그 대기 안내 */}
      <div
        aria-hidden="true"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "0.375rem",
          width: "180px",
          marginTop: "0.25rem",
        }}
      >
        {[80, 120, 60].map((w, i) => (
          <div
            key={i}
            style={{
              height: "10px",
              width: `${w}px`,
              borderRadius: "var(--radius-sm)",
              backgroundColor: "var(--color-muted)",
              opacity: 0.5,
              alignSelf: "center",
            }}
          />
        ))}
      </div>
    </>
  );
}

interface PairedViewProps {
  deviceId: string;
  onRePair: () => void;
}

/** paired 상태 — 완료 배지 + 디바이스 ID + 재페어링 버튼 */
function PairedView({ deviceId, onRePair }: PairedViewProps) {
  return (
    <>
      {/* 성공 아이콘 */}
      <div
        aria-hidden="true"
        style={{
          fontSize: "2rem",
          lineHeight: 1,
          color: "var(--color-primary)",
        }}
      >
        ✓
      </div>

      {/* 상태 배지 */}
      <p
        style={{
          margin: 0,
          fontWeight: 700,
          fontSize: "0.875rem",
          color: "var(--color-foreground)",
        }}
      >
        {t(I18N_KEYS.PAIRING_PAIRED)} ✓
      </p>

      {/* 디바이스 ID */}
      <p
        style={{
          margin: 0,
          fontSize: "0.75rem",
          color: "var(--color-muted-foreground)",
          lineHeight: 1.5,
        }}
      >
        <span style={{ fontWeight: 500 }}>{t(I18N_KEYS.PAIRING_FINGERPRINT_LABEL)}:</span>{" "}
        <code
          style={{
            fontFamily: "var(--font-mono, monospace)",
            fontSize: "0.6875rem",
            backgroundColor: "var(--color-muted)",
            borderRadius: "var(--radius-sm)",
            padding: "0.1em 0.3em",
          }}
        >
          {deviceId}
        </code>
      </p>

      {/* 재페어링 버튼 */}
      <button
        type="button"
        onClick={onRePair}
        style={{
          marginTop: "0.25rem",
          padding: "0.375rem 0.875rem",
          fontSize: "0.75rem",
          fontWeight: 500,
          borderRadius: "var(--radius-md)",
          border: "1px solid var(--color-border)",
          backgroundColor: "transparent",
          color: "var(--color-muted-foreground)",
          cursor: "pointer",
          transition: "background-color 150ms",
        }}
        onMouseOver={(e) => {
          (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--color-muted)";
        }}
        onMouseOut={(e) => {
          (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent";
        }}
      >
        {t(I18N_KEYS.PAIRING_REPAIR_BUTTON)}
      </button>
    </>
  );
}

interface ErrorViewProps {
  errorKind: PairingErrorKind;
  onRetry: () => void;
}

/** error 상태 — 명확한 에러 메시지 + 다음 액션 안내 */
function ErrorView({ errorKind, onRetry }: ErrorViewProps) {
  const errorKey = ERROR_KEY_MAP[errorKind];

  return (
    <>
      {/* 에러 아이콘 */}
      <div
        aria-hidden="true"
        style={{
          fontSize: "1.75rem",
          lineHeight: 1,
          color: "var(--color-destructive)",
        }}
      >
        ⚠
      </div>

      {/* 에러 메시지 */}
      <p
        role="alert"
        style={{
          margin: 0,
          fontSize: "0.8125rem",
          color: "var(--color-destructive)",
          lineHeight: 1.5,
          maxWidth: "240px",
          fontWeight: 500,
        }}
      >
        {t(errorKey)}
      </p>

      {/* 다음 액션 안내 (not_installed, timeout 에만) */}
      {(errorKind === "not_installed" || errorKind === "timeout") && (
        <p
          style={{
            margin: 0,
            fontSize: "0.75rem",
            color: "var(--color-muted-foreground)",
            lineHeight: 1.5,
            maxWidth: "220px",
          }}
        >
          {t(I18N_KEYS.PAIRING_OPEN_APP)}
        </p>
      )}

      {/* 재시도 버튼 */}
      <button
        type="button"
        onClick={onRetry}
        style={{
          marginTop: "0.25rem",
          padding: "0.5rem 1.25rem",
          fontSize: "0.8125rem",
          fontWeight: 600,
          borderRadius: "var(--radius-md)",
          border: "none",
          backgroundColor: "var(--color-primary)",
          color: "var(--color-primary-foreground)",
          cursor: "pointer",
          transition: "opacity 150ms",
        }}
        onMouseOver={(e) => {
          (e.currentTarget as HTMLButtonElement).style.opacity = "0.85";
        }}
        onMouseOut={(e) => {
          (e.currentTarget as HTMLButtonElement).style.opacity = "1";
        }}
      >
        {t(I18N_KEYS.PAIRING_START)}
      </button>
    </>
  );
}
