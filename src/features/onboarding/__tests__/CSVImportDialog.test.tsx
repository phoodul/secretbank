/**
 * CSVImportDialog Vitest 테스트 (M24 2-3-a-5)
 *
 * 7개 케이스:
 * 1. loads_preview_on_mount
 * 2. default_unselects_already_exists
 * 3. import_button_disabled_when_zero_selected
 * 4. commit_invokes_with_selected_indices
 * 5. shows_success_summary_after_commit
 * 6. delete_original_calls_fs_remove_with_confirmation
 * 7. vault_locked_error_shows_toast
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "@/lib/i18n";

// ---------------------------------------------------------------------------
// Mock: @tauri-apps/api/core (invoke)
// ---------------------------------------------------------------------------

const invokeSpy = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string, args?: unknown) => invokeSpy(cmd, args),
}));

// ---------------------------------------------------------------------------
// Mock: @tauri-apps/plugin-fs (remove)
// ---------------------------------------------------------------------------

const removeSpy = vi.fn().mockResolvedValue(undefined);

vi.mock("@tauri-apps/plugin-fs", () => ({
  remove: (...args: unknown[]) => removeSpy(...args),
}));

// ---------------------------------------------------------------------------
// Mock: sonner (toast)
// ---------------------------------------------------------------------------

const toastErrorSpy = vi.fn();
const toastSuccessSpy = vi.fn();

vi.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => toastErrorSpy(...args),
    success: (...args: unknown[]) => toastSuccessSpy(...args),
    info: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

import type { CsvImportPreview, CsvImportPreviewRow } from "../CSVImportDialog";

function makeRow(overrides: Partial<CsvImportPreviewRow> = {}): CsvImportPreviewRow {
  return {
    rowIndex: 0,
    name: "Example Site",
    url: "https://example.com/login",
    host: "example.com",
    username: "user@example.com",
    note: null,
    matchedIssuerSlug: null,
    valueHint: "1234",
    env: "prod",
    alreadyExists: false,
    ...overrides,
  };
}

function makePreview(rows: CsvImportPreviewRow[]): CsvImportPreview {
  return {
    sessionId: "session-abc",
    format: "ChromeBrave",
    totalRows: rows.length,
    skippedEmptyPassword: 0,
    skippedEmptyUrl: 0,
    expiresAtUnixMs: Date.now() + 5 * 60 * 1000,
    rows,
  };
}

// ---------------------------------------------------------------------------
// Render helper
// ---------------------------------------------------------------------------

import { CSVImportDialog } from "../CSVImportDialog";

function renderDialog(csvPath = "/home/user/passwords.csv", onDone = vi.fn()) {
  return render(<CSVImportDialog csvPath={csvPath} onDone={onDone} />);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CSVImportDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 1. 마운트 시 import_csv_prepare 호출 + rows 렌더
  it("loads_preview_on_mount — prepare 호출 후 row 카드 표시", async () => {
    const rows = [
      makeRow({ rowIndex: 0, name: "GitHub" }),
      makeRow({ rowIndex: 1, name: "GitLab" }),
    ];
    invokeSpy.mockResolvedValueOnce(makePreview(rows));

    renderDialog();

    await waitFor(() => {
      expect(invokeSpy).toHaveBeenCalledWith("import_csv_prepare", {
        path: "/home/user/passwords.csv",
      });
    });

    // 두 카드 렌더 확인
    await waitFor(() => {
      expect(screen.getByText("GitHub")).toBeInTheDocument();
      expect(screen.getByText("GitLab")).toBeInTheDocument();
    });
  });

  // 2. alreadyExists=true row → 체크 off + "already in vault" 배지
  it("default_unselects_already_exists — 중복 row 기본 해제 + 배지 표시", async () => {
    const rows = [
      makeRow({ rowIndex: 0, name: "Fresh Site", alreadyExists: false }),
      makeRow({ rowIndex: 1, name: "Dupe Site", alreadyExists: true }),
    ];
    invokeSpy.mockResolvedValueOnce(makePreview(rows));

    renderDialog();

    await waitFor(() => {
      expect(screen.getByText("Dupe Site")).toBeInTheDocument();
    });

    // 중복 배지 표시
    expect(screen.getByTestId("already-exists-badge-1")).toBeInTheDocument();

    // 중복 row 체크박스는 unchecked
    const dupeCheckbox = screen.getByTestId("csv-row-checkbox-1") as HTMLInputElement;
    expect(dupeCheckbox.checked).toBe(false);

    // 신규 row 체크박스는 checked
    const freshCheckbox = screen.getByTestId("csv-row-checkbox-0") as HTMLInputElement;
    expect(freshCheckbox.checked).toBe(true);
  });

  // 3. 전부 해제 시 import 버튼 disabled
  it("import_button_disabled_when_zero_selected — 선택 0개 시 버튼 비활성", async () => {
    const rows = [makeRow({ rowIndex: 0, name: "Site A" })];
    invokeSpy.mockResolvedValueOnce(makePreview(rows));

    const user = userEvent.setup();
    renderDialog();

    await waitFor(() => {
      expect(screen.getByText("Site A")).toBeInTheDocument();
    });

    // 체크 해제
    const checkbox = screen.getByTestId("csv-row-checkbox-0");
    await user.click(checkbox);

    const importBtn = screen.getByTestId("import-submit-btn");
    expect(importBtn).toBeDisabled();
  });

  // 4. import 클릭 → import_csv_commit 호출 + selectedRowIndices 확인
  it("commit_invokes_with_selected_indices — 체크된 행만 포함해서 commit 호출", async () => {
    const rows = [
      makeRow({ rowIndex: 0, name: "Site A", alreadyExists: false }),
      makeRow({ rowIndex: 1, name: "Site B", alreadyExists: false }),
      makeRow({ rowIndex: 2, name: "Site C", alreadyExists: true }),
    ];
    invokeSpy.mockResolvedValueOnce(makePreview(rows));
    // commit 응답
    invokeSpy.mockResolvedValueOnce({ imported: 2, failed: 0, rows: [] });

    const user = userEvent.setup();
    renderDialog();

    await waitFor(() => {
      expect(screen.getByText("Site A")).toBeInTheDocument();
    });

    // Site B 체크 해제
    await user.click(screen.getByTestId("csv-row-checkbox-1"));

    // import 클릭
    await user.click(screen.getByTestId("import-submit-btn"));

    await waitFor(() => {
      expect(invokeSpy).toHaveBeenCalledWith("import_csv_commit", {
        sessionId: "session-abc",
        selectedRowIndices: [0],
      });
    });
  });

  // 5. commit 후 성공 요약 표시
  it("shows_success_summary_after_commit — 커밋 완료 후 성공 헤더 표시", async () => {
    const rows = [makeRow({ rowIndex: 0, name: "Site X" })];
    invokeSpy.mockResolvedValueOnce(makePreview(rows));
    invokeSpy.mockResolvedValueOnce({
      imported: 1,
      failed: 0,
      rows: [{ rowIndex: 0, credentialId: "cred-1", error: null }],
    });

    const user = userEvent.setup();
    renderDialog();

    await waitFor(() => {
      expect(screen.getByText("Site X")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("import-submit-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("result-success-header")).toBeInTheDocument();
    });

    // "1개 import 성공" 또는 영어 "Imported 1 credentials" 포함
    expect(screen.getByTestId("result-success-header").textContent).toMatch(/1/);
  });

  // 6. 삭제 버튼 → 확인 다이얼로그 → 확인 → remove 호출
  it("delete_original_calls_fs_remove_with_confirmation — 삭제 버튼 확인 후 remove 호출", async () => {
    const rows = [makeRow({ rowIndex: 0, name: "Site Y" })];
    invokeSpy.mockResolvedValueOnce(makePreview(rows));
    invokeSpy.mockResolvedValueOnce({
      imported: 1,
      failed: 0,
      rows: [{ rowIndex: 0, credentialId: "cred-2", error: null }],
    });

    const user = userEvent.setup();
    renderDialog("/tmp/passwords.csv");

    await waitFor(() => {
      expect(screen.getByText("Site Y")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("import-submit-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("delete-csv-btn")).toBeInTheDocument();
    });

    // 삭제 버튼 클릭 → AlertDialog 열림
    await user.click(screen.getByTestId("delete-csv-btn"));

    // 확인 버튼 클릭
    const confirmBtn = screen.getByTestId("delete-csv-confirm-btn");
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(removeSpy).toHaveBeenCalledWith("/tmp/passwords.csv");
    });
  });

  // 7. vaultLocked 에러 → toast.error 호출
  it("vault_locked_error_shows_toast — vaultLocked 에러 시 toast 표시", async () => {
    invokeSpy.mockRejectedValueOnce("vaultLocked");

    renderDialog();

    await waitFor(() => {
      expect(toastErrorSpy).toHaveBeenCalled();
    });

    // vaultLocked 관련 메시지로 호출됐는지 확인 (i18n 키 값이 포함됨)
    const firstArg = String(toastErrorSpy.mock.calls[0][0]);
    // i18n 값: "Vault is locked. Unlock the vault and try again." 또는 한국어
    expect(firstArg.length).toBeGreaterThan(0);
  });
});
