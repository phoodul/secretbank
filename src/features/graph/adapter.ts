import type { Edge, Node } from '@xyflow/react';
import type { GraphEdge, GraphNode, GraphPayload, NodeKind } from './types';
import { getLayoutedElements, type LayoutDirection } from './layout';

export interface GraphNodeData extends Record<string, unknown> {
  label: string;
  kind: NodeKind;
  /** renamed from meta_json for JS ergonomics */
  meta: Record<string, unknown>;
}

function toFlowNode(node: GraphNode): Node<GraphNodeData> {
  return {
    id: node.id,
    type: 'default',
    position: { x: 0, y: 0 }, // will be overwritten by dagre
    data: {
      label: node.label,
      kind: node.kind,
      meta: node.meta_json,
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
    type: 'default',
    data: { kind: edge.kind },
  };
}

/**
 * Converts a backend GraphPayload to React Flow elements with dagre layout
 * applied.
 */
export function toReactFlowElements(
  payload: GraphPayload,
  direction: LayoutDirection,
): { nodes: Node<GraphNodeData>[]; edges: Edge[] } {
  const rfNodes = payload.nodes.map(toFlowNode);
  const rfEdges = payload.edges.map(toFlowEdge);
  return getLayoutedElements(rfNodes, rfEdges, { direction });
}
