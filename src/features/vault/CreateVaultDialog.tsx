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

/** zxcvbn 강도 점수(0~4)에 대응하는 색상 토큰과 레이블 키 */
const STRENGTH_CONFIG = [
  { colorClass: "bg-vault-danger", labelKey: "strengthVeryWeak" },
  { colorClass: "bg-vault-danger", labelKey: "strengthWeak" },
  { colorClass: "bg-vault-warning", labelKey: "strengthFair" },
  { colorClass: "bg-vault-success", labelKey: "strengthStrong" },
  { colorClass: "bg-vault-success", labelKey: "strengthVeryStrong" },
] as const;

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

type CharterModeChoice = "single" | "shamir2of3" | "none";

interface CreateVaultDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 볼트 생성 성공 후 상태를 갱신하기 위해 호출 */
  onSuccess: () => void;
}

type Phase =
  | { kind: "input" }
  | { kind: "issuing" }
  | { kind: "issued"; issuance: CharterIssuanceDto };

/**
 * 새 볼트 초기화 + Vault Charter 발급 다이얼로그.
 *
 * step 1: 패스프레이즈 + Charter 모드 선택
 * step 2: Charter 발급 결과 표시 (Single / Shamir / None) — 인쇄 가능
 * step 3: 사용자 "저장 완료" → onSuccess
 */
export function CreateVaultDialog({ open, onOpenChange, onSuccess }: CreateVaultDialogProps) {
  const { t } = useTranslation("common");

  const [passphrase, setPassphrase] = useState("");
  const [confirm, setConfirm] = useState("");
  const [mode, setMode] = useState<CharterModeChoice>("single");
  const [phase, setPhase] = useState<Phase>({ kind: "input" });
  const [fieldError, setFieldError] = useState<string | null>(null);

  const submitting = phase.kind === "issuing";
  const score = passphrase.length > 0 ? zxcvbn(passphrase).score : -1;
  const tooShort = passphrase.length > 0 && passphrase.length < 12;
  const mismatch = confirm.length > 0 && passphrase !== confirm;
  const isValid = passphrase.length >= 12 && passphrase === confirm && !submitting;

  function handlePassphraseChange(e: React.ChangeEvent<HTMLInputElement>) {
    setPassphrase(e.target.value);
    setFieldError(null);
  }

  function handleConfirmChange(e: React.ChangeEvent<HTMLInputElement>) {
    setConfirm(e.target.value);
    setFieldError(null);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!isValid) return;

    setPhase({ kind: "issuing" });
    setFieldError(null);

    try {
      const issuance = (await invoke("vault_init_with_charter", {
        password: passphrase,
        mode,
      })) as CharterIssuanceDto;
      // 패스프레이즈 메모리에서 즉시 폐기.
      setPassphrase("");
      setConfirm("");
      toast.success(t("vault.vaultCreated"));
      // None 모드는 표시할 charter 가 없으므로 즉시 success 처리.
      if (issuance.kind === "none") {
        setPhase({ kind: "input" });
        onSuccess();
        onOpenChange(false);
        return;
      }
      setPhase({ kind: "issued", issuance });
    } catch (err) {
      const error = err as VaultCommandError;
      if (error?.code === "already_initialized") {
        toast.error(t("vault.alreadyInitialized"));
        onOpenChange(false);
      } else {
        setFieldError(t("vault.internalError"));
      }
      setPhase({ kind: "input" });
    }
  }

  function handleIssuanceDone() {
    setPhase({ kind: "input" });
    onSuccess();
    onOpenChange(false);
  }

  // 다이얼로그가 닫힐 때 입력 초기화 — 단, issued phase 일 때는 사용자가 명시 confirm 해야.
  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && phase.kind === "issued") {
      // issued 화면에서 ESC / outside-click 닫기를 막는다.
      // CharterDisplay 의 "I've saved it" 클릭으로만 닫힘.
      return;
    }
    if (!nextOpen) {
      setPassphrase("");
      setConfirm("");
      setFieldError(null);
      setPhase({ kind: "input" });
    }
    onOpenChange(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className={cn(phase.kind === "issued" ? "sm:max-w-2xl" : "sm:max-w-md")}>
        {phase.kind !== "issued" && (
          <>
            <DialogHeader>
              <DialogTitle>{t("vault.createVaultTitle")}</DialogTitle>
              <DialogDescription>{t("vault.createVaultDescription")}</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} noValidate>
              <div className="flex flex-col gap-4 py-2">
                {/* 패스프레이즈 입력 */}
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="create-passphrase">{t("vault.newPassphraseLabel")}</Label>
                  <Input
                    id="create-passphrase"
                    type="password"
                    autoComplete="new-password"
                    placeholder={t("vault.newPassphrasePlaceholder")}
                    value={passphrase}
                    onChange={handlePassphraseChange}
                    aria-invalid={tooShort}
                    aria-describedby="passphrase-strength passphrase-error"
                    disabled={submitting}
                  />
                  {passphrase.length > 0 && <StrengthMeter score={score} t={t} />}
                  {tooShort && (
                    <p className="text-xs text-destructive" role="alert">
                      {t("vault.passphraseMinLength")}
                    </p>
                  )}
                </div>

                {/* 확인 입력 */}
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="create-confirm">{t("vault.confirmPassphraseLabel")}</Label>
                  <Input
                    id="create-confirm"
                    type="password"
                    autoComplete="new-password"
                    placeholder={t("vault.confirmPassphrasePlaceholder")}
                    value={confirm}
                    onChange={handleConfirmChange}
                    aria-invalid={mismatch}
                    disabled={submitting}
                  />
                  {mismatch && (
                    <p className="text-xs text-destructive" role="alert">
                      {t("vault.passphraseMismatch")}
                    </p>
                  )}
                </div>

                {/* Charter 모드 선택 */}
                <CharterModeSelector value={mode} onChange={setMode} disabled={submitting} />

                {fieldError && (
                  <p className="text-xs text-destructive" role="alert" id="passphrase-error">
                    {fieldError}
                  </p>
                )}
              </div>
              <DialogFooter className="mt-4">
                <Button type="submit" disabled={!isValid}>
                  {t("vault.createButton")}
                </Button>
              </DialogFooter>
            </form>
          </>
        )}
        {phase.kind === "issued" && (
          <CharterDisplay issuance={phase.issuance} onDone={handleIssuanceDone} />
        )}
      </DialogContent>
    </Dialog>
  );
}

