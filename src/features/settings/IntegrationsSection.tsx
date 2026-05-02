import { invoke } from "@tauri-apps/api/core";
import { Eye, EyeOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type VaultStateTag = "uninitialized" | "locked" | "unlocked";

interface VaultStatusResponse {
  state: VaultStateTag;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function openExternal(url: string): void {
  import("@tauri-apps/plugin-shell")
    .then(({ open }) => open(url))
    .catch(() => {
      window.open(url, "_blank", "noopener,noreferrer");
    });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function IntegrationsSection() {
  const { t } = useTranslation();

  const [vaultState, setVaultState] = useState<VaultStateTag>("locked");
  const [existingKey, setExistingKey] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [showValue, setShowValue] = useState(false);
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);

  const mountedRef = useRef(true);
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Load vault status + existing key on mount
  useEffect(() => {
    let cancelled = false;

    invoke<VaultStatusResponse>("vault_status")
      .then((status) => {
        if (cancelled) return;
        setVaultState(status.state);

        if (status.state === "unlocked") {
          invoke<string | null>("vault_setting_get", { key: "nvd_api_key" })
            .then((key) => {
              if (cancelled) return;
              setExistingKey(key);
            })
            .catch(() => {
              // key lookup failure is non-fatal
            });
        }
      })
      .catch(() => {
        // vault_status failure is non-fatal; stay in default locked state
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSave() {
    if (!inputValue.trim()) return;
    setSaving(true);
    try {
      await invoke("vault_setting_set", {
        key: "nvd_api_key",
        value: inputValue.trim(),
      });
      if (!mountedRef.current) return;
      setExistingKey(inputValue.trim());
      setInputValue("");
      setShowValue(false);
      toast.success(t("settings.keySaved"));
    } catch {
      toast.error(t("settings.saveKeyFailed"));
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  }

  async function handleClear() {
    setClearing(true);
    try {
      await invoke("vault_setting_set", {
        key: "nvd_api_key",
        value: null,
      });
      if (!mountedRef.current) return;
      setExistingKey(null);
      setInputValue("");
      setShowValue(false);
      toast.success(t("settings.keyCleared"));
    } catch {
      toast.error(t("settings.saveKeyFailed"));
    } finally {
      if (mountedRef.current) setClearing(false);
    }
  }

  const isLocked = vaultState !== "unlocked";
  const hasExistingKey = existingKey !== null;
  // Show placeholder text when a key is configured and user hasn't typed anything
  const inputPlaceholder =
    hasExistingKey && !inputValue
      ? t("settings.keyConfiguredPlaceholder")
      : t("settings.nvdApiKeyPlaceholder");

  const saveDisabled = isLocked || (!inputValue.trim() && !hasExistingKey) || saving;
  const clearDisabled = isLocked || !hasExistingKey || clearing;

  return (
    <section aria-labelledby="integrations-heading" className="space-y-6">
      <h2 id="integrations-heading" className="text-base font-medium">
        {t("settings.integrations")}
      </h2>
      <p className="text-muted-foreground text-xs">{t("settings.integrationsDescription")}</p>

      {/* Vault locked warning */}
      {isLocked && (
        <div
          role="alert"
          className="rounded-md border border-yellow-200 bg-yellow-50 px-3 py-2 text-sm text-yellow-800 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-300"
        >
          {t("settings.vaultLockedWarning")}
        </div>
      )}

      {/* NVD API Key */}
      <div className="space-y-2">
        <p className="text-sm font-medium">{t("settings.nvdApiKey")}</p>
        <p className="text-muted-foreground text-xs">{t("settings.nvdApiKeyDescription")}</p>

        {/* Input row */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Input
              aria-label={t("settings.nvdApiKey")}
              type={showValue ? "text" : "password"}
              value={inputValue}
              placeholder={inputPlaceholder}
              disabled={isLocked}
              onChange={(e) => setInputValue(e.target.value)}
              className="pr-10"
            />
            <button
              type="button"
              aria-label={showValue ? t("settings.hideKey") : t("settings.showKey")}
              disabled={isLocked}
              onClick={() => setShowValue((v) => !v)}
              className="absolute inset-y-0 right-2 flex items-center text-muted-foreground hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
            >
              {showValue ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>

          <Button size="sm" disabled={saveDisabled} onClick={() => void handleSave()}>
            {t("settings.saveKey")}
          </Button>

          <Button
            size="sm"
            variant="outline"
            disabled={clearDisabled}
            onClick={() => void handleClear()}
          >
            {t("settings.clearKey")}
          </Button>
        </div>

        {/* Link to request NVD key */}
        <button
          type="button"
          className="text-primary text-xs underline-offset-4 hover:underline"
          onClick={() => openExternal("https://nvd.nist.gov/developers/request-an-api-key")}
        >
          {t("settings.nvdApiKeyRequestLink")}
        </button>
      </div>
    </section>
  );
}
