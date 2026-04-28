/**
 * M9 Phase E-5 — 통합 round-trip.
 *
 * 두 Y.Doc + 두 RelayTransport 가 in-memory mock store 를 공유. A 디바이스
 * 가 push → 같은 사용자의 B 디바이스가 poll → AEAD decrypt → applyUpdate →
 * 양쪽 Y.Doc state 가 동일해진다.
 *
 * 검증 매트릭스:
 *   1. A 의 Y.Map.set → push → B 의 poll → applyUpdate → B 의 Y.Map 에서
 *      같은 값 read.
 *   2. multi-write: A 가 두 번 push → B 가 한 번 poll 로 최신 snapshot 가져옴.
 *   3. Zero-Knowledge: store 에 저장된 envelope 에는 평문이 없다 (key 없는
 *      attacker 시점에 decrypt 시도 시 throw).
 */
import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import { decrypt, encrypt } from "../aead";
import { RelayTransport } from "../relay-transport";

const KEY = new Uint8Array(32).fill(0x77);
const USER_ID = "usr_round_trip_alice";

// ---------------------------------------------------------------------------
// In-memory mock relay
// ---------------------------------------------------------------------------

interface MockSnapshot {
  version: number;
  ciphertext_b64: string | null;
}

class MockRelay {
  private store = new Map<string, MockSnapshot>();

