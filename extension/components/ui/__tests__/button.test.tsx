// Button 컴포넌트 렌더 + 이벤트 테스트
// DoD: 단순 렌더 + onClick 검증

import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "../button";

describe("Button", () => {
  it("기본 텍스트를 렌더한다", () => {
    render(<Button>Hello Secretbank</Button>);
    expect(screen.getByRole("button", { name: "Hello Secretbank" })).toBeInTheDocument();
  });

  it("onClick 핸들러가 호출된다", async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();

    render(<Button onClick={handleClick}>클릭 테스트</Button>);

    await user.click(screen.getByRole("button", { name: "클릭 테스트" }));

    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it("disabled 상태에서 onClick 이 호출되지 않는다", async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();

    render(
      <Button onClick={handleClick} disabled>
        비활성 버튼
      </Button>,
    );

    const button = screen.getByRole("button", { name: "비활성 버튼" });
    expect(button).toBeDisabled();

    await user.click(button);
    expect(handleClick).not.toHaveBeenCalled();
  });

  it("variant 와 size prop 이 data-slot attribute 를 가진다", () => {
    render(
      <Button variant="destructive" size="sm">
        삭제
      </Button>,
    );
    const button = screen.getByRole("button", { name: "삭제" });
    expect(button).toHaveAttribute("data-slot", "button");
  });

  it("className prop 이 추가된다", () => {
    render(<Button className="custom-class">커스텀</Button>);
    const button = screen.getByRole("button", { name: "커스텀" });
    expect(button).toHaveClass("custom-class");
  });

  it("키보드 Enter 로 클릭할 수 있다", async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();

    render(<Button onClick={handleClick}>키보드 접근성</Button>);

    const button = screen.getByRole("button", { name: "키보드 접근성" });
    button.focus();
    await user.keyboard("{Enter}");

    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});
