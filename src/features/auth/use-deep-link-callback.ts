/**
 * useDeepLinkCallback — OS 가 `app.secretbank://auth/callback?...` URL 을 열면
 * 단일 콜백으로 dispatch 한다.
 *
 * lib.rs (Phase C) 에서 deep_link.on_open_url 이 `deep-link` 이벤트로 `Vec<String>`
 * (URL 목록) 을 emit 한다. 본 훅은 그 이벤트를 listen,
 * `app.secretbank://auth/callback` prefix 일치하는 URL 만 파싱해
 * `provider`/`code`/`state` 를 콜백으로 넘긴다.
 *
 * scheme = `app.secretbank` 은 Google Desktop OAuth 정책의 "reverse-DNS
 * notation" 요구에 맞춤 (secretbank.app 도메인 reverse-DNS).
 *
 * 한 번에 하나의 OAuth 흐름만 진행한다고 가정한다 (UI 상 동시 클릭 방지).
 */

import { useEffect } from "react";

export interface OAuthCallbackPayload {
  provider: string;
  code: string;
  state: string;
}

export type OAuthCallbackHandler = (payload: OAuthCallbackPayload) => void;

// Provider 별 prefix:
// - Google: com.googleusercontent.apps.<client_id>://oauth2redirect
//   (Google docs 표준, 2-segment reverse-DNS 검증 우회)
// - GitHub: app.secretbank://auth/callback
// - Legacy: Secretbank://auth/callback (옛 installer in-flight 호환)
const CALLBACK_PREFIXES = [
  "com.googleusercontent.apps.522239075495-b72lmghgcgeei7ddm9h2957le92c8oo1://oauth2redirect",
  "app.secretbank://auth/callback",
  "Secretbank://auth/callback",
];

/**
 * `Secretbank://auth/callback?provider=github&code=...&state=...` URL 을
 * 파싱해 OAuthCallbackPayload 로 변환한다. 실패 시 null.
 */
export function parseOAuthCallbackUrl(raw: string): OAuthCallbackPayload | null {
  if (!CALLBACK_PREFIXES.some((p) => raw.startsWith(p))) return null;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  const code = parsed.searchParams.get("code");
  const state = parsed.searchParams.get("state");
  if (!code || !state) return null;

  // explicit `?provider=...` query 우선. 없으면 scheme 으로 추론.
  let provider = parsed.searchParams.get("provider");
  if (!provider) {
    if (parsed.protocol.startsWith("com.googleusercontent.apps.")) {
      provider = "google";
    } else if (parsed.protocol === "app.secretbank:" || parsed.protocol === "secretbank:") {
      provider = "github"; // 그 외 OAuth provider 는 향후 추가 시 분기
    }
  }
  if (!provider) return null;
  return { provider, code, state };
}

export function useDeepLinkCallback(handler: OAuthCallbackHandler | null): void {
  useEffect(() => {
    if (!handler) return;
    let cancelled = false;
    let unlisten: (() => void) | null = null;

    void (async () => {
      const { listen } = await import("@tauri-apps/api/event");
      const stop = await listen<string[]>("deep-link", (event) => {
        const urls = event.payload;
        if (!Array.isArray(urls)) return;
        for (const url of urls) {
          const payload = parseOAuthCallbackUrl(url);
          if (payload) {
            handler(payload);
            return;
          }
        }
      });
      if (cancelled) {
        stop();
      } else {
        unlisten = stop;
      }
    })();

    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, [handler]);
}
