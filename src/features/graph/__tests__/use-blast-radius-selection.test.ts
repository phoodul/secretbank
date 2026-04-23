import { renderHook, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mock @tauri-apps/api/core
// ---------------------------------------------------------------------------
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

import { invoke } from '@tauri-apps/api/core';
import { useBlastRadiusSelection } from '../use-blast-radius-selection';
import type { BlastRadius } from '../types';

const mockInvoke = vi.mocked(invoke);

const EMPTY_BR: BlastRadius = { primary: [], secondary: [], tertiary: [] };

const FULL_BR: BlastRadius = {
  primary: [{ kind: 'project', id: 'proj-1' }],
  secondary: [{ kind: 'deployment', id: 'dep-1' }],
  tertiary: [],
};

describe('useBlastRadiusSelection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('초기 상태는 idle', () => {
    const { result } = renderHook(() => useBlastRadiusSelection());
    expect(result.current.state.phase).toBe('idle');
  });

  it('select 호출 시 loading → ok 전환 + statusMap 구성', async () => {
    mockInvoke.mockResolvedValueOnce(FULL_BR);

    const { result } = renderHook(() => useBlastRadiusSelection());

    act(() => {
      result.current.select('cred-1');
    });

    // Loading phase immediately
    expect(result.current.state.phase).toBe('loading');

    // Wait for promise resolution
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.state.phase).toBe('ok');
    if (result.current.state.phase !== 'ok') return;

    const { statusMap } = result.current.state;
    // clicked credential itself is primary
    expect(statusMap['cred-1']).toBe('primary');
    // primary bucket members
    expect(statusMap['proj-1']).toBe('primary');
    // secondary bucket members
    expect(statusMap['dep-1']).toBe('secondary');
  });

  it('clear 호출 시 idle로 리셋', async () => {
    mockInvoke.mockResolvedValueOnce(EMPTY_BR);

    const { result } = renderHook(() => useBlastRadiusSelection());

    await act(async () => {
      result.current.select('cred-1');
      await Promise.resolve();
    });

    expect(result.current.state.phase).toBe('ok');

    act(() => {
      result.current.clear();
    });

    expect(result.current.state.phase).toBe('idle');
  });

  it('rapid re-select — 먼저 온 응답은 무시됨', async () => {
    // First call: slow (resolves after second)
    let resolveFirst!: (v: BlastRadius) => void;
    const firstPromise = new Promise<BlastRadius>((res) => {
      resolveFirst = res;
    });
    // Second call: fast
    mockInvoke
      .mockReturnValueOnce(firstPromise as ReturnType<typeof invoke>)
      .mockResolvedValueOnce({ primary: [], secondary: [], tertiary: [] } as BlastRadius);

    const { result } = renderHook(() => useBlastRadiusSelection());

    act(() => {
      result.current.select('cred-1');
    });

    // Immediately select a different credential — invalidates first request
    act(() => {
      result.current.select('cred-2');
    });

    // Allow second (fast) promise to settle
    await act(async () => {
      await Promise.resolve();
    });

    // Now resolve the slow first request
    await act(async () => {
      resolveFirst({ primary: [{ kind: 'project', id: 'should-not-appear' }], secondary: [], tertiary: [] });
      await Promise.resolve();
    });

    // Final state must reflect the second select (cred-2), not the first
    expect(result.current.state.phase).toBe('ok');
    if (result.current.state.phase !== 'ok') return;
    expect(result.current.state.credentialId).toBe('cred-2');
    expect(result.current.state.statusMap['should-not-appear']).toBeUndefined();
  });

  it('invoke 거부 시 error phase + message 추출', async () => {
    mockInvoke.mockRejectedValueOnce({ message: 'boom' });

    const { result } = renderHook(() => useBlastRadiusSelection());

    await act(async () => {
      result.current.select('cred-1');
      await Promise.resolve();
    });

    expect(result.current.state.phase).toBe('error');
    if (result.current.state.phase !== 'error') return;
    expect(result.current.state.message).toBe('boom');
    expect(result.current.state.credentialId).toBe('cred-1');
  });

  it('invoke 거부 시 string 에러도 처리', async () => {
    mockInvoke.mockRejectedValueOnce('network failure');

    const { result } = renderHook(() => useBlastRadiusSelection());

    await act(async () => {
      result.current.select('cred-x');
      await Promise.resolve();
    });

    expect(result.current.state.phase).toBe('error');
    if (result.current.state.phase !== 'error') return;
    expect(result.current.state.message).toBe('network failure');
  });
});
