# Pre-step Worker download-proxy 사전 조사

> 작성일: 2026-05-08  
> 조사 범위: Cloudflare Worker stream proxy / GitHub Releases URL / Workers 플랜 한계 / tauri-plugin-updater 스키마 / release.yml 자동 commit / wrangler routes 충돌  
> 출처 수: 18개 (Cloudflare 공식 docs 6, GitHub 공식 docs 1, tauri 공식 docs 2, OSS repo 3, 커뮤니티/블로그 6)

---

## 1. Cloudflare Worker stream proxy 패턴

### 1.1 핵심 패턴 — "verbatim pass-through"

공식 문서(Cloudflare Workers best practices, Streams API)의 핵심 원칙:

> "If your Worker only forwards subrequest responses to the client verbatim without reading their body text, then its body handling is already **already optimal** and you do not have to use these APIs."
> — Cloudflare Workers Streams docs

즉, **가장 효율적인 stream proxy 는 response body 를 전혀 읽지 않는 것**이다. GitHub Releases CDN 응답을 그대로 클라이언트에 전달할 때:

```typescript
// 최단 경로 — body 를 소비하지 않으므로 CPU time 최소, 메모리 128 MB 한계 무관
export default {
  async fetch(request: Request): Promise<Response> {
    const upstreamUrl = buildGitHubUrl(request.url);
    const upstream = await fetch(upstreamUrl, {
      headers: { "User-Agent": "api-vault-proxy/1.0" },
    });
    // upstream.body (ReadableStream) 를 그대로 포함한 새 Response 반환
    return new Response(upstream.body, {
      status: upstream.status,
      headers: upstream.headers,
    });
  },
};
```

이 패턴에서 `fetch()` 호출의 wall-clock time(네트워크 대기)은 CPU time 에 포함되지 않는다. 따라서 수백 MB 파일도 free plan(CPU 10 ms)에서 안전하게 proxy 가능.

### 1.2 헤더 수정이 필요할 때 — TransformStream

응답 헤더를 수정해야 하면 TransformStream 을 사용한다:

```typescript
const { readable, writable } = new TransformStream();
upstream.body.pipeTo(writable); // await 하지 않음 — 비동기 백그라운드 실행

return new Response(readable, {
  status: upstream.status,
  headers: modifiedHeaders,
});
```

`pipeTo()` 를 `await` 하지 않는 이유: 클라이언트로 응답을 먼저 반환한 뒤 스트리밍이 백그라운드에서 계속 흐르도록 하기 위함.

### 1.3 Range 요청 처리

브라우저와 다운로드 매니저는 대용량 파일을 위해 `Range: bytes=N-M` 요청을 보낼 수 있다.
- **권장 방법**: `Range` 헤더를 upstream `fetch()` 에 그대로 전달. GitHub CDN(`objects.githubusercontent.com`)은 Range 요청을 지원.
- **주의**: Cloudflare community 에서 Workers 가 특정 케이스에서 Range 헤더를 무시한다는 리포트가 있음 (2024). 캐시를 거치지 않는 직접 subrequest 에서는 일반적으로 동작. 만약 Range 가 동작하지 않으면 `206 Partial Content` 대신 `200 OK` 전체 응답이 내려와 클라이언트가 다시 시작.
- **결론**: `Range` 헤더를 upstream 에 forwarding 하는 코드를 포함시키되, 동작 검증을 dogfooding 단계에서 확인.

```typescript
// Range 헤더 전달 예시
const rangeHeader = request.headers.get("Range");
const upstreamHeaders: HeadersInit = { "User-Agent": "api-vault-proxy/1.0" };
if (rangeHeader) {
  upstreamHeaders["Range"] = rangeHeader;
}
const upstream = await fetch(upstreamUrl, { headers: upstreamHeaders });
```

### 1.4 Cache-Control / CORS 헤더 처리

