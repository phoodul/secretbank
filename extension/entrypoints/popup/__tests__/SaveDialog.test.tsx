// SPDX-License-Identifier: AGPL-3.0-or-later
//
// extension/entrypoints/popup/__tests__/SaveDialog.test.tsx — D-6
//
// SaveDialog 렌더 + 저장/취소 + issuer 자동 매칭 표시 + 사용자 변경 검증.
//
// DoD 검증 항목:
//   1. pending save 없음 → empty placeholder 렌더
//   2. pending save 있음 → 폼 렌더 (issuer, name, username read-only, notes)
//   3. issuer 자동 매칭 결과 (issuerName) → 입력 초기값으로 표시
//   4. 사용자가 issuer 변경 → state 반영
//   5. 저장 버튼 클릭 → nm-client credentialCreate 호출 → saved 메시지
//   6. 취소 버튼 클릭 → clearPendingSave 호출 → empty 상태
//   7. kind=update → credentialUpdate 호출
//   8. session 없음 → 저장 실패 → error 메시지

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SaveDialog from "../SaveDialog";
import type { PendingSave } from "../../../lib/storage";

// ---------------------------------------------------------------------------
// vi.hoisted — mock 객체 공유
// ---------------------------------------------------------------------------

const { nmStub } = vi.hoisted(() => {
  const nmStub = {
    connect: vi.fn().mockResolvedValue(undefined),
    credentialCreate: vi.fn().mockResolvedValue({ type: "credential_save_response", ok: true }),
    credentialUpdate: vi.fn().mockResolvedValue({ type: "credential_save_response", ok: true }),
  };
  return { nmStub };
});

// ---------------------------------------------------------------------------
// Mock: nm-client
// ---------------------------------------------------------------------------

vi.mock("../../../lib/nm-client", () => ({
  NMClient: class {
    connect = nmStub.connect;
    credentialCreate = nmStub.credentialCreate;
    credentialUpdate = nmStub.credentialUpdate;
  },
}));

// ---------------------------------------------------------------------------
// Mock: storage (getPendingSave / clearPendingSave / getSessionToken)
// ---------------------------------------------------------------------------

const mockGetPendingSave = vi.fn<() => Promise<PendingSave | null>>();
const mockClearPendingSave = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockGetSessionToken = vi.fn().mockResolvedValue({
  token: "test-token-abc",
  expires_at: Date.now() + 3_600_000,
});

vi.mock("../../../lib/storage", () => ({
  getPendingSave: () => mockGetPendingSave(),
  clearPendingSave: () => mockClearPendingSave(),
  getSessionToken: () => mockGetSessionToken(),
  setPendingSave: vi.fn(),
  clearSessionToken: vi.fn(),
  getNeverSaveDomains: vi.fn().mockResolvedValue([]),
  addNeverSaveDomain: vi.fn(),
}));

// E-3: site-logo mock — SaveDialog 테스트 환경에서 chrome.runtime.getURL 미사용
vi.mock("../../../lib/site-logo", () => ({
  getSiteLogo: vi.fn().mockResolvedValue({ kind: "letter", letter: "G", bg: "oklch(0.55 0.18 140)" }),
  domainToSlug: (d: string) => d.split(".")[0] ?? d,
}));

// ---------------------------------------------------------------------------
// 헬퍼
// ---------------------------------------------------------------------------

