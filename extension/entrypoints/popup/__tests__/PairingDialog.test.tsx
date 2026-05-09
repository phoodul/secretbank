/**
 * @file PairingDialog.test.tsx
 * @license AGPL-3.0-or-later
 *
 * B-5: PairingDialog 4단계 상태 렌더 + 흐름 테스트.
 *
 * 설계:
 *   vi.hoisted() 로 공유 stub 객체를 팩토리보다 먼저 초기화한 뒤,
 *   vi.mock 팩토리에서 생성자가 호출될 때 공유 객체의 메서드를 this 에 복사.
 *   각 테스트에서 공유 객체의 메서드를 교체하면 다음 new 호출 결과가 달라진다.
 *
 * 검증 항목:
 *   1. uninitialized — 페어링 시작 버튼 표시 + type=button
 *   2. pending — 스피너(role=status) + pairing_pending 메시지
 *   3. paired — pairing_paired + 디바이스 ID + 재페어링 버튼
 *   4. error 4종 (not_installed / rejected / timeout / protocol)
 *   5. 스토리지 복원 → paired 상태
 *   6. 재페어링 버튼 → uninitialized 리셋
 *   7. 흐름 통합 (connect / sendMessage / saveToStorage 호출 검증)
 */

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PairingDialog from "../PairingDialog";
import { NMNotInstalled } from "../../../lib/nm-errors";

// ---------------------------------------------------------------------------
// vi.hoisted — 팩토리보다 먼저 실행되어 공유 객체를 초기화
// ---------------------------------------------------------------------------

const { nmStub, sessionStub } = vi.hoisted(() => {
  const nmStub = {
    connect: vi.fn().mockResolvedValue(undefined),
    sendMessage: vi.fn().mockResolvedValue(undefined),
    onMessage: vi.fn().mockReturnValue(() => {}),
    onDisconnect: vi.fn().mockReturnValue(() => {}),
    disconnect: vi.fn(),
    isConnected: vi.fn().mockReturnValue(true),
  };

  const sessionStub = {
    buildInitMessage: vi.fn().mockReturnValue({
      type: "init",
      extension_id: "test-ext",
      version: "1.0.0",
      ext_pub: "dGVzdA==",
    }),
    processPairedMessage: vi.fn(),
    getPrivateKeyB64: vi.fn().mockReturnValue("dGVzdC1wcml2"),
    desktopPublicKeyB64: "dGVzdC1wdWI=" as string | null,
    pairedDeviceId: "dev-123" as string | null,
    isPaired: true,
    extPublicKeyB64: "dGVzdC1leHRwdWI=",
  };

  return { nmStub, sessionStub };
});

// ---------------------------------------------------------------------------
// 모듈 mock — 팩토리에서 hoisted 공유 객체를 사용
// ---------------------------------------------------------------------------

vi.mock("../../../lib/nm-client", () => ({
  NMClient: vi.fn(function (this: typeof nmStub) {
    // new NMClient() 호출 시 현재 nmStub 상태를 this 에 복사
    this.connect = nmStub.connect;
    this.sendMessage = nmStub.sendMessage;
    this.onMessage = nmStub.onMessage;
    this.onDisconnect = nmStub.onDisconnect;
    this.disconnect = nmStub.disconnect;
    this.isConnected = nmStub.isConnected;
  }),
}));

vi.mock("../../../lib/pairing", () => ({
  PairingSession: vi.fn(function (this: typeof sessionStub) {
    this.buildInitMessage = sessionStub.buildInitMessage;
    this.processPairedMessage = sessionStub.processPairedMessage;
    this.getPrivateKeyB64 = sessionStub.getPrivateKeyB64;
    this.desktopPublicKeyB64 = sessionStub.desktopPublicKeyB64;
    this.pairedDeviceId = sessionStub.pairedDeviceId;
    this.isPaired = sessionStub.isPaired;
    this.extPublicKeyB64 = sessionStub.extPublicKeyB64;
  }),
  parsePairedMessage: vi.fn(),
  restoreFromStorage: vi.fn(),
  saveToStorage: vi.fn(),
  clearStorage: vi.fn(),
}));

// ---------------------------------------------------------------------------
// mock import
// ---------------------------------------------------------------------------
import {
  parsePairedMessage,
  restoreFromStorage,
  saveToStorage,
  clearStorage,
} from "../../../lib/pairing";

