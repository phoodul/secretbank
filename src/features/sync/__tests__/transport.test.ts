/**
 * M9 Phase C — `StubTransport` 인터페이스 회귀.
 *
 * Phase E 에서 `RelayTransport` 가 도입될 때 같은 회귀 슈트가 그대로
 * 통과해야 한다 (transport contract 의 conformance test).
 */
import { describe, expect, it } from "vitest";

import { StubTransport } from "../transport";

describe("StubTransport", () => {
  it("starts in 'idle' status", () => {
    const t = new StubTransport();
    expect(t.status).toBe("idle");
  });

  it("connect() transitions through 'connecting' → 'connected' across one microtask hop", async () => {
    const t = new StubTransport();
    const promise = t.connect();
    expect(t.status).toBe("connecting");
    await promise;
    expect(t.status).toBe("connected");
  });

  it("connect() is idempotent — second call resolves without re-transitioning", async () => {
    const t = new StubTransport();
    await t.connect();
    expect(t.status).toBe("connected");
    await t.connect();
    expect(t.status).toBe("connected");
  });

  it("disconnect() transitions to 'disconnected' and clears handlers", async () => {
    const t = new StubTransport();
    await t.connect();
    const recv: Uint8Array[] = [];
    t.onRemoteUpdate((u) => recv.push(u));

    await t.disconnect();
    expect(t.status).toBe("disconnected");

    // handler set 이 비워졌는지 — emit 해도 recv 가 늘지 않아야
    t.__emitForTesting(new Uint8Array([1, 2, 3]));
    expect(recv).toHaveLength(0);
  });

  it("onRemoteUpdate(): subscribe → receive emit → unsubscribe stops further calls", () => {
    const t = new StubTransport();
    const recv: Uint8Array[] = [];
    const off = t.onRemoteUpdate((u) => recv.push(u));

    t.__emitForTesting(new Uint8Array([0xa]));
    t.__emitForTesting(new Uint8Array([0xb]));
    expect(recv).toHaveLength(2);

    off();
    t.__emitForTesting(new Uint8Array([0xc]));
    expect(recv).toHaveLength(2);
  });

  it("pushUpdate() resolves immediately as a no-op (Phase C placeholder)", async () => {
    const t = new StubTransport();
    await expect(t.pushUpdate(new Uint8Array([1]))).resolves.toBeUndefined();
  });
});
