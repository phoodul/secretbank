// SPDX-License-Identifier: AGPL-3.0-or-later
//
// extension/lib/__tests__/save-handler.test.ts — M24-E Phase D-4

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  decideSaveKind,
  isDomainOnNeverList,
  handleFormSubmit,
  _resetInflight,
} from "../save-handler.js";
import type { FormSubmitInput, AutocompleteHint } from "../save-handler.js";

// ---------------------------------------------------------------------------
// chrome.storage.local mock
// ---------------------------------------------------------------------------

const storageLocal: Record<string, unknown> = {};

beforeEach(() => {
  // 스토리지 초기화
  Object.keys(storageLocal).forEach((k) => delete storageLocal[k]);

  (globalThis.chrome as unknown as Record<string, unknown>).storage = {
    local: {
      get: vi.fn(async (key: string) => ({ [key]: storageLocal[key] })),
      set: vi.fn(async (items: Record<string, unknown>) => {
        Object.assign(storageLocal, items);
      }),
      remove: vi.fn(async (key: string) => {
        delete storageLocal[key];
      }),
    },
  };

  // single-flight 상태 초기화
  _resetInflight();
});

afterEach(() => {
  vi.restoreAllMocks();
  _resetInflight();
});

// ---------------------------------------------------------------------------
// NMClient mock 팩토리
// ---------------------------------------------------------------------------

function makeClientMock(opts?: {
  listExists?: boolean;
  listCredentialId?: string;
  listReject?: boolean;
  blastReject?: boolean;
  blastTotal?: number;
}) {
  return {
    credentialListByDomain: vi.fn(async () => {
      if (opts?.listReject) throw new Error("NM error");
      return {
        type: "credential_list_by_domain_response" as const,
        exists: opts?.listExists ?? false,
        credential_id: opts?.listCredentialId,
      };
    }),
    credentialCreate: vi.fn(async () => ({
      type: "credential_save_response" as const,
      ok: true,
      credential_id: "new-id",
    })),
    credentialUpdate: vi.fn(async () => ({
      type: "credential_save_response" as const,
      ok: true,
    })),
    blastRadiusForHost: vi.fn(async () => {
      if (opts?.blastReject) throw new Error("blast error");
      return {
        type: "blast_radius_for_host_response" as const,
        credential_id: "cred-blast-1",
        affected: [],
        total: opts?.blastTotal ?? 0,
        hidden_count: 0,
      };
    }),
  };
}

// mountSaveBanner mock — onSave/onNever/onDismiss/blastRadius 캡처용
let capturedProps: {
  kind: "new" | "update";
  siteName: string;
  onSave: () => void;
  onNever: () => void;
  onDismiss: () => void;
  blastRadius?: unknown;
  onViewBlastRadius?: () => void;
} | null = null;

// mountSaveBanner 호출 횟수 추적
let mountCallCount = 0;

vi.mock("../save-banner-host.js", () => ({
  mountSaveBanner: vi.fn((props: typeof capturedProps) => {
    capturedProps = props;
    mountCallCount += 1;
    return vi.fn(); // unmount fn
  }),
}));

// deep-link mock
vi.mock("../deep-link.js", () => ({
  openSecretbankDeepLink: vi.fn(),
}));

// ---------------------------------------------------------------------------
// decideSaveKind
// ---------------------------------------------------------------------------

describe("decideSaveKind", () => {
  it("new-password + 기존 없음 → new", () => {
    expect(decideSaveKind("example.com", false, "new-password")).toBe("new");
  });

  it("new-password + 기존 있음 → update (rotation)", () => {
    expect(decideSaveKind("example.com", true, "new-password")).toBe("update");
  });

  it("current-password + 기존 있음 → update", () => {
    expect(decideSaveKind("example.com", true, "current-password")).toBe("update");
  });

  it("current-password + 기존 없음 → new (최초 저장)", () => {
    expect(decideSaveKind("example.com", false, "current-password")).toBe("new");
  });

  it("null + 기존 없음 → new (fallback)", () => {
    expect(decideSaveKind("example.com", false, null)).toBe("new");
  });

  it("null + 기존 있음 → update (fallback)", () => {
    expect(decideSaveKind("example.com", true, null)).toBe("update");
  });
});

// ---------------------------------------------------------------------------
// isDomainOnNeverList
// ---------------------------------------------------------------------------