// ---------------------------------------------------------------------------
// 헬퍼 — 마이크로태스크 flush
// ---------------------------------------------------------------------------

/**
 * 마이크로태스크 큐를 비운다.
 * fake timer 환경에서는 setTimeout 이 차단되므로 queueMicrotask 기반으로 구현.
 * await Promise.resolve() 를 여러 번 반복해 깊은 체인도 flush 한다.
 */
async function flushMicrotasks(depth = 5) {
  for (let i = 0; i < depth; i++) {
    await Promise.resolve();
  }
}

// ---------------------------------------------------------------------------
// 헬퍼 — nmStub 메서드를 교체하는 shorthand
// ---------------------------------------------------------------------------

function setNMStub(overrides: Partial<typeof nmStub>) {
  Object.assign(nmStub, overrides);
}

function resetNMStub() {
  nmStub.connect = vi.fn().mockResolvedValue(undefined);
  nmStub.sendMessage = vi.fn().mockResolvedValue(undefined);
  nmStub.onMessage = vi.fn().mockReturnValue(() => {});
  nmStub.onDisconnect = vi.fn().mockReturnValue(() => {});
  nmStub.disconnect = vi.fn();
  nmStub.isConnected = vi.fn().mockReturnValue(true);
}

function resetSessionStub() {
  sessionStub.buildInitMessage = vi.fn().mockReturnValue({
    type: "init",
    extension_id: "test-ext",
    version: "1.0.0",
    ext_pub: "dGVzdA==",
  });
  sessionStub.processPairedMessage = vi.fn();
  sessionStub.getPrivateKeyB64 = vi.fn().mockReturnValue("dGVzdC1wcml2");
  sessionStub.desktopPublicKeyB64 = "dGVzdC1wdWI=";
  sessionStub.pairedDeviceId = "dev-123";
  sessionStub.isPaired = true;
}

// ---------------------------------------------------------------------------
// beforeEach / afterEach
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  resetNMStub();
  resetSessionStub();

  vi.mocked(restoreFromStorage).mockResolvedValue(null);
  vi.mocked(clearStorage).mockResolvedValue(undefined);
  vi.mocked(saveToStorage).mockResolvedValue(undefined);
  vi.mocked(parsePairedMessage).mockImplementation(
    (msg) => msg as ReturnType<typeof parsePairedMessage>,
  );

  // 타이머는 실제 타이머 사용 — userEvent 가 fake timer 와 호환되지 않음
});

afterEach(() => {
  // 타이머 정리 없음 — 실제 타이머 사용
});

// ---------------------------------------------------------------------------
// 1. uninitialized 상태 렌더
// ---------------------------------------------------------------------------

