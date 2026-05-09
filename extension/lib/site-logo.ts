// SPDX-License-Identifier: AGPL-3.0-or-later
//
// extension/lib/site-logo.ts — M24-E Phase E-3
//
// Site Logo 해석기. fallback chain:
//   1. bundled SVG  — extension/public/icons/issuers/{slug}.svg
//   2. favicon-proxy — Google S2 Favicons (host 만 전달, 사용자 정보 0)
//   3. letter fallback — 첫 글자 + 결정적 background color
//
// Privacy: 외부 호출 시 query 에 host 만 포함. user_id / session_token / vault info 미포함.
// 주의: 외부 favicon proxy 사용 시 도메인 정보가 외부 서버(Google)에 전달됨.
//       자체 Worker(secretbank.app/favicon)로 교체 시 개인 정보 제어 향상.

import { idbGet, idbSet } from "./idb-cache.js";

// ---------------------------------------------------------------------------
// 타입
// ---------------------------------------------------------------------------

export type SiteLogoKind = "bundled" | "remote" | "letter";

export interface SiteLogoResult {
  kind: SiteLogoKind;
  /** bundled: chrome-extension:// URL / remote: data: URL (base64) */
  url?: string;
  /** letter fallback 시 표시할 단일 문자 */
  letter?: string;
  /** letter fallback 시 배경색 (oklch CSS string) */
  bg?: string;
}

// ---------------------------------------------------------------------------
// 상수
// ---------------------------------------------------------------------------

/** 캐시 TTL = 24h */
const FAVICON_TTL_MS = 86_400_000;

/** favicon fetch timeout = 3s */
const FETCH_TIMEOUT_MS = 3_000;

/** favicon proxy URL 템플릿.
 *
 * Privacy 주석:
 *   Google S2 Favicons API 는 도메인(host)만 전달함.
 *   사용자 인증 정보(user_id, session_token, vault 데이터)는 전달되지 않음.
 *   도메인 정보가 Google 서버에 전달된다는 사실은 docs/PRIVACY.md 에 명시되어 있음.
 *   자체 Worker 대비 privacy 가 낮으므로 향후 api.secretbank.app/favicon/{host} 로 교체 예정.
 */
const FAVICON_PROXY_URL = (host: string) =>
  `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`;

/** 번들된 SVG 가 존재하는 preset slug 목록 (public/icons/issuers/ 에 실제 파일이 있는 것만). */
const BUNDLED_SLUGS = new Set([
  "github",
  "google",
  "aws",
  "vercel",
  "cloudflare",
  "openai",
  "stripe",
]);

// ---------------------------------------------------------------------------
// domain → slug 변환 (Rust domain_to_slug 의 TypeScript 포팅)
// ---------------------------------------------------------------------------

/**
 * 도메인에서 issuer slug 를 추출한다.
 * 규칙: www./ 제거 → TLD 제거 → 2단 도메인의 경우 두 번째 마지막 부분.
 *
 * 예시:
 *   github.com          → github
 *   api.github.com      → github
 *   www.github.com      → github
 *   api.openai.com      → openai
 *   supabase.io         → supabase
 */
export function domainToSlug(domain: string): string {
  let host = domain.trim().toLowerCase();
  // scheme 제거
  if (host.startsWith("https://")) host = host.slice(8);
  else if (host.startsWith("http://")) host = host.slice(7);
  // path 제거
  host = host.split("/")[0] ?? host;
  // port 제거
  host = host.split(":")[0] ?? host;
  // www. 제거
  if (host.startsWith("www.")) host = host.slice(4);

  const parts = host.split(".");
  if (parts.length === 0 || (parts.length === 1 && parts[0] === "")) return "unknown";
  if (parts.length === 1) return parts[0]!;
  if (parts.length === 2) return parts[0]!;
  // 3+ 파트: 두 번째 마지막 (TLD 직전)
  return parts[parts.length - 2]!;
}

