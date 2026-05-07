/**
 * GATE 1-1: HIBP opt-in 훅 — localStorage 기반, 기본값 비활성.
 *
 * 평문 비번은 다루지 않으며, force_hibp 플래그만 제어한다.
 */

import { useCallback, useState } from "react";

const STORAGE_KEY = "apivault.hibp_opt_in";

export function useHibpOptIn() {
  const [optIn, setOptIn] = useState<boolean>(() => localStorage.getItem(STORAGE_KEY) === "true");

  const toggle = useCallback((value: boolean) => {
    localStorage.setItem(STORAGE_KEY, String(value));
    setOptIn(value);
  }, []);

  return { optIn, toggle };
}
