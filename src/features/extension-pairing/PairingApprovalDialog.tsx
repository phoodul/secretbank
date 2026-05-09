// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2025 Secretbank contributors
//
// T-24-E-B6 — Desktop-side extension pairing approval dialog.
//
// UX:
//   - Shows extension ID + SHA-256 emoji fingerprint (8 emoji) + hex (16 chars).
//   - Approve / Reject buttons, both keyboard accessible.
//   - Loading spinner while Tauri command is in-flight.
//   - Error banner with i18n message mapping.
//   - Success state with auto-close (1.5 s) or explicit Close button.
//   - Esc key closes (delegates to Radix Dialog default).

import { useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Fingerprint, Loader2, PlugZap } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

import { usePairing } from "./use-pairing";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface PairingApprovalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Extension's X25519 public key, base64-encoded (44 chars). */
  extensionPub: string;
  /** Browser extension unique ID. */
  extensionId: string;
  /**
   * Emoji-coded visual fingerprint of the extension public key.
   * 8 emoji produced by the SHA-256 → palette mapping (provided by caller or
   * computed externally so the dialog stays a pure presentational + IPC layer).
   */
  emojiFingerprint: string;
  /**
   * Hex fingerprint (16 hex chars = first 8 bytes of SHA-256).
   * Used as accessible text alternative alongside the emoji display.
   */
  hexFingerprint: string;
  /** Called after pairing is approved AND done (parent may refresh list). */
  onApproved?: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PairingApprovalDialog({
  open,
  onOpenChange,
  extensionPub,
  extensionId,
  emojiFingerprint,
  hexFingerprint,
  onApproved,
}: PairingApprovalDialogProps) {
  const { t } = useTranslation("common");
  const { phase, error, decide, reset } = usePairing();
  const autoCloseRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset internal state when dialog closes.
  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      if (!isOpen) {
        reset();
        if (autoCloseRef.current) {
          clearTimeout(autoCloseRef.current);
          autoCloseRef.current = null;
        }
      }
      onOpenChange(isOpen);
    },
    [reset, onOpenChange],
  );

  // Side-effects on phase transitions.
  useEffect(() => {
    if (phase === "done") {
      toast.success(t("extPairing.toast.approved"));
      autoCloseRef.current = setTimeout(() => {
        handleOpenChange(false);
        queueMicrotask(() => onApproved?.());
      }, 1500);
    } else if (phase === "error") {
      toast.error(t("extPairing.toast.error"));
    }
    return () => {
      if (autoCloseRef.current) {
        clearTimeout(autoCloseRef.current);
        autoCloseRef.current = null;
      }
    };
  }, [phase, t, handleOpenChange, onApproved]);

  const handleApprove = useCallback(async () => {
    await decide(extensionPub, extensionId, true);
  }, [decide, extensionPub, extensionId]);

  const handleReject = useCallback(async () => {
    await decide(extensionPub, extensionId, false);
    toast.success(t("extPairing.toast.rejected"));
    handleOpenChange(false);
  }, [decide, extensionPub, extensionId, t, handleOpenChange]);

  const isApproving = phase === "approving";
  const isDone = phase === "done";
  const hasError = phase === "error";

  // Map Rust error code to i18n key.
  function errorMessage(): string {
    if (!error) return t("extPairing.error.unknown");
    const key = error.code as string;
    const knownKeys = ["vault_locked", "invalid_pub_key", "vault_storage", "internal"] as const;
    if ((knownKeys as readonly string[]).includes(key)) {
      return t(`extPairing.error.${key}`);
    }
    return error.message ?? t("extPairing.error.unknown");
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PlugZap className="h-5 w-5 text-primary" aria-hidden />
            {t("extPairing.dialog.title")}
          </DialogTitle>
          <DialogDescription>{t("extPairing.dialog.description")}</DialogDescription>
        </DialogHeader>

        {/* ---- Fingerprint display ---- */}
        {!isDone && (
          <div className="flex flex-col gap-4 py-1">
            {/* Extension ID */}
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">
                {t("extPairing.dialog.extensionIdLabel")}
              </span>
              <code
                className="rounded bg-muted px-2 py-1 font-mono text-sm break-all"
                aria-label={`Extension ID: ${extensionId}`}
              >
                {extensionId}
              </code>
            </div>

            {/* Fingerprint */}
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">
                {t("extPairing.dialog.fingerprintLabel")}
              </span>
              <div
                className="flex items-center gap-2 rounded border bg-muted/50 px-3 py-2"
                role="img"
                aria-label={`Fingerprint: ${hexFingerprint}`}
              >
                <Fingerprint className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                <span
                  className="text-xl tracking-widest select-all"
                  aria-hidden
                  data-testid="emoji-fingerprint"
                >
                  {emojiFingerprint}
                </span>
                <code
                  className="ml-auto font-mono text-xs text-muted-foreground select-all"
                  data-testid="hex-fingerprint"
                >
                  {hexFingerprint}
                </code>
              </div>
            </div>

            {/* Error banner */}
            {hasError && (
              <div
                role="alert"
                className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2"
              >
                <p className="text-xs text-destructive">{errorMessage()}</p>
              </div>
            )}
          </div>
        )}

        {/* ---- Done state ---- */}
        {isDone && (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <p
              className="text-sm font-medium text-green-600 dark:text-green-400"
              data-testid="done-message"
            >
              {t("extPairing.dialog.done")}
            </p>
            <Button variant="outline" onClick={() => handleOpenChange(false)}>
              {t("extPairing.dialog.close")}
            </Button>
          </div>
        )}

        {/* ---- Action buttons ---- */}
        {!isDone && (
          <DialogFooter>
            <Button
              variant="outline"
              onClick={handleReject}
              disabled={isApproving}
              data-testid="pairing-reject"
            >
              {t("extPairing.dialog.reject")}
            </Button>
            <Button
              variant="default"
              onClick={handleApprove}
              disabled={isApproving}
              data-testid="pairing-approve"
            >
              {isApproving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                  {t("extPairing.dialog.approving")}
                </>
              ) : (
                t("extPairing.dialog.approve")
              )}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
