import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import "@/lib/i18n";
import i18next from "@/lib/i18n";
import { SUPPORTED_LANGUAGES } from "@/lib/i18n";

import { LanguageSwitcher } from "../language-switcher";

describe("LanguageSwitcher", () => {
  beforeEach(async () => {
    await i18next.changeLanguage("en");
  });

  it("현재 언어의 native name 을 트리거에 표시한다", async () => {
    await i18next.changeLanguage("ko");
    render(<LanguageSwitcher />);
    expect(screen.getByRole("button", { name: /한국어/ })).toBeInTheDocument();
  });

  it("드롭다운 열면 15개 언어 모두 표시한다", async () => {
    const user = userEvent.setup();
    render(<LanguageSwitcher />);
    await user.click(screen.getByRole("button"));

    const menu = await screen.findByRole("menu");
    const items = within(menu).getAllByRole("menuitemradio");
    expect(items).toHaveLength(SUPPORTED_LANGUAGES.length);
    expect(SUPPORTED_LANGUAGES.length).toBe(15);
  });

  it("아랍어 선택 시 document.documentElement.dir 가 rtl 로 바뀐다", async () => {
    const user = userEvent.setup();
    render(<LanguageSwitcher />);
    await user.click(screen.getByRole("button"));
    const menu = await screen.findByRole("menu");
    await user.click(within(menu).getByTestId("language-option-ar"));

    await waitFor(() => {
      expect(i18next.resolvedLanguage).toBe("ar");
      expect(document.documentElement.dir).toBe("rtl");
    });

    // 다른 언어 복귀 시 ltr 로 환원되는지도 확인 (다음 테스트에 누수 방지)
    await i18next.changeLanguage("en");
    await waitFor(() => {
      expect(document.documentElement.dir).toBe("ltr");
    });
  });

  it("언어 선택 시 i18next.changeLanguage 가 호출된다", async () => {
    const user = userEvent.setup();
    render(<LanguageSwitcher />);
    await user.click(screen.getByRole("button"));
    const menu = await screen.findByRole("menu");
    await user.click(within(menu).getByTestId("language-option-fr"));

    await waitFor(() => {
      expect(i18next.resolvedLanguage).toBe("fr");
    });
  });

  it("corner variant 는 vault 톤 클래스를 적용한다", () => {
    render(<LanguageSwitcher variant="corner" />);
    const trigger = screen.getByRole("button");
    expect(trigger.className).toContain("backdrop-blur");
  });
});