describe("PairingDialog — uninitialized 상태", () => {
  it("페어링 시작 버튼이 렌더된다", async () => {
    render(<PairingDialog />);
    await act(async () => {
      await flushMicrotasks();
    });
    expect(screen.getByRole("button", { name: /pairing_start/i })).toBeInTheDocument();
  });

  it("페어링 시작 버튼이 type=button 이다 (키보드 접근성)", async () => {
    render(<PairingDialog />);
    await act(async () => {
      await flushMicrotasks();
    });
    expect(screen.getByRole("button", { name: /pairing_start/i })).toHaveAttribute(
      "type",
      "button",
    );
  });

  it("스토리지에 기존 페어링 정보가 있으면 paired 상태로 복원된다", async () => {
    vi.mocked(restoreFromStorage).mockResolvedValue({
      extensionPriv: "priv",
      desktopPub: "pub",
      deviceId: "restored-device",
      pairedAt: 1700000000000,
    });

    render(<PairingDialog />);
    await act(async () => {
      await flushMicrotasks();
    });

    expect(screen.getByText(/pairing_paired/i)).toBeInTheDocument();
    expect(screen.getByText("restored-device")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 2. pending 상태 렌더
// ---------------------------------------------------------------------------

describe("PairingDialog — pending 상태", () => {
  it("페어링 시작 버튼 클릭 후 스피너(role=status)가 표시된다", async () => {
    // connect 가 영원히 pending
    setNMStub({ connect: vi.fn().mockReturnValue(new Promise(() => {})) });

    const user = userEvent.setup();
    render(<PairingDialog />);
    await act(async () => {
      await flushMicrotasks();
    });

    await user.click(screen.getByRole("button", { name: /pairing_start/i }));

    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("pending 상태에서 pairing_pending 메시지가 표시된다", async () => {
    setNMStub({ connect: vi.fn().mockReturnValue(new Promise(() => {})) });

    const user = userEvent.setup();
    render(<PairingDialog />);
    await act(async () => {
      await flushMicrotasks();
    });

    await user.click(screen.getByRole("button", { name: /pairing_start/i }));

    expect(screen.getByText(/pairing_pending/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 3. paired 상태 렌더
// ---------------------------------------------------------------------------

describe("PairingDialog — paired 상태", () => {
  it("paired 메시지 수신 후 pairing_paired 와 디바이스 ID 가 표시된다", async () => {
    let capturedHandler: ((msg: unknown) => void) | null = null;
    setNMStub({
      onMessage: vi.fn().mockImplementation((handler: (msg: unknown) => void) => {
        capturedHandler = handler;
        return () => {};
      }),
    });

    vi.mocked(parsePairedMessage).mockReturnValue({
      type: "paired",
      desktop_pub: "dGVzdC1wdWI=",
      device_id: "desktop-dev-42",
    });

    const user = userEvent.setup();
    render(<PairingDialog />);
    await act(async () => {
      await flushMicrotasks();
    });

    await user.click(screen.getByRole("button", { name: /pairing_start/i }));
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      capturedHandler?.({
        type: "paired",
        desktop_pub: "dGVzdC1wdWI=",
        device_id: "desktop-dev-42",
      });
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByText(/pairing_paired/i)).toBeInTheDocument();
    expect(screen.getByText("desktop-dev-42")).toBeInTheDocument();
  });

  it("재페어링 버튼이 paired 상태에서 표시된다", async () => {
    vi.mocked(restoreFromStorage).mockResolvedValue({
      extensionPriv: "priv",
      desktopPub: "pub",
      deviceId: "dev-xyz",
      pairedAt: 1700000000000,
    });

    render(<PairingDialog />);
    await act(async () => {
      await flushMicrotasks();
    });

    expect(screen.getByRole("button", { name: /pairing_repair_button/i })).toBeInTheDocument();
  });

  it("재페어링 버튼 클릭 후 uninitialized 상태로 리셋된다", async () => {
    vi.mocked(restoreFromStorage).mockResolvedValue({
      extensionPriv: "priv",
      desktopPub: "pub",
      deviceId: "dev-xyz",
      pairedAt: 1700000000000,
    });

    const user = userEvent.setup();
    render(<PairingDialog />);
    await act(async () => {
      await flushMicrotasks();
    });

    await user.click(screen.getByRole("button", { name: /pairing_repair_button/i }));

    expect(screen.getByRole("button", { name: /pairing_start/i })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 4. error 상태 렌더
// ---------------------------------------------------------------------------

describe("PairingDialog — error 상태", () => {
  it("NMNotInstalled → pairing_error_not_installed 표시", async () => {
    setNMStub({ connect: vi.fn().mockRejectedValue(new NMNotInstalled()) });

    const user = userEvent.setup();
    render(<PairingDialog />);
    await act(async () => {
      await flushMicrotasks();
    });

    await user.click(screen.getByRole("button", { name: /pairing_start/i }));
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/pairing_error_not_installed/i)).toBeInTheDocument();
  });

  it("pair_response(approved=false) → pairing_error_rejected 표시", async () => {
    let capturedHandler: ((msg: unknown) => void) | null = null;
    setNMStub({
      onMessage: vi.fn().mockImplementation((handler: (msg: unknown) => void) => {
        capturedHandler = handler;
        return () => {};
      }),
    });

    const user = userEvent.setup();
    render(<PairingDialog />);
    await act(async () => {
      await flushMicrotasks();
    });

    await user.click(screen.getByRole("button", { name: /pairing_start/i }));
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      capturedHandler?.({ type: "pair_response", approved: false });
    });

    expect(screen.getByText(/pairing_error_rejected/i)).toBeInTheDocument();
  });

  it("타임아웃(30s) → pairing_error_timeout 표시", async () => {
    // 이 테스트만 fake timer 사용 — 30초를 실제로 기다리지 않기 위해
    vi.useFakeTimers();
    setNMStub({ onMessage: vi.fn().mockReturnValue(() => {}) });

    try {
      render(<PairingDialog />);
      await act(async () => {
        await flushMicrotasks();
      });

      // fake timer 환경에서는 userEvent 대신 fireEvent 사용
      const { fireEvent } = await import("@testing-library/react");
      const btn = screen.getByRole("button", { name: /pairing_start/i });
      await act(async () => {
        fireEvent.click(btn);
        await flushMicrotasks();
      });

      // 30초 타임아웃 발화
      await act(async () => {
        vi.advanceTimersByTime(30_000);
        await flushMicrotasks();
      });

      expect(screen.getByText(/pairing_error_timeout/i)).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("메시지 형식 오류(parsePairedMessage throw) → pairing_error_protocol 표시", async () => {
    let capturedHandler: ((msg: unknown) => void) | null = null;
    setNMStub({
      onMessage: vi.fn().mockImplementation((handler: (msg: unknown) => void) => {
        capturedHandler = handler;
        return () => {};
      }),
    });
    vi.mocked(parsePairedMessage).mockImplementation(() => {
      throw new Error("형식 오류");
    });

    const user = userEvent.setup();
    render(<PairingDialog />);
    await act(async () => {
      await flushMicrotasks();
    });

    await user.click(screen.getByRole("button", { name: /pairing_start/i }));
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      capturedHandler?.({ type: "paired", desktop_pub: "BAD", device_id: "dev" });
    });

    expect(screen.getByText(/pairing_error_protocol/i)).toBeInTheDocument();
  });

  it("error 상태에서 재시도 버튼(pairing_start)이 표시된다", async () => {
    setNMStub({ connect: vi.fn().mockRejectedValue(new NMNotInstalled()) });

    const user = userEvent.setup();
    render(<PairingDialog />);
    await act(async () => {
      await flushMicrotasks();
    });

    await user.click(screen.getByRole("button", { name: /pairing_start/i }));
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByRole("button", { name: /pairing_start/i })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 5. 흐름 통합 테스트
// ---------------------------------------------------------------------------

describe("PairingDialog — 흐름 통합", () => {
  it("시작 버튼 클릭 → NMClient.connect() 호출", async () => {
    const connectSpy = vi.fn().mockReturnValue(new Promise(() => {}));
    setNMStub({ connect: connectSpy });

    const user = userEvent.setup();
    render(<PairingDialog />);
    await act(async () => {
      await flushMicrotasks();
    });

    await user.click(screen.getByRole("button", { name: /pairing_start/i }));

    expect(connectSpy).toHaveBeenCalledTimes(1);
  });

  it("connect 성공 후 init 메시지를 sendMessage 로 전송한다", async () => {
    const sendSpy = vi.fn().mockResolvedValue(undefined);
    setNMStub({ sendMessage: sendSpy });

    const user = userEvent.setup();
    render(<PairingDialog />);
    await act(async () => {
      await flushMicrotasks();
    });

    await user.click(screen.getByRole("button", { name: /pairing_start/i }));
    await act(async () => {
      await Promise.resolve();
    });

    expect(sendSpy).toHaveBeenCalledWith(expect.objectContaining({ type: "init" }));
  });

  it("paired 수신 후 saveToStorage 를 호출한다", async () => {
    let capturedHandler: ((msg: unknown) => void) | null = null;
    setNMStub({
      onMessage: vi.fn().mockImplementation((handler: (msg: unknown) => void) => {
        capturedHandler = handler;
        return () => {};
      }),
    });

    vi.mocked(parsePairedMessage).mockReturnValue({
      type: "paired",
      desktop_pub: "dGVzdC1wdWI=",
      device_id: "save-test-dev",
    });

    const user = userEvent.setup();
    render(<PairingDialog />);
    await act(async () => {
      await flushMicrotasks();
    });

    await user.click(screen.getByRole("button", { name: /pairing_start/i }));
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      capturedHandler?.({
        type: "paired",
        desktop_pub: "dGVzdC1wdWI=",
        device_id: "save-test-dev",
      });
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(vi.mocked(saveToStorage)).toHaveBeenCalledTimes(1);
  });
});
