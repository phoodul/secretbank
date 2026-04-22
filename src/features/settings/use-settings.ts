import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UseSettingOptions<T> {
  key: string;
  defaultValue: T;
  parse: (raw: string) => T;
  serialize: (value: T) => string;
}

interface UseSettingResult<T> {
  value: T;
  loading: boolean;
  setValue: (next: T) => Promise<void>;
}

type SettingState<T> =
  | { phase: "loading" }
  | { phase: "ok"; value: T }
  | { phase: "error"; value: T };

// ---------------------------------------------------------------------------
// Generic hook
// ---------------------------------------------------------------------------

export function useSetting<T>(opts: UseSettingOptions<T>): UseSettingResult<T> {
  const { key, defaultValue, parse, serialize } = opts;

  const [state, setState] = useState<SettingState<T>>({ phase: "loading" });

  // 최신 state 를 setValue 내에서 읽기 위한 ref — effect/callback 안에서만 씀
  const stateRef = useRef<SettingState<T>>({ phase: "loading" });

  useEffect(() => {
    // ref 동기화는 effect 안에서만 수행 (render 중 수정 금지)
    stateRef.current = state;
  });

  useEffect(() => {
    let cancelled = false;

    invoke<string | null>("settings_get", { key })
      .then((raw) => {
        if (cancelled) return;
        const value = raw != null ? parse(raw) : defaultValue;
        setState({ phase: "ok", value });
      })
      .catch(() => {
        if (cancelled) return;
        setState({ phase: "error", value: defaultValue });
      });

    return () => {
      cancelled = true;
    };
    // parse/serialize/defaultValue 는 렌더 사이 참조 안정성을 보장하지 않으므로
    // key 변경 시에만 재조회한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const setValue = useCallback(
    async (next: T) => {
      const cur = stateRef.current;
      const prev = cur.phase !== "loading" ? cur.value : defaultValue;

      // 낙관적 업데이트
      setState({ phase: "ok", value: next });

      try {
        await invoke("settings_set", { key, value: serialize(next) });
      } catch {
        // 실패 시 이전 값 복원
        setState({ phase: "ok", value: prev });
        toast.error("Failed to save setting");
      }
    },
    [key, serialize, defaultValue],
  );

  return {
    value: state.phase !== "loading" ? state.value : defaultValue,
    loading: state.phase === "loading",
    setValue,
  };
}

// ---------------------------------------------------------------------------
// Auto-lock convenience hook
// ---------------------------------------------------------------------------

export const AUTO_LOCK_KEY = "apivault.settings.security.auto_lock_minutes";

const VALID_AUTO_LOCK_VALUES = [0, 5, 15, 30] as const;
export type AutoLockMinutes = (typeof VALID_AUTO_LOCK_VALUES)[number];

function parseAutoLock(raw: string): AutoLockMinutes {
  const n = Number.parseInt(raw, 10);
  return (VALID_AUTO_LOCK_VALUES as readonly number[]).includes(n) ? (n as AutoLockMinutes) : 5;
}

export function useAutoLockMinutes(): UseSettingResult<AutoLockMinutes> {
  return useSetting<AutoLockMinutes>({
    key: AUTO_LOCK_KEY,
    defaultValue: 5,
    parse: parseAutoLock,
    serialize: (v) => String(v),
  });
}
