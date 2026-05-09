/**
 * @file nm-client.ts
 * @license AGPL-3.0-or-later
 *
 * Native Messaging 클라이언트 — extension ↔ nm-host 통신 typed wrapper.
 *
 * chrome.runtime.connectNative 로 long-lived Port 를 유지하며,
 * MV3 Service Worker 는 active port 가 있는 한 idle 타임아웃(30초)이 발생하지 않는다.
 * 수동 setInterval keepalive 는 불필요하다.
 *
 * 연결 성공 판단: chrome.runtime.connectNative() 호출 자체가 throw 하지 않고,
 * 직후 onDisconnect 가 즉시 발화되지 않으면 성공으로 간주하고 Promise.resolve() 한다.
 * (실제 NM host 는 init 메시지를 받기 전까지 응답을 보내지 않으므로
 *  첫 onMessage 를 기다리면 connect() 가 무한 pending 이 된다.)
 *
 * 재연결 정책 (exponential backoff):
 *   지연: 1s → 2s → 4s → 8s → 16s (최대 5회)
 *   5회 소진 후 영구 실패 → onDisconnect 핸들러에 { kind: "max_retries_exceeded" } 전달.
 *
 * 사용 예:
 *   const client = new NMClient();
 *   await client.connect();
 *   const unsub = client.onMessage((msg) => console.log(msg));
 *   await client.sendMessage({ type: "init", version: "1" });
 *   // 정리
 *   unsub();
 *   client.disconnect();
 */

import type {
  McpCredentialMeta,
  IssuerRecipe,
  NMMessage,
  NMMessageCredentialListByDomainResponse,
  NMMessageCredentialSaveResponse,
  NMMessageGetRecipeForDomainResponse,
  NMMessageUpsertRecipeForDomainResponse,
  NMMessageGetCredentialListResponse,
  NMMessageGraphForCredentialResponse,
  NMMessageIncidentCheckForHostResponse,
  NMMessageBlastRadiusForHostResponse,
  NMMessageMcpContextPushResponse,
  NMMessageExtSettingsGetMcpOptInResponse,
} from "@secretbank/shared";
import {
  NMDisconnected,
  NMNotInstalled,
  type NMDisconnectReason,
  classifyLastError,
} from "./nm-errors.js";

// ---------------------------------------------------------------------------
// 상수
// ---------------------------------------------------------------------------

/** Native Messaging 호스트 이름 (OS 에 등록된 ID) */
const NM_HOST_ID = "com.secretbank.nm_host";

/** 지수 백오프 초기 지연 (ms) */
const BACKOFF_BASE_MS = 1000;

/** 최대 재연결 시도 횟수 */
const MAX_RETRIES = 5;

// ---------------------------------------------------------------------------
// 타입 정의
// ---------------------------------------------------------------------------

/** 메시지 핸들러 */
type MessageHandler = (msg: NMMessage) => void;

/** 단절 핸들러 */
type DisconnectHandler = (reason: NMDisconnectReason) => void;

// ---------------------------------------------------------------------------
// NMClient 클래스
// ---------------------------------------------------------------------------

/**
 * Native Messaging 클라이언트.
 *
 * long-lived Port 방식으로 chrome.runtime.connectNative 를 사용한다.
 * Port 가 살아있는 동안 MV3 SW 가 keepalive 상태를 유지한다 (수동 setInterval 불필요).
 */
export class NMClient {
  /** 현재 연결된 Port (null = 미연결 또는 영구 실패) */
  private port: chrome.runtime.Port | null = null;

  /** 메시지 핸들러 목록 */
  private messageHandlers = new Set<MessageHandler>();

  /** 단절 핸들러 목록 */
  private disconnectHandlers = new Set<DisconnectHandler>();

  /** 현재 재연결 시도 횟수 */
  private retryCount = 0;

  /** 영구 실패 상태 — 이 플래그가 true 이면 reconnect 하지 않는다 */
  private permanentlyFailed = false;

  /** 현재 진행 중인 reconnect 타이머 ID */
  private reconnectTimerId: ReturnType<typeof setTimeout> | null = null;

  // -------------------------------------------------------------------------
  // 공개 API
  // -------------------------------------------------------------------------

