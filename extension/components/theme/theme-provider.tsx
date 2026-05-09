/**
 * @file theme-provider.tsx
 * @license AGPL-3.0-or-later
 *
 * Extension 전용 ThemeProvider + useTheme hook.
 *
 * 데스크톱 앱(src/components/theme/theme-provider.tsx)과 격리된 독립 구현.
 * 데스크톱 코드를 import 하지 않는다.
 *
 * 차이점:
 *   - localStorage 대신 chrome.storage.local 로 persistence
 *   - chrome.storage API 가 없는 Vitest 환경에서는 localStorage fallback
 */

import * as React from "react";

// 지원하는 테마 타입
type Theme = "dark" | "light" | "system";

// ThemeProvider props 타입
interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
}

// Context state 타입
interface ThemeProviderState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

// 기본 초기 상태
const initialState: ThemeProviderState = {
  theme: "system",
  setTheme: () => null,
};

const ThemeProviderContext = React.createContext<ThemeProviderState>(initialState);

/**
 * chrome.storage.local 에서 테마 값을 읽는다.
 * chrome API 가 없는 환경(Vitest, 개발 환경)에서는 localStorage fallback.
 */
async function readStoredTheme(storageKey: string): Promise<Theme | null> {
  try {
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      const result = await chrome.storage.local.get(storageKey);
      return (result[storageKey] as Theme) ?? null;
    }
  } catch {
    // chrome API 접근 실패 → localStorage fallback
  }
  return (localStorage.getItem(storageKey) as Theme) ?? null;
}

/**
 * 테마 값을 chrome.storage.local 에 저장한다.
 * chrome API 가 없는 환경에서는 localStorage fallback.
 */
async function writeStoredTheme(storageKey: string, theme: Theme): Promise<void> {
  try {
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      await chrome.storage.local.set({ [storageKey]: theme });
      return;
    }
  } catch {
    // chrome API 접근 실패 → localStorage fallback
  }
  localStorage.setItem(storageKey, theme);
}

/**
 * document.documentElement 에 light/dark 클래스를 적용한다.
 * prefers-reduced-motion 을 존중하기 위해 transition 은 globals.css 의
 * @media (prefers-reduced-motion: reduce) 블록이 제어한다.
 */
function applyTheme(theme: Theme): void {
  const root = window.document.documentElement;
  root.classList.remove("light", "dark");

  if (theme === "system") {
    const systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
    root.classList.add(systemTheme);
    return;
  }
  root.classList.add(theme);
}

export function ThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = "secretbank-extension-theme",
  ...props
}: ThemeProviderProps) {
  // 초기값: localStorage 에서 동기적으로 읽음 (chrome.storage 는 비동기라 초기 렌더에서 제한)
  const [theme, setThemeState] = React.useState<Theme>(() => {
    try {
      return (localStorage.getItem(storageKey) as Theme) || defaultTheme;
    } catch {
      return defaultTheme;
    }
  });

  // 초기 마운트 시 chrome.storage에서 비동기 로드 (있으면 동기 localStorage 값을 덮어씀)
  React.useEffect(() => {
    let cancelled = false;
    readStoredTheme(storageKey)
      .then((stored) => {
        if (!cancelled && stored) {
          setThemeState(stored);
        }
      })
      .catch(() => {
        // 무시 — 기본값 유지
      });
    return () => {
      cancelled = true;
    };
  }, [storageKey]);

  // 테마 변경 시 DOM 클래스 적용
  React.useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // system 모드일 때 OS 테마 변경 감지
  React.useEffect(() => {
    if (theme !== "system") return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      const root = window.document.documentElement;
      root.classList.remove("light", "dark");
      root.classList.add(mql.matches ? "dark" : "light");
    };
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [theme]);

  const value = React.useMemo<ThemeProviderState>(
    () => ({
      theme,
      setTheme: (next: Theme) => {
        // 비동기 저장 (fire-and-forget)
        writeStoredTheme(storageKey, next).catch(() => {
          // 저장 실패 시 UI 상태는 유지 (UX 우선)
        });
        setThemeState(next);
      },
    }),
    [theme, storageKey],
  );

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

/**
 * 현재 테마 + setTheme 을 반환하는 hook.
 * ThemeProvider 바깥에서 호출 시 에러를 던진다.
 */
export function useTheme(): ThemeProviderState {
  const context = React.useContext(ThemeProviderContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
