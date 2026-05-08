import * as React from "react";
import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { motion } from "motion/react";

import { Button } from "@/components/ui/button";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LanguageSwitcher } from "@/components/language-switcher";
import { PairJoinerDialog } from "@/features/sync/PairJoinerDialog";
import { usePairDeepLink } from "@/features/sync/use-pair-deep-link";
import { CreateVaultDialog } from "./CreateVaultDialog";
import { RecoveryDialog } from "./RecoveryDialog";
import { VaultMechanism, type VaultState } from "./VaultMechanism";
import {
  ParticleField,
  ScanlineOverlay,
  SuccessBloom,
  StatusPanel,
  CornerOrnaments,
  LightBeamSweep,
  SystemLog,
  useMouseGloss,
  useShake,
} from "./LockScreenAtmosphere";

/** 잠금 해제 성공 후 메커니즘 정렬 애니메이션이 끝날 때까지 기다리는 시간.
 *  ringTransition 의 cubic-bezier ease-out (1.4s) + snapDelay 0.54s + 여유 = 약 1.95s.
 *  마지막 ring (snapDelay=0.54) 가 1.4s 후 끝나므로 1940ms 가 안전선. */
const UNLOCK_ANIMATION_MS = 1940;

/** 연속 실패 횟수가 이 값에 도달하면 쿨다운을 시작한다 */
const MAX_ATTEMPTS = 3;
/** 쿨다운 시간(초) */
const COOLDOWN_SECONDS = 10;

interface VaultCommandError {
  code:
    | "already_initialized"
    | "not_initialized"
    | "wrong_password"
    | "not_unlocked"
    | "cooldown_active"
    | "charter_absent"
    | "charter_invalid"
    | "charter_parse_error"
    | "internal";
  seconds_remaining?: number;
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
  const [vaultState, setVaultState] = useState<VaultState>("idle");
  const { shaking, trigger: triggerShake, triggerKey: shakeKey } = useShake();
  const mouseGloss = useMouseGloss();
  /** 연속 실패 횟수 추적 — ref로 관리하여 effect 의존성 문제 방지 */
  const failCountRef = useRef(0);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [pairOpen, setPairOpen] = useState(false);
  const [pairPrefillUrl, setPairPrefillUrl] = useState<string | undefined>(undefined);
  const [hasCharter, setHasCharter] = useState(false);
  const [recoveryOpen, setRecoveryOpen] = useState(false);

  // Mount 시 vault 가 charter envelope 을 가지고 있는지 확인. showCreate=false 인 경우만
  // 의미가 있다 (이미 vault 가 있는 경우). showCreate=true 면 vault 자체가 없어 false.
  useEffect(() => {
    if (showCreate) {
      setHasCharter(false);
      return;
    }
    invoke("vault_has_charter")
      .then((v) => setHasCharter(Boolean(v)))
      .catch(() => setHasCharter(false));
  }, [showCreate]);

  // Deep-link auto-route — Secretbank://pair?... 로 진입하면 PairJoinerDialog
  // 자동 open. uninitialized 상태에서만 (showCreate=true) listener 활성.
  usePairDeepLink(
    showCreate
      ? (url) => {
          setPairPrefillUrl(url);
          setPairOpen(true);
        }
      : null,
  );

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
    setVaultState("verifying");

