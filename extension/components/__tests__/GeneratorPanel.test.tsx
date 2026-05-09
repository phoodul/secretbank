// SPDX-License-Identifier: AGPL-3.0-or-later
//
// extension/components/__tests__/GeneratorPanel.test.tsx — M24-E Phase E-1

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { GeneratorPanel } from "../GeneratorPanel";

function makeInput(): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "password";
  input.setAttribute("autocomplete", "new-password");
  document.body.appendChild(input);
  return input;
}

describe("GeneratorPanel — 렌더", () => {
  let input: HTMLInputElement;

  beforeEach(() => {
    input = makeInput();
  });

  afterEach(() => {
    input.remove();
  });

  it("Password Generator dialog 가 렌더된다", () => {
    render(<GeneratorPanel targetInput={input} onClose={vi.fn()} />);
    expect(screen.getByRole("dialog", { name: "Password Generator" })).toBeInTheDocument();
  });

  it("Diceware / Random 모드 버튼이 있다", () => {
    render(<GeneratorPanel targetInput={input} onClose={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Diceware" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Random" })).toBeInTheDocument();
  });

  it("초기 모드는 Diceware — Language / Word count 셀렉트 표시", () => {
    render(<GeneratorPanel targetInput={input} onClose={vi.fn()} />);
    expect(screen.getByLabelText("Language")).toBeInTheDocument();
    expect(screen.getByLabelText("Word count")).toBeInTheDocument();
  });

  it("닫기 버튼(×)이 있다", () => {
    render(<GeneratorPanel targetInput={input} onClose={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
  });

  it("Regenerate / Use this password 버튼이 있다", () => {
    render(<GeneratorPanel targetInput={input} onClose={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Regenerate" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Use this password" })).toBeInTheDocument();
  });
});

describe("GeneratorPanel — 모드 전환", () => {
  let input: HTMLInputElement;

  beforeEach(() => {
    input = makeInput();
  });

  afterEach(() => {
    input.remove();
  });

  it("Random 버튼 클릭 시 Length 슬라이더 표시", () => {
    render(<GeneratorPanel targetInput={input} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Random" }));
    expect(screen.getByLabelText("Length")).toBeInTheDocument();
  });

  it("Random 모드 → Diceware 버튼 클릭 시 Word count 셀렉트 복귀", () => {
    render(<GeneratorPanel targetInput={input} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Random" }));
    fireEvent.click(screen.getByRole("button", { name: "Diceware" }));
    expect(screen.getByLabelText("Word count")).toBeInTheDocument();
  });

  it("Random 모드에서 체크박스 4개(a-z, A-Z, 0-9, !@#)가 있다", () => {
    render(<GeneratorPanel targetInput={input} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Random" }));
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes.length).toBe(4);
  });
});

describe("GeneratorPanel — 생성 + Use this", () => {
  let input: HTMLInputElement;

  beforeEach(() => {
    input = makeInput();
  });

  afterEach(() => {
    input.remove();
  });

  it("Regenerate 클릭 시 generated password label 이 존재한다", () => {
    render(<GeneratorPanel targetInput={input} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Regenerate" }));
    expect(screen.getByLabelText("Generated password")).toBeInTheDocument();
  });

  it("Use this password 클릭 시 onClose 호출", () => {
    const onClose = vi.fn();
    render(<GeneratorPanel targetInput={input} onClose={onClose} />);
    // 초기 generate 가 완료된 뒤 Use this 클릭.
    const useBtn = screen.getByRole("button", { name: "Use this password" });
    fireEvent.click(useBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Use this password 클릭 시 input.value 에 password 가 채워진다", () => {
    render(<GeneratorPanel targetInput={input} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Use this password" }));
    // password 가 채워졌는지 확인 (길이 > 0).
    expect(input.value.length).toBeGreaterThan(0);
  });

  it("Use this password 클릭 시 input 이벤트 dispatch", () => {
    const inputHandler = vi.fn();
    input.addEventListener("input", inputHandler);
    render(<GeneratorPanel targetInput={input} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Use this password" }));
    expect(inputHandler).toHaveBeenCalledTimes(1);
    input.removeEventListener("input", inputHandler);
  });

  it("닫기 버튼(×) 클릭 시 onClose 호출", () => {
    const onClose = vi.fn();
    render(<GeneratorPanel targetInput={input} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("마스킹 토글 버튼이 있다", () => {
    render(<GeneratorPanel targetInput={input} onClose={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: /show password|hide password/i }),
    ).toBeInTheDocument();
  });
});

describe("GeneratorPanel — cleanup (T-CRED-1)", () => {
  let input: HTMLInputElement;

  beforeEach(() => {
    input = makeInput();
  });

  afterEach(() => {
    input.remove();
  });

  it("unmount 시 에러 없이 cleanup 된다", () => {
    const { unmount } = render(<GeneratorPanel targetInput={input} onClose={vi.fn()} />);
    expect(() => {
      act(() => {
        unmount();
      });
    }).not.toThrow();
  });
});
