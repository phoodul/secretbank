// SPDX-License-Identifier: AGPL-3.0-or-later
//
// extension/entrypoints/popup/__tests__/CredentialList.test.tsx — M24-E Phase E-4

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ── vi.hoisted — mock 객체 공유 ───────────────────────────────────────────────

const { nmStub, mockGetSessionToken } = vi.hoisted(() => {
  const nmStub = {
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn(),
    credentialListVisible: vi.fn(),
  };
  const mockGetSessionToken = vi.fn().mockResolvedValue({
    token: "test-token-abc",
    expires_at: Date.now() + 3_600_000,
  });
  return { nmStub, mockGetSessionToken };
});

// ── mock 선언 ─────────────────────────────────────────────────────────────────

// site-logo mock
vi.mock("../../../lib/site-logo", () => ({
  getSiteLogo: vi
    .fn()
    .mockResolvedValue({ kind: "letter", letter: "G", bg: "oklch(0.55 0.18 140)" }),
  domainToSlug: (d: string) => d.split(".")[0] ?? d,
}));

// storage mock
vi.mock("../../../lib/storage", () => ({
  getSessionToken: () => mockGetSessionToken(),
}));

// NMClient mock — class 패턴 (SaveDialog 테스트와 동일)
vi.mock("../../../lib/nm-client", () => ({
  NMClient: class {
    connect = nmStub.connect;
    disconnect = nmStub.disconnect;
    credentialListVisible = nmStub.credentialListVisible;
  },
}));

// 컴포넌트 import (mock 선언 후)
import CredentialList from "../CredentialList";

// chrome.tabs mock
beforeEach(() => {
  // @ts-ignore
  globalThis.chrome.tabs = {
    query: vi.fn().mockResolvedValue([{ id: 1, url: "https://github.com/settings" }]),
    sendMessage: vi.fn().mockResolvedValue(undefined),
    create: vi.fn().mockResolvedValue(undefined),
  };
  mockGetSessionToken.mockResolvedValue({
    token: "test-token-abc",
    expires_at: Date.now() + 3_600_000,
  });
  nmStub.connect.mockResolvedValue(undefined);
  nmStub.disconnect.mockReturnValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
});

// ── 샘플 데이터 ───────────────────────────────────────────────────────────────

const ITEMS = [
  {
    credential_id: "cred-1",
    issuer: "GitHub",
    domain: "github.com",
    username: "alice",
  },
  {
    credential_id: "cred-2",
    issuer: "Google",
    domain: "google.com",
    username: "alice@example.com",
  },
  {
    credential_id: "cred-3",
    issuer: "AWS",
    domain: "console.aws.amazon.com",
  },
];

// ── 렌더 테스트 ───────────────────────────────────────────────────────────────

describe("CredentialList — 로딩 상태", () => {
  it("로딩 중 spinner / Loading 텍스트가 표시된다", async () => {
    // 로딩을 늦게 끝내기 위해 Promise 를 resolve 하지 않는다
    nmStub.credentialListVisible.mockImplementation(() => new Promise(() => {}));

    render(<CredentialList />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });
});

describe("CredentialList — locked 상태", () => {
  it("세션 토큰 없으면 locked 화면이 표시된다", async () => {
    mockGetSessionToken.mockResolvedValue(null);
    render(<CredentialList />);
    await waitFor(() => {
      expect(screen.getByText(/vault is locked/i)).toBeInTheDocument();
    });
  });

  it("vault_locked 응답 시 locked 화면이 표시된다", async () => {
    nmStub.credentialListVisible.mockResolvedValue({ ok: false, error: "vault_locked" });
    render(<CredentialList />);
    await waitFor(() => {
      expect(screen.getByText(/vault is locked/i)).toBeInTheDocument();
    });
  });

  it("Refresh 버튼이 표시된다", async () => {
    mockGetSessionToken.mockResolvedValue(null);
    render(<CredentialList />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /refresh/i })).toBeInTheDocument();
    });
  });
});

describe("CredentialList — 빈 상태", () => {
  it("credential 없으면 'No credentials saved' 가 표시된다", async () => {
    nmStub.credentialListVisible.mockResolvedValue({ ok: true, items: [] });
    render(<CredentialList />);
    await waitFor(() => {
      expect(screen.getByText(/no credentials saved/i)).toBeInTheDocument();
    });
  });

  it("'Open Secretbank' 버튼이 표시된다", async () => {
    nmStub.credentialListVisible.mockResolvedValue({ ok: true, items: [] });
    render(<CredentialList />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /open secretbank/i })).toBeInTheDocument();
    });
  });
});