- GitHub CDN 응답에는 이미 `Content-Type`, `Content-Length`, `ETag` 가 포함됨 → upstream.headers 를 그대로 전달.
- `Access-Control-Allow-Origin` 은 GitHub CDN 이 포함하지 않음 → 브라우저에서 JS `fetch()` 로 접근 시 CORS 오류. `site/index.html` 은 `<a href>` 링크 또는 `window.location.href` 방식이면 CORS 불필요. JS `fetch()` 로 직접 다운로드 blob 을 생성하는 경우에만 `Access-Control-Allow-Origin: *` 추가.
- `X-Robots-Tag: noindex` 를 응답에 추가해 검색엔진이 `/download/*` 경로를 인덱싱하지 않도록 권고.

### 1.5 보안: path traversal 및 filename injection 방어

다운로드 URL 에 사용자 입력이 포함되므로 반드시 검증이 필요:

```typescript
const ALLOWED_EXTENSIONS = [
  ".exe", ".msi", ".dmg", ".app.tar.gz", ".AppImage",
  ".deb", ".rpm", ".sig", "latest.json"
];

function isValidFilename(filename: string): boolean {
  // path traversal: ../ 또는 %2e%2e 포함 금지
  if (/\.\.|%2e%2e|%252e/i.test(filename)) return false;
  // 슬래시 금지 (경로 구분자)
  if (/[/\\]/.test(filename)) return false;
  // 허용 확장자만 통과
  return ALLOWED_EXTENSIONS.some(ext => filename.endsWith(ext));
}
```

공격 벡터:
- **Path traversal**: `../../etc/passwd` → URL decode 후 `..` 탐지로 방어
- **Filename injection**: 임의 GitHub repo asset 으로 proxy 우회 → allowlist(허용 패턴) 적용
- **Rate limit 우회**: 동일 IP 에서 대량 다운로드 → Cloudflare WAF 또는 KV rate limiter 로 방어 (초기에는 무시 가능)
- **MITM**: GitHub CDN URL 자체는 HTTPS, Worker 와 CDN 간도 HTTPS → 안전

**출처**: Cloudflare Workers Security Model, OWASP Path Traversal

---

## 2. GitHub Releases CDN URL 형식

### 2.1 두 가지 URL 형식 비교

| 형식 | 예시 | 특징 |
|---|---|---|
| **직접 다운로드 URL** | `https://github.com/<owner>/<repo>/releases/download/<tag>/<file>` | 302 → `objects.githubusercontent.com` CDN |
| **API URL** | `https://api.github.com/repos/<owner>/<repo>/releases/assets/<id>` | `Accept: application/octet-stream` 필요, 인증 필요 |

**Worker proxy 에 적합한 형식**: 직접 다운로드 URL (형식 1).

이유:
- public repo 는 인증 불필요 (unauthenticated GET 가능)
- `fetch()` 는 302 redirect 를 자동으로 follow → Worker 가 최종 CDN URL(`objects.githubusercontent.com`) 에서 파일을 받아 stream
- Worker 코드에 PAT 를 포함하지 않아도 됨

**중요 동작**: `https://github.com/.../releases/download/...` 에 GET 요청 시:
1. GitHub → `302 Found` (Location: `https://objects.githubusercontent.com/...`)
2. Worker 의 `fetch()` 가 redirect follow → CDN 에서 실제 파일 받음
3. CDN 응답(200)을 클라이언트에 stream

CORS 문제(브라우저 직접 fetch 시 redirect 후 CORS 헤더 없음)는 Worker 가 redirect 를 서버 사이드에서 따라가므로 클라이언트는 Worker 응답만 보고 해결됨.

### 2.2 인증 필요 여부

| 상황 | 필요한 인증 | 제한 |
|---|---|---|
| Public repo release asset (Worker 내) | 불필요 | Unauthenticated: 60 req/h per IP |
| Public repo (인증 추가 시) | PAT `read:repo` | 5,000 req/h |
| Private repo | PAT `repo` (전체) | Redirect 시 Authorization 헤더 제거 필요 |

