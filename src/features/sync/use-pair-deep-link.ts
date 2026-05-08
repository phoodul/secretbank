/**
 * use-pair-deep-link — listen for `Secretbank://pair?...` deep-links.
 *
 * 별도 hook 으로 분리 (auth 의 use-deep-link-callback 과 분리) 한 이유:
 *   - auth callback 은 BrowserRouter 안 (vault unlocked 후) 에서만 활성
 *   - pair deep-link 은 LockScreen (vault uninitialized) 에서도 활성
 *   - 두 흐름이 서로 다른 시점 / lifecycle 을 가짐
 */
import { useEffect } from "react";

export type PairDeepLinkHandler = (url: string) => void;

export function usePairDeepLink(handler: PairDeepLinkHandler | null): void {
  useEffect(() => {
    if (!handler) return;
    let cancelled = false;
    let unlisten: (() => void) | null = null;

    void (async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        const stop = await listen<string[]>("deep-link", (event) => {
          const urls = event.payload;
          if (!Array.isArray(urls)) return;
          for (const url of urls) {
            if (typeof url === "string" && url.startsWith("Secretbank://pair")) {
              handler(url);
              return;
            }
          }
        });
        if (cancelled) {
          stop();
        } else {
          unlisten = stop;
        }
      } catch {
        // Tauri runtime 부재 (Vitest jsdom 등) — listener 등록 skip.
      }
    })();

    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, [handler]);
}
