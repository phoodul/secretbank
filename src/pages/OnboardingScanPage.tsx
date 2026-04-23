import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { Loader2 } from "lucide-react";

import { useInventory } from "@/features/inventory/use-inventory";
import { DetectedKeysReview } from "@/features/onboarding/DetectedKeysReview";
import type { DetectedKey, ScanProgress } from "@/features/onboarding/types";

type ScanState =
  | { phase: "idle" }
  | { phase: "scanning"; currentPath: string }
  | { phase: "done"; results: DetectedKey[] }
  | { phase: "error"; message: string };

export function OnboardingScanPage() {
  const [searchParams] = useSearchParams();
  const { t } = useTranslation("common");
  const path = searchParams.get("path");
  const { items: existingCredentials } = useInventory();

  const [scanState, setScanState] = useState<ScanState>({ phase: "idle" });

  useEffect(() => {
    if (!path) return;

    let cancelled = false;
    let unlisten: UnlistenFn | undefined;

    (async () => {
      try {
        unlisten = await listen<ScanProgress>("scan:progress", (event) => {
          const p = event.payload;
          if (p.phase === "started" && !cancelled) {
            setScanState({ phase: "scanning", currentPath: p.path });
          }
        });

        setScanState({ phase: "scanning", currentPath: path });
        const results = await invoke<DetectedKey[]>("env_scan_folder", { path });
        if (!cancelled) {
          setScanState({ phase: "done", results });
        }
      } catch (err) {
        if (!cancelled) {
          const message = typeof err === "string" ? err : "Scan failed";
          setScanState({ phase: "error", message });
        }
      }
    })();

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [path]);

  if (!path) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-muted-foreground">{t("onboarding.scanMissingPath")}</p>
      </div>
    );
  }

  if (scanState.phase === "scanning" || scanState.phase === "idle") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
        <Loader2 className="size-8 animate-spin text-primary" aria-hidden="true" />
        <p className="text-lg font-medium">{t("onboarding.scanning", { path })}</p>
      </div>
    );
  }

  if (scanState.phase === "error") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-lg font-medium">{t("onboarding.scanError")}</p>
        <p className="max-w-md text-sm text-muted-foreground">{scanState.message}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
      <DetectedKeysReview
        detected={scanState.results}
        scannedPath={path}
        existingCredentials={existingCredentials}
      />
    </div>
  );
}
