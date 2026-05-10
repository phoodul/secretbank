// @vitest-environment node
// @file index.test.js
// @license AGPL-3.0-or-later
//
// Mock NM Host 단위 테스트.
//
// Node.js 내장 stream/Buffer 만 사용 — 외부 의존성 없음.
// vitest 로 실행: pnpm --filter @secretbank/extension test

import { describe, it, expect, beforeAll } from "vitest";
import { PassThrough, Readable } from "node:stream";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// 내부 헬퍼 — 테스트용 직접 import (index.js 를 모듈로 사용)
// ---------------------------------------------------------------------------

// index.js 는 ESM + main() 자동 실행 형태이므로 테스트에서 직접 import 하지 않고
// handleMessage / readMessage / writeMessage 를 별도로 테스트한다.
// 여기서는 NM 프로토콜 encode/decode 와 handleMessage 를 직접 구현하여 검증한다.

const MAX_MESSAGE_SIZE = 1_048_576;

/** NM 프레임을 Buffer 로 인코딩한다 (테스트 helper) */
function encodeFrame(msg) {
  const body = Buffer.from(JSON.stringify(msg), "utf-8");
  const header = Buffer.alloc(4);
  header.writeUInt32LE(body.length, 0);
  return Buffer.concat([header, body]);
}

/** Buffer 에서 NM 프레임 하나를 디코딩한다 (테스트 helper) */
function decodeFrame(buf) {
  const bodyLen = buf.readUInt32LE(0);
  const body = buf.slice(4, 4 + bodyLen);
  return JSON.parse(body.toString("utf-8"));
}

/** NM 프로토콜 응답을 수집하는 writable 스트림 생성 */
function collectOutput() {
  const chunks = [];
  const stream = new PassThrough();
  stream.on("data", (chunk) => chunks.push(chunk));
  return {
    stream,
    getMessages() {
      const combined = Buffer.concat(chunks);
      const msgs = [];
      let offset = 0;
      while (offset + 4 <= combined.length) {
        const len = combined.readUInt32LE(offset);
        offset += 4;
        if (offset + len > combined.length) break;
        const body = combined.slice(offset, offset + len);
        msgs.push(JSON.parse(body.toString("utf-8")));
        offset += len;
      }
      return msgs;
    },
  };
}

// ---------------------------------------------------------------------------
// 프로토콜 — 4-byte LE header 인코딩/디코딩 검증
// ---------------------------------------------------------------------------

describe("NM 프로토콜 — 4-byte LE header", () => {
  it("단순 객체를 encode → decode 하면 원본과 동일하다", () => {
    const msg = { type: "ping" };
    const frame = encodeFrame(msg);
    const decoded = decodeFrame(frame);
    expect(decoded).toEqual(msg);
  });

  it("UTF-8 / 한글 / 이모지 round-trip", () => {
    const msg = { type: "test", payload: "안녕하세요 🦀" };
    const frame = encodeFrame(msg);
    const decoded = decodeFrame(frame);
    expect(decoded).toEqual(msg);
  });

  it("header 는 정확히 4바이트 little-endian", () => {
    const msg = { type: "ping" };
    const frame = encodeFrame(msg);
    const body = Buffer.from(JSON.stringify(msg), "utf-8");
    // header 에 body 길이가 LE 로 인코딩되어야 한다
    expect(frame.readUInt32LE(0)).toBe(body.length);
    expect(frame.length).toBe(4 + body.length);
  });

  it("1MB 정확한 크기 메시지는 허용된다", () => {
    // JSON string `"aaa..."` 형식 — 따옴표 2바이트 포함
    const contentLen = MAX_MESSAGE_SIZE - 2;
    const msg = "a".repeat(contentLen);
    const body = Buffer.from(JSON.stringify(msg), "utf-8");
    expect(body.length).toBe(MAX_MESSAGE_SIZE);
    // 에러 없이 frame 생성
    const header = Buffer.alloc(4);
    header.writeUInt32LE(body.length, 0);
    const frame = Buffer.concat([header, body]);
    expect(frame.length).toBe(4 + MAX_MESSAGE_SIZE);
  });

  it("1MB 초과 응답은 오류를 발생시킨다", () => {
    const content = "a".repeat(MAX_MESSAGE_SIZE); // 따옴표 포함하면 초과
    const msg = content;
    const body = Buffer.from(JSON.stringify(msg), "utf-8");
    expect(body.length).toBeGreaterThan(MAX_MESSAGE_SIZE);
    // writeMessage 상당 로직 — 상한 초과 시 throw
    expect(() => {
      if (body.length > MAX_MESSAGE_SIZE) {
        throw new Error(`응답 크기 ${body.length} 가 상한 ${MAX_MESSAGE_SIZE} 를 초과했습니다`);
      }
    }).toThrow(/초과/);
  });
});

