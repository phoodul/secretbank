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

/** zxcvbn 강도 점수(0~4)에 대응하는 색상 토큰과 레이블 키 */
const STRENGTH_CONFIG = [
  { colorClass: "bg-vault-danger", labelKey: "strengthVeryWeak" },
  { colorClass: "bg-vault-danger", labelKey: "strengthWeak" },
  { colorClass: "bg-vault-warning", labelKey: "strengthFair" },
  { colorClass: "bg-vault-success", labelKey: "strengthStrong" },
  { colorClass: "bg-vault-success", labelKey: "strengthVeryStrong" },
] as const;

interface VaultCommandError {
  code: "already_initialized" | "not_initialized" | "wrong_password" | "not_unlocked" | "internal";
}

interface CreateVaultDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 볼트 생성 성공 후 상태를 갱신하기 위해 호출 */
  onSuccess: () => void;
}

/**
 * 새 볼트를 초기화하는 다이얼로그.
 * vault_init Tauri 커맨드를 호출하고, 성공 시 onSuccess를 통해 상태를 갱신한다.
 */
export function CreateVaultDialog({ open, onOpenChange, onSuccess }: CreateVaultDialogProps) {
  const { t } = useTranslation("common");

  const [passphrase, setPassphrase] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

  // 강도 점수 계산 (passphrase가 비어있으면 -1)
  const score = passphrase.length > 0 ? zxcvbn(passphrase).score : -1;

  // 유효성 검사
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

    setSubmitting(true);
    setFieldError(null);

    try {
      await invoke("vault_init", { password: passphrase });
      toast.success(t("vault.vaultCreated"));
      onSuccess();
      onOpenChange(false);
    } catch (err) {
      const error = err as VaultCommandError;
      if (error?.code === "already_initialized") {
        toast.error(t("vault.alreadyInitialized"));
        onOpenChange(false);
      } else {
        setFieldError(t("vault.internalError"));
      }
    } finally {
      setSubmitting(false);
    }
  }

  // 다이얼로그가 닫힐 때 입력 초기화
  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setPassphrase("");
      setConfirm("");
      setFieldError(null);
    }
    onOpenChange(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
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
              {/* 강도 미터 (5구간 세그먼트 바) */}
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

            {/* 폼 수준 에러 */}
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
      </DialogContent>
    </Dialog>
  );
}

interface StrengthMeterProps {
  score: number;
  t: (key: string) => string;
}

/** 5구간 세그먼트 바 + 강도 레이블. 추가 패키지 없이 직접 구현. */
function StrengthMeter({ score, t }: StrengthMeterProps) {
  // score -1: 입력 없음, 0~4: zxcvbn 점수
  const filledCount = score + 1; // -1 → 0, 0 → 1, ... 4 → 5
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
