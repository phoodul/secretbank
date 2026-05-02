import type { Node, NodeProps } from "@xyflow/react";

import type { GraphNodeData } from "../adapter";

/**
 * Custom comparator for React.memo on all 4 custom node components.
 *
 * React Flow passes updated NodeProps on every viewport move (position,
 * dragging, selected, zIndex…). We only re-render when the fields that affect
 * visual output change: label, kind, direction, status, compact.
 * Everything else (meta, selected, dragging, positionAbsolute*, zIndex) is
 * intentionally ignored.
 */
export function areNodePropsEqual(
  prev: NodeProps<Node<GraphNodeData>>,
  next: NodeProps<Node<GraphNodeData>>,
): boolean {
  if (prev.id !== next.id) return false;
  const p = prev.data;
  const n = next.data;
  return (
    p.label === n.label &&
    p.kind === n.kind &&
    p.direction === n.direction &&
    p.status === n.status &&
    p.compact === n.compact
  );
}
