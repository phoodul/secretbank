import { render, screen, act, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import '@/lib/i18n';

// ---------------------------------------------------------------------------
// Mock @tauri-apps/api/core
// ---------------------------------------------------------------------------
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock @xyflow/react — same pattern as GraphPage.test.tsx but ReactFlow
// renders nodes as button elements so onNodeClick can be triggered.
//
// IMPORTANT: `fitView` MUST be a stable reference across renders.
// `useReactFlow: () => ({ fitView: vi.fn() })` creates a new function on every
// call, making `fitView` an unstable dep in useEffect — which re-runs the effect
// on every render, calls selectionClear(), and resets blast-radius state.
// ---------------------------------------------------------------------------
vi.mock('@xyflow/react', async () => {
  const React = await import('react');
  // Stable references created ONCE inside the factory closure
  const stableFitView = () => {};
  const stableSetNodes = () => {};
  const stableOnNodesChange = () => {};
  const stableSetEdges = () => {};
  const stableOnEdgesChange = () => {};
  return {
    ReactFlow: ({
      nodes,
      onNodeClick,
    }: {
      nodes: Array<{ id: string; data: Record<string, unknown> }>;
      onNodeClick?: (e: unknown, node: { id: string; data: Record<string, unknown> }) => void;
    }) =>
      React.createElement(
        'div',
        { 'data-testid': 'rf' },
        (nodes ?? []).map((n: { id: string; data: Record<string, unknown> }) =>
          React.createElement(
            'button',
            {
              key: n.id,
              'data-testid': `node-${n.id}`,
              'data-status': String(n.data.status ?? ''),
              onClick: (e: unknown) => onNodeClick?.(e, n),
            },
            String(n.data.label ?? n.id),
          ),
        ),
      ),
    ReactFlowProvider: ({ children }: { children?: React.ReactNode }) =>
      React.createElement('div', { 'data-testid': 'rf-provider' }, children),
    MiniMap: () => null,
    Controls: () => null,
    Background: () => null,
    Handle: () => null,
    useNodesState: (init: unknown[]) => [init, stableSetNodes, stableOnNodesChange],
    useEdgesState: (init: unknown[]) => [init, stableSetEdges, stableOnEdgesChange],
    useReactFlow: () => ({ fitView: stableFitView }),
    useViewport: () => ({ zoom: 1, x: 0, y: 0 }),
    Panel: ({ children }: { children?: React.ReactNode }) =>
      React.createElement('div', {}, children),
  };
});

import { invoke } from '@tauri-apps/api/core';
import { GraphPage } from '../GraphPage';
import type { GraphPayload, BlastRadius } from '../types';

const mockInvoke = vi.mocked(invoke);

const FIXTURE: GraphPayload = {
  nodes: [
    { id: 'iss-1', kind: 'issuer', label: 'GitHub', meta_json: {} },
    { id: 'cred-1', kind: 'credential', label: 'My Token', meta_json: {} },
    { id: 'proj-1', kind: 'project', label: 'My App', meta_json: {} },
  ],
  edges: [
    { id: 'iss-1->cred-1:Issues', source: 'iss-1', target: 'cred-1', kind: 'issues' },
    { id: 'cred-1->proj-1:UsedBy', source: 'cred-1', target: 'proj-1', kind: 'used_by' },
  ],
};

const BLAST_RESPONSE: BlastRadius = {
  primary: [{ kind: 'project', id: 'proj-1' }],
  secondary: [],
  tertiary: [],
};

function renderPage() {
  return render(
    <MemoryRouter>
      <GraphPage />
    </MemoryRouter>,
  );
}

describe('DependencyGraph — blast radius (via GraphPage)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('credential 노드 클릭 시 blast_radius_for_credential invoke 호출', async () => {
    mockInvoke
      .mockResolvedValueOnce(FIXTURE)
      .mockResolvedValueOnce(BLAST_RESPONSE);

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('node-cred-1')).toBeInTheDocument();
    });

    act(() => {
      screen.getByTestId('node-cred-1').click();
    });

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('blast_radius_for_credential', { id: 'cred-1' });
    });
  });

  it('credential 클릭 후 노드에 status 반영 — proj-1은 primary, iss-1은 dimmed', async () => {
    mockInvoke
      .mockResolvedValueOnce(FIXTURE)
      .mockResolvedValueOnce(BLAST_RESPONSE);

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('node-cred-1')).toBeInTheDocument();
    });

    act(() => {
      screen.getByTestId('node-cred-1').click();
    });

    await waitFor(() => {
      expect(screen.getByTestId('node-proj-1').getAttribute('data-status')).toBe('primary');
    });

    expect(screen.getByTestId('node-iss-1').getAttribute('data-status')).toBe('dimmed');
  });

  it('non-credential 노드 클릭은 blast_radius invoke 호출하지 않음', async () => {
    mockInvoke.mockResolvedValueOnce(FIXTURE);

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('node-iss-1')).toBeInTheDocument();
    });

    act(() => {
      screen.getByTestId('node-iss-1').click();
    });

    // Only graph_fetch was called
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(mockInvoke).not.toHaveBeenCalledWith('blast_radius_for_credential', expect.anything());
  });

  it('Esc 키 다운 시 선택 해제 → 노드 status 초기화', async () => {
    mockInvoke
      .mockResolvedValueOnce(FIXTURE)
      .mockResolvedValueOnce(BLAST_RESPONSE);

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('node-cred-1')).toBeInTheDocument();
    });

    // Click credential to activate blast radius
    act(() => {
      screen.getByTestId('node-cred-1').click();
    });

    // Wait for status to be set
    await waitFor(() => {
      expect(screen.getByTestId('node-proj-1').getAttribute('data-status')).toBe('primary');
    });

    // Fire Esc
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });

    // Status should be cleared
    await waitFor(() => {
      expect(screen.getByTestId('node-proj-1').getAttribute('data-status')).toBe('');
    });
    expect(screen.getByTestId('node-cred-1').getAttribute('data-status')).toBe('');
  });
});
