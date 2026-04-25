# api-vault-relay

API Vault 의 Cloudflare Workers 릴레이 서버 (EE).

GitHub App installation token 발급, 향후 Passkey/OAuth 인증(M8) 및 CRDT 동기화(M9)를 담당한다.

---

## 로컬 개발 Quick Start

```bash
# 1. 의존성 설치
pnpm install

# 2. 환경변수 파일 생성
cp .dev.vars.example .dev.vars
# .dev.vars 를 편집해 실제 값 입력 (절대 커밋하지 말 것)

# 3. D1 / KV 생성 후 wrangler.toml 의 PLACEHOLDER 값 채우기
#    → docs/runbooks/relay-deployment.md 참조

# 4. 로컬 D1 마이그레이션 적용
pnpm db:migrate:local

# 5. 개발 서버 시작
pnpm dev
```

## 테스트

```bash
pnpm test
```

`@cloudflare/vitest-pool-workers` 로 Workers 런타임 환경에서 직접 실행된다. D1/KV 는 in-memory 어댑터를 사용한다.

## 타입 체크

```bash
pnpm typecheck
```

## 환경변수 (.dev.vars)

| 변수                     | 종류      | 설명                                                                 |
| :----------------------- | :-------- | :------------------------------------------------------------------- |
| `GITHUB_APP_ID`          | public    | GitHub App 등록 후 받은 App ID. `wrangler.toml` `[vars]` 에 직접 입력 |
| `GITHUB_APP_PRIVATE_KEY` | secret    | RS256 PEM. `wrangler secret put GITHUB_APP_PRIVATE_KEY` 로 주입      |
| `GITHUB_WEBHOOK_SECRET`  | secret    | webhook 서명 검증용. `wrangler secret put GITHUB_WEBHOOK_SECRET` 로 주입 |

실제 GitHub App private key 발급 방법은 [docs/runbooks/github-app-registration.md](../../docs/runbooks/github-app-registration.md) 참조.

## D1 / KV 생성

[docs/runbooks/relay-deployment.md](../../docs/runbooks/relay-deployment.md) 에 step-by-step 가이드가 있다.

## 첫 배포

```bash
pnpm deploy
```

배포 후 검증:

```bash
curl https://<your-worker>.workers.dev/health
# 또는 custom domain 연결 후:
curl https://relay.api-vault.app/health
```

## 디렉토리 구조

```
ee/api-vault-relay/
├── package.json
├── wrangler.toml              # Cloudflare 배포 설정 (PLACEHOLDER 채워야 함)
├── tsconfig.json
├── vitest.config.ts
├── .dev.vars.example          # 시크릿 샘플 — .dev.vars 는 .gitignore 됨
├── README.md                  # 이 파일
├── src/
│   ├── index.ts               # Hono 앱 엔트리포인트
│   ├── env.ts                 # D1/KV/secrets 바인딩 타입
│   ├── routes/
│   │   ├── health.ts          # GET /health (T079)
│   │   └── integrations/
│   │       └── github.ts      # POST /integrations/github/installation-token (T061)
│   ├── lib/
│   │   ├── auth.ts            # Bearer 토큰 미들웨어 (stub — T086 M8 에서 JWT 검증)
│   │   ├── github-app.ts      # GitHub App JWT (RS256) + installation_token 발급
│   │   └── kv-cache.ts        # KV-backed token 캐시 (55분 TTL)
│   └── db/
│       └── schema.ts          # Drizzle schema (user + github_installation)
├── migrations/
│   └── 0001_init.sql          # D1 첫 마이그레이션
└── test/
    ├── health.test.ts
    └── github.test.ts
```
