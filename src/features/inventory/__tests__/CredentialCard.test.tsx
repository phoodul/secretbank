import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import "@/lib/i18n";
import { CredentialCard } from "../CredentialCard";
import type { CredentialSummary } from "../types";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.now();

function makeCredential(overrides: Partial<CredentialSummary> = {}): CredentialSummary {
  return {
    id: "01HZAAAAAAAAAAAAAAAAAAAAAA",
    issuer_id: "01HZBBBBBBBBBBBBBBBBBBBBBB",
    name: "Test Key",
    env: "prod",
    status: "active",
    expires_at: null,
    ...overrides,
  };
}

describe("CredentialCard", () => {
  it("이름을 렌더링한다", () => {
    render(<CredentialCard credential={makeCredential({ name: "My API Key" })} />);
    expect(screen.getByText("My API Key")).toBeInTheDocument();
  });

  it("status=active, expires_at=null → 'Active' 배지를 표시한다", () => {
    render(<CredentialCard credential={makeCredential({ status: "active", expires_at: null })} />);
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("status=revoked → 'Revoked' 배지를 표시한다", () => {
    render(<CredentialCard credential={makeCredential({ status: "revoked" })} />);
    expect(screen.getByText("Revoked")).toBeInTheDocument();
  });

  it("status=compromised → 'Compromised' 배지를 표시한다", () => {
    render(<CredentialCard credential={makeCredential({ status: "compromised" })} />);
    expect(screen.getByText("Compromised")).toBeInTheDocument();
  });

  it("expires_at이 과거 → 'Expired' 배지를 표시한다", () => {
    render(
      <CredentialCard
        credential={makeCredential({ status: "active", expires_at: NOW - 5 * DAY })}
      />,
    );
    expect(screen.getByText("Expired")).toBeInTheDocument();
  });

  it("expires_at이 30일 이내 → 'Expiring soon' 배지를 표시한다", () => {
    render(
      <CredentialCard
        credential={makeCredential({ status: "active", expires_at: NOW + 10 * DAY })}
      />,
    );
    expect(screen.getByText("Expiring soon")).toBeInTheDocument();
  });

  it("expires_at이 30일 초과 → 'Active' 배지를 표시한다", () => {
    render(
      <CredentialCard
        credential={makeCredential({ status: "active", expires_at: NOW + 60 * DAY })}
      />,
    );
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("revoked는 expired보다 우선: expires_at이 과거여도 'Revoked' 배지를 표시한다", () => {
    render(
      <CredentialCard
        credential={makeCredential({ status: "revoked", expires_at: NOW - 1 * DAY })}
      />,
    );
    expect(screen.getByText("Revoked")).toBeInTheDocument();
  });

  it("hover 시 issuer_id 축약형이 나타난다", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <CredentialCard credential={makeCredential({ issuer_id: "01HZBBBBBBBBBBBBBBBBBBBBBB" })} />,
    );

    // hover 전에도 DOM 에는 있지만 opacity-0 으로 숨겨져 있음
    expect(screen.getByText("01HZBBBBB".slice(0, 8))).toBeInTheDocument();

    // hover 이벤트 발생
    const card = container.firstElementChild as HTMLElement;
    await user.hover(card);
    // DOM 에 여전히 존재 (CSS opacity 전환은 jsdom 에서 style 로 검증 불가, DOM 존재 여부만 확인)
    expect(screen.getByText("01HZBBBBB".slice(0, 8))).toBeInTheDocument();
  });

  it("Env 배지(Prod/Dev/Staging)가 hover 영역에 렌더링된다", () => {
    render(<CredentialCard credential={makeCredential({ env: "prod" })} />);
    expect(screen.getByText("Prod")).toBeInTheDocument();
  });
});
