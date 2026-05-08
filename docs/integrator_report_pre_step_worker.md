# Pre-step Worker download-proxy — 통합 사양

> 작성일: 2026-05-08  
> 작성자: Integrator Agent  
> 입력: `docs/research_pre_step_worker_download_proxy.md` (18개 출처) + `docs/project-decisions.md` [2026-05-08] + 코드베이스 사실  
> 목적: implementator 가 즉시 착수 가능한 수준의 구현 사양 확정

---

## 1. 배경

현재 `site/index.html` 의 다운로드 로직은 `api.github.com/repos/phoodul/secretbank/releases` API를 직접 호출하고 `asset.browser_download_url` (= `objects.githubusercontent.com` CDN) 로 사용자를 보낸다. `src-tauri/tauri.conf.json` 의 updater endpoint 도 `github.com/phoodul/secretbank/releases/download/v{{current_version}}/latest.json` 을 직접 참조한다. `site/latest.json` 의 `platforms[].url` 역시 `github.com` 직접 URL 이다. 사용자의 요구사항은 브라우저 주소창과 Tauri 자동 업데이트 흐름 어디에도 `github.com` 이 노출되지 않는 것이다. 이를 위해 Cloudflare Worker stream proxy를 `secretbank.app/download/*` 및 `secretbank.app/api/latest` 에 배치한다. Worker는 클라이언트에게는 `secretbank.app` 도메인만 노출하며, 내부적으로 GitHub Releases CDN 에서 파일을 stream-forward 한다.

---

## 2. researcher 결과 CRAAP 평가

researcher 가 수집한 18개 출처 중 핵심 7개를 평가한다.

| #   | 출처                                                    | Currency | Relevance | Authority | Accuracy | Purpose | 총점   | 채택                   |
| --- | ------------------------------------------------------- | -------- | --------- | --------- | -------- | ------- | ------ | ---------------------- |
| 1   | Cloudflare Workers Streams API 공식 docs                | 5        | 5         | 5         | 5        | 5       | **25** | O                      |
| 2   | Cloudflare Workers Best Practices 공식 docs             | 5        | 5         | 5         | 5        | 5       | **25** | O                      |
| 3   | Cloudflare Workers Limits 공식 docs                     | 5        | 5         | 5         | 5        | 5       | **25** | O                      |
| 5   | Cloudflare Workers Routes 공식 docs                     | 5        | 5         | 5         | 5        | 5       | **25** | O                      |
| 7   | Tauri v2 Updater Plugin 공식 docs                       | 5        | 5         | 5         | 5        | 5       | **25** | O                      |
| 10  | GitHub Docs — Skipping Workflow Runs                    | 5        | 4         | 5         | 5        | 5       | **24** | O                      |
| 12  | corsfix.com — Fetch GitHub Release (CORS/redirect 분석) | 4        | 5         | 3         | 4        | 4       | **20** | O (보조)               |
| 13  | ShinChven/github-cdn-proxy (OSS)                        | 4        | 5         | 3         | 3        | 5       | **20** | O (참고)               |
| 16  | Cloudflare Community — Workers on CF Pages path         | 3        | 5         | 4         | 3        | 5       | **20** | 부분 (리스크 분석에만) |
| 18  | Cloudflare Community — Range request caching            | 3        | 3         | 3         | 3        | 5       | **17** | 조건부                 |

**LOW 신뢰도 (< 15) 항목**: 없음. 모든 채택 출처가 20점 이상이며, Cloudflare/GitHub/Tauri 공식 문서가 핵심 근거를 제공한다.

**주요 검증 포인트**: Cloudflare Workers 는 `fetch()` 네트워크 대기 시간을 CPU time 에 포함하지 않는다는 사실이 공식 Streams docs(출처 1)와 Best Practices(출처 2) 두 곳에서 독립적으로 확인되었다. 수백 MB 파일 proxy 가 Free plan CPU 10 ms 제한에 걸리지 않는 근거로 충분히 신뢰할 수 있다.

---

## 3. 핵심 trade-off — Pages Functions vs 별도 Worker

### 3-1. Pages Functions (researcher 권장 / 사용자 GATE 1 결정과 다름)

**구현 위치**: `site/functions/download/[[filename]].ts` + `site/functions/api/latest.ts`

**장점**:

- Pages 배포 파이프라인과 통합 — 별도 `wrangler deploy` 불필요
- route 충돌 리스크 제로 — Pages 가 공식 지원하는 방식 (`site/functions/` 자동 인식)
- `wrangler.toml` route 설정 불필요

**단점**:

