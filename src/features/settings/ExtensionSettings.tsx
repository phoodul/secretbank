/**
 * @file ExtensionSettings.tsx
 * @license AGPL-3.0-or-later
 *
 * B-7: Extension session timeout 설정 UI 섹션.
 *
 * - 5개 라디오 옵션 (30min / 1h / 4h / 8h / until lock)
 * - 변경 시 confirm dialog (기존 세션 즉시 종료 경고)
 * - 변경 즉시 적용 (session_secret 회전 → 기존 token 무효화)
 * - Tauri 앱이 source of truth
 *
 * F.2 Spec:
 *   - 디자인 토큰만 사용 (hex 하드코딩 ❌)
 *   - prefers-reduced-motion 존중
 *   - 키보드 접근 가능 (radio group + dialog)
 *   - i18n 4 locale
 *   - 빈 상태 / 명확한 에러 처리
 */

import { invoke } from "@tauri-apps/api/core";
import { AlertTriangle, Info } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";

// ---------------------------------------------------------------------------
// 타입 — Rust SessionTtlOption 과 대칭
// ---------------------------------------------------------------------------

/** Rust `SessionTtlOption` serde snake_case 와 일치 */
type SessionTtlOption = "mins30" | "hour1" | "hours4" | "hours8" | "until_lock";

interface SessionSettings {
  ttl: SessionTtlOption;
}

// ---------------------------------------------------------------------------
// TTL 옵션 목록
// ---------------------------------------------------------------------------

interface TtlOptionDef {
  value: SessionTtlOption;
  labelKey: string;
}

const TTL_OPTIONS: TtlOptionDef[] = [
  { value: "mins30", labelKey: "settings.extensionSessionTtlMins30" },
  { value: "hour1", labelKey: "settings.extensionSessionTtlHour1" },
  { value: "hours4", labelKey: "settings.extensionSessionTtlHours4" },
  { value: "hours8", labelKey: "settings.extensionSessionTtlHours8" },
  { value: "until_lock", labelKey: "settings.extensionSessionTtlUntilLock" },
];

// ---------------------------------------------------------------------------
// Tauri IPC 래퍼
// ---------------------------------------------------------------------------

async function getSessionSettings(): Promise<SessionSettings> {
  return invoke<SessionSettings>("extension_session_settings_get");
}

async function setSessionSettings(settings: SessionSettings): Promise<void> {
  return invoke<void>("extension_session_settings_set", { settings });
}

async function fetchMcpOptIn(): Promise<boolean> {
  return invoke<boolean>("ext_settings_get_mcp_opt_in");
}

async function saveMcpOptIn(enabled: boolean): Promise<void> {
  return invoke<void>("ext_settings_set_mcp_opt_in", { enabled });
}

// ---------------------------------------------------------------------------
// 컴포넌트
// ---------------------------------------------------------------------------