interface CharterModeSelectorProps {
  value: CharterModeChoice;
  onChange: (next: CharterModeChoice) => void;
  disabled?: boolean;
}

function CharterModeSelector({ value, onChange, disabled }: CharterModeSelectorProps) {
  const { t } = useTranslation("common");
  return (
    <fieldset className="flex flex-col gap-2 rounded-md border border-vault-gold/30 bg-vault-lapis-deep/20 p-3">
      <legend className="text-sm font-medium text-vault-gold-bright">
        {t("vault.charter.modeLabel")}
      </legend>
      <p className="-mt-1 text-xs text-muted-foreground">{t("vault.charter.modeHelp")}</p>
      <div className="mt-1 flex flex-col gap-1.5">
        <ModeRadio
          id="charter-mode-single"
          value="single"
          checked={value === "single"}
          onChange={() => onChange("single")}
          disabled={disabled}
          label={t("vault.charter.modeSingle")}
          help={t("vault.charter.modeSingleHelp")}
        />
        <ModeRadio
          id="charter-mode-shamir"
          value="shamir2of3"
          checked={value === "shamir2of3"}
          onChange={() => onChange("shamir2of3")}
          disabled={disabled}
          label={t("vault.charter.modeShamir")}
          help={t("vault.charter.modeShamirHelp")}
        />
        <ModeRadio
          id="charter-mode-none"
          value="none"
          checked={value === "none"}
          onChange={() => onChange("none")}
          disabled={disabled}
          label={t("vault.charter.modeNone")}
          danger
        />
      </div>
    </fieldset>
  );
}

interface ModeRadioProps {
  id: string;
  value: string;
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  label: string;
  help?: string;
  danger?: boolean;
}

function ModeRadio({
  id,
  value,
  checked,
  onChange,
  disabled,
  label,
  help,
  danger,
}: ModeRadioProps) {
  return (
    <label
      htmlFor={id}
      className={cn(
        "flex cursor-pointer items-start gap-2 rounded border border-transparent px-2 py-1.5 transition-colors",
        checked ? "border-vault-gold/60 bg-vault-gold/5" : "hover:border-vault-gold/30",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      <input
        id={id}
        type="radio"
        name="charter-mode"
        value={value}
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        className="mt-1 accent-vault-gold"
      />
      <div className="flex flex-col">
        <span
          className={cn("text-sm font-medium", danger ? "text-vault-danger" : "text-foreground")}
        >
          {label}
        </span>
        {help && <span className="text-xs text-muted-foreground">{help}</span>}
      </div>
    </label>
  );
}

interface StrengthMeterProps {
  score: number;
  t: (key: string) => string;
}

/** 5구간 세그먼트 바 + 강도 레이블. 추가 패키지 없이 직접 구현. */
function StrengthMeter({ score, t }: StrengthMeterProps) {
  const filledCount = score + 1;
  const config = score >= 0 ? STRENGTH_CONFIG[score] : null;
  return (
    <div id="passphrase-strength" aria-live="polite">
      <div
        className="flex gap-1"
        role="img"
        aria-label={config ? t(`vault.${config.labelKey}`) : ""}
      >
        {Array.from({ length: 5 }, (_, i) => (
          <div
            key={i}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors",
              i < filledCount && config ? config.colorClass : "bg-muted",
            )}
          />
        ))}
      </div>
      {config && (
        <p className="mt-1 text-xs text-muted-foreground">{t(`vault.${config.labelKey}`)}</p>
      )}
    </div>
  );
}
