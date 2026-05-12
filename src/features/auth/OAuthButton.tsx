/**
 * OAuthButton — GitHub / Google OAuth 버튼.
 *
 * 흐름:
 * 1. 클릭 → `auth_oauth_start(provider, redirect_uri="Secretbank://auth/callback")`
 *    릴레이가 `state` + `authorize_url` 반환, Rust 쪽이 OS 브라우저 open.
 * 2. 사용자 동의 후 OAuth provider → 릴레이 callback → 릴레이가
 *    `Secretbank://auth/callback?provider=...&code=...&state=...` 로 다시 redirect.
 * 3. lib.rs deep-link listener 가 `deep-link` 이벤트로 forward → useDeepLinkCallback.
 * 4. 부모(SignInPage)가 콜백을 받아 `auth_oauth_callback` 호출.
 *
 * 본 컴포넌트는 (1) 까지만 책임지고, deep-link 수신 후 처리는 부모가 한다 —
 * 같은 페이지에 GitHub + Google 두 버튼이 있을 때 listener 중복을 막기 위함.
 */

import { invoke } from "@tauri-apps/api/core";
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { stringifyAuthError } from "./error";

export type OAuthProvider = "github" | "google";

// redirect_uri = Backend 가 tauri-plugin-oauth 로 띄운 임시 loopback HTTP
// server (`http://127.0.0.1:<port>`). Google/GitHub 의 custom URI scheme 은
// 2026+ 모두 deprecated. Backend `auth_oauth_start` 가 port 동적 할당 +
// callback 받아 `oauth-callback` Tauri event 로 forward.

interface OAuthStartResponse {
  state: string;
  authorize_url: string;
}

export interface OAuthButtonProps {
  provider: OAuthProvider;
  busy: boolean;
  disabled?: boolean;
  onStart: (provider: OAuthProvider, expectedState: string) => void;
  onError: (message: string) => void;
}

export function OAuthButton({ provider, busy, disabled, onStart, onError }: OAuthButtonProps) {
  const { t } = useTranslation("common");

  async function handleClick() {
    if (busy) return;
    try {
      const resp = await invoke<OAuthStartResponse>("auth_oauth_start", {
        provider,
      });
      onStart(provider, resp.state);
    } catch (err) {
      onError(stringifyAuthError(err));
    }
  }

  const label = provider === "github" ? t("auth.oauth.github") : t("auth.oauth.google");

  return (
    <Button
      type="button"
      variant="outline"
      size="lg"
      className="w-full"
      disabled={disabled || busy}
      onClick={() => void handleClick()}
    >
      {busy ? (
        <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden />
      ) : (
        <ProviderIcon provider={provider} />
      )}
      {label}
    </Button>
  );
}

/**
 * Inline brand glyphs — keeping these inside the auth feature so we don't
 * grow the lucide-react dep surface for icons that are only ever used here.
 * Sizes match the lucide 16px stroke style.
 */
function ProviderIcon({ provider }: { provider: OAuthProvider }) {
  if (provider === "github") {
    return (
      <svg aria-hidden className="h-4 w-4 mr-2" viewBox="0 0 16 16" fill="currentColor">
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z"
        />
      </svg>
    );
  }
  // google
  return (
    <svg aria-hidden className="h-4 w-4 mr-2" viewBox="0 0 24 24">
      <path
        fill="#EA4335"
        d="M5.27 9.76A7.08 7.08 0 0119 8.46l-4.5 4.5A4.5 4.5 0 005.5 12c0-.78.2-1.53.5-2.18l-.73-2.06z"
      />
      <path
        fill="#34A853"
        d="M12 19.5c2.43 0 4.47-.81 5.96-2.18l-2.91-2.26A4.5 4.5 0 017.84 13l-3.5 2.7A8.5 8.5 0 0012 19.5z"
      />
      <path
        fill="#FBBC05"
        d="M5.5 12c0-.78.2-1.53.5-2.18L2.5 7.04A8.5 8.5 0 002.5 12c0 1.45.36 2.83.99 4.05L7 13.34A4.46 4.46 0 015.5 12z"
      />
      <path
        fill="#4285F4"
        d="M22 12c0-.62-.06-1.21-.16-1.79H12v3.39h5.6a4.78 4.78 0 01-2.07 3.13l3.16 2.45A8.5 8.5 0 0022 12z"
      />
    </svg>
  );
}
