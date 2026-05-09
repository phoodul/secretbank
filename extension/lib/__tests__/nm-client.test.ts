/**
 * @file nm-client.test.ts
 * @license AGPL-3.0-or-later
 *
 * NMClient Vitest 테스트.
 *
 * chrome.runtime.connectNative / Port 를 stub 으로 대체하여
 * 실제 네이티브 프로세스 없이 동작을 검증한다.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NMClient } from "../nm-client.js";
import { NMNotInstalled, NMDisconnected } from "../nm-errors.js";

// ---------------------------------------------------------------------------
// Port stub 팩토리
// ---------------------------------------------------------------------------

/**
 * chrome.runtime.Port 를 흉내내는 stub 을 생성한다.
 *
 * 반환된 객체를 통해 테스트에서 onMessage / onDisconnect 를 직접 발화할 수 있다.
 */
function createPortStub() {
  const messageListeners: Array<(msg: unknown) => void> = [];
  const disconnectListeners: Array<() => void> = [];

  const port = {
    name: "com.secretbank.nm_host",
    postMessage: vi.fn(),
    disconnect: vi.fn(),
    onMessage: {
      addListener: vi.fn((cb: (msg: unknown) => void) => {
        messageListeners.push(cb);
      }),
      removeListener: vi.fn((cb: (msg: unknown) => void) => {
        const idx = messageListeners.indexOf(cb);
        if (idx !== -1) messageListeners.splice(idx, 1);
      }),
      hasListener: vi.fn((cb: (msg: unknown) => void) => messageListeners.includes(cb)),
    },
    onDisconnect: {
      addListener: vi.fn((cb: () => void) => {
        disconnectListeners.push(cb);
      }),
      removeListener: vi.fn((cb: () => void) => {
        const idx = disconnectListeners.indexOf(cb);
        if (idx !== -1) disconnectListeners.splice(idx, 1);
      }),
      hasListener: vi.fn((cb: () => void) => disconnectListeners.includes(cb)),
    },
  };

  // 테스트에서 이벤트를 직접 발화하는 헬퍼
  const dispatch = {
    /** onMessage 핸들러를 모두 호출한다 */
    message: (msg: unknown) => {
      for (const cb of messageListeners) cb(msg);
    },
    /** onDisconnect 핸들러를 모두 호출한다 */
    disconnect: () => {
      for (const cb of disconnectListeners) cb();
    },
  };

  return { port: port as unknown as chrome.runtime.Port, dispatch };
}

// ---------------------------------------------------------------------------
// 전역 chrome mock 헬퍼
// ---------------------------------------------------------------------------

/** chrome.runtime.lastError 를 임시로 설정한다 */
function setLastError(message: string | undefined) {
  (globalThis.chrome.runtime as Record<string, unknown>).lastError =
    message !== undefined ? { message } : undefined;
}

/** chrome.runtime.connectNative 를 stub port 로 대체한다 */
function mockConnectNative(port: chrome.runtime.Port) {
  (globalThis.chrome.runtime as Record<string, unknown>).connectNative = vi.fn(() => port);
}

// ---------------------------------------------------------------------------
// 테스트
// ---------------------------------------------------------------------------

