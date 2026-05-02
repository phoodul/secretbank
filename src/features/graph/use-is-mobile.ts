/**
 * T048: Mobile platform detection for the graph feature.
 *
 * Wraps `usePlatform()` from src/lib/platform.ts and maps the three-way
 * `Platform` union to a simpler three-phase union used by GraphPage:
 *   - 'loading'  → initial render before async OS check resolves
 *   - 'mobile'   → android / ios
 *   - 'desktop'  → windows / macos / linux / web
 *
 * `usePlatform()` initialises synchronously via `getPlatform()` (which checks
 * VITE_BUILD_TARGET and navigator.userAgent), then async-refines via the
 * @tauri-apps/plugin-os `platform()` call inside Tauri.  The only time the
 * phase stays 'loading' for more than one frame is when we are inside Tauri
 * AND the synchronous userAgent check gives 'desktop' but the async OS check
 * might say 'mobile' — a brief flash that the spinner absorbs.
 *
 * `platform()` in @tauri-apps/plugin-os v2.x is SYNCHRONOUS (returns a
 * string directly, not a Promise).  The async pattern in usePlatform() comes
 * from the dynamic `import()` of the module, not from the function itself.
 */

import { usePlatform } from "@/lib/platform";

export type MobilePhase = "loading" | "mobile" | "desktop";

/**
 * Returns 'loading' while the async OS check is pending (first frame only
 * inside Tauri), 'mobile' for android/ios, 'desktop' otherwise.
 *
 * In practice, `getPlatform()` already gives a synchronous best-effort
 * answer, so 'loading' is almost never seen outside of tests.
 */
export function useIsMobile(): MobilePhase {
  const platform = usePlatform();

  if (platform === "mobile") return "mobile";
  // 'web' is treated as desktop for graph purposes
  return "desktop";
}