export function ExtensionSettings() {
  const { t } = useTranslation();

  // 현재 TTL 설정
  const [current, setCurrent] = useState<SessionTtlOption | null>(null);
  const [loading, setLoading] = useState(true);

  // 사용자가 선택 중인 임시 값 (confirm 전)
  const [pending, setPending] = useState<SessionTtlOption | null>(null);

  // confirm dialog 표시 여부
  const [confirmOpen, setConfirmOpen] = useState(false);

  // 저장 중 상태 (중복 클릭 방지)
  const [saving, setSaving] = useState(false);

  // G-4-1: MCP context push opt-in 상태
  const [mcpOptIn, setMcpOptIn] = useState(false);
  const [mcpLoading, setMcpLoading] = useState(true);
  const [mcpSaving, setMcpSaving] = useState(false);

  // 초기 로드
  useEffect(() => {
    let cancelled = false;
    getSessionSettings()
      .then((s) => {
        if (!cancelled) {
          setCurrent(s.ttl);
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

  // G-4-1: MCP opt-in 초기 로드
  useEffect(() => {
    let cancelled = false;
    fetchMcpOptIn()
      .then((val) => {
        if (!cancelled) {
          setMcpOptIn(val);
          setMcpLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setMcpLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 라디오 변경 핸들러 — confirm dialog 표시
  function handleOptionChange(value: SessionTtlOption) {
    if (value === current) return; // 변경 없음
    setPending(value);
    setConfirmOpen(true);
  }

  // confirm — 적용
  async function handleConfirm() {
    if (pending === null) return;
    setSaving(true);
    try {
      await setSessionSettings({ ttl: pending });
      setCurrent(pending);
      toast.success(t("settings.extensionSessionSaved"));
    } catch {
      toast.error(t("settings.extensionSessionSaveFailed"));
    } finally {
      setSaving(false);
      setConfirmOpen(false);
      setPending(null);
    }
  }

  // cancel — 원래 값으로 복원
  function handleCancel() {
    setConfirmOpen(false);
    setPending(null);
  }

  // G-4-1: MCP opt-in toggle 핸들러
  async function handleMcpToggle(checked: boolean) {
    if (mcpSaving) return;
    setMcpSaving(true);
    try {
      await saveMcpOptIn(checked);
      setMcpOptIn(checked);
      if (checked) {
        toast.success(t("settings.extensionMcpContextEnabled"));
      } else {
        toast.success(t("settings.extensionMcpContextDisabled"));
      }
    } catch {
      toast.error(t("settings.extensionSessionSaveFailed"));
    } finally {
      setMcpSaving(false);
    }
  }

  return (
    <section aria-labelledby="ext-session-heading" className="space-y-4">
      <h2 id="ext-session-heading" className="text-base font-medium">
        {t("settings.extensionSessionTitle")}
      </h2>
      <p className="text-muted-foreground text-xs">{t("settings.extensionSessionDescription")}</p>

      {/* 로딩 스켈레톤 */}
      {loading ? (
        <div className="space-y-2" aria-busy="true" aria-label={t("common.loading")}>
          {TTL_OPTIONS.map((_, i) => (
            <Skeleton key={i} className="h-5 w-48" />
          ))}
        </div>
      ) : (
        /* 라디오 그룹 */
        <fieldset
          role="radiogroup"
          aria-labelledby="ext-session-heading"
          className="space-y-2"
          disabled={saving}
        >
          <legend className="sr-only">{t("settings.extensionSessionTitle")}</legend>

          {TTL_OPTIONS.map(({ value, labelKey }) => {
            const id = `ext-session-ttl-${value}`;
            const isChecked = (pending ?? current) === value;
            return (
              <label
                key={value}
                htmlFor={id}
                className="flex cursor-pointer items-center gap-2 text-sm"
              >
                <input
                  type="radio"
                  id={id}
                  name="ext-session-ttl"
                  value={value}
                  checked={isChecked}
                  onChange={() => handleOptionChange(value)}
                  disabled={saving}
                  className="accent-primary h-4 w-4"
                  aria-checked={isChecked}
                />
                <span>{t(labelKey)}</span>
              </label>
            );
          })}
        </fieldset>
      )}

      {/* 확인 AlertDialog */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="text-vault-warning h-5 w-5 shrink-0" aria-hidden="true" />
              {t("settings.extensionSessionRotateConfirmTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("settings.extensionSessionRotateConfirmDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancel} disabled={saving}>
              {t("settings.extensionSessionRotateConfirmCancel")}
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm} disabled={saving}>
              {t("settings.extensionSessionRotateConfirmOk")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* G-4-1: MCP context push opt-in */}
      <section aria-labelledby="ext-mcp-context-heading" className="space-y-3 border-t pt-4">
        <h3 id="ext-mcp-context-heading" className="text-sm font-medium">
          {t("settings.extensionMcpContextTitle")}
        </h3>
        <p className="text-muted-foreground text-xs">
          {t("settings.extensionMcpContextDescription")}
        </p>

        {mcpLoading ? (
          <Skeleton className="h-5 w-10" />
        ) : (
          <div className="flex items-center gap-3">
            <Switch
              id="ext-mcp-context-switch"
              checked={mcpOptIn}
              onCheckedChange={handleMcpToggle}
              disabled={mcpSaving}
              aria-describedby="ext-mcp-context-warning"
            />
            <label htmlFor="ext-mcp-context-switch" className="cursor-pointer select-none text-sm">
              {mcpOptIn
                ? t("settings.extensionMcpContextEnabled")
                : t("settings.extensionMcpContextTitle")}
            </label>
          </div>
        )}

        {/* privacy 경고 — 항상 표시 */}
        <p
          id="ext-mcp-context-warning"
          className="text-muted-foreground flex items-start gap-1.5 text-xs"
        >
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {t("settings.extensionMcpContextWarning")}
        </p>
      </section>
    </section>
  );
}