    try {
      await invoke("vault_unlock", { password });
      // 성공: 카운터 초기화 + 메커니즘 정렬 애니메이션 → onSuccess
      failCountRef.current = 0;
      setCooldownRemaining(0);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setVaultState("unlocking");
      window.setTimeout(() => {
        setVaultState("unlocked");
        // 정렬 후 잠시 글로우 → 다음 화면으로 전환
        window.setTimeout(() => onSuccess(), 220);
      }, UNLOCK_ANIMATION_MS);
    } catch (err) {
      const error = err as VaultCommandError;
      setVaultState("idle");
      if (error?.code === "wrong_password") {
        setErrorMsg(t("vault.wrongPassword"));
        triggerShake();
        failCountRef.current += 1;
        // 3회 연속 실패 시 쿨다운 시작
        if (failCountRef.current >= MAX_ATTEMPTS) {
          failCountRef.current = 0;
          startCooldown();
        }
      } else if (error?.code === "cooldown_active") {
        // Charter 복구 후 7일 잠금 — UI 에 일자/시간 단위로 표시.
        const seconds = error.seconds_remaining ?? 0;
        const hours = Math.ceil(seconds / 3600);
        setErrorMsg(t("vault.charterCooldownActive", { hours }));
        triggerShake();
      } else {
        setErrorMsg(t("vault.internalError"));
        triggerShake();
      }
    } finally {
      setSubmitting(false);
      setPassword("");
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center px-4 overflow-hidden">
      {/* Layer 0 — Blueprint engineering grid (deepest backdrop) */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-20"
        style={{
          backgroundImage:
            "linear-gradient(oklch(from var(--vault-lapis-bright) l c h / 0.04) 1px, transparent 1px), linear-gradient(90deg, oklch(from var(--vault-lapis-bright) l c h / 0.04) 1px, transparent 1px), linear-gradient(oklch(from var(--vault-lapis-bright) l c h / 0.07) 1px, transparent 1px), linear-gradient(90deg, oklch(from var(--vault-lapis-bright) l c h / 0.07) 1px, transparent 1px)",
          backgroundSize: "40px 40px, 40px 40px, 200px 200px, 200px 200px",
          maskImage: "radial-gradient(ellipse 80% 60% at 50% 50%, black 0%, transparent 80%)",
          WebkitMaskImage: "radial-gradient(ellipse 80% 60% at 50% 50%, black 0%, transparent 80%)",
        }}
      />
      {/* Layer 1 — Ambient depth gradient */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          backgroundImage:
            "radial-gradient(700px 480px at 50% 16%, oklch(from var(--vault-lapis-glow) l c h / 0.28) 0%, transparent 60%), radial-gradient(900px 600px at 50% 100%, oklch(from var(--vault-gold-glow) l c h / 0.10) 0%, transparent 65%)",
        }}
      />

      {/* Layer 2 — Drifting particle dust */}
      <ParticleField state={vaultState} />

      {/* Layer 3 — CRT scanline overlay */}
      <ScanlineOverlay />

      {/* Layer 4 — Success radial bloom (only during/after unlock) */}
      <SuccessBloom state={vaultState} />

      {/* Top-right corner — global language switcher (11 locales).
          페이지 레벨 절대 위치 — vault card 의 모션과 분리. */}
      <div className="absolute right-4 top-4 z-10">
        <LanguageSwitcher variant="corner" />
      </div>

      <motion.section
        className="surface-vault gloss-shimmer relative w-full max-w-sm rounded-xl overflow-hidden"
        aria-labelledby="lockscreen-title"
        initial={{ opacity: 0, scale: 0.94, filter: "blur(8px)" }}
        animate={
          shaking
            ? {
                opacity: 1,
                scale: 1,
                filter: "blur(0px)",
                x: [0, -8, 7, -6, 5, -3, 0],
                boxShadow: [
                  "0 0 0 0 transparent",
                  "0 0 28px 4px oklch(from var(--vault-danger) l c h / 0.55)",
                  "0 0 0 0 transparent",
                ],
              }
            : vaultState === "unlocked"
              ? {
                  opacity: [1, 0.85],
                  scale: [1, 1.04, 1.06],
                  filter: ["blur(0px)", "blur(0px)", "blur(2px)"],
                  x: 0,
                  boxShadow: [
                    "0 16px 48px -8px oklch(from var(--vault-gold-glow) l c h / 0.0)",
                    "0 16px 64px 0 oklch(from var(--vault-gold-glow) l c h / 0.45)",
                    "0 24px 80px 8px oklch(from var(--vault-gold-glow) l c h / 0.6)",
                  ],
                }
              : { opacity: 1, scale: 1, filter: "blur(0px)", x: 0 }
        }
        transition={
          shaking
            ? { duration: 0.5, ease: "easeOut" }
            : vaultState === "unlocked"
              ? { duration: 0.45, ease: [0.22, 1, 0.36, 1] }
              : { duration: 0.7, ease: [0.22, 1, 0.36, 1] }
        }
        custom={shakeKey}
        onMouseMove={vaultState === "idle" ? mouseGloss.onMouseMove : undefined}
        onMouseLeave={vaultState === "idle" ? mouseGloss.onMouseLeave : undefined}
      >
        <LightBeamSweep />
        {mouseGloss.layer}
        <CornerOrnaments />

        <div className="px-8 pt-8 pb-4">
          {/* Live vault mechanism — concentric tumbler rings rotate, snap into
            alignment on unlock, brass center pulses gold on success. */}
          <CardHeader className="items-center gap-4 text-center p-0 pb-6">
            <VaultMechanism state={vaultState} size={140} />
            <CardTitle
              id="lockscreen-title"
              className="text-2xl font-semibold accent-gold-glow"
              style={{ letterSpacing: "0.04em" }}
            >
              {t("vault.unlockTitle")}
            </CardTitle>
            <CardDescription
              className="text-[15px]"
              style={{
                color: "oklch(0.92 0.02 240)",
                textShadow: "0 1px 0 oklch(0 0 0 / 0.4)",
              }}
            >
              {t("vault.unlockSubtitle")}
            </CardDescription>
            {/* Engraved tactical label — subtle "this is a secure system" cue */}
            <div
              className="mt-1 flex items-center gap-2 text-[10px] font-mono"
              style={{
                letterSpacing: "0.18em",
                color: "oklch(from var(--vault-gold) l c h / 0.72)",
                textShadow: "0 1px 0 oklch(0 0 0 / 0.6)",
              }}
              aria-hidden
            >
              <span
                className="inline-block h-px w-8"
                style={{
                  background:
                    "linear-gradient(90deg, transparent, oklch(from var(--vault-gold) l c h / 0.6))",
                }}
              />
              <span>AUTH · REQUIRED</span>
              <span
                className="inline-block h-px w-8"
                style={{
                  background:
                    "linear-gradient(90deg, oklch(from var(--vault-gold) l c h / 0.6), transparent)",
                }}
              />
            </div>
          </CardHeader>

          <CardContent className="p-0">
            <form onSubmit={handleSubmit} noValidate>
              <div className="flex flex-col gap-5">
                <div className="flex flex-col gap-2">
                  <Label
                    htmlFor="unlock-passphrase"
                    className="text-[11px] font-semibold uppercase tracking-[0.14em] accent-gold"
                  >
                    {t("vault.passphraseLabel")}
                  </Label>
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
                    className="ring-lapis bg-input/40 border-vault-lapis/20 backdrop-blur-sm"
                  />
                </div>

                {/* 인라인 에러 또는 쿨다운 메시지 */}
                {inCooldown ? (
                  <p
                    className="text-sm font-medium"
                    role="alert"
                    aria-live="polite"
                    style={{
                      color: "oklch(0.85 0.18 28)",
                      textShadow: "0 1px 0 oklch(0 0 0 / 0.5)",
                    }}
                  >
                    {t("vault.tooManyAttempts", { count: cooldownRemaining })}
                  </p>
                ) : (
                  errorMsg && (
                    <p
                      id="unlock-error"
                      className="text-sm font-medium"
                      role="alert"
                      style={{
                        color: "oklch(0.85 0.18 28)",
                        textShadow: "0 1px 0 oklch(0 0 0 / 0.5)",
                      }}
                    >
                      {errorMsg}
                    </p>
                  )
                )}

                <Button
                  type="submit"
                  disabled={isDisabled || !password}
                  className="gloss-shimmer w-full font-medium tracking-wide"
                >
                  {t("vault.unlockButton")}
                </Button>

                {/* Initialized + charter 보유 vault — Forgot passphrase 진입점 */}
                {!showCreate && hasCharter && (
                  <button
                    type="button"
                    className="text-xs font-medium underline-offset-4 hover:underline"
                    style={{
                      color: "oklch(from var(--vault-gold) l c h / 0.78)",
                      textShadow: "0 1px 0 oklch(0 0 0 / 0.4)",
                    }}
                    onClick={() => setRecoveryOpen(true)}
                    data-testid="lockscreen-forgot-link"
                  >
                    {t("vault.recovery.forgotLink")}
                  </button>
                )}

                {/* uninitialized 상태일 때만 CreateVault + Pair 링크 표시 */}
                {showCreate && (
                  <div
                    className="mt-2 flex flex-col items-center gap-2 pt-4"
                    style={{
                      borderTop: "1px solid oklch(from var(--vault-lapis-bright) l c h / 0.18)",
                    }}
                  >
                    <button
                      type="button"
                      className="text-sm font-medium transition-colors underline-offset-4 hover:underline"
                      style={{
                        color: "oklch(0.86 0.04 240)",
                        textShadow: "0 1px 0 oklch(0 0 0 / 0.4)",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = "var(--vault-gold-bright)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = "oklch(0.86 0.04 240)";
                      }}
                      onClick={() => setCreateOpen(true)}
                    >
                      {t("vault.createVaultLink")}
                    </button>
                    <button
                      type="button"
                      className="text-sm font-medium transition-colors underline-offset-4 hover:underline"
                      style={{
                        color: "oklch(0.86 0.04 240)",
                        textShadow: "0 1px 0 oklch(0 0 0 / 0.4)",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = "var(--vault-gold-bright)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = "oklch(0.86 0.04 240)";
                      }}
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
        </div>
        <SystemLog state={vaultState} />
        <StatusPanel state={vaultState} />
      </motion.section>

      {showCreate && (
        <>
          <CreateVaultDialog open={createOpen} onOpenChange={setCreateOpen} onSuccess={onSuccess} />
          <PairJoinerDialog
            open={pairOpen}
            onOpenChange={setPairOpen}
            onSuccess={onSuccess}
            prefillUrl={pairPrefillUrl}
          />
        </>
      )}
      {!showCreate && hasCharter && (
        <RecoveryDialog open={recoveryOpen} onOpenChange={setRecoveryOpen} onSuccess={onSuccess} />
      )}
    </div>
  );
}
