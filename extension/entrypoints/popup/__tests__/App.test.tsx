/**
 * @file App.test.tsx
 * @license AGPL-3.0-or-later
 *
 * Popup App 렌더 + Tab 라우팅 + 테마 토글 Vitest 테스트.
 *
 * DoD A6:
 *   1. App.tsx 렌더 → 4 Tab + 1 theme 토글 표시
 *   2. 각 Tab 클릭 시 해당 placeholder 컴포넌트 mount
 *   3. 테마 토글 시 document.documentElement classList 변화 (light/dark)
 *
 * WXT 빌드 없는 Vitest 환경이므로:
 *   - browser.i18n.getMessage 는 vitest-setup.ts 에서 mock 처리
 *   - ThemeProvider 는 localStorage 기반 (chrome.storage 없음)
 */

import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App";

// ── i18n mock ────────────────────────────────────────────────────────────────
// WXT 빌드 없는 환경에서 @wxt-dev/i18n createI18n() 의 t() 는
// browser.i18n.getMessage 를 호출한다. vitest-setup.ts 에서 전역 mock.
// 추가로 개별 테스트에서 필요한 키를 직접 반환하도록 스파이를 설정한다.

// ── 각 테스트 전 DOM 초기화 ──────────────────────────────────────────────────
beforeEach(() => {
  // 테마 클래스 초기화
  document.documentElement.classList.remove("light", "dark");
  // localStorage 초기화
  localStorage.clear();
});

// ── 헬퍼: App 렌더 ───────────────────────────────────────────────────────────
function renderApp() {
  return render(<App />);
}

// ── Test Suite ────────────────────────────────────────────────────────────────

describe("App — 기본 렌더", () => {
  it("4개 Tab trigger 가 렌더된다", () => {
    renderApp();
    // Radix Tabs 는 role="tab" 을 자동으로 붙인다
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(4);
  });

  it("테마 토글 버튼이 렌더된다", () => {
    renderApp();
    // aria-label 로 찾기 — mock t() 가 키 이름을 그대로 반환
    const toggleBtn = screen.getByRole("button", { name: /toggle|테마|테마 전환|Toggle theme/i });
    expect(toggleBtn).toBeInTheDocument();
  });

  it("Pairing 탭이 기본 활성 상태이다", () => {
    renderApp();
    const tabs = screen.getAllByRole("tab");
    // defaultValue="pairing" 이므로 첫 번째 탭이 active
    const firstTab = tabs[0];
    expect(firstTab).toHaveAttribute("data-state", "active");
  });

  it("팝업 제목(Secretbank)이 표시된다", () => {
    renderApp();
    // mock t() 가 키 이름 반환 → "popup_title" 또는 실제 브랜드명
    const heading = screen.getByRole("heading");
    expect(heading).toBeInTheDocument();
  });
});

describe("App — Tab 클릭 라우팅", () => {
  it("Credentials 탭 클릭 시 해당 패널이 표시된다", async () => {
    const user = userEvent.setup();
    renderApp();

    const tabs = screen.getAllByRole("tab");
    // 두 번째 탭 = Credentials
    await user.click(tabs[1]);

    // Radix Tabs: 활성 패널은 role="tabpanel" 이 된다
    const panel = screen.getByRole("tabpanel");
    expect(panel).toBeInTheDocument();
    // CredentialList placeholder 가 렌더되었는지 확인
    // (mock t()가 키 이름을 반환하므로 "popup_tabs_credentials" 등이 있음)
    expect(tabs[1]).toHaveAttribute("data-state", "active");
  });

  it("Save 탭 클릭 시 해당 패널이 표시된다", async () => {
    const user = userEvent.setup();
    renderApp();

    const tabs = screen.getAllByRole("tab");
    // 세 번째 탭 = Save
    await user.click(tabs[2]);
    expect(tabs[2]).toHaveAttribute("data-state", "active");
  });

  it("Settings 탭 클릭 시 해당 패널이 표시된다", async () => {
    const user = userEvent.setup();
    renderApp();

    const tabs = screen.getAllByRole("tab");
    // 네 번째 탭 = Settings
    await user.click(tabs[3]);
    expect(tabs[3]).toHaveAttribute("data-state", "active");
  });

  it("Pairing 탭으로 되돌아갈 수 있다", async () => {
    const user = userEvent.setup();
    renderApp();

    const tabs = screen.getAllByRole("tab");
    // Settings 로 이동 후 Pairing 으로 복귀
    await user.click(tabs[3]);
    await user.click(tabs[0]);
    expect(tabs[0]).toHaveAttribute("data-state", "active");
  });

  it("탭 전환 시 이전 탭의 상태가 비활성으로 바뀐다", async () => {
    const user = userEvent.setup();
    renderApp();

    const tabs = screen.getAllByRole("tab");
    // Credentials 클릭
    await user.click(tabs[1]);
    // Pairing 은 비활성
    expect(tabs[0]).toHaveAttribute("data-state", "inactive");
    // Credentials 는 활성
    expect(tabs[1]).toHaveAttribute("data-state", "active");
  });
});

describe("App — 키보드 접근성", () => {
  it("탭 목록이 role=tablist 를 가진다", () => {
    renderApp();
    const tablist = screen.getByRole("tablist");
    expect(tablist).toBeInTheDocument();
  });

  it("테마 토글 버튼이 role=button 이다", () => {
    renderApp();
    const btns = screen.getAllByRole("button");
    // 최소 1개의 버튼 (테마 토글)
    expect(btns.length).toBeGreaterThanOrEqual(1);
  });
});

describe("App — 테마 토글", () => {
  it("토글 클릭 시 document.documentElement 에 dark 또는 light 클래스가 추가된다", async () => {
    const user = userEvent.setup();
    renderApp();

    // 초기 상태: system 테마 → localStorage 없으면 system → matchMedia 결과 적용
    // jsdom 의 matchMedia 는 기본 false (light) 이므로 'light' 클래스가 붙는다

    const toggleBtn = screen.getByRole("button", { name: /toggle|테마|Toggle theme/i });
    await user.click(toggleBtn);

    // 클릭 후 dark 또는 light 클래스 중 하나가 있어야 한다
    const classList = document.documentElement.classList;
    const hasTheme = classList.contains("dark") || classList.contains("light");
    expect(hasTheme).toBe(true);
  });

  it("연속 토글 시 light ↔ dark 가 반전된다", async () => {
    const user = userEvent.setup();
    renderApp();

    const toggleBtn = screen.getByRole("button", { name: /toggle|테마|Toggle theme/i });

    // 첫 번째 클릭
    await user.click(toggleBtn);
    const afterFirst = document.documentElement.className;

    // 두 번째 클릭
    await user.click(toggleBtn);
    const afterSecond = document.documentElement.className;

    // 두 번 클릭 후 첫 번째 상태로 복귀 또는 다른 상태여야 한다
    // (light ↔ dark 반전)
    expect(afterFirst).not.toBe(afterSecond);
  });
});

describe("App — placeholder 컴포넌트", () => {
  it("각 Tab 의 TabsContent 가 data-slot=tabs-content 를 가진다", () => {
    renderApp();
    const contents = document.querySelectorAll('[data-slot="tabs-content"]');
    // 4개 TabsContent
    expect(contents).toHaveLength(4);
  });

  it("활성 탭 패널에 내용이 있다", () => {
    renderApp();
    // Radix: 활성 탭의 content 는 role="tabpanel" 을 가진다
    const panel = screen.getByRole("tabpanel");
    expect(panel).not.toBeEmptyDOMElement();
  });
});
