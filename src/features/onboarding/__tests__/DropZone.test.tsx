import { render, screen, act, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

// i18n 초기화
import "@/lib/i18n";

// ----- mock: usePlatform -----
vi.mock("@/lib/platform", () => ({
  usePlatform: vi.fn(),
  getPlatform: vi.fn(() => "desktop"),
}));

// ----- mock: @tauri-apps/api/webview -----
type DragDropHandler = (event: { payload: DragDropPayload }) => void;
type DragDropPayload =
  | { type: "enter"; paths: string[]; position: { x: number; y: number } }
  | { type: "over"; position: { x: number; y: number } }
  | { type: "drop"; paths: string[]; position: { x: number; y: number } }
  | { type: "leave" };

let capturedHandler: DragDropHandler | null = null;
const unlistenSpy = vi.fn();

vi.mock("@tauri-apps/api/webview", () => ({
  getCurrentWebview: () => ({
    onDragDropEvent: vi.fn((cb: DragDropHandler) => {
      capturedHandler = cb;
      return Promise.resolve(unlistenSpy);
    }),
  }),
}));

// ----- mock: react-router-dom useNavigate -----
const navigateSpy = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...actual,
    useNavigate: () => navigateSpy,
  };
});

// ----- mock: sonner -----
const toastInfoSpy = vi.fn();
vi.mock("sonner", () => ({
  toast: { info: vi.fn((...args: unknown[]) => toastInfoSpy(...args)) },
}));

import { usePlatform } from "@/lib/platform";
import { DropZone } from "../DropZone";

const mockUsePlatform = vi.mocked(usePlatform);

function renderDropZone() {
  return render(
    <MemoryRouter>
      <DropZone />
    </MemoryRouter>,
  );
}

describe("DropZone", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedHandler = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -----------------------------------------------------------------------
  // 1. web 플랫폼 → null 렌더
  // -----------------------------------------------------------------------
  it("usePlatform='web'이면 오버레이 DOM이 없다", async () => {
    mockUsePlatform.mockReturnValue("web");
    renderDropZone();

    // handler가 캡처되지 않아야 함
    await waitFor(() => {
      expect(capturedHandler).toBeNull();
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  // -----------------------------------------------------------------------
  // 2. desktop → onDragDropEvent 구독 호출
  // -----------------------------------------------------------------------
  it("usePlatform='desktop'이면 onDragDropEvent 구독이 호출된다", async () => {
    mockUsePlatform.mockReturnValue("desktop");
    renderDropZone();

    await waitFor(() => {
      expect(capturedHandler).not.toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // 3. enter 이벤트 → 오버레이 표시
  // -----------------------------------------------------------------------
  it("'enter' 이벤트 수신 시 오버레이가 표시된다", async () => {
    mockUsePlatform.mockReturnValue("desktop");
    renderDropZone();

    await waitFor(() => expect(capturedHandler).not.toBeNull());

    act(() => {
      capturedHandler!({
        payload: { type: "enter", paths: [], position: { x: 0, y: 0 } },
      });
    });

    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  // -----------------------------------------------------------------------
  // 4. leave 이벤트 → 오버레이 숨김
  // -----------------------------------------------------------------------
  it("'leave' 이벤트 수신 시 오버레이가 사라진다", async () => {
    mockUsePlatform.mockReturnValue("desktop");
    renderDropZone();

    await waitFor(() => expect(capturedHandler).not.toBeNull());

    // 먼저 enter로 오버레이 표시
    act(() => {
      capturedHandler!({
        payload: { type: "enter", paths: [], position: { x: 0, y: 0 } },
      });
    });
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    // leave로 숨김
    act(() => {
      capturedHandler!({ payload: { type: "leave" } });
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  // -----------------------------------------------------------------------
  // 5. drop 이벤트 with paths → navigate 호출
  // -----------------------------------------------------------------------
  it("'drop' 이벤트 with paths=['/some/path'] → navigate('/onboarding/scan?path=...')", async () => {
    mockUsePlatform.mockReturnValue("desktop");
    renderDropZone();

    await waitFor(() => expect(capturedHandler).not.toBeNull());

    act(() => {
      capturedHandler!({
        payload: { type: "drop", paths: ["/some/path"], position: { x: 0, y: 0 } },
      });
    });

    expect(navigateSpy).toHaveBeenCalledWith(
      `/onboarding/scan?path=${encodeURIComponent("/some/path")}`,
    );
  });

  // -----------------------------------------------------------------------
  // 6. drop 이벤트 with paths=[] → navigate 미호출
  // -----------------------------------------------------------------------
  it("'drop' 이벤트 with paths=[] → navigate 미호출", async () => {
    mockUsePlatform.mockReturnValue("desktop");
    renderDropZone();

    await waitFor(() => expect(capturedHandler).not.toBeNull());

    act(() => {
      capturedHandler!({
        payload: { type: "drop", paths: [], position: { x: 0, y: 0 } },
      });
    });

    expect(navigateSpy).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // 7. unmount 시 unlisten 호출 (cleanup)
  // -----------------------------------------------------------------------
  it("unmount 시 unlisten이 호출된다", async () => {
    mockUsePlatform.mockReturnValue("desktop");
    const { unmount } = renderDropZone();

    await waitFor(() => expect(capturedHandler).not.toBeNull());

    unmount();

    expect(unlistenSpy).toHaveBeenCalledTimes(1);
  });

  // -----------------------------------------------------------------------
  // 8. 웹 표준 dragover → preventDefault 호출
  // jsdom에서 DragEvent가 미구현이므로 MouseEvent로 대체하여 검증
  // -----------------------------------------------------------------------
  it("desktop 플랫폼에서 window dragover 이벤트에 preventDefault가 호출된다", async () => {
    mockUsePlatform.mockReturnValue("desktop");
    renderDropZone();

    await waitFor(() => expect(capturedHandler).not.toBeNull());

    // jsdom은 DragEvent를 구현하지 않으므로 Event로 simulate
    let prevented = false;
    const event = new Event("dragover", { cancelable: true, bubbles: true });
    const originalPreventDefault = event.preventDefault.bind(event);
    event.preventDefault = () => {
      prevented = true;
      originalPreventDefault();
    };
    window.dispatchEvent(event);

    expect(prevented).toBe(true);
  });
});
