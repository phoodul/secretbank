import { useCallback, useState } from "react";

const STORAGE_KEY = "apivault:graph:nodesDraggable";

function readStorage(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

/**
 * Persists the nodesDraggable preference in localStorage.
 * Default: false (nodes are not draggable) for best 60fps performance.
 */
export function useGraphNodesDraggable(): [boolean, (v: boolean) => void] {
  const [draggable, setDraggableState] = useState<boolean>(readStorage);

  const setDraggable = useCallback((v: boolean) => {
    try {
      localStorage.setItem(STORAGE_KEY, String(v));
    } catch {
      // storage quota or private mode — ignore
    }
    setDraggableState(v);
  }, []);

  return [draggable, setDraggable];
}