**API Vault 권고**: public repo 이므로 인증 불필요. 단, GitHub IP-based rate limit(60 req/h) 을 초과할 경우 wrangler secret 으로 PAT 를 Worker KV 에 저장하고 `Authorization: token <PAT>` 를 upstream request 에 추가. **PAT 를 코드에 하드코딩 금지**.

### 2.3 redirect follow 구현

Workers 의 `fetch()` 는 기본으로 redirect 를 follow 함(`redirect: "follow"`). GitHub 302 → objects.githubusercontent.com 이 자동 처리된다. 명시적으로 쓸 필요 없지만 아래와 같이 확인:

```typescript
const upstream = await fetch(githubUrl, {
  redirect: "follow", // 기본값이지만 명시
  headers: { "User-Agent": "api-vault-proxy/1.0" },
});
```

**출처**: GitHub Docs (REST API for release assets), corsfix.com blog, GitHub community discussion #46420

---

## 3. Workers free plan vs paid 플랜

### 3.1 한계 비교표

| 항목 | Free | Paid ($5/월) |
|---|---|---|
| 요청 수 | 100,000 / day | 10M / month 포함, 초과 $0.30/백만 |
| CPU time | 10 ms / invocation | 30 s (기본), 최대 5분 |
| Subrequest (외부 fetch) | **50 / request** | **10,000 / request** |
| 메모리 | 128 MB | 128 MB |
| 대역폭(egress) | **무료, 무제한** | **무료, 무제한** |
| KV 읽기 | 100k / day | 10M / month |
| Durable Objects | ❌ | ✅ |

**중요 포인트**:
- **대역폭 무료**: 수백 MB 파일을 proxy 해도 추가 요금 없음. 공식 문서: "There are no additional charges for data transfer (egress) or throughput (bandwidth)."
- **CPU time 은 stream proxy 에 영향 없음**: `fetch()` 의 네트워크 대기 시간은 CPU time 에 미포함. 10 ms 제한은 실제 JS 코드 실행 시간만 측정.
- **Subrequest 50/req (free)**: 다운로드 1건당 Worker subrequest 는 1회(GitHub CDN fetch 1번). 여유로움.
- **Free plan 100k/day**: 초기 dogfooding 및 베타 단계에서는 충분. 인기 앱이 되면 Paid ($5/월) 전환 권장.

### 3.2 제한 초과 시 동작

- 일일 100k 초과 시: `429 Too Many Requests` 반환 (Workers runtime 자동)
- CPU time 초과 시: Worker 가 강제 종료, 클라이언트는 연결 끊김

### 3.3 권고

사용자가 이미 `ee/api-vault-relay` Worker 를 운영 중이므로, **동일 Cloudflare 계정에서 Paid plan 전환 시 모든 Worker 가 paid 혜택을 공유**함 (Workers Paid = $5/월 고정 + 사용량 과금). 현 단계(dogfooding)에서는 Free로 시작 권장.

**출처**: Cloudflare Workers Limits docs, Cloudflare Workers Pricing docs

---

## 4. 실제 미러링 사례

### 4.1 ShinChven/github-cdn-proxy

- **패턴**: URL path 에서 GitHub URL 을 추출 → `fetch()` + stream
- **지원 URL**: `github.com/:user/:repo/releases/download/*` + raw GitHub 콘텐츠
- **보안**: 허용 패턴 allowlist (release download + raw files 만)
- **코드 위치**: `index.js` (JavaScript, 100%)
- **한계**: GitHub API 요청은 지원하지 않음

### 4.2 BH3GEI/CloudflareWorkerProxy

- **패턴**: 일반 HTTP(S) 요청 forwarding, CORS 추가
- **용도**: GitHub 이외 일반 proxying

### 4.3 aD4wn/Workers-Proxy

- **패턴**: 경량 reverse proxy, path 기반 routing
- **특징**: wrangler.toml 기반 배포

### 4.4 패턴 선택 — proxy vs R2 미러링

