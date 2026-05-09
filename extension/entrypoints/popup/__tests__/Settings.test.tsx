/**
 * @file Settings.test.tsx
 * @license AGPL-3.0-or-later
 *
 * B-7: Extension popup Settings 컴포넌트 테스트.
 *
 * 검증 항목:
 *   1. 렌더 — Session Timeout 섹션 heading 표시
 *   2. chrome.storage.local 에 캐시 없을 때 기본 배지 표시
 *   3. chrome.storage.local 에 캐시된 설정 읽어 배지 표시
 *   4. 데스크톱 앱 안내 텍스트 표시
 *   5. 접근성 — heading role 존재
 */

import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import Settings from "../Settings";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** chrome.storage.local.get 의 반환값을 교체하는 헬퍼 */
function mockStorageGet(data: Record<string, unknown>) {
  // @ts-ignore
  globalThis.chrome.storage.local.get = async (_keys: unknown) => data;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  // 기본: 빈 storage
  mockStorageGet({});
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Settings — Extension popup", () => {
  // 1. 렌더 — Session Timeout heading 표시
  it("Session Timeout 섹션 heading 이 렌더된다", async () => {
    render(<Settings />);

    await waitFor(() => {
      // i18n mock → 키 이름 그대로 반환
      // I18N_KEYS.SESSION_SETTINGS_TITLE = "session_settings_title"
      const heading = screen.getByRole("heading", { name: /session_settings_title/i });
      expect(heading).toBeInTheDocument();
    });
  });

  // 2. 캐시 없을 때 기본 배지 (hours4) 표시
  it("캐시된 설정이 없을 때 기본 배지(session_ttl_hours4)가 표시된다", async () => {
    mockStorageGet({});
    render(<Settings />);

    await waitFor(() => {
      // 기본 키 표시 (session_ttl_hours4)
      expect(screen.getByText(/session_ttl_hours4/i)).toBeInTheDocument();
    });
  });

  // 3. 캐시된 설정 반영
  it("캐시된 설정 mins30 이 배지로 표시된다", async () => {
    mockStorageGet({ session_settings: { ttl: "mins30" } });
    render(<Settings />);

    await waitFor(() => {
      expect(screen.getByText(/session_ttl_mins30/i)).toBeInTheDocument();
    });
  });

  // 4. 데스크톱 앱 안내 텍스트 표시
  it("데스크톱 앱에서 설정 변경 안내 텍스트가 표시된다", async () => {
    render(<Settings />);

    await waitFor(() => {
      expect(screen.getByText(/desktop app|secretbank/i)).toBeInTheDocument();
    });
  });

  // 5. 접근성 — section heading role
  it("섹션 heading 의 role=heading 이 존재한다", async () => {
    render(<Settings />);

    await waitFor(() => {
      const headings = screen.getAllByRole("heading");
      expect(headings.length).toBeGreaterThan(0);
    });
  });
});
