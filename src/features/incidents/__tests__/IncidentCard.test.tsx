/**
 * T-2-2A-4 — IncidentCard 단위 테스트
 * reason 아이콘, HIBP description, domain 라인 표시 검증
 */

import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import "@/lib/i18n";

// ---------------------------------------------------------------------------
// Mocks — before component imports
// ---------------------------------------------------------------------------

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => undefined),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { IncidentCard } from "../IncidentCard";
import type { IncidentListEntry } from "../types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeEntry(overrides: Partial<IncidentListEntry> = {}): IncidentListEntry {
  return {
    incident: {
      id: "01J0000000000000000000000I",
      source: "nvd",
      source_id: "CVE-2025-9999",
      issuer_id: null,
      severity: "high",
      title: "Test incident",
      body: null,
      url: null,
      domain: null,
      detected_at: 1700000000000,
      published_at: null,
    },
    matches: [],
    ...overrides,
  };
}

function makeMatch(
  reason: IncidentListEntry["matches"][number]["reason"] = "issuer_match",
  dismissedAt: string | null = null,
): IncidentListEntry["matches"][number] {
  return {
    id: "match-1",
    credential_id: "cred-1",
    credential_label: "My API Key",
    issuer_display_name: "Vercel",
    reason,
    matched_at: 1700000001000,
    dismissed_at: dismissedAt,
  };
}

function renderCard(entry: IncidentListEntry) {
  return render(
    <MemoryRouter>
      <IncidentCard entry={entry} />
    </MemoryRouter>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("IncidentCard", () => {
  // -------------------------------------------------------------------------
  // T-1: domain reason → Globe icon in chip
  // -------------------------------------------------------------------------
  it("T-1: domain reason 매칭 chip 안에 Globe 아이콘이 렌더링된다", () => {
    const entry = makeEntry({ matches: [makeMatch("domain")] });
    renderCard(entry);

    // chip span: title 속성이 domain 관련 텍스트를 가짐
    const chip = screen.getByTitle(/domain/i);
    expect(chip).toBeInTheDocument();

    // chip 안의 svg 에 lucide-globe 클래스가 있어야 함
    const svg = chip.querySelector("svg.lucide-globe");
    expect(svg).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // T-2: issuer_match reason → Tag icon in chip
  // -------------------------------------------------------------------------
  it("T-2: issuer_match reason 매칭 chip 안에 Tag 아이콘이 렌더링된다", () => {
    const entry = makeEntry({ matches: [makeMatch("issuer_match")] });
    renderCard(entry);

    const chip = screen.getByTitle(/issuer/i);
    expect(chip).toBeInTheDocument();

    const svg = chip.querySelector("svg.lucide-tag");
    expect(svg).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // T-3: HIBP incident with body → description 표시
  // -------------------------------------------------------------------------
  it("T-3: HIBP source 이고 body 가 있으면 description 을 표시한다", () => {
    const bodyText = "In April 2026, the company X experienced a data breach exposing user data.";
    const entry = makeEntry({
      incident: {
        id: "hibp-1",
        source: "hibp",
        source_id: "vercel-2026",
        issuer_id: null,
        severity: "high",
        title: "Vercel Breach",
        body: bodyText,
        url: null,
        domain: null,
        detected_at: 1700000000000,
        published_at: null,
      },
    });
    renderCard(entry);

    expect(screen.getByText(bodyText)).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // T-4: Non-HIBP incident → body 표시 안 됨 (회귀)
  // -------------------------------------------------------------------------
  it("T-4: HIBP 가 아닌 source 의 body 는 카드에 표시되지 않는다", () => {
    const bodyText = "CVE description that should not appear.";
    const entry = makeEntry({
      incident: {
        id: "nvd-1",
        source: "nvd",
        source_id: "CVE-2025-0001",
        issuer_id: null,
        severity: "medium",
        title: "NVD Vulnerability",
        body: bodyText,
        url: null,
        domain: null,
        detected_at: 1700000000000,
        published_at: null,
      },
    });
    renderCard(entry);

    expect(screen.queryByText(bodyText)).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // T-5: incident.domain 설정 → domain 라인 표시
  // -------------------------------------------------------------------------
  it("T-5: incident.domain 이 설정되면 domain 라인과 Globe 아이콘이 표시된다", () => {
    const entry = makeEntry({
      incident: {
        id: "hibp-2",
        source: "hibp",
        source_id: "vercel-2026",
        issuer_id: null,
        severity: "high",
        title: "Vercel Breach",
        body: null,
        url: null,
        domain: "vercel.com",
        detected_at: 1700000000000,
        published_at: null,
      },
    });
    renderCard(entry);

    expect(screen.getByText("vercel.com")).toBeInTheDocument();

    // domain 라인의 Globe 아이콘 — 카드 전체에서 lucide-globe svg 있어야 함
    const card = screen.getByTestId("incident-card");
    const globeIcons = card.querySelectorAll("svg.lucide-globe");
    expect(globeIcons.length).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // T-6: incident.domain null → domain 라인 렌더링 안 됨
  // -------------------------------------------------------------------------
  it("T-6: incident.domain 이 null 이면 domain 라인이 렌더링되지 않는다", () => {
    const entry = makeEntry({ incident: { ...makeEntry().incident, domain: null } });
    renderCard(entry);

    // vercel.com 이나 다른 도메인 텍스트가 없어야 함
    expect(screen.queryByText("vercel.com")).not.toBeInTheDocument();

    // domain 전용 Globe 아이콘이 없어야 함 (chip 아이콘 외)
    // matches 가 없으므로 카드에 Globe 가 전혀 없어야 함
    const card = screen.getByTestId("incident-card");
    const globeIcons = card.querySelectorAll("svg.lucide-globe");
    expect(globeIcons).toHaveLength(0);
  });
});
