/**
 * download-proxy — Cloudflare Worker
 *
 * secretbank.app/download/<tag>/<filename>  → GitHub Releases stream proxy
 * secretbank.app/api/latest                 → site/latest.json manifest proxy
 *
 * 보안: W1 path traversal / W2 SSRF / W4 TLS / W5 cache poisoning / W7 Content-Disposition
 */

// ─── 상수 ────────────────────────────────────────────────────────────────────

const REPO = "phoodul/secretbank";

// W4: 컴파일 시점에 https:// 강제 — string literal 로 보장, HTTP 다운그레이드 코드 없음
const GITHUB_BASE = `https://github.com/${REPO}/releases/download`;
const MANIFEST_URL = "https://secretbank.app/latest.json";

// W1: tag 형식 — v1.2.3, v0.1.0-pre11, v0.1.0-pre10-test.0 등 허용
// pre-release 식별자에 하이픈(-) 추가 허용 (SemVer pre-release 관례)
const TAG_RE = /^v\d+\.\d+\.\d+([-a-zA-Z0-9.]+)?$/;

// W1: filename 허용 문자 — 영숫자, 점, 하이픈, 밑줄만 허용. 첫 문자는 영숫자.
const FILENAME_SAFE_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

// W1: 허용 확장자 — endsWith 검증 (regex 미사용, `.` 이스케이프 이슈 없음)
const ALLOWED_EXTS = [
  ".exe",
  ".msi",
  ".dmg",
  ".app.tar.gz",
  ".AppImage",
  ".deb",
  ".rpm",
  ".sig",
  ".json",
] as const;

// upstream 에서 클라이언트로 전달할 헤더 목록
const FORWARD_HEADERS = [
  "Content-Type",
  "Content-Length",
  "ETag",
  "Last-Modified",
  "Accept-Ranges",
] as const;

// ─── 메인 fetch 핸들러 ────────────────────────────────────────────────────────

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // /api/latest — manifest proxy
    if (url.pathname === "/api/latest") {
      return handleManifest();
    }

    // /download/<tag>/<filename> — stream proxy
    const dlMatch = url.pathname.match(/^\/download\/([^/]+)\/(.+)$/);
    if (dlMatch) {
      const tag = dlMatch[1] ?? "";
      const filename = dlMatch[2] ?? "";
      return handleDownload(tag, filename, request);
    }

    return new Response("Not Found", { status: 404 });
  },
};

// ─── 다운로드 핸들러 ──────────────────────────────────────────────────────────

async function handleDownload(tag: string, filename: string, request: Request): Promise<Response> {
  // W1-a: URL decode 후 .. 포함 시 즉시 403
  let decodedFilename: string;
  let decodedTag: string;
  try {
    decodedFilename = decodeURIComponent(filename);
    decodedTag = decodeURIComponent(tag);
  } catch {
    return forbidden("invalid URL encoding");
  }

  if (decodedFilename.includes("..") || decodedTag.includes("..")) {
    return forbidden("path traversal detected");
  }

  // W1-b: tag 형식 검증
  if (!TAG_RE.test(tag)) {
    return forbidden("invalid tag format");
  }

  // W1-c: filename 허용 문자 검증
  if (!FILENAME_SAFE_RE.test(filename)) {
    return forbidden("invalid filename characters");
  }

  // W1-d: 허용 확장자 검증 (endsWith — regex 미사용)
  const hasAllowedExt = ALLOWED_EXTS.some((ext) => filename.endsWith(ext));
  if (!hasAllowedExt) {
    return forbidden("file extension not allowed");
  }

  // W2: upstream URL 은 하드코딩된 REPO + 검증된 tag/filename 으로만 구성
  const upstreamUrl = `${GITHUB_BASE}/${tag}/${filename}`;

  // Range 헤더 pass-through (있으면)
  const rangeHeader = request.headers.get("Range");
  const upstreamHeaders: HeadersInit = {
    "User-Agent": "secretbank-proxy/1.0",
  };
  if (rangeHeader !== null) {
    upstreamHeaders["Range"] = rangeHeader;
  }

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, {
      redirect: "follow",
      headers: upstreamHeaders,
    });
  } catch {
    return new Response("Bad Gateway: upstream fetch failed", { status: 502 });
  }

  // Range 요청은 206이 정상. 그 외 2xx 외 응답은 502.
  if (!upstream.ok && upstream.status !== 206) {
    return new Response(`Bad Gateway: upstream returned ${upstream.status}`, { status: 502 });
  }

  // 응답 헤더 구성
  const responseHeaders = new Headers();

  // upstream 헤더 선택적 복사
  for (const headerName of FORWARD_HEADERS) {
    const value = upstream.headers.get(headerName);
    if (value !== null) {
      responseHeaders.set(headerName, value);
    }
  }

  // W7: Content-Disposition 강제 (attachment — 브라우저 인라인 실행 방지)
  const existingDisposition = upstream.headers.get("Content-Disposition");
  if (existingDisposition !== null) {
    responseHeaders.set("Content-Disposition", existingDisposition);
  } else {
    responseHeaders.set("Content-Disposition", `attachment; filename="${filename}"`);
  }

  // Set-Cookie 제거 (upstream 에서 혹시 올 경우 차단)
  // (Headers 복사 시 명시적으로 포함하지 않으므로 자동 제거됨)

  // 검색엔진 인덱싱 방지
  responseHeaders.set("X-Robots-Tag", "noindex");

  // body 를 소비하지 않고 ReadableStream 으로 그대로 전달 (CPU time 최소)
  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}

// ─── manifest 핸들러 ──────────────────────────────────────────────────────────

async function handleManifest(): Promise<Response> {
  let upstream: Response;
  try {
    upstream = await fetch(MANIFEST_URL);
  } catch {
    return new Response("Bad Gateway: manifest fetch failed", { status: 502 });
  }

  if (!upstream.ok) {
    return new Response(`Bad Gateway: manifest returned ${upstream.status}`, { status: 502 });
  }

  const responseHeaders = new Headers();
  responseHeaders.set("Content-Type", "application/json");
  // W5: KV 캐시 없음 — Pages edge 캐시가 담당. 60초 TTL.
  responseHeaders.set("Cache-Control", "public, max-age=60");
  responseHeaders.set("Access-Control-Allow-Origin", "https://secretbank.app");
  responseHeaders.set("X-Robots-Tag", "noindex");

  // body stream pass-through (body 를 소비하지 않음)
  return new Response(upstream.body, {
    status: 200,
    headers: responseHeaders,
  });
}

// ─── 헬퍼 ────────────────────────────────────────────────────────────────────

function forbidden(reason: string): Response {
  return new Response(`Forbidden: ${reason}`, { status: 403 });
}
