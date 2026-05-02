import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "apivault:graph:nodePositions";

export type NodePosition = { x: number; y: number };
export type NodePositionMap = Record<string, NodePosition>;

function readStorage(): NodePositionMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const out: NodePositionMap = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (
        v &&
        typeof v === "object" &&
        "x" in v &&
        "y" in v &&
        typeof (v as NodePosition).x === "number" &&
        typeof (v as NodePosition).y === "number" &&
        Number.isFinite((v as NodePosition).x) &&
        Number.isFinite((v as NodePosition).y)
      ) {
        out[k] = { x: (v as NodePosition).x, y: (v as NodePosition).y };
      }
    }
    return out;
  } catch {
    return {};
  }
}

function writeStorage(map: NodePositionMap): void {
  try {
    if (Object.keys(map).length === 0) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
    }
  } catch {
    // storage quota or private mode — ignore
  }
}

export interface UseGraphNodePositions {
  /** Current position overrides. Node IDs not in the map use dagre default. */
  positions: NodePositionMap;
  /** Save position for a single node (merged into map). */
  setPosition: (id: string, pos: NodePosition) => void;
  /** Clear all saved positions (returns to dagre auto-layout). */
  clear: () => void;
  /** Drop entries whose id is not in `validIds`. Call when graph data reloads. */
  pruneStale: (validIds: string[]) => void;
}

/**
 * Persists manually-dragged node positions in localStorage so the user's
 * custom arrangement survives page navigation and app restart.
 *
 * Storage key: `apivault:graph:nodePositions`
 * Shape: `{ [nodeId]: { x, y } }`
 *
 * Missing entries fall through to dagre's auto-layout. On every graph data
 * reload, call `pruneStale(currentIds)` to drop entries for deleted nodes.
 */
export function useGraphNodePositions(): UseGraphNodePositions {
  const [positions, setPositionsState] = useState<NodePositionMap>(readStorage);

  // Re-read storage if another tab/window updated it
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY) setPositionsState(readStorage());
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setPosition = useCallback((id: string, pos: NodePosition) => {
    setPositionsState((prev) => {
      const next = { ...prev, [id]: pos };
      writeStorage(next);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    writeStorage({});
    setPositionsState({});
  }, []);

  const pruneStale = useCallback((validIds: string[]) => {
    setPositionsState((prev) => {
      const valid = new Set(validIds);
      let changed = false;
      const next: NodePositionMap = {};
      for (const [k, v] of Object.entries(prev)) {
        if (valid.has(k)) {
          next[k] = v;
        } else {
          changed = true;
        }
      }
      if (!changed) return prev;
      writeStorage(next);
      return next;
    });
  }, []);

  return { positions, setPosition, clear, pruneStale };
}
