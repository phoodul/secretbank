import * as React from "react";
import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PairJoinerDialog } from "@/features/sync/PairJoinerDialog";
import { CreateVaultDialog } from "./CreateVaultDialog";

/** 연속 실패 횟수가 이 값에 도달하면 쿨다운을 시작한다 */
const MAX_ATTEMPTS = 3;
/** 쿨다운 시간(초) */
const COOLDOWN_SECONDS = 10;

interface VaultCommandError {
  code: "already_initialized" | "not_initialized" | "wrong_password" | "not_unlocked" | "internal";
}

interface LockScreenProps {
  /** 볼트가 초기화되지 않은 경우 true — CreateVault 링크를 표시한다 */
  showCreate: boolean;
  /** 잠금 해제 또는 볼트 생성 성공 후 상태를 갱신하기 위해 호출 */
  onSuccess: () => void;
}

/**
 * 볼트 잠금 해제 화면.
 * - 3회 연속 실패 시 10초 쿨다운
 * - showCreate=true 일 때 CreateVaultDialog 링크 표시
 */
export function LockScreen({ showCreate, onSuccess }: LockScreenProps) {
  const { t } = useTranslation("common");

  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  /** 연속 실패 횟수 추적 — ref로 관리하여 effect 의존성 문제 방지 */
  const failCountRef = useRef(0);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [pairOpen, setPairOpen] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  /** 쿨다운 진행 중 여부 */
  const inCooldown = cooldownRemaining > 0;
  const isDisabled = submitting || inCooldown;

  /** 쿨다운 카운트다운 타이머 시작 */
  function startCooldown() {
    if (timerRef.current) clearInterval(timerRef.current);
    setCooldownRemaining(COOLDOWN_SECONDS);

    timerRef.current = setInterval(() => {
      setCooldownRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          timerRef.current = null;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  // 언마운트 시 타이머 정리
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // 쿨다운이 끝나면 입력에 포커스
  useEffect(() => {
    if (!inCooldown && !submitting) {
      inputRef.current?.focus();
    }
  }, [inCooldown, submitting]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isDisabled || !password) return;

    setSubmitting(true);
    setErrorMsg(null);

    try {
      await invoke("vault_unlock", { password });
      // 성공: 카운터 초기화 후 상위 컴포넌트에 알림
      failCountRef.current = 0;
      setCooldownRemaining(0);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      onSuccess();
    } catch (err) {
      const error = err as VaultCommandError;
      if (error?.code === "wrong_password") {
        setErrorMsg(t("vault.wrongPassword"));
        failCountRef.current += 1;
        // 3회 연속 실패 시 쿨다운 시작
        if (failCountRef.current >= MAX_ATTEMPTS) {
          failCountRef.current = 0;
          startCooldown();
        }
      } else {
        setErrorMsg(t("vault.internalError"));
      }
    } finally {
      setSubmitting(false);
      setPassword("");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center gap-2 text-center">
          <ShieldCheck className="size-10 text-primary" aria-hidden="true" />
          <CardTitle>{t("vault.unlockTitle")}</CardTitle>
          <CardDescription>{t("vault.unlockSubtitle")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} noValidate>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="unlock-passphrase">{t("vault.passphraseLabel")}</Label>
                <Input
                  id="unlock-passphrase"
                  ref={inputRef}
                  type="password"
                  autoComplete="current-password"
                  autoFocus
                  placeholder={t("vault.passphrasePlaceholder")}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setErrorMsg(null);
                  }}
                  disabled={isDisabled}
                  aria-invalid={!!errorMsg}
                  aria-describedby={errorMsg ? "unlock-error" : undefined}
                />
              </div>

              {/* 인라인 에러 또는 쿨다운 메시지 */}
              {inCooldown ? (
                <p className="text-sm text-destructive" role="alert" aria-live="polite">
                  {t("vault.tooManyAttempts", { count: cooldownRemaining })}
                </p>
              ) : (
                errorMsg && (
                  <p id="unlock-error" className="text-sm text-destructive" role="alert">
                    {errorMsg}
                  </p>
                )
              )}

              <Button type="submit" disabled={isDisabled || !password}>
                {t("vault.unlockButton")}
              </Button>

              {/* uninitialized 상태일 때만 CreateVault + Pair 링크 표시 */}
              {showCreate && (
                <div className="flex flex-col gap-2 items-start">
                  <button
                    type="button"
                    className="text-sm text-muted-foreground underline-offset-4 hover:underline"
                    onClick={() => setCreateOpen(true)}
                  >
                    {t("vault.createVaultLink")}
                  </button>
                  <button
                    type="button"
                    className="text-sm text-muted-foreground underline-offset-4 hover:underline"
                    onClick={() => setPairOpen(true)}
                    data-testid="lockscreen-pair-link"
                  >
                    {t("vault.pairWithDeviceLink")}
                  </button>
                </div>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      {showCreate && (
        <>
          <CreateVaultDialog open={createOpen} onOpenChange={setCreateOpen} onSuccess={onSuccess} />
          <PairJoinerDialog open={pairOpen} onOpenChange={setPairOpen} onSuccess={onSuccess} />
        </>
      )}
    </div>
  );
}
