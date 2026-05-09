/**
 * @file tabs.tsx
 * @license AGPL-3.0-or-later
 *
 * Extension 전용 Tabs 컴포넌트 (shadcn/ui 스타일, Radix Tabs 기반).
 * 데스크톱 src/components/ui/tabs.tsx 와 격리된 독립 구현.
 *
 * F.2 Spec 준수:
 *   - 모든 색상/크기는 CSS 변수(디자인 토큰) 참조 — hex 하드코딩 ❌
 *   - 키보드 접근성: Radix TabsPrimitive 가 ARIA 자동 처리
 *   - Tab key 이동, Arrow key 탭 전환, Enter/Space 선택 지원
 */

import * as React from "react";
import { Tabs as TabsPrimitive } from "radix-ui";
import { cn } from "../../lib/utils";

// 루트 Tabs 컨테이너
function Tabs({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  );
}

// TabsList — 탭 트리거를 담는 컨테이너
function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        // MV3 popup 크기에 맞게 full-width
        "inline-flex w-full items-center justify-center rounded-lg p-[3px]",
        "bg-[var(--color-muted)] text-[var(--color-muted-foreground)]",
        className,
      )}
      {...props}
    />
  );
}

// TabsTrigger — 개별 탭 버튼
function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        // 기본 스타일
        "inline-flex flex-1 items-center justify-center gap-1.5 rounded-md",
        "px-2 py-1 text-xs font-medium whitespace-nowrap",
        // 색상 토큰 (hex 하드코딩 ❌)
        "text-[var(--color-muted-foreground)]",
        // 트랜지션 (prefers-reduced-motion 은 globals.css 에서 처리)
        "transition-all",
        // 키보드 접근성 — focus-visible 링
        "focus-visible:outline-none focus-visible:ring-[3px]",
        "focus-visible:ring-[var(--color-ring)] focus-visible:ring-offset-1",
        // 활성 탭
        "data-[state=active]:bg-[var(--color-background)]",
        "data-[state=active]:text-[var(--color-foreground)]",
        "data-[state=active]:shadow-sm",
        // 비활성화
        "disabled:pointer-events-none disabled:opacity-50",
        // hover
        "hover:text-[var(--color-foreground)]",
        className,
      )}
      {...props}
    />
  );
}

// TabsContent — 탭 패널 내용
function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn(
        "flex-1 outline-none",
        // focus-visible 접근성
        "focus-visible:ring-[3px] focus-visible:ring-[var(--color-ring)]",
        className,
      )}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
