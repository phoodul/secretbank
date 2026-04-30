import * as React from "react";
import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import zxcvbn from "zxcvbn";

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
import { cn } from "@/lib/utils";

import { CharterDisplay, type CharterIssuanceDto } from "./CharterDisplay";

interface VaultCommandError {
  code:
    | "already_initialized"
    | "not_initialized"
    | "wrong_password"
    | "not_unlocked"
    | "charter_absent"
    | "charter_invalid"
    | "charter_parse_error"
    | "internal";
  detail?: string;
  message?: string;
}

type RecoveryMode = "single" | "shamir";
type NewCharterMode = "single" | "shamir2of3" | "none";

type Phase =
  | { kind: "input" }
  | { kind: "recovering" }
  | { kind: "issued"; issuance: CharterIssuanceDto };

interface RecoveryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Recovery 성공 후 호출 — LockScreen 이 새 passphrase 로 unlock 화면 갱신 */
  onSuccess: () => void;
}

/**
 * Vault Charter 로 복구 + 새 passphrase 재발급 다이얼로그.
 *
 * step 1: Mode (single / shamir) 선택 → charter 또는 share 입력 + new password
 * step 2: vault_recovery_unlock invoke
 * step 3: (옵션) 새 charter 발급된 경우 CharterDisplay
 */