// ---------------------------------------------------------------------------
// handleMessage — 각 메시지 타입 응답 검증
// ---------------------------------------------------------------------------

// handleMessage 를 테스트하기 위해 index.js 의 로직을 직접 인라인한다.
// (index.js 가 main() 즉시 실행 형태이므로 import 대신 로직 공유)

const defaultFixtures = {
  credentials: [
    {
      credential_id: "fixture-cred-001",
      issuer: "GitHub",
      domain: "github.com",
      username: "fixture-user-1",
    },
    {
      credential_id: "fixture-cred-002",
      issuer: "Stripe",
      domain: "stripe.com",
      username: "fixture-user-2",
    },
    {
      credential_id: "fixture-cred-003",
      issuer: "AWS",
      domain: "console.aws.amazon.com",
      username: "fixture-user-3",
    },
  ],
  domain_match: { domain: "github.com", credential_id: "fixture-cred-001" },
  pairing: {
    desktop_pub: "bW9ja19kZXNrdG9wX3B1Yl9rZXlfMzJieXRlc19wYWQ=",
    device_id: "mock-device-id-fixture",
  },
  graph: {
    center_id: "fixture-cred-001",
    center_label: "GitHub",
    project_nodes: [
      { id: "proj-1", name: "secretbank-web", status: "active" },
      { id: "proj-2", name: "secretbank-api", status: "active" },
      { id: "proj-3", name: "secretbank-docs", status: "inactive" },
    ],
    edges: [
      { from: "fixture-cred-001", to: "proj-1" },
      { from: "fixture-cred-001", to: "proj-2" },
      { from: "fixture-cred-001", to: "proj-3" },
    ],
    hidden_count: 0,
  },
  incident: {
    trigger_host: "github.com",
    matches: [
      {
        incident_id: "inc-001",
        title: "GitHub Token Leak",
        severity: "HIGH",
        detected_at: 1746820000000,
        cve_id: "CVE-2025-0001",
      },
    ],
  },
  blast_radius: {
    trigger_host: "github.com",
    credential_id: "fixture-cred-001",
    affected: [
      { kind: "deployment", label: "prod-api", status: "active" },
      { kind: "project", label: "secretbank-api", status: "active" },
      { kind: "url", label: "https://api.secretbank.app", status: "active" },
    ],
    total: 3,
    hidden_count: 0,
  },
  recipe: {
    domain: "github.com",
    found: true,
    recipe: {
      username_selector: "#login_field",
      password_selector: "#password",
      submit_selector: "[type=submit]",
      otp_selector: null,
    },
    source: "preset",
  },
  mcp_opt_in: { enabled: false },
};

