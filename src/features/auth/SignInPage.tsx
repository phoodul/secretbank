/**
 * SignInPage — `/auth/sign-in` 라우트.
 *
 * 로컬 vault 가 unlock 된 상태에서만 진입한다 (App.tsx 라우팅이 보장).
 * 클라우드 동기화(M9) 활성화 흐름의 단일 시작점으로, 사용자는 다음 중 하나로
 * 릴레이 세션을 만들 수 있다:
 *
 * 1. **Continue with passkey** — 이메일 입력 후 WebAuthn 세리머니
 * 2. **Continue with GitHub / Google** — OAuth (브라우저 → 딥링크 → callback)
 * 3. **Keep offline** — 그냥 `/settings` 로 돌아간다 (동기화 없이 로컬만 사용)
 *
 * 성공 시 toast 알림 + `/settings` 로 이동. M9 진입 후 `/settings/sync` 라우트가
 * 생기면 그 쪽으로 바꾼다 (`docs/task.md` T084 DoD 참조).
 */

import { invoke } from "@tauri-apps/api/core";
import { ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

import { stringifyAuthError } from "./error";
import { OAuthButton, type OAuthProvider } from "./OAuthButton";
import { PasskeyButton } from "./PasskeyButton";
import { useDeepLinkCallback, type OAuthCallbackPayload } from "./use-deep-link-callback";

interface AuthSessionDto {
  user_id: string;
  expires_at: number;
}

interface PendingOAuth {
  provider: OAuthProvider;
  expectedState: string;
}

export function SignInPage() {
  const { t } = useTranslation("common");
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [pending, setPending] = useState<PendingOAuth | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Use a ref so the deep-link handler always sees the latest pending state
  // without needing to re-register the listener every render.
  const pendingRef = useRef<PendingOAuth | null>(null);
  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  const handleSuccess = useCallback(
    (session: AuthSessionDto) => {
      toast.success(t("auth.signedInAs", { email: email.trim() || session.user_id }));
      navigate("/settings");
    },
    [email, navigate, t],
  );

  const handleError = useCallback((message: string) => {
    setError(message);
    setPending(null);
    toast.error(message);
  }, []);

  const handleDeepLink = useCallback(
    (payload: OAuthCallbackPayload) => {
      const expected = pendingRef.current;
      if (!expected) return; // ignore stale links
      if (payload.provider !== expected.provider) {
        handleError(t("auth.oauth.providerMismatch"));
        return;
      }
      if (payload.state !== expected.expectedState) {
        handleError(t("auth.oauth.stateMismatch"));
        return;
      }
      void invoke<AuthSessionDto>("auth_oauth_callback", {
        provider: payload.provider,
        code: payload.code,
        oauthState: payload.state,
      })
        .then((session) => {
          setPending(null);
          handleSuccess(session);
        })
        .catch((err: unknown) => {
          handleError(stringifyAuthError(err));
        });
    },
    [handleError, handleSuccess, t],
  );

  useDeepLinkCallback(handleDeepLink);

  function handleKeepOffline() {
    navigate("/settings");
  }

  const oauthBusy = (provider: OAuthProvider) => pending !== null && pending.provider === provider;
  const anyBusy = pending !== null;

  return (
    <div className="bg-background flex min-h-screen items-center justify-center px-4 py-8">
      <div className="w-full max-w-md space-y-6">
        <div className="space-y-2 text-center">
          <div className="bg-primary/10 mx-auto flex h-12 w-12 items-center justify-center rounded-full">
            <ShieldCheck className="text-primary h-6 w-6" aria-hidden />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("auth.signIn.title")}</h1>
          <p className="text-muted-foreground text-sm">{t("auth.signIn.subtitle")}</p>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="auth-email">{t("auth.signIn.emailLabel")}</Label>
            <Input
              id="auth-email"
              type="email"
              autoComplete="email"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={anyBusy}
            />
          </div>

          <PasskeyButton
            email={email}
            disabled={anyBusy}
            onSuccess={handleSuccess}
            onError={handleError}
          />

          <div className="relative">
            <Separator />
            <span className="bg-background text-muted-foreground absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 px-2 text-xs uppercase tracking-wider">
              {t("auth.signIn.or")}
            </span>
          </div>

          <div className="space-y-2">
            <OAuthButton
              provider="github"
              busy={oauthBusy("github")}
              disabled={anyBusy && !oauthBusy("github")}
              onStart={(provider, expectedState) => setPending({ provider, expectedState })}
              onError={handleError}
            />
            <OAuthButton
              provider="google"
              busy={oauthBusy("google")}
              disabled={anyBusy && !oauthBusy("google")}
              onStart={(provider, expectedState) => setPending({ provider, expectedState })}
              onError={handleError}
            />
          </div>

          {error && (
            <div
              role="alert"
              className="border-destructive/50 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm"
            >
              {error}
            </div>
          )}

          <Separator />

          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full"
            disabled={anyBusy}
            onClick={handleKeepOffline}
          >
            {t("auth.signIn.keepOffline")}
          </Button>
          <p className="text-muted-foreground text-center text-xs">
            {t("auth.signIn.keepOfflineHint")}
          </p>
        </div>
      </div>
    </div>
  );
}