- `site/` 디렉토리는 AGPL-3.0 라이선스 하에 있음. Worker 로직이 `site/functions/` 에 들어가면 EE 코드를 AGPL 경계 밖으로 분리할 수 없음
- 기존 `ee/secretbank-relay/` 와 다른 관리 패턴 — Open Core 구조 불일치
- Pages Functions 의 KV 바인딩은 Pages 프로젝트 설정에서 관리 — 향후 ee/ 격리 정책과 충돌 가능성

**이행 시 변경점**: `site/functions/download/[[filename]].ts` + `site/functions/api/latest.ts` 신규 생성. `wrangler.toml` 별도 파일 불필요. Pages 배포 시 자동 포함.

### 3-2. 별도 Worker + wrangler routes (사용자 GATE 1 결정)

**구현 위치**: `ee/cloudflare/download-proxy/`

**장점**:

- `ee/` 격리 — Open Core 정책 유지. EE 라이선스 경계 명확
- 기존 `ee/secretbank-relay/` 패턴과 완전 일관 (wrangler.toml + src/index.ts 구조)
- 향후 R2 미러링 등 EE 기능 추가 시 자연스러운 확장 경로
- Worker 독립 배포 가능 — Pages 재배포 없이 proxy 로직 변경 가능

**단점**:

- Pages 와 동일 도메인에서 path-specific intercept (`secretbank.app/download/*`) 는 Cloudflare 공식 문서에 명시되지 않은 패턴 (커뮤니티 확인, 출처 16)
- `wrangler deploy` 별도 실행 필요 — one-time setup 단계 추가
- Pages route 와 Worker route 중복 등록 시 디버깅 난이도 상승

**검증 필요**: deploy 후 `curl https://secretbank.app/download/v0.1.0-pre10/secretbank_0.1.0_x64-setup.exe -I` 로 200 응답 확인 필수. Pages 가 먼저 응답하면 404.

### 3-3. 모순 선언 및 integrator 권고

**모순**: researcher 가 "Pages Functions 가 더 안정적인 대안"이라고 권장했으나, 사용자 GATE 1 결정은 `ee/cloudflare/download-proxy/` 별도 Worker 이다.

**근거 강도 비교**:

- Pages Functions 권장 근거: Cloudflare 공식 Pages Functions Routing docs(출처 6)에서 지원하는 패턴이라는 안정성 논거
- 별도 Worker 결정 근거: Open Core 라이선스 정책(`ee/` 격리), 기존 인프라 일관성, 장기 EE 확장성

**integrator 판단**: 사용자 GATE 1 결정(별도 Worker)을 유지한다. 이유는 다음과 같다:

1. **라이선스 경계가 안정성보다 우선한다.** Pages Functions 를 `site/functions/` 에 넣으면 EE 코드가 AGPL 경계 안으로 들어온다. Open Core 모델의 근간을 흔든다.
2. **"공식 문서 미기재" 리스크는 관리 가능하다.** Cloudflare 커뮤니티(출처 16)에서 동일 도메인 Worker routes + Pages 공존이 수년간 동작 확인되었다. Pages 와 Worker route 가 동일 path 에 겹치지 않는 한(`/download/*`, `/api/*` 만 Worker) Pages 서빙에 영향 없다. 실제로 `ee/secretbank-relay` 도 Workers 기반이며 Cloudflare 의존도는 이미 확립됨.
3. **리스크 완화책**: deploy 즉시 `curl` 검증 + Cloudflare 대시보드에서 route 우선순위 확인. 만약 Pages route 충돌 확인되면 Pages Functions 로 즉시 fallback 가능 (코드 100% 재사용, 디렉토리 이동만).

**fallback plan**: 별도 Worker deploy 후 24시간 내 `curl` 검증 실패 시, `ee/cloudflare/download-proxy/src/index.ts` 코드를 그대로 `site/functions/download/[[filename]].ts` + `site/functions/api/latest.ts` 로 복사. AGPL 경계 문제는 향후 `site/functions/` 를 별도 EE 서브모듈로 분리하는 방안으로 해결.

---

## 4. 보안 위협 모델

### W1. Path traversal (filename injection)

**위협**: `/download/../../etc/passwd`, `/download/v1.0.0/%2e%2e%2fetc` 같은 경로 조작으로 Worker 가 의도치 않은 GitHub URL 을 fetch

**완화**: 두 단계 검증

1. tag 형식: `/^v\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/` — `v1.2.3`, `v0.1.0-pre11` 허용, 그 외 거부
2. filename allowlist regex: `^[a-zA-Z0-9._\-]+$` + 허용 확장자 목록(`.exe`, `.msi`, `.dmg`, `.app.tar.gz`, `.AppImage`, `.deb`, `.rpm`, `.sig`, `.json`) 교차 검증

URL decode 후 `..` 포함 시 즉시 `403 Forbidden`. route path 에서 `/download/` 이후 정확히 `<tag>/<filename>` 두 세그먼트만 허용.

