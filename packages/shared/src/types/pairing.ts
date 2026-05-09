/**
 * @file pairing.ts
 * @license AGPL-3.0-or-later
 *
 * Extension ↔ Desktop 페어링 및 Native Messaging 관련 타입.
 * B-4: X25519 ECDH + XChaCha20-Poly1305 페어링 프로토콜 메시지 union 확장.
 */

// ---------------------------------------------------------------------------
// 페어링 상태 머신
// ---------------------------------------------------------------------------

/**
 * Extension 과 Desktop 앱 간 페어링 상태.
 *
 * - `Idle`: 페어링 없음 (초기 상태)
 * - `Pairing`: QR 코드 표시 / 코드 입력 대기 중
 * - `Paired`: 페어링 완료, 세션 토큰 유효
 * - `Failed`: 페어링 실패 또는 세션 만료
 */
export type PairingState = "Idle" | "Pairing" | "Paired" | "Failed";

// ---------------------------------------------------------------------------
// 세션 토큰
// ---------------------------------------------------------------------------

/**
 * 페어링 성공 후 발급되는 세션 토큰.
 *
 * - `token`: HMAC-SHA256 기반 불투명 토큰 (base64url)
 * - `expires_at`: Unix timestamp (ms)
 */
export interface SessionToken {
  token: string;
  expires_at: number;
}

// ---------------------------------------------------------------------------
// Native Messaging 프로토콜 — Discriminated Union (B-4 확장)
// ---------------------------------------------------------------------------

/**
 * Extension → nm-host: 초기 연결 요청.
 *
 * ext_pub: Extension 측 X25519 공개키 (base64 인코딩, 32바이트).
 * extension_id: chrome.runtime.id 로 식별되는 확장 프로그램 ID.
 */
export interface NMMessageInit {
  type: "init";
  extension_id: string;
  version: string;
  ext_pub: string;
}

/**
 * nm-host → desktop IPC: Extension 의 페어링 요청을 데스크톱 앱에 중계.
 * B-6 에서 IPC 핸들러가 구현된다 — B-4 에서는 타입만 정의.
 */
export interface NMMessagePairRequest {
  type: "pair_request";
  extension_id: string;
  ext_pub: string;
}

/**
 * desktop → nm-host: 사용자가 페어링 승인/거부한 결과.
 *
 * approved=true 시 desktop_pub(base64) 포함.
 * approved=false 시 reason(선택) 포함.
 */
export interface NMMessagePairResponse {
  type: "pair_response";
  approved: boolean;
  desktop_pub?: string;
  reason?: string;
}

/**
 * nm-host → Extension: 페어링 완료 응답.
 *
 * desktop_pub: 데스크톱 X25519 공개키 (base64, 32바이트).
 * device_id: 데스크톱 디바이스 식별자.
 */
export interface NMMessagePaired {
  type: "paired";
  desktop_pub: string;
  device_id: string;
}

/** Extension → Desktop: 시크릿 reveal 요청 */
export interface NMMessageReveal {
  type: "reveal";
  credential_id: string;
  session_token: string;
}

/** Extension → Desktop: 새 시크릿 저장 요청 */
export interface NMMessageSave {
  type: "save";
  kind: import("./credential.js").CredentialKind;
  issuer_id: string;
  name: string;
  value: string;
  session_token: string;
}

// D-4: credential 저장/조회 RPC 메시지

/** Extension → nm-host: 도메인 기준 credential 목록 조회 */
export interface NMMessageCredentialListByDomain {
  type: "credential_list_by_domain";
  domain: string;
  session_token: string;
}

/** nm-host → Extension: 도메인 credential 조회 응답 */
export interface NMMessageCredentialListByDomainResponse {
  type: "credential_list_by_domain_response";
  exists: boolean;
  credential_id?: string;
}

/** Extension → nm-host: 새 credential 생성 */
export interface NMMessageCredentialCreate {
  type: "credential_create";
  domain: string;
  username: string;
  /** D-4: plaintext — NM channel 은 B-4 X25519+ChaCha20-Poly1305 로 보호됨. T-CRED-1. */
  password: string;
  site_name: string;
  session_token: string;
}

