export type Platform = "desktop" | "mobile" | "web";

/**
 * Synchronous best-effort platform detection.
 * - VITE_BUILD_TARGET=web  → "web"
 * - VITE_BUILD_TARGET=mobile → "mobile"
 * - window.__TAURI_INTERNALS__ present + mobile userAgent → "mobile"
 * - window.__TAURI_INTERNALS__ present otherwise → "desktop"
 * - default → "desktop"
 */
export function getPlatform(): Platform {
  if (import.meta.env.VITE_BUILD_TARGET === "web") return "web";
  if (import.meta.env.VITE_BUILD_TARGET === "mobile") return "mobile";

  const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

  if (!isTauri) {
    // Browser fallback: check userAgent for mobile
    if (typeof navigator !== "undefined" && /android|iphone|ipad|ipod/i.test(navigator.userAgent)) {
      return "mobile";
    }
    return "desktop";
  }

  // Inside Tauri: use userAgent as a quick hint until async OS check resolves
  if (typeof navigator !== "undefined" && /android|iphone|ipad|ipod/i.test(navigator.userAgent)) {
    return "mobile";
  }
  return "desktop";
}

import { useEffect, useState } from "react";

/**
 * React hook that refines platform detection asynchronously via
 * @tauri-apps/plugin-os when running inside Tauri.
 */
export function usePlatform(): Platform {
  const [platform, setPlatform] = useState<Platform>(getPlatform);

  useEffect(() => {
    const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
    if (!isTauri) return;

    import("@tauri-apps/plugin-os")
      .then(({ platform: osPlatform }) => osPlatform())
      .then((os) => {
        if (os === "ios" || os === "android") {
          setPlatform("mobile");
        } else {
          setPlatform("desktop");
        }
      })
      .catch(() => {
        // plugin-os unavailable; keep best-effort value
      });
  }, []);

  return platform;
}
