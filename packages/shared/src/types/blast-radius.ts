/**
 * @file blast-radius.ts
 * @license AGPL-3.0-or-later
 *
 * T-24-E-G3-1: extension autofill/save 시 blast radius preview 타입.
 *
 * Rust `BlastRadiusItem` / `BlastRadiusForHostResponse` 와 1:1 대응.
 * credential plaintext ❌ — kind + label + status 만.
 */

// ---------------------------------------------------------------------------
// Blast radius preview 타입
// ---------------------------------------------------------------------------

/**
 * blast radius preview 아이템 하나.
 *
 * - kind: "project" | "deployment"
 * - label: 사람이 읽을 수 있는 라벨 (프로젝트 이름 / "URL @ env")
 * - status: "active" | "unknown"
 */
export interface BlastRadiusItem {
  kind: "project" | "deployment";
  label: string;
  status: string;
}

/**
 * `blast_radius_for_host` 응답.
 *
 * - credential_id: 매칭된 credential ULID (없으면 null)
 * - affected: 최대 5개 미리보기 아이템
 * - total: 전체 affected 노드 수
 * - hidden_count: 잘린 수 (total - affected.length)
 */
export interface BlastRadiusForHostResponse {
  credential_id: string | null;
  affected: BlastRadiusItem[];
  total: number;
  hidden_count: number;
}
