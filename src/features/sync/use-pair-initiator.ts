/**
 * use-pair-initiator — M9 Phase G T093 (UI hook).
 *
 * 흐름 (`services::pairing` 의 initiator_* 와 1:1 매핑):
 *   1. `start()` → invoke `sync_pair_initiator_start` → PIN + initiator_pub
 *   2. polling 으로 `invoke('sync_pair_initiator_poll', { pin })` 매 1.5s
 *   3. joiner_pub 받으면 `invoke('sync_pair_initiator_finalize', ...)` 자동
 *      호출 → 성공 → status='completed'
 *
 * UI 가 cancel 하면 `cancel()` 호출 — 내부 timer 정리 + invoke
 * `sync_pair_cancel`.
 *
 * 폴링 간격은 1500ms — relay 의 PAIR_RATE_LIMIT (30/min) 안에서 안전.
 */

import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";

export type PairInitiatorStatus =
  | "idle"
  | "starting"
  | "waiting_for_joiner"
  | "finalizing"
  | "completed"
  | "error"
  | "cancelled";

interface InitiatorStartResult {
  pin: string;
  initiator_pub_b64: string;
}

interface InitiatorPollResult {
  joiner_pub_b64: string | null;
}

export interface UsePairInitiatorState {
  status: PairInitiatorStatus;
  pin: string | null;
  /** Deep-link 포맷 — 사용자가 다른 디바이스에 직접 입력 / QR 로 옮김. */
  deepLink: string | null;
  errorMessage: string | null;
}

export interface UsePairInitiatorOptions {
  /** 폴링 간격 (ms). 테스트 격리용 default 1500. */
  pollIntervalMs?: number;
}

/**
 * Build the deep-link URL the joiner device opens to start its side of the
 * exchange. URL-encoded base64url 문자에 안전.
 */
export function buildPairDeepLink(pin: string, initiatorPubB64: string): string {
  const params = new URLSearchParams({ pin, pub: initiatorPubB64 });
  return `apivault://pair?${params.toString()}`;
}

function errorMessage(e: unknown): string {
  if (typeof e === "object" && e !== null) {
    if ("message" in e && typeof (e as { message: unknown }).message === "string") {
      return (e as { message: string }).message;
    }
    if ("code" in e) return String((e as { code: unknown }).code);
  }
  return e instanceof Error ? e.message : String(e);
}

export function usePairInitiator(opts: UsePairInitiatorOptions = {}) {
  const pollIntervalMs = opts.pollIntervalMs ?? 1500;

  const [state, setState] = useState<UsePairInitiatorState>({
    status: "idle",
    pin: null,
    deepLink: null,
    errorMessage: null,
  });

  // 모든 mutable 흐름은 ref 로 — useCallback 의 순환 의존성 회피.
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pinRef = useRef<string | null>(null);
  const cancelledRef = useRef(false);

  // unmount 시 timer 정리.
  useEffect(() => {
    return () => {
      if (timerRef.current != null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  // pollOnce 와 scheduleNext 가 상호 호출하므로 ref 로 stable reference 보관.
  // useCallback 의 hoisting 한계를 회피.
  const pollOnceRef = useRef<() => Promise<void>>(() => Promise.resolve());

  const stopTimer = () => {
    if (timerRef.current != null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const scheduleNext = () => {
    if (cancelledRef.current) return;
    timerRef.current = setTimeout(() => {
      void pollOnceRef.current();
    }, pollIntervalMs);
  };

  const finalize = async (pin: string, joinerPubB64: string) => {
    setState((s) => ({ ...s, status: "finalizing" }));
    try {
      await invoke("sync_pair_initiator_finalize", { pin, joinerPubB64 });
      if (cancelledRef.current) return;
      setState((s) => ({ ...s, status: "completed" }));
    } catch (e) {
      if (cancelledRef.current) return;
      const msg = errorMessage(e);
      setState((s) => ({ ...s, status: "error", errorMessage: msg }));
    } finally {
      stopTimer();
    }
  };

  // pollOnce 는 ref 안에 latest closure 보관 — useEffect 안에서 갱신해야
  // React Compiler 의 "no ref writes during render" 룰을 만족.
  useEffect(() => {
    pollOnceRef.current = async () => {
      if (cancelledRef.current) return;
      const pin = pinRef.current;
      if (!pin) return;
      try {
        const result = await invoke<InitiatorPollResult>("sync_pair_initiator_poll", { pin });
        if (cancelledRef.current) return;
        if (result.joiner_pub_b64) {
          await finalize(pin, result.joiner_pub_b64);
        } else {
          scheduleNext();
        }
      } catch (e) {
        if (cancelledRef.current) return;
        const msg = errorMessage(e);
        setState((s) => ({ ...s, errorMessage: msg }));
        scheduleNext();
      }
    };
    // finalize/scheduleNext 모두 ref / 상수 closure 기반이라 의존성 0.
  });

  const start = useCallback(async () => {
    cancelledRef.current = false;
    setState({ status: "starting", pin: null, deepLink: null, errorMessage: null });
    try {
      const result = await invoke<InitiatorStartResult>("sync_pair_initiator_start");
      if (cancelledRef.current) return;
      pinRef.current = result.pin;
      const link = buildPairDeepLink(result.pin, result.initiator_pub_b64);
      setState({
        status: "waiting_for_joiner",
        pin: result.pin,
        deepLink: link,
        errorMessage: null,
      });
      scheduleNext();
    } catch (e) {
      const msg = errorMessage(e);
      setState({
        status: "error",
        pin: null,
        deepLink: null,
        errorMessage: msg,
      });
    }
    // scheduleNext 는 ref-driven 이라 dep 불필요.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cancel = useCallback(async () => {
    cancelledRef.current = true;
    stopTimer();
    setState((s) => ({ ...s, status: "cancelled" }));
    try {
      await invoke("sync_pair_cancel");
    } catch {
      /* best-effort */
    }
  }, []);

  return {
    ...state,
    start,
    cancel,
  };
}
