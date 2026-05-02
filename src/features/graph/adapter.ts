import type { Edge, Node } from "@xyflow/react";
import type { GraphEdge, GraphNode, GraphPayload, NodeKind } from "./types";
import { getLayoutedElements, type LayoutDirection } from "./layout";
import type { NodePositionMap } from "./use-graph-node-positions";

/** Visual status assigned to a node when a blast-radius selection is active. */
export type NodeSelectionStatus = "primary" | "secondary" | "tertiary" | "dimmed";

export interface GraphNodeData extends Record<string, unknown> {
  label: string;
  kind: NodeKind;
  /** renamed from meta_json for JS ergonomics */
  meta: Record<string, unknown>;
  /** current layout direction — used by node components to pick handle positions */
  direction: LayoutDirection;
  /** Present only when a blast-radius selection is active. */
  status?: NodeSelectionStatus;
  /**
   * Compact mode: hides node label to reduce visual noise.
   * Activated when node count > 200 AND zoom < 0.5.
   */
  compact?: boolean;
}

function toFlowNode(node: GraphNode, direction: LayoutDirection): Node<GraphNodeData> {
  return {
    id: node.id,
    type: node.kind, // routes to custom node component via nodeTypes map
    position: { x: 0, y: 0 }, // will be overwritten by dagre
    data: {
      label: node.label,
      kind: node.kind,
      meta: node.meta_json,
      direction,
    },
  };
}

function toFlowEdge(edge: GraphEdge): Edge {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: edge.kind,
    animated: false,
    type: "default",
    data: { kind: edge.kind },
  };
}

/**
 * Converts a backend GraphPayload to React Flow elements with dagre layout
 * applied.
 *
 * If `savedPositions` is provided, any node whose id is present in the map
 * has its dagre-computed position overridden by the saved one. Nodes not in
 * the map keep the dagre default. This preserves the user's manually-dragged
 * arrangement across page navigation and app restart.
 */
export function toReactFlowElements(
  payload: GraphPayload,
  direction: LayoutDirection,
  savedPositions?: NodePositionMap,
): { nodes: Node<GraphNodeData>[]; edges: Edge[] } {
  const rfNodes = payload.nodes.map((n) => toFlowNode(n, direction));
  const rfEdges = payload.edges.map(toFlowEdge);
  const laid = getLayoutedElements(rfNodes, rfEdges, { direction });
  if (!savedPositions) return laid;
  const merged = laid.nodes.map((n) => {
    const saved = savedPositions[n.id];
    return saved ? { ...n, position: { x: saved.x, y: saved.y } } : n;
  });
  return { nodes: merged, edges: laid.edges };
}