**중요**: `ALLOWED_FILENAME_RE` 의 `.` 은 regex 에서 "임의 문자"가 아니라 리터럴 `.` 이 되도록 `[.]` 또는 이스케이프 처리 필요. researcher 제안 코드의 정규식을 implementator 가 재검토할 것.

### W2. Open redirect / SSRF (Server-Side Request Forgery)

**위협**: Worker 가 `REPO` 와 `tag`, `filename` 을 조합해 URL 을 구성하므로, 검증 우회 시 임의 내부 주소 fetch 가능

**완화**:

- `REPO = "phoodul/secretbank"` 하드코딩 — 사용자 입력에서 repo 를 추출하지 않음
- tag + filename 검증 통과 후 최종 URL: `https://github.com/phoodul/secretbank/releases/download/<tag>/<filename>` 형식만 fetch
- Worker 외부 fetch 대상을 `github.com` 과 자기 자신(`secretbank.app/latest.json`)으로 제한

### W3. GitHub rate limit (unauthenticated: 60 req/h per IP)

**위협**: 동일 Cloudflare 출구 IP 에서 Worker 가 GitHub CDN 에 연결하면 rate limit 소진 가능. 특히 다수 사용자가 동시 다운로드 시

**현황**: Cloudflare Worker 의 `fetch()` 는 GitHub 302 → `objects.githubusercontent.com` CDN redirect 를 따라간다. CDN 최종 응답(`objects.githubusercontent.com`)은 rate limit 대상이 아님 — rate limit 은 `api.github.com` 와 `github.com` 인증 endpoint 에만 적용된다.

**결론**: stream proxy 다운로드 자체는 GitHub rate limit 대상 아님. `/api/latest` 에서 Pages 정적 파일(`site/latest.json`)을 fetch 하는 경우도 rate limit 대상 아님 (`secretbank.app` 도메인, GitHub API 아님).

**잠재 리스크 (낮음)**: release 직후 GitHub CDN origin 이 일시적으로 느릴 수 있음. Worker stream 이 timeout 되면 클라이언트는 연결 끊김. 완화: `fetch()` 에 timeout 설정 또는 `AbortController` 5분 timeout. 초기 단계에서는 무시 가능.

### W4. MITM / TLS 다운그레이드

**위협**: Worker → GitHub CDN 구간 가로채기

**완화**: Cloudflare Worker `fetch()` 는 TLS 강제 (`https://` 만 사용). `objects.githubusercontent.com` 도 HTTPS 전용. Worker 내부에서 `http://` 로 downgrade 하는 코드 작성 금지.

### W5. Cache poisoning

**위협**: `/api/latest` 에 KV 캐시를 도입할 경우 잘못된 manifest 가 TTL 동안 서빙될 수 있음

**현황 설계**: `/api/latest` 는 `site/latest.json` 정적 파일을 Pages 에서 가져온다. 정적 파일이므로 Pages 재배포 전까지 불변. KV 캐시 없이 Pages 정적 파일을 직접 self-fetch 하는 구조라면 cache poisoning 리스크 최소.

**권고**: 초기 구현에서는 KV 없이 `fetch("https://secretbank.app/latest.json")` 직접 호출. TTL 은 Cloudflare edge 캐시가 담당 (`Cache-Control: public, max-age=60`). KV 캐시는 `/api/latest` 응답 속도 최적화가 필요해지는 시점에 추가.

### W6. Circular workflow trigger (release.yml `[skip ci]`)

**위협**: `site/latest.json` 을 main 에 commit + push 하면 `push.branches: main` 트리거가 있는 다른 workflow 가 실행될 수 있음

**현황**: `release.yml` 트리거는 `push.tags: v*` 전용. main branch push 는 release.yml 을 트리거하지 않음. 이중 보험으로 commit message 에 `[skip ci]` 포함 권장 (GitHub Actions 공식 지원, 출처 10 + 17).

**주의**: main branch protection rule 이 활성화된 경우 `GITHUB_TOKEN` push 가 차단될 수 있음. 현재 Secretbank repo 는 branch protection 없음 (solo developer, release 이력 확인). 이 가정이 변경될 경우 PAT 를 별도 secret 으로 설정 필요 (`GITHUB_PUSH_PAT`).

### W7. `Content-Disposition` 미설정 시 브라우저 인라인 실행

**위협**: `.sig` 파일 등이 브라우저에서 인라인으로 표시되거나 `.exe` 가 자동 실행될 수 있음

**완화**: Worker 응답에 `Content-Disposition: attachment; filename="<filename>"` 헤더 강제. upstream GitHub CDN 이 이미 설정했으면 그대로 유지, 없으면 추가.

---

## 5. 구현 사양 (sub-task 별)

### Sub-task 1: `ee/cloudflare/download-proxy/` Worker 신규 생성

