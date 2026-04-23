/**
 * T044: GraphPayload wire types — mirrors the Rust structs in
 * `src-tauri/crates/api-vault-app/src/commands/graph.rs`.
 *
 * Field names match the serde output:
 *   - NodeKind / GraphEdgeKind: snake_case (rename_all = "snake_case")
 *   - GraphNode / GraphEdge / GraphPayload: default camelCase (Tauri serialises
 *     Rust snake_case struct fields as camelCase by default via serde)
 *
 * Verified against T043 source: `meta_json` is the exact field name in the
 * Rust struct, but Tauri's serde configuration serialises it as `metaJson`.
 * Wait — actually Tauri does NOT rename struct fields by default; only enum
 * variants with rename_all are affected. The GraphNode struct has no
 * rename_all, so `meta_json` stays `meta_json` in JSON.
 */

export type NodeKind = 'issuer' | 'credential' | 'project' | 'deployment';

export type GraphEdgeKind = 'issues' | 'used_by' | 'deployed_as';

export interface GraphNode {
  id: string;
  kind: NodeKind;
  label: string;
  /** per-kind extra attributes; field stays snake_case because the Rust struct has no rename_all */
  meta_json: Record<string, unknown>;
}

export interface GraphEdge {
  id: string; // "{source}->{target}:{Kind}"
  source: string;
  target: string;
  kind: GraphEdgeKind;
}

export interface GraphPayload {
  nodes: GraphNode[];
  edges: GraphEdge[];
}
