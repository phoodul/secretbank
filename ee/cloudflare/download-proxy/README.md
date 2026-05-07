# download-proxy — Cloudflare Worker

`api-vault.app/download/*` 와 `api-vault.app/api/latest` 를 GitHub Releases 로 stream proxy 하는 Cloudflare Worker.

## 구조

```
download-proxy/
├── src/
│   ├── index.ts       # Worker 핸들러
│   └── index.test.ts  # vitest 단위 테스트
├── wrangler.toml
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

## 로컬 개발

```powershell
pnpm install
pnpm typecheck   # TypeScript 타입 검사 (0 error 목표)
pnpm test        # 단위 테스트 실행 (최소 14개 케이스)
pnpm dev         # wrangler dev (로컬 미니플레어 실행)
```

## Deploy 절차 (one-time setup — 사용자 직접 실행)

### 1. Cloudflare 계정 인증

```powershell
pnpm wrangler login
```

브라우저가 열리면 Cloudflare 대시보드에서 승인.

### 2. Worker 배포

```powershell
pnpm wrangler deploy
```

`wrangler.toml` 의 routes 가 자동 등록된다:
- `api-vault.app/download/*`
- `api-vault.app/api/*`

### 3. 배포 검증

```powershell
# /api/latest — manifest JSON 응답 확인
curl https://api-vault.app/api/latest

# /download/* — 헤더만 확인 (바이너리 전체 다운로드 없이)
curl -I "https://api-vault.app/download/v0.1.0-pre8/api-vault_0.1.0_x64-setup.exe"
```

기대 결과:
- `/api/latest` → `200 OK`, `Content-Type: application/json`
- `/download/...` → `200 OK`, `Content-Disposition: attachment; filename="..."`
- 브라우저 Network 탭 → `github.com` 호출 0회

### 4. Cloudflare 대시보드 route 우선순위 확인

Cloudflare 대시보드 → Workers & Pages → download-proxy → Triggers → Routes 에서
`api-vault.app/download/*` 와 `api-vault.app/api/*` 가 등록되어 있는지 확인.

Pages route 와 충돌 시: Workers route 가 Pages 보다 우선순위가 높으므로 정상 동작.
만약 Pages 가 먼저 응답하면 (404 반환) → Cloudflare 대시보드에서 route 우선순위 조정.

## Rollback

```powershell
pnpm wrangler rollback
```

특정 버전으로 롤백:

```powershell
pnpm wrangler deployments list
pnpm wrangler rollback <deployment-id>
```

## 보안 모델

| 위협 | 완화 |
|------|------|
| W1 Path traversal | TAG_RE + FILENAME_SAFE_RE + ALLOWED_EXTS endsWith + URL decode 후 `..` 거부 |
| W2 SSRF | REPO 하드코딩, 사용자 입력으로 외부 URL 구성 금지 |
| W4 TLS 다운그레이드 | `https://` string literal 강제, HTTP 코드 없음 |
| W5 Cache poisoning | KV 캐시 없음, Pages edge 캐시만 사용 |
| W7 인라인 실행 | `Content-Disposition: attachment` 강제 |

## 향후 확장

- **GitHub PAT**: 100+ DAU 또는 `429` 오류 발생 시 `wrangler secret put GITHUB_PAT` 로 주입.
  `wrangler.toml` 주석에 이미 기록됨.
- **R2 미러링**: 대역폭 비용 최적화 필요 시 `ee/` EE 기능으로 추가 예정.