**신규 파일 목록**:

- `ee/cloudflare/download-proxy/wrangler.toml`
- `ee/cloudflare/download-proxy/src/index.ts`
- `ee/cloudflare/download-proxy/package.json`
- `ee/cloudflare/download-proxy/tsconfig.json`
- `ee/cloudflare/download-proxy/vitest.config.ts` (선택)
- `ee/cloudflare/download-proxy/src/index.test.ts` (선택)

**`wrangler.toml` 핵심 항목**:

```toml
name = "download-proxy"
main = "src/index.ts"
compatibility_date = "2026-04-25"   # ee/secretbank-relay 와 통일
account_id = "6f04212fcad5f073ed4e36af9b723eea"  # relay 와 동일 계정

[[routes]]
pattern = "secretbank.app/download/*"
zone_name = "secretbank.app"

[[routes]]
pattern = "secretbank.app/api/*"
zone_name = "secretbank.app"
```

`account_id` 는 `ee/secretbank-relay/wrangler.toml` 에서 확인된 값을 그대로 사용한다. `zone_name` 은 `secretbank.app` — `zone_id` 로 대체 가능하나 `zone_name` 이 더 가독성이 좋다.

**`src/index.ts` 구조 (indicative — 정확한 구현은 implementator 작성)**:

```typescript
// 상수
const REPO = "phoodul/secretbank";
const GITHUB_BASE = `https://github.com/${REPO}/releases/download`;
const MANIFEST_URL = "https://secretbank.app/latest.json";

// tag 검증: v1.2.3 또는 v0.1.0-pre11 형식
const TAG_RE = /^v\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/;

// filename 검증: 허용 문자 + 허용 확장자
const FILENAME_SAFE_RE = /^[a-zA-Z0-9][a-zA-Z0-9._\-]*$/;
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
];

// fetch handler
// 라우팅: /api/latest → manifest proxy
//         /download/<tag>/<filename> → stream proxy
// 그 외 → 404
```

**`/download/<tag>/<filename>` 핸들러 요구사항**:

1. path 에서 `tag`, `filename` 추출
2. `TAG_RE` + `FILENAME_SAFE_RE` + `ALLOWED_EXTS` 검증 — 실패 시 `403`
3. upstream fetch: `fetch(`${GITHUB_BASE}/${tag}/${filename}`, { redirect: "follow", headers: { "User-Agent": "secretbank-proxy/1.0", ...(rangeHeader ? { "Range": rangeHeader } : {}) } })`
4. upstream 실패 시 `502`
5. 응답 헤더: `upstream.headers` 복사 + `X-Robots-Tag: noindex` + `Content-Disposition: attachment; filename="<filename>"` (없으면 추가)
6. `return new Response(upstream.body, { status: upstream.status, headers: responseHeaders })`

**`/api/latest` 핸들러 요구사항**:

1. `fetch(MANIFEST_URL)` — Pages 가 서빙하는 정적 파일
2. 실패(`!ok`) 시 `502`
3. 응답: `Content-Type: application/json`, `Cache-Control: public, max-age=60`, `Access-Control-Allow-Origin: https://secretbank.app`
4. body 는 upstream.body stream pass-through

**테스트 (선택 — dogfooding 전 안전망)**:

- `allowlist` regex 단위 테스트: 허용 filename / 거부 filename (path traversal, 미허용 확장자)
- `TAG_RE` 단위 테스트: `v0.1.0`, `v0.1.0-pre11`, `main` (거부), `../../etc` (거부)
- `@cloudflare/vitest-pool-workers` 는 선택 — 단위 테스트는 Node.js vitest 로도 가능 (fetch mock)

### Sub-task 2: `site/index.html` 다운로드 로직 정정

**변경 위치**: `site/index.html` 라인 1942~1953 (`fetchReleases` 함수) + 라인 1929~1940 (`classify` 함수)

**현재 코드 (변경 전)**:

- `fetch("https://api.github.com/repos/" + REPO + "/releases?per_page=20", ...)` — GitHub API 직접 호출
- `asset.browser_download_url` — `objects.githubusercontent.com` URL 사용

**변경 목표**:

1. `fetchReleases()` 수정 — GitHub API 대신 `/api/latest` 에서 manifest JSON 을 가져와 `site/latest.json` 형식으로 파싱한다. 단일 release manifest 만 반환하므로 `list` 배열이 아닌 단일 객체가 됨. 기존 `classify()` 가 `asset.name` + `asset.browser_download_url` + `asset.size` 를 기대하므로, manifest `platforms` 키 → asset 배열 형태로 변환하는 어댑터 함수가 필요.