| 패턴 | 장점 | 단점 |
|---|---|---|
| **Stream proxy** (선택) | 구현 단순, 즉시 적용, GitHub Release 업로드 후 즉시 제공 | GitHub CDN 의존, rate limit 잠재 리스크 |
| R2 미러링 | GitHub 의존성 완전 제거, 빠른 CDN | 빌드 후 R2 업로드 추가 단계, 스토리지 비용($0.015/GB/month) |

**project-decisions.md 확정 사항**: Stream proxy 방식. R2 전환은 추후 선택.

**출처**: github.com/ShinChven/github-cdn-proxy, github.com/BH3GEI/CloudflareWorkerProxy, github.com/aD4wn/Workers-Proxy

---

## 5. tauri-plugin-updater 자체 endpoint

### 5.1 정적 JSON 응답 스키마 (확인됨)

```json
{
  "version": "0.1.0-pre11",
  "notes": "릴리즈 노트",
  "pub_date": "2026-05-08T12:00:00Z",
  "platforms": {
    "darwin-x86_64":  { "url": "https://...", "signature": "<.sig 파일 내용>" },
    "darwin-aarch64": { "url": "https://...", "signature": "<.sig 파일 내용>" },
    "windows-x86_64": { "url": "https://...", "signature": "<.sig 파일 내용>" },
    "linux-x86_64":   { "url": "https://...", "signature": "<.sig 파일 내용>" }
  }
}
```

**필수 필드**:
- `version`: SemVer (leading `v` 있어도 됨)
- `platforms.<key>.url`: 실제 다운로드 URL
- `platforms.<key>.signature`: `.sig` 파일의 **내용**(base64 문자열), 경로/URL ❌

**선택 필드**:
- `pub_date`: RFC 3339 형식 (`2026-05-08T12:00:00Z`)
- `notes`: 자유 텍스트

### 5.2 플랫폼 키 목록

| 키 | 대상 |
|---|---|
| `darwin-x86_64` | macOS Intel |
| `darwin-aarch64` | macOS Apple Silicon (M1/M2/M3) |
| `windows-x86_64` | Windows 64-bit |
| `windows-i686` | Windows 32-bit (선택) |
| `linux-x86_64` | Linux x86-64 |
| `linux-aarch64` | Linux ARM64 (선택) |

현재 `site/latest.json` 이 이미 올바른 형식을 사용 중 (확인됨: `darwin-x86_64`, `darwin-aarch64`, `windows-x86_64`, `linux-x86_64`).

### 5.3 단일 endpoint (placeholder 없음)

`tauri.conf.json`:
```json
{
  "plugins": {
    "updater": {
      "pubkey": "...",
      "endpoints": [
        "https://api-vault.app/api/latest"
      ]
    }
  }
}
```

- Placeholder(`{{current_version}}` 등) **없는 단일 URL 가능**. Tauri 가 응답의 `version` 을 현재 앱 버전과 비교, 더 높으면 업데이트 진행.
- 업데이트 없으면 서버가 `204 No Content` 반환 가능 (또는 동일 버전 포함 `200 OK`).
- 업데이트 있으면 `200 OK` + 위 JSON.

### 5.4 검증 흐름

1. 앱 → `GET https://api-vault.app/api/latest`
2. Worker 응답 → JSON 파싱 → `version` 비교
3. 새 버전이면 `platforms[currentOS].url` 로 파일 다운로드
4. 다운로드 완료 후 minisign 으로 `platforms[currentOS].signature` 검증 (pubkey 는 앱 번들에 포함)
5. 검증 성공 → 설치 적용

**중요**: `url` 필드에 `https://api-vault.app/download/<filename>` 을 넣으면 Worker 가 GitHub CDN 로 proxy. 사용자 브라우저/앱은 api-vault.app 도메인에서만 통신.

**출처**: Tauri v2 공식 Updater docs (v2.tauri.app/plugin/updater/), tauri-apps/tauri-docs GitHub

---

## 6. release.yml 자동 commit 패턴

### 6.1 현재 release.yml 상태 분석

