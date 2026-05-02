import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Node, NodeProps } from "@xyflow/react";

import "@/lib/i18n";

// ---------------------------------------------------------------------------
// Mock @xyflow/react — Handle requires internal React Flow context in jsdom.
// ---------------------------------------------------------------------------
vi.mock("@xyflow/react", async () => {
  const actual = await vi.importActual<typeof import("@xyflow/react")>("@xyflow/react");
  return {
    ...actual,
    Handle: () => null,
  };
});

import { areNodePropsEqual } from "../nodes/shared";
import type { GraphNodeData } from "../adapter";
import { IssuerNode } from "../nodes/IssuerNode";
import { CredentialNode } from "../nodes/CredentialNode";
import { ProjectNode } from "../nodes/ProjectNode";
import { DeploymentNode } from "../nodes/DeploymentNode";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeProps(data: GraphNodeData): NodeProps<Node<GraphNodeData>> {
  return {
    id: "test-node",
    type: data.kind,
    data,
    selected: false,
    isConnectable: true,
    zIndex: 1,
    xPos: 0,
    yPos: 0,
    dragging: false,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
    deletable: true,
    selectable: true,
    draggable: true,
  } as NodeProps<Node<GraphNodeData>>;
}

const BASE_DATA: GraphNodeData = {
  label: "GitHub",
  kind: "issuer",
  meta: { slug: "github" },
  direction: "TB",
};

// ---------------------------------------------------------------------------
// areNodePropsEqual — pure function tests
// ---------------------------------------------------------------------------

describe("areNodePropsEqual", () => {
  it("모든 렌더링 필드가 같으면 true 반환", () => {
    const prev = makeProps({ ...BASE_DATA });
    const next = makeProps({ ...BASE_DATA });
    expect(areNodePropsEqual(prev, next)).toBe(true);
  });

  it("meta 객체가 달라도 true 반환 (meta는 렌더링에 사용 안 함)", () => {
    const prev = makeProps({ ...BASE_DATA, meta: { slug: "github" } });
    const next = makeProps({ ...BASE_DATA, meta: { slug: "github", extra: 42 } });
    expect(areNodePropsEqual(prev, next)).toBe(true);
  });

  it("selected 플래그가 달라도 true 반환 (React Flow 내부 처리)", () => {
    const prev = makeProps({ ...BASE_DATA });
    const next = makeProps({ ...BASE_DATA });
    prev.selected = false;
    next.selected = true;
    expect(areNodePropsEqual(prev, next)).toBe(true);
  });

  it("dragging 플래그가 달라도 true 반환", () => {
    const prev = makeProps({ ...BASE_DATA });
    const next = makeProps({ ...BASE_DATA });
    prev.dragging = false;
    next.dragging = true;
    expect(areNodePropsEqual(prev, next)).toBe(true);
  });

  it("status가 다르면 false 반환", () => {
    const prev = makeProps({ ...BASE_DATA, status: undefined });
    const next = makeProps({ ...BASE_DATA, status: "primary" });
    expect(areNodePropsEqual(prev, next)).toBe(false);
  });

  it("compact가 다르면 false 반환", () => {
    const prev = makeProps({ ...BASE_DATA, compact: false });
    const next = makeProps({ ...BASE_DATA, compact: true });
    expect(areNodePropsEqual(prev, next)).toBe(false);
  });

  it("label이 다르면 false 반환", () => {
    const prev = makeProps({ ...BASE_DATA, label: "A" });
    const next = makeProps({ ...BASE_DATA, label: "B" });
    expect(areNodePropsEqual(prev, next)).toBe(false);
  });

  it("direction이 다르면 false 반환", () => {
    const prev = makeProps({ ...BASE_DATA, direction: "TB" });
    const next = makeProps({ ...BASE_DATA, direction: "LR" });
    expect(areNodePropsEqual(prev, next)).toBe(false);
  });

  it("id가 다르면 false 반환", () => {
    const prev = makeProps({ ...BASE_DATA });
    const next = makeProps({ ...BASE_DATA });
    prev.id = "node-1";
    next.id = "node-2";
    expect(areNodePropsEqual(prev, next)).toBe(false);
  });

  it("kind가 다르면 false 반환", () => {
    const prev = makeProps({ ...BASE_DATA, kind: "issuer" });
    const next = makeProps({ ...BASE_DATA, kind: "credential" });
    expect(areNodePropsEqual(prev, next)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// compact 모드 렌더링 — 4 노드 × 2 테스트 = 8개
// ---------------------------------------------------------------------------

describe("IssuerNode compact 모드", () => {
  const data: GraphNodeData = { ...BASE_DATA, label: "GitHub", kind: "issuer" };

  it("compact=true 이면 label 숨김", () => {
    render(<IssuerNode {...makeProps({ ...data, compact: true })} />);
    expect(screen.queryByText("GitHub")).toBeNull();
  });

  it("compact=false 이면 label 표시", () => {
    render(<IssuerNode {...makeProps({ ...data, compact: false })} />);
    expect(screen.getByText("GitHub")).toBeInTheDocument();
  });
});

describe("CredentialNode compact 모드", () => {
  const data: GraphNodeData = {
    label: "My Token",
    kind: "credential",
    meta: {},
    direction: "TB",
  };

  it("compact=true 이면 label 숨김", () => {
    render(<CredentialNode {...makeProps({ ...data, compact: true })} />);
    expect(screen.queryByText("My Token")).toBeNull();
  });

  it("compact=false 이면 label 표시", () => {
    render(<CredentialNode {...makeProps({ ...data, compact: false })} />);
    expect(screen.getByText("My Token")).toBeInTheDocument();
  });
});

describe("ProjectNode compact 모드", () => {
  const data: GraphNodeData = {
    label: "My App",
    kind: "project",
    meta: {},
    direction: "TB",
  };

  it("compact=true 이면 label 숨김", () => {
    render(<ProjectNode {...makeProps({ ...data, compact: true })} />);
    expect(screen.queryByText("My App")).toBeNull();
  });

  it("compact=false 이면 label 표시", () => {
    render(<ProjectNode {...makeProps({ ...data, compact: false })} />);
    expect(screen.getByText("My App")).toBeInTheDocument();
  });
});

describe("DeploymentNode compact 모드", () => {
  const data: GraphNodeData = {
    label: "prod-server",
    kind: "deployment",
    meta: {},
    direction: "TB",
  };

  it("compact=true 이면 label 숨김", () => {
    render(<DeploymentNode {...makeProps({ ...data, compact: true })} />);
    expect(screen.queryByText("prod-server")).toBeNull();
  });

  it("compact=false 이면 label 표시", () => {
    render(<DeploymentNode {...makeProps({ ...data, compact: false })} />);
    expect(screen.getByText("prod-server")).toBeInTheDocument();
  });
});