2. `classify()` 의 URL 구성 수정 — `asset.browser_download_url` 대신 Worker URL 형식으로:

   ```javascript
   // 변경 전
   url: asset.browser_download_url,
   // 변경 후
   url: `https://secretbank.app/download/${tag}/${asset.name}`,
   ```

3. `detectOS()` 함수 — 변경 없음. 기존 로직 유지.

4. "Previous releases" 섹션 처리 — `fetchReleases()` 가 단일 release 만 반환하므로 기존 `renderPreviousReleases()` 에 데이터가 없음. 처리 방안은 GATE 2 사용자 결정 항목 #3 참조.

**CORS 영향 없음**: 기존 코드는 `api.github.com` 에 JS `fetch()` 를 보냈으나, 변경 후 `/api/latest` (same-origin 또는 CORS 설정된 Worker endpoint) 를 호출하므로 오히려 CORS 문제가 해소된다.

### Sub-task 3: `site/latest.json` + `src-tauri/tauri.conf.json` updater 정정

**`site/latest.json` 변경 (현재)**:

```json
"url": "https://github.com/phoodul/secretbank/releases/download/v0.1.0-pre8/..."
```

**변경 목표**:

```json
"url": "https://secretbank.app/download/v0.1.0-pre8/..."
```

이 변경은 현재 값(pre8)을 수동으로 수정하는 것이 아니라, Sub-task 4 에서 `release.yml` 이 자동으로 올바른 URL 로 생성한 `site/latest.json` 을 commit 하도록 워크플로우를 수정함으로써 해결된다. 단, 현재 `site/latest.json` 에 있는 pre8 URL 도 Worker 가 있으면 Tauri 자동 업데이터가 정상 동작하므로, Worker deploy 후 수동으로 URL 을 교체하거나 next release (pre11) 에서 자동 갱신을 기다릴 수 있다.

**`src-tauri/tauri.conf.json` updater endpoint (현재)**:

```json
"endpoints": [
  "https://github.com/phoodul/secretbank/releases/download/v{{current_version}}/latest.json"
]
```

**변경 목표**:

```json
"endpoints": [
  "https://secretbank.app/api/latest"
]
```

`{{current_version}}` placeholder 제거. Tauri v2 updater 는 단일 endpoint + 응답 JSON 의 `version` 필드로 업데이트 필요 여부를 판단한다 (출처 7, 8). placeholder 가 없어도 동작함.

**`src-tauri/tauri.conf.json` CSP 수정 확인**: 현재 CSP 의 `connect-src` 에 `https://secretbank.app` 가 이미 포함되어 있음 (`src-tauri/tauri.conf.json:22` 확인). `github.com` 항목 유지 여부는 Sub-task 5 에서 결정 — 현재 단계에서는 제거 불필요 (Tauri 앱 내부 로직에서 github.com 직접 호출이 있을 수 있음).

**minisign 서명 검증**: `platforms[].signature` 는 서명 문자열 자체이며 서버 변경 없이 동일하게 유지된다. Worker 는 파일만 proxy 할 뿐 바이너리를 수정하지 않으므로 서명 검증 흐름 변경 없음.

### Sub-task 4: `.github/workflows/release.yml` 자동 commit step 추가

**현황**: `publish-updater-manifest` job 의 step 은 `latest.json` 을 생성해 GitHub Release 에 asset 으로 upload 만 한다. `site/latest.json` 을 main 에 commit 하지 않는다 (release.yml:329 주석 "branch protection 으로 GH_TOKEN push 차단" — 현재는 protection 없으므로 해당 없음).

**`BASE` URL 변경 (publish-updater-manifest job, 라인 241)**:

```bash
# 변경 전
BASE="https://github.com/${{ github.repository }}/releases/download/$TAG"
# 변경 후
BASE="https://secretbank.app/download/$TAG"
```

이 한 줄 변경으로 `platforms[].url` 이 Worker 경로를 가리키게 된다.

**신규 step 추가 위치**: `publish-updater-manifest` job 의 기존 step 직후 (gh release upload 완료 후)

**신규 step 구조 (indicative)**:

```yaml
- name: Checkout main for site/latest.json commit
  uses: actions/checkout@v6
  with:
    ref: main
    fetch-depth: 1

- name: Commit site/latest.json to main
  env:
    GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  run: |
    git config user.name "github-actions[bot]"
    git config user.email "github-actions[bot]@users.noreply.github.com"
    cp latest.json site/latest.json
    git add site/latest.json
    git diff --staged --quiet && echo "[skip] site/latest.json unchanged" && exit 0
    git commit -m "chore(release): $TAG latest.json 갱신 [skip ci]"
    git pull --rebase origin main
    git push origin HEAD:main
```

**주의사항**:

