import { SELF } from "cloudflare:test";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * download-proxy 단위 테스트
 *
 * @cloudflare/vitest-pool-workers 환경에서 실행.
 * SELF = 이 Worker 자신에 대한 fetch 래퍼.
 * 외부 fetch (GitHub CDN, MANIFEST_URL) 는 vi.spyOn 으로 mock.
 */

// ─── fetch mock 유틸 ──────────────────────────────────────────────────────────

/**
 * globalThis.fetch 를 mock 하여 upstream 응답을 제어한다.
 * Worker 내부에서 호출하는 fetch() 가 이 mock 으로 대체된다.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function mockFetch(status: number, body: string | null = "", headers: Record<string, string> = {}) {
  // mockImplementation 으로 매 호출마다 새 Response 를 생성.
  // mockResolvedValue 에 Response 인스턴스를 직접 넘기면 Workers 런타임에서
  // "I/O on behalf of a different request" 오류가 발생한다.
  return vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(() => Promise.resolve(new Response(body, { status, headers })));
}

// ─── 테스트 ───────────────────────────────────────────────────────────────────

describe("handleDownload — 검증 통과 케이스", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let fetchSpy: ReturnType<typeof mockFetch>;

  beforeEach(() => {
    // 기본 mock: GitHub CDN 이 200 OK + 파일 크기 반환
    fetchSpy = mockFetch(200, "binary-data", {
      "Content-Type": "application/octet-stream",
      "Content-Length": "11",
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("TC-01: 정상 .exe 파일 — 200 반환 + upstream fetch 호출됨", async () => {
    const res = await SELF.fetch(
      "https://api-vault.app/download/v0.1.0-pre10/api-vault_0.1.0_x64-setup.exe",
    );
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledOnce();
    const calledUrl = String((fetchSpy.mock.calls[0] as unknown[])[0]);
    expect(calledUrl).toBe(
      "https://github.com/phoodul/api-vault/releases/download/v0.1.0-pre10/api-vault_0.1.0_x64-setup.exe",
    );
  });

  it("TC-02: pre 태그 형식 (.deb) — 200 반환", async () => {
    const res = await SELF.fetch(
      "https://api-vault.app/download/v0.1.0-pre10-test.0/api-vault.deb",
    );
    expect(res.status).toBe(200);
  });

  it("TC-08: .app.tar.gz (multi-dot 확장자) — 200 반환", async () => {
    const res = await SELF.fetch("https://api-vault.app/download/v0.1.0/api-vault.app.tar.gz");
    expect(res.status).toBe(200);
  });
});

describe("handleDownload — 검증 거부 케이스 (403)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("TC-03: tag 가 'main' — 403 (TAG_RE 위반)", async () => {
    const res = await SELF.fetch("https://api-vault.app/download/main/api-vault.exe");
    expect(res.status).toBe(403);
  });

  it("TC-04: path traversal ../../etc/passwd — 403", async () => {
    // URL 인코딩 없이 그대로 보내면 URL 파서가 정규화하므로
    // %2e%2e 인코딩 형태로 테스트
    const res = await SELF.fetch("https://api-vault.app/download/v1.0.0/%2e%2e%2fetc%2fpasswd");
    expect(res.status).toBe(403);
  });

  it("TC-05: 미허용 확장자 .sh — 403", async () => {
    const res = await SELF.fetch("https://api-vault.app/download/v0.1.0/file.sh");
    expect(res.status).toBe(403);
  });

  it("TC-06: URL-encoded .. 포함 파일명 — 403", async () => {
    const res = await SELF.fetch("https://api-vault.app/download/v0.1.0/file%2e%2e%2fetc");
    expect(res.status).toBe(403);
  });

  it("TC-07: .exe.bak — 403 (endsWith('.exe') 통과 안함)", async () => {
    const res = await SELF.fetch("https://api-vault.app/download/v0.1.0/api-vault.exe.bak");
    expect(res.status).toBe(403);
  });

  it("TC-12: /download/v0.1.0/ (filename 누락) — 404", async () => {
    const res = await SELF.fetch("https://api-vault.app/download/v0.1.0/");
    // regex /^\/download\/([^/]+)\/(.+)$/ 는 빈 filename 에 매칭 안됨 → 404
    expect(res.status).toBe(404);
  });
});

describe("handleManifest — /api/latest", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("TC-09: 정상 응답 — 200 + Content-Type + CORS 헤더", async () => {
    mockFetch(200, '{"version":"0.1.0"}', {
      "Content-Type": "application/json",
    });

    const res = await SELF.fetch("https://api-vault.app/api/latest");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/json");
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://api-vault.app");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=60");
    expect(res.headers.get("X-Robots-Tag")).toBe("noindex");
  });

  it("TC-10: upstream 502 → 응답도 502", async () => {
    mockFetch(502, "Bad Gateway");

    const res = await SELF.fetch("https://api-vault.app/api/latest");
    expect(res.status).toBe(502);
  });
});

describe("기타 라우팅", () => {
  it("TC-11: / → 404", async () => {
    const res = await SELF.fetch("https://api-vault.app/");
    expect(res.status).toBe(404);
  });
});

describe("Range 헤더 pass-through (TC-13)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("Range 헤더가 upstream fetch 에 전달됨", async () => {
    const fetchSpy = mockFetch(206, "partial", {
      "Content-Range": "bytes 0-1023/1048576",
      "Accept-Ranges": "bytes",
    });

    const res = await SELF.fetch(
      "https://api-vault.app/download/v0.1.0/api-vault_0.1.0_x64-setup.exe",
      { headers: { Range: "bytes=0-1023" } },
    );

    // 206 Partial Content 는 ok=false 이지만 Worker 가 통과시킴
    expect(res.status).toBe(206);

    const upstreamCallHeaders = (fetchSpy.mock.calls[0] as [string, RequestInit])[1]?.headers as
      | Record<string, string>
      | undefined;
    expect(upstreamCallHeaders?.["Range"]).toBe("bytes=0-1023");
  });
});

describe("Content-Disposition 강제 (TC-14)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("upstream 이 Content-Disposition 미포함 시 Worker 가 attachment 추가", async () => {
    // Content-Disposition 없이 응답
    mockFetch(200, "data", { "Content-Type": "application/octet-stream" });

    const res = await SELF.fetch(
      "https://api-vault.app/download/v0.1.0/api-vault_0.1.0_x64-setup.exe",
    );
    expect(res.status).toBe(200);
    const disposition = res.headers.get("Content-Disposition");
    expect(disposition).not.toBeNull();
    expect(disposition).toContain("attachment");
    expect(disposition).toContain("api-vault_0.1.0_x64-setup.exe");
  });
});