  fetchImpl: typeof fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method ?? "GET";
    const auth = ((init?.headers ?? {}) as Record<string, string>).Authorization;
    if (!auth || !auth.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "missing_bearer_token" }), { status: 401 });
    }
    // Token format in this mock: "Bearer user:<userId>"
    const userId = auth.slice("Bearer ".length).replace(/^user:/, "");
    if (!userId) return new Response(null, { status: 401 });

    if (method === "POST" && url.endsWith("/sync/snapshot")) {
      const body = JSON.parse(init?.body as string) as { ciphertext_b64: string };
      const prev = this.store.get(userId);
      const next = { version: (prev?.version ?? 0) + 1, ciphertext_b64: body.ciphertext_b64 };
      this.store.set(userId, next);
      return new Response(JSON.stringify({ version: next.version }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (method === "GET" && url.includes("/sync/snapshot")) {
      const u = new URL(url);
      const since = Number.parseInt(u.searchParams.get("since") ?? "0", 10);
      const cur = this.store.get(userId);
      if (!cur) {
        return new Response(JSON.stringify({ version: 0, ciphertext_b64: null }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (cur.version <= since) return new Response(null, { status: 204 });
      return new Response(JSON.stringify(cur), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ error: "not_found" }), { status: 404 });
  };

  /** Test-only — 외부에서 store 의 raw envelope 을 조회 (Zero-Knowledge 검증). */
  rawEnvelope(userId: string): Uint8Array | null {
    const snap = this.store.get(userId);
    if (!snap?.ciphertext_b64) return null;
    return Uint8Array.from(atob(snap.ciphertext_b64), (c) => c.charCodeAt(0));
  }
}

function makeTransport(relay: MockRelay): RelayTransport {
  return new RelayTransport({
    baseUrl: "http://relay.test",
    getAccessToken: async () => `user:${USER_ID}`,
    getSessionKey: () => ({ rootKey: KEY, userId: USER_ID }),
    fetchImpl: relay.fetchImpl,
    manualPolling: true,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Phase E-5 — Y.Doc round-trip via mock relay", () => {
  it("A pushes → B polls → B's Y.Map mirrors A's", async () => {
    const relay = new MockRelay();
    const transportA = makeTransport(relay);
    const transportB = makeTransport(relay);

    const docA = new Y.Doc();
    const docB = new Y.Doc();

    // B 의 onRemoteUpdate → applyUpdate (실제 SyncProvider 가 wiring 할 부분).
    transportB.onRemoteUpdate((update) => {
      Y.applyUpdate(docB, update, "remote");
    });

    // A 측 변경
    const aMap = docA.getMap<{ name: string }>("credential");
    aMap.set("crd_1", { name: "Stripe production" });

    // A 의 Y.Doc 의 update 를 push
    const updateA = Y.encodeStateAsUpdate(docA);
    await transportA.pushUpdate(updateA);

    // B 가 poll → 받은 update 적용
    await transportB.pollOnce();

    const bMap = docB.getMap<{ name: string }>("credential");
    expect(bMap.get("crd_1")).toEqual({ name: "Stripe production" });

    docA.destroy();
    docB.destroy();
  });

  it("two A pushes are visible to B in a single poll (latest snapshot)", async () => {
    const relay = new MockRelay();
    const transportA = makeTransport(relay);
    const transportB = makeTransport(relay);
    const docA = new Y.Doc();
    const docB = new Y.Doc();

    transportB.onRemoteUpdate((u) => Y.applyUpdate(docB, u, "remote"));

    const aMap = docA.getMap<{ name: string }>("credential");
    aMap.set("crd_1", { name: "v1" });
    await transportA.pushUpdate(Y.encodeStateAsUpdate(docA));
    aMap.set("crd_2", { name: "second" });
    await transportA.pushUpdate(Y.encodeStateAsUpdate(docA));

    await transportB.pollOnce();

    const bMap = docB.getMap<{ name: string }>("credential");
    expect(bMap.get("crd_1")).toEqual({ name: "v1" });
    expect(bMap.get("crd_2")).toEqual({ name: "second" });

    docA.destroy();
    docB.destroy();
  });

  it("Zero-Knowledge — relay store envelope is unreadable without the key", async () => {
    const relay = new MockRelay();
    const transportA = makeTransport(relay);
    const docA = new Y.Doc();
    docA.getMap<{ pk: string }>("credential").set("crd_x", { pk: "PRIVATE-VALUE-EX" });
    await transportA.pushUpdate(Y.encodeStateAsUpdate(docA));

    const envelope = relay.rawEnvelope(USER_ID);
    expect(envelope).not.toBeNull();
    // 평문이 ciphertext 안에 보이지 않아야 (sanity, AEAD 가 stream cipher 라 당연).
    const txt = new TextDecoder("utf-8", { fatal: false }).decode(envelope!);
    expect(txt).not.toContain("PRIVATE-VALUE-EX");
    // 잘못된 키로는 decrypt 실패.
    const wrongKey = new Uint8Array(32).fill(0xff);
    expect(() =>
      decrypt(wrongKey, envelope!, new TextEncoder().encode(`user:${USER_ID}`)),
    ).toThrow();
    docA.destroy();
  });

  it("after B pulls, subsequent poll with same lastVersion yields 204 (no echo loop)", async () => {
    const relay = new MockRelay();
    const transportA = makeTransport(relay);
    const transportB = makeTransport(relay);
    const docA = new Y.Doc();
    const docB = new Y.Doc();
    let receiveCount = 0;
    transportB.onRemoteUpdate((u) => {
      receiveCount++;
      Y.applyUpdate(docB, u, "remote");
    });

    docA.getMap<{ x: number }>("credential").set("crd_1", { x: 1 });
    await transportA.pushUpdate(Y.encodeStateAsUpdate(docA));
    await transportB.pollOnce(); // 1번 받음
    await transportB.pollOnce(); // 같은 since=1 → 204, 받음 안 함

    expect(receiveCount).toBe(1);
    docA.destroy();
    docB.destroy();
  });

  it("AEAD adapter helper sanity (encrypt/decrypt round-trip)", () => {
    // AEAD 가 멀쩡해야 위 회귀들의 의미가 있음 — fail-fast.
    const aad = new TextEncoder().encode(`user:${USER_ID}`);
    const env = encrypt(KEY, new TextEncoder().encode("hi"), aad);
    expect(new TextDecoder().decode(decrypt(KEY, env, aad))).toBe("hi");
  });
});