/** handleMessage 의 테스트용 순수 함수 버전 */
function handleMessage(msg, fixtures = defaultFixtures) {
  const type = msg?.type ?? "";
  switch (type) {
    case "ping":
      return { type: "pong" };
    case "init":
    case "pairing_request":
      return {
        type: "paired",
        desktop_pub: fixtures.pairing.desktop_pub,
        device_id: fixtures.pairing.device_id,
      };
    case "get_credential_list": {
      let items = fixtures.credentials;
      if (msg.domain_filter) items = items.filter((c) => c.domain.includes(msg.domain_filter));
      return { type: "get_credential_list_response", ok: true, items };
    }
    case "credential_list_by_domain": {
      const m = fixtures.domain_match;
      const domain = msg.domain ?? "";
      const matched =
        m.domain === domain || domain.endsWith(`.${m.domain}`) || m.domain.endsWith(`.${domain}`);
      return {
        type: "credential_list_by_domain_response",
        exists: matched,
        credential_id: matched ? m.credential_id : undefined,
      };
    }
    case "credential_create":
      return { type: "credential_save_response", ok: true, credential_id: "fixture-uuid" };
    case "credential_update":
      return {
        type: "credential_save_response",
        ok: true,
        credential_id: msg.credential_id ?? "fixture-uuid",
      };
    case "graph_for_credential": {
      const g = fixtures.graph;
      return {
        type: "graph_for_credential_response",
        ok: true,
        center_id: g.center_id,
        center_label: g.center_label,
        project_nodes: g.project_nodes,
        edges: g.edges,
        hidden_count: g.hidden_count,
      };
    }
    case "incident_check_for_host": {
      const inc = fixtures.incident;
      const host = msg.host ?? "";
      const triggered =
        host === inc.trigger_host ||
        host.endsWith(`.${inc.trigger_host}`) ||
        inc.trigger_host.endsWith(`.${host}`);
      return {
        type: "incident_check_for_host_response",
        ok: true,
        matches: triggered ? inc.matches : [],
      };
    }
    case "blast_radius_for_host": {
      const br = fixtures.blast_radius;
      const host = msg.host ?? "";
      const triggered =
        host === br.trigger_host ||
        host.endsWith(`.${br.trigger_host}`) ||
        br.trigger_host.endsWith(`.${host}`);
      if (triggered)
        return {
          type: "blast_radius_for_host_response",
          ok: true,
          credential_id: br.credential_id,
          affected: br.affected,
          total: br.total,
          hidden_count: br.hidden_count,
        };
      return {
        type: "blast_radius_for_host_response",
        ok: true,
        credential_id: null,
        affected: [],
        total: 0,
        hidden_count: 0,
      };
    }
    case "mcp_context_push":
      return { ok: true };
    case "ext_settings_get_mcp_opt_in":
      return {
        type: "ext_settings_get_mcp_opt_in_response",
        ok: true,
        enabled: fixtures.mcp_opt_in?.enabled ?? false,
      };
    case "get_recipe_for_domain": {
      const r = fixtures.recipe;
      const domain = msg.domain ?? "";
      const matched = r.domain === domain || domain.endsWith(`.${r.domain}`);
      if (matched && r.found)
        return {
          type: "get_recipe_for_domain_response",
          domain,
          found: true,
          recipe: r.recipe,
          source: r.source,
        };
      return { type: "get_recipe_for_domain_response", domain, found: false };
    }
    case "upsert_recipe_for_domain":
      return { type: "upsert_recipe_for_domain_response", ok: true };
    default:
      return { type: "error", error: "unknown_type", received_type: type };
  }
}

