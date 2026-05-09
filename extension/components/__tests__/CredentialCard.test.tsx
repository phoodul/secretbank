// SPDX-License-Identifier: AGPL-3.0-or-later
//
// extension/components/__tests__/CredentialCard.test.tsx — M24-E Phase E-4

import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CredentialCard } from "../CredentialCard";

// E-3: site-logo mock — IDB / chrome.runtime.getURL 미사용
vi.mock("../../lib/site-logo", () => ({
  getSiteLogo: vi
    .fn()
    .mockResolvedValue({ kind: "letter", letter: "G", bg: "oklch(0.55 0.18 140)" }),
  domainToSlug: (d: string) => d.split(".")[0] ?? d,
}));

// ── 기본 props ───────────────────────────────────────────────────────────────

function makeProps(overrides: Partial<React.ComponentProps<typeof CredentialCard>> = {}) {
  return {
    id: "cred-1",
    issuer: "GitHub",
    domain: "github.com",
    username: "testuser",
    onAutofill: vi.fn(),
    onCopy: vi.fn(),
    ...overrides,
  };
}

// ── 렌더 테스트 ───────────────────────────────────────────────────────────────

describe("CredentialCard — 렌더", () => {
  it("issuer 이름이 표시된다", () => {
    render(<CredentialCard {...makeProps()} />);
    expect(screen.getByText("GitHub")).toBeInTheDocument();
  });

  it("domain 이 표시된다", () => {
    render(<CredentialCard {...makeProps()} />);
    expect(screen.getByText("github.com")).toBeInTheDocument();
  });

  it("username 이 표시된다", () => {
    render(<CredentialCard {...makeProps()} />);
    expect(screen.getByText("testuser")).toBeInTheDocument();
  });

  it("username 이 없으면 username 영역이 렌더되지 않는다", () => {
    render(<CredentialCard {...makeProps({ username: undefined })} />);
    expect(screen.queryByText("testuser")).not.toBeInTheDocument();
  });

  it("Autofill 버튼이 렌더된다", () => {
    render(<CredentialCard {...makeProps()} />);
    expect(screen.getByRole("button", { name: /autofill/i })).toBeInTheDocument();
  });

  it("Copy password 버튼이 렌더된다", () => {
    render(<CredentialCard {...makeProps()} />);
    expect(screen.getByRole("button", { name: /copy password/i })).toBeInTheDocument();
  });

  it("username 있을 때 Copy username 버튼이 렌더된다", () => {
    render(<CredentialCard {...makeProps()} />);
    expect(screen.getByRole("button", { name: /copy username/i })).toBeInTheDocument();
  });

  it("username 없을 때 Copy username 버튼이 없다", () => {
    render(<CredentialCard {...makeProps({ username: undefined })} />);
    expect(screen.queryByRole("button", { name: /copy username/i })).not.toBeInTheDocument();
  });

  it("카드에 role=article 이 있다", () => {
    render(<CredentialCard {...makeProps()} />);
    expect(screen.getByRole("article")).toBeInTheDocument();
  });

  it("카드에 aria-label 이 있다", () => {
    render(<CredentialCard {...makeProps()} />);
    const card = screen.getByRole("article");
    expect(card).toHaveAttribute("aria-label", "GitHub credential");
  });
});

// ── 액션 테스트 ───────────────────────────────────────────────────────────────

// 액션 테스트 — jsdom 에서 CSS hover 불가 → fireEvent.click 사용.
// (userEvent 는 pointer-events: none CSS 를 체크하지만, jsdom 에서 CSS hover 는 미적용이라
//  inline <style> 의 .cred-actions { opacity: 0 } 가 pointer-events 도 막을 수 있음)
describe("CredentialCard — 액션", () => {
  it("Autofill 버튼 클릭 시 onAutofill 이 호출된다", () => {
    const props = makeProps();
    render(<CredentialCard {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /autofill github/i }));
    expect(props.onAutofill).toHaveBeenCalledTimes(1);
  });

  it("Copy username 버튼 클릭 시 onCopy('username') 이 호출된다", () => {
    const props = makeProps();
    render(<CredentialCard {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /copy username/i }));
    expect(props.onCopy).toHaveBeenCalledWith("username");
  });

  it("Copy password 버튼 클릭 시 onCopy('password') 가 호출된다", () => {
    const props = makeProps();
    render(<CredentialCard {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /copy password/i }));
    expect(props.onCopy).toHaveBeenCalledWith("password");
  });
});

// ── 키보드 접근성 테스트 ──────────────────────────────────────────────────────

describe("CredentialCard — 키보드 접근성", () => {
  it("카드에 tabIndex=0 이 있다", () => {
    render(<CredentialCard {...makeProps()} />);
    const card = screen.getByRole("article");
    expect(card).toHaveAttribute("tabIndex", "0");
  });

  it("카드에 Enter 키 누르면 onAutofill 이 호출된다", () => {
    const props = makeProps();
    render(<CredentialCard {...props} />);
    const card = screen.getByRole("article");
    fireEvent.keyDown(card, { key: "Enter", code: "Enter" });
    expect(props.onAutofill).toHaveBeenCalledTimes(1);
  });

  it("카드에 Space 키 누르면 onAutofill 이 호출되지 않는다", () => {
    const props = makeProps();
    render(<CredentialCard {...props} />);
    const card = screen.getByRole("article");
    fireEvent.keyDown(card, { key: " ", code: "Space" });
    // Space 는 autofill 핫키 아님
    expect(props.onAutofill).not.toHaveBeenCalled();
  });

  it("Autofill 버튼이 키보드 포커스를 받을 수 있다", () => {
    render(<CredentialCard {...makeProps()} />);
    const btn = screen.getByRole("button", { name: /autofill github/i });
    expect(btn).toHaveAttribute("tabIndex", "0");
  });
});
