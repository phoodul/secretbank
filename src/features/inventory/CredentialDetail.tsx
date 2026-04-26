/**
 * CredentialDetail — 우측 Sheet Drawer (T027)
 *
 * Props:
 *   open         - Sheet 열림 여부 (selectedId !== null)
 *   credentialId - 조회할 credential ULID (open === true 일 때 항상 존재)
 *   onClose      - Sheet 닫기 콜백
 *   onDeleted    - 삭제 성공 시 목록 refresh 트리거 콜백
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { AlertCircle, RefreshCw } from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

import { UsageSection } from "./UsageSection";
import { IncidentsForCredential } from "@/features/incidents/IncidentsForCredential";
import { AuditForCredential } from "@/features/audit/AuditForCredential";
import { KillSwitchDialog } from "@/features/kill-switch/KillSwitchDialog";
import type { CredentialFull } from "./types";

// ---------------------------------------------------------------------------
// Fetch state
// ---------------------------------------------------------------------------

type DetailFetchState =
  | { phase: "loading" }
  | { phase: "ok"; data: CredentialFull }
  | { phase: "error"; message: string };

// ---------------------------------------------------------------------------
// Clipboard countdown event payload
// ---------------------------------------------------------------------------

interface CountdownPayload {
  remaining: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(ms: number): string {
  return new Date(ms).toLocaleString();
}

function formatRelative(ms: number): string {
  const diff = ms - Date.now();
  const absDiff = Math.abs(diff);
  const days = Math.floor(absDiff / (1000 * 60 * 60 * 24));
  if (diff < 0) return `${days}d ago`;
  return `in ${days}d`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface MetaRowProps {
  label: string;
  value: React.ReactNode;
}

function MetaRow({ label, value }: MetaRowProps) {
  return (
    <div className="grid grid-cols-2 gap-2 py-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs text-right">{value}</span>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-4 p-4">
      {/* header skeleton */}
      <div className="flex flex-col gap-2">
        <Skeleton className="h-6 w-48" />
        <div className="flex gap-1.5">
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-5 w-12" />
          <Skeleton className="h-5 w-14" />
        </div>
      </div>
      {/* actions skeleton */}
      <div className="flex gap-2">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-8 w-20" />
      </div>
      {/* metadata skeleton */}
      <div className="flex flex-col gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-7 w-full" />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export interface CredentialDetailProps {
  open: boolean;
  credentialId: string | null;
  onClose: () => void;
  onDeleted: () => void;
}