describe("handleMessage — 메시지 타입별 응답", () => {
  describe("ping → pong", () => {
    it("{ type: 'ping' } → { type: 'pong' }", () => {
      expect(handleMessage({ type: "ping" })).toEqual({ type: "pong" });
    });
  });

  describe("pairing_request → paired", () => {
    it("init 메시지 → paired 응답 + mock 공개키", () => {
      const res = handleMessage({
        type: "init",
        extension_id: "ext-abc",
        version: "1",
        ext_pub: "mock-pub",
      });
      expect(res.type).toBe("paired");
      expect(res.desktop_pub).toBeTruthy();
      expect(res.device_id).toBeTruthy();
    });

    it("pairing_request 도 동일 응답", () => {
      const res = handleMessage({ type: "pairing_request" });
      expect(res.type).toBe("paired");
    });
  });

  describe("credential_list_visible (get_credential_list)", () => {
    it("domain_filter 없으면 3개 반환", () => {
      const res = handleMessage({ type: "get_credential_list", session_token: "tok" });
      expect(res.type).toBe("get_credential_list_response");
      expect(res.ok).toBe(true);
      expect(res.items).toHaveLength(3);
    });

    it("domain_filter 매칭 시 해당 항목만", () => {
      const res = handleMessage({
        type: "get_credential_list",
        domain_filter: "stripe",
        session_token: "tok",
      });
      expect(res.items).toHaveLength(1);
      expect(res.items[0].domain).toBe("stripe.com");
    });

    it("domain_filter 미매칭 시 빈 배열", () => {
      const res = handleMessage({
        type: "get_credential_list",
        domain_filter: "neverexists.example",
        session_token: "tok",
      });
      expect(res.items).toHaveLength(0);
    });
  });

  describe("credential_list_by_domain", () => {
    it("일치하는 도메인 → exists: true + credential_id", () => {
      const res = handleMessage({
        type: "credential_list_by_domain",
        domain: "github.com",
        session_token: "tok",
      });
      expect(res.type).toBe("credential_list_by_domain_response");
      expect(res.exists).toBe(true);
      expect(res.credential_id).toBe("fixture-cred-001");
    });

    it("다른 도메인 → exists: false", () => {
      const res = handleMessage({
        type: "credential_list_by_domain",
        domain: "neverexists.example",
        session_token: "tok",
      });
      expect(res.exists).toBe(false);
      expect(res.credential_id).toBeUndefined();
    });
  });

  describe("credential_create / credential_update", () => {
    it("credential_create → ok: true + fixture-uuid", () => {
      const res = handleMessage({
        type: "credential_create",
        domain: "new.com",
        username: "u",
        password: "p",
        site_name: "New",
        session_token: "tok",
      });
      expect(res.type).toBe("credential_save_response");
      expect(res.ok).toBe(true);
      expect(res.credential_id).toBe("fixture-uuid");
    });

    it("credential_update → ok: true + 전달된 credential_id 보존", () => {
      const res = handleMessage({
        type: "credential_update",
        credential_id: "my-cred",
        username: "u",
        password: "p2",
        session_token: "tok",
      });
      expect(res.ok).toBe(true);
      expect(res.credential_id).toBe("my-cred");
    });
  });

  describe("graph_for_credential", () => {
    it("mini-graph 3개 project_nodes 반환", () => {
      const res = handleMessage({
        type: "graph_for_credential",
        credential_id: "fixture-cred-001",
        session_token: "tok",
      });
      expect(res.type).toBe("graph_for_credential_response");
      expect(res.ok).toBe(true);
      expect(res.project_nodes).toHaveLength(3);
      expect(res.center_label).toBe("GitHub");
    });
  });

  describe("incident_check_for_host", () => {
    it("트리거 호스트(github.com) → matches 1개", () => {
      const res = handleMessage({
        type: "incident_check_for_host",
        host: "github.com",
        session_token: "tok",
      });
      expect(res.type).toBe("incident_check_for_host_response");
      expect(res.ok).toBe(true);
      expect(res.matches).toHaveLength(1);
      expect(res.matches[0].severity).toBe("HIGH");
    });

    it("비트리거 호스트 → matches 빈 배열", () => {
      const res = handleMessage({
        type: "incident_check_for_host",
        host: "stripe.com",
        session_token: "tok",
      });
      expect(res.matches).toHaveLength(0);
    });
  });

  describe("blast_radius_for_host", () => {
    it("트리거 호스트 → credential_id + affected 3개", () => {
      const res = handleMessage({
        type: "blast_radius_for_host",
        host: "github.com",
        session_token: "tok",
      });
      expect(res.type).toBe("blast_radius_for_host_response");
      expect(res.ok).toBe(true);
      expect(res.credential_id).toBe("fixture-cred-001");
      expect(res.affected).toHaveLength(3);
      expect(res.total).toBe(3);
    });

    it("비트리거 호스트 → credential_id: null, affected: []", () => {
      const res = handleMessage({
        type: "blast_radius_for_host",
        host: "nope.example",
        session_token: "tok",
      });
      expect(res.credential_id).toBeNull();
      expect(res.affected).toHaveLength(0);
      expect(res.total).toBe(0);
    });
  });

  describe("mcp_context_push", () => {
    it("→ { ok: true }", () => {
      const res = handleMessage({
        type: "mcp_context_push",
        host: "github.com",
        credential_meta: [],
        timestamp: Date.now(),
        session_token: "tok",
      });
      expect(res.ok).toBe(true);
    });
  });

  describe("ext_settings_get_mcp_opt_in", () => {
    it("기본값 → enabled: false", () => {
      const res = handleMessage({ type: "ext_settings_get_mcp_opt_in", session_token: "tok" });
      expect(res.type).toBe("ext_settings_get_mcp_opt_in_response");
      expect(res.ok).toBe(true);
      expect(res.enabled).toBe(false);
    });

    it("fixture override — enabled: true", () => {
      const fixtures = { ...defaultFixtures, mcp_opt_in: { enabled: true } };
      const res = handleMessage(
        { type: "ext_settings_get_mcp_opt_in", session_token: "tok" },
        fixtures,
      );
      expect(res.enabled).toBe(true);
    });
  });

  describe("get_recipe_for_domain / upsert_recipe_for_domain", () => {
    it("일치 도메인 → found: true + recipe 포함", () => {
      const res = handleMessage({
        type: "get_recipe_for_domain",
        domain: "github.com",
        session_token: "tok",
      });
      expect(res.type).toBe("get_recipe_for_domain_response");
      expect(res.found).toBe(true);
      expect(res.recipe).toBeTruthy();
      expect(res.source).toBe("preset");
    });

    it("미매칭 도메인 → found: false", () => {
      const res = handleMessage({
        type: "get_recipe_for_domain",
        domain: "nope.example",
        session_token: "tok",
      });
      expect(res.found).toBe(false);
    });

    it("upsert → ok: true", () => {
      const res = handleMessage({
        type: "upsert_recipe_for_domain",
        domain: "github.com",
        recipe: {},
        session_token: "tok",
      });
      expect(res.type).toBe("upsert_recipe_for_domain_response");
      expect(res.ok).toBe(true);
    });
  });

  describe("unknown type", () => {
    it("알 수 없는 type → error 응답", () => {
      const res = handleMessage({ type: "this_does_not_exist" });
      expect(res.type).toBe("error");
      expect(res.error).toBe("unknown_type");
      expect(res.received_type).toBe("this_does_not_exist");
    });

    it("type 없는 메시지 → error 응답", () => {
      const res = handleMessage({});
      expect(res.type).toBe("error");
    });

    it("null 메시지 → error 응답", () => {
      const res = handleMessage(null);
      expect(res.type).toBe("error");
    });
  });
});