describe("isDomainOnNeverList", () => {
  it("never list 비어 있으면 false", async () => {
    expect(await isDomainOnNeverList("example.com")).toBe(false);
  });

  it("목록에 있는 도메인 → true", async () => {
    storageLocal["secretbank_never_save_domains"] = ["example.com", "other.com"];
    expect(await isDomainOnNeverList("example.com")).toBe(true);
  });

  it("목록에 없는 도메인 → false", async () => {
    storageLocal["secretbank_never_save_domains"] = ["other.com"];
    expect(await isDomainOnNeverList("example.com")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// handleFormSubmit
// ---------------------------------------------------------------------------

function makeInput(overrides?: Partial<FormSubmitInput>): FormSubmitInput {
  return {
    domain: "example.com",
    siteName: "example.com",
    username: "user@example.com",
    password: "s3cr3t",
    autocompleteHint: null,
    ...overrides,
  };
}

function validSession() {
  storageLocal["session_token"] = {
    token: "tok-abc",
    expires_at: Date.now() + 3_600_000,
  };
}

describe("handleFormSubmit", () => {
  beforeEach(() => {
    capturedProps = null;
    mountCallCount = 0;
  });

  it("never list 에 있는 도메인 → banner 미표시", async () => {
    storageLocal["secretbank_never_save_domains"] = ["example.com"];
    validSession();
    const client = makeClientMock();
    await handleFormSubmit(makeInput(), client as never);
    expect(client.credentialListByDomain).not.toHaveBeenCalled();
    expect(capturedProps).toBeNull();
  });

  it("session token 없으면 → banner 미표시", async () => {
    const client = makeClientMock();
    await handleFormSubmit(makeInput(), client as never);
    expect(capturedProps).toBeNull();
  });

  it("신규 도메인 → kind='new' 배너 표시", async () => {
    validSession();
    const client = makeClientMock({ listExists: false });
    await handleFormSubmit(makeInput(), client as never);
    expect(capturedProps).not.toBeNull();
    expect(capturedProps!.kind).toBe("new");
  });

  it("기존 credential 있음 → kind='update' 배너 표시", async () => {
    validSession();
    const client = makeClientMock({ listExists: true, listCredentialId: "cred-1" });
    await handleFormSubmit(makeInput(), client as never);
    expect(capturedProps!.kind).toBe("update");
  });

  it("nm-host 조회 실패 시 fallback → kind='new'", async () => {
    validSession();
    const client = makeClientMock({ listReject: true });
    await handleFormSubmit(makeInput(), client as never);
    expect(capturedProps!.kind).toBe("new");
  });

  it("new-password hint + 기존 없음 → kind='new'", async () => {
    validSession();
    const client = makeClientMock({ listExists: false });
    await handleFormSubmit(makeInput({ autocompleteHint: "new-password" }), client as never);
    expect(capturedProps!.kind).toBe("new");
  });

  it("new-password hint + 기존 있음 → kind='update'", async () => {
    validSession();
    const client = makeClientMock({ listExists: true, listCredentialId: "cred-99" });
    await handleFormSubmit(makeInput({ autocompleteHint: "new-password" }), client as never);
    expect(capturedProps!.kind).toBe("update");
  });

  it("onSave 클릭 시 kind=new → credentialCreate 호출", async () => {
    validSession();
    const client = makeClientMock({ listExists: false });
    await handleFormSubmit(makeInput(), client as never);
    expect(capturedProps).not.toBeNull();
    await capturedProps!.onSave();
    expect(client.credentialCreate).toHaveBeenCalledTimes(1);
    expect(client.credentialUpdate).not.toHaveBeenCalled();
  });

  it("onSave 클릭 시 kind=update + credential_id → credentialUpdate 호출", async () => {
    validSession();
    const client = makeClientMock({ listExists: true, listCredentialId: "cred-x" });
    await handleFormSubmit(makeInput(), client as never);
    await capturedProps!.onSave();
    expect(client.credentialUpdate).toHaveBeenCalledTimes(1);
    expect(client.credentialCreate).not.toHaveBeenCalled();
  });

  it("onSave 클릭 시 kind=update + credential_id 없음 → credentialCreate fallback", async () => {
    validSession();
    // listExists=true 이지만 credential_id 없음
    const client = makeClientMock({ listExists: true, listCredentialId: undefined });
    await handleFormSubmit(makeInput(), client as never);
    await capturedProps!.onSave();
    expect(client.credentialCreate).toHaveBeenCalledTimes(1);
  });

  it("onNever 클릭 시 도메인이 never list 에 추가됨", async () => {
    validSession();
    const client = makeClientMock({ listExists: false });
    await handleFormSubmit(makeInput(), client as never);
    await capturedProps!.onNever();
    const stored = storageLocal["secretbank_never_save_domains"] as string[];
    expect(stored).toContain("example.com");
  });

  it("single-flight: inflight 상태에서 두 번째 submit → banner 미표시", async () => {
    validSession();
    const client = makeClientMock({ listExists: false });

    // 첫 번째 호출이 never list await 를 통과한 뒤 두 번째 호출이 들어오는 상황을 시뮬레이션.
    // credentialListByDomain 을 blocking Promise 로 대체 — 첫 번째 호출이 여기서 멈춘다.
    let unblockFirst: () => void = () => {};
    const blockingClient = {
      ...client,
      credentialListByDomain: vi.fn(
        () =>
          new Promise<{ type: "credential_list_by_domain_response"; exists: boolean }>((res) => {
            unblockFirst = () => res({ type: "credential_list_by_domain_response", exists: false });
          }),
      ),
    };

    // 첫 번째 handleFormSubmit 시작 (비동기 — pending)
    const p1 = handleFormSubmit(makeInput(), blockingClient as never);

    // never list + session token await 를 넘기기 위해 microtask 소진
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    // 이 시점에서 _inflight === true → 두 번째 호출은 즉시 skip
    capturedProps = null;
    const p2 = handleFormSubmit(makeInput(), blockingClient as never);
    await p2;

    // 첫 번째 완료
    unblockFirst();
    await p1;

    // credentialListByDomain 은 1회만 (두 번째는 가드에서 탈출)
    expect(blockingClient.credentialListByDomain).toHaveBeenCalledTimes(1);
  });

  it("T-CRED-1: handleFormSubmit 종료 후 password 필드가 null 처리됨", async () => {
    validSession();
    const client = makeClientMock({ listExists: false });
    const input = makeInput();
    await handleFormSubmit(input, client as never);
    // password 참조가 null 로 덮어써졌는지 확인
    expect((input as unknown as Record<string, unknown>).password).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// storage — session token 만료 처리
// ---------------------------------------------------------------------------

describe("getSessionToken — 만료 토큰 처리", () => {
  it("만료된 session token → banner 미표시", async () => {
    storageLocal["session_token"] = {
      token: "expired-tok",
      expires_at: Date.now() - 1000, // 이미 만료
    };
    const client = makeClientMock({ listExists: false });
    capturedProps = null;
    await handleFormSubmit(makeInput(), client as never);
    expect(capturedProps).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// G-3-2: blastRadiusForHost 호출 검증
// ---------------------------------------------------------------------------

describe("G-3-2: blastRadiusForHost 호출", () => {
  it("kind=update 시 blastRadiusForHost 가 호출된다", async () => {
    validSession();
    const client = makeClientMock({ listExists: true, listCredentialId: "cred-1" });
    await handleFormSubmit(makeInput(), client as never);
    // blastRadius RPC 는 비동기이므로 Promise 소진을 위해 microtask flush
    await Promise.resolve();
    await Promise.resolve();
    expect(client.blastRadiusForHost).toHaveBeenCalledWith("example.com", "tok-abc");
  });

  it("kind=new 시 blastRadiusForHost 가 호출되지 않는다", async () => {
    validSession();
    const client = makeClientMock({ listExists: false });
    await handleFormSubmit(makeInput(), client as never);
    await Promise.resolve();
    await Promise.resolve();
    expect(client.blastRadiusForHost).not.toHaveBeenCalled();
  });

  it("kind=update + blastRadius 응답 도착 시 banner 재마운트된다 (mountCallCount=2)", async () => {
    validSession();
    const client = makeClientMock({ listExists: true, listCredentialId: "cred-x", blastTotal: 3 });
    await handleFormSubmit(makeInput(), client as never);
    // blastRadius 비동기 완료를 위해 flush
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    // 초기 mount(1) + blast 응답 후 re-mount(1) = 2
    expect(mountCallCount).toBeGreaterThanOrEqual(2);
  });

  it("blastRadiusForHost 실패 시 banner 재마운트 — blastRadius=null", async () => {
    validSession();
    const client = makeClientMock({
      listExists: true,
      listCredentialId: "cred-x",
      blastReject: true,
    });
    await handleFormSubmit(makeInput(), client as never);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    // 실패 후 re-mount 시 blastRadius=null 로 전달됨
    expect(mountCallCount).toBeGreaterThanOrEqual(2);
    expect(capturedProps?.blastRadius).toBeNull();
  });
});
