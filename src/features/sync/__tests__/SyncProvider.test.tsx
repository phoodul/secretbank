/**
 * M9 Phase A + C — SyncProvider 회귀.
 *
 * Phase A (4건): Y.Doc 단일 인스턴스 / useSync orphan / useYMap round-trip /
 * Y.Doc clientID 독립.
 *
 * Phase C (4건): sync_get_root_key happy-path → status='ready' + rootKey /
 * NoSyncSession → status='offline_only' + transport idle / 일반 invoke 에러
 * → status='error' + transport 미연결 / unmount → transport.disconnect.
 *
 * `disablePersistence` 모드에서만 Vitest 가 동작 (jsdom 의 IndexedDB shim
 * 부재로 y-indexeddb persistence 는 별도 실 브라우저에서만 검증).
 */
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";

import { SyncProvider, useSync, useYMap } from "../SyncProvider";
import { StubTransport } from "../transport";

const mockInvoke = vi.mocked(invoke);

function ProbeDocId() {
  const { doc, status } = useSync();
  return (
    <div data-testid="probe">
      <span data-testid="status">{status}</span>
      <span data-testid="client-id">{doc.clientID}</span>
    </div>
  );
}

function ProbeBoot() {
  const { status, rootKey, transport, error } = useSync();
  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="rootkey-len">{rootKey?.length ?? -1}</span>
      <span data-testid="transport-status">{transport.status}</span>
      <span data-testid="error">{error ?? ""}</span>
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

describe("SyncProvider (Phase A — base scaffold)", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.clearAllMocks());

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

describe("SyncProvider (Phase C — sync boot + transport)", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.clearAllMocks());

  /**
   * Helper: 32바이트 Uint8Array → base64url (no-pad, '-'/'_').
   * Test fixture 용 — 실제 백엔드는 URL_SAFE_NO_PAD 로 인코딩한다.
   */
  function makeRootKeyB64(bytes: number): string {
    const arr = new Uint8Array(bytes).fill(0xab);
    let bin = "";
    for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  it("happy path: sync_get_root_key returns 32-byte b64url → status='ready' + rootKey + transport connected", async () => {
    mockInvoke.mockResolvedValueOnce(makeRootKeyB64(32));
    const transport = new StubTransport();

    render(
      <SyncProvider
        dbName="test:c-happy"
        disablePersistence
        disableSyncBoot={false}
        transport={transport}
      >
        <ProbeBoot />
      </SyncProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("status")).toHaveTextContent("ready");
    });
    expect(screen.getByTestId("rootkey-len")).toHaveTextContent("32");
    expect(screen.getByTestId("transport-status")).toHaveTextContent(
      "connected",
    );
    expect(mockInvoke).toHaveBeenCalledWith("sync_get_root_key");
  });

  it("NoSyncSession error → status='offline_only' + rootKey null + transport stays idle", async () => {
    mockInvoke.mockRejectedValueOnce({
      code: "no_sync_session",
      message: "no sync session",
    });
    const transport = new StubTransport();

    render(
      <SyncProvider
        dbName="test:c-nosession"
        disablePersistence
        disableSyncBoot={false}
        transport={transport}
      >
        <ProbeBoot />
      </SyncProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("status")).toHaveTextContent("offline_only");
    });
    expect(screen.getByTestId("rootkey-len")).toHaveTextContent("-1");
    expect(screen.getByTestId("transport-status")).toHaveTextContent("idle");
  });

  it("generic invoke error → status='error' + error message + transport stays idle", async () => {
    mockInvoke.mockRejectedValueOnce({
      code: "kdf",
      message: "hkdf failed",
    });
    const transport = new StubTransport();

    render(
      <SyncProvider
        dbName="test:c-error"
        disablePersistence
        disableSyncBoot={false}
        transport={transport}
      >
        <ProbeBoot />
      </SyncProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("status")).toHaveTextContent("error");
    });
    expect(screen.getByTestId("error")).toHaveTextContent("hkdf failed");
    expect(screen.getByTestId("transport-status")).toHaveTextContent("idle");
  });

  it("unmount cleans up transport.disconnect() (regardless of boot result)", async () => {
    mockInvoke.mockResolvedValueOnce(makeRootKeyB64(32));
    const transport = new StubTransport();
    const disconnectSpy = vi.spyOn(transport, "disconnect");

    const { unmount } = render(
      <SyncProvider
        dbName="test:c-unmount"
        disablePersistence
        disableSyncBoot={false}
        transport={transport}
      >
        <ProbeBoot />
      </SyncProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("status")).toHaveTextContent("ready");
    });

    unmount();
    expect(disconnectSpy).toHaveBeenCalled();
    expect(transport.status).toBe("disconnected");
  });
});
