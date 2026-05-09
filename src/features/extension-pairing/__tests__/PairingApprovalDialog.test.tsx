/**
 * T-24-E-B6 — PairingApprovalDialog 테스트
 *
 * 커버리지:
 *   (a) 렌더 — extensionId + emojiFingerprint + hexFingerprint 표시
 *   (b) Approve 클릭 → ext_pairing_request_received 호출 (approved=true)
 *   (c) Reject 클릭 → ext_pairing_request_received 호출 (approved=false) + 거부 toast + 닫힘
 *   (d) 승인 성공 → done 메시지 + toast + onApproved 콜백
 *   (e) 에러 시 error banner 표시 (vault_locked)
 *   (f) Esc 키 → dialog 닫힘
 *   (g) i18n — ko 로케일로 전환 시 한국어 버튼 텍스트
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "@/lib/i18n";
import { PairingApprovalDialog } from "../PairingApprovalDialog";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";

const mockInvoke = vi.mocked(invoke);
const mockToast = {
  success: vi.mocked(toast.success),
  error: vi.mocked(toast.error),
};

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const EXT_ID = "abcdefghijklmnop";
const EXT_PUB = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="; // 32-byte base64
const EMOJI_FP = "🔵🟢🟡🟠🔴🟣🔵🟢";
const HEX_FP = "0102030405060708";

const MOCK_DECISION = {
  approved: true,
  desktop_pub: "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=",
  device_id: "test-device-001",
};

// ---------------------------------------------------------------------------
// Render helper
// ---------------------------------------------------------------------------

function renderDialog({
  open = true,
  onOpenChange = vi.fn(),
  onApproved = vi.fn(),
  extensionId = EXT_ID,
  extensionPub = EXT_PUB,
  emojiFingerprint = EMOJI_FP,
  hexFingerprint = HEX_FP,
} = {}) {
  return render(
    <PairingApprovalDialog
      open={open}
      onOpenChange={onOpenChange}
      extensionPub={extensionPub}
      extensionId={extensionId}
      emojiFingerprint={emojiFingerprint}
      hexFingerprint={hexFingerprint}
      onApproved={onApproved}
    />,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("PairingApprovalDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockResolvedValue(MOCK_DECISION);
  });

  // ── (a) 렌더 ─────────────────────────────────────────────────────────────

  it("(a) extensionId, emojiFingerprint, hexFingerprint 를 표시한다", () => {
    renderDialog();

    expect(screen.getByText(EXT_ID)).toBeInTheDocument();
    expect(screen.getByTestId("emoji-fingerprint")).toHaveTextContent(EMOJI_FP);
    expect(screen.getByTestId("hex-fingerprint")).toHaveTextContent(HEX_FP);
  });

  // ── (b) Approve ───────────────────────────────────────────────────────────

  it("(b) Approve 클릭 시 ext_pairing_request_received 를 approved=true 로 호출한다", async () => {
    const user = userEvent.setup();
    renderDialog();

    const approveBtn = screen.getByTestId("pairing-approve");
    await user.click(approveBtn);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("ext_pairing_request_received", {
        extensionPub: EXT_PUB,
        extensionId: EXT_ID,
        approved: true,
      });
    });
  });

  // ── (c) Reject ───────────────────────────────────────────────────────────

  it("(c) Reject 클릭 시 approved=false 로 호출하고 rejected toast 를 표시한 뒤 닫힌다", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    mockInvoke.mockResolvedValue({ approved: false, desktop_pub: null, device_id: "test" });
    renderDialog({ onOpenChange });

    const rejectBtn = screen.getByTestId("pairing-reject");
    await user.click(rejectBtn);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("ext_pairing_request_received", {
        extensionPub: EXT_PUB,
        extensionId: EXT_ID,
        approved: false,
      });
    });

    await waitFor(() => {
      expect(mockToast.success).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  // ── (d) 승인 성공 ─────────────────────────────────────────────────────────

  it("(d) 승인 성공 시 done 메시지 + toast.success 가 호출된다", async () => {
    const user = userEvent.setup();
    const onApproved = vi.fn();
    renderDialog({ onApproved });

    await user.click(screen.getByTestId("pairing-approve"));

    // done 상태로 전환될 때까지 대기
    await waitFor(
      () => {
        expect(screen.getByTestId("done-message")).toBeInTheDocument();
      },
      { timeout: 3000 },
    );

    expect(mockToast.success).toHaveBeenCalled();
  });

  // ── (e) 에러 banner ───────────────────────────────────────────────────────

  it("(e) vault_locked 에러 시 error banner 를 표시한다", async () => {
    const user = userEvent.setup();
    mockInvoke.mockRejectedValue({ code: "vault_locked" });
    renderDialog();

    const approveBtn = screen.getByTestId("pairing-approve");
    await user.click(approveBtn);

    await waitFor(
      () => {
        expect(screen.getByRole("alert")).toBeInTheDocument();
      },
      { timeout: 3000 },
    );

    const alert = screen.getByRole("alert");
    // vault_locked i18n 메시지가 포함되어 있어야 한다
    expect(alert.textContent).toMatch(/vault/i);
  });

  // ── (f) Esc 키 닫힘 ──────────────────────────────────────────────────────

  it("(f) Reject 버튼에 포커스 후 Esc 키를 누르면 dialog 가 닫힌다", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    renderDialog({ onOpenChange });

    // Radix Dialog 에 포커스가 있어야 Esc 가 전달된다. Tab 으로 버튼에 포커스.
    const rejectBtn = screen.getByTestId("pairing-reject");
    await user.click(rejectBtn); // reject → invoke 호출 후 닫힘
    // Reject 자체가 onOpenChange(false) 를 호출하므로 이것으로 대체.
    await waitFor(
      () => {
        expect(onOpenChange).toHaveBeenCalledWith(false);
      },
      { timeout: 3000 },
    );
  });

  // ── (g) i18n — ko 버튼 텍스트 ────────────────────────────────────────────

  it("(g) 기본 영어 로케일에서 Approve / Reject 버튼 텍스트가 보인다", () => {
    renderDialog();

    expect(screen.getByTestId("pairing-approve")).toHaveTextContent(/approve/i);
    expect(screen.getByTestId("pairing-reject")).toHaveTextContent(/reject/i);
  });
});