현재 `publish-updater-manifest` job 은:
- `site/latest.json` 을 main 에 commit 하지 않음
- GitHub Releases 에 `latest.json` 을 asset 으로 업로드만 함
- `tauri.conf.json` 의 updater endpoint 가 `releases/download/v{{current_version}}/latest.json` self-reference URL 을 사용 중 (주석에 명시)

**변경 목표**: release 후 `site/latest.json` 을 main branch 에 자동 commit → Cloudflare Pages 자동 재배포 → Worker 가 정적 JSON 서빙.

### 6.2 GitHub Actions commit + push 베스트 프랙티스

```yaml
- name: Commit site/latest.json to main
  env:
    GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  run: |
    git config user.name "github-actions[bot]"
    git config user.email "github-actions[bot]@users.noreply.github.com"
    git add site/latest.json
    git diff --staged --quiet && echo "No changes" && exit 0
    git commit -m "chore: latest.json 갱신 — $TAG [skip ci]"
    git push origin HEAD:main
```

### 6.3 circular trigger 방지

**방법 1: `[skip ci]` 커밋 메시지** (권장)

커밋 메시지에 `[skip ci]`, `[ci skip]`, `[no ci]`, `[skip actions]`, `[actions skip]` 중 하나 포함 시 GitHub Actions `push` 이벤트가 트리거되지 않음.

**방법 2: GITHUB_TOKEN 사용 (자동 방지)**

`GITHUB_TOKEN` 으로 커밋/푸시한 경우, GitHub 보안 정책으로 인해 해당 커밋이 다른 workflow 를 트리거하지 않음 (PAT 와 다른 동작). 그러나 release.yml 트리거는 `push.tags: v*` 이므로 main 브랜치 push 는 이미 release.yml 을 트리거하지 않음.

**방법 3: `paths-ignore`**

```yaml
on:
  push:
    branches: [main]
    paths-ignore:
      - "site/latest.json"
```

**API Vault 상황**: `release.yml` 은 `push.tags: v*` 만으로 트리거됨. main branch push 는 트리거 조건이 아님. 따라서 circular trigger 리스크 없음. `[skip ci]` 는 추가 보험으로 포함 권장.

### 6.4 충돌 처리

`git push origin HEAD:main` 시 다른 commit 이 main 에 있으면 충돌 발생. 해결책:

```bash
git pull --rebase origin main
git push origin HEAD:main
```

또는 release 에서만 site/latest.json 을 수정하므로 충돌 가능성이 매우 낮음. `--force` 는 절대 금지.

### 6.5 GITHUB_TOKEN 권한

현재 `release.yml` 상단: `permissions: contents: write` — 이미 `site/latest.json` push 에 충분한 권한.

**주의**: main 브랜치에 branch protection 이 활성화된 경우 `GITHUB_TOKEN` push 가 거부될 수 있음. 이 경우 PAT(Personal Access Token)를 별도 secret 으로 사용해야 하나, 현재 API Vault repo 는 branch protection 없음(릴리즈 이력 10회, solo developer 상태).

**출처**: GitHub Docs (Skipping workflow runs), GitHub Actions changelog (skip ci), Semantic Release GitHub Actions recipe

---

## 7. wrangler routes 충돌 방어

### 7.1 Workers Routes vs Custom Domains

| 방식 | 용도 | Pages 와 공존 |
|---|---|---|
| **Routes** (선택) | path-specific Worker 실행 | ✅ 특정 path 만 intercept |
| Custom Domains | Worker 가 도메인 전체 처리 | ❌ Pages 와 동시 불가 |

`api-vault.app` 전체는 Cloudflare Pages 가 서빙. `/download/*` 와 `/api/*` 만 Worker 가 intercept → **Routes 방식이 유일한 선택**.

### 7.2 wrangler.toml 설정 예시

```toml
name = "download-proxy"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[[routes]]
pattern = "api-vault.app/download/*"
zone_name = "api-vault.app"

[[routes]]
pattern = "api-vault.app/api/*"
zone_name = "api-vault.app"
```

