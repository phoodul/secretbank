/**
 * SyncProvider — M9 Phase C (Yjs + 자체 transport, fallback D 채택).
 *
 * Phase A 의 골격에 두 축을 추가한다:
 *   1. `sync_get_root_key` Tauri 커맨드를 mount 시 호출하여 Zero-Knowledge
 *      enc_key 의 HKDF 서브키 (32바이트) 를 받아 메모리에 보관.
 *   2. `SyncTransport` 추상화 (Phase C 는 `StubTransport`, Phase E 에서
 *      `RelayTransport` 로 교체) 를 lifecycle-managed 로 connect/disconnect.
 *
 * NoSyncSession (auth_session 또는 enc_key 없음) 시 status='offline_only' 로
 * 떨어지고 IndexedDB persistence 만 동작 — 사용자가 sign-in + unlock 하기
 * 전까지 안전한 정지 상태.
 *
 * 본 Provider 는 여전히 App.tsx 마운트 보류 — Phase D 의 SQLite ↔ Y.Map
 * 매퍼가 준비되어야 의미 있는 데이터가 동기화된다.
 */

import { invoke } from "@tauri-apps/api/core";
import { IndexeddbPersistence } from "y-indexeddb";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import * as Y from "yjs";

import { RelayTransport } from "./relay-transport";
import { StubTransport, type SyncTransport } from "./transport";

/** Lightweight subset of `auth_status` DTO consumed by Phase E-4b. */
interface AuthStatusDto {
  user_id: string;
  expires_at: number;
}

// ---------------------------------------------------------------------------
// Context shape
// ---------------------------------------------------------------------------

export type SyncStatus = "initializing" | "ready" | "offline_only" | "error";

export interface SyncContextValue {
  doc: Y.Doc;
  status: SyncStatus;
  error: string | null;
  /**
   * `sync_get_root_key` 결과 (32바이트). `null` 이면 sync 비활성 모드 — UI
   * 가 "Sign in / unlock to enable sync" 표시. AEAD 가 본격 적용되는 Phase
   * E 에서 이 값으로 snapshot/delta 키를 derive.
   */
  rootKey: Uint8Array | null;
  /** Lifecycle-managed transport. status='offline_only' 일 때는 idle 유지. */
  transport: SyncTransport;
}

const SyncContext = createContext<SyncContextValue | null>(null);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface SyncCommandError {
  code: string;
  message?: string;
}

function isNoSyncSession(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    (e as SyncCommandError).code === "no_sync_session"
  );
}

