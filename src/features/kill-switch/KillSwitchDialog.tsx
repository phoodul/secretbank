/**
 * KillSwitchDialog — two-step revoke confirmation dialog (T076).
 *
 * Step 1: Type credential name to unlock Continue button.
 * Step 2: Final "I understand" destructive action.
 * Step 3: Success message with auto-close.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AlertTriangle, ShieldOff } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

import { useKillSwitch } from "./use-kill-switch";

export interface KillSwitchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  credentialId: string | null;
  credentialName: string;
  onRevoked?: () => void;
}

export function KillSwitchDialog({
  open,
  onOpenChange,
  credentialId,
  credentialName,
  onRevoked,
}: KillSwitchDialogProps) {
  const { t } = useTranslation("common");
  const { phase, error, requestConfirm, revoke, reset } = useKillSwitch(credentialId);

  const [typedName, setTypedName] = useState("");
  const [alsoDeleteValue, setAlsoDeleteValue] = useState(false);
  const autoCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset local state when dialog closes
  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      if (!isOpen) {
        reset();
        setTypedName("");
        setAlsoDeleteValue(false);
        if (autoCloseTimerRef.current) {
          clearTimeout(autoCloseTimerRef.current);
          autoCloseTimerRef.current = null;
        }
      }
      onOpenChange(isOpen);
    },
    [reset, onOpenChange],
  );

  // Auto-close after done; show specific toast on error
  useEffect(() => {
    if (phase === "done") {
      toast.success(t("killSwitch.toast.success"));
      autoCloseTimerRef.current = setTimeout(() => {
        handleOpenChange(false);
        // Defer parent notification one microtask so this dialog starts its
        // close transition before the parent unmounts our subtree. Otherwise
        // Radix Dialog's compose-refs enters an infinite setRef loop
        // (Maximum update depth exceeded). See I4 hotfix.
        queueMicrotask(() => onRevoked?.());
      }, 1500);
    } else if (phase === "error" && error) {
      // Map known error codes/patterns to user-friendly i18n messages.
      const isFlushError = /vault flush failed/i.test(error);
      const isNotFoundError = /not found/i.test(error);
      const toastMsg = isFlushError
        ? t("killSwitch.toast.flushError")
        : isNotFoundError
          ? t("killSwitch.toast.notFoundError")
          : t("killSwitch.toast.error");
      toast.error(toastMsg);
    }
    return () => {
      if (autoCloseTimerRef.current) {
        clearTimeout(autoCloseTimerRef.current);
        autoCloseTimerRef.current = null;
      }
    };
  }, [phase, error, t, onRevoked, handleOpenChange]);

  const nameMatches = typedName === credentialName;
  const isStep1 = phase === "idle" || phase === "requesting";
  const isStep2 = phase === "awaiting_confirm" || phase === "revoking";
  const isDone = phase === "done";
  const hasError = phase === "error";

  const handleContinue = useCallback(async () => {
    await requestConfirm();
  }, [requestConfirm]);

  const handleRevoke = useCallback(async () => {
    await revoke(alsoDeleteValue);
  }, [revoke, alsoDeleteValue]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton={!isDone} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldOff className="h-5 w-5 text-destructive" aria-hidden />
            {t("killSwitch.dialog.title")}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {t("killSwitch.dialog.title")}
          </DialogDescription>
        </DialogHeader>

        {/* ---- Step 1: name confirmation ---- */}
        {(isStep1 || hasError) && !isDone && (
          <div className="flex flex-col gap-4">
            {/* Warning text */}
            <p className="text-sm text-muted-foreground">{t("killSwitch.dialog.warning")}</p>

            {/* Type name to confirm */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="kill-switch-name-input">
                {t("killSwitch.dialog.typeNameLabel", { name: credentialName })}
              </Label>
              <Input
                id="kill-switch-name-input"
                placeholder={t("killSwitch.dialog.typeNamePlaceholder")}
                value={typedName}
                onChange={(e) => setTypedName(e.target.value)}
                autoComplete="off"
                data-testid="kill-switch-name-input"
              />
            </div>

            {/* Also delete value checkbox */}
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="kill-switch-also-delete"
                  checked={alsoDeleteValue}
                  onCheckedChange={(checked) => setAlsoDeleteValue(checked === true)}
                  data-testid="kill-switch-also-delete"
                />
                <Label htmlFor="kill-switch-also-delete" className="cursor-pointer font-normal">
                  {t("killSwitch.dialog.alsoDeleteValue")}
                </Label>
              </div>
              <p className="pl-6 text-xs text-muted-foreground">
                {t("killSwitch.dialog.alsoDeleteValueHint")}
              </p>
            </div>

            {/* Error state */}
            {hasError && error && (
              <div
                role="alert"
                className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2"
              >
                <p className="text-xs text-destructive">{error}</p>
              </div>
            )}

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={phase === "requesting"}
              >
                {t("killSwitch.dialog.cancel")}
              </Button>
              <Button
                variant="destructive"
                onClick={handleContinue}
                disabled={!nameMatches || phase === "requesting"}
                data-testid="kill-switch-continue"
              >
                {t("killSwitch.dialog.continue")}
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* ---- Step 2: final confirmation ---- */}
        {isStep2 && (
          <div className="flex flex-col gap-4">
            {/* Caution banner */}
            <div
              role="alert"
              className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
              <p className="text-sm font-medium text-destructive">
                {t("killSwitch.dialog.confirmWarning")}
              </p>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={phase === "revoking"}
              >
                {t("killSwitch.dialog.cancel")}
              </Button>
              <Button
                variant="destructive"
                onClick={handleRevoke}
                disabled={phase === "revoking"}
                data-testid="kill-switch-confirm"
              >
                {t("killSwitch.dialog.confirm")}
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* ---- Step 3: done ---- */}
        {isDone && (
          <div className="flex flex-col items-center gap-4 py-2 text-center">
            <p className="text-sm font-medium text-green-600 dark:text-green-400">
              {t("killSwitch.dialog.done")}
            </p>
            <Button variant="outline" onClick={() => handleOpenChange(false)}>
              {t("killSwitch.dialog.close")}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