  /**
   * nm-host 에 연결한다.
   *
   * 이미 연결된 상태이면 no-op (즉시 resolve).
   * 연결 실패(NMNotInstalled 등)는 Promise rejection 으로 전달한다.
   *
   * 구현 상세:
   *   - chrome.runtime.connectNative() 호출
   *   - 직후 lastError 동기 검사
   *   - onDisconnect 와 onMessage 리스너 부착
   *   - Port 생성 성공이면 즉시 resolve (첫 onMessage 대기 없음)
   *   - onDisconnect 가 동기적으로 발화되면(미설치 등) reject
   */
  connect(): Promise<void> {
    // 이미 연결된 상태이면 즉시 resolve
    if (this.port !== null) return Promise.resolve();

    // 영구 실패 상태이면 즉시 reject
    if (this.permanentlyFailed) {
      return Promise.reject(new NMDisconnected("영구 실패 상태 — reconnect 불가."));
    }

    return new Promise<void>((resolve, reject) => {
      let settled = false;

      const settle = (err?: unknown) => {
        if (settled) return;
        settled = true;
        if (err !== undefined) {
          reject(err);
        } else {
          resolve();
        }
      };

      try {
        const port = chrome.runtime.connectNative(NM_HOST_ID);

        // 일부 브라우저 구현에서는 connectNative 직후 동기적으로 lastError 가 세팅된다
        if (chrome.runtime.lastError) {
          const err = classifyLastError(chrome.runtime.lastError);
          settle(err ?? new NMDisconnected());
          return;
        }

        // Port 인스턴스 저장
        this.port = port;

        // 리스너 부착
        port.onMessage.addListener((rawMsg: unknown) => {
          // NMMessage union 으로 캐스팅 (B-4 에서 zod 검증 추가 예정)
          const msg = rawMsg as NMMessage;
          for (const handler of this.messageHandlers) {
            handler(msg);
          }
        });

        port.onDisconnect.addListener(() => {
          this.port = null;

          // chrome.runtime.lastError 검출 (onDisconnect 콜백 내에서만 유효)
          const nmErr = classifyLastError(chrome.runtime.lastError);

          // connect() Promise 가 아직 settle 되지 않은 경우 → 연결 자체 실패
          if (!settled) {
            if (nmErr instanceof NMNotInstalled) {
              this.permanentlyFailed = true;
              settle(nmErr);
              this._notifyDisconnect({ kind: "not_installed", error: nmErr });
            } else {
              settle(nmErr ?? new NMDisconnected());
            }
            return;
          }

          // 이미 resolve 된 후의 단절 처리
          if (this.permanentlyFailed) return;

          // nm-host 미설치 → 재시도해도 의미 없음
          if (nmErr instanceof NMNotInstalled) {
            this.permanentlyFailed = true;
            this._notifyDisconnect({ kind: "not_installed", error: nmErr });
            return;
          }

          // 정상/비정상 단절 → 지수 백오프 재연결.
          // nmErr 가 NMDisconnected 인스턴스가 아니면 메시지를 보존한 새 인스턴스로 wrap.
          const disconnectedErr =
            nmErr instanceof NMDisconnected ? nmErr : new NMDisconnected(nmErr?.message);
          this._notifyDisconnect({ kind: "disconnected", error: disconnectedErr });
          this._scheduleReconnect();
        });

        // Port 생성 성공 = 연결 성공으로 간주.
        // queueMicrotask 로 한 틱 지연하여 connectNative 직후 동기적으로 발화되는
        // onDisconnect (예: NMNotInstalled) 가 먼저 처리된 뒤 resolve 되도록 한다.
        queueMicrotask(() => settle());
      } catch (e) {
        settle(e instanceof Error ? e : new NMDisconnected(String(e)));
      }
    });
  }

  /**
   * NMMessage 를 nm-host 로 전송한다.
   *
   * NM 은 fire-and-forget 이므로 port.postMessage 가 성공하면 resolve.
   * 미연결 상태이면 reject.
   */
  sendMessage(msg: NMMessage): Promise<void> {
    if (!this.port) {
      return Promise.reject(new NMDisconnected("연결되지 않은 상태에서 sendMessage 호출됨."));
    }
    try {
      this.port.postMessage(msg);
      return Promise.resolve();
    } catch (e) {
      return Promise.reject(e instanceof Error ? e : new NMDisconnected(String(e)));
    }
  }

