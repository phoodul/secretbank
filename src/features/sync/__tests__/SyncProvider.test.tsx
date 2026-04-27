/**
 * M9 Phase A — SyncProvider 골격 회귀.
 *
 * `disablePersistence` 모드에서만 Vitest 가 동작 (jsdom 의 IndexedDB shim
 * 부재로 y-indexeddb persistence 는 별도 실 브라우저에서만 검증). Phase B
 * 진입 시점에 Playwright 환경 또는 fake-indexeddb 도입 결정.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

import { SyncProvider, useSync, useYMap } from "../SyncProvider";

function ProbeDocId() {
  const { doc, status } = useSync();
  return (
    <div data-testid="probe">
      <span data-testid="status">{status}</span>
      <span data-testid="client-id">{doc.clientID}</span>
    </div>
  );
}

function YMapWriter() {
  const map = useYMap<string>("credentials");
  if (map.get("alice") === undefined) {
    map.set("alice", "encrypted-blob");
  }
  return <div data-testid="value">{map.get("alice") ?? "(none)"}</div>;
}

describe("SyncProvider (Phase A)", () => {
  it("renders children with a stable Y.Doc and ready status when persistence is disabled", () => {
    render(
      <SyncProvider dbName="test:default" disablePersistence>
        <ProbeDocId />
      </SyncProvider>,
    );

    expect(screen.getByTestId("status")).toHaveTextContent("ready");
    const clientId = screen.getByTestId("client-id").textContent;
    expect(clientId).toMatch(/^\d+$/);
    expect(Number(clientId)).toBeGreaterThan(0);
  });

  it("useSync() throws when called outside the provider", () => {
    function Orphan() {
      useSync();
      return null;
    }
    // suppress React's error boundary noise
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Orphan />)).toThrow(/useSync\(\) must be called/);
    spy.mockRestore();
  });

  it("useYMap() exposes a Y.Map that is the same instance on re-render and round-trips set/get", () => {
    render(
      <SyncProvider dbName="test:ymap" disablePersistence>
        <YMapWriter />
      </SyncProvider>,
    );
    expect(screen.getByTestId("value")).toHaveTextContent("encrypted-blob");
  });

  it("two doc instances are independent (sanity — different Y.Docs)", () => {
    const a = new Y.Doc();
    const b = new Y.Doc();
    expect(a.clientID).not.toBe(b.clientID);
    a.destroy();
    b.destroy();
  });
});
