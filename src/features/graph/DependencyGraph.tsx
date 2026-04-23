import '@xyflow/react/dist/style.css';

import { useCallback, useEffect, useMemo, useState } from 'react';
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
} from '@xyflow/react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { toReactFlowElements, type GraphNodeData } from './adapter';
import type { LayoutDirection } from './layout';
import { nodeTypes } from './node-types';
import type { GraphPayload } from './types';
import { useBlastRadiusSelection } from './use-blast-radius-selection';

// ---------------------------------------------------------------------------
// Inner component (needs to be inside ReactFlowProvider to call useReactFlow)
// ---------------------------------------------------------------------------

interface InnerGraphProps {
  payload: GraphPayload;
  direction: LayoutDirection;
  onToggle: () => void;
  nodesDraggable: boolean;
}

function InnerGraph({ payload, direction, onToggle, nodesDraggable }: InnerGraphProps) {
  const { t } = useTranslation('common');
  const { fitView } = useReactFlow();
  const { zoom } = useViewport();

  const initialElements = toReactFlowElements(payload, direction);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<GraphNodeData>>(
    initialElements.nodes,
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialElements.edges);

  const { state: selectionState, select: selectionSelect, clear: selectionClear } = useBlastRadiusSelection();

  // Compact mode: hide labels when graph is large AND zoomed out
  const manyNodes = nodes.length > 200;
  const compactMode = manyNodes && zoom < 0.5;

  // Re-layout when payload or direction changes
  useEffect(() => {
    const { nodes: ln, edges: le } = toReactFlowElements(payload, direction);
    setNodes(ln);
    setEdges(le);
    // Clear blast-radius selection when graph data reloads
    selectionClear();
    requestAnimationFrame(() => {
      fitView({ padding: 0.15 });
    });
  }, [payload, direction, setNodes, setEdges, fitView, selectionClear]);

  // Click on a credential node → load blast radius; click again → toggle off
  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node<GraphNodeData>) => {
      if (node.data.kind !== 'credential') return;
      if (
        selectionState.phase !== 'idle' &&
        'credentialId' in selectionState &&
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
      if (e.key === 'Escape') selectionClear();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectionClear]);

  // Derive nodes with blast-radius status + compact flag injected (does NOT mutate state)
  const computedNodes = useMemo(() => {
    const sm = selectionState.phase === 'ok' ? selectionState.statusMap : null;
    if (!sm && !compactMode) return nodes;
    return nodes.map((n) => {
      const next = { ...n.data };
      if (sm) next.status = sm[n.id] ?? 'dimmed';
      if (compactMode) next.compact = true;
      return { ...n, data: next };
    });
  }, [nodes, selectionState, compactMode]);

  return (
    <div className="relative h-full w-full">
      <div className="absolute right-3 top-3 z-10">
        <Button
          variant="outline"
          size="sm"
          onClick={onToggle}
          aria-label={t('graph.toggleDirection')}
        >
          {direction === 'TB' ? t('graph.direction.tb') : t('graph.direction.lr')}
        </Button>
      </div>

      {selectionState.phase === 'ok' && (
        <p className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-md bg-background/80 px-3 py-1 text-xs text-muted-foreground shadow backdrop-blur-sm">
          {t('graph.blastRadius.clearHint')}
        </p>
      )}

      <ReactFlow
        nodes={computedNodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
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
}

/**
 * Dependency graph canvas. Wraps `ReactFlowProvider` so `useReactFlow` is
 * available in the inner component. Direction state is lifted here.
 */
export function DependencyGraph({ payload, nodesDraggable = false }: DependencyGraphProps) {
  const [direction, setDirection] = useState<LayoutDirection>('TB');

  const toggle = useCallback(() => {
    setDirection((d) => (d === 'TB' ? 'LR' : 'TB'));
  }, []);

  return (
    <ReactFlowProvider>
      <InnerGraph
        payload={payload}
        direction={direction}
        onToggle={toggle}
        nodesDraggable={nodesDraggable}
      />
    </ReactFlowProvider>
  );
}
