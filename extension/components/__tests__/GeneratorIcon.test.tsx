// SPDX-License-Identifier: AGPL-3.0-or-later
//
// extension/components/__tests__/GeneratorIcon.test.tsx — M24-E Phase E-1

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { GeneratorIcon } from "../GeneratorIcon";

function makeInput(): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "password";
  input.setAttribute("autocomplete", "new-password");
  document.body.appendChild(input);
  return input;
}

describe("GeneratorIcon — 렌더", () => {
  let input: HTMLInputElement;

  beforeEach(() => {
    input = makeInput();
  });

  it("버튼이 렌더된다", () => {
    render(<GeneratorIcon targetInput={input} onActivate={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Generate password" })).toBeInTheDocument();
  });

  it("SVG 아이콘이 포함된다", () => {
    const { container } = render(<GeneratorIcon targetInput={input} onActivate={vi.fn()} />);
    expect(container.querySelector("svg")).not.toBeNull();
  });
});

describe("GeneratorIcon — 클릭", () => {
  let input: HTMLInputElement;

  beforeEach(() => {
    input = makeInput();
  });

  it("버튼 클릭 시 onActivate 호출", () => {
    const onActivate = vi.fn();
    render(<GeneratorIcon targetInput={input} onActivate={onActivate} />);
    fireEvent.click(screen.getByRole("button", { name: "Generate password" }));
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it("onActivate 가 없어도 에러 없음 (방어 타입 확인)", () => {
    const onActivate = vi.fn();
    render(<GeneratorIcon targetInput={input} onActivate={onActivate} />);
    expect(() => {
      fireEvent.click(screen.getByRole("button", { name: "Generate password" }));
    }).not.toThrow();
  });
});
