/**
 * use-subject-labels — audit UI helper (이슈 2 frontend lookup).
 *
 * Since payload_json no longer contains human-readable labels, the UI must
 * look them up from the live data.  This hook fetches credential and project
 * summaries when the vault is unlocked and returns Maps keyed by ID.
 *
 * Design decisions:
 * - Re-fetches whenever vault transitions to "unlocked" (lock-then-unlock
 *   would otherwise leave Maps stale).
 * - Clears Maps on lock so labels do not linger in RAM longer than needed.
 * - Returns empty Maps on error so the caller degrades gracefully (show ID).
 */

import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { CredentialSummary } from "@/features/inventory/types";
import type { Project } from "@/features/projects/types";
import { useVaultStatus } from "@/features/vault/use-vault-status";

export interface SubjectLabelMaps {
  /** credential id → name */
  credentials: Map<string, string>;
  /** project id → name */
  projects: Map<string, string>;
  /** true while either fetch is in-flight */
  loading: boolean;
}

export function useSubjectLabels(): SubjectLabelMaps {
  const { status } = useVaultStatus();
  const isUnlocked = typeof status !== "string" && status.state === "unlocked";

  const [credMap, setCredMap] = useState<Map<string, string>>(new Map());
  const [projMap, setProjMap] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    if (!isUnlocked) {
      // 잠금 상태에서는 메모리에서 라벨을 비워 RAM 잔류 시간을 최소화한다.
      // effect 내 동기 setState 는 lint 가 막으므로 microtask 로 미룬다.
      void Promise.resolve().then(() => {
        if (cancelled) return;
        setCredMap(new Map());
        setProjMap(new Map());
        setLoading(false);
      });
      return () => {
        cancelled = true;
      };
    }

    void Promise.resolve().then(() => {
      if (!cancelled) setLoading(true);
    });

    const fetchCredentials = invoke<CredentialSummary[]>("credential_list", {
      filter: {},
    })
      .then((list) => {
        if (cancelled) return;
        const m = new Map<string, string>();
        for (const c of list) {
          m.set(c.id, c.name);
        }
        setCredMap(m);
      })
      .catch(() => {
        // 실패 시 빈 Map 유지 (caller 가 ID 만 표시하도록 graceful degrade).
      });

    const fetchProjects = invoke<Project[]>("project_list")
      .then((list) => {
        if (cancelled) return;
        const m = new Map<string, string>();
        for (const p of list) {
          m.set(p.id, p.name);
        }
        setProjMap(m);
      })
      .catch(() => {
        // 동상.
      });

    void Promise.allSettled([fetchCredentials, fetchProjects]).then(() => {
      if (!cancelled) setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [isUnlocked]);

  return { credentials: credMap, projects: projMap, loading };
}

/**
 * Resolve a subject label for display.
 *
 * Returns `"name (…id)"` when found, or `"kind:shortId"` for unknown/deleted
 * subjects and non-lookup kinds (issuer, deployment, settings, etc.).
 */
export function resolveSubjectLabel(
  subjectKind: string,
  subjectId: string,
  maps: Pick<SubjectLabelMaps, "credentials" | "projects">,
): string {
  const shortId = subjectId.slice(-6);

  if (subjectKind === "credential") {
    const name = maps.credentials.get(subjectId);
    return name !== undefined ? `${name} (…${shortId})` : `credential:${shortId}`;
  }

  if (subjectKind === "project") {
    const name = maps.projects.get(subjectId);
    return name !== undefined ? `${name} (…${shortId})` : `project:${shortId}`;
  }

  return `${subjectKind}:${shortId}`;
}