- `publish-updater-manifest` job 은 `ubuntu-latest` runner 에서 실행되므로 `checkout` step 이 없다. 신규 checkout step 의 `ref: main` 이 필수임 — 현재 context 는 tag (`v*`).
- `cp latest.json site/latest.json` — `latest.json` 은 이전 step 의 `$WORK` (mktemp 디렉토리)가 아니라 현재 작업 디렉토리에 생성된 파일임. 기존 step 의 `jq -n ... > latest.json` 이 현재 디렉토리에 생성하므로, checkout 후 `cp` 경로가 올바른지 implementator 가 확인 필요.
- `git pull --rebase` 는 push 직전에 실행 — 동시 release 가 없는 solo 환경에서는 충돌 가능성 극히 낮음.
- `--force` 금지.

**circular trigger 분석**:

- `release.yml` 트리거: `push.tags: v*` — main branch push 는 트리거 조건 아님. circular 없음.
- `[skip ci]` 추가 이유: 혹시 다른 workflow (예: `ci.yml` 이 `push.branches: main` 으로 트리거될 수 있음)의 실행 방지.

### Sub-task 5: `docs/RELEASE_GUIDE.md` 갱신

**추가 항목**:

1. **One-time setup 섹션 — "4. Cloudflare Worker download-proxy 배포" 추가**:
   - `ee/cloudflare/download-proxy/` 경로 설명
   - `wrangler deploy` 명령 (사용자 직접 실행)
   - `secretbank.app/download/*` + `secretbank.app/api/*` route 등록 확인 방법
   - Cloudflare 대시보드에서 route 우선순위 확인

2. **Per-release checklist 갱신**:
   - `v*` tag push → release.yml → `site/latest.json` main commit 자동 흐름 설명
   - Worker 가 배포되어 있어야 자동 업데이터 동작 — Worker 배포가 one-time setup 임을 강조

3. **Rollback 섹션 갱신**:
   - `site/latest.json` 을 이전 버전으로 직접 수정 + main commit (Worker 는 정적 파일 그대로 서빙)
   - `gh release upload <tag> latest.json --clobber` 는 이제 site/latest.json 과 별개로 존재 (둘 다 갱신 필요)

4. **"Domain + landing" 섹션 (신규 또는 기존 갱신)**:
   - Cloudflare Pages (`secretbank.app/*`) + Worker routes (`/download/*`, `/api/*`) 공존 구조 다이어그램 추가

---

## 6. 검증 계획

### 6-1. Pre-deploy (implementator 완료 후, 사용자 deploy 전)

| 검증 항목             | 명령                                                                           | 기대 결과             |
| --------------------- | ------------------------------------------------------------------------------ | --------------------- |
| TypeScript 타입 확인  | `pnpm typecheck`                                                               | 오류 0                |
| Rust 회귀             | `cargo test --workspace --manifest-path src-tauri/Cargo.toml`                  | 0 failures            |
| Rust lint             | `cargo clippy --workspace --manifest-path src-tauri/Cargo.toml -- -D warnings` | 경고 0                |
| ESLint                | `pnpm lint`                                                                    | 오류 0                |
| Worker filename regex | vitest 단위 테스트                                                             | 허용/거부 케이스 통과 |

**`pnpm typecheck` 적용 범위 주의**: `site/index.html` 은 inline JavaScript (TypeScript 아님). `pnpm typecheck` 가 검증하지 않음. Worker `src/index.ts` 는 `ee/cloudflare/download-proxy/tsconfig.json` 별도 설정 필요.

### 6-2. Post-deploy (사용자 직접 실행 — secrets 노출 위험으로 CI 자동화 불가)

```powershell
# 1. Worker deploy (ee/cloudflare/download-proxy/ 디렉토리에서)
wrangler deploy

# 2. /api/latest endpoint 확인
curl https://secretbank.app/api/latest

# 3. 다운로드 프록시 헤더 확인 (바이너리 전체 다운로드 없이)
curl -I "https://secretbank.app/download/v0.1.0-pre8/secretbank_0.1.0_x64-setup.exe"

# 4. 브라우저 Network 탭 — github.com 호출 0회 확인
# site/index.html 열기 → F12 → Network → "github" 필터 → 0건

# 5. tauri-plugin-updater 검증 (pre10 빌드에서)
# tauri.conf.json endpoint 변경 후 pnpm tauri dev 또는 production build
# 업데이트 체크 로그에서 secretbank.app/api/latest 호출 확인
```

### 6-3. Release pipeline 검증 (pre11 tag push 후)

1. `release.yml` 완료 후 `site/latest.json` 의 `platforms[].url` 이 `https://secretbank.app/download/v0.1.0-pre11/...` 형식인지 확인
2. main branch 의 commit history 에 `"chore(release): v0.1.0-pre11 latest.json 갱신 [skip ci]"` 커밋 확인
3. Cloudflare Pages 자동 재배포 완료 후 `curl https://secretbank.app/latest.json` 으로 pre11 버전 확인
4. pre10 설치 앱에서 업데이트 체크 → pre11 감지 → `https://secretbank.app/download/v0.1.0-pre11/...` 로 파일 다운로드 → 서명 검증 → 설치

