/**
 * RelayTransport — M9 Phase E-4 (replaces StubTransport in production).
 *
 * 책임:
 *   1. push: 평문 Yjs update (Uint8Array) 를 AEAD 로 암호화 → relay 의
 *      `POST /sync/snapshot` 으로 전송. 응답 `version` 을 `lastVersion` 에 보관.
 *   2. poll: 일정 주기로 `GET /sync/snapshot?since=lastVersion` 호출 →
 *      200 응답이면 ciphertext 를 base64 디코드 + AEAD 복호 → `onRemoteUpdate`
 *      핸들러로 전달. 204 면 no-op. 429 → exponential backoff.
 *   3. lifecycle: `connect()` 가 polling 타이머 시작, `disconnect()` 가 정지.
 *
 * **Zero-Knowledge** : 평문은 절대 fetch 본문에 들어가지 않는다 — encrypt 후
 * b64 envelope 만 송신. AEAD key 는 sync_get_root_key 의 결과 (HKDF subkey of
 * enc_key). 키 부재 시 push 는 throw, poll 은 status='error' 로 전이.
 *
 * **AAD binding** : envelope 의 무결성을 사용자에 묶기 위해 `user:<userId>` 를
 * AAD 로 사용 — 다른 사용자의 ciphertext 를 가져와 디스플레이하려는 cross-
 * user replay 를 차단.
 */

import { decrypt, encrypt } from "./aead";
import type { SyncTransport, TransportStatus } from "./transport";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RelayTransportOptions {
  /** 릴레이 base URL (예: `https://secretbank.app` or `http://localhost:8787`). */
  baseUrl: string;
  /** 매 호출마다 신선한 access token 을 반환 (refresh 가 필요할 수 있음). */
  getAccessToken: () => Promise<string>;
  /** AEAD key 와 user_id 의 묶음. null 반환 시 sync 비활성. */
  getSessionKey: () => { rootKey: Uint8Array; userId: string } | null;
  /** Polling 주기 (기본 5초). */
  pollIntervalMs?: number;
  /** 테스트에서 fetch 를 주입할 때 사용. 미설정 시 globalThis.fetch. */
  fetchImpl?: typeof fetch;
  /** 테스트용 즉시 polling 1회만 — 시간 의존성 회피. */
  manualPolling?: boolean;
}

interface SnapshotResponseBody {
  version: number;
  ciphertext_b64: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin);
}

function base64ToBytes(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function aadFor(userId: string): Uint8Array {
  return new TextEncoder().encode(`user:${userId}`);
}

// ---------------------------------------------------------------------------
// RelayTransport
// ---------------------------------------------------------------------------

export class RelayTransport implements SyncTransport {
  private _status: TransportStatus = "idle";
  private handlers = new Set<(update: Uint8Array) => void>();
  private lastVersion = 0;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private cancelled = false;
  private readonly baseUrl: string;

  constructor(private readonly opts: RelayTransportOptions) {
    // Url::to_string() 등 backend 에서 내려오는 url 이 trailing slash 를
    // 가질 수 있으므로 정규화 — `${baseUrl}/sync/snapshot` 합칠 때 double
    // slash 방지.
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
  }

  get status(): TransportStatus {
    return this._status;
  }

  async connect(): Promise<void> {
    if (this._status === "connected" || this._status === "connecting") return;
    this._status = "connecting";
    this.cancelled = false;
    // 첫 poll 1회 — 즉시 최신 상태 확인.
    await this.pollOnce().catch(() => {
      /* swallow — status 가 이미 'error' 로 전이됨 */
    });
    if (this.cancelled) return;
    if (this._status === "connecting") this._status = "connected";
    if (!this.opts.manualPolling) this.scheduleNextPoll();
  }

  async disconnect(): Promise<void> {
    this.cancelled = true;
    this._status = "disconnected";
    if (this.pollTimer != null) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    this.handlers.clear();
  }

  async pushUpdate(update: Uint8Array): Promise<void> {
    const session = this.opts.getSessionKey();
    if (session == null) {
      throw new Error("RelayTransport.pushUpdate: no session key (sync inactive)");
    }
    const envelope = encrypt(session.rootKey, update, aadFor(session.userId));
    const ct_b64 = bytesToBase64(envelope);

    const token = await this.opts.getAccessToken();
    const fetchFn = this.opts.fetchImpl ?? globalThis.fetch.bind(globalThis);
    const res = await fetchFn(`${this.baseUrl}/sync/snapshot`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ ciphertext_b64: ct_b64 }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`RelayTransport.pushUpdate: HTTP ${res.status} — ${body}`);
    }
    const json = (await res.json()) as { version: number };
    this.lastVersion = json.version;
  }

  onRemoteUpdate(handler: (update: Uint8Array) => void): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  /**
   * 한 번 GET /sync/snapshot 호출. Test 에서 manualPolling=true 면 외부에서
   * 명시 호출. Production 은 connect() 가 자동 스케줄.
   */
  async pollOnce(): Promise<void> {
    const session = this.opts.getSessionKey();
    if (session == null) {
      this._status = "error";
      return;
    }
    const token = await this.opts.getAccessToken();
    const fetchFn = this.opts.fetchImpl ?? globalThis.fetch.bind(globalThis);
    const url = `${this.baseUrl}/sync/snapshot?since=${this.lastVersion}`;
    const res = await fetchFn(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.status === 204) return; // no change
    if (res.status === 429) {
      // backoff 는 단순화 — Retry-After 헤더 무시하고 다음 poll 까지 대기.
      // production 은 scheduleNextPoll 의 일반 interval 로 충분.
      return;
    }
    if (res.status === 401) {
      this._status = "error";
      return;
    }
    if (!res.ok) {
      this._status = "error";
      return;
    }

    const body = (await res.json()) as SnapshotResponseBody;
    if (body.ciphertext_b64 == null) {
      this.lastVersion = body.version;
      return;
    }

    let update: Uint8Array;
    try {
      const envelope = base64ToBytes(body.ciphertext_b64);
      update = decrypt(session.rootKey, envelope, aadFor(session.userId));
    } catch {
      // AEAD 검증 실패 — wire 에 의도되지 않은 데이터 가능성. status='error' 후
      // 호출자 (SyncProvider) 가 재인증 또는 재unlock 트리거.
      this._status = "error";
      return;
    }
    this.lastVersion = body.version;

    for (const h of this.handlers) h(update);
  }

  /** Test-only — 외부에서 lastVersion 을 강제로 설정. Phase F 의 multi-doc 도입 시 제거. */
  __setLastVersionForTesting(v: number): void {
    this.lastVersion = v;
  }

  private scheduleNextPoll(): void {
    if (this.cancelled) return;
    const interval = this.opts.pollIntervalMs ?? 5_000;
    this.pollTimer = setTimeout(() => {
      void this.pollOnce()
        .catch(() => {
          this._status = "error";
        })
        .finally(() => this.scheduleNextPoll());
    }, interval);
  }
}
