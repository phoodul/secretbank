#!/usr/bin/env node
// @file index.js
// @license AGPL-3.0-or-later
//
// Mock Native Messaging Host (Node.js stub) — E2E 테스트 전용.
//
// Tauri 앱 없이 단독 E2E 가능하도록 NM 프로토콜(4-byte LE header + UTF-8 JSON)을
// stdin/stdout 으로 처리하는 Node.js stub.
//
// 주의: stdout 은 NM 프로토콜 프레임 전용 — console.log / process.stdout.write(text) 금지.
//       디버그 출력은 stderr 만 사용.
//
// 용도: F-3 Playwright E2E / F-4 web-ext E2E 의 backend stub.
// 프로덕션 배포 미포함. CI-only.

"use strict";

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// 상수
// ---------------------------------------------------------------------------

/** NM 메시지 상한 — 1 MiB (Rust nm-host 와 동일) */
const MAX_MESSAGE_SIZE = 1_048_576;

/** fixture 파일 경로 (환경 변수 override 가능) */
const FIXTURE_PATH = process.env.SB_MOCK_FIXTURE_PATH ?? path.join(__dirname, "fixtures.json");

// ---------------------------------------------------------------------------
// fixture 로드
// ---------------------------------------------------------------------------

/**
 * fixture 데이터 로드.
 * 환경 변수 SB_MOCK_FIXTURE_PATH 또는 기본 fixtures.json 에서 읽는다.
 * 파일 없으면 내장 기본값 사용.
 */
function loadFixtures() {
  if (fs.existsSync(FIXTURE_PATH)) {
    try {
      const raw = fs.readFileSync(FIXTURE_PATH, "utf-8");
      return JSON.parse(raw);
    } catch (e) {
      process.stderr.write(`[mock-nm-host] fixture 파일 파싱 실패: ${e}\n`);
    }
  }
  return getDefaultFixtures();
}

/** 내장 기본 fixture — 테스트 공통 baseline */
function getDefaultFixtures() {
  return {
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
    domain_match: {
      domain: "github.com",
      credential_id: "fixture-cred-001",
    },
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
    mcp_opt_in: {
      enabled: false,
    },
  };
}

// ---------------------------------------------------------------------------
// 4-byte LE header 프로토콜 — 읽기/쓰기
// ---------------------------------------------------------------------------

/**
 * stdin 에서 NM 프레임 한 개를 읽어 JSON 객체로 반환한다.
 * EOF 시 null 반환.
 * @param {import("stream").Readable} readable
 * @returns {Promise<object | null>}
 */