/** Extension → nm-host: 기존 credential 업데이트 (rotation) */
export interface NMMessageCredentialUpdate {
  type: "credential_update";
  credential_id: string;
  username: string;
  /** D-4: plaintext — NM channel 은 B-4 X25519+ChaCha20-Poly1305 로 보호됨. T-CRED-1. */
  password: string;
  session_token: string;
}

/** nm-host → Extension: credential_create / credential_update 응답 */
export interface NMMessageCredentialSaveResponse {
  type: "credential_save_response";
  ok: boolean;
  credential_id?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// T-24-E-E2: issuer recipe RPC 메시지
// ---------------------------------------------------------------------------

/** Extension → nm-host: 도메인 레시피 조회 */
export interface NMMessageGetRecipeForDomain {
  type: "get_recipe_for_domain";
  domain: string;
  session_token: string;
}

/** nm-host → Extension: 도메인 레시피 조회 응답 */
export interface NMMessageGetRecipeForDomainResponse {
  type: "get_recipe_for_domain_response";
  domain: string;
  found: boolean;
  recipe?: import("./recipe.js").IssuerRecipe;
  source?: "preset" | "user" | "heuristic";
}

/** Extension → nm-host: 도메인 레시피 upsert (사용자 보정 silent 등록) */
export interface NMMessageUpsertRecipeForDomain {
  type: "upsert_recipe_for_domain";
  domain: string;
  recipe: import("./recipe.js").IssuerRecipe;
  session_token: string;
}

/** nm-host → Extension: 도메인 레시피 upsert 응답 */
export interface NMMessageUpsertRecipeForDomainResponse {
  type: "upsert_recipe_for_domain_response";
  ok: boolean;
  error?: string;
}

// 하위 호환 — A2 의 "pair" 타입 (코드 제출 메시지)은 pair_response 로 통합.
// 기존 테스트가 "pair" type 을 직접 참조하는 경우를 위해 재-export 하지 않는다.

// ---------------------------------------------------------------------------
// T-24-E-G1-1: credential mini-graph RPC 메시지
// ---------------------------------------------------------------------------

/** Extension → nm-host: credential 1-hop mini-graph 조회 */
export interface NMMessageGraphForCredential {
  type: "graph_for_credential";
  credential_id: string;
  session_token: string;
}

/** nm-host → Extension: credential mini-graph 응답 */
export interface NMMessageGraphForCredentialResponse {
  type: "graph_for_credential_response";
  ok: boolean;
  center_id?: string;
  center_label?: string;
  project_nodes?: import("./graph.js").ProjectNode[];
  edges?: import("./graph.js").MiniGraphEdge[];
  hidden_count?: number;
  error?: string;
}

// ---------------------------------------------------------------------------
// T-24-E-E4: credential 전체 목록 조회 (popup CredentialList 용)
// ---------------------------------------------------------------------------

/** credential 카드에 표시할 최소 정보 — plaintext ❌ (password 미포함). */
export interface CredentialListItem {
  credential_id: string;
  issuer: string;
  domain: string;
  username?: string;
}

/** Extension → nm-host: 전체 credential 목록 조회 (도메인 필터 선택 적용) */
export interface NMMessageGetCredentialList {
  type: "get_credential_list";
  /** 도메인 접두사 필터 (없으면 전체). */
  domain_filter?: string;
  session_token: string;
}

/** nm-host → Extension: credential 목록 응답 */
export interface NMMessageGetCredentialListResponse {
  type: "get_credential_list_response";
  ok: boolean;
  /** vault locked / 오류 시 undefined. */
  items?: CredentialListItem[];
  error?: string;
}

// ---------------------------------------------------------------------------
// T-24-E-G2-1: host incident 조회 RPC 메시지
// ---------------------------------------------------------------------------

/** Extension → nm-host: 현재 방문 중인 host 의 incident 목록 조회 */
export interface NMMessageIncidentCheckForHost {
  type: "incident_check_for_host";
  /** 정규화 전 host (예: "github.com", "www.stripe.com") */
  host: string;
  session_token: string;
}

/** nm-host → Extension: host incident 조회 응답 */
export interface NMMessageIncidentCheckForHostResponse {
  type: "incident_check_for_host_response";
  ok: boolean;
  /** severity ≥ MEDIUM 인 incident 요약 목록 (ok=true 시). 최신 순(detected_at DESC). */
  matches?: import("./incident.js").IncidentMatchSummary[];
  error?: string;
}

// ---------------------------------------------------------------------------
// T-24-E-G3-1: blast radius preview RPC 메시지
// ---------------------------------------------------------------------------

/** Extension → nm-host: autofill/save 시 host blast radius preview 조회 */
export interface NMMessageBlastRadiusForHost {
  type: "blast_radius_for_host";
  /** 정규화 전 host (예: "github.com", "www.stripe.com") */
  host: string;
  session_token: string;
}

/** nm-host → Extension: blast radius preview 응답 */
export interface NMMessageBlastRadiusForHostResponse {
  type: "blast_radius_for_host_response";
  ok: boolean;
  /** 매칭된 credential ULID (ok=true + 매칭 있을 때). */
  credential_id?: string | null;
  /** 최대 5개 affected 아이템 (ok=true 시). */
  affected?: import("./blast-radius.js").BlastRadiusItem[];
  /** 전체 affected 노드 수 (ok=true 시). */
  total?: number;
  /** 잘린 수 = total - affected.length (ok=true 시). */
  hidden_count?: number;
  error?: string;
}

// ---------------------------------------------------------------------------
// T-24-E-G4-1: MCP context push RPC 메시지
// ---------------------------------------------------------------------------

/** credential 메타 — plaintext ❌, id + name + issuer 만. */
export interface CredentialMeta {
  id: string;
  name: string;
  issuer: string;
}

/** Extension → nm-host: 현재 사이트 컨텍스트를 MCP server queue 에 push */
export interface NMMessageMcpContextPush {
  type: "mcp_context_push";
  /** 정규화 전 URL host (예: "github.com") */
  host: string;
  /** 해당 host 에 매칭된 credential 메타 목록 (plaintext ❌) */
  credential_meta: CredentialMeta[];
  /** Unix timestamp ms (extension 측 시각) */
  timestamp: number;
  session_token: string;
}

/** nm-host → Extension: mcp_context_push ack 응답 */
export interface NMMessageMcpContextPushResponse {
  ok: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// NMMessage union 갱신 (G3-1 추가)
// ---------------------------------------------------------------------------

/**
 * Native Messaging 메시지 discriminated union.
 * B-4: X25519 페어링 메시지(init/pair_request/pair_response/paired) 추가.
 * D-4: credential CRUD RPC 메시지 추가.
 * E-2: issuer recipe RPC 메시지 추가.
 * E-4: get_credential_list RPC 메시지 추가.
 * G1-1: graph_for_credential mini-graph RPC 메시지 추가.
 * G2-1: incident_check_for_host host incident 조회 RPC 메시지 추가.
 * G3-1: blast_radius_for_host autofill/save blast radius preview RPC 메시지 추가.
 * G4-1: mcp_context_push 현재 사이트 컨텍스트 MCP queue push RPC 메시지 추가.
 */
export type NMMessage =
  | NMMessageInit
  | NMMessagePairRequest
  | NMMessagePairResponse
  | NMMessagePaired
  | NMMessageReveal
  | NMMessageSave
  | NMMessageCredentialListByDomain
  | NMMessageCredentialListByDomainResponse
  | NMMessageCredentialCreate
  | NMMessageCredentialUpdate
  | NMMessageCredentialSaveResponse
  | NMMessageGetRecipeForDomain
  | NMMessageGetRecipeForDomainResponse
  | NMMessageUpsertRecipeForDomain
  | NMMessageUpsertRecipeForDomainResponse
  | NMMessageGetCredentialList
  | NMMessageGetCredentialListResponse
  | NMMessageGraphForCredential
  | NMMessageGraphForCredentialResponse
  | NMMessageIncidentCheckForHost
  | NMMessageIncidentCheckForHostResponse
  | NMMessageBlastRadiusForHost
  | NMMessageBlastRadiusForHostResponse
  | NMMessageMcpContextPush;

// ---------------------------------------------------------------------------
// 하위 호환 별칭 (A2 명명 유지 — 외부 consumer 가 직접 import 중)
// ---------------------------------------------------------------------------

/** @deprecated B-4 에서 NMMessageInit 로 통합 (extension_id + ext_pub 추가). */
export type NMMessagePair = NMMessagePairRequest;
