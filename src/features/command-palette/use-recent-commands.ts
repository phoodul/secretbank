import { useCallback, useState } from "react";

const KEY = "apivault:command-palette:recent";
const MAX = 10;

export function useRecentCommands() {
  const [recent, setRecent] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      return [];
    }
  });

  const record = useCallback((id: string) => {
    setRecent((prev) => {
      const next = [id, ...prev.filter((x) => x !== id)].slice(0, MAX);
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        // storage quota exceeded — silently ignore
      }
      return next;
    });
  }, []);

  return { recent, record };
}