function readMessage(readable) {
  return new Promise((resolve, reject) => {
    // 4-byte length header 읽기
    const headerBuf = Buffer.alloc(4);
    let headerRead = 0;

    function onHeaderData(chunk) {
      const needed = 4 - headerRead;
      const take = Math.min(chunk.length, needed);
      chunk.copy(headerBuf, headerRead, 0, take);
      headerRead += take;

      if (headerRead < 4) {
        // 헤더 더 필요 — 나머지 chunk 는 남아있지 않으므로 다음 data 이벤트 대기
        if (take < chunk.length) {
          // chunk 에 body 데이터도 포함된 경우 (unlikely with Node.js streams)
          readable.unshift(chunk.slice(take));
        }
        return;
      }

      // 헤더 완성
      readable.removeListener("data", onHeaderData);
      readable.removeListener("end", onEof);
      readable.removeListener("error", onErr);
      readable.pause();

      const bodyLen = headerBuf.readUInt32LE(0);

      // 1MB 상한 검사
      if (bodyLen > MAX_MESSAGE_SIZE) {
        return reject(
          new Error(`메시지 크기 ${bodyLen} 가 상한 ${MAX_MESSAGE_SIZE} 를 초과했습니다`),
        );
      }

      if (take < chunk.length) {
        // 헤더와 body 가 같은 chunk 에 섞인 경우 — unshift 로 되돌리기
        readable.unshift(chunk.slice(take));
      }

      // body 읽기
      const bodyBuf = Buffer.alloc(bodyLen);
      let bodyRead = 0;

      function consumeBody(c) {
        const need = bodyLen - bodyRead;
        const t = Math.min(c.length, need);
        c.copy(bodyBuf, bodyRead, 0, t);
        bodyRead += t;

        if (bodyRead >= bodyLen) {
          readable.removeListener("data", consumeBody);
          readable.removeListener("end", onBodyEof);
          readable.removeListener("error", onErr);
          readable.pause();

          if (t < c.length) {
            readable.unshift(c.slice(t));
          }

          const bodyStr = bodyBuf.toString("utf-8");
          let parsed;
          try {
            parsed = JSON.parse(bodyStr);
          } catch (e) {
            return reject(
              new Error(`JSON 파싱 실패: ${e.message} — body: ${bodyStr.slice(0, 100)}`),
            );
          }
          resolve(parsed);
        }
      }

      function onBodyEof() {
        reject(new Error("stdin EOF: body 읽기 중 예기치 않은 종료"));
      }

      if (bodyLen === 0) {
        // 빈 body → JSON 파싱 실패
        return reject(new Error("JSON 파싱 실패: empty body"));
      }

      readable.resume();
      readable.on("data", consumeBody);
      readable.on("end", onBodyEof);
      readable.on("error", onErr);
    }

    function onEof() {
      if (headerRead === 0) {
        // 깨끗한 EOF — extension 이 연결 종료
        resolve(null);
      } else {
        reject(new Error("stdin EOF: length header 읽기 중 예기치 않은 종료"));
      }
    }

    function onErr(err) {
      reject(err);
    }

    readable.resume();
    readable.on("data", onHeaderData);
    readable.on("end", onEof);
    readable.on("error", onErr);
  });
}

/**
 * stdout 에 NM 프레임 한 개를 쓴다.
 * @param {import("stream").Writable} writable
 * @param {object} msg
 */
function writeMessage(writable, msg) {
  const body = Buffer.from(JSON.stringify(msg), "utf-8");
  if (body.length > MAX_MESSAGE_SIZE) {
    throw new Error(`응답 크기 ${body.length} 가 상한 ${MAX_MESSAGE_SIZE} 를 초과했습니다`);
  }
  const header = Buffer.alloc(4);
  header.writeUInt32LE(body.length, 0);
  writable.write(header);
  writable.write(body);
}

// ---------------------------------------------------------------------------
// 메시지 처리 — fixture 응답
// ---------------------------------------------------------------------------

/**
 * 요청 메시지를 처리하여 응답 객체를 반환한다.
 * @param {object} msg
 * @param {object} fixtures
 * @returns {object}
 */