function decodeBase64Url(s: string): Uint8Array {
  // base64url → base64 (padding 복원)
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const b64 = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export interface SyncProviderProps {
  /**
   * IndexedDB 데이터베이스 이름. 사용자별로 고유해야 한다 — 사용자 변경 시
   * Provider 를 새 dbName 으로 remount 하여 다른 IndexedDB 로 격리.
   */
  dbName: string;
  /** Vitest jsdom 등 IndexedDB 부재 환경에서 persistence off. */
  disablePersistence?: boolean;
  /**
   * `sync_get_root_key` invoke 와 transport.connect() 를 둘 다 끔. 기본값
   * 은 `disablePersistence` 와 동일 — Phase A 의 unit 테스트 호환을 위함.
   * 명시적으로 `false` 를 주면 disablePersistence 모드에서도 invoke 호출.
   */
  disableSyncBoot?: boolean;
  /**
   * Transport 주입. 미공급 시 Phase E-4b 의 default — sync boot 가 invoke 3
   * 개 (sync_get_root_key, auth_status, sync_get_relay_url) 호출 후
   * RelayTransport 자동 생성 + connect.
   */
  transport?: SyncTransport;
  children: ReactNode;
}

export function SyncProvider({
  dbName,
  disablePersistence = false,
  disableSyncBoot,
  transport: providedTransport,
  children,
}: SyncProviderProps) {
  // Y.Doc 은 mount 당 단일 인스턴스 (lazy initializer 로 first-render 직전 생성).
  const [doc] = useState<Y.Doc>(() => new Y.Doc());

  // Transport 초기값: providedTransport 가 있으면 그걸, 아니면 StubTransport
  // (placeholder). default 흐름에선 sync boot effect 가 RelayTransport 로
  // setTransport 한다. unmount cleanup 은 항상 최종 transport 의 disconnect 호출.
  const [transport, setTransport] = useState<SyncTransport>(
    () => providedTransport ?? new StubTransport(),
  );

  const [status, setStatus] = useState<SyncStatus>("initializing");
  const [error, setError] = useState<string | null>(null);
  const [rootKey, setRootKey] = useState<Uint8Array | null>(null);

  // disableSyncBoot 의 기본값은 disablePersistence — Phase A 호환.
  const skipBoot = disableSyncBoot ?? disablePersistence;

  // disablePersistence 가 true 면 즉시 ready (테스트용 격리 모드).
  const initialReadyRef = useRef(disablePersistence);
  useEffect(() => {
    if (initialReadyRef.current && skipBoot) {
      setStatus("ready");
    }
  }, [skipBoot]);

  // IndexedDB persistence
  useEffect(() => {
    if (disablePersistence) return;
    let cancelled = false;
    let persistence: IndexeddbPersistence | null = null;

    queueMicrotask(() => {
      if (cancelled) return;
      try {
        persistence = new IndexeddbPersistence(dbName, doc);
        // persistence 'synced' 는 status 전환의 한 입력. sync boot 결과와
        // 합쳐 최종 status 를 결정 — 여기서는 일단 IndexedDB 가 ready 면
        // skipBoot 일 때만 status='ready' 로 올리고, sync boot 모드에선
        // boot effect 가 status 를 결정하도록 양보.
        persistence.once("synced", () => {
          if (cancelled) return;
          if (skipBoot) setStatus("ready");
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        if (!cancelled) {
          setError(message);
          setStatus("error");
        }
      }
    });

    return () => {
      cancelled = true;
      persistence?.destroy();
    };
  }, [dbName, doc, disablePersistence, skipBoot]);

  // sync boot — invoke('sync_get_root_key') (+ auth_status + sync_get_relay_url
  // when default transport) + transport.connect()
  useEffect(() => {
    if (skipBoot) return;
    let cancelled = false;

    (async () => {
      try {
        const b64 = await invoke<string>("sync_get_root_key");
        if (cancelled) return;
        const key = decodeBase64Url(b64);
        setRootKey(key);

        // Default 흐름 — RelayTransport 자동 생성 (providedTransport 미공급 시).
        let activeTransport = transport;
        if (!providedTransport) {
          const [authStatus, relayUrl] = await Promise.all([
            invoke<AuthStatusDto | null>("auth_status"),
            invoke<string>("sync_get_relay_url"),
          ]);
          if (cancelled) return;
          const userId = authStatus?.user_id;
          if (!userId) {
            // 세션은 있는데 user_id 가 비어있는 비정상 상태 — sync 비활성.
            setRootKey(null);
            setStatus("offline_only");
            return;
          }
          activeTransport = new RelayTransport({
            baseUrl: relayUrl,
            getAccessToken: () => invoke<string>("auth_get_access_token"),
            getSessionKey: () => ({ rootKey: key, userId }),
          });
          setTransport(activeTransport);
        }

        await activeTransport.connect();
        if (cancelled) {
          await activeTransport.disconnect();
          return;
        }
        setStatus("ready");
      } catch (e) {
        if (cancelled) return;
        if (isNoSyncSession(e)) {
          setRootKey(null);
          setStatus("offline_only");
          return;
        }
        const message =
          e instanceof Error
            ? e.message
            : typeof e === "object" && e !== null && "message" in e
              ? String((e as { message: unknown }).message)
              : String(e);
        setError(message);
        setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
    };
    // providedTransport 만 dep — transport 자체는 default 흐름에서 setTransport
    // 로 mid-effect 변경되므로 dep 에 넣으면 무한 재실행.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skipBoot, providedTransport]);

  // unmount cleanup — transport.disconnect() + doc.destroy()
  useEffect(() => {
    return () => {
      void transport.disconnect();
      doc.destroy();
    };
  }, [doc, transport]);

  const value = useMemo<SyncContextValue>(
    () => ({ doc, status, error, rootKey, transport }),
    [doc, status, error, rootKey, transport],
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export function useSync(): SyncContextValue {
  const ctx = useContext(SyncContext);
  if (ctx === null) {
    throw new Error(
      "useSync() must be called inside <SyncProvider>. (M9 Phase C: provider not yet mounted in App.tsx — see docs/m9-phase-plan.md)",
    );
  }
  return ctx;
}

/**
 * Convenience: get a Y.Map by key from the doc. Creates it if missing.
 *
 * Example: `const credentials = useYMap<Credential>('credentials')`.
 */
export function useYMap<T>(key: string): Y.Map<T> {
  const { doc } = useSync();
  return useMemo(() => doc.getMap<T>(key), [doc, key]);
}
