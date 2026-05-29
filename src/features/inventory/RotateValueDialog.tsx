/**
 * RotateValueDialog — credential 의 시크릿 값을 새 값으로 교체한다.
 *
 * 백엔드 `credential_rotate_value` 가 vault 의 값을 덮어쓰고 hash_hint +
 * last_rotated_at 을 갱신하며 audit 를 남긴다. primary 값만 교체한다
 * (이중 시크릿의 secondary 는 범위 밖).
 */

import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { Eye, EyeOff } from "lucide-react";

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

export interface RotateValueDialogProps {
  open: boolean;
  credentialId: string;
  credentialName: string;
  onOpenChange: (open: boolean) => void;
  /** 교체 성공 시 호출 — 상세 화면 refetch 트리거. */
  onRotated: () => void;
}

export function RotateValueDialog({
  open,
  credentialId,
  credentialName,
  onOpenChange,
  onRotated,
}: RotateValueDialogProps) {
  const { t } = useTranslation("common");
  const [value, setValue] = useState("");
  const [showValue, setShowValue] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setValue("");
    setShowValue(false);
    setSubmitting(false);
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  async function handleSubmit() {
    if (value.length === 0 || submitting) return;
    setSubmitting(true);
    try {
      await invoke("credential_rotate_value", {
        input: {
          id: credentialId,
          value,
          hash_hint: value.slice(-4),
        },
      });
      toast.success(t("inventory.rotateSuccess"));
      reset();
      onOpenChange(false);
      onRotated();
    } catch (err: unknown) {
      const code =
        err !== null && typeof err === "object" && "code" in err
          ? (err as { code: string }).code
          : null;
      if (code === "not_unlocked") {
        toast.error(t("inventory.vaultLocked"));
      } else {
        toast.error(t("inventory.rotateFailed"));
      }
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("inventory.rotateTitle")}</DialogTitle>
          <DialogDescription>{t("inventory.rotateDescription")}</DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleSubmit();
          }}
          className="flex flex-col gap-3"
        >
          <label className="text-sm font-medium" htmlFor="rotate-new-value">
            {t("inventory.rotateNewValue")}
          </label>
          <div className="relative">
            <Input
              id="rotate-new-value"
              type={showValue ? "text" : "password"}
              autoComplete="new-password"
              aria-autocomplete="none"
              className="pr-10"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              autoFocus
            />
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={showValue ? t("inventory.hideValue") : t("inventory.showValue")}
              onClick={() => setShowValue((v) => !v)}
            >
              {showValue ? (
                <EyeOff className="size-4" aria-hidden />
              ) : (
                <Eye className="size-4" aria-hidden />
              )}
            </button>
          </div>

          <p className="text-xs text-muted-foreground">{credentialName}</p>

          <DialogFooter className="mt-1 gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleOpenChange(false)}
              disabled={submitting}
            >
              {t("quickAdd.cancel")}
            </Button>
            <Button type="submit" size="sm" disabled={value.length === 0 || submitting}>
              {submitting ? t("inventory.submitting") : t("inventory.rotateConfirm")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