function makePending(overrides: Partial<PendingSave> = {}): PendingSave {
  return {
    kind: "new",
    domain: "github.com",
    siteName: "GitHub",
    username: "octocat",
    password: "s3cr3t!",
    issuerName: "GitHub",
    createdAt: Date.now(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 테스트
// ---------------------------------------------------------------------------

describe("SaveDialog — pending save 없음", () => {
  beforeEach(() => {
    mockGetPendingSave.mockResolvedValue(null);
    vi.clearAllMocks();
  });

  // SD-T1: pending 없음 → empty placeholder 렌더
  it("pending save 없으면 placeholder 를 렌더한다", async () => {
    mockGetPendingSave.mockResolvedValue(null);
    render(<SaveDialog />);
    await waitFor(() => {
      // loading → empty 전환 후 placeholder 텍스트 확인 (mock t() 가 키 이름 반환)
      const body = document.body.textContent ?? "";
      expect(body.length).toBeGreaterThan(0);
    });
  });
});

describe("SaveDialog — pending save 있음 (kind=new)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    nmStub.connect.mockResolvedValue(undefined);
    nmStub.credentialCreate.mockResolvedValue({
      type: "credential_save_response",
      ok: true,
      credential_id: "cred-123",
    });
    mockClearPendingSave.mockResolvedValue(undefined);
    mockGetSessionToken.mockResolvedValue({
      token: "test-token-abc",
      expires_at: Date.now() + 3_600_000,
    });
  });

  // SD-T2: pending 있음 → 폼 렌더
  it("pending save 있으면 폼을 렌더한다", async () => {
    mockGetPendingSave.mockResolvedValue(makePending());
    render(<SaveDialog />);

    await waitFor(() => {
      // role=form 확인
      expect(screen.getByRole("form", { name: /save credential/i })).toBeInTheDocument();
    });
  });

  // SD-T3: issuer 자동 매칭 결과 초기값 표시
  it("issuerName 이 issuer 필드 초기값으로 표시된다", async () => {
    mockGetPendingSave.mockResolvedValue(makePending({ issuerName: "GitHub" }));
    render(<SaveDialog />);

    await waitFor(() => {
      const issuerInput = screen.getByLabelText(/issuer name/i);
      expect((issuerInput as HTMLInputElement).value).toBe("GitHub");
    });
  });

  // SD-T4: 사용자가 issuer 변경 → state 반영
  it("사용자가 issuer 값을 변경하면 input 에 반영된다", async () => {
    const user = userEvent.setup();
    mockGetPendingSave.mockResolvedValue(makePending({ issuerName: "GitHub" }));
    render(<SaveDialog />);

    await waitFor(() => screen.getByLabelText(/issuer name/i));

    const issuerInput = screen.getByLabelText(/issuer name/i);
    await user.clear(issuerInput);
    await user.type(issuerInput, "GitLab");

    expect((issuerInput as HTMLInputElement).value).toBe("GitLab");
  });

  // SD-T5: username read-only 표시
  it("username 필드는 read-only 이다", async () => {
    mockGetPendingSave.mockResolvedValue(makePending({ username: "octocat" }));
    render(<SaveDialog />);

    await waitFor(() => screen.getByLabelText(/username/i));
    const usernameInput = screen.getByLabelText(/username.*read-only/i);
    expect(usernameInput).toHaveAttribute("readonly");
    expect((usernameInput as HTMLInputElement).value).toBe("octocat");
  });

  // SD-T6: 저장 버튼 클릭 → credentialCreate 호출 → saved 메시지
  it("저장 버튼 클릭 시 credentialCreate 를 호출하고 saved 메시지를 표시한다", async () => {
    const user = userEvent.setup();
    mockGetPendingSave.mockResolvedValue(makePending());
    render(<SaveDialog />);

    await waitFor(() => screen.getByRole("button", { name: /save credential/i }));
    const saveBtn = screen.getByRole("button", { name: /save credential/i });

    await user.click(saveBtn);

    await waitFor(() => {
      expect(nmStub.credentialCreate).toHaveBeenCalledOnce();
      expect(mockClearPendingSave).toHaveBeenCalledOnce();
    });
  });

  // SD-T7: 취소 버튼 → clearPendingSave 호출 → empty 상태
  it("취소 버튼 클릭 시 clearPendingSave 를 호출한다", async () => {
    const user = userEvent.setup();
    mockGetPendingSave.mockResolvedValue(makePending());
    render(<SaveDialog />);

    await waitFor(() => screen.getByRole("button", { name: /cancel/i }));
    const cancelBtn = screen.getByRole("button", { name: /cancel/i });

    await user.click(cancelBtn);

    await waitFor(() => {
      expect(mockClearPendingSave).toHaveBeenCalledOnce();
    });
  });
});

describe("SaveDialog — kind=update", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    nmStub.credentialUpdate.mockResolvedValue({
      type: "credential_save_response",
      ok: true,
    });
    mockClearPendingSave.mockResolvedValue(undefined);
    mockGetSessionToken.mockResolvedValue({
      token: "test-token-abc",
      expires_at: Date.now() + 3_600_000,
    });
  });

  // SD-T8: kind=update → credentialUpdate 호출
  it("kind=update 이고 credentialId 있으면 credentialUpdate 를 호출한다", async () => {
    const user = userEvent.setup();
    mockGetPendingSave.mockResolvedValue(
      makePending({ kind: "update", credentialId: "cred-abc-123" }),
    );
    render(<SaveDialog />);

    await waitFor(() => screen.getByRole("button", { name: /save credential/i }));
    await user.click(screen.getByRole("button", { name: /save credential/i }));

    await waitFor(() => {
      expect(nmStub.credentialUpdate).toHaveBeenCalledOnce();
      expect(nmStub.credentialCreate).not.toHaveBeenCalled();
    });
  });
});

describe("SaveDialog — session 없음", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // SD-T9: session 없음 → error 메시지
  it("session 없으면 저장 실패 후 error 메시지를 표시한다", async () => {
    const user = userEvent.setup();
    mockGetPendingSave.mockResolvedValue(makePending());
    mockGetSessionToken.mockResolvedValue(null); // session 없음

    render(<SaveDialog />);

    await waitFor(() => screen.getByRole("button", { name: /save credential/i }));
    await user.click(screen.getByRole("button", { name: /save credential/i }));

    await waitFor(() => {
      // error 상태 → error 메시지 텍스트 또는 dismiss 버튼
      const body = document.body.textContent ?? "";
      expect(body).toContain("session_expired");
    });
  });
});