// ---------------------------------------------------------------------------
// letter fallback — 결정적 색상 (string hash → oklch hue)
// ---------------------------------------------------------------------------

/**
 * 도메인 문자열을 hashing 해 oklch hue(0~360)를 생성한다.
 * 같은 도메인은 항상 같은 색을 반환한다.
 */
function hashHue(domain: string): number {
  let h = 5381;
  for (let i = 0; i < domain.length; i++) {
    h = ((h << 5) + h) ^ domain.charCodeAt(i);
    h = h >>> 0; // uint32 유지
  }
  return h % 360;
}

function letterResult(domain: string): SiteLogoResult {
  const slug = domainToSlug(domain);
  const letter = slug.charAt(0).toUpperCase();
  const hue = hashHue(domain);
  const bg = `oklch(0.55 0.18 ${hue})`;
  return { kind: "letter", letter, bg };
}

// ---------------------------------------------------------------------------
// bundled SVG — WXT 빌드 시 public/ 파일은 extension root 에 위치
// ---------------------------------------------------------------------------

function bundledIconUrl(slug: string): string {
  // WXT: public/ 디렉토리 파일은 빌드된 확장 루트에 복사됨.
  // chrome-extension:// URL 을 직접 생성할 수 없으므로 상대 경로 사용 (content script 맥락).
  // popup / content script 에서 동일하게 작동.
  return chrome.runtime.getURL(`icons/issuers/${slug}.svg`);
}

// ---------------------------------------------------------------------------
// favicon fetch (3s timeout + 4xx/5xx fallback)
// ---------------------------------------------------------------------------

async function fetchFaviconAsDataUrl(host: string): Promise<string | null> {
  const url = FAVICON_PROXY_URL(host);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const resp = await fetch(url, {
      signal: controller.signal,
      // Privacy: 자격증명(쿠키/인증 헤더) 미포함
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
    clearTimeout(timer);

    if (!resp.ok) return null;

    const blob = await resp.blob();
    // 이미지 타입 검증
    if (!blob.type.startsWith("image/")) return null;
    // 1×1 이하 픽셀은 favicon 없음 신호 (Google S2 가 1×1 PNG 반환)
    if (blob.size < 200) return null;

    return new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    clearTimeout(timer);
    return null;
  }
}

// ---------------------------------------------------------------------------
// 메인 API
// ---------------------------------------------------------------------------

/**
 * 도메인에 대한 site logo 를 반환한다.
 *
 * fallback chain:
 *   1. bundled SVG (preset 7 issuer)
 *   2. favicon-proxy (Google S2, IndexedDB 24h 캐시)
 *   3. letter fallback (첫 글자 + 결정적 bg)
 *
 * Privacy: favicon-proxy 호출 시 host 만 전달, user_id / session_token 미포함.
 */
export async function getSiteLogo(domain: string): Promise<SiteLogoResult> {
  const slug = domainToSlug(domain);

  // 1. bundled SVG 존재 확인
  if (BUNDLED_SLUGS.has(slug)) {
    return { kind: "bundled", url: bundledIconUrl(slug) };
  }

  // host 정규화 (캐시 키용)
  const host = domain.trim().toLowerCase().split("/")[0]?.split(":")[0] ?? domain;

  // 캐시 키 (sha256 없이 host 직접 사용 — 브라우저 extension 환경은 신뢰된 호출자)
  const cacheKey = `favicon:v1:${host}`;

  // 2. 캐시 확인
  const cached = await idbGet<SiteLogoResult>(cacheKey);
  if (cached !== null) {
    return cached.value;
  }

  // 3. favicon-proxy 호출
  const dataUrl = await fetchFaviconAsDataUrl(host);
  if (dataUrl !== null) {
    const result: SiteLogoResult = { kind: "remote", url: dataUrl };
    // 캐시 저장 (실패해도 무시)
    void idbSet(cacheKey, result, FAVICON_TTL_MS);
    return result;
  }

  // 4. letter fallback — 캐시하지 않음 (항상 결정적이므로)
  return letterResult(domain);
}
