import { describe, expect, it } from 'vitest';
import { toReactFlowElements } from '../adapter';
import type { GraphPayload } from '../types';

const FIXTURE_PAYLOAD: GraphPayload = {
  nodes: [
    {
      id: 'issuer-1',
      kind: 'issuer',
      label: 'GitHub',
      meta_json: { slug: 'github', docs_url: 'https://docs.github.com', icon_key: 'github' },
    },
    {
      id: 'cred-1',
      kind: 'credential',
      label: 'My GitHub Token',
      meta_json: { env: 'prod', status: 'active', issuer_id: 'issuer-1', expires_at: null },
    },
    {
      id: 'proj-1',
      kind: 'project',
      label: 'My App',
      meta_json: { repo_url: 'https://github.com/me/app', framework: 'Next.js' },
    },
  ],
  edges: [
    { id: 'issuer-1->cred-1:Issues', source: 'issuer-1', target: 'cred-1', kind: 'issues' },
    { id: 'cred-1->proj-1:UsedBy', source: 'cred-1', target: 'proj-1', kind: 'used_by' },
  ],
};

describe('toReactFlowElements', () => {
  it('백엔드 노드를 React Flow 노드로 변환하면서 data.kind 유지', () => {
    const { nodes } = toReactFlowElements(FIXTURE_PAYLOAD, 'TB');

    const issuerNode = nodes.find((n) => n.id === 'issuer-1');
    const credNode = nodes.find((n) => n.id === 'cred-1');
    const projNode = nodes.find((n) => n.id === 'proj-1');

    expect(issuerNode?.data.kind).toBe('issuer');
    expect(credNode?.data.kind).toBe('credential');
    expect(projNode?.data.kind).toBe('project');
  });

  it('data.label 이 백엔드 label 과 일치', () => {
    const { nodes } = toReactFlowElements(FIXTURE_PAYLOAD, 'TB');

    const credNode = nodes.find((n) => n.id === 'cred-1');
    expect(credNode?.data.label).toBe('My GitHub Token');
  });

  it('data.meta 가 meta_json 과 동일', () => {
    const { nodes } = toReactFlowElements(FIXTURE_PAYLOAD, 'TB');

    const issuerNode = nodes.find((n) => n.id === 'issuer-1');
    expect(issuerNode?.data.meta).toEqual({
      slug: 'github',
      docs_url: 'https://docs.github.com',
      icon_key: 'github',
    });
  });

  it('레이아웃 적용 후 모든 노드에 숫자 position 할당', () => {
    const { nodes } = toReactFlowElements(FIXTURE_PAYLOAD, 'TB');

    for (const node of nodes) {
      expect(typeof node.position.x).toBe('number');
      expect(typeof node.position.y).toBe('number');
      expect(isNaN(node.position.x)).toBe(false);
    }
  });

  it('엣지 변환 — source, target, kind 유지', () => {
    const { edges } = toReactFlowElements(FIXTURE_PAYLOAD, 'TB');

    expect(edges).toHaveLength(2);
    const usedByEdge = edges.find((e) => e.id === 'cred-1->proj-1:UsedBy');
    expect(usedByEdge?.source).toBe('cred-1');
    expect(usedByEdge?.target).toBe('proj-1');
    expect(usedByEdge?.data?.kind).toBe('used_by');
  });

  it('빈 payload — 노드·엣지 모두 빈 배열', () => {
    const { nodes, edges } = toReactFlowElements({ nodes: [], edges: [] }, 'LR');
    expect(nodes).toEqual([]);
    expect(edges).toEqual([]);
  });
});