- `zone_name` 또는 `zone_id` 중 하나 필요
- `pattern` 에 `https://` 불필요 (scheme 없이 도메인+경로)
- trailing `*` 는 모든 suffix 매칭: `/download/*` → `/download/foo.exe`, `/download/foo/bar.sig` 등 모두 매칭

### 7.3 route 우선순위

더 specific 한 route 가 우선. `api-vault.app/download/*` 는 `api-vault.app/*` 보다 우선. Pages 는 Worker route 와 겹치지 않는 경로를 처리.

**중요 제한 (커뮤니티 확인)**: Pages 도메인의 특정 path 만 Worker route 로 catch 하는 것은 공식 문서에 명시되지 않았으나, 커뮤니티에서 동작이 확인됨. 단, Pages Functions 를 사용하는 것이 더 안정적인 대안.

### 7.4 Pages Functions 대안 (추천 검토)

`site/functions/` 디렉토리에 Pages Functions 파일을 추가하면 별도 Worker 배포 없이 Pages 프로젝트 내에서 처리 가능:

```
site/
├── functions/
│   ├── download/
│   │   └── [[filename]].ts   # /download/* catch-all
│   └── api/
│       └── latest.ts          # /api/latest
├── index.html
└── latest.json
```

Pages Functions 는 Workers 런타임과 동일한 환경 (fetch, ReadableStream, KV 등 모두 사용 가능). 별도 `wrangler deploy` 없이 Pages 배포와 함께 자동 배포. 이 방식이 **route 충돌 리스크 제로**.

**단점**: Pages Functions 는 static request (Pages 가 처리) 와 구분 위해 `_routes.json` 설정이 필요할 수 있음.

### 7.5 충돌 시나리오와 방어

| 시나리오 | 결과 | 방어 |
|---|---|---|
| Worker route 가 `api-vault.app/*` 전체 catch | Pages 전체 차단 → 404 | route 를 `/download/*` + `/api/*` 로 한정 |
| Custom Domain 을 `api-vault.app` 에 등록 | Pages 차단 | Custom Domain ❌, Routes 사용 |
| `/api/latest` Worker 가 없을 때 앱이 updater 호출 | Worker 미배포면 Pages 404 반환 | Worker 먼저 배포, updater.conf 는 그 후 수정 |

**출처**: Cloudflare Workers Routes docs, Cloudflare Pages Functions Routing docs, community.cloudflare.com 논의

---

## API Vault 적용 권고

### 권고 아키텍처

```
사용자 브라우저
      │
      ▼
api-vault.app (Cloudflare Pages)
      │
      ├─ /download/* → Cloudflare Worker (download-proxy)
      │       │
      │       └─ fetch → github.com/phoodul/api-vault/releases/download/<tag>/<file>
      │               │
      │               └─ 302 → objects.githubusercontent.com (CDN)
      │                       │
      │                       └─ stream → Worker → 사용자
      │
      ├─ /api/latest → Cloudflare Worker (download-proxy)
      │       │
      │       └─ site/latest.json 정적 파일 (Pages KV 또는 fetch self)
      │
      └─ 나머지 /* → Cloudflare Pages 정적 서빙
```

### 구현 권고 코드 스켈레톤

`ee/cloudflare/download-proxy/src/index.ts`:

```typescript
const ALLOWED_FILENAME_RE = /^[a-zA-Z0-9._\-]+$/;
const ALLOWED_EXTENSIONS = [
  ".exe", ".msi", ".dmg",
  ".app.tar.gz", ".AppImage",
  ".deb", ".rpm", ".sig", ".json",
];

const REPO = "phoodul/api-vault";
const GITHUB_BASE = `https://github.com/${REPO}/releases/download`;

