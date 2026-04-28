/**
 * use-pair-joiner — M9 Phase G T093 (UI hook for the joining device).
 *
 * 흐름 (`services::pairing` 의 joiner_* 와 1:1 매핑):
 *   1. `parseDeepLink(url)` — `apivault://pair?pin=...&pub=...` 파서
 *   2. `start({ pin })` → invoke `sync_pair_joiner_join` → initiator_pub
 *      (서버측에 KV 채널 통해 검증) + 즉시 payload 가 있으면 apply.
 *   3. payload 없으면 `sync_pair_joiner_poll` polling 1.5s
 *   4. payload 받으면 invoke `sync_pair_joiner_apply`. 백엔드가 vault_init
 *      + vault_unlock + save_session 자동 처리 → status='completed'.
 *
 * UI 의 onCompleted 콜백이 vault status refresh 트리거 (LockScreen → main app).
 */

import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";

export type PairJoinerStatus =
  | "idle"
  | "joining"
  | "waiting_for_payload"
  | "applying"
  | "completed"
  | "error"
  | "cancelled";

interface JoinerJoinResult {
  initiator_pub_b64: string;
  payload_ciphertext_b64: string | null;
}

interface JoinerPollResult {
  payload_ciphertext_b64: string | null;
}

export interface UsePairJoinerState {
  status: PairJoinerStatus;
  errorMessage: string | null;
  /** Apply 성공 시 채워지는 user_id (UI 표시용). */
  userId: string | null;
}

export interface UsePairJoinerOptions {
  pollIntervalMs?: number;
}

export interface ParsedPairLink {
  pin: string;
  initiatorPubB64: string;
}

/**
 * Parse `apivault://pair?pin=<6digits>&pub=<base64url>` into structured data.
 * Returns `null` for malformed input — UI surface 에서 "잘못된 링크" 표시.
 */
export function parsePairDeepLink(url: string): ParsedPairLink | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "apivault:") return null;
    if (u.hostname !== "pair" && !u.pathname.includes("pair")) {
      // `apivault://pair?...` 의 경우 host="pair" / path=""
      // 일부 브라우저는 host 가 비고 pathname 으로 옴 — 둘 다 허용.
      return null;
    }
    const pin = u.searchParams.get("pin") ?? "";
    const pub = u.searchParams.get("pub") ?? "";
    if (!/^\d{6}$/.test(pin)) return null;
    if (pub.length === 0) return null;
    return { pin, initiatorPubB64: pub };
  } catch {
    return null;
  }
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

export function usePairJoiner(opts: UsePairJoinerOptions = {}) {
  const pollIntervalMs = opts.pollIntervalMs ?? 1500;

  const [state, setState] = useState<UsePairJoinerState>({
    status: "idle",
    errorMessage: null,
    userId: null,
  });

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pinRef = useRef<string | null>(null);
  const cancelledRef = useRef(false);
  const pollOnceRef = useRef<() => Promise<void>>(() => Promise.resolve());

  useEffect(() => {
    return () => {
      if (timerRef.current != null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

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

  const apply = async (pin: string, payloadCiphertextB64: string) => {
    setState((s) => ({ ...s, status: "applying" }));
    try {
      const userId = await invoke<string>("sync_pair_joiner_apply", {
        pin,
        payloadCiphertextB64,
      });
      if (cancelledRef.current) return;
      setState({ status: "completed", errorMessage: null, userId });
    } catch (e) {
      if (cancelledRef.current) return;
      setState({ status: "error", errorMessage: errorMessage(e), userId: null });
    } finally {
      stopTimer();
    }
  };

  // pollOnce: ref 안에서 latest closure 보관 (React Compiler 룰 호환).
  useEffect(() => {
    pollOnceRef.current = async () => {
      if (cancelledRef.current) return;
      const pin = pinRef.current;
      if (!pin) return;
      try {
        const result = await invoke<JoinerPollResult>("sync_pair_joiner_poll", { pin });
        if (cancelledRef.current) return;
        if (result.payload_ciphertext_b64) {
          await apply(pin, result.payload_ciphertext_b64);
        } else {
          scheduleNext();
        }
      } catch (e) {
        if (cancelledRef.current) return;
        setState((s) => ({ ...s, errorMessage: errorMessage(e) }));
        scheduleNext();
      }
    };
  });

  const start = useCallback(async (input: { pin: string }) => {
    cancelledRef.current = false;
    if (!/^\d{6}$/.test(input.pin)) {
      setState({
        status: "error",
        errorMessage: "PIN must be 6 digits",
        userId: null,
      });
      return;
    }
    pinRef.current = input.pin;
    setState({ status: "joining", errorMessage: null, userId: null });
    try {
      const result = await invoke<JoinerJoinResult>("sync_pair_joiner_join", {
        pin: input.pin,
      });
      if (cancelledRef.current) return;
      // 즉시 payload 가 와있으면 apply, 없으면 polling.
      if (result.payload_ciphertext_b64) {
        await apply(input.pin, result.payload_ciphertext_b64);
      } else {
        setState({ status: "waiting_for_payload", errorMessage: null, userId: null });
        scheduleNext();
      }
    } catch (e) {
      if (cancelledRef.current) return;
      setState({
        status: "error",
        errorMessage: errorMessage(e),
        userId: null,
      });
    }
    // ref-driven helpers — exhaustive deps 불필요.
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
