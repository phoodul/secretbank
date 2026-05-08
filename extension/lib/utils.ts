// cn() 유틸리티 — clsx + tailwind-merge 조합
// extension/ 전용 (기존 src/lib/utils.ts 와 분리, workspace 격리)

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
