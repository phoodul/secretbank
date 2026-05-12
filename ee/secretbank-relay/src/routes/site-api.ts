/**
 * /api/latest + /releases.json — site/index.html 의 download grid JS 호환.
 *
 * site JS 가 호출:
 *   - fetch("/api/latest")     → Tauri auto-updater manifest (latest.json asset 내용 그대로)
 *   - fetch("/releases.json")  → release 목록 { releases: [GitHub release objects] }
 *
 * 두 endpoint 모두 secretbank.app 도메인에서 직접 응답. github.com URL
 * 노출 금지 — site JS 의 classify() 가 만드는 download URL 도 이미
 * `https://secretbank.app/download/<tag>/<filename>` 패턴 사용.
 */
import { Hono } from "hono";
import type { Env } from "../env";
import { fetchAllPublishedReleases, fetchLatestRelease } from "./download";

export const siteApi = new Hono<{ Bindings: Env }>();

/** GET /api/latest — Tauri auto-updater manifest (latest.json asset stream). */
siteApi.get("/latest", async (c) => {
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

/**
 * GET /releases.json — released history (assets > 0, published_at desc).
 *
 * site JS 의 fetchReleases() 는 응답이 `Array.isArray(data)` 면 그대로,
 * 아니면 `data.releases` 를 사용. 우리는 array 직접 반환.
 */
export const releasesHandler = async (c: import("hono").Context<{ Bindings: Env }>) => {
  const list = await fetchAllPublishedReleases(c.env);
  if (!list.ok) {
    return c.json({ error: "github_api_failed", status: list.status, body: list.body }, 502);
  }
  // site JS 가 필요한 field 만 추려서 응답 크기 축소.
  const compact = list.releases.map((r) => ({
    tag_name: r.tag_name,
    name: r.tag_name,
    prerelease: r.tag_name.includes("-"),
    published_at: r.published_at,
    assets: r.assets.map((a) => ({
      name: a.name,
      size: a.size,
      // browser_download_url 은 site JS 가 무시 (classify 가 url 직접 생성).
    })),
  }));
  return c.json(compact, 200, {
    "cache-control": "public, max-age=300",
  });
};
