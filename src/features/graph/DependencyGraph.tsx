import '@xyflow/react/dist/style.css';

import { useCallback, useEffect, useState } from 'react';
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Node,
} from '@xyflow/react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { toReactFlowElements, type GraphNodeData } from './adapter';
import type { LayoutDirection } from './layout';
import { nodeTypes } from './node-types';
import type { GraphPayload } from './types';

// ---------------------------------------------------------------------------
// Inner component (needs to be inside ReactFlowProvider to call useReactFlow)
// ---------------------------------------------------------------------------

interface InnerGraphProps {
  payload: GraphPayload;
  direction: LayoutDirection;
  onToggle: () => void;
}

function InnerGraph({ payload, direction, onToggle }: InnerGraphProps) {
  const { t } = useTranslation('common');
  const { fitView } = useReactFlow();

  const initialElements = toReactFlowElements(payload, direction);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<GraphNodeData>>(
    initialElements.nodes,
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialElements.edges);

  // Re-layout when payload or direction changes
  useEffect(() => {
    const { nodes: ln, edges: le } = toReactFlowElements(payload, direction);
    setNodes(ln);
    setEdges(le);
    requestAnimationFrame(() => {
      fitView({ padding: 0.15 });
    });
  }, [payload, direction, setNodes, setEdges, fitView]);

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

      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
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
}

/**
 * Dependency graph canvas. Wraps `ReactFlowProvider` so `useReactFlow` is
 * available in the inner component. Direction state is lifted here.
 */
export function DependencyGraph({ payload }: DependencyGraphProps) {
  const [direction, setDirection] = useState<LayoutDirection>('TB');

  const toggle = useCallback(() => {
    setDirection((d) => (d === 'TB' ? 'LR' : 'TB'));
  }, []);

  return (
    <ReactFlowProvider>
      <InnerGraph payload={payload} direction={direction} onToggle={toggle} />
    </ReactFlowProvider>
  );
}
