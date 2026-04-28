/**
 * PairInitiatorDialog — Settings → Cloud sync → "Add device" 의 흐름 UI.
 *
 * 한 번에 한 페어링만 (use-pair-initiator 의 hook 자체가 single-flight).
 * Dialog 가 unmount 되면 useEffect cleanup 이 timer 만 해제 — relay KV 측의
 * 5분 TTL 이 자체 정리.
 */
import { Copy, Loader2, MonitorSmartphone, RefreshCw } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { usePairInitiator } from "./use-pair-initiator";

interface PairInitiatorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PairInitiatorDialog({ open, onOpenChange }: PairInitiatorDialogProps) {
  const { t } = useTranslation();
  const { status, pin, deepLink, errorMessage, start, cancel } = usePairInitiator();

  // Dialog 가 열릴 때 자동으로 start. 닫힐 때 cancel.
  useEffect(() => {
    if (open && status === "idle") {
      void start();
    }
    if (!open && status !== "idle" && status !== "completed" && status !== "cancelled") {
      void cancel();
    }
    // status / start / cancel 의 안정성은 hook 내부 책임.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // 페어링 완료 시 토스트 + 자동 닫기.
  useEffect(() => {
    if (status === "completed") {
      toast.success(t("sync.pair.completedToast"));
      const timer = setTimeout(() => onOpenChange(false), 800);
      return () => clearTimeout(timer);
    }
  }, [status, onOpenChange, t]);

  async function copyDeepLink() {
    if (!deepLink) return;
    try {
      await navigator.clipboard.writeText(deepLink);
      toast.success(t("sync.pair.copiedToast"));
    } catch {
      toast.error(t("sync.pair.copyFailed"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MonitorSmartphone className="h-5 w-5" />
            {t("sync.pair.title")}
          </DialogTitle>
          <DialogDescription>{t("sync.pair.description")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {(status === "starting" || status === "idle") && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("sync.pair.starting")}
            </div>
          )}

          {status === "waiting_for_joiner" && pin && (
            <div className="space-y-3" data-testid="pair-waiting">
              <div className="rounded-md border bg-muted/30 p-4">
                <div className="text-muted-foreground text-xs uppercase tracking-wide mb-1">
                  {t("sync.pair.pinLabel")}
                </div>
                <div
                  className="font-mono text-3xl tracking-[0.4em] tabular-nums"
                  data-testid="pair-pin"
                >
                  {pin}
                </div>
              </div>

              <div className="space-y-1">
                <div className="text-muted-foreground text-xs uppercase tracking-wide">
                  {t("sync.pair.deepLinkLabel")}
                </div>
                <div className="flex items-center gap-2">
                  <code
                    className="flex-1 truncate rounded border bg-muted/30 px-2 py-1 text-xs"
                    data-testid="pair-deep-link"
                  >
                    {deepLink}
                  </code>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void copyDeepLink()}
                    aria-label={t("sync.pair.copyAria") ?? "Copy"}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              <p className="text-muted-foreground text-xs">
                {t("sync.pair.waiting")}
              </p>
            </div>
          )}

          {status === "finalizing" && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("sync.pair.finalizing")}
            </div>
          )}

          {status === "completed" && (
            <p className="text-sm text-success-foreground" data-testid="pair-completed">
              {t("sync.pair.completed")}
            </p>
          )}

          {status === "error" && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 space-y-2">
              <p className="text-sm text-destructive">
                {errorMessage ?? t("sync.pair.genericError")}
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void start()}
              >
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                {t("sync.pair.retry")}
              </Button>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {status === "completed"
              ? t("common.close")
              : t("common.cancel")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
