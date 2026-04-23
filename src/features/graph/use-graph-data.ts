import { useCallback, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { GraphPayload } from './types';

type FetchState =
  | { phase: 'loading' }
  | { phase: 'ok'; data: GraphPayload }
  | { phase: 'error'; message: string };

export function useGraphData(): { state: FetchState; refresh: () => void } {
  const [state, setState] = useState<FetchState>({ phase: 'loading' });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;

    invoke<GraphPayload>('graph_fetch')
      .then((data) => {
        if (!cancelled) setState({ phase: 'ok', data });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const message =
            typeof err === 'object' && err !== null && 'message' in err
              ? String((err as { message: unknown }).message)
              : typeof err === 'string'
                ? err
                : 'Failed to load graph';
          setState({ phase: 'error', message });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [tick]);

  const refresh = useCallback(() => {
    setState({ phase: 'loading' });
    setTick((n) => n + 1);
  }, []);

  return { state, refresh };
}
