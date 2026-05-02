/**
 * CloudSyncSection — Settings 페이지에 표시되는 sign-in 진입점.
 *
 * - 비로그인: "Sign in" 버튼이 `/auth/sign-in` 으로 이동.
 * - 로그인: 현재 user_id (잘림 표시) + "Sign out" 버튼.
 *
 * 실제 동기화(M9 Sync) UI 는 향후 별도 SyncStatusSection 으로 분리한다.
 */

import { Cloud, LogOut, MonitorSmartphone } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PairInitiatorDialog } from "@/features/sync/PairInitiatorDialog";

import { useAuthSession } from "./use-auth-session";

export function CloudSyncSection() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { session, loading, signOut } = useAuthSession();
  const [pairOpen, setPairOpen] = useState(false);

  async function handleSignOut() {
    try {
      await signOut();
      toast.success(t("auth.signOutSuccess"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <section aria-labelledby="cloud-sync-heading" className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="space-y-1">
          <h2 id="cloud-sync-heading" className="text-base font-medium">
            {t("auth.cloudSync.heading")}
          </h2>
          <p className="text-muted-foreground text-xs">{t("auth.cloudSync.description")}</p>
        </div>
        <Badge variant={session ? "default" : "outline"} className="shrink-0">
          {session ? t("auth.cloudSync.connected") : t("auth.cloudSync.notConnected")}
        </Badge>
      </div>

      {loading ? (
        <p className="text-muted-foreground text-sm">{t("common.loading")}</p>
      ) : session ? (
        <div className="rounded-md border p-3 space-y-2 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground font-mono text-xs">
              {t("auth.cloudSync.userId", {
                id:
                  session.user_id.length > 12
                    ? `${session.user_id.slice(0, 12)}…`
                    : session.user_id,
              })}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setPairOpen(true)}
              >
                <MonitorSmartphone className="h-3.5 w-3.5 mr-1" />
                {t("auth.cloudSync.addDevice")}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                onClick={() => void handleSignOut()}
              >
                <LogOut className="h-3.5 w-3.5 mr-1" />
                {t("auth.cloudSync.signOut")}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <Button variant="outline" size="sm" onClick={() => navigate("/auth/sign-in")}>
          <Cloud className="h-4 w-4 mr-2" />
          {t("auth.cloudSync.signIn")}
        </Button>
      )}

      <PairInitiatorDialog open={pairOpen} onOpenChange={setPairOpen} />
    </section>
  );
}
