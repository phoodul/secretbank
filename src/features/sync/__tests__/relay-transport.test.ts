/**
 * RelayTransport — Phase E-4a 회귀.
 *
 * 모든 회귀는 manualPolling=true + fetchImpl 주입으로 timer / 실 네트워크
 * 의존성을 제거. Phase E-5 의 통합 round-trip 회귀에서 SyncProvider 와 합쳐
 * 검증.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { decrypt, encrypt } from "../aead";
import { RelayTransport } from "../relay-transport";

const KEY = new Uint8Array(32).fill(0x42);
const USER_ID = "usr_test_01";

function makeFetchMock() {
  return vi.fn<typeof fetch>();
}

function jsonResponse(status: number, body: unknown, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...(headers ?? {}) },
  });
}

function noBodyResponse(status: number): Response {
  return new Response(null, { status });
}

function makeSession(userId: string = USER_ID, key: Uint8Array = KEY) {
  return () => ({ rootKey: key, userId });
}

beforeEach(() => {
  vi.useRealTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("RelayTransport — pushUpdate", () => {
  it("encrypts payload, POSTs base64 envelope to /sync/snapshot, persists returned version", async () => {
    const fetchMock = makeFetchMock();
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { version: 7 }));

    const t = new RelayTransport({
      baseUrl: "http://relay.test",
      getAccessToken: async () => "tok-A",
      getSessionKey: makeSession(),
      fetchImpl: fetchMock,
      manualPolling: true,
    });

    await t.pushUpdate(new TextEncoder().encode("y-doc-update-1"));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("http://relay.test/sync/snapshot");
    expect(init?.method).toBe("POST");
    const headers = init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer tok-A");
    expect(headers["Content-Type"]).toBe("application/json");

    const body = JSON.parse(init?.body as string) as { ciphertext_b64: string };
    expect(typeof body.ciphertext_b64).toBe("string");
    expect(body.ciphertext_b64.length).toBeGreaterThan(0);

    // 평문이 절대 포함되지 않았는지 — 검증의 핵심.
    expect(init?.body as string).not.toContain("y-doc-update-1");
  });

  it("throws when getSessionKey returns null (sync inactive)", async () => {
    const t = new RelayTransport({
      baseUrl: "http://relay.test",
      getAccessToken: async () => "tok",
      getSessionKey: () => null,
      fetchImpl: makeFetchMock(),
      manualPolling: true,
    });
    await expect(t.pushUpdate(new Uint8Array([1]))).rejects.toThrow(/no session key/);
  });

  it("throws when relay responds with non-2xx", async () => {
    const fetchMock = makeFetchMock();
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { error: "invalid_access_token" }));

    const t = new RelayTransport({
      baseUrl: "http://relay.test",
      getAccessToken: async () => "tok",
      getSessionKey: makeSession(),
      fetchImpl: fetchMock,
      manualPolling: true,
    });
    await expect(t.pushUpdate(new Uint8Array([1]))).rejects.toThrow(/HTTP 401/);
  });
});

describe("RelayTransport — pollOnce", () => {
  it("decrypts ciphertext_b64 and fires onRemoteUpdate handlers", async () => {
    // 미리 같은 키로 envelope 생성 (서버가 갖고 있을 ciphertext 흉내)
    const plaintext = new TextEncoder().encode("remote-y-update");
    const envelope = encrypt(KEY, plaintext, new TextEncoder().encode(`user:${USER_ID}`));
    const b64 = btoa(String.fromCharCode(...envelope));

    const fetchMock = makeFetchMock();
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { version: 5, ciphertext_b64: b64 }));

    const t = new RelayTransport({
      baseUrl: "http://relay.test",
      getAccessToken: async () => "tok",
      getSessionKey: makeSession(),
      fetchImpl: fetchMock,
      manualPolling: true,
    });

    const received: Uint8Array[] = [];
    t.onRemoteUpdate((u) => received.push(u));

    await t.pollOnce();

    expect(received).toHaveLength(1);
    expect(new TextDecoder().decode(received[0]!)).toBe("remote-y-update");
  });

  it("does nothing when relay returns 204 (no change)", async () => {
    const fetchMock = makeFetchMock();
    fetchMock.mockResolvedValueOnce(noBodyResponse(204));

    const t = new RelayTransport({
      baseUrl: "http://relay.test",
      getAccessToken: async () => "tok",
      getSessionKey: makeSession(),
      fetchImpl: fetchMock,
      manualPolling: true,
    });

    const received: Uint8Array[] = [];
    t.onRemoteUpdate((u) => received.push(u));
    await t.pollOnce();
    expect(received).toHaveLength(0);
  });

  it("transitions status to 'error' when relay returns 401", async () => {
    const fetchMock = makeFetchMock();
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { error: "invalid_access_token" }));

    const t = new RelayTransport({
      baseUrl: "http://relay.test",
      getAccessToken: async () => "tok",
      getSessionKey: makeSession(),
      fetchImpl: fetchMock,
      manualPolling: true,
    });
    await t.pollOnce();
    expect(t.status).toBe("error");
  });

  it("ignores 429 (rate limited) — does not throw, does not invoke handlers, status stays", async () => {
    const fetchMock = makeFetchMock();
    fetchMock.mockResolvedValueOnce(jsonResponse(429, { error: "rate_limited" }));

    const t = new RelayTransport({
      baseUrl: "http://relay.test",
      getAccessToken: async () => "tok",
      getSessionKey: makeSession(),
      fetchImpl: fetchMock,
      manualPolling: true,
    });

    const received: Uint8Array[] = [];
    t.onRemoteUpdate((u) => received.push(u));
    await t.pollOnce();
    expect(received).toHaveLength(0);
    expect(t.status).not.toBe("error");
  });

  it("transitions status to 'error' when AEAD decryption fails (envelope tamper / wrong key)", async () => {
    const goodEnvelope = encrypt(
      KEY,
      new Uint8Array([1, 2, 3]),
      new TextEncoder().encode(`user:${USER_ID}`),
    );
    goodEnvelope[goodEnvelope.length - 1] ^= 0x01; // tamper tag
    const tampered_b64 = btoa(String.fromCharCode(...goodEnvelope));

    const fetchMock = makeFetchMock();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { version: 9, ciphertext_b64: tampered_b64 }),
    );

    const t = new RelayTransport({
      baseUrl: "http://relay.test",
      getAccessToken: async () => "tok",
      getSessionKey: makeSession(),
      fetchImpl: fetchMock,
      manualPolling: true,
    });
    await t.pollOnce();
    expect(t.status).toBe("error");
  });

  it("AAD binds to user — different user's envelope fails to decrypt (cross-user replay safe)", async () => {
    const otherEnvelope = encrypt(
      KEY,
      new Uint8Array([1, 2, 3]),
      new TextEncoder().encode("user:other"),
    );
    const b64 = btoa(String.fromCharCode(...otherEnvelope));
    const fetchMock = makeFetchMock();
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { version: 1, ciphertext_b64: b64 }));

    const t = new RelayTransport({
      baseUrl: "http://relay.test",
      getAccessToken: async () => "tok",
      getSessionKey: makeSession(USER_ID, KEY),
      fetchImpl: fetchMock,
      manualPolling: true,
    });
    await t.pollOnce();
    expect(t.status).toBe("error");
  });

  it("subsequent poll uses updated since=lastVersion", async () => {
    const fetchMock = makeFetchMock();
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { version: 3, ciphertext_b64: null }))
      .mockResolvedValueOnce(noBodyResponse(204));

    const t = new RelayTransport({
      baseUrl: "http://relay.test",
      getAccessToken: async () => "tok",
      getSessionKey: makeSession(),
      fetchImpl: fetchMock,
      manualPolling: true,
    });
    await t.pollOnce();
    await t.pollOnce();

    const url1 = fetchMock.mock.calls[0]![0] as string;
    const url2 = fetchMock.mock.calls[1]![0] as string;
    expect(url1).toContain("since=0");
    expect(url2).toContain("since=3");
  });
});

describe("RelayTransport — lifecycle", () => {
  it("connect → status='connected' (after first pollOnce returns), disconnect → 'disconnected'", async () => {
    const fetchMock = makeFetchMock();
    fetchMock.mockResolvedValueOnce(noBodyResponse(204));

    const t = new RelayTransport({
      baseUrl: "http://relay.test",
      getAccessToken: async () => "tok",
      getSessionKey: makeSession(),
      fetchImpl: fetchMock,
      manualPolling: true,
    });
    expect(t.status).toBe("idle");
    await t.connect();
    expect(t.status).toBe("connected");
    await t.disconnect();
    expect(t.status).toBe("disconnected");
  });

  it("disconnect clears handler set so subsequent emits are silent", async () => {
    const goodPlain = new Uint8Array([7]);
    const env1 = encrypt(KEY, goodPlain, new TextEncoder().encode(`user:${USER_ID}`));
    const b64 = btoa(String.fromCharCode(...env1));

    const fetchMock = makeFetchMock();
    fetchMock.mockResolvedValueOnce(noBodyResponse(204));

    const t = new RelayTransport({
      baseUrl: "http://relay.test",
      getAccessToken: async () => "tok",
      getSessionKey: makeSession(),
      fetchImpl: fetchMock,
      manualPolling: true,
    });
    const received: Uint8Array[] = [];
    t.onRemoteUpdate((u) => received.push(u));
    await t.connect();
    await t.disconnect();

    // disconnect 후 새 fetch 가 일어나도 (외부에서 직접 호출하는 비정상 경로) handler 비어있음.
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { version: 1, ciphertext_b64: b64 }));
    await t.pollOnce();
    expect(received).toHaveLength(0);
  });
});

describe("RelayTransport — Zero-Knowledge invariant", () => {
  it("plaintext bytes never appear in any fetch request body (push direction)", async () => {
    const fetchMock = makeFetchMock();
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { version: 1 }));

    const t = new RelayTransport({
      baseUrl: "http://relay.test",
      getAccessToken: async () => "tok",
      getSessionKey: makeSession(),
      fetchImpl: fetchMock,
      manualPolling: true,
    });
    const secret = new TextEncoder().encode("super-secret-y-update-payload");
    await t.pushUpdate(secret);

    const sentBody = fetchMock.mock.calls[0]![1]?.body as string;
    expect(sentBody).not.toContain("super-secret-y-update-payload");
    // Sanity: encrypt + decrypt round-trip 으로 envelope 내부에는 secret 이 들어있음.
    const sent = JSON.parse(sentBody) as { ciphertext_b64: string };
    const envelope = Uint8Array.from(atob(sent.ciphertext_b64), (c) => c.charCodeAt(0));
    const decoded = decrypt(KEY, envelope, new TextEncoder().encode(`user:${USER_ID}`));
    expect(new TextDecoder().decode(decoded)).toBe("super-secret-y-update-payload");
  });
});
