import { useCallback, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

import type { BlastRadius } from './types';
import type { NodeSelectionStatus } from './adapter';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Map from node ID → selection status when a blast-radius is active. */
export type StatusMap = Record<string, NodeSelectionStatus>;

type IdleState = { phase: 'idle' };
type LoadingState = { phase: 'loading'; credentialId: string };
type OkState = { phase: 'ok'; credentialId: string; statusMap: StatusMap };
type ErrorState = { phase: 'error'; credentialId: string; message: string };

export type BlastRadiusState = IdleState | LoadingState | OkState | ErrorState;

export interface UseBlastRadiusSelection {
  state: BlastRadiusState;
  select: (credentialId: string) => void;
  clear: () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Manages blast-radius selection state for the dependency graph.
 *
 * - `select(id)` invokes `blast_radius_for_credential` and builds a StatusMap
 *   covering primary / secondary / tertiary nodes plus the clicked credential
 *   itself (always primary).
 * - Stale in-flight requests are discarded via an incrementing request counter.
 * - `clear()` resets to idle and cancels any in-flight request.
 */
export function useBlastRadiusSelection(): UseBlastRadiusSelection {
  const [state, setState] = useState<BlastRadiusState>({ phase: 'idle' });
  const reqIdRef = useRef(0);
  // Tracks whether a selection is active so clear() can skip setState when
  // already idle — preventing unnecessary re-renders from stable hooks like
  // useEffect that call clear() on every execution.
  const isActiveRef = useRef(false);

  const select = useCallback((credentialId: string) => {
    const rid = ++reqIdRef.current;
    isActiveRef.current = true;
    setState({ phase: 'loading', credentialId });

    invoke<BlastRadius>('blast_radius_for_credential', { id: credentialId })
      .then((br) => {
        if (rid !== reqIdRef.current) return; // stale — discard

        const statusMap: StatusMap = {};
        // The clicked credential itself is always primary
        statusMap[credentialId] = 'primary';
        br.primary.forEach((n) => {
          statusMap[n.id] = 'primary';
        });
        br.secondary.forEach((n) => {
          statusMap[n.id] = 'secondary';
        });
        br.tertiary.forEach((n) => {
          statusMap[n.id] = 'tertiary';
        });

        setState({ phase: 'ok', credentialId, statusMap });
      })
      .catch((err: unknown) => {
        if (rid !== reqIdRef.current) return; // stale — discard

        const message =
          typeof err === 'object' && err !== null && 'message' in err
            ? String((err as { message: unknown }).message)
            : typeof err === 'string'
              ? err
              : 'Failed to compute blast radius';

        setState({ phase: 'error', credentialId, message });
      });
  }, []);

  const clear = useCallback(() => {
    reqIdRef.current++; // invalidate any in-flight request
    // Skip setState if already idle to avoid unnecessary re-renders
    if (!isActiveRef.current) return;
    isActiveRef.current = false;
    setState({ phase: 'idle' });
  }, []);

  return { state, select, clear };
}