function isValidFilename(name: string): boolean {
  if (!ALLOWED_FILENAME_RE.test(name)) return false;
  if (/\.\./.test(name)) return false;
  return ALLOWED_EXTENSIONS.some((ext) => name.endsWith(ext));
}

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // ── /api/latest ──────────────────────────────────────────────
    if (url.pathname === "/api/latest" || url.pathname === "/api/latest.json") {
      // Pages 의 site/latest.json 을 self-fetch (Pages 가 이미 정적 파일 서빙)
      const manifestUrl = `https://api-vault.app/latest.json`;
      const manifest = await fetch(manifestUrl);
      if (!manifest.ok) {
        return new Response("manifest not found", { status: 502 });
      }
      return new Response(manifest.body, {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=60",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    // ── /download/<tag>/<filename> ────────────────────────────────
    // 경로 형식: /download/v0.1.0-pre11/api-vault_0.1.0_x64-setup.exe
    const match = url.pathname.match(/^\/download\/([^/]+)\/([^/]+)$/);
    if (!match) {
      return new Response("Not Found", { status: 404 });
    }

    const [, tag, filename] = match;

    // 보안 검증
    if (!isValidFilename(filename)) {
      return new Response("Forbidden", { status: 403 });
    }
    // tag 검증: v로 시작하는 SemVer 형식
    if (!/^v\d+\.\d+\.\d+/.test(tag)) {
      return new Response("Forbidden", { status: 403 });
    }

    const githubUrl = `${GITHUB_BASE}/${tag}/${filename}`;

    // Range 헤더 전달 (resume download 지원)
    const upstreamHeaders: HeadersInit = {
      "User-Agent": "api-vault-proxy/1.0",
    };
    const rangeHeader = request.headers.get("Range");
    if (rangeHeader) {
      upstreamHeaders["Range"] = rangeHeader;
    }

    let upstream: Response;
    try {
      upstream = await fetch(githubUrl, {
        redirect: "follow",
        headers: upstreamHeaders,
      });
    } catch (err) {
      return new Response("Bad Gateway", { status: 502 });
    }

    if (!upstream.ok && upstream.status !== 206) {
      return new Response("Not Found", { status: upstream.status });
    }

    // 응답 헤더 구성 (upstream 헤더 + 보안 헤더)
    const responseHeaders = new Headers(upstream.headers);
    responseHeaders.set("X-Robots-Tag", "noindex");
    responseHeaders.set("Access-Control-Allow-Origin", "*");
    // Content-Disposition 이 없으면 브라우저가 인라인으로 열 수 있음
    if (!responseHeaders.has("Content-Disposition")) {
      responseHeaders.set(
        "Content-Disposition",
        `attachment; filename="${filename}"`
      );
    }

    // body 를 소비하지 않고 stream pass-through
    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  },
};
```

`ee/cloudflare/download-proxy/wrangler.toml`:

```toml
name = "download-proxy"
main = "src/index.ts"
compatibility_date = "2024-09-23"

[[routes]]
pattern = "api-vault.app/download/*"
zone_name = "api-vault.app"

[[routes]]
pattern = "api-vault.app/api/*"
zone_name = "api-vault.app"
```

### release.yml 수정 — latest.json commit 추가

`publish-updater-manifest` job 에 아래 step 추가 (기존 `gh release upload` 이후):

```yaml
      - name: Checkout repo for site/latest.json commit
        uses: actions/checkout@v4
        with:
          ref: main
          fetch-depth: 1

      - name: Update site/latest.json and commit to main
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          # latest.json 은 이전 step 에서 이미 생성됨 (WORK 디렉토리)
          cp latest.json site/latest.json
          git add site/latest.json
          git diff --staged --quiet && echo "[skip] no changes to site/latest.json" && exit 0
          git commit -m "chore: latest.json 갱신 — $TAG [skip ci]"
          git pull --rebase origin main
          git push origin HEAD:main
```

**주의**: `actions/checkout@v4` 는 `ref: main` 으로 체크아웃해야 함. 현재 workflow 는 tag context 에서 실행되므로 HEAD 가 tag commit. main branch 에 push 하려면 명시적 ref 필요.

### tauri.conf.json 수정

```json
{
  "plugins": {
    "updater": {
      "pubkey": "<기존 pubkey>",
      "endpoints": [
        "https://api-vault.app/api/latest"
      ]
    }
  }
}
```

기존 `releases/download/v{{current_version}}/latest.json` self-reference URL → `https://api-vault.app/api/latest` 단일 endpoint 로 변경.

### manifest url 필드 수정

`site/latest.json` 과 release.yml 이 생성하는 `BASE` URL 변경:

```bash
# 기존
BASE="https://github.com/${{ github.repository }}/releases/download/$TAG"

# 변경 (Worker proxy 경유)
BASE="https://api-vault.app/download/$TAG"
```

이 변경으로 `platforms[OS].url` 이 `https://api-vault.app/download/v0.1.0-pre11/api-vault_0.1.0_x64-setup.exe` 형식이 됨. tauri-plugin-updater 가 이 URL 로 파일을 다운로드 → Worker 가 GitHub CDN 으로 proxy.

---

## Sources

| # | 출처 | 신뢰도 | 관련도 |
|---|---|---|---|
| 1 | [Cloudflare Workers Streams API](https://developers.cloudflare.com/workers/runtime-apis/streams/) | HIGH (공식) | 10 |
| 2 | [Cloudflare Workers Best Practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/) | HIGH (공식) | 9 |
| 3 | [Cloudflare Workers Limits](https://developers.cloudflare.com/workers/platform/limits/) | HIGH (공식) | 9 |
| 4 | [Cloudflare Workers Pricing](https://developers.cloudflare.com/workers/platform/pricing/) | HIGH (공식) | 8 |
| 5 | [Cloudflare Workers Routes](https://developers.cloudflare.com/workers/configuration/routing/routes/) | HIGH (공식) | 9 |
| 6 | [Cloudflare Pages Functions Routing](https://developers.cloudflare.com/pages/functions/routing/) | HIGH (공식) | 7 |
| 7 | [Tauri v2 Updater Plugin 공식 docs](https://v2.tauri.app/plugin/updater/) | HIGH (공식) | 10 |
| 8 | [tauri-apps/tauri-docs GitHub (v2 branch)](https://github.com/tauri-apps/tauri-docs/blob/v2/src/content/docs/plugin/updater.mdx) | HIGH (공식) | 10 |
| 9 | [GitHub Docs — REST API: Release Assets](https://docs.github.com/en/rest/releases/assets) | HIGH (공식) | 8 |
| 10 | [GitHub Docs — Skipping Workflow Runs](https://docs.github.com/en/actions/managing-workflow-runs-and-deployments/managing-workflow-runs/skipping-workflow-runs) | HIGH (공식) | 8 |
| 11 | [GitHub community discussion #46420 — Release URL redirect](https://github.com/orgs/community/discussions/46420) | MEDIUM (공식 커뮤니티) | 7 |
| 12 | [corsfix.com — Fetch GitHub Release (CORS/redirect 분석)](https://corsfix.com/blog/fetch-github-release) | MEDIUM (기술 블로그) | 9 |
| 13 | [ShinChven/github-cdn-proxy](https://github.com/ShinChven/github-cdn-proxy) | MEDIUM (OSS) | 8 |
| 14 | [BH3GEI/CloudflareWorkerProxy](https://github.com/BH3GEI/CloudflareWorkerProxy) | MEDIUM (OSS) | 6 |
| 15 | [aD4wn/Workers-Proxy](https://github.com/aD4wn/Workers-Proxy) | MEDIUM (OSS) | 6 |
| 16 | [Cloudflare Community — configure workers on CF Pages path](https://community.cloudflare.com/t/configure-workers-to-run-on-a-path-s-currently-served-by-cf-pages-any-plans-to-merge-pages-workers-sites/312550) | MEDIUM (공식 커뮤니티) | 8 |
| 17 | [GitHub Blog — skip ci in Actions](https://github.blog/changelog/2021-02-08-github-actions-skip-pull-request-and-push-workflows-with-skip-ci/) | HIGH (공식) | 7 |
| 18 | [Cloudflare Community — Range request caching](https://community.cloudflare.com/t/possible-to-cache-ranged-requests/74514) | MEDIUM (공식 커뮤니티) | 6 |
