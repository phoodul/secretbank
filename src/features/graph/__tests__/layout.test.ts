import { describe, expect, it } from 'vitest';
import { getLayoutedElements } from '../layout';
import type { Node, Edge } from '@xyflow/react';

/** Build a simple linear chain: n0 → n1 → n2 → … → n(count-1) */
function makeChain(count: number): { nodes: Node<Record<string, unknown>>[]; edges: Edge[] } {
  const nodes: Node<Record<string, unknown>>[] = Array.from({ length: count }, (_, i) => ({
    id: `n${i}`,
    position: { x: 0, y: 0 },
    data: {},
  }));

  const edges: Edge[] = Array.from({ length: count - 1 }, (_, i) => ({
    id: `e${i}`,
    source: `n${i}`,
    target: `n${i + 1}`,
  }));

  return { nodes, edges };
}

describe('getLayoutedElements', () => {
  it('TB 방향 — 10 노드 모두에 숫자 position 할당', () => {
    const { nodes, edges } = makeChain(10);
    const result = getLayoutedElements(nodes, edges, { direction: 'TB' });

    expect(result.nodes).toHaveLength(10);
    for (const node of result.nodes) {
      expect(typeof node.position.x).toBe('number');
      expect(typeof node.position.y).toBe('number');
      expect(isNaN(node.position.x)).toBe(false);
      expect(isNaN(node.position.y)).toBe(false);
    }
  });

  it('LR 방향 — TB 와 다른 레이아웃 결과', () => {
    const { nodes, edges } = makeChain(10);
    const tb = getLayoutedElements(nodes, edges, { direction: 'TB' });
    const lr = getLayoutedElements(nodes, edges, { direction: 'LR' });

    // At least one node should differ between TB and LR
    const hasDiff = tb.nodes.some((tbNode, i) => {
      const lrNode = lr.nodes[i];
      return tbNode.position.x !== lrNode.position.x || tbNode.position.y !== lrNode.position.y;
    });

    expect(hasDiff).toBe(true);
  });

  it('빈 입력 — 빈 배열 반환 (크래시 없음)', () => {
    const result = getLayoutedElements([], [], { direction: 'TB' });
    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
  });

  it('단일 노드 — position 할당됨', () => {
    const nodes: Node<Record<string, unknown>>[] = [
      { id: 'solo', position: { x: 0, y: 0 }, data: {} },
    ];
    const result = getLayoutedElements(nodes, [], { direction: 'TB' });
    expect(result.nodes).toHaveLength(1);
    expect(typeof result.nodes[0].position.x).toBe('number');
    expect(typeof result.nodes[0].position.y).toBe('number');
  });

  it('엣지는 그대로 반환됨', () => {
    const { nodes, edges } = makeChain(3);
    const result = getLayoutedElements(nodes, edges, { direction: 'TB' });
    expect(result.edges).toHaveLength(2);
    expect(result.edges[0].source).toBe('n0');
    expect(result.edges[0].target).toBe('n1');
  });
});
