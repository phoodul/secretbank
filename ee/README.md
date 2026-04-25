# `ee/` — Enterprise Edition

이 디렉토리의 코드는 **API Vault Enterprise License v1.0** 으로 배포된다.
이는 프로젝트 루트의 AGPL-3.0 OSS 라이선스와 **별개의 라이선스**다.

## 라이선스 매트릭스

| 위치                  | 라이선스                              | 용도                          |
| :-------------------- | :------------------------------------ | :---------------------------- |
| `/` (루트, OSS 코어)  | AGPL-3.0-or-later                     | 데스크톱 앱, 로컬 볼트, 그래프, 감사로그, RAILGUARD 등 |
| `/ee/`                | API Vault Enterprise License v1.0     | 릴레이 서버, 프리미엄 커넥터, 자동 rotation, 동기화 백엔드 |

자세한 경계는 [`/LICENSE_FAQ.md`](../LICENSE_FAQ.md) 참조.

## 디렉토리 구조

```
ee/
├── LICENSE                       # EE 라이선스
├── README.md                     # 이 파일
└── api-vault-relay/              # Cloudflare Workers 릴레이 (T061+, T079+)
    ├── package.json
    ├── wrangler.toml             # Cloudflare 배포 설정
    ├── tsconfig.json
    ├── vitest.config.ts
    ├── .dev.vars.example         # 시크릿 샘플 (.dev.vars 는 .gitignore 됨)
    ├── README.md                 # 로컬 개발 가이드
    ├── src/
    │   ├── index.ts              # Hono 엔트리포인트
    │   ├── env.ts                # D1/KV/secrets 바인딩 타입
    │   ├── routes/
    │   │   ├── health.ts         # GET /health (T079)
    │   │   └── integrations/
    │   │       └── github.ts     # POST /integrations/github/installation-token (T061)
    │   │   (auth.ts — M8 T086, sync.ts — M9 T087+ 예정)
    │   ├── lib/
    │   │   ├── auth.ts           # Bearer 미들웨어 stub (T086 M8 에서 JWT 검증)
    │   │   ├── github-app.ts     # GitHub App JWT 서명, installation token 발급
    │   │   └── kv-cache.ts       # KV 기반 토큰 캐시 (55분 TTL)
    │   └── db/
    │       └── schema.ts         # D1 스키마 (Drizzle)
    ├── migrations/
    │   └── 0001_init.sql         # D1 첫 마이그레이션
    └── test/
        ├── health.test.ts
        └── github.test.ts
```

## 빌드/배포 분리

OSS 코어와 EE 코드는 다음과 같이 빌드 파이프라인을 분리한다:

- **OSS** (`/src`, `/src-tauri`): `.github/workflows/ci.yml` — frontend + rust job. 누구나 빌드 가능.
- **EE** (`/ee/**`): 두 개의 워크플로우로 관리
  - `.github/workflows/ci.yml` 의 `ee-relay` job — PR 마다 typecheck + vitest (시크릿 불필요)
  - `.github/workflows/deploy-relay.yml` — main push 또는 수동 트리거 시 Cloudflare Workers 자동 배포 (`CLOUDFLARE_API_TOKEN` 시크릿 필요)

### GitHub Actions Secret 등록

자동 배포를 활성화하려면 `CLOUDFLARE_API_TOKEN` 을 GitHub Repository Secret 에 등록해야 한다.
→ 발급 및 등록 절차: [`docs/runbooks/cloudflare-api-token.md`](../docs/runbooks/cloudflare-api-token.md)

외부 contributor 의 fork 에서는 `deploy` job 이 시크릿 없이 실패하지만, `test` job 은 정상 동작한다.

## 시크릿 관리

EE 코드는 Cloudflare `wrangler secret put` 으로 주입된 환경변수에 의존한다:

- `GITHUB_APP_ID`
- `GITHUB_APP_PRIVATE_KEY` (PEM)
- `GITHUB_WEBHOOK_SECRET`
- (이후 추가)

로컬 개발 시 `.dev.vars` 파일을 사용 — `.gitignore` 로 제외됨.

## 기여

EE 코드에도 PR 를 받는다 (CLA 동일). 단 production 배포 권한은 copyright holder 에게만 있다.
