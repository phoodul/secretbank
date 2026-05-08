// Secretbank Extension — Button 컴포넌트
// shadcn/ui Button (cva 기반) — extension/ 전용
// 기존 src/components/ui/button.tsx 와 별도 (workspace 격리)
//
// F.2 Spec 준수:
//   - 모든 색상/크기는 CSS 변수(디자인 토큰) 참조 — hex 하드코딩 ❌
//   - focus-visible 키보드 접근성 보장
//   - disabled 상태 accessible

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const buttonVariants = cva(
  // 기본 스타일: 디자인 토큰 CSS 변수 사용
  [
    "inline-flex shrink-0 items-center justify-center gap-2",
    "rounded-[var(--radius-md)] text-sm font-medium whitespace-nowrap",
    "transition-all outline-none",
    // 키보드 접근성 — focus-visible 링 (디자인 토큰 사용)
    "focus-visible:ring-[3px] focus-visible:ring-[var(--color-ring)]",
    "focus-visible:ring-offset-1",
    // disabled 상태
    "disabled:pointer-events-none disabled:opacity-50",
    // SVG 아이콘 스타일
    "[&_svg]:pointer-events-none [&_svg]:shrink-0",
    "[&_svg:not([class*='size-'])]:size-4",
  ],
  {
    variants: {
      variant: {
        default:
          "bg-[var(--color-primary)] text-[var(--color-primary-foreground)] hover:opacity-90",
        destructive:
          "bg-[var(--color-destructive)] text-[var(--color-destructive-foreground)] hover:opacity-90",
        outline:
          "border border-[var(--color-border)] bg-[var(--color-background)] hover:bg-[var(--color-accent)] hover:text-[var(--color-accent-foreground)]",
        secondary:
          "bg-[var(--color-secondary)] text-[var(--color-secondary-foreground)] hover:opacity-80",
        ghost: "hover:bg-[var(--color-accent)] hover:text-[var(--color-accent-foreground)]",
        link: "text-[var(--color-primary)] underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 px-3 text-xs",
        lg: "h-10 px-6",
        icon: "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

// asChild 패턴: Phase A 에서는 단순화 (Slot 없음)
// Radix Slot 은 필요 시 추후 추가
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        ref={ref}
        data-slot="button"
        className={cn(buttonVariants({ variant, size, className }))}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