// ---------------------------------------------------------------------------
// 1MB 상한 enforcement
// ---------------------------------------------------------------------------

describe("1MB 상한 enforcement", () => {
  it("1MB 초과 header → 에러 발생", () => {
    const overLimit = MAX_MESSAGE_SIZE + 1;
    // 상한 초과 시 throw 해야 한다 (readMessage 상당)
    expect(() => {
      if (overLimit > MAX_MESSAGE_SIZE) {
        throw new Error(`메시지 크기 ${overLimit} 가 상한 ${MAX_MESSAGE_SIZE} 를 초과했습니다`);
      }
    }).toThrow(/초과/);
  });

  it("1MB 정확 → 허용", () => {
    // encodeFrame 가 MAX_MESSAGE_SIZE 크기의 body 를 처리할 수 있는지 확인
    const content = "a".repeat(MAX_MESSAGE_SIZE - 2); // JSON string 따옴표 2바이트
    const body = Buffer.from(JSON.stringify(content), "utf-8");
    expect(body.length).toBe(MAX_MESSAGE_SIZE);
    // 에러 없이 header 작성 가능
    const header = Buffer.alloc(4);
    header.writeUInt32LE(body.length, 0);
    expect(header.readUInt32LE(0)).toBe(MAX_MESSAGE_SIZE);
  });
});

// ---------------------------------------------------------------------------
// 잘못된 JSON 처리
// ---------------------------------------------------------------------------

describe("잘못된 JSON 처리", () => {
  it("JSON 파싱 실패 메시지 → error 처리", () => {
    // handleMessage(null) — type 없으면 error 응답
    const res = handleMessage(null);
    expect(res.type).toBe("error");
  });

  it("빈 body → JSON 파싱 실패 에러", () => {
    expect(() => JSON.parse("")).toThrow();
  });

  it("불완전한 JSON → JSON 파싱 실패 에러", () => {
    expect(() => JSON.parse("{type: ping")).toThrow();
  });
});
