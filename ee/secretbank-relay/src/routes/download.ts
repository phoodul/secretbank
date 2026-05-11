/**
 * /download/* — Desktop installer / manifest stream proxy.
 *
 * 정책 (사용자 결정 2026-05-11): 모든 binary 는 secretbank.app 도메인에서
 * 직접 stream 으로 serve. github.com URL 노출 금지 (302 redirect 도 X).
 * GitHub Releases 는 internal storage 로만 사용.
 *
 * Endpoints:
 *   GET /download/win        Windows x64 installer (.exe)
 *   GET /download/mac        macOS universal .dmg
 *   GET /download/appimage   Linux AppImage (x86_64)
 *   GET /download/deb        Linux .deb (Debian/Ubuntu)
 *   GET /download/rpm        Linux .rpm (Fedora/RHEL)
 *   GET /download/latest.json   Tauri auto-updater manifest
 *
 * 동작:
 *   1. GitHub API `releases?per_page=1` 로 가장 최근 release (prerelease 포함)
 *      메타데이터 fetch
 *   2. assets 에서 platform 패턴 매칭
 *   3. asset 의 browser_download_url 을 fetch + body 를 그대로 stream forward
 *   4. content-disposition: attachment + 원본 filename 유지
 *
 * Worker stream proxy 는 binary 를 메모리에 buffer 안 함 — Cloudflare 가
 * upstream chunk 를 client 로 그대로 forward. 큰 binary (~10-200MB) 도 OK.
 */
import { Hono } from "hono";
import type { Env } from "../env";

export const download = new Hono<{ Bindings: Env }>();

const GH_API = "https://api.github.com/repos/phoodul/secretbank/releases?per_page=1";

// KV cache key + TTL. GitHub API rate limit (60/h per IP, IPs shared across
// Cloudflare Workers) means uncached calls quickly 403. 5-min cache cuts
// upstream calls to ≤12/h per Worker IP regardless of inbound download traffic.
// v3 = Cloudflare Worker fetch sub-request cache (GitHub API 응답의
// `Cache-Control: public, max-age=60` 헤더에 따라 edge cache) 가 stale
// pre9 응답을 캐싱한 채로 v2 KV 에 박았던 케이스 무효화.
const CACHE_KEY = "download:latest-release-v3";
// TTL 60초 = 자동 만료로 stale data 영향 ≤1분.
const CACHE_TTL_S = 60;

interface ReleaseAsset {
  name: string;
  browser_download_url: string;
  size: number;
}

interface Release {
  tag_name: string;
  assets: ReleaseAsset[];
}

const PLATFORM_PATTERNS: Record<string, RegExp> = {
  win: /_x64-setup\.exe$/,
  mac: /_universal\.dmg$/,
  appimage: /_amd64\.AppImage$/,
  deb: /_amd64\.deb$/,
  rpm: /\.x86_64\.rpm$/,
};

type FetchResult = { ok: true; release: Release } | { ok: false; status: number; body: string };

async function fetchLatestRelease(env: Env): Promise<FetchResult> {
  // KV hit — skip GitHub call entirely
  const cached = await env.TOKEN_CACHE.get(CACHE_KEY, "json");
  if (cached) return { ok: true, release: cached as Release };

  const headers: Record<string, string> = {
    "user-agent": "secretbank-relay",
    accept: "application/vnd.github+json",
    // GitHub API 응답의 max-age=60 을 Cloudflare Worker fetch sub-request
    // cache 가 honour 하면서 옛 release 응답 (pre9 시점) 을 그대로 stale
    // 반환하던 케이스 차단.
    "cache-control": "no-store",
  };
  // Authenticated calls = 5000/h per token vs 60/h per shared Worker IP.
  if (env.GITHUB_API_TOKEN) {
    headers["authorization"] = `Bearer ${env.GITHUB_API_TOKEN}`;
  }

  let resp: Response;
  try {
    // cf.cacheTtl=0 — Cloudflare 의 fetch sub-request cache 완전 우회
    resp = await fetch(GH_API, {
      headers,
      cf: { cacheTtl: 0, cacheEverything: false },
    } as RequestInit);
  } catch (e) {
    return { ok: false, status: 0, body: `fetch threw: ${String(e).slice(0, 200)}` };
  }
  if (!resp.ok) {
    const body = await resp.text().catch(() => "<no body>");
    return { ok: false, status: resp.status, body: body.slice(0, 300) };
  }
  const arr = (await resp.json()) as Release[];
  const release = arr[0];
  if (!release) return { ok: false, status: 200, body: "empty releases array" };

  // Cache for CACHE_TTL_S (write is fire-and-forget; failure not fatal)
  await env.TOKEN_CACHE.put(CACHE_KEY, JSON.stringify(release), {
    expirationTtl: CACHE_TTL_S,
  });
  return { ok: true, release };
}

download.get("/latest.json", async (c) => {
  const result = await fetchLatestRelease(c.env);
  if (!result.ok) {
    return c.json({ error: "github_api_failed", status: result.status, body: result.body }, 502);
  }
  const release = result.release;
  const manifest = release.assets.find((a) => a.name === "latest.json");
  if (!manifest) {
    return c.json({ error: "manifest_not_found", version: release.tag_name }, 404);
  }
  const upstream = await fetch(manifest.browser_download_url, {
    headers: { "user-agent": "secretbank-relay" },
  });
  if (!upstream.ok) {
    return c.json({ error: "manifest_fetch_failed", status: upstream.status }, 502);
  }
  return new Response(upstream.body, {
    status: 200,
    headers: {
      "content-type": "application/json",
      "cache-control": "public, max-age=300",
    },
  });
});

download.get("/:platform", async (c) => {
  const platform = c.req.param("platform");
  const pattern = PLATFORM_PATTERNS[platform];
  if (!pattern) {
    return c.json(
      {
        error: "unknown_platform",
        platform,
        supported: Object.keys(PLATFORM_PATTERNS),
      },
      404,
    );
  }

  const result = await fetchLatestRelease(c.env);
  if (!result.ok) {
    return c.json({ error: "github_api_failed", status: result.status, body: result.body }, 502);
  }
  const release = result.release;
  const asset = release.assets.find((a) => pattern.test(a.name));
  if (!asset) {
    return c.json(
      {
        error: "asset_not_found",
        platform,
        version: release.tag_name,
        available: release.assets.map((a) => a.name),
      },
      404,
    );
  }

  const upstream = await fetch(asset.browser_download_url, {
    headers: { "user-agent": "secretbank-relay" },
  });
  if (!upstream.ok) {
    return c.json({ error: "asset_fetch_failed", status: upstream.status }, 502);
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "content-type": "application/octet-stream",
      "content-disposition": `attachment; filename="${asset.name}"`,
      "content-length": String(asset.size),
      "cache-control": "public, max-age=600",
    },
  });
});
