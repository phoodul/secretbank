/**
 * M9 Phase D-3 — origin loop 회귀.
 *
 * 두 layer 의 결합 검증:
 *   - `observeMapWithOriginGuard` 가 sync origin (LOCAL_DB / REMOTE) 의
 *     변경을 콜백에 전달하지 않는다.
 *   - `applyDbChangeToYMap` 가 ORIGIN_LOCAL_DB transaction 으로 set/delete
 *     하므로 observer 의 콜백이 호출되지 않는다 (= 무한 루프 방지).
 *   - 사용자(UI)가 일으킨 변경은 정상 propagate.
 */
import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import { applyDbChangeToYMap, observeMapWithOriginGuard } from "../observer";
import { ORIGIN_LOCAL_DB, ORIGIN_REMOTE, runWithOrigin } from "../origin";

describe("observeMapWithOriginGuard (Phase D-3)", () => {
  it("ignores ORIGIN_LOCAL_DB transactions (db→Y propagation)", () => {
    const doc = new Y.Doc();
    const map = doc.getMap<string>("credential");
    const calls: unknown[] = [];

    const off = observeMapWithOriginGuard(map, (changes) => calls.push(changes));

    runWithOrigin(doc, ORIGIN_LOCAL_DB, () => {
      map.set("crd_1", "blob");
    });

    expect(calls).toHaveLength(0);
    off();
    doc.destroy();
  });

  it("ignores ORIGIN_REMOTE transactions (relay→Y propagation)", () => {
    const doc = new Y.Doc();
    const map = doc.getMap<string>("credential");
    const calls: unknown[] = [];

    const off = observeMapWithOriginGuard(map, (changes) => calls.push(changes));

    runWithOrigin(doc, ORIGIN_REMOTE, () => {
      map.set("crd_1", "blob");
    });

    expect(calls).toHaveLength(0);
    off();
    doc.destroy();
  });

  it("forwards user-origin changes (no origin or unknown origin)", () => {
    const doc = new Y.Doc();
    const map = doc.getMap<string>("credential");
    const calls: import("../observer").YMapChange[][] = [];

    observeMapWithOriginGuard(map, (changes) => calls.push(changes));

    // origin 없음 — 사용자 직접 변경
    map.set("crd_1", "user-set");
    // 알려지지 않은 origin (다른 라이브러리 등) — 사용자로 간주
    doc.transact(() => {
      map.set("crd_2", "ext");
    }, "ext-lib");

    expect(calls).toHaveLength(2);
    expect(calls[0][0]).toMatchObject({ key: "crd_1", action: "add" });
    expect(calls[1][0]).toMatchObject({ key: "crd_2", action: "add" });
    doc.destroy();
  });

  it("returned unsubscribe function detaches the observer", () => {
    const doc = new Y.Doc();
    const map = doc.getMap<string>("credential");
    const calls: unknown[] = [];

    const off = observeMapWithOriginGuard(map, (changes) => calls.push(changes));
    map.set("a", "1");
    expect(calls).toHaveLength(1);

    off();
    map.set("b", "2");
    expect(calls).toHaveLength(1); // no further calls
    doc.destroy();
  });
});