---

## 7. GATE 2 사용자 결정 큐 (USER APPROVAL 필요)

아래 항목은 integrator 가 기본 권고를 제시하지만, 사용자의 명시적 승인이 필요한 결정이다.

### 결정 1: Pages Functions fallback 트리거 기준 (GATE 1 결정 유지 전제)

**배경**: 별도 Worker + routes 방식이 deploy 후 `curl` 검증에서 실패할 경우 Pages Functions 로 전환한다.

**결정 필요 내용**: 전환 트리거 기준 — (a) deploy 후 24시간 내 `curl` 검증 실패 시 즉시 / (b) 3회 이상 실패 후

**integrator 권고**: (a) 즉시 전환. Worker routes + Pages 공존 검증은 one-time 확인이면 충분.

---

### 결정 2: `release.yml` `GITHUB_TOKEN` push 권한 확인

**배경**: main branch 에 `GITHUB_TOKEN` 으로 push. `contents: write` 권한이 이미 선언되어 있음 (release.yml:29). branch protection 없음 (solo developer).

**결정 필요 내용**: 현재 repo 설정 그대로 진행할지, 아니면 별도 PAT (`GITHUB_PUSH_PAT`) 를 미리 설정할지

**integrator 권고**: `GITHUB_TOKEN` 으로 진행. branch protection 추가 시 그 시점에 PAT 로 마이그레이션.

---

### 결정 3: "Previous releases" UI 처리 방안 — 사용자 지적으로 **(d) 채택 확정** (2026-05-08)

**사용자 지적**: "Python 등 다른 release 는 업데이트 되더라도 previous release 를 사용하는 경우가 있다." → vault 파일 schema 마이그레이션 호환성 / regression rollback / 버그 재현 / 검증된 특정 버전 강제 환경. **Previous releases UI 유지 필수**.

**채택**: (d) `release.yml` 자동 생성 `site/releases.json`. Worker 변경 ❌ (정적 파일은 Pages 직접 서빙). Sub-task 2 / 4 / 5 영향, Sub-task 1 영향 ❌.

---

&lt;!-- 이전 결정 안 (참고용 보존) --&gt;

**배경**: 현재 `site/index.html` 의 `renderPreviousReleases()` 함수는 GitHub API 의 `releases?per_page=20` 응답에서 이전 릴리즈 목록을 표시한다. Worker 로 마이그레이션 후 `/api/latest` 는 단일 release manifest 만 반환한다.

**선택지**:

- **(a) 제거**: `renderPreviousReleases()` 와 관련 UI 섹션 삭제 — 단순화, 데이터 불필요
- **(b) 정적 유지**: `site/releases.json` (별도 파일) 을 수동 관리 — 매 release 마다 사람이 갱신 필요
- **(c) Worker endpoint 추가**: `/api/releases?limit=20` — Worker 가 GitHub API 를 호출해 목록 반환 (GitHub API rate limit 60 req/h 우려 재발생)
- **(d) release.yml 자동 생성**: release.yml 이 `site/releases.json` 도 갱신 — 추가 step 필요

**integrator 권고**: 초기 단계 (a) 제거. "Previous releases" 섹션은 다운로드 전환에 blocking 항목 아님. 추후 사용자 피드백에 따라 (d) 추가.

---

### 결정 4: GitHub rate limit PAT 추가 시점

**배경**: `/download/*` stream proxy 는 GitHub CDN rate limit 대상 아님. `/api/latest` 도 Pages 정적 파일 접근이므로 rate limit 없음. 현재 단계에서 PAT 불필요.

**결정 필요 내용**: 명시적으로 "초기에 PAT 없이 시작"을 확정할지, 아니면 지금 wrangler secret 으로 PAT 를 미리 설정할지

**integrator 권고**: PAT 없이 시작. 100+ DAU 도달 또는 `429` 오류 발생 시 추가.

---

### 결정 5: Workers Free vs Paid 플랜

**배경**: 현재 `ee/secretbank-relay` Worker 가 동일 계정에서 운영 중. Free plan (100k req/day) 이 dogfooding 단계에서는 충분. Paid ($5/월)는 10M req/month 포함.

**결정 필요 내용**: download-proxy Worker 를 Free plan 으로 시작할지, Paid plan 을 즉시 적용할지

**integrator 권고**: Free plan 으로 시작. Paid 전환 기준 = 일일 다운로드 요청이 Free 한도(100k/day)의 50% (50k) 초과 시점.

---

### 결정 6: sub-task 구현 묶음

