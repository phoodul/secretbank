import dagre from "@dagrejs/dagre";
import type { Edge, Node } from "@xyflow/react";

export type LayoutDirection = "TB" | "LR";

export interface LayoutOptions {
  direction: LayoutDirection;
  nodeWidth?: number; // default 180
  nodeHeight?: number; // default 56
  rankSep?: number; // default 80
  nodeSep?: number; // default 40
}

/**
 * Pure function: given React Flow nodes and edges, returns copies with
 * `position` set by dagre's layout engine.
 *
 * Dagre returns center-based coordinates; React Flow expects top-left, so we
 * offset by half width/height.
 */
export function getLayoutedElements<T extends Record<string, unknown>>(
  nodes: Node<T>[],
  edges: Edge[],
  opts: LayoutOptions,
): { nodes: Node<T>[]; edges: Edge[] } {
  if (nodes.length === 0) return { nodes: [], edges: [] };

  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: opts.direction,
    nodesep: opts.nodeSep ?? 40,
    ranksep: opts.rankSep ?? 80,
  });

  const w = opts.nodeWidth ?? 180;
  const h = opts.nodeHeight ?? 56;

  nodes.forEach((n) => g.setNode(n.id, { width: w, height: h }));
  edges.forEach((e) => g.setEdge(e.source, e.target));

  dagre.layout(g);

  const laidOut = nodes.map((n) => {
    const pos = g.node(n.id);
    return {
      ...n,
      position: {
        x: pos.x - w / 2,
        y: pos.y - h / 2,
      },
    };
  });

  return { nodes: laidOut, edges };
}
