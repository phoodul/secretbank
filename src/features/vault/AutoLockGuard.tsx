import { useIdleLock } from "@/hooks/use-idle-lock";

/**
 * idle 감지 타이머를 활성화하는 null-render 컴포넌트.
 * BrowserRouter 내부, unlocked 분기에서만 마운트된다.
 */
export function AutoLockGuard(): null {
  useIdleLock();
  return null;
}
