import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

interface CharterCooldownStatusDto {
  enabled: boolean;
  cooldown_until_unix_ms: number | null;
  last_recovery_unix_ms: number | null;
  seconds_remaining: number;
}

/**
 * Charter cooldown 토글 + 활성 cooldown 표시 + clear 버튼.
 * vault 가 unlocked 인 상태에서만 의미가 있으므로 Settings 페이지 내부에서만 마운트.
 */
export function CharterCooldownSection() {
  const { t } = useTranslation("common");
  const [status, setStatus] = useState<CharterCooldownStatusDto | null>(null);
  const [loading, setLoading] = useState(true);

  async function fetchStatus() {
    try {
      const next = (await invoke("charter_cooldown_status")) as CharterCooldownStatusDto;
      setStatus(next);
    } catch {
      setStatus({
        enabled: false,
        cooldown_until_unix_ms: null,
        last_recovery_unix_ms: null,
        seconds_remaining: 0,
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchStatus();
  }, []);

  async function handleToggle() {
    if (!status) return;
    const next = !status.enabled;
    try {
      const updated = (await invoke("charter_cooldown_set_enabled", { enabled: next })) as CharterCooldownStatusDto;
      setStatus(updated);
    } catch {
      toast.error(t("settings.charterCooldownToggleFailed"));
    }
  }

  async function handleClear() {
    if (!window.confirm(t("settings.charterCooldownClearConfirm"))) return;
    try {
      const updated = (await invoke("charter_cooldown_clear")) as CharterCooldownStatusDto;
      setStatus(updated);
      toast.success(t("settings.charterCooldownClearedToast"));
    } catch {
      toast.error(t("settings.internalError"));
    }
  }

  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-9 w-full" />
      </div>
    );
  }
  if (!status) return null;

  const cooldownActive = status.seconds_remaining > 0;
  const lastRecovered = status.last_recovery_unix_ms
    ? new Date(status.last_recovery_unix_ms).toLocaleString()
    : null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <p className="text-sm font-medium">{t("settings.charterCooldown")}</p>
          <p className="text-xs text-muted-foreground">
            {t("settings.charterCooldownDescription")}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={status.enabled}
          aria-label={t("settings.charterCooldown")}
          onClick={handleToggle}
          className={[
            "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            status.enabled ? "bg-primary" : "bg-input",
          ].join(" ")}
        >
          <span
            className={[
              "pointer-events-none inline-block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform",
              status.enabled ? "translate-x-5" : "translate-x-0",
            ].join(" ")}
          />
        </button>
      </div>

      {cooldownActive && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-vault-warning/40 bg-vault-warning/10 p-3">
          <div className="flex flex-col gap-0.5">
            <p className="text-sm font-medium text-vault-warning">
              {t("settings.charterCooldownActive", {
                hours: Math.ceil(status.seconds_remaining / 3600),
              })}
            </p>
            {lastRecovered && (
              <p className="text-xs text-muted-foreground">
                {t("settings.charterLastRecoveredAt", { when: lastRecovered })}
              </p>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={handleClear}>
            {t("settings.charterCooldownClear")}
          </Button>
        </div>
      )}
    </div>
  );
}
