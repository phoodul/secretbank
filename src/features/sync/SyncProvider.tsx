/**
 * SyncProvider — M9 Phase A scaffold (Yjs + y-indexeddb only).
 *
 * 본 파일은 M9 진입의 첫 단계로, **SecSync 통합 이전** 의 안전한 골격이다:
 * - `Y.Doc` 인스턴스 1개를 Context 로 노출 (앱 전체 단일)
 * - `y-indexeddb` 가 도큐먼트를 IndexedDB 에 영속 (오프라인 지원의 기반)
 * - 외부 transport (relay /sync, SecSync) 는 아직 연결 안 함 — Phase C/E 에서 도입
 *
 * 따라서 본 Provider 는 import 만 해두고 App.tsx 마운트는 **하지 않는다**:
 * 마운트하면 IndexedDB DB 가 생성되어 dev 환경에 잔재가 쌓일 수 있어 deferred.
 *
 * 다음 phase 진입 조건은 `docs/m9-phase-plan.md` 참조.
 */

import { IndexeddbPersistence } from "y-indexeddb";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import * as Y from "yjs";

// ---------------------------------------------------------------------------
// Context shape
// ---------------------------------------------------------------------------

export type SyncStatus = "initializing" | "ready" | "error";

export interface SyncContextValue {
  doc: Y.Doc;
  status: SyncStatus;
  error: string | null;
}

const SyncContext = createContext<SyncContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export interface SyncProviderProps {
  /**
   * IndexedDB 데이터베이스 이름. 사용자별로 고유해야 한다 — Phase B 에서
   * `auth_session.user_id` 또는 hash 한 user_id 를 prefix 로 한다.
   */
  dbName: string;
  /** 테스트 등에서 IndexedDB persistence 를 끄고 in-memory 만 쓸 때. */
  disablePersistence?: boolean;
  children: ReactNode;
}

export function SyncProvider({
  dbName,
  disablePersistence = false,
  children,
}: SyncProviderProps) {
  // Lazy initializer ensures the Y.Doc is constructed exactly once, before
  // first render, without violating "no ref writes during render" lint rule.
  const [doc] = useState<Y.Doc>(() => new Y.Doc());

  const [status, setStatus] = useState<SyncStatus>(
    disablePersistence ? "ready" : "initializing",
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (disablePersistence) return;
    let cancelled = false;
    let persistence: IndexeddbPersistence | null = null;

    // Wrap construction in a try/catch and defer setState into microtasks so
    // the `react-hooks/set-state-in-effect` rule treats this as an external-
    // system bridge rather than a synchronous cascade.
    queueMicrotask(() => {
      if (cancelled) return;
      try {
        persistence = new IndexeddbPersistence(dbName, doc);
        persistence.once("synced", () => {
          if (!cancelled) setStatus("ready");
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
  }, [dbName, doc, disablePersistence]);

  // doc destruction on unmount — frees Yjs internal observers.
  useEffect(() => {
    return () => {
      doc.destroy();
    };
  }, [doc]);

  const value = useMemo<SyncContextValue>(
    () => ({ doc, status, error }),
    [doc, status, error],
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
      "useSync() must be called inside <SyncProvider>. (Phase A: not yet mounted in App.tsx — see docs/m9-phase-plan.md)",
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
