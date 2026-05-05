/**
 * MiniGraph — BentoCard hover 시 표시되는 미니 dependency graph (M24 1.5-G)
 *
 * - credential_get 으로 usages 가져옴 → 고유 project_id 추출
 * - project_list 로 project name lookup
 * - 순수 SVG fan-out 렌더 (React Flow 없음)
 * - usages 0 개 → empty placeholder
 * - usages > 5 개 → 5개 + "+N more" 노드 축약
 */

import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";

import type { CredentialFull } from "./types";
import type { Project } from "../projects/types";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface MiniGraphProps {
  credentialId: string;
  credentialName: string;
}

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------

const VIEW_W = 220;
const VIEW_H = 110;
const CENTER_X = VIEW_W / 2;
const CENTER_Y = VIEW_H / 2;
const EDGE_RADIUS = 44;
const CENTER_R = 10;
const PROJECT_R = 8;
const MAX_VISIBLE = 5;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MiniGraph({ credentialId, credentialName }: MiniGraphProps) {
  const { t } = useTranslation("common");

  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const [projectNodes, setProjectNodes] = useState<{ id: string; name: string }[]>([]);
  const [extraCount, setExtraCount] = useState(0);

  const abortRef = useRef(false);

  useEffect(() => {
    abortRef.current = false;
    setStatus("loading");

    const run = async () => {
      try {
        const [full, projects] = await Promise.all([
          invoke<CredentialFull>("credential_get", { id: credentialId }),
          invoke<Project[]>("project_list"),
        ]);

        if (abortRef.current) return;

        const projectMap = new Map(projects.map((p) => [p.id, p.name]));

        // 고유 project_id 추출
        const seenIds = new Set<string>();
        const nodes: { id: string; name: string }[] = [];
        for (const usage of full.usages) {
          if (!seenIds.has(usage.project_id)) {
            seenIds.add(usage.project_id);
            const name = projectMap.get(usage.project_id) ?? usage.project_id.slice(0, 8);
            nodes.push({ id: usage.project_id, name });
          }
        }

        const visible = nodes.slice(0, MAX_VISIBLE);
        const extra = nodes.length - visible.length;

        setProjectNodes(visible);
        setExtraCount(extra);
        setStatus("ok");
      } catch {
        if (!abortRef.current) setStatus("error");
      }
    };

    void run();

    return () => {
      abortRef.current = true;
    };
  }, [credentialId]);

  // ── Loading skeleton ──────────────────────────────────────────────────────

  if (status === "loading") {
    return (
      <div
        className="mt-2 h-[110px] w-full animate-pulse rounded-md bg-muted"
        aria-label="Loading graph"
      />
    );
  }

  // ── Error: 조용히 fail ────────────────────────────────────────────────────

  if (status === "error") return null;

  // ── Empty state ───────────────────────────────────────────────────────────

  if (projectNodes.length === 0 && extraCount === 0) {
    return (
      <p className="mt-2 text-center text-xs text-muted-foreground">
        {t("inventory.card.miniGraphEmpty")}
      </p>
    );
  }

  // ── Fan-out layout ────────────────────────────────────────────────────────

  const totalNodes = projectNodes.length + (extraCount > 0 ? 1 : 0);
  const angleStep = totalNodes === 1 ? 0 : (2 * Math.PI) / totalNodes;
  const startAngle = -Math.PI / 2; // 12시 방향 시작

  const allNodes = [
    ...projectNodes.map((p, i) => ({ ...p, isExtra: false, index: i })),
    ...(extraCount > 0
      ? [
          {
            id: "__extra__",
            name: t("inventory.card.miniGraphMore", { count: extraCount }),
            isExtra: true,
            index: projectNodes.length,
          },
        ]
      : []),
  ];

  return (
    <div className="mt-2" onClick={(e) => e.stopPropagation()}>
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        aria-label="Dependency graph"
        className="w-full"
        style={{ maxHeight: 110 }}
      >
        {/* Edges */}
        <g className="text-border">
          {allNodes.map((node) => {
            const angle = startAngle + node.index * angleStep;
            const px = CENTER_X + EDGE_RADIUS * Math.cos(angle);
            const py = CENTER_Y + EDGE_RADIUS * Math.sin(angle);
            return (
              <line
                key={`edge-${node.id}`}
                x1={CENTER_X}
                y1={CENTER_Y}
                x2={px}
                y2={py}
                stroke="currentColor"
                strokeWidth={1}
                strokeOpacity={0.5}
              />
            );
          })}
        </g>

        {/* Project nodes */}
        <g>
          {allNodes.map((node) => {
            const angle = startAngle + node.index * angleStep;
            const px = CENTER_X + EDGE_RADIUS * Math.cos(angle);
            const py = CENTER_Y + EDGE_RADIUS * Math.sin(angle);
            const label = node.name.length > 10 ? node.name.slice(0, 9) + "…" : node.name;

            return (
              <g key={node.id} className={node.isExtra ? "text-muted-foreground" : "text-primary"}>
                <circle
                  cx={px}
                  cy={py}
                  r={PROJECT_R}
                  fill="currentColor"
                  fillOpacity={0.15}
                  stroke="currentColor"
                  strokeWidth={1.2}
                />
                <text
                  x={px}
                  y={py + PROJECT_R + 8}
                  textAnchor="middle"
                  fontSize={6}
                  fill="currentColor"
                  className="text-muted-foreground"
                >
                  {label}
                </text>
              </g>
            );
          })}
        </g>

        {/* Center credential node */}
        <g style={{ color: "var(--color-vault-accent, hsl(var(--primary)))" }}>
          <circle
            cx={CENTER_X}
            cy={CENTER_Y}
            r={CENTER_R}
            fill="currentColor"
            fillOpacity={0.2}
            stroke="currentColor"
            strokeWidth={1.5}
          />
          <text
            x={CENTER_X}
            y={CENTER_Y + 1}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={5.5}
            fill="currentColor"
            fontWeight="600"
          >
            {credentialName.length > 10 ? credentialName.slice(0, 9) + "…" : credentialName}
          </text>
        </g>
      </svg>
    </div>
  );
}