describe("CredentialList — 카드 표시", () => {
  it("전체 credential 이 표시된다", async () => {
    nmStub.credentialListVisible.mockResolvedValue({ ok: true, items: ITEMS });
    render(<CredentialList />);
    await waitFor(() => {
      expect(screen.getByText("GitHub")).toBeInTheDocument();
      expect(screen.getByText("Google")).toBeInTheDocument();
      expect(screen.getByText("AWS")).toBeInTheDocument();
    });
  });

  it("활성 탭 도메인(github.com) 매칭 credential 이 먼저 표시된다", async () => {
    // github.com 활성 탭
    (chrome.tabs.query as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 1, url: "https://github.com/settings" },
    ]);
    nmStub.credentialListVisible.mockResolvedValue({ ok: true, items: ITEMS });

    render(<CredentialList />);
    await waitFor(() => {
      const cards = screen.getAllByRole("article");
      // 첫 번째 카드는 GitHub (github.com 매칭)
      expect(cards[0]).toHaveTextContent("GitHub");
    });
  });

  it("섹션 레이블에 활성 탭 도메인이 표시된다", async () => {
    (chrome.tabs.query as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 1, url: "https://github.com/settings" },
    ]);
    nmStub.credentialListVisible.mockResolvedValue({ ok: true, items: ITEMS });

    render(<CredentialList />);
    await waitFor(() => {
      // github.com 은 섹션 레이블 + 카드 domain 모두에 출현 → 최소 1개 이상
      const matches = screen.getAllByText("github.com");
      expect(matches.length).toBeGreaterThanOrEqual(1);
      // .cl-section-label 클래스를 가진 element 가 있어야 한다
      const label = document.querySelector(".cl-section-label");
      expect(label).not.toBeNull();
      expect(label?.textContent).toBe("github.com");
    });
  });
});

describe("CredentialList — 검색 필터", () => {
  it("검색어로 issuer 를 필터링한다", async () => {
    nmStub.credentialListVisible.mockResolvedValue({ ok: true, items: ITEMS });
    const user = userEvent.setup();

    render(<CredentialList />);
    await waitFor(() => expect(screen.getByText("GitHub")).toBeInTheDocument());

    const input = screen.getByRole("searchbox", { name: /search/i });
    await user.type(input, "Google");

    await waitFor(() => {
      expect(screen.getByText("Google")).toBeInTheDocument();
      expect(screen.queryByText("GitHub")).not.toBeInTheDocument();
      expect(screen.queryByText("AWS")).not.toBeInTheDocument();
    });
  });

  it("검색어로 domain 을 필터링한다", async () => {
    nmStub.credentialListVisible.mockResolvedValue({ ok: true, items: ITEMS });
    const user = userEvent.setup();

    render(<CredentialList />);
    await waitFor(() => expect(screen.getByText("GitHub")).toBeInTheDocument());

    const input = screen.getByRole("searchbox", { name: /search/i });
    await user.type(input, "amazon");

    await waitFor(() => {
      expect(screen.getByText("AWS")).toBeInTheDocument();
      expect(screen.queryByText("GitHub")).not.toBeInTheDocument();
    });
  });

  it("결과 없으면 'No results' 메시지가 표시된다", async () => {
    nmStub.credentialListVisible.mockResolvedValue({ ok: true, items: ITEMS });
    const user = userEvent.setup();

    render(<CredentialList />);
    await waitFor(() => expect(screen.getByText("GitHub")).toBeInTheDocument());

    const input = screen.getByRole("searchbox", { name: /search/i });
    await user.type(input, "xyznotfound");

    await waitFor(() => {
      expect(screen.getByText(/no results/i)).toBeInTheDocument();
    });
  });

  it("검색어 지우면 전체 목록으로 복귀한다", async () => {
    nmStub.credentialListVisible.mockResolvedValue({ ok: true, items: ITEMS });
    const user = userEvent.setup();

    render(<CredentialList />);
    await waitFor(() => expect(screen.getByText("GitHub")).toBeInTheDocument());

    const input = screen.getByRole("searchbox", { name: /search/i });
    await user.type(input, "Google");
    await waitFor(() => expect(screen.queryByText("GitHub")).not.toBeInTheDocument());

    await user.clear(input);
    await waitFor(() => {
      expect(screen.getByText("GitHub")).toBeInTheDocument();
      expect(screen.getByText("Google")).toBeInTheDocument();
    });
  });
});

describe("CredentialList — autofill 흐름", () => {
  it("Autofill 버튼 클릭 시 chrome.tabs.sendMessage 가 호출된다", async () => {
    nmStub.credentialListVisible.mockResolvedValue({
      ok: true,
      items: [ITEMS[0]],
    });

    // window.close mock
    const closeSpy = vi.spyOn(window, "close").mockReturnValue(undefined);

    render(<CredentialList />);
    await waitFor(() => expect(screen.getByText("GitHub")).toBeInTheDocument());

    // CSS hover 미적용 jsdom → fireEvent.click 사용
    const autofillBtn = screen.getByRole("button", { name: /autofill github/i });
    fireEvent.click(autofillBtn);

    await waitFor(() => {
      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ type: "autofill_credential", credential_id: "cred-1" }),
      );
    });
    closeSpy.mockRestore();
  });
});
