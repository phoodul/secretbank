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

async function fetchLatestRelease(): Promise<Release | null> {
  const resp = await fetch(GH_API, {
    headers: {
      "user-agent": "secretbank-relay",
      accept: "application/vnd.github+json",
    },
  });
  if (!resp.ok) return null;
  const arr = (await resp.json()) as Release[];
  return arr[0] ?? null;
}

download.get("/latest.json", async (c) => {
  const release = await fetchLatestRelease();
  if (!release) {
    return c.json({ error: "github_api_failed" }, 502);
  }
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

  const release = await fetchLatestRelease();
  if (!release) {
    return c.json({ error: "github_api_failed" }, 502);
  }
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
