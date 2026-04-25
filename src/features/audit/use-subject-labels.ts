/**
 * use-subject-labels — audit UI helper (이슈 2 frontend lookup).
 *
 * Since payload_json no longer contains human-readable labels, the UI must
 * look them up from the live data.  This hook fetches credential and project
 * summaries once on mount and returns Maps keyed by ID.
 *
 * Design decisions:
 * - Fetches independently of the full inventory/project hooks so it can be
 *   used in AuditTimeline without requiring those hooks to be mounted.
 * - Returns empty Maps on error so the caller degrades gracefully (show ID).
 * - No cache invalidation — labels are stable enough for an audit view.
 */

import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { CredentialSummary } from "@/features/inventory/types";
import type { Project } from "@/features/projects/types";

export interface SubjectLabelMaps {
  /** credential id → name */
  credentials: Map<string, string>;
  /** project id → name */
  projects: Map<string, string>;
  /** true while either fetch is in-flight */
  loading: boolean;
}

export function useSubjectLabels(): SubjectLabelMaps {
  const [credMap, setCredMap] = useState<Map<string, string>>(new Map());
  const [projMap, setProjMap] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const fetchCredentials = invoke<CredentialSummary[]>("credential_list", {
      filter: {},
    }).then((list) => {
      if (cancelled) return;
      const m = new Map<string, string>();
      for (const c of list) {
        m.set(c.id, c.name);
      }
      setCredMap(m);
    });

    const fetchProjects = invoke<Project[]>("project_list").then((list) => {
      if (cancelled) return;
      const m = new Map<string, string>();
      for (const p of list) {
        m.set(p.id, p.name);
      }
      setProjMap(m);
    });

    void Promise.allSettled([fetchCredentials, fetchProjects]).then(() => {
      if (!cancelled) setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);

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
