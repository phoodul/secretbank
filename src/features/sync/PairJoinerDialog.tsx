/**
 * PairJoinerDialog — joining 디바이스의 페어링 흐름 UI.
 *
 * LockScreen 에서 "Pair with another device" 클릭 시 열림. 사용자가 다른
 * 디바이스의 deep-link 를 paste 또는 PIN 직접 입력. apply 성공하면 vault
 * unlocked → onSuccess 콜백 → VaultGate 가 일반 앱으로 전환.
 */
import { Loader2, MonitorSmartphone, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { parsePairDeepLink, usePairJoiner } from "./use-pair-joiner";

interface PairJoinerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Apply 성공 (vault unlocked) 시 호출. VaultGate 의 refresh 트리거. */
  onSuccess: () => void;
  /** Deep-link 로 진입한 경우 자동 prefill — `apivault://pair?...` 전체 URL. */
  prefillUrl?: string;
}

export function PairJoinerDialog({
  open,
  onOpenChange,
  onSuccess,
  prefillUrl,
}: PairJoinerDialogProps) {
  const { t } = useTranslation();
  const { status, errorMessage, start, cancel } = usePairJoiner();
  const [linkInput, setLinkInput] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);

  useEffect(() => {
    // setState 를 microtask 로 미뤄 React Compiler 의 cascading-render 룰
    // (set-state-in-effect) 회피. 효과 자체는 동일.
    if (open && prefillUrl) {
      queueMicrotask(() => setLinkInput(prefillUrl));
      return;
    }
    if (!open) {
      queueMicrotask(() => {
        setLinkInput("");
        setParseError(null);
      });
      if (status !== "idle" && status !== "completed" && status !== "cancelled") {
        void cancel();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, prefillUrl]);

  useEffect(() => {
    if (status === "completed") {
      toast.success(t("sync.pairJoin.completedToast"));
      onSuccess();
      const timer = setTimeout(() => onOpenChange(false), 800);
      return () => clearTimeout(timer);
    }
  }, [status, onSuccess, onOpenChange, t]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setParseError(null);
    const parsed = parsePairDeepLink(linkInput.trim());
    if (!parsed) {
      setParseError(t("sync.pairJoin.invalidLink"));
      return;
    }
    void start({ pin: parsed.pin });
  }

  const isWorking =
    status === "joining" || status === "waiting_for_payload" || status === "applying";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MonitorSmartphone className="h-5 w-5" />
            {t("sync.pairJoin.title")}
          </DialogTitle>
          <DialogDescription>{t("sync.pairJoin.description")}</DialogDescription>
        </DialogHeader>

        {(status === "idle" || status === "error" || status === "cancelled") && (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="pair-link">{t("sync.pairJoin.linkLabel")}</Label>
              <Input
                id="pair-link"
                type="text"
                placeholder="apivault://pair?pin=…&pub=…"
                value={linkInput}
                onChange={(e) => setLinkInput(e.target.value)}
                autoFocus
                data-testid="pair-link-input"
              />
              {parseError && <p className="text-destructive text-xs">{parseError}</p>}
              {status === "error" && errorMessage && (
                <p className="text-destructive text-xs">{errorMessage}</p>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={!linkInput.trim()}>
                {status === "error" ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                    {t("sync.pairJoin.retry")}
                  </>
                ) : (
                  t("sync.pairJoin.continue")
                )}
              </Button>
            </DialogFooter>
          </form>
        )}

        {isWorking && (
          <div className="space-y-3 py-2" data-testid="pair-join-working">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {status === "joining" && t("sync.pairJoin.joining")}
              {status === "waiting_for_payload" && t("sync.pairJoin.waiting")}
              {status === "applying" && t("sync.pairJoin.applying")}
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                {t("common.cancel")}
              </Button>
            </DialogFooter>
          </div>
        )}

        {status === "completed" && (
          <div className="space-y-3 py-2" data-testid="pair-join-completed">
            <p className="text-sm">{t("sync.pairJoin.completed")}</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
