import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import '@/lib/i18n';
import { GraphPage } from '../GraphPage';
import type { GraphPayload } from '../types';

// ---------------------------------------------------------------------------
// Mock @tauri-apps/api/core
// ---------------------------------------------------------------------------
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock @xyflow/react to avoid jsdom canvas / DOM issues
// ---------------------------------------------------------------------------
vi.mock('@xyflow/react', async () => {
  const React = await import('react');
  return {
    ReactFlow: ({ children }: { children?: React.ReactNode }) =>
      React.createElement('div', { 'data-testid': 'rf' }, children),
    ReactFlowProvider: ({ children }: { children?: React.ReactNode }) =>
      React.createElement('div', { 'data-testid': 'rf-provider' }, children),
    MiniMap: () => null,
    Controls: () => null,
    Background: () => null,
    useNodesState: (init: unknown[]) => [init, vi.fn(), vi.fn()],
    useEdgesState: (init: unknown[]) => [init, vi.fn(), vi.fn()],
    useReactFlow: () => ({ fitView: vi.fn() }),
    useViewport: () => ({ zoom: 1, x: 0, y: 0 }),
    Panel: ({ children }: { children?: React.ReactNode }) =>
      React.createElement('div', {}, children),
  };
});

import { invoke } from '@tauri-apps/api/core';

const mockInvoke = vi.mocked(invoke);

const FIXTURE: GraphPayload = {
  nodes: [
    { id: 'iss-1', kind: 'issuer', label: 'GitHub', meta_json: { slug: 'github' } },
    { id: 'cred-1', kind: 'credential', label: 'My Token', meta_json: { env: 'prod' } },
    { id: 'proj-1', kind: 'project', label: 'My App', meta_json: {} },
  ],
  edges: [
    { id: 'iss-1->cred-1:Issues', source: 'iss-1', target: 'cred-1', kind: 'issues' },
    { id: 'cred-1->proj-1:UsedBy', source: 'cred-1', target: 'proj-1', kind: 'used_by' },
  ],
};

function renderPage() {
  return render(
    <MemoryRouter>
      <GraphPage />
    </MemoryRouter>,
  );
}

describe('GraphPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('로딩 중 — loading 메시지 표시', () => {
    // invoke never resolves → stays in loading phase
    mockInvoke.mockReturnValue(new Promise(() => undefined));
    renderPage();
    expect(screen.getByText(/Loading graph|그래프 로딩/i)).toBeInTheDocument();
  });

  it('데이터 로드 성공 — 제목 표시 + ReactFlow 렌더', async () => {
    mockInvoke.mockResolvedValueOnce(FIXTURE);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/Dependency Graph|의존성 그래프/i)).toBeInTheDocument();
    });

    expect(screen.getByTestId('rf-provider')).toBeInTheDocument();
  });

  it('빈 payload — empty state 메시지 표시', async () => {
    mockInvoke.mockResolvedValueOnce({ nodes: [], edges: [] } satisfies GraphPayload);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/No credentials wired|아직 프로젝트와 연결/i)).toBeInTheDocument();
    });
  });

  it('오류 — error 메시지 + 재시도 버튼 표시', async () => {
    mockInvoke.mockRejectedValueOnce('network error');
    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/Failed to load graph|그래프를 불러오지/i)).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /retry|재시도/i })).toBeInTheDocument();
  });
});
