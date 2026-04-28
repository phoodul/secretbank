/**
 * M9 Phase D-3 — origin-aware Y.Map observer + db:changed bridge.
 *
 * 양방향 sync 의 두 기둥:
 *
 *   1. **db:changed bridge** — 백엔드 emit (Phase D-2b) 가 도착하면 해당
 *      Y.Map 항목을 `ORIGIN_LOCAL_DB` origin 으로 set/delete. observer
 *      (#2) 가 자기 origin 의 변경을 보고 propagate 를 skip 하므로 무한
 *      루프 방지.
 *   2. **observer** — 사용자(UI)가 일으킨 Y.Map 변경 (origin 없음 또는
 *      알려지지 않은 값) 만 콜백에 전달. 즉 user-edit propagation 채널.
 *      `ORIGIN_LOCAL_DB` / `ORIGIN_REMOTE` 변경은 무시.
 *
 * 본 파일은 두 함수 모두 doc-aware 이지만 SyncProvider 의 useEffect 와
 * 분리되어 있어 회귀 테스트가 격리해서 검증할 수 있다.
 */

import type * as Y from "yjs";

import {
  ENTITY_MAPPERS,
  isSyncableSettingKey,
  type SyncEntity,
} from "./mapping";
import { isSyncOrigin, ORIGIN_LOCAL_DB, runWithOrigin } from "./origin";

// ---------------------------------------------------------------------------
// observer — Y.Map → user-edit propagation
// ---------------------------------------------------------------------------

export interface YMapChange {
  key: string;
  action: "add" | "update" | "delete";
}

/**
 * Y.Map 변경을 observe 하되, sync framework 가 일으킨 origin
 * (`ORIGIN_LOCAL_DB` / `ORIGIN_REMOTE`) 의 변경은 콜백에 전달하지 않는다.
 *
 * 반환값은 unsubscribe 함수 — 호출 시 Y.Map.unobserve.
 */
export function observeMapWithOriginGuard<T>(
  map: Y.Map<T>,
  handler: (changes: YMapChange[]) => void,
): () => void {
  const observer = (event: Y.YMapEvent<T>, txn: Y.Transaction) => {
    if (isSyncOrigin(txn.origin)) return;

    const changes: YMapChange[] = [];
    for (const [key, change] of event.keys) {
      const action: YMapChange["action"] =
        change.action === "add"
          ? "add"
          : change.action === "delete"
            ? "delete"
            : "update";
      changes.push({ key, action });
    }
    if (changes.length > 0) handler(changes);
  };
  map.observe(observer);
  return () => map.unobserve(observer);
}

// ---------------------------------------------------------------------------
// db:changed bridge — Tauri payload → Y.Map (with ORIGIN_LOCAL_DB)
// ---------------------------------------------------------------------------

/**
 * 백엔드 `db:changed` 이벤트의 payload 형태 — `services/sync_emit.rs::DbChangePayload`
 * 와 wire-format 1:1 일치.
 */
export interface DbChangePayload {
  entity: SyncEntity;
  op: "upsert" | "delete";
  id: string;
}

/**
 * 단일 `db:changed` 이벤트를 Y.Doc 에 적용한다. Y.Map.set / Y.Map.delete 가
 * `ORIGIN_LOCAL_DB` transaction 안에서 일어나므로, observer 가 자기 origin
 * 을 보고 propagate 를 skip → 무한 루프 방지.
 *
 * **Upsert 의 의도적 placeholder**: 실제 row 는 백엔드가 가지고 있으며 본
 * bridge 는 "id 가 변경됐다" 는 정보만 propagate 한다. Phase D-2 / E 에서
 * SyncProvider 가 invoke('credential_get', id) 같은 hydration 호출로 실제
 * row 를 가져와 toYMap 한 후 Y.Map.set 하는 흐름이 추가된다. 본 phase 의
 * bridge 는 그 wiring 의 일부 — Y.Map 의 key 삭제 / 마커 set 만 담당.
 *
 * **Settings 화이트리스트**: `entity === "settings"` 면 `isSyncableSettingKey`
 * 로 필터 (project-decisions C 정책: 명시 opt-in 만 sync).
 */
export function applyDbChangeToYMap<T extends Record<string, unknown>>(
  doc: Y.Doc,
  payload: DbChangePayload,
  /** Y.Map 에 set 할 placeholder value (실제 hydration 은 호출자 책임). */
  upsertValue?: T,
): boolean {
  // settings 화이트리스트 — 안 들어있는 key 는 device-local 로 취급, sync 안 함.
  if (payload.entity === "settings" && !isSyncableSettingKey(payload.id)) {
    return false;
  }

  // entity 가 화이트리스트에 없으면 안전 skip.
  if (!(payload.entity in ENTITY_MAPPERS)) return false;

  const map = doc.getMap<T>(payload.entity);

  let applied = false;
  runWithOrigin(doc, ORIGIN_LOCAL_DB, () => {
    if (payload.op === "delete") {
      if (map.has(payload.id)) {
        map.delete(payload.id);
        applied = true;
      }
    } else {
      // upsert: caller-supplied value, or placeholder (empty object) so a
      // sibling device sees "this id changed" before the next hydration tick.
      // observer is intentionally fired even on placeholder writes — Phase E
      // 에서 hydration 으로 실제 row 가 채워질 때 다시 한 번 set 된다.
      const next = (upsertValue ?? ({} as T)) as T;
      map.set(payload.id, next);
      applied = true;
    }
  });
  return applied;
}