export function CredentialDetail({
  open,
  credentialId,
  onClose,
  onDeleted,
}: CredentialDetailProps) {
  const { t } = useTranslation("common");

  // effect 내 동기 setState 금지 규칙(react-hooks/set-state-in-effect)을 준수하기 위해
  // loading 여부는 별도 state가 아닌 파생값으로 계산한다.
  // fetchState는 비동기 콜백에서만 업데이트된다.
  type SettledState = { phase: "ok"; data: CredentialFull } | { phase: "error"; message: string };

  const [settledState, setSettledState] = useState<SettledState | null>(null);
  // retryCount: Retry 버튼으로 재조회를 트리거하는 카운터.
  // open/credentialId 변화 시에는 effect dependency 자체로 재실행 트리거.
  const [retryCount, setRetryCount] = useState(0);

  // resolvedKey: 가장 최근에 완료된 fetch의 (credentialId, retryCount) 키
  const [resolvedKey, setResolvedKey] = useState<string | null>(null);
  const currentKey = open && credentialId ? `${credentialId}:${retryCount}` : null;

  const fetchState: DetailFetchState =
    currentKey === null
      ? { phase: "loading" }
      : currentKey !== resolvedKey
        ? { phase: "loading" }
        : settledState !== null
          ? settledState
          : { phase: "loading" };

  const [remaining, setRemaining] = useState(0);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [killSwitchOpen, setKillSwitchOpen] = useState(false);

  // unlisten ref — Drawer 닫힐 때 정리
  const unlistenRef = useRef<UnlistenFn | null>(null);

  // ------------------------------------------------------------------
  // 클립보드 countdown 이벤트 구독 (Drawer 생존 동안 유지)
  // ------------------------------------------------------------------

  useEffect(() => {
    if (!open) return;

    let alive = true;

    listen<CountdownPayload>("clipboard:countdown", (e) => {
      if (!alive) return;
      setRemaining(e.payload.remaining);
    }).then((fn) => {
      if (!alive) {
        fn();
        return;
      }
      unlistenRef.current = fn;
    });

    return () => {
      alive = false;
      if (unlistenRef.current) {
        unlistenRef.current();
        unlistenRef.current = null;
      }
    };
  }, [open]);

  // ------------------------------------------------------------------
  // credential_get fetch
  //
  // loading 상태는 `currentKey !== resolvedKey`로 파생.
  // effect 내에서는 비동기 .then/.catch 콜백에서만 setState 호출.
  // ------------------------------------------------------------------

  // Retry 버튼 — retryCount 올리면 currentKey가 바뀌어 로딩 파생 + effect 재실행
  const fetchDetail = useCallback(() => {
    setRetryCount((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!open || !credentialId) return;
    const key = `${credentialId}:${retryCount}`;
    let cancelled = false;
    invoke<CredentialFull>("credential_get", { id: credentialId })
      .then((data) => {
        if (!cancelled) {
          setSettledState({ phase: "ok", data });
          setResolvedKey(key);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const message = typeof err === "string" ? err : t("inventory.loadDetailFailed");
          setSettledState({ phase: "error", message });
          setResolvedKey(key);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, credentialId, retryCount, t]);

  // ------------------------------------------------------------------
  // Copy value
  // ------------------------------------------------------------------

  const handleCopy = useCallback(async () => {
    if (!credentialId) return;
    try {
      await invoke("credential_copy_to_clipboard", { id: credentialId });
    } catch (err: unknown) {
      const code =
        err !== null && typeof err === "object" && "code" in err
          ? (err as { code: string }).code
          : null;
      if (code === "not_unlocked") {
        toast.error(t("inventory.vaultLocked"));
      } else if (code === "not_found") {
        toast.error(t("inventory.loadDetailFailed"));
        onClose();
        onDeleted();
      } else {
        toast.error(t("inventory.copyFailed"));
      }
    }
  }, [credentialId, t, onClose, onDeleted]);

  // ------------------------------------------------------------------
  // Delete
  // ------------------------------------------------------------------

  const handleDelete = useCallback(async () => {
    if (!credentialId) return;
    setIsDeleting(true);
    try {
      await invoke("credential_delete", { id: credentialId });
      toast.success(t("inventory.credentialDeleted"));
      setDeleteDialogOpen(false);
      onDeleted();
      onClose();
    } catch {
      toast.error(t("inventory.deleteFailed"));
    } finally {
      setIsDeleting(false);
    }
  }, [credentialId, t, onDeleted, onClose]);

  // ------------------------------------------------------------------
  // Sheet open-change (X 버튼 / ESC)
  // ------------------------------------------------------------------

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setDeleteDialogOpen(false);
      setKillSwitchOpen(false);
      setRemaining(0);
      onClose();
    }
  };

  const handleRevokeRequested = useCallback(() => {
    setKillSwitchOpen(true);
  }, []);

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  const cred = fetchState.phase === "ok" ? fetchState.data : null;

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col sm:max-w-md overflow-y-auto">
        <SheetHeader className="pb-0">
          <SheetTitle>{t("inventory.detailTitle")}</SheetTitle>
          <SheetDescription className="sr-only">{t("inventory.detailTitle")}</SheetDescription>
        </SheetHeader>

        {/* ---- loading ---- */}
        {fetchState.phase === "loading" && <DetailSkeleton />}

        {/* ---- error ---- */}
        {fetchState.phase === "error" && (
          <div className="flex flex-col items-center gap-3 p-6 text-center">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <p className="text-sm text-muted-foreground">{fetchState.message}</p>
            <Button variant="outline" size="sm" onClick={fetchDetail}>
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              {t("inventory.retry")}
            </Button>
          </div>
        )}

        {/* ---- ok ---- */}
        {fetchState.phase === "ok" && cred !== null && (
          <div className="flex flex-col gap-5 p-4">
            {/* === 1. Header === */}
            <div className="flex flex-col gap-2">
              <h2 className="text-lg font-semibold leading-tight">{cred.name}</h2>
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="secondary" className="text-xs font-mono">
                  {cred.issuer_id.slice(0, 8)}
                </Badge>
                <Badge variant="outline" className="text-xs">
                  {t(envLabelKey(cred.env))}
                </Badge>
                <Badge variant={statusBadgeVariant(cred.status)} className="text-xs">
                  {t(statusLabelKey(cred.status))}
                </Badge>
              </div>
            </div>

            {/* === 2. Primary actions === */}
            <TooltipProvider>
              <div className="flex gap-2">
                {/* Copy value */}
                <Button size="sm" onClick={handleCopy}>
                  {t("inventory.copyValue")}
                </Button>

                {/* Rotate — disabled placeholder */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span tabIndex={0} className="inline-flex">
                      <Button size="sm" variant="outline" disabled>
                        {t("inventory.rotate")}
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>{t("inventory.m7ComingSoon")}</TooltipContent>
                </Tooltip>

                {/* Revoke — outline-styled destructive so the action reads
                    as dangerous (red border + text) without competing with
                    the filled red CTA in the INCIDENTS section below.  Both
                    entries dispatch the same handler — top button is the
                    always-available intent; the INCIDENTS one fires when an
                    active incident makes revocation urgent. */}
                {cred?.status === "revoked" ? (
                  <Button size="sm" variant="outline" disabled>
                    {t("killSwitch.revoked")}
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-destructive text-destructive hover:bg-destructive/10 hover:text-destructive focus-visible:ring-destructive/40"
                    data-testid="credential-detail-revoke-btn"
                    onClick={handleRevokeRequested}
                  >
                    {t("killSwitch.revoke")}
                  </Button>
                )}
              </div>
            </TooltipProvider>

            {/* === 3. Copy progress === */}
            {remaining > 0 && (
              <div className="flex flex-col gap-1.5">
                <Progress
                  value={(remaining / 30) * 100}
                  aria-label={t("inventory.clipboardClearingIn", { seconds: remaining })}
                />
                <p className="text-xs text-muted-foreground">
                  {t("inventory.clipboardClearingIn", { seconds: remaining })}
                </p>
              </div>
            )}

            {/* === 4. Metadata section === */}
            <section>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("inventory.sectionMetadata")}
              </h3>
              <div className="divide-y divide-border rounded-md border px-3">
                <MetaRow
                  label={t("inventory.valueHint")}
                  value={
                    cred.hash_hint ? <span className="font-mono">••••{cred.hash_hint}</span> : "—"
                  }
                />
                <MetaRow label={t("inventory.labelScope")} value={cred.scope ?? "—"} />
                <MetaRow label={t("inventory.labelCreated")} value={formatDate(cred.created_at)} />
                <MetaRow
                  label={t("inventory.labelLastRotated")}
                  value={
                    cred.last_rotated_at !== null
                      ? formatDate(cred.last_rotated_at)
                      : t("inventory.never")
                  }
                />
                <MetaRow
                  label={t("inventory.labelExpires")}
                  value={
                    cred.expires_at !== null ? (
                      <span>
                        {formatDate(cred.expires_at)}{" "}
                        <span className="text-muted-foreground">
                          ({formatRelative(cred.expires_at)})
                        </span>
                      </span>
                    ) : (
                      t("inventory.never")
                    )
                  }
                />
                <MetaRow
                  label={t("inventory.labelRotationPolicy")}
                  value={
                    cred.rotation_policy_days !== null
                      ? t("inventory.rotationEveryNDays", {
                          count: cred.rotation_policy_days,
                        })
                      : "—"
                  }
                />
                <MetaRow
                  label={t("inventory.labelVaultRef")}
                  value={<span className="font-mono text-xs break-all">{cred.vault_ref}</span>}
                />
              </div>
            </section>

            {/* === 5. Usages section === */}
            <UsageSection
              credentialId={cred.id}
              usages={cred.usages}
              onChanged={fetchDetail}
            />

            {/* === 5b. Incidents section === */}
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("inventory.sectionIncidents")}
              </h3>
              <IncidentsForCredential
                credentialId={cred.id}
                onRevokeRequested={cred.status !== "revoked" ? handleRevokeRequested : undefined}
              />
            </section>

            {/* === 6. Audit section === */}
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("inventory.sectionAudit")}
              </h3>
              <AuditForCredential credentialId={cred.id} />
            </section>

            {/* === 7. Footer — Delete === */}
            <div className="mt-auto pt-4 border-t border-border">
              <Button
                variant="destructive"
                size="sm"
                className="w-full"
                onClick={() => setDeleteDialogOpen(true)}
              >
                {t("inventory.deleteTitle")}
              </Button>
            </div>
          </div>
        )}
      </SheetContent>

      {/* Kill Switch Dialog */}
      <KillSwitchDialog
        open={killSwitchOpen}
        onOpenChange={setKillSwitchOpen}
        credentialId={credentialId}
        credentialName={cred?.name ?? ""}
        onRevoked={() => {
          onDeleted();
        }}
      />

      {/* Delete confirmation AlertDialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("inventory.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("inventory.deleteDescription", {
                name: cred?.name ?? "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={(e) => {
                e.preventDefault();
                void handleDelete();
              }}
              disabled={isDeleting}
            >
              {t("inventory.deleteConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Badge helpers
// ---------------------------------------------------------------------------

function statusBadgeVariant(
  status: CredentialFull["status"],
): "destructive" | "danger" | "success" {
  if (status === "revoked") return "destructive";
  if (status === "compromised") return "danger";
  return "success";
}

function statusLabelKey(status: CredentialFull["status"]): string {
  if (status === "revoked") return "inventory.statusRevoked";
  if (status === "compromised") return "inventory.statusCompromised";
  return "inventory.statusActive";
}

function envLabelKey(env: CredentialFull["env"]): string {
  if (env === "dev") return "inventory.envDev";
  if (env === "staging") return "inventory.envStaging";
  return "inventory.envProd";
}