describe("applyDbChangeToYMap (Phase D-3)", () => {
  it("upsert sets the key with a placeholder when no value is supplied", () => {
    const doc = new Y.Doc();
    const applied = applyDbChangeToYMap(doc, {
      entity: "credential",
      op: "upsert",
      id: "crd_1",
    });
    expect(applied).toBe(true);
    expect(doc.getMap<unknown>("credential").has("crd_1")).toBe(true);
    doc.destroy();
  });

  it("upsert with explicit value stores it directly", () => {
    const doc = new Y.Doc();
    applyDbChangeToYMap<{ name: string }>(
      doc,
      { entity: "project", op: "upsert", id: "prj_1" },
      { name: "Acme" },
    );
    const map = doc.getMap<{ name: string }>("project");
    expect(map.get("prj_1")).toEqual({ name: "Acme" });
    doc.destroy();
  });

  it("delete removes the key (only when present)", () => {
    const doc = new Y.Doc();
    const map = doc.getMap<unknown>("credential");
    map.set("crd_1", { dummy: true });

    const applied = applyDbChangeToYMap(doc, {
      entity: "credential",
      op: "delete",
      id: "crd_1",
    });
    expect(applied).toBe(true);
    expect(map.has("crd_1")).toBe(false);

    // delete on missing key — no-op (returns false)
    const applied2 = applyDbChangeToYMap(doc, {
      entity: "credential",
      op: "delete",
      id: "crd_999",
    });
    expect(applied2).toBe(false);
    doc.destroy();
  });

  it("settings entity respects SYNC_SETTING_KEYS whitelist", () => {
    const doc = new Y.Doc();

    const ok = applyDbChangeToYMap(doc, {
      entity: "settings",
      op: "upsert",
      id: "Secretbank.settings.security.auto_lock_minutes",
    });
    expect(ok).toBe(true);

    const skipped = applyDbChangeToYMap(doc, {
      entity: "settings",
      op: "upsert",
      id: "Secretbank.settings.ui.theme", // not in whitelist
    });
    expect(skipped).toBe(false);
    expect(doc.getMap<unknown>("settings").has("Secretbank.settings.ui.theme")).toBe(false);
    doc.destroy();
  });
});

describe("origin loop integration (Phase D-3)", () => {
  it("applyDbChangeToYMap → observer does NOT fire (no infinite loop)", () => {
    const doc = new Y.Doc();
    const map = doc.getMap<unknown>("credential");
    const userChangeCalls: unknown[] = [];

    observeMapWithOriginGuard(map, (changes) => userChangeCalls.push(changes));

    // 여러 db:changed 이벤트가 도착해도 user-change 콜백은 한 번도 호출되면 안 됨.
    applyDbChangeToYMap(doc, {
      entity: "credential",
      op: "upsert",
      id: "crd_1",
    });
    applyDbChangeToYMap(doc, {
      entity: "credential",
      op: "upsert",
      id: "crd_2",
    });
    applyDbChangeToYMap(doc, {
      entity: "credential",
      op: "delete",
      id: "crd_1",
    });

    expect(userChangeCalls).toHaveLength(0);
    // Y.Map state 자체는 정상 업데이트
    expect(map.has("crd_1")).toBe(false);
    expect(map.has("crd_2")).toBe(true);
    doc.destroy();
  });

  it("Phase G-conflict: credential delete is rejected when current status='revoked' (tombstone)", () => {
    const doc = new Y.Doc();
    const map = doc.getMap<Record<string, unknown>>("credential");
    map.set("crd_revoked", { status: "revoked", name: "old" });

    const applied = applyDbChangeToYMap(doc, {
      entity: "credential",
      op: "delete",
      id: "crd_revoked",
    });
    expect(applied).toBe(false);
    // tombstone 유지
    expect(map.has("crd_revoked")).toBe(true);
    expect(map.get("crd_revoked")?.status).toBe("revoked");
    doc.destroy();
  });

  it("Phase G-conflict: credential upsert with active status cannot downgrade revoked", () => {
    const doc = new Y.Doc();
    const map = doc.getMap<Record<string, unknown>>("credential");
    map.set("crd_1", { status: "revoked", name: "v1" });

    applyDbChangeToYMap<Record<string, unknown>>(
      doc,
      { entity: "credential", op: "upsert", id: "crd_1" },
      { status: "active", name: "v2" },
    );
    const after = map.get("crd_1");
    expect(after?.status).toBe("revoked"); // 유지
    expect(after?.name).toBe("v2"); // 다른 필드는 incoming 채택
    doc.destroy();
  });

  it("user edit fires observer; subsequent db:changed echo does not", () => {
    const doc = new Y.Doc();
    const map = doc.getMap<unknown>("credential");
    const calls: import("../observer").YMapChange[][] = [];

    observeMapWithOriginGuard(map, (changes) => calls.push(changes));

    // 1. UI edit (user origin) — propagate (콜백 호출)
    map.set("crd_1", { v: 1 });
    // 2. 백엔드가 emit 한 db:changed echo — propagate skip (origin guard)
    applyDbChangeToYMap(doc, {
      entity: "credential",
      op: "upsert",
      id: "crd_1",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual([{ key: "crd_1", action: "add" }]);
    doc.destroy();
  });
});
