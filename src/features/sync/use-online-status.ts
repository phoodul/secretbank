/**
 * use-online-status — M9 Phase G T096.
 *
 * `navigator.onLine` + `window` 의 'online'/'offline' 이벤트로 단순 boolean
 * 노출. SyncProvider 의 transport status 와 결합하면 더 풍부한 상태 (예:
 * online but rate-limited) 를 표현 가능 — 본 hook 은 OS-level 네트워크
 * 가용성만 다룬다.
 *
 * SSR / non-browser 환경에서는 `true` 기본값 (가용성 가정).
 */
import { useEffect, useState } from "react";

export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState<boolean>(() => {
    if (typeof navigator === "undefined") return true;
    return navigator.onLine;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return online;
}
