/**
 * SyncTransport — M9 Phase C 의 transport 추상화 layer.
 *
 * Yjs 의 `Y.encodeStateAsUpdate(doc)` 결과 (`Uint8Array`) 를 외부 채널로 push
 * 하고, 외부에서 들어오는 update 를 `onRemoteUpdate` 콜백으로 노출한다.
 * 본 layer 자체는 평문 update 를 다루며, AEAD 암복호화는 Phase E 에서
 * `RelayTransport` 가 구현 (현재 `StubTransport` 는 in-memory no-op).
 *
 * **의도적 단순화 (Phase C):**
 * - HTTP / WebSocket 등 wire protocol 추상화는 phase E 진입 시 결정
 * - 키 회전 / snapshot vs delta 분리도 phase F 이후 점진적 도입
 * - 본 phase 는 "interface + stub" 만 — SyncProvider 가 transport 의 lifecycle
 *   (connect/disconnect) 을 어떻게 다루는지 검증 가능한 최소 표면
 */

export type TransportStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "disconnected"
  | "error";

export interface SyncTransport {
  /**
   * 현재 transport 상태. 동기적으로 읽을 수 있어야 (UI 표시용) 하므로
   * getter / 필드 둘 다 허용.
   */
  readonly status: TransportStatus;

  /**
   * 외부 채널 연결. 멱등 (이미 connected 면 즉시 resolve). `error` 상태에서
   * 호출 시 내부 상태를 `connecting` → 재시도하는 것까지가 책임.
   */
  connect(): Promise<void>;

  /**
   * 연결 해제 + 내부 리스너 정리. 멱등.
   */
  disconnect(): Promise<void>;

  /**
   * 로컬 Y.Doc 변경을 외부로 송신. AEAD 적용은 RelayTransport 에서.
   * Stub 은 no-op.
   */
  pushUpdate(update: Uint8Array): Promise<void>;

  /**
   * 외부에서 들어오는 update 구독. 반환 함수 호출 시 unsubscribe.
   * 여러 번 구독 가능 (SyncProvider 가 직접 doc 에 apply 하는 데 1회만 필요).
   */
  onRemoteUpdate(handler: (update: Uint8Array) => void): () => void;
}

// ---------------------------------------------------------------------------
// StubTransport — Phase C 의 placeholder.
// ---------------------------------------------------------------------------

/**
 * In-memory no-op transport. Phase E (relay /sync 엔드포인트) 까지의 임시
 * 구현. `connect()` 는 단일 microtask 내에서 `connected` 로 전환, 모든
 * pushUpdate 는 즉시 resolve, onRemoteUpdate 는 호출되지 않는다.
 *
 * 의도: SyncProvider 의 lifecycle 회귀 (mount → connect → unmount → disconnect)
 * 를 격리해서 검증할 수 있게 한다.
 */
export class StubTransport implements SyncTransport {
  private _status: TransportStatus = "idle";
  private handlers = new Set<(update: Uint8Array) => void>();

  get status(): TransportStatus {
    return this._status;
  }

  async connect(): Promise<void> {
    if (this._status === "connected" || this._status === "connecting") return;
    this._status = "connecting";
    // microtask 1 hop — 실제 transport 의 비동기성을 모사 (mount→connected
    // 전환이 동기 setState 에 갇히지 않도록).
    await Promise.resolve();
    this._status = "connected";
  }

  async disconnect(): Promise<void> {
    this._status = "disconnected";
    this.handlers.clear();
  }

  async pushUpdate(update: Uint8Array): Promise<void> {
    void update; // Phase C placeholder — Phase E 의 RelayTransport 가 사용
  }

  onRemoteUpdate(handler: (update: Uint8Array) => void): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  /**
   * Test-only: 외부 update 도착을 시뮬레이션.
   *
   * Phase D 의 db:changed 라운드트립 회귀에서 사용 예정.
   */
  __emitForTesting(update: Uint8Array): void {
    for (const h of this.handlers) h(update);
  }
}
