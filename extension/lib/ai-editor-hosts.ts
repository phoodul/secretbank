// SPDX-License-Identifier: AGPL-3.0-or-later
//
// extension/lib/ai-editor-hosts.ts — M24-E Phase G-5
//
// AI 에디터 / AI 어시스턴트 호스트 목록.
// 이 목록에 매칭되는 사이트 방문 시 RailguardHintBanner 를 표시한다.
//
// 갱신 주기 = 분기별, AI 에디터 시장 변화 시 hotfix. M24 Phase G-5.
//
// 보안:
//   - 정적 hard-coded 목록 (false-positive 최소화)
//   - subdomain 매칭 지원 (chat.openai.com → openai.com 이 목록에 있으면 매칭)
//   - exact host match + ".suffix" match 이중 검사

// ---------------------------------------------------------------------------
// AI 에디터 / 어시스턴트 호스트 목록
// ---------------------------------------------------------------------------

/**
 * 알려진 AI 에디터 / 어시스턴트 사이트 목록.
 *
 * 추가 기준:
 *   1. AI 가 user prompt 를 수신하는 사이트
 *   2. API 키 / 비밀번호 입력 위험이 현실적으로 존재
 *   3. 분기별 검토 — AI 에디터 시장 변화 시 hotfix PR 로 즉시 반영
 *
 * 마지막 검토: 2026-Q2
 */
export const AI_EDITOR_HOSTS: ReadonlyArray<string> = [
  // OpenAI ChatGPT
  "chatgpt.com",
  // Cursor IDE
  "cursor.com",
  "cursor.sh",
  // GitHub Copilot
  "copilot.github.com",
  // Google Gemini
  "gemini.google.com",
  // Anthropic Claude
  "claude.ai",
  // Quora Poe
  "poe.com",
  // Perplexity AI
  "perplexity.ai",
];

// ---------------------------------------------------------------------------
// 매칭 유틸리티
// ---------------------------------------------------------------------------

/**
 * host 가 AI_EDITOR_HOSTS 에 속하는지 확인한다.
 *
 * 매칭 규칙:
 *   - exact match: host === listed
 *   - subdomain match: host ends with "." + listed
 *     예) "www.cursor.com" → ".cursor.com" suffix 매칭
 *
 * @param host - document.location.hostname 값 (소문자 권장)
 * @returns true 이면 AI 에디터 사이트
 */
export function isAiEditorHost(host: string): boolean {
  if (!host) return false;
  const normalized = host.toLowerCase();
  for (const listed of AI_EDITOR_HOSTS) {
    if (normalized === listed) return true;
    if (normalized.endsWith("." + listed)) return true;
  }
  return false;
}
