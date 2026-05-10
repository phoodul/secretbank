import "@xyflow/react/dist/style.css";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  useViewport,
  type Node,
} from "@xyflow/react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { toReactFlowElements, type GraphNodeData } from "./adapter";
import type { LayoutDirection } from "./layout";
import { nodeTypes } from "./node-types";
import type { GraphPayload } from "./types";
import { useBlastRadiusSelection } from "./use-blast-radius-selection";
import { useGraphNodePositions } from "./use-graph-node-positions";

// ---------------------------------------------------------------------------
// Inner component (needs to be inside ReactFlowProvider to call useReactFlow)
// ---------------------------------------------------------------------------

interface InnerGraphProps {
  payload: GraphPayload;
  direction: LayoutDirection;
  onToggle: () => void;
  nodesDraggable: boolean;
  /** deep-link 에서 전달된 focus credential id — highlight + center */
  focusNodeId?: string;
}

function InnerGraph({
  payload,
  direction,
  onToggle,
  nodesDraggable,
  focusNodeId,
}: InnerGraphProps) {
  const { t } = useTranslation("common");
  const { fitView, setCenter } = useReactFlow();
  const { zoom } = useViewport();

  const {
    positions: savedPositions,
    setPosition: savePosition,
    clear: clearPositions,
    pruneStale: prunePositions,
  } = useGraphNodePositions();

  const initialElements = toReactFlowElements(payload, direction, savedPositions);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<GraphNodeData>>(
    initialElements.nodes,
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialElements.edges);

  const {
    state: selectionState,
    select: selectionSelect,
    clear: selectionClear,
  } = useBlastRadiusSelection();

  // Compact mode: hide labels when graph is large AND zoomed out
  const manyNodes = nodes.length > 200;
  const compactMode = manyNodes && zoom < 0.5;

  // Re-layout when payload or direction changes
  useEffect(() => {
    // Drop saved positions for nodes that no longer exist in the payload
    prunePositions(payload.nodes.map((n) => n.id));
    const { nodes: ln, edges: le } = toReactFlowElements(payload, direction, savedPositions);
    setNodes(ln);
    setEdges(le);
    // Clear blast-radius selection when graph data reloads
    selectionClear();
    requestAnimationFrame(() => {
      fitView({ padding: 0.15 });
    });
  }, [
    payload,
    direction,
    savedPositions,
    prunePositions,
    setNodes,
    setEdges,
    fitView,
    selectionClear,
  ]);

  // Persist node position when the user finishes dragging
  const onNodeDragStop = useCallback(
    (_: React.MouseEvent, node: Node<GraphNodeData>) => {
      savePosition(node.id, { x: node.position.x, y: node.position.y });
    },
    [savePosition],
  );

  // Reset layout: drop saved positions and re-run dagre
  const onResetLayout = useCallback(() => {
    clearPositions();
    const { nodes: ln, edges: le } = toReactFlowElements(payload, direction);
    setNodes(ln);
    setEdges(le);
    requestAnimationFrame(() => {
      fitView({ padding: 0.15 });
    });
  }, [clearPositions, payload, direction, setNodes, setEdges, fitView]);

  const hasSavedPositions = Object.keys(savedPositions).length > 0;

  // Click on a credential node → load blast radius; click again → toggle off
  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node<GraphNodeData>) => {
      if (node.data.kind !== "credential") return;
      if (
        selectionState.phase !== "idle" &&
        "credentialId" in selectionState &&
        selectionState.credentialId === node.id
      ) {
        selectionClear();
        return;
      }
      selectionSelect(node.id);
    },
    [selectionState, selectionSelect, selectionClear],
  );

  // Esc key clears selection
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") selectionClear();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectionClear]);

  // deep-link focus: focusNodeId 가 바뀌면 해당 노드를 highlight + center
  useEffect(() => {
    if (!focusNodeId) return;
    // 노드가 렌더된 이후 실행되도록 rAF 사용
    requestAnimationFrame(() => {
      setNodes((prev) =>
        prev.map((n) => ({
          ...n,
          data: {
            ...n.data,
            focused: n.id === focusNodeId,
          },
        })),
      );
      // 해당 노드로 viewport 이동
      const target = nodes.find((n) => n.id === focusNodeId);
      if (target) {
        setCenter(target.position.x, target.position.y, { zoom: 1.2, duration: 600 });
      }
    });
  }, [focusNodeId, nodes, setNodes, setCenter]);

  // Derive nodes with blast-radius status + compact flag injected (does NOT mutate state)
  // focused flag is already set directly on nodes via the focusNodeId effect above.
  const computedNodes = useMemo(() => {
    const sm = selectionState.phase === "ok" ? selectionState.statusMap : null;
    if (!sm && !compactMode) return nodes;
    return nodes.map((n) => {
      const next = { ...n.data };
      if (sm) next.status = sm[n.id] ?? "dimmed";
      if (compactMode) next.compact = true;
      return { ...n, data: next };
    });
  }, [nodes, selectionState, compactMode]);

  return (
    <div className="relative h-full w-full">
      <div className="absolute right-3 top-3 z-10 flex gap-2">
        {hasSavedPositions && (
          <Button
            variant="outline"
            size="sm"
            onClick={onResetLayout}
            aria-label={t("graph.resetLayout")}
          >
            {t("graph.resetLayout")}
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={onToggle}
          aria-label={t("graph.toggleDirection")}
        >
          {direction === "TB" ? t("graph.direction.tb") : t("graph.direction.lr")}
        </Button>
      </div>

      {selectionState.phase === "ok" && (
        <p className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-md bg-background/80 px-3 py-1 text-xs text-muted-foreground shadow backdrop-blur-sm">
          {t("graph.blastRadius.clearHint")}
        </p>
      )}

      <ReactFlow
        nodes={computedNodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onNodeDragStop={onNodeDragStop}
        onlyRenderVisibleElements
        nodesDraggable={nodesDraggable}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.1}
        maxZoom={2}
      >
        <Background />
        <Controls />
        <MiniMap />
      </ReactFlow>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

export interface DependencyGraphProps {
  payload: GraphPayload;
  /** Whether nodes can be dragged. Default false for best performance. */
  nodesDraggable?: boolean;
  /** deep-link 에서 전달된 focus credential id — highlight + center */
  focusNodeId?: string;
}

/**
 * Dependency graph canvas. Wraps `ReactFlowProvider` so `useReactFlow` is
 * available in the inner component. Direction state is lifted here.
 */
export function DependencyGraph({
  payload,
  nodesDraggable = false,
  focusNodeId,
}: DependencyGraphProps) {
  const [direction, setDirection] = useState<LayoutDirection>("TB");

  const toggle = useCallback(() => {
    setDirection((d) => (d === "TB" ? "LR" : "TB"));
  }, []);

  return (
    <ReactFlowProvider>
      <InnerGraph
        payload={payload}
        direction={direction}
        onToggle={toggle}
        nodesDraggable={nodesDraggable}
        focusNodeId={focusNodeId}
      />
    </ReactFlowProvider>
  );
}
