/**
 * @file graph.ts
 * @license AGPL-3.0-or-later
 *
 * T-24-E-G1-1: extension popup mini-graph 응답 타입.
 *
 * Rust `CredentialMiniGraph` 와 1:1 대응.
 * credential plaintext ❌ — center_label = issuer display_name 만.
 */

// ---------------------------------------------------------------------------
// Mini-graph 타입
// ---------------------------------------------------------------------------

/**
 * mini-graph 의 project 노드 하나.
 *
 * - id: ProjectId (ULID string)
 * - label: 프로젝트 이름
 * - env: "prod" | "staging" | "dev"
 */
export interface ProjectNode {
  id: string;
  label: string;
  env: string;
}

/**
 * mini-graph 의 에지 하나 (credential → project).
 */
export interface MiniGraphEdge {
  from: string;
  to: string;
}

/**
 * extension popup hover 에 표시할 1-hop credential mini-graph.
 *
 * - center_id: CredentialId (ULID string)
 * - center_label: issuer display_name (plaintext ❌)
 * - project_nodes: 최대 5개 (MAX_VISIBLE = 5)
 * - edges: center → project 에지
 * - hidden_count: 잘린 project 수 ("+N more" 표시용)
 */
export interface CredentialMiniGraph {
  center_id: string;
  center_label: string;
  project_nodes: ProjectNode[];
  edges: MiniGraphEdge[];
  hidden_count: number;
}