export function RecoveryDialog({ open, onOpenChange, onSuccess }: RecoveryDialogProps) {
  const { t } = useTranslation("common");

  const [mode, setMode] = useState<RecoveryMode>("single");
  const [phrase, setPhrase] = useState("");
  const [share1, setShare1] = useState("");
  const [share2, setShare2] = useState("");
  const [share3, setShare3] = useState("");
  const [newPassphrase, setNewPassphrase] = useState("");
  const [confirm, setConfirm] = useState("");
  const [newCharterMode, setNewCharterMode] = useState<NewCharterMode>("single");
  const [phase, setPhase] = useState<Phase>({ kind: "input" });
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const submitting = phase.kind === "recovering";
  const score = newPassphrase.length > 0 ? zxcvbn(newPassphrase).score : -1;
  const tooShort = newPassphrase.length > 0 && newPassphrase.length < 12;
  const mismatch = confirm.length > 0 && newPassphrase !== confirm;

  const inputComplete =
    mode === "single"
      ? phrase.trim().length > 0
      : [share1, share2, share3].filter((s) => s.trim().length > 0).length >= 2;
  const passwordsValid =
    newPassphrase.length >= 12 && newPassphrase === confirm;
  const isValid = inputComplete && passwordsValid && !submitting;

  function clearAll() {
    setPhrase("");
    setShare1("");
    setShare2("");
    setShare3("");
    setNewPassphrase("");
    setConfirm("");
    setErrorMsg(null);
    setPhase({ kind: "input" });
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && phase.kind === "issued") {
      // CharterDisplay 의 명시 confirm 으로만 닫힘.
      return;
    }
    if (!nextOpen) clearAll();
    onOpenChange(nextOpen);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!isValid) return;

    setPhase({ kind: "recovering" });
    setErrorMsg(null);

    const recovery =
      mode === "single"
        ? { kind: "single" as const, phrase: phrase.trim() }
        : {
            kind: "shamir" as const,
            shares: [share1, share2, share3]
              .map((s) => s.trim())
              .filter((s) => s.length > 0),
          };

    try {
      const issuance = (await invoke("vault_recovery_unlock", {
        recovery,
        newPassword: newPassphrase,
        newCharterMode,
      })) as CharterIssuanceDto;

      // 입력값 즉시 폐기.
      setPhrase("");
      setShare1("");
      setShare2("");
      setShare3("");
      setNewPassphrase("");
      setConfirm("");
      toast.success(t("vault.recovery.successToast"));

      if (issuance.kind === "none") {
        clearAll();
        onSuccess();
        onOpenChange(false);
        return;
      }
      setPhase({ kind: "issued", issuance });
    } catch (err) {
      const error = err as VaultCommandError;
      setPhase({ kind: "input" });
      switch (error?.code) {
        case "charter_absent":
          setErrorMsg(t("vault.recovery.errorAbsent"));
          break;
        case "charter_invalid":
          setErrorMsg(t("vault.recovery.errorInvalid"));
          break;
        case "charter_parse_error":
          setErrorMsg(
            t("vault.recovery.errorParse", { detail: error.detail ?? "" }),
          );
          break;
        default:
          setErrorMsg(t("vault.internalError"));
      }
    }
  }

  function handleIssuedDone() {
    clearAll();
    onSuccess();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className={cn(phase.kind === "issued" ? "sm:max-w-2xl" : "sm:max-w-md")}
      >
        {phase.kind !== "issued" && (
          <>
            <DialogHeader>
              <DialogTitle>{t("vault.recovery.title")}</DialogTitle>
              <DialogDescription>{t("vault.recovery.subtitle")}</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} noValidate>
              <div className="flex flex-col gap-4 py-2">
                {/* Recovery 모드 */}
                <fieldset className="flex flex-col gap-1.5 rounded-md border border-vault-gold/30 bg-vault-lapis-deep/20 p-3">
                  <legend className="text-sm font-medium text-vault-gold-bright">
                    {t("vault.charter.modeLabel")}
                  </legend>
                  <RecoveryModeRadio
                    id="recovery-mode-single"
                    checked={mode === "single"}
                    onChange={() => setMode("single")}
                    disabled={submitting}
                    label={t("vault.recovery.modeSingle")}
                  />
                  <RecoveryModeRadio
                    id="recovery-mode-shamir"
                    checked={mode === "shamir"}
                    onChange={() => setMode("shamir")}
                    disabled={submitting}
                    label={t("vault.recovery.modeShamir")}
                  />
                </fieldset>

                {mode === "single" && (
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="charter-phrase">{t("vault.recovery.phraseLabel")}</Label>
                    <textarea
                      id="charter-phrase"
                      value={phrase}
                      onChange={(e) => {
                        setPhrase(e.target.value);
                        setErrorMsg(null);
                      }}
                      placeholder={t("vault.recovery.phrasePlaceholder")}
                      disabled={submitting}
                      rows={3}
                      className="w-full rounded-md border border-vault-lapis/30 bg-input/40 px-3 py-2 text-sm font-mono ring-lapis"
                      autoCapitalize="characters"
                      spellCheck={false}
                    />
                  </div>
                )}

                {mode === "shamir" && (
                  <div className="flex flex-col gap-3">
                    {[1, 2, 3].map((i) => {
                      const value = i === 1 ? share1 : i === 2 ? share2 : share3;
                      const setter =
                        i === 1 ? setShare1 : i === 2 ? setShare2 : setShare3;
                      const optional = i === 3 ? " (optional)" : "";
                      return (
                        <div key={i} className="flex flex-col gap-1.5">
                          <Label htmlFor={`charter-share-${i}`}>
                            {t("vault.recovery.shareLabel", { index: i })}
                            {optional}
                          </Label>
                          <textarea
                            id={`charter-share-${i}`}
                            value={value}
                            onChange={(e) => {
                              setter(e.target.value);
                              setErrorMsg(null);
                            }}
                            placeholder={t("vault.recovery.sharePlaceholder", { index: i })}
                            disabled={submitting}
                            rows={2}
                            className="w-full rounded-md border border-vault-lapis/30 bg-input/40 px-3 py-2 text-sm font-mono ring-lapis"
                            spellCheck={false}
                          />
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* 새 passphrase */}
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="recovery-new-pw">
                    {t("vault.recovery.newPassphraseLabel")}
                  </Label>
                  <Input
                    id="recovery-new-pw"
                    type="password"
                    autoComplete="new-password"
                    value={newPassphrase}
                    onChange={(e) => setNewPassphrase(e.target.value)}
                    disabled={submitting}
                    aria-invalid={tooShort}
                  />
                  {tooShort && (
                    <p className="text-xs text-destructive" role="alert">
                      {t("vault.passphraseMinLength")}
                    </p>
                  )}
                  {newPassphrase.length > 0 && (
                    <div className="flex gap-1">
                      {Array.from({ length: 5 }, (_, i) => (
                        <div
                          key={i}
                          className={cn(
                            "h-1 flex-1 rounded-full transition-colors",
                            i <= score
                              ? score >= 3
                                ? "bg-vault-success"
                                : score >= 2
                                  ? "bg-vault-warning"
                                  : "bg-vault-danger"
                              : "bg-muted",
                          )}
                        />
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="recovery-confirm-pw">
                    {t("vault.recovery.newPassphraseConfirmLabel")}
                  </Label>
                  <Input
                    id="recovery-confirm-pw"
                    type="password"
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    disabled={submitting}
                    aria-invalid={mismatch}
                  />
                  {mismatch && (
                    <p className="text-xs text-destructive" role="alert">
                      {t("vault.passphraseMismatch")}
                    </p>
                  )}
                </div>

                {/* 새 charter 모드 */}
                <fieldset className="flex flex-col gap-1.5 rounded-md border border-vault-gold/30 bg-vault-lapis-deep/20 p-3">
                  <legend className="text-sm font-medium text-vault-gold-bright">
                    {t("vault.charter.modeLabel")}
                  </legend>
                  <p className="-mt-1 text-xs text-muted-foreground">
                    {t("vault.charter.modeHelp")}
                  </p>
                  <RecoveryModeRadio
                    id="new-charter-single"
                    checked={newCharterMode === "single"}
                    onChange={() => setNewCharterMode("single")}
                    disabled={submitting}
                    label={t("vault.charter.modeSingle")}
                  />
                  <RecoveryModeRadio
                    id="new-charter-shamir"
                    checked={newCharterMode === "shamir2of3"}
                    onChange={() => setNewCharterMode("shamir2of3")}
                    disabled={submitting}
                    label={t("vault.charter.modeShamir")}
                  />
                  <RecoveryModeRadio
                    id="new-charter-none"
                    checked={newCharterMode === "none"}
                    onChange={() => setNewCharterMode("none")}
                    disabled={submitting}
                    label={t("vault.charter.modeNone")}
                    danger
                  />
                </fieldset>

                {errorMsg && (
                  <p className="text-xs text-destructive" role="alert">
                    {errorMsg}
                  </p>
                )}
              </div>
              <DialogFooter className="mt-2">
                <Button type="submit" disabled={!isValid}>
                  {t("vault.recovery.submitButton")}
                </Button>
              </DialogFooter>
            </form>
          </>
        )}
        {phase.kind === "issued" && (
          <CharterDisplay issuance={phase.issuance} onDone={handleIssuedDone} />
        )}
      </DialogContent>
    </Dialog>
  );
}

interface RecoveryModeRadioProps {
  id: string;
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  label: string;
  danger?: boolean;
}

function RecoveryModeRadio({
  id,
  checked,
  onChange,
  disabled,
  label,
  danger,
}: RecoveryModeRadioProps) {
  return (
    <label
      htmlFor={id}
      className={cn(
        "flex cursor-pointer items-center gap-2 rounded border border-transparent px-2 py-1 text-sm transition-colors",
        checked ? "border-vault-gold/60 bg-vault-gold/5" : "hover:border-vault-gold/30",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      <input
        id={id}
        type="radio"
        name={id.startsWith("new-charter") ? "new-charter-mode" : "recovery-mode"}
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        className="accent-vault-gold"
      />
      <span className={cn(danger ? "text-vault-danger" : "text-foreground")}>{label}</span>
    </label>
  );
}