function handleMessage(msg, fixtures) {
  const type = msg?.type ?? "";

  switch (type) {
    // ── ping → pong ─────────────────────────────────────────────────────────
    case "ping":
      return { type: "pong" };

    // ── 페어링 ──────────────────────────────────────────────────────────────
    case "init":
    case "pairing_request":
      return {
        type: "paired",
        desktop_pub: fixtures.pairing.desktop_pub,
        device_id: fixtures.pairing.device_id,
      };

    // ── credential 전체 목록 조회 ────────────────────────────────────────────
    case "get_credential_list": {
      let items = fixtures.credentials;
      if (msg.domain_filter) {
        items = items.filter((c) => c.domain.includes(msg.domain_filter));
      }
      return { type: "get_credential_list_response", ok: true, items };
    }

    // ── 도메인 기준 credential 조회 ──────────────────────────────────────────
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

    // ── credential_create ────────────────────────────────────────────────────
    case "credential_create":
      return {
        type: "credential_save_response",
        ok: true,
        credential_id: "fixture-uuid",
      };

    // ── credential_update ────────────────────────────────────────────────────
    case "credential_update":
      return {
        type: "credential_save_response",
        ok: true,
        credential_id: msg.credential_id ?? "fixture-uuid",
      };

    // ── mini-graph ───────────────────────────────────────────────────────────
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

    // ── incident_check_for_host ──────────────────────────────────────────────
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

    // ── blast_radius_for_host ────────────────────────────────────────────────
    case "blast_radius_for_host": {
      const br = fixtures.blast_radius;
      const host = msg.host ?? "";
      const triggered =
        host === br.trigger_host ||
        host.endsWith(`.${br.trigger_host}`) ||
        br.trigger_host.endsWith(`.${host}`);
      if (triggered) {
        return {
          type: "blast_radius_for_host_response",
          ok: true,
          credential_id: br.credential_id,
          affected: br.affected,
          total: br.total,
          hidden_count: br.hidden_count,
        };
      }
      return {
        type: "blast_radius_for_host_response",
        ok: true,
        credential_id: null,
        affected: [],
        total: 0,
        hidden_count: 0,
      };
    }

    // ── mcp_context_push ─────────────────────────────────────────────────────
    case "mcp_context_push":
      return { ok: true };

    // ── ext_settings_get_mcp_opt_in ──────────────────────────────────────────
    case "ext_settings_get_mcp_opt_in":
      return {
        type: "ext_settings_get_mcp_opt_in_response",
        ok: true,
        enabled: fixtures.mcp_opt_in?.enabled ?? false,
      };

    // ── get_recipe_for_domain ─────────────────────────────────────────────────
    case "get_recipe_for_domain": {
      const r = fixtures.recipe;
      const domain = msg.domain ?? "";
      const matched = r.domain === domain || domain.endsWith(`.${r.domain}`);
      if (matched && r.found) {
        return {
          type: "get_recipe_for_domain_response",
          domain,
          found: true,
          recipe: r.recipe,
          source: r.source,
        };
      }
      return {
        type: "get_recipe_for_domain_response",
        domain,
        found: false,
      };
    }

    // ── upsert_recipe_for_domain ──────────────────────────────────────────────
    case "upsert_recipe_for_domain":
      return { type: "upsert_recipe_for_domain_response", ok: true };

    // ── unknown type ─────────────────────────────────────────────────────────
    default:
      return {
        type: "error",
        error: `unknown_type`,
        received_type: type,
      };
  }
}

// ---------------------------------------------------------------------------
// 메인 이벤트 루프
// ---------------------------------------------------------------------------

async function main() {
  const fixtures = loadFixtures();
  process.stderr.write("[mock-nm-host] 시작 — stdin 대기 중\n");

  // stdin 을 raw binary 모드로 처리
  process.stdin.pause();

  while (true) {
    let msg;
    try {
      msg = await readMessage(process.stdin);
    } catch (err) {
      process.stderr.write(`[mock-nm-host] 읽기 오류 (종료): ${err.message}\n`);
      break;
    }

    if (msg === null) {
      // EOF — graceful shutdown
      process.stderr.write("[mock-nm-host] stdin EOF — 정상 종료\n");
      break;
    }

    process.stderr.write(`[mock-nm-host] 수신: ${JSON.stringify(msg)}\n`);

    let response;
    try {
      response = handleMessage(msg, fixtures);
    } catch (err) {
      response = { type: "error", error: String(err.message) };
    }

    process.stderr.write(`[mock-nm-host] 송신: ${JSON.stringify(response)}\n`);

    try {
      writeMessage(process.stdout, response);
    } catch (err) {
      process.stderr.write(`[mock-nm-host] 쓰기 오류 (종료): ${err.message}\n`);
      break;
    }
  }

  process.exit(0);
}

main().catch((err) => {
  process.stderr.write(`[mock-nm-host] 치명적 오류: ${err.message}\n`);
  process.exit(1);
});
