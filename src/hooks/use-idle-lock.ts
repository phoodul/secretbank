import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

import { useAutoLockMinutes } from "@/features/settings/use-settings";

/**
 * 설정된 분 동안 키보드/마우스 입력이 없으면 vault_lock 을 호출한다.
 *
 * - minutes === 0 ("Never") 이면 리스너/타이머를 등록하지 않는다.
 * - 이벤트마다 clearTimeout + setTimeout 재설정 패턴 사용 (단순·충분).
 * - lock 성공 시 "vault-lock" CustomEvent dispatch → useVaultStatus 가 refresh.
 * - lock 실패 시 console.error 만 (UI 방해 금지).
 */
export function useIdleLock(): void {
  const { value: minutes } = useAutoLockMinutes();
  const enabled = minutes > 0;

  useEffect(() => {
    if (!enabled) return;

    const ms = minutes * 60 * 1000;
    let timer: ReturnType<typeof window.setTimeout> | undefined;

    const lock = async () => {
      try {
        await invoke("vault_lock");
        window.dispatchEvent(new CustomEvent("vault-lock"));
      } catch (err) {
        console.error("auto-lock failed", err);
      }
    };

    const reset = () => {
      if (timer !== undefined) window.clearTimeout(timer);
      timer = window.setTimeout(() => void lock(), ms);
    };

    const events = ["mousemove", "keydown", "touchstart", "wheel", "scroll"] as const;
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset(); // 초기 타이머 시작

    return () => {
      events.forEach((e) => window.removeEventListener(e, reset));
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [enabled, minutes]);
}
