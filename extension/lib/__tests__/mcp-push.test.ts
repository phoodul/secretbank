/**
 * @file mcp-push.test.ts
 * @license AGPL-3.0-or-later
 *
 * G-4-2: MCP context push — opt-in + 5분 cooldown 단위 테스트.
 *
 * 검증 항목:
 *   1. opt-in OFF → pushSiteContextIfEnabled skip (RPC 미호출)
 *   2. opt-in ON + 5분 내 동일 host 2회 → 두 번째 skip
 *   3. opt-in ON + 5분 후 → 정상 push (2회 모두 호출)
 *   4. opt-in ON + 다른 host → 별도 cooldown (각각 push)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { McpCredentialMeta } from "@secretbank/shared";

// ---------------------------------------------------------------------------
// storage mock (chrome.storage.session + local)
// ---------------------------------------------------------------------------

function makeSessionStoreMock() {
  const store: Record<string, unknown> = {};
  return {
    _store: store,
    get: vi.fn(async (key: string | string[]) => {
      const keys = Array.isArray(key) ? key : [key];
      const result: Record<string, unknown> = {};
      for (const k of keys) {
        if (k in store) result[k] = store[k];
      }
      return result;
    }),
    set: vi.fn(async (items: Record<string, unknown>) => {
      Object.assign(store, items);
    }),
    remove: vi.fn(async (keys: string | string[]) => {
      const ks = Array.isArray(keys) ? keys : [keys];
      for (const k of ks) delete store[k];
    }),
    clear: vi.fn(async () => {
      for (const k of Object.keys(store)) delete store[k];
    }),
  };
}

function makeLocalStoreMock() {
  const store: Record<string, unknown> = {};
  return {
    _store: store,
    get: vi.fn(async (key: string | string[]) => {
      const keys = Array.isArray(key) ? key : [key];
      const result: Record<string, unknown> = {};
      for (const k of keys) {
        if (k in store) result[k] = store[k];
      }
      return result;
    }),
    set: vi.fn(async (items: Record<string, unknown>) => {
      Object.assign(store, items);
    }),
    remove: vi.fn(async (keys: string | string[]) => {
      const ks = Array.isArray(keys) ? keys : [keys];
      for (const k of ks) delete store[k];
    }),
    clear: vi.fn(async () => {
      for (const k of Object.keys(store)) delete store[k];
    }),
  };
}

// ---------------------------------------------------------------------------
// NMClient mock
// ---------------------------------------------------------------------------

function makeNmClientMock(optInEnabled: boolean) {
  return {
    extSettingsGetMcpOptIn: vi.fn(async () => ({
      type: "ext_settings_get_mcp_opt_in_response" as const,
      enabled: optInEnabled,
      ok: true,
    })),
    mcpContextPush: vi.fn(async () => ({ ok: true })),
  };
}

// ---------------------------------------------------------------------------
// 샘플 데이터
// ---------------------------------------------------------------------------

const SAMPLE_META: McpCredentialMeta[] = [{ id: "cred-1", name: "GitHub", issuer: "GitHub" }];
const SESSION_TOKEN = "test-session-token";

// ---------------------------------------------------------------------------
// 테스트
// ---------------------------------------------------------------------------

describe("pushSiteContextIfEnabled — opt-in OFF", () => {
  let sessionMock: ReturnType<typeof makeSessionStoreMock>;
  let localMock: ReturnType<typeof makeLocalStoreMock>;

  beforeEach(async () => {
    sessionMock = makeSessionStoreMock();
    localMock = makeLocalStoreMock();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis.chrome.storage as any).session = sessionMock;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis.chrome.storage as any).local = localMock;
    vi.resetModules();
  });

  it("opt-in OFF → mcpContextPush 미호출", async () => {
    const { pushSiteContextIfEnabled } = await import("../mcp-push.js");
    // opt-in OFF NMClient
    const nm = makeNmClientMock(false);

    await pushSiteContextIfEnabled("github.com", SAMPLE_META, SESSION_TOKEN, nm as never);

    expect(nm.mcpContextPush).not.toHaveBeenCalled();
  });

  it("opt-in OFF → extSettingsGetMcpOptIn 호출됨 (캐시 miss 시 RPC 조회)", async () => {
    const { pushSiteContextIfEnabled } = await import("../mcp-push.js");
    const nm = makeNmClientMock(false);

    await pushSiteContextIfEnabled("github.com", SAMPLE_META, SESSION_TOKEN, nm as never);

    // cache miss → RPC 호출 1회
    expect(nm.extSettingsGetMcpOptIn).toHaveBeenCalledTimes(1);
  });
});

describe("pushSiteContextIfEnabled — opt-in ON + 5분 cooldown", () => {
  let sessionMock: ReturnType<typeof makeSessionStoreMock>;
  let localMock: ReturnType<typeof makeLocalStoreMock>;

  beforeEach(async () => {
    sessionMock = makeSessionStoreMock();
    localMock = makeLocalStoreMock();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis.chrome.storage as any).session = sessionMock;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis.chrome.storage as any).local = localMock;
    vi.resetModules();
  });

  it("opt-in ON + 5분 내 동일 host 2회 → 두 번째 skip", async () => {
    const { pushSiteContextIfEnabled } = await import("../mcp-push.js");
    const nm = makeNmClientMock(true);

    // 첫 번째 push
    await pushSiteContextIfEnabled("github.com", SAMPLE_META, SESSION_TOKEN, nm as never);
    // 두 번째 push (5분 내 — cooldown 중)
    await pushSiteContextIfEnabled("github.com", SAMPLE_META, SESSION_TOKEN, nm as never);

    // mcpContextPush 는 1번만 호출되어야 한다
    expect(nm.mcpContextPush).toHaveBeenCalledTimes(1);
  });

  it("opt-in ON + 5분 후 → 두 번 모두 push", async () => {
    const { pushSiteContextIfEnabled } = await import("../mcp-push.js");
    const nm = makeNmClientMock(true);

    // 첫 번째 push
    await pushSiteContextIfEnabled("github.com", SAMPLE_META, SESSION_TOKEN, nm as never);
    expect(nm.mcpContextPush).toHaveBeenCalledTimes(1);

    // 5분 경과 시뮬레이션: session store 의 last_push 타임스탬프를 과거로 조작
    const lastPushKey = "secretbank_mcp_last_push_v1";
    const stored = sessionMock._store[lastPushKey] as Record<string, number> | undefined;
    if (stored) {
      stored["github.com"] = Date.now() - 6 * 60 * 1000; // 6분 전
    }

    // 두 번째 push (5분 경과 후)
    await pushSiteContextIfEnabled("github.com", SAMPLE_META, SESSION_TOKEN, nm as never);
    expect(nm.mcpContextPush).toHaveBeenCalledTimes(2);
  });

  it("opt-in ON + 다른 host → 별도 cooldown (각각 push)", async () => {
    const { pushSiteContextIfEnabled } = await import("../mcp-push.js");
    const nm = makeNmClientMock(true);

    await pushSiteContextIfEnabled("github.com", SAMPLE_META, SESSION_TOKEN, nm as never);
    await pushSiteContextIfEnabled("stripe.com", SAMPLE_META, SESSION_TOKEN, nm as never);

    // 서로 다른 host → 각각 1번씩 = 총 2번
    expect(nm.mcpContextPush).toHaveBeenCalledTimes(2);
    expect(nm.mcpContextPush).toHaveBeenCalledWith("github.com", SAMPLE_META, SESSION_TOKEN);
    expect(nm.mcpContextPush).toHaveBeenCalledWith("stripe.com", SAMPLE_META, SESSION_TOKEN);
  });

  it("opt-in ON + 캐시 hit → extSettingsGetMcpOptIn 재호출 없음", async () => {
    const { pushSiteContextIfEnabled } = await import("../mcp-push.js");
    const nm = makeNmClientMock(true);

    // 첫 번째 push → RPC 1회 + 캐시 저장
    await pushSiteContextIfEnabled("github.com", SAMPLE_META, SESSION_TOKEN, nm as never);
    expect(nm.extSettingsGetMcpOptIn).toHaveBeenCalledTimes(1);

    // 5분 경과 시뮬레이션 (cooldown 해제)
    const lastPushKey = "secretbank_mcp_last_push_v1";
    const stored = sessionMock._store[lastPushKey] as Record<string, number> | undefined;
    if (stored) {
      stored["github.com"] = Date.now() - 6 * 60 * 1000;
    }

    // 두 번째 push → 캐시 hit → extSettingsGetMcpOptIn 재호출 없음
    await pushSiteContextIfEnabled("github.com", SAMPLE_META, SESSION_TOKEN, nm as never);
    expect(nm.extSettingsGetMcpOptIn).toHaveBeenCalledTimes(1); // 여전히 1회
    expect(nm.mcpContextPush).toHaveBeenCalledTimes(2);
  });
});