**선택지**:

- **(a) 1 implementator 일괄**: 5개 sub-task 를 한 번에 구현 — 빠르지만 commit 단위 추적 어려움
- **(b) 5 implementator 분할**: sub-task 별 독립 commit — 롤백 단위 명확, 진행 현황 추적 용이

**integrator 권고**: (b) 분할. commit 단위:

1. `ee/cloudflare/download-proxy/` Worker 파일 신규 생성
2. `site/index.html` 다운로드 로직 정정
3. `site/latest.json` + `src-tauri/tauri.conf.json` updater 정정
4. `.github/workflows/release.yml` BASE URL + commit step 추가
5. `docs/RELEASE_GUIDE.md` 갱신

---

### 결정 7: Worker secrets 관리 방침 명문화

**현황**: 초기 download-proxy Worker 는 환경 변수나 secrets 불필요 (REPO 하드코딩, 인증 없음).

**결정 필요 내용**: 향후 PAT 추가 시 `wrangler secret put GITHUB_PAT` 로 주입하는 방침을 `ee/cloudflare/download-proxy/wrangler.toml` 주석에 미리 문서화할지

**integrator 권고**: wrangler.toml 에 주석으로 미리 기록 (값 없이 이름만). `ee/secretbank-relay/wrangler.toml` 의 secrets 주석 패턴 그대로 따름.

---

## 8. 채택 권고 (종합)

**별도 Worker (`ee/cloudflare/download-proxy/`) 방식으로 진행한다.** Open Core 라이선스 경계 유지가 단기 안정성 우려보다 중요하다. route 충돌 리스크는 deploy 직후 `curl` 검증으로 즉시 탐지 가능하고, Pages Functions fallback 경로가 명확하다.

**구현 순서**: Sub-task 1(Worker 신규) → Sub-task 3(tauri.conf + latest.json URL) → Sub-task 4(release.yml) → Sub-task 2(site/index.html) → Sub-task 5(RELEASE_GUIDE). Sub-task 1 Worker deploy 를 가장 먼저 완료해야 나머지 변경사항이 브라우저/앱에서 실제 동작한다.

**dogfooding 진입 조건**: Sub-task 1 + 3 + 4 완료 + Worker deploy 확인 + `curl` 검증 통과. Sub-task 2 (site/index.html) + 5 (RELEASE_GUIDE) 는 dogfooding 중에도 병행 가능.

---

## 9. 참고 자료 (신뢰도순)

| 순위 | 출처                                                                                                                                                                                                  | CRAAP | 비고                                            |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ----------------------------------------------- |
| 1    | [Cloudflare Workers Streams API](https://developers.cloudflare.com/workers/runtime-apis/streams/)                                                                                                     | 25/25 | stream proxy 핵심 패턴 근거                     |
| 2    | [Cloudflare Workers Best Practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/)                                                                                 | 25/25 | "body 를 소비하지 않는 것이 optimal" 인용 출처  |
| 3    | [Cloudflare Workers Limits](https://developers.cloudflare.com/workers/platform/limits/)                                                                                                               | 25/25 | Free 100k/day, CPU 10 ms, 대역폭 무료 수치 근거 |
| 4    | [Cloudflare Workers Routes](https://developers.cloudflare.com/workers/configuration/routing/routes/)                                                                                                  | 25/25 | `[[routes]]` wrangler.toml 설정 근거            |
| 5    | [Tauri v2 Updater Plugin 공식 docs](https://v2.tauri.app/plugin/updater/)                                                                                                                             | 25/25 | endpoint 단일 URL + version 비교 동작 근거      |
| 6    | [GitHub Docs — Skipping Workflow Runs](https://docs.github.com/en/actions/managing-workflow-runs-and-deployments/managing-workflow-runs/skipping-workflow-runs)                                       | 24/25 | `[skip ci]` 지원 키워드 목록 근거               |
| 7    | [Cloudflare Pages Functions Routing](https://developers.cloudflare.com/pages/functions/routing/)                                                                                                      | 24/25 | Pages Functions 대안 근거                       |
| 8    | [corsfix.com — Fetch GitHub Release](https://corsfix.com/blog/fetch-github-release)                                                                                                                   | 20/25 | GitHub 302→CDN redirect 동작 보조 검증          |
| 9    | [ShinChven/github-cdn-proxy](https://github.com/ShinChven/github-cdn-proxy)                                                                                                                           | 20/25 | 실제 구현 패턴 참고                             |
| 10   | [Cloudflare Community — Workers on CF Pages path](https://community.cloudflare.com/t/configure-workers-to-run-on-a-path-s-currently-served-by-cf-pages-any-plans-to-merge-pages-workers-sites/312550) | 20/25 | 회색 지대 리스크 근거 (Section 3 trade-off)     |