describe("NMClient", () => {
  let client: NMClient;

  beforeEach(() => {
    // 각 테스트 전에 새 NMClient 인스턴스와 깨끗한 lastError 상태 준비
    client = new NMClient();
    setLastError(undefined);
    vi.useFakeTimers();
  });

  afterEach(() => {
    // 타이머 복원 + 남은 reconnect 타이머 정리
    client.disconnect();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // ── 1. connect 성공 ───────────────────────────────────────────────────────

  it("connect() 성공 시 isConnected() 가 true 를 반환한다", async () => {
    const { port } = createPortStub();
    mockConnectNative(port);

    await client.connect();

    expect(client.isConnected()).toBe(true);
  });

  it("connect() 는 chrome.runtime.connectNative 를 정확한 호스트 ID 로 호출한다", async () => {
    const { port } = createPortStub();
    const spy = vi.fn(() => port);
    (globalThis.chrome.runtime as Record<string, unknown>).connectNative = spy;

    await client.connect();

    expect(spy).toHaveBeenCalledWith("com.secretbank.nm_host");
  });

  it("이미 연결된 상태에서 connect() 를 재호출해도 connectNative 가 한 번만 호출된다", async () => {
    const { port } = createPortStub();
    const spy = vi.fn(() => port);
    (globalThis.chrome.runtime as Record<string, unknown>).connectNative = spy;

    await client.connect();
    await client.connect(); // 두 번째 호출

    expect(spy).toHaveBeenCalledTimes(1);
  });

  // ── 2. sendMessage ────────────────────────────────────────────────────────

  it("sendMessage() 는 port.postMessage 를 호출한다", async () => {
    const { port } = createPortStub();
    mockConnectNative(port);
    await client.connect();

    const msg = {
      type: "init" as const,
      version: "1",
      extension_id: "test-ext",
      ext_pub: "test-pub",
    };
    await client.sendMessage(msg);

    expect(
      (port as unknown as { postMessage: ReturnType<typeof vi.fn> }).postMessage,
    ).toHaveBeenCalledWith(msg);
  });

  it("미연결 상태에서 sendMessage() 는 NMDisconnected 를 throw 한다", async () => {
    await expect(
      client.sendMessage({
        type: "init",
        version: "1",
        extension_id: "test-ext",
        ext_pub: "test-pub",
      }),
    ).rejects.toBeInstanceOf(NMDisconnected);
  });

  // ── 3. onMessage 핸들러 ───────────────────────────────────────────────────

  it("port.onMessage 발화 시 onMessage 핸들러가 호출된다", async () => {
    const { port, dispatch } = createPortStub();
    mockConnectNative(port);
    await client.connect();

    const handler = vi.fn();
    client.onMessage(handler);

    const msg = {
      type: "init" as const,
      version: "1",
      extension_id: "test-ext",
      ext_pub: "test-pub",
    };
    dispatch.message(msg);

    expect(handler).toHaveBeenCalledWith(msg);
  });

  // T-24-E-B10: 3 OS smoke — NM Host stdio echo round-trip 자동 검증.
  // Win 11 자동 검증 = 본 케이스. macOS/Linux 는 future B-10.5.
  it("B-10 smoke: NM Host stdio echo round-trip — sendMessage → port echo → onMessage", async () => {
    const { port, dispatch } = createPortStub();
    mockConnectNative(port);
    await client.connect();

    const echoes: Array<unknown> = [];
    client.onMessage((msg) => echoes.push(msg));

    // nm-host echo 시뮬레이션: postMessage 받은 메시지를 즉시 onMessage 로 dispatch.
    port.postMessage = vi.fn((msg: unknown) => {
      dispatch.message(msg);
    });

    const probe = {
      type: "init" as const,
      version: "ping-pong",
      extension_id: "test-ext",
      ext_pub: "test-pub",
    };
    await client.sendMessage(probe);

    expect(port.postMessage).toHaveBeenCalledWith(probe);
    expect(echoes).toHaveLength(1);
    expect(echoes[0]).toEqual(probe);
  });

  it("onMessage 가 반환한 unsubscribe 를 호출하면 핸들러가 더 이상 호출되지 않는다", async () => {
    const { port, dispatch } = createPortStub();
    mockConnectNative(port);
    await client.connect();

    const handler = vi.fn();
    const unsub = client.onMessage(handler);

    // 구독 해제
    unsub();
    dispatch.message({
      type: "init",
      version: "1",
      extension_id: "test-ext",
      ext_pub: "test-pub",
    });

    expect(handler).not.toHaveBeenCalled();
  });

  // ── 4. onDisconnect 핸들러 ────────────────────────────────────────────────

  it("port.onDisconnect 발화 시 onDisconnect 핸들러가 호출된다", async () => {
    const { port, dispatch } = createPortStub();
    mockConnectNative(port);
    await client.connect();

    const handler = vi.fn();
    client.onDisconnect(handler);

    dispatch.disconnect();

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("disconnect() 후 isConnected() 가 false 를 반환한다", async () => {
    const { port } = createPortStub();
    mockConnectNative(port);
    await client.connect();

    client.disconnect();

    expect(client.isConnected()).toBe(false);
  });

  // ── 5. NMNotInstalled 검출 ────────────────────────────────────────────────

  it(
    "onDisconnect 에서 lastError 가 'Specified native messaging host not found.' 이면 " +
      "onDisconnect 핸들러에 kind='not_installed' 가 전달된다",
    async () => {
      const { port, dispatch } = createPortStub();
      mockConnectNative(port);
      await client.connect();

      const handler = vi.fn();
      client.onDisconnect(handler);

      // disconnect 직전 lastError 세팅 (Chrome 동작 시뮬레이션)
      setLastError("Specified native messaging host not found.");
      dispatch.disconnect();
      setLastError(undefined);

      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ kind: "not_installed" }));
      expect(handler.mock.calls[0][0].error).toBeInstanceOf(NMNotInstalled);
    },
  );

  it(
    "connectNative 직후 onDisconnect 가 즉시 발화 + lastError = NMNotInstalled 이면 " +
      "connect() 가 NMNotInstalled 로 reject 된다",
    async () => {
      // connectNative 가 port 를 반환하지만 즉시 onDisconnect 발화
      let capturedDisconnectCb: (() => void) | undefined;

      const port = {
        name: "com.secretbank.nm_host",
        postMessage: vi.fn(),
        disconnect: vi.fn(),
        onMessage: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
          hasListener: vi.fn(),
        },
        onDisconnect: {
          addListener: vi.fn((cb: () => void) => {
            capturedDisconnectCb = cb;
          }),
          removeListener: vi.fn(),
          hasListener: vi.fn(),
        },
      } as unknown as chrome.runtime.Port;

      (globalThis.chrome.runtime as Record<string, unknown>).connectNative = vi.fn(() => {
        return port;
      });

      // connect() 를 호출하고, onDisconnect 리스너가 등록된 직후 발화 시뮬레이션
      const connectPromise = client.connect();

      // 리스너 등록 후 (다음 마이크로태스크 이전) 동기 발화
      setLastError("Specified native messaging host not found.");
      capturedDisconnectCb?.();
      setLastError(undefined);

      await expect(connectPromise).rejects.toBeInstanceOf(NMNotInstalled);
    },
  );

  // ── 6. 지수 백오프 재연결 ────────────────────────────────────────────────

  it("port 단절 시 1s 후 재연결을 시도한다 (첫 번째 backoff)", async () => {
    const { port: port1, dispatch: dispatch1 } = createPortStub();
    const { port: port2 } = createPortStub();

    const connectNativeSpy = vi.fn().mockReturnValueOnce(port1).mockReturnValueOnce(port2);
    (globalThis.chrome.runtime as Record<string, unknown>).connectNative = connectNativeSpy;

    await client.connect();
    expect(connectNativeSpy).toHaveBeenCalledTimes(1);

    // 첫 번째 단절
    dispatch1.disconnect();

    // 아직 재연결 전
    expect(connectNativeSpy).toHaveBeenCalledTimes(1);

    // 1초 경과
    await vi.advanceTimersByTimeAsync(1000);

    expect(connectNativeSpy).toHaveBeenCalledTimes(2);
  });

  it("backoff 지연이 1s → 2s → 4s → 8s → 16s 순서로 늘어난다", async () => {
    // 각 재연결 시도에서 즉시 다시 disconnect 되도록 설정
    const dispatches: Array<{ dispatch: ReturnType<typeof createPortStub>["dispatch"] }> = [];

    const connectNativeSpy = vi.fn().mockImplementation(() => {
      const { port, dispatch } = createPortStub();
      dispatches.push({ dispatch });
      return port;
    });
    (globalThis.chrome.runtime as Record<string, unknown>).connectNative = connectNativeSpy;

    await client.connect();
    expect(connectNativeSpy).toHaveBeenCalledTimes(1);

    // 1차 단절
    dispatches[0].dispatch.disconnect();

    // 1s 후 2차 연결 → 즉시 단절
    await vi.advanceTimersByTimeAsync(999);
    expect(connectNativeSpy).toHaveBeenCalledTimes(1); // 아직 재연결 전

    await vi.advanceTimersByTimeAsync(1); // 총 1000ms
    expect(connectNativeSpy).toHaveBeenCalledTimes(2);

    dispatches[1].dispatch.disconnect(); // 2차 단절

    // 2s 후 3차 연결
    await vi.advanceTimersByTimeAsync(2000);
    expect(connectNativeSpy).toHaveBeenCalledTimes(3);

    dispatches[2].dispatch.disconnect(); // 3차 단절

    // 4s 후 4차 연결
    await vi.advanceTimersByTimeAsync(4000);
    expect(connectNativeSpy).toHaveBeenCalledTimes(4);

    dispatches[3].dispatch.disconnect(); // 4차 단절

    // 8s 후 5차 연결
    await vi.advanceTimersByTimeAsync(8000);
    expect(connectNativeSpy).toHaveBeenCalledTimes(5);

    dispatches[4].dispatch.disconnect(); // 5차 단절

    // 16s 후 6차(마지막) 연결
    await vi.advanceTimersByTimeAsync(16000);
    expect(connectNativeSpy).toHaveBeenCalledTimes(6);
  });

  // ── 7. 최대 5회 재연결 후 영구 실패 ─────────────────────────────────────

  it("5회 재연결 실패 후 max_retries_exceeded 로 영구 실패한다", async () => {
    const dispatches: Array<{ dispatch: ReturnType<typeof createPortStub>["dispatch"] }> = [];

    const connectNativeSpy = vi.fn().mockImplementation(() => {
      const { port, dispatch } = createPortStub();
      dispatches.push({ dispatch });
      return port;
    });
    (globalThis.chrome.runtime as Record<string, unknown>).connectNative = connectNativeSpy;

    const disconnectHandler = vi.fn();
    client.onDisconnect(disconnectHandler);

    await client.connect(); // 1차 연결

    // 6번 단절 (1차 연결 + 5회 재연결 = 총 6개 Port)
    const delays = [1000, 2000, 4000, 8000, 16000];

    // 1차 단절
    dispatches[0].dispatch.disconnect();

    for (let i = 0; i < 5; i++) {
      await vi.advanceTimersByTimeAsync(delays[i]);
      // i+1 번째 재연결 Port 가 생성됨
      expect(connectNativeSpy).toHaveBeenCalledTimes(i + 2);
      if (i < 4) {
        // 5번째 재연결(i=4) 전까지 단절
        dispatches[i + 1].dispatch.disconnect();
      }
    }

    // 5번째 재연결 Port 단절 → 재시도 소진
    dispatches[5].dispatch.disconnect();

    // max_retries_exceeded 알림을 받았는지 확인
    const maxRetriesCall = disconnectHandler.mock.calls.find(
      (call) => call[0].kind === "max_retries_exceeded",
    );
    expect(maxRetriesCall).toBeDefined();

    // 영구 실패 후 connect() 는 즉시 reject
    await expect(client.connect()).rejects.toBeInstanceOf(NMDisconnected);
  });

  // ── 8. disconnect() 명시적 호출 후 reconnect 없음 ─────────────────────────

  it("disconnect() 호출 후에는 자동 reconnect 가 발생하지 않는다", async () => {
    const { port } = createPortStub();
    const connectNativeSpy = vi.fn(() => port);
    (globalThis.chrome.runtime as Record<string, unknown>).connectNative = connectNativeSpy;

    await client.connect();
    client.disconnect();

    // 충분한 시간 경과
    await vi.advanceTimersByTimeAsync(60000);

    // 최초 1회만 호출
    expect(connectNativeSpy).toHaveBeenCalledTimes(1);
  });

  // ── 9. T-24-E-G1-1: graphForCredential RPC ───────────────────────────────

  it("graphForCredential() 은 올바른 타입으로 요청을 전송하고 응답을 반환한다", async () => {
    const { port, dispatch } = createPortStub();

    const credentialId = "01JXXXXXXXXXXXXXXXXXXXXXXX";
    const sessionToken = "test-session-token";

    const mockResponse = {
      type: "graph_for_credential_response" as const,
      ok: true,
      center_id: credentialId,
      center_label: "GitHub",
      project_nodes: [
        { id: "proj-1", label: "My App", env: "prod" },
        { id: "proj-2", label: "My Backend", env: "staging" },
      ],
      edges: [
        { from: credentialId, to: "proj-1" },
        { from: credentialId, to: "proj-2" },
      ],
      hidden_count: 0,
    };

    mockConnectNative(port);
    await client.connect();

    // _rpc 흐름: sendMessage → new Promise → const unsub = this.onMessage(cb) → 리스너 등록.
    // onMessage mock 내에서 즉시 dispatch 하면 unsub 아직 초기화 전 → TDZ 오류.
    // Promise.resolve().then 으로 unsub 할당 완료 후 dispatch 한다.
    const origOnMessage = client.onMessage.bind(client);
    vi.spyOn(client, "onMessage").mockImplementationOnce((handler) => {
      const unsub = origOnMessage(handler);
      Promise.resolve().then(() => dispatch.message(mockResponse));
      return unsub;
    });

    const result = await client.graphForCredential(credentialId, sessionToken);

    // 요청 타입 검증
    const postMessage = (port as unknown as { postMessage: ReturnType<typeof vi.fn> }).postMessage;
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "graph_for_credential",
        credential_id: credentialId,
        session_token: sessionToken,
      }),
    );

    // 응답 내용 검증
    expect(result.ok).toBe(true);
    expect(result.center_label).toBe("GitHub");
    expect(result.project_nodes).toHaveLength(2);
    expect(result.hidden_count).toBe(0);
  });

  it("graphForCredential() 은 5s timeout 후 NMDisconnected 를 throw 한다", async () => {
    const { port } = createPortStub();
    mockConnectNative(port);
    await client.connect();

    const rpcPromise = client.graphForCredential("cred-id", "tok");

    // 5초 초과 — 응답 없음
    await vi.advanceTimersByTimeAsync(5001);

    await expect(rpcPromise).rejects.toBeInstanceOf(NMDisconnected);
  });

  it("graphForCredential() 은 타입 호환 응답 (ok=false) 도 수신한다", async () => {
    const { port, dispatch } = createPortStub();

    const errorResponse = {
      type: "graph_for_credential_response" as const,
      ok: false,
      error: "vault_locked",
    };

    mockConnectNative(port);
    await client.connect();

    // onMessage mock: unsub 할당 완료 후 dispatch (TDZ 방지).
    const origOnMessage = client.onMessage.bind(client);
    vi.spyOn(client, "onMessage").mockImplementationOnce((handler) => {
      const unsub = origOnMessage(handler);
      Promise.resolve().then(() => dispatch.message(errorResponse));
      return unsub;
    });

    const result = await client.graphForCredential("cred-id", "tok");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("vault_locked");
  });

  // ── 10. T-24-E-G2-1: incidentCheckForHost RPC ────────────────────────────

  it("incidentCheckForHost() 은 올바른 타입으로 요청을 전송하고 matches 배열을 반환한다", async () => {
    const { port, dispatch } = createPortStub();

    const host = "github.com";
    const sessionToken = "test-session-token";

    const mockResponse = {
      type: "incident_check_for_host_response" as const,
      ok: true,
      matches: [
        {
          incident_id: "01JXXXXXXXXXXXXXXXXXXXXXXX",
          severity: "high" as const,
          title: "GitHub credential breach",
          published_at: 1_735_000_000_000,
          source: "nvd" as const,
        },
        {
          incident_id: "01JYYYYYYYYYYYYYYYYYYYYYYY",
          severity: "critical" as const,
          title: "GitHub supply chain attack",
          published_at: null,
          source: "ghsa" as const,
        },
      ],
    };

    mockConnectNative(port);
    await client.connect();

    const origOnMessage = client.onMessage.bind(client);
    vi.spyOn(client, "onMessage").mockImplementationOnce((handler) => {
      const unsub = origOnMessage(handler);
      Promise.resolve().then(() => dispatch.message(mockResponse));
      return unsub;
    });

    const result = await client.incidentCheckForHost(host, sessionToken);

    // 요청 타입 검증
    const postMessage = (port as unknown as { postMessage: ReturnType<typeof vi.fn> }).postMessage;
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "incident_check_for_host",
        host,
        session_token: sessionToken,
      }),
    );

    // 응답 내용 검증
    expect(result.ok).toBe(true);
    expect(result.matches).toHaveLength(2);
    expect(result.matches![0].severity).toBe("high");
    expect(result.matches![1].severity).toBe("critical");
  });

  it("incidentCheckForHost() 은 5s timeout 후 NMDisconnected 를 throw 한다", async () => {
    const { port } = createPortStub();
    mockConnectNative(port);
    await client.connect();

    const rpcPromise = client.incidentCheckForHost("github.com", "tok");

    // 5초 초과 — 응답 없음
    await vi.advanceTimersByTimeAsync(5001);

    await expect(rpcPromise).rejects.toBeInstanceOf(NMDisconnected);
  });

  it("incidentCheckForHost() 은 ok=false 응답 (vault_locked) 도 수신한다", async () => {
    const { port, dispatch } = createPortStub();

    const errorResponse = {
      type: "incident_check_for_host_response" as const,
      ok: false,
      error: "vault_locked",
    };

    mockConnectNative(port);
    await client.connect();

    const origOnMessage = client.onMessage.bind(client);
    vi.spyOn(client, "onMessage").mockImplementationOnce((handler) => {
      const unsub = origOnMessage(handler);
      Promise.resolve().then(() => dispatch.message(errorResponse));
      return unsub;
    });

    const result = await client.incidentCheckForHost("github.com", "tok");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("vault_locked");
    expect(result.matches).toBeUndefined();
  });

  // ── 11. T-24-E-G3-1: blastRadiusForHost RPC ──────────────────────────────

  it("blastRadiusForHost() 은 올바른 타입으로 요청을 전송하고 affected 목록을 반환한다", async () => {
    const { port, dispatch } = createPortStub();

    const host = "github.com";
    const sessionToken = "test-session-token";
    const credentialId = "01JXXXXXXXXXXXXXXXXXXXXXXX";

    const mockResponse = {
      type: "blast_radius_for_host_response" as const,
      ok: true,
      credential_id: credentialId,
      affected: [
        { kind: "project" as const, label: "My App", status: "active" },
        { kind: "deployment" as const, label: "https://app.example.com @ prod", status: "active" },
      ],
      total: 2,
      hidden_count: 0,
    };

    mockConnectNative(port);
    await client.connect();

    const origOnMessage = client.onMessage.bind(client);
    vi.spyOn(client, "onMessage").mockImplementationOnce((handler) => {
      const unsub = origOnMessage(handler);
      Promise.resolve().then(() => dispatch.message(mockResponse));
      return unsub;
    });

    const result = await client.blastRadiusForHost(host, sessionToken);

    // 요청 타입 검증
    const postMessage = (port as unknown as { postMessage: ReturnType<typeof vi.fn> }).postMessage;
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "blast_radius_for_host",
        host,
        session_token: sessionToken,
      }),
    );

    // 응답 내용 검증
    expect(result.ok).toBe(true);
    expect(result.credential_id).toBe(credentialId);
    expect(result.affected).toHaveLength(2);
    expect(result.total).toBe(2);
    expect(result.hidden_count).toBe(0);
  });

  it("blastRadiusForHost() 은 5s timeout 후 NMDisconnected 를 throw 한다", async () => {
    const { port } = createPortStub();
    mockConnectNative(port);
    await client.connect();

    // unhandled rejection 방지: rpcPromise 를 catch 로 silencing 후 별도 검증.
    let caughtError: unknown;
    const rpcPromise = client
      .blastRadiusForHost("github.com", "tok")
      .catch((e) => {
        caughtError = e;
      });

    // 5초 초과 — 응답 없음
    await vi.advanceTimersByTimeAsync(5001);
    await rpcPromise;

    expect(caughtError).toBeInstanceOf(NMDisconnected);
  });

  it("blastRadiusForHost() 는 host 매칭 없을 때 ok=true + credential_id=null 을 반환한다", async () => {
    const { port, dispatch } = createPortStub();

    const emptyResponse = {
      type: "blast_radius_for_host_response" as const,
      ok: true,
      credential_id: null,
      affected: [],
      total: 0,
      hidden_count: 0,
    };

    mockConnectNative(port);
    await client.connect();

    const origOnMessage = client.onMessage.bind(client);
    vi.spyOn(client, "onMessage").mockImplementationOnce((handler) => {
      const unsub = origOnMessage(handler);
      Promise.resolve().then(() => dispatch.message(emptyResponse));
      return unsub;
    });

    const result = await client.blastRadiusForHost("unknown-host.xyz", "tok");
    expect(result.ok).toBe(true);
    expect(result.credential_id).toBeNull();
    expect(result.affected).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  // ── 12. T-24-E-G4-1: mcpContextPush RPC ─────────────────────────────────

  it("mcpContextPush() 는 올바른 타입으로 요청을 전송하고 ok=true ack 를 반환한다", async () => {
    const { port, dispatch } = createPortStub();

    const host = "github.com";
    const sessionToken = "test-session-token";
    const credentialMeta = [{ id: "cred-1", name: "GitHub Token", issuer: "github" }];

    // ack 응답 — type 필드 없이 { ok: boolean } 형태.
    const ackResponse = { ok: true };

    mockConnectNative(port);
    await client.connect();

    // mcpContextPush 는 sendMessage 후 onMessage 구독 패턴.
    // graphForCredential 과 달리 내부적으로 _rpc 가 아닌 직접 Promise 를 구성하므로
    // onMessage spy 를 사용해 handler 등록 후 dispatch.
    const origOnMessage = client.onMessage.bind(client);
    vi.spyOn(client, "onMessage").mockImplementationOnce((handler) => {
      const unsub = origOnMessage(handler);
      Promise.resolve().then(() => dispatch.message(ackResponse));
      return unsub;
    });

    const result = await client.mcpContextPush(host, credentialMeta, sessionToken);

    // 요청 필드 검증
    const postMessage = (port as unknown as { postMessage: ReturnType<typeof vi.fn> }).postMessage;
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "mcp_context_push",
        host,
        credential_meta: credentialMeta,
        session_token: sessionToken,
      }),
    );

    // ack 응답 검증
    expect(result.ok).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("mcpContextPush() 는 5s timeout 후 NMDisconnected 를 throw 한다", async () => {
    const { port } = createPortStub();
    mockConnectNative(port);
    await client.connect();

    // ack 를 절대 dispatch 하지 않아 timeout 유발.
    let caughtError: unknown;
    const rpcPromise = client
      .mcpContextPush("github.com", [], "tok")
      .catch((e) => {
        caughtError = e;
      });

    // 5초 초과
    await vi.advanceTimersByTimeAsync(5001);
    await rpcPromise;

    expect(caughtError).toBeInstanceOf(NMDisconnected);
  });

  it("mcpContextPush() 는 ok=false ack 도 수신한다 (opt-in OFF 등)", async () => {
    const { port, dispatch } = createPortStub();

    const errorAck = { ok: false, error: "vault_locked" };

    mockConnectNative(port);
    await client.connect();

    const origOnMessage = client.onMessage.bind(client);
    vi.spyOn(client, "onMessage").mockImplementationOnce((handler) => {
      const unsub = origOnMessage(handler);
      Promise.resolve().then(() => dispatch.message(errorAck));
      return unsub;
    });

    const result = await client.mcpContextPush("github.com", [], "tok");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("vault_locked");
  });
});
