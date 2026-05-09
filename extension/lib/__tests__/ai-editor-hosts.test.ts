// SPDX-License-Identifier: AGPL-3.0-or-later
//
// extension/lib/__tests__/ai-editor-hosts.test.ts — M24-E Phase G-5

import { describe, it, expect } from "vitest";
import { AI_EDITOR_HOSTS, isAiEditorHost } from "../ai-editor-hosts";

// ---------------------------------------------------------------------------
// AI_EDITOR_HOSTS 목록 검증
// ---------------------------------------------------------------------------

describe("AI_EDITOR_HOSTS — 목록 integrity", () => {
  it("7개 이상의 host 를 포함한다", () => {
    expect(AI_EDITOR_HOSTS.length).toBeGreaterThanOrEqual(7);
  });

  it("chatgpt.com 포함", () => {
    expect(AI_EDITOR_HOSTS).toContain("chatgpt.com");
  });

  it("cursor.com 포함", () => {
    expect(AI_EDITOR_HOSTS).toContain("cursor.com");
  });

  it("cursor.sh 포함", () => {
    expect(AI_EDITOR_HOSTS).toContain("cursor.sh");
  });

  it("copilot.github.com 포함", () => {
    expect(AI_EDITOR_HOSTS).toContain("copilot.github.com");
  });

  it("gemini.google.com 포함", () => {
    expect(AI_EDITOR_HOSTS).toContain("gemini.google.com");
  });

  it("claude.ai 포함", () => {
    expect(AI_EDITOR_HOSTS).toContain("claude.ai");
  });

  it("poe.com 포함", () => {
    expect(AI_EDITOR_HOSTS).toContain("poe.com");
  });

  it("perplexity.ai 포함", () => {
    expect(AI_EDITOR_HOSTS).toContain("perplexity.ai");
  });
});

// ---------------------------------------------------------------------------
// isAiEditorHost — exact match
// ---------------------------------------------------------------------------

describe("isAiEditorHost — exact match", () => {
  it("chatgpt.com → true", () => {
    expect(isAiEditorHost("chatgpt.com")).toBe(true);
  });

  it("cursor.com → true", () => {
    expect(isAiEditorHost("cursor.com")).toBe(true);
  });

  it("cursor.sh → true", () => {
    expect(isAiEditorHost("cursor.sh")).toBe(true);
  });

  it("copilot.github.com → true", () => {
    expect(isAiEditorHost("copilot.github.com")).toBe(true);
  });

  it("gemini.google.com → true", () => {
    expect(isAiEditorHost("gemini.google.com")).toBe(true);
  });

  it("claude.ai → true", () => {
    expect(isAiEditorHost("claude.ai")).toBe(true);
  });

  it("poe.com → true", () => {
    expect(isAiEditorHost("poe.com")).toBe(true);
  });

  it("perplexity.ai → true", () => {
    expect(isAiEditorHost("perplexity.ai")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// isAiEditorHost — subdomain match
// ---------------------------------------------------------------------------

describe("isAiEditorHost — subdomain match", () => {
  it("www.chatgpt.com → true (subdomain)", () => {
    expect(isAiEditorHost("www.chatgpt.com")).toBe(true);
  });

  it("www.cursor.com → true (subdomain)", () => {
    expect(isAiEditorHost("www.cursor.com")).toBe(true);
  });

  it("beta.cursor.sh → true (subdomain)", () => {
    expect(isAiEditorHost("beta.cursor.sh")).toBe(true);
  });

  it("labs.perplexity.ai → true (subdomain)", () => {
    expect(isAiEditorHost("labs.perplexity.ai")).toBe(true);
  });

  it("deep.nested.poe.com → true (multi-level subdomain)", () => {
    expect(isAiEditorHost("deep.nested.poe.com")).toBe(true);
  });

  it("sub.claude.ai → true (subdomain)", () => {
    expect(isAiEditorHost("sub.claude.ai")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// isAiEditorHost — non-AI host (false positive 방지)
// ---------------------------------------------------------------------------

describe("isAiEditorHost — 비-AI 사이트 → false", () => {
  it("github.com → false", () => {
    expect(isAiEditorHost("github.com")).toBe(false);
  });

  it("google.com → false (gemini.google.com 과 다름)", () => {
    expect(isAiEditorHost("google.com")).toBe(false);
  });

  it("openai.com → false (chatgpt.com 과 다름)", () => {
    expect(isAiEditorHost("openai.com")).toBe(false);
  });

  it("stripe.com → false", () => {
    expect(isAiEditorHost("stripe.com")).toBe(false);
  });

  it("example.com → false", () => {
    expect(isAiEditorHost("example.com")).toBe(false);
  });

  it("빈 문자열 → false", () => {
    expect(isAiEditorHost("")).toBe(false);
  });

  it("notchatgpt.com → false (suffix 부분 일치 아님)", () => {
    expect(isAiEditorHost("notchatgpt.com")).toBe(false);
  });

  it("evilcursor.com → false (prefix 부분 일치 아님)", () => {
    expect(isAiEditorHost("evilcursor.com")).toBe(false);
  });

  // copilot.github.com 목록에 있으나 github.com 자체는 아님
  it("api.github.com → false (copilot.github.com 의 subdomain 아님)", () => {
    expect(isAiEditorHost("api.github.com")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isAiEditorHost — 대소문자 정규화
// ---------------------------------------------------------------------------

describe("isAiEditorHost — 대소문자 정규화", () => {
  it("CHATGPT.COM (대문자) → true", () => {
    expect(isAiEditorHost("CHATGPT.COM")).toBe(true);
  });

  it("Cursor.Com (혼합) → true", () => {
    expect(isAiEditorHost("Cursor.Com")).toBe(true);
  });
});
