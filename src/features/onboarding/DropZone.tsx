import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { FolderDown } from "lucide-react";

import { usePlatform } from "@/lib/platform";

export function DropZone() {
  const platform = usePlatform();
  const navigate = useNavigate();
  const { t } = useTranslation("common");
  const [isDragging, setIsDragging] = useState(false);

  // Tauri native drag-drop subscription
  useEffect(() => {
    if (platform !== "desktop") return;

    let unlisten: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      try {
        const { getCurrentWebview } = await import("@tauri-apps/api/webview");
        const webview = getCurrentWebview();
        unlisten = await webview.onDragDropEvent((event) => {
          const p = event.payload;
          if (p.type === "enter") {
            setIsDragging(true);
          } else if (p.type === "leave") {
            setIsDragging(false);
          } else if (p.type === "drop") {
            setIsDragging(false);
            if (p.paths.length > 0) {
              const path = p.paths[0];
              toast.info(t("onboarding.scanning", { path }));
              navigate(`/onboarding/scan?path=${encodeURIComponent(path)}`);
            }
          }
        });
      } catch (err) {
        console.warn("drag-drop subscription failed", err);
      }
      if (cancelled) unlisten?.();
    })();

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [platform, navigate, t]);

  // Web DnD preventDefault — block default browser "open file" behavior
  useEffect(() => {
    if (platform !== "desktop") return;

    const prevent = (e: DragEvent) => e.preventDefault();
    window.addEventListener("dragenter", prevent);
    window.addEventListener("dragover", prevent);
    window.addEventListener("drop", prevent);

    return () => {
      window.removeEventListener("dragenter", prevent);
      window.removeEventListener("dragover", prevent);
      window.removeEventListener("drop", prevent);
    };
  }, [platform]);

  if (platform !== "desktop") return null;

  if (!isDragging) return null;

  return (
    <div
      role="dialog"
      aria-label={t("onboarding.dropToScan")}
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm pointer-events-none animate-in fade-in"
    >
      <div className="rounded-2xl border-2 border-dashed border-primary bg-card p-12 text-center">
        <FolderDown className="mx-auto h-16 w-16 text-primary" aria-hidden="true" />
        <p className="mt-4 text-lg font-medium">{t("onboarding.dropToScan")}</p>
        <p className="mt-2 text-sm text-muted-foreground">{t("onboarding.dropHint")}</p>
      </div>
    </div>
  );
}