  /**
   * 메시지 수신 핸들러를 등록한다.
   *
   * @returns unsubscribe 함수 (호출 시 핸들러 제거)
   */
  onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  /**
   * 단절 핸들러를 등록한다.
   *
   * @returns unsubscribe 함수
   */
  onDisconnect(handler: DisconnectHandler): () => void {
    this.disconnectHandlers.add(handler);
    return () => this.disconnectHandlers.delete(handler);
  }

  /**
   * Port 를 명시적으로 닫는다. 자동 reconnect 를 시도하지 않는다.
   */
  disconnect(): void {
    this.permanentlyFailed = true; // 이후 자동 reconnect 차단
    this._clearReconnectTimer();
    if (this.port) {
      this.port.disconnect();
      this.port = null;
    }
  }

  /** 현재 연결 상태를 반환한다. */
  isConnected(): boolean {
    return this.port !== null;
  }

  // -------------------------------------------------------------------------
  // D-4: credential RPC 래퍼 (request-response 패턴)
  // -------------------------------------------------------------------------

  // D-4: 요청-응답 매칭 — type 기준 단순 매칭 (단일 inflight 가정). T-CRED-1.
  private static readonly RPC_TIMEOUT_MS = 5000;

  /** nm-host 에 메시지를 보내고 특정 type 의 응답을 기다린다. */
  private async _rpc<T extends NMMessage>(request: NMMessage, responseType: T["type"]): Promise<T> {
    await this.sendMessage(request);
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        unsub();
        reject(new NMDisconnected(`RPC timeout: ${responseType}`));
      }, NMClient.RPC_TIMEOUT_MS);

      const unsub = this.onMessage((msg) => {
        if (msg.type === responseType) {
          clearTimeout(timer);
          unsub();
          resolve(msg as T);
        }
      });
    });
  }

  /** 도메인 기준 기존 credential 조회. T-CRED-1: session token 첨부 필수. */
  async credentialListByDomain(
    domain: string,
    sessionToken: string,
  ): Promise<NMMessageCredentialListByDomainResponse> {
    return this._rpc<NMMessageCredentialListByDomainResponse>(
      { type: "credential_list_by_domain", domain, session_token: sessionToken },
      "credential_list_by_domain_response",
    );
  }

  /** 새 credential 생성. T-CRED-1: session token 첨부 필수. */
  async credentialCreate(
    payload: {
      domain: string;
      username: string;
      password: string;
      site_name: string;
    },
    sessionToken: string,
  ): Promise<NMMessageCredentialSaveResponse> {
    return this._rpc<NMMessageCredentialSaveResponse>(
      {
        type: "credential_create",
        domain: payload.domain,
        username: payload.username,
        password: payload.password,
        site_name: payload.site_name,
        session_token: sessionToken,
      },
      "credential_save_response",
    );
  }

  /** 기존 credential 업데이트 (rotation). T-CRED-1: session token 첨부 필수. */
  async credentialUpdate(
    payload: {
      credential_id: string;
      username: string;
      password: string;
    },
    sessionToken: string,
  ): Promise<NMMessageCredentialSaveResponse> {
    return this._rpc<NMMessageCredentialSaveResponse>(
      {
        type: "credential_update",
        credential_id: payload.credential_id,
        username: payload.username,
        password: payload.password,
        session_token: sessionToken,
      },
      "credential_save_response",
    );
  }

  // -------------------------------------------------------------------------
  // T-24-E-E2: issuer recipe RPC
  // -------------------------------------------------------------------------

  /**
   * 도메인 레시피를 조회한다.
   *
   * 우선순위: preset > user > heuristic.
   * 없으면 `found: false` 반환 — caller 가 heuristic 을 적용한다.
   * T-CRED-1: session_token 첨부 필수.
   */
  async getRecipeForDomain(
    domain: string,
    sessionToken: string,
  ): Promise<NMMessageGetRecipeForDomainResponse> {
    return this._rpc<NMMessageGetRecipeForDomainResponse>(
      { type: "get_recipe_for_domain", domain, session_token: sessionToken },
      "get_recipe_for_domain_response",
    );
  }

  /**
   * 사용자 보정 레시피를 silent 등록/갱신한다.
   *
   * TM-EXT-ACTOR: 사용자 명시적 동의 없이 silent 저장 — audit log 1건 기록.
   * T-CRED-1: session_token 첨부 필수.
   */
  async upsertRecipeForDomain(
    domain: string,
    recipe: IssuerRecipe,
    sessionToken: string,
  ): Promise<NMMessageUpsertRecipeForDomainResponse> {
    return this._rpc<NMMessageUpsertRecipeForDomainResponse>(
      { type: "upsert_recipe_for_domain", domain, recipe, session_token: sessionToken },
      "upsert_recipe_for_domain_response",
    );
  }

  // -------------------------------------------------------------------------
  // T-24-E-E4: popup CredentialList 용 전체 목록 조회
  // -------------------------------------------------------------------------

  /**
   * 전체(또는 도메인 필터) credential 목록을 반환한다.
   *
   * popup CredentialList 에서 호출 — 카드 표시용 최소 정보(issuer/domain/username).
   * password 는 포함되지 않는다 (T-CRED-1).
   * T-CRED-1: session_token 첨부 필수.
   */
  async credentialListVisible(
    domainFilter: string | undefined,
    sessionToken: string,
  ): Promise<NMMessageGetCredentialListResponse> {
    return this._rpc<NMMessageGetCredentialListResponse>(
      {
        type: "get_credential_list",
        ...(domainFilter ? { domain_filter: domainFilter } : {}),
        session_token: sessionToken,
      },
      "get_credential_list_response",
    );
  }

  // -------------------------------------------------------------------------
  // T-24-E-G1-1: credential mini-graph RPC
  // -------------------------------------------------------------------------

  /**
   * credential 의 1-hop 의존성 mini-graph 를 반환한다.
   *
   * extension popup CredentialCard hover 시 호출.
   * 응답: center(credential) + project 팬아웃 최대 5개 + hidden_count.
   * credential plaintext ❌ — center_label = issuer name 만.
   * T-CRED-1: session_token 첨부 필수.
   */
  async graphForCredential(
    credentialId: string,
    sessionToken: string,
  ): Promise<NMMessageGraphForCredentialResponse> {
    return this._rpc<NMMessageGraphForCredentialResponse>(
      { type: "graph_for_credential", credential_id: credentialId, session_token: sessionToken },
      "graph_for_credential_response",
    );
  }

  // -------------------------------------------------------------------------
  // T-24-E-G2-1: host incident 조회 RPC
  // -------------------------------------------------------------------------

  /**
   * 현재 방문 중인 host 의 severity ≥ MEDIUM incident 목록을 반환한다.
   *
   * extension content-script 가 페이지 host 를 전달하면,
   * 백엔드가 issuer.domains[] / incident.domain 과 subdomain-safe 매칭 후
   * severity LOW/INFO 를 제거하여 응답한다.
   *
   * credential 컨텍스트 없음 — 외부 사이트 방문 시 사용 가능.
   * T-CRED-1: session_token 첨부 필수.
   */
  async incidentCheckForHost(
    host: string,
    sessionToken: string,
  ): Promise<NMMessageIncidentCheckForHostResponse> {
    return this._rpc<NMMessageIncidentCheckForHostResponse>(
      { type: "incident_check_for_host", host, session_token: sessionToken },
      "incident_check_for_host_response",
    );
  }

  // -------------------------------------------------------------------------
  // T-24-E-G3-1: host blast radius preview RPC
  // -------------------------------------------------------------------------

  /**
   * autofill/save 시 host 기반 blast radius preview 를 반환한다.
   *
   * extension 이 `autocomplete="new-password"` 필드에 값 입력(= rotation 시도) 시 호출.
   * 응답: credential_id + 최대 5개 affected 아이템 + hidden_count.
   * credential plaintext ❌ — kind/label/status 만.
   *
   * host 매칭 없으면 credential_id=null, affected=[], total=0.
   * T-CRED-1: session_token 첨부 필수.
   */
  async blastRadiusForHost(
    host: string,
    sessionToken: string,
  ): Promise<NMMessageBlastRadiusForHostResponse> {
    return this._rpc<NMMessageBlastRadiusForHostResponse>(
      { type: "blast_radius_for_host", host, session_token: sessionToken },
      "blast_radius_for_host_response",
    );
  }

  // -------------------------------------------------------------------------
  // T-24-E-G4-1: MCP context push
  // -------------------------------------------------------------------------

  /**
   * 현재 사이트 컨텍스트를 MCP server queue 에 push 한다.
   *
   * opt-in OFF (기본) 시 nm-host → bridge 에서 silently drop → ok: true 반환.
   * opt-in ON 시 queue push + audit log 1건 기록.
   *
   * privacy 설계:
   *   - credential plaintext ❌ — id/name/issuer 만 전송.
   *   - 사용자 opt-in 없이 호출해도 backend 가 silently drop.
   *
   * T-CRED-1: session_token 첨부 필수.
   */
  async mcpContextPush(
    host: string,
    credentialMeta: McpCredentialMeta[],
    sessionToken: string,
  ): Promise<NMMessageMcpContextPushResponse> {
    const timestamp = Date.now();
    await this.sendMessage({
      type: "mcp_context_push",
      host,
      credential_meta: credentialMeta,
      timestamp,
      session_token: sessionToken,
    });
    // mcp_context_push 는 ack-only 응답 (type 없는 단순 { ok: boolean })
    // → RPC 패턴 대신 fire-and-wait-for-ack 처리.
    return new Promise<NMMessageMcpContextPushResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        unsub();
        reject(new NMDisconnected("RPC timeout: mcp_context_push_ack"));
      }, NMClient.RPC_TIMEOUT_MS);

      const unsub = this.onMessage((msg) => {
        // ack 응답은 type 필드 없이 { ok: boolean } 형태.
        // nm-host 에서 bridge forward 후 bridge 응답을 그대로 반환.
        const raw = msg as unknown as Record<string, unknown>;
        if ("ok" in raw && typeof raw["ok"] === "boolean") {
          clearTimeout(timer);
          unsub();
          resolve({ ok: raw["ok"] as boolean, error: raw["error"] as string | undefined });
        }
      });
    });
  }

  // -------------------------------------------------------------------------
  // T-24-E-G4-2: desktop MCP opt-in 조회 (옵션 C — single source of truth)
  // -------------------------------------------------------------------------

  /**
   * desktop ExtensionSettings 의 MCP opt-in 값을 조회한다.
   *
   * opt-in ON = true, OFF = false (기본값 false).
   * RPC 실패 시 { ok: false, enabled: false } 반환 (fail-safe).
   * T-CRED-1: session_token 첨부 필수.
   */
  async extSettingsGetMcpOptIn(
    sessionToken: string,
  ): Promise<NMMessageExtSettingsGetMcpOptInResponse> {
    return this._rpc<NMMessageExtSettingsGetMcpOptInResponse>(
      { type: "ext_settings_get_mcp_opt_in", session_token: sessionToken },
      "ext_settings_get_mcp_opt_in_response",
    );
  }

  // -------------------------------------------------------------------------
  // 내부 메서드
  // -------------------------------------------------------------------------

  /** 지수 백오프로 재연결을 예약한다. */
  private _scheduleReconnect(): void {
    if (this.retryCount >= MAX_RETRIES) {
      // 최대 재시도 소진 → 영구 실패
      this.permanentlyFailed = true;
      const err = new NMDisconnected("최대 재연결 횟수(5회)를 초과했습니다.");
      this._notifyDisconnect({ kind: "max_retries_exceeded", error: err });
      return;
    }

    // 지연: 1s, 2s, 4s, 8s, 16s (retryCount=0 → 1s, 1 → 2s, ... 4 → 16s)
    const delayMs = BACKOFF_BASE_MS * Math.pow(2, this.retryCount);
    this.retryCount += 1;

    this.reconnectTimerId = setTimeout(() => {
      this.reconnectTimerId = null;
      if (this.permanentlyFailed) return;

      // 재연결 시도
      this.connect().catch(() => {
        // connect() reject 는 onDisconnect 리스너에서 처리됨.
        // chrome API 접근 자체가 실패하는 경우에만 여기에 도달한다.
      });
    }, delayMs);
  }

  /** 예약된 reconnect 타이머를 취소한다. */
  private _clearReconnectTimer(): void {
    if (this.reconnectTimerId !== null) {
      clearTimeout(this.reconnectTimerId);
      this.reconnectTimerId = null;
    }
  }

  /** 등록된 모든 onDisconnect 핸들러에 reason 을 전달한다. */
  private _notifyDisconnect(reason: NMDisconnectReason): void {
    for (const handler of this.disconnectHandlers) {
      handler(reason);
    }
  }
}
