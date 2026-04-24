/**
 * BulkRevokeDialog — two-step bulk revoke for all credentials under an issuer (T078).
 *
 * Step 1 (idle/error): Type issuer name + optional "also delete values" checkbox → Continue.
 * Step 2 (awaiting_confirm): Final destructive confirmation button.
 * Step 3 (revoking): Progress bar updating live from kill-switch:progress events.
 * Step 4 (done): Summary of revoked count and any failures.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
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
import { Progress } from "@/components/ui/progress";

import { useBulkKillSwitch } from "./use-kill-switch";
import type { KillSwitchBulkResult } from "./use-kill-switch";

export interface BulkRevokeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  issuerId: string | null;
  issuerName: string;
  credentialCount: number;
  onCompleted?: (result: KillSwitchBulkResult) => void;
}

export function BulkRevokeDialog({
  open,
  onOpenChange,
  issuerId,
  issuerName,
  credentialCount,
  onCompleted,
}: BulkRevokeDialogProps) {
  const { t } = useTranslation("common");
  const { phase, error, progress, result, requestConfirm, revoke, reset } =
    useBulkKillSwitch(issuerId);

  const [typedName, setTypedName] = useState("");
  const [alsoDeleteValues, setAlsoDeleteValues] = useState(false);
  const autoCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      if (!isOpen) {
        reset();
        setTypedName("");
        setAlsoDeleteValues(false);
        if (autoCloseTimerRef.current) {
          clearTimeout(autoCloseTimerRef.current);
          autoCloseTimerRef.current = null;
        }
      }
      onOpenChange(isOpen);
    },
    [reset, onOpenChange],
  );

  // Notify parent and auto-close on completion.
  useEffect(() => {
    if (phase === "done" && result) {
      onCompleted?.(result);
      autoCloseTimerRef.current = setTimeout(() => {
        handleOpenChange(false);
      }, 2500);
    }
    return () => {
      if (autoCloseTimerRef.current) {
        clearTimeout(autoCloseTimerRef.current);
        autoCloseTimerRef.current = null;
      }
    };
  }, [phase, result, onCompleted, handleOpenChange]);

  const nameMatches = typedName === issuerName;
  const isStep1 = phase === "idle" || phase === "requesting" || phase === "error";
  const isStep2 = phase === "awaiting_confirm";
  const isRevoking = phase === "revoking";
  const isDone = phase === "done";

  const progressValue =
    progress && progress.total > 0
      ? Math.round((progress.revoked / progress.total) * 100)
      : 0;

  const handleContinue = useCallback(async () => {
    await requestConfirm();
  }, [requestConfirm]);

  const handleRevoke = useCallback(async () => {
    await revoke(alsoDeleteValues, credentialCount);
  }, [revoke, alsoDeleteValues, credentialCount]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton={!isDone && !isRevoking} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldOff className="h-5 w-5 text-destructive" aria-hidden />
            {t("killSwitch.bulk.dialogTitle")}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {t("killSwitch.bulk.dialogTitle")}
          </DialogDescription>
        </DialogHeader>

        {/* ---- Step 1: issuer name confirmation ---- */}
        {isStep1 && !isDone && !isRevoking && (
          <div className="flex flex-col gap-4">
            <p
              className="text-sm text-muted-foreground"
              dangerouslySetInnerHTML={{
                __html: t("killSwitch.bulk.warning", {
                  count: credentialCount,
                  issuer: `<strong>${issuerName}</strong>`,
                }),
              }}
            />

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bulk-revoke-name-input">
                {t("killSwitch.bulk.typeIssuerLabel", { name: issuerName })}
              </Label>
              <Input
                id="bulk-revoke-name-input"
                placeholder={issuerName}
                value={typedName}
                onChange={(e) => setTypedName(e.target.value)}
                autoComplete="off"
                data-testid="bulk-revoke-name-input"
              />
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="bulk-revoke-also-delete"
                checked={alsoDeleteValues}
                onCheckedChange={(checked) => setAlsoDeleteValues(checked === true)}
                data-testid="bulk-revoke-also-delete"
              />
              <Label htmlFor="bulk-revoke-also-delete" className="cursor-pointer font-normal">
                {t("killSwitch.bulk.alsoDeleteValues")}
              </Label>
            </div>

            {phase === "error" && error && (
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
                {t("common.cancel")}
              </Button>
              <Button
                variant="destructive"
                onClick={handleContinue}
                disabled={!nameMatches || phase === "requesting"}
                data-testid="bulk-revoke-continue"
              >
                {t("killSwitch.bulk.continue")}
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* ---- Step 2: final confirmation ---- */}
        {isStep2 && (
          <div className="flex flex-col gap-4">
            <div
              role="alert"
              className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
              <p className="text-sm font-medium text-destructive">
                {t("killSwitch.bulk.warning", {
                  count: credentialCount,
                  issuer: issuerName,
                })}
              </p>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                {t("common.cancel")}
              </Button>
              <Button
                variant="destructive"
                onClick={handleRevoke}
                data-testid="bulk-revoke-confirm"
              >
                {t("killSwitch.bulk.confirm", { count: credentialCount })}
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* ---- Step 3: progress ---- */}
        {isRevoking && (
          <div className="flex flex-col gap-3 py-2">
            <p className="text-sm text-muted-foreground">
              {t("killSwitch.bulk.progress", {
                revoked: progress?.revoked ?? 0,
                total: progress?.total ?? credentialCount,
              })}
            </p>
            <Progress
              value={progressValue}
              aria-label={t("killSwitch.bulk.progress", {
                revoked: progress?.revoked ?? 0,
                total: progress?.total ?? credentialCount,
              })}
            />
          </div>
        )}

        {/* ---- Step 4: done ---- */}
        {isDone && result && (
          <div className="flex flex-col gap-3 py-2">
            {result.failed.length === 0 ? (
              <p className="text-sm font-medium text-green-600 dark:text-green-400">
                {t("killSwitch.bulk.doneSuccess", { revoked: result.revoked })}
              </p>
            ) : (
              <>
                <p className="text-sm font-medium text-amber-600 dark:text-amber-400">
                  {t("killSwitch.bulk.doneWithFailures", {
                    revoked: result.revoked,
                    failed: result.failed.length,
                  })}
                </p>
                <ul className="max-h-32 overflow-y-auto text-xs text-muted-foreground">
                  {result.failed.map((f) => (
                    <li key={f.credential_id} className="truncate">
                      {f.credential_id}: {f.message}
                    </li>
                  ))}
                </ul>
              </>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                {t("killSwitch.bulk.close")}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
