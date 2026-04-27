/**
 * PasskeyButton — Passkey (WebAuthn) 회원가입/로그인 단일 버튼.
 *
 * UX: assert 를 먼저 시도, `user_not_found` 일 때만 register 로 폴백.
 * 사용자는 첫 로그인 / 재로그인 구분을 의식할 필요가 없다.
 *
 * - assert/register `start` → 릴레이가 PublicKeyCredential*OptionsJSON 반환
 * - `@simplewebauthn/browser` 가 JSON ↔ navigator.credentials 변환 처리
 * - `verify` 가 성공하면 onSuccess 로 user_id / expires_at 전달
 */

import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { invoke } from "@tauri-apps/api/core";
import { Fingerprint, Loader2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";

interface PasskeyChallenge {
  user_id: string;
  options: unknown;
  salt_auth: string;
  salt_enc: string;
}

interface AuthSessionDto {
  user_id: string;
  expires_at: number;
}

interface AuthCommandError {
  code?: string;
  status?: number;
  body?: string;
  message?: string;
}

function isUserNotFoundError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as AuthCommandError;
  if (e.code === "relay" && e.status === 404 && typeof e.body === "string") {
    return e.body.includes("user_not_found") || e.body.includes("no_passkeys");
  }
  return false;
}

function errorMessage(err: unknown): string {
  if (typeof err === "object" && err !== null) {
    const e = err as AuthCommandError;
    if (typeof e.body === "string") return e.body;
    if (typeof e.message === "string") return e.message;
  }
  return String(err);
}

export interface PasskeyButtonProps {
  email: string;
  disabled?: boolean;
  onSuccess: (session: AuthSessionDto) => void;
  onError: (message: string) => void;
}

export function PasskeyButton({ email, disabled, onSuccess, onError }: PasskeyButtonProps) {
  const { t } = useTranslation("common");
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    if (busy || !email.trim()) return;
    setBusy(true);
    try {
      const session = await runAssertOrRegister(email.trim());
      onSuccess(session);
    } catch (err) {
      onError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      type="button"
      variant="default"
      size="lg"
      className="w-full"
      disabled={disabled || busy || !email.trim()}
      onClick={() => void handleClick()}
    >
      {busy ? (
        <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden />
      ) : (
        <Fingerprint className="h-4 w-4 mr-2" aria-hidden />
      )}
      {busy ? t("auth.passkey.working") : t("auth.passkey.continue")}
    </Button>
  );
}

async function runAssertOrRegister(email: string): Promise<AuthSessionDto> {
  // Try assertion first.
  let assertChallenge: PasskeyChallenge | null = null;
  try {
    assertChallenge = await invoke<PasskeyChallenge>("auth_passkey_assert_start", { email });
  } catch (err) {
    if (!isUserNotFoundError(err)) throw err;
  }

  if (assertChallenge) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await startAuthentication({ optionsJSON: assertChallenge.options as any });
    return invoke<AuthSessionDto>("auth_passkey_assert_verify", { email, response });
  }

  // Fall through to registration.
  const regChallenge = await invoke<PasskeyChallenge>("auth_passkey_register_start", { email });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response = await startRegistration({ optionsJSON: regChallenge.options as any });
  return invoke<AuthSessionDto>("auth_passkey_register_verify", { email, response });
}
