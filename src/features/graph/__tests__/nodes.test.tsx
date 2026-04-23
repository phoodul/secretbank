import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import '@/lib/i18n';

// ---------------------------------------------------------------------------
// Mock @xyflow/react — Handle requires internal React Flow context in jsdom.
// We mock only Handle; all other exports pass through.
// ---------------------------------------------------------------------------
vi.mock('@xyflow/react', async () => {
  const actual = await vi.importActual<typeof import('@xyflow/react')>('@xyflow/react');
  return {
    ...actual,
    Handle: () => null,
  };
});

import { IssuerNode } from '../nodes/IssuerNode';
import { CredentialNode } from '../nodes/CredentialNode';
import { ProjectNode } from '../nodes/ProjectNode';
import { DeploymentNode } from '../nodes/DeploymentNode';
import type { GraphNodeData } from '../adapter';
import type { Node, NodeProps } from '@xyflow/react';

// ---------------------------------------------------------------------------
// Helper: build minimal NodeProps for a given data object
// ---------------------------------------------------------------------------
function makeProps(data: GraphNodeData): NodeProps<Node<GraphNodeData>> {
  return {
    id: 'test-node',
    type: data.kind,
    data,
    selected: false,
    isConnectable: true,
    zIndex: 1,
    xPos: 0,
    yPos: 0,
    dragging: false,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
    deletable: true,
    selectable: true,
    draggable: true,
  } as NodeProps<Node<GraphNodeData>>;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('IssuerNode', () => {
  const data: GraphNodeData = {
    label: 'GitHub',
    kind: 'issuer',
    meta: { slug: 'github' },
    direction: 'TB',
  };

  it('렌더링 — 에러 없이 표시', () => {
    render(<IssuerNode {...makeProps(data)} />);
    expect(screen.getByText('GitHub')).toBeInTheDocument();
  });

  it('data.label 텍스트 포함', () => {
    render(<IssuerNode {...makeProps(data)} />);
    expect(screen.getByText('GitHub')).toBeVisible();
  });

  it('vault-info 색상 클래스 포함', () => {
    const { container } = render(<IssuerNode {...makeProps(data)} />);
    const card = container.querySelector('.border-vault-info\\/30');
    expect(card).not.toBeNull();
  });

  it('LR 방향에서도 렌더링 성공', () => {
    render(<IssuerNode {...makeProps({ ...data, direction: 'LR' })} />);
    expect(screen.getByText('GitHub')).toBeInTheDocument();
  });

  it('status=dimmed → data-status="dimmed" 속성 포함 + opacity-35 클래스', () => {
    const { container } = render(<IssuerNode {...makeProps({ ...data, status: 'dimmed' })} />);
    const card = container.querySelector('[data-status="dimmed"]');
    expect(card).not.toBeNull();
    expect(card?.className).toContain('opacity-35');
  });

  it('status=primary → data-status="primary" + outline-[3px] 클래스', () => {
    const { container } = render(<IssuerNode {...makeProps({ ...data, status: 'primary' })} />);
    const card = container.querySelector('[data-status="primary"]');
    expect(card).not.toBeNull();
    // tailwind-merge keeps outline-[3px] (width) even when 'outline' standalone is deduplicated
    expect(card?.className).toContain('outline-[3px]');
  });
});

describe('CredentialNode', () => {
  const data: GraphNodeData = {
    label: 'My GitHub Token',
    kind: 'credential',
    meta: { env: 'prod' },
    direction: 'TB',
  };

  it('렌더링 — 에러 없이 표시', () => {
    render(<CredentialNode {...makeProps(data)} />);
    expect(screen.getByText('My GitHub Token')).toBeInTheDocument();
  });

  it('data.label 텍스트 포함', () => {
    render(<CredentialNode {...makeProps(data)} />);
    expect(screen.getByText('My GitHub Token')).toBeVisible();
  });

  it('vault-warning 색상 클래스 포함', () => {
    const { container } = render(<CredentialNode {...makeProps(data)} />);
    const card = container.querySelector('.border-vault-warning\\/30');
    expect(card).not.toBeNull();
  });

  it('LR 방향에서도 렌더링 성공', () => {
    render(<CredentialNode {...makeProps({ ...data, direction: 'LR' })} />);
    expect(screen.getByText('My GitHub Token')).toBeInTheDocument();
  });

  it('status=dimmed → data-status="dimmed" + opacity-35 클래스', () => {
    const { container } = render(<CredentialNode {...makeProps({ ...data, status: 'dimmed' })} />);
    const card = container.querySelector('[data-status="dimmed"]');
    expect(card).not.toBeNull();
    expect(card?.className).toContain('opacity-35');
  });

  it('status=primary → data-status="primary" + outline-[3px] 클래스', () => {
    const { container } = render(<CredentialNode {...makeProps({ ...data, status: 'primary' })} />);
    const card = container.querySelector('[data-status="primary"]');
    expect(card).not.toBeNull();
    expect(card?.className).toContain('outline-[3px]');
  });
});

describe('ProjectNode', () => {
  const data: GraphNodeData = {
    label: 'My App',
    kind: 'project',
    meta: { repo_url: 'https://github.com/me/app' },
    direction: 'TB',
  };

  it('렌더링 — 에러 없이 표시', () => {
    render(<ProjectNode {...makeProps(data)} />);
    expect(screen.getByText('My App')).toBeInTheDocument();
  });

  it('data.label 텍스트 포함', () => {
    render(<ProjectNode {...makeProps(data)} />);
    expect(screen.getByText('My App')).toBeVisible();
  });

  it('vault-success 색상 클래스 포함', () => {
    const { container } = render(<ProjectNode {...makeProps(data)} />);
    const card = container.querySelector('.border-vault-success\\/30');
    expect(card).not.toBeNull();
  });

  it('LR 방향에서도 렌더링 성공', () => {
    render(<ProjectNode {...makeProps({ ...data, direction: 'LR' })} />);
    expect(screen.getByText('My App')).toBeInTheDocument();
  });

  it('status=dimmed → data-status="dimmed" + opacity-35 클래스', () => {
    const { container } = render(<ProjectNode {...makeProps({ ...data, status: 'dimmed' })} />);
    const card = container.querySelector('[data-status="dimmed"]');
    expect(card).not.toBeNull();
    expect(card?.className).toContain('opacity-35');
  });

  it('status=primary → data-status="primary" + outline-[3px] 클래스', () => {
    const { container } = render(<ProjectNode {...makeProps({ ...data, status: 'primary' })} />);
    const card = container.querySelector('[data-status="primary"]');
    expect(card).not.toBeNull();
    expect(card?.className).toContain('outline-[3px]');
  });
});

describe('DeploymentNode', () => {
  const data: GraphNodeData = {
    label: 'prod-server',
    kind: 'deployment',
    meta: { platform: 'vercel' },
    direction: 'TB',
  };

  it('렌더링 — 에러 없이 표시', () => {
    render(<DeploymentNode {...makeProps(data)} />);
    expect(screen.getByText('prod-server')).toBeInTheDocument();
  });

  it('data.label 텍스트 포함', () => {
    render(<DeploymentNode {...makeProps(data)} />);
    expect(screen.getByText('prod-server')).toBeVisible();
  });

  it('muted 색상 클래스 포함 (bg-muted)', () => {
    const { container } = render(<DeploymentNode {...makeProps(data)} />);
    const card = container.querySelector('.bg-muted');
    expect(card).not.toBeNull();
  });

  it('LR 방향에서도 렌더링 성공', () => {
    render(<DeploymentNode {...makeProps({ ...data, direction: 'LR' })} />);
    expect(screen.getByText('prod-server')).toBeInTheDocument();
  });

  it('status=dimmed → data-status="dimmed" + opacity-35 클래스', () => {
    const { container } = render(<DeploymentNode {...makeProps({ ...data, status: 'dimmed' })} />);
    const card = container.querySelector('[data-status="dimmed"]');
    expect(card).not.toBeNull();
    expect(card?.className).toContain('opacity-35');
  });

  it('status=primary → data-status="primary" + outline-[3px] 클래스', () => {
    const { container } = render(<DeploymentNode {...makeProps({ ...data, status: 'primary' })} />);
    const card = container.querySelector('[data-status="primary"]');
    expect(card).not.toBeNull();
    expect(card?.className).toContain('outline-[3px]');
  });
});
