// SPDX-License-Identifier: AGPL-3.0-or-later
//
// extension/components/MiniGraph.tsx — M24-E Phase G-1-2
//
// popup CredentialCard hover 시 표시되는 220x110 SVG fan-out mini-graph.
//
// - center: credential (center_label — issuer 이름 또는 abbreviation)
// - project nodes: 최대 5개 radial fan-out (각도 등분)
// - edge: center → project bezier curve
// - "+N more" 라벨: hidden_count > 0 일 때 표시 (G-1-1 응답 활용)
// - 0 projects → empty state 표시
//
// 패턴 출처: src/features/inventory/MiniGraph.tsx (M24 1.5 desktop)
// credential plaintext ❌ — center_label = issuer display_name 만

import React from "react";
import type { CredentialMiniGraph, ProjectNode } from "@secretbank/shared";

// ---------------------------------------------------------------------------
// 레이아웃 상수 (desktop M24 1.5 와 동일)
// ---------------------------------------------------------------------------

const VIEW_W = 220;
const VIEW_H = 110;
const CENTER_X = VIEW_W / 2;
const CENTER_Y = VIEW_H / 2;
const EDGE_RADIUS = 44;
const CENTER_R = 10;
const PROJECT_R = 8;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface MiniGraphProps {
  /** G-1-1 graphForCredential 응답 */
  data: CredentialMiniGraph;
  /** 클릭 시 호출 (deep-link 트리거 — caller 가 openSecretbankDeepLink 호출) */
  onClick?: () => void;
}

// ---------------------------------------------------------------------------
// 내부 노드 타입
// ---------------------------------------------------------------------------

interface NodeEntry {
  id: string;
  name: string;
  isExtra: boolean;
  index: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MiniGraph({ data, onClick }: MiniGraphProps) {
  const { center_label, project_nodes, hidden_count } = data;

  // ── Empty state ─────────────────────────────────────────────────────────────

  if (project_nodes.length === 0 && hidden_count === 0) {
    return (
      <div
        className="mini-graph-wrap"
        style={{
          marginTop: 8,
          textAlign: "center",
          fontSize: 11,
          color: "var(--color-muted-foreground, oklch(0.5 0.01 264))",
        }}
      >
        No linked projects
      </div>
    );
  }

  // ── Fan-out 레이아웃 계산 ────────────────────────────────────────────────────

  const visibleNodes: NodeEntry[] = project_nodes.map((p: ProjectNode, i: number) => ({
    id: p.id,
    name: p.label,
    isExtra: false,
    index: i,
  }));

  if (hidden_count > 0) {
    visibleNodes.push({
      id: "__extra__",
      name: `+${hidden_count} more`,
      isExtra: true,
      index: visibleNodes.length,
    });
  }

  const totalNodes = visibleNodes.length;
  const angleStep = totalNodes === 1 ? 0 : (2 * Math.PI) / totalNodes;
  const startAngle = -Math.PI / 2; // 12시 방향 시작

  return (
    <div
      className="mini-graph-wrap"
      style={{ marginTop: 8, cursor: onClick ? "pointer" : "default" }}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      aria-label={onClick ? "Open dependency graph in Secretbank" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        aria-label="Dependency graph"
        style={{ width: "100%", maxHeight: 110, display: "block" }}
      >
        {/* Edges — center → project bezier curve */}
        <g>
          {visibleNodes.map((node) => {
            const angle = startAngle + node.index * angleStep;
            const px = CENTER_X + EDGE_RADIUS * Math.cos(angle);
            const py = CENTER_Y + EDGE_RADIUS * Math.sin(angle);
            // 단순 직선 (desktop 패턴과 동일 — popup 크기 제약으로 bezier 생략)
            return (
              <line
                key={`edge-${node.id}`}
                x1={CENTER_X}
                y1={CENTER_Y}
                x2={px}
                y2={py}
                stroke="var(--color-border, oklch(0.88 0.01 264))"
                strokeWidth={1}
                strokeOpacity={0.6}
              />
            );
          })}
        </g>

        {/* Project nodes */}
        <g>
          {visibleNodes.map((node) => {
            const angle = startAngle + node.index * angleStep;
            const px = CENTER_X + EDGE_RADIUS * Math.cos(angle);
            const py = CENTER_Y + EDGE_RADIUS * Math.sin(angle);
            const label = node.name.length > 10 ? node.name.slice(0, 9) + "…" : node.name;
            const nodeColor = node.isExtra
              ? "var(--color-muted-foreground, oklch(0.5 0.01 264))"
              : "var(--color-primary, oklch(0.5 0.18 264))";

            return (
              <g key={node.id} data-testid={node.isExtra ? "extra-node" : "project-node"}>
                <circle
                  cx={px}
                  cy={py}
                  r={PROJECT_R}
                  fill={nodeColor}
                  fillOpacity={0.15}
                  stroke={nodeColor}
                  strokeWidth={1.2}
                />
                <text
                  x={px}
                  y={py + PROJECT_R + 8}
                  textAnchor="middle"
                  fontSize={6}
                  fill="var(--color-muted-foreground, oklch(0.5 0.01 264))"
                >
                  {label}
                </text>
              </g>
            );
          })}
        </g>

        {/* Center credential node */}
        <g data-testid="center-node">
          <circle
            cx={CENTER_X}
            cy={CENTER_Y}
            r={CENTER_R}
            fill="var(--color-vault-accent, var(--color-primary, oklch(0.5 0.18 264)))"
            fillOpacity={0.2}
            stroke="var(--color-vault-accent, var(--color-primary, oklch(0.5 0.18 264)))"
            strokeWidth={1.5}
          />
          <text
            x={CENTER_X}
            y={CENTER_Y + 1}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={5.5}
            fill="var(--color-vault-accent, var(--color-primary, oklch(0.5 0.18 264)))"
            fontWeight="600"
          >
            {center_label.length > 10 ? center_label.slice(0, 9) + "…" : center_label}
          </text>
        </g>
      </svg>
    </div>
  );
}
