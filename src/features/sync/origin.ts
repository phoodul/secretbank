/**
 * Y.Doc transaction origin markers — M9 Phase D framework.
 *
 * 양방향 매퍼는 두 방향의 같은 변경이 무한 루프하는 위험이 있다:
 *   1. SQLite UPDATE → emit 'db:changed' → Y.Map.set
 *   2. Y.Map observe → invoke 'credential_update' → SQLite UPDATE → 1번 재발
 *
 * 해결: Yjs 의 transaction `origin` 인자를 사용해 "이 변경은 누가 일으켰는가"
 * 를 표시하고, observe handler 가 자기 origin 의 변경을 무시한다.
 *
 * - `ORIGIN_LOCAL_DB` — SQLite → Y.Map 방향 (db:changed 이벤트 처리 중)
 * - `ORIGIN_REMOTE`   — relay → Y.Map 방향 (Phase E 의 RelayTransport)
 *
 * 사용자(UI) 변경은 origin 없이 진행 — observe handler 가 이걸 보고 SQLite
 * 로 propagate. 그래서 두 origin 만 skip target 으로 정의.
 */

export const ORIGIN_LOCAL_DB = Symbol("apivault:sync:local-db");
export const ORIGIN_REMOTE = Symbol("apivault:sync:remote");

export type SyncOrigin = typeof ORIGIN_LOCAL_DB | typeof ORIGIN_REMOTE;

/**
 * `Y.Doc.transact(fn, origin)` 의 wrapper — origin 을 강제로 끼워 넣어
 * 호출자가 잊지 않도록 함. fn 안에서 발생한 모든 Y.Map 변경은 동일 origin
 * 으로 그룹화된다.
 */
export function runWithOrigin<T extends { transact: (fn: () => void, origin?: unknown) => void }>(
  doc: T,
  origin: SyncOrigin,
  fn: () => void,
): void {
  doc.transact(fn, origin);
}

/**
 * observe handler 안에서 "이 변경이 sync framework 가 일으킨 것인가" 를
 * 판정. true 면 propagate skip.
 */
export function isSyncOrigin(origin: unknown): origin is SyncOrigin {
  return origin === ORIGIN_LOCAL_DB || origin === ORIGIN_REMOTE;
}
