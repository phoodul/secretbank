/**
 * useDeepLinkCallback — OAuth loopback HTTP server 가 받은 callback URL 을
 * 단일 콜백으로 dispatch 한다.
 *
 * 흐름 (RFC 8252 + Google native app guidelines):
 * - Backend 의 `auth_oauth_start` 가 tauri-plugin-oauth 로 임시 loopback
 *   server 띄움. OAuth provider 가 `http://127.0.0.1:<port>/?code=...&state=...`
 *   로 redirect → server 가 받음 → `oauth-callback` Tauri event 로 emit.
 * - 본 훅은 그 event 를 listen, payload `{provider, url}` 를 파싱해
 *   `{provider, code, state}` 로 변환 후 콜백으로 넘긴다.
 *
 * Google/GitHub 의 custom URI scheme (`Secretbank://`, `app.secretbank://`,
 * `com.googleusercontent.apps...://`) 은 2026+ 모두 deprecated. loopback IP
 * 만 안전한 redirect URI.
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

interface RawOAuthEvent {
  provider: string;
  url: string;
}

/**
 * `Secretbank://auth/callback?provider=github&code=...&state=...` URL 을
 * 파싱해 OAuthCallbackPayload 로 변환한다. 실패 시 null.
 */
/**
 * Loopback callback URL (`http://127.0.0.1:<port>/?code=...&state=...`) +
 * provider (event payload 의 별도 field) 를 파싱해 OAuthCallbackPayload 반환.
 */
export function parseOAuthCallbackUrl(raw: RawOAuthEvent): OAuthCallbackPayload | null {
  let parsed: URL;
  try {
    parsed = new URL(raw.url);
  } catch {
    return null;
  }
  // Loopback IP 검증 — 다른 host 에서 온 event 는 거부.
  if (parsed.hostname !== "127.0.0.1" && parsed.hostname !== "localhost") return null;
  const code = parsed.searchParams.get("code");
  const state = parsed.searchParams.get("state");
  if (!code || !state || !raw.provider) return null;
  return { provider: raw.provider, code, state };
}

export function useDeepLinkCallback(handler: OAuthCallbackHandler | null): void {
  useEffect(() => {
    if (!handler) return;
    let cancelled = false;
    let unlisten: (() => void) | null = null;

    void (async () => {
      const { listen } = await import("@tauri-apps/api/event");
      const stop = await listen<RawOAuthEvent>("oauth-callback", (event) => {
        const payload = parseOAuthCallbackUrl(event.payload);
        if (payload) handler(payload);
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
