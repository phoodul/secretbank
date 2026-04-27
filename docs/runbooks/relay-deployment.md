# Relay 배포 가이드 (Cloudflare Workers)

`ee/api-vault-relay/` 를 Cloudflare Workers 에 배포하는 step-by-step 가이드.

---

## 사전 조건

- [ ] [Cloudflare 계정](https://dash.cloudflare.com/) 생성 완료
- [ ] `wrangler login` 완료 (`npx wrangler login` 또는 `pnpm dlx wrangler login`)
- [ ] Node.js 20+ 및 pnpm 설치 완료
- [ ] GitHub App 등록 완료 → [`docs/runbooks/github-app-registration.md`](./github-app-registration.md) 참조

---

## 1. 프로젝트 의존성 설치

```bash
cd ee/api-vault-relay
pnpm install
```

---

## 2. D1 데이터베이스 생성

```bash
wrangler d1 create api-vault-relay
```

출력 예시:

```
✅ Successfully created DB 'api-vault-relay' in region APAC
Created your new D1 database.

[[d1_databases]]
binding = "DB"
database_name = "api-vault-relay"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

출력된 `database_id` 를 `wrangler.toml` 에 붙여넣는다:

```toml
[[d1_databases]]
binding = "DB"
database_name = "api-vault-relay"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"  # ← 여기
```

---

## 3. KV 네임스페이스 생성

```bash
wrangler kv namespace create TOKEN_CACHE
```

출력 예시:

```
✅ Successfully created KV namespace "TOKEN_CACHE"

[[kv_namespaces]]
binding = "TOKEN_CACHE"
id = "yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy"
```

출력된 `id` 를 `wrangler.toml` 에 붙여넣는다:

```toml
[[kv_namespaces]]
binding = "TOKEN_CACHE"
id = "yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy"  # ← 여기
```

---

## 4. account_id 설정

Cloudflare 대시보드 우측 사이드바 → "Account ID" 를 복사해 `wrangler.toml` 에 입력:

```toml
account_id = "zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz"  # ← 여기
```

---

## 5. D1 마이그레이션 적용

**로컬 개발용:**

```bash
pnpm db:migrate:local
```

**운영 환경:**

```bash
pnpm db:migrate:remote
```

> ⚠️ **`wrangler dev` 는 D1 마이그레이션을 자동 적용하지 않는다.** 새 마이그레이션 파일이 추가될 때마다 (`git pull` 직후 등) `pnpm db:migrate:local` 을 다시 돌려야 한다. 그렇지 않으면 새 컬럼/테이블을 참조하는 엔드포인트가 `D1_ERROR: no such column: ... SQLITE_ERROR` 와 함께 500 응답으로 떨어진다.
>
> CI/CD 배포 (`pnpm db:migrate:remote`) 도 운영 D1 에 별도 적용해야 한다 — `pnpm deploy` 는 코드만 배포하고 마이그레이션은 건드리지 않는다.

---

## 6. GitHub App 시크릿 주입

`GITHUB_APP_ID` 는 공개 값이므로 `wrangler.toml` `[vars]` 에 직접 입력:

```toml
[vars]
GITHUB_APP_ID = "123456"   # GitHub App 등록 시 발급된 App ID
```

나머지 시크릿은 `wrangler secret put` 으로 주입 (값을 채팅/파일에 붙여넣지 말 것):

```bash
# GitHub App private key (PEM 전체를 붙여넣은 뒤 Enter + Ctrl+D)
wrangler secret put GITHUB_APP_PRIVATE_KEY

# Webhook 서명 검증용 시크릿
wrangler secret put GITHUB_WEBHOOK_SECRET
```

---

## 7. 로컬 개발 환경변수 (.dev.vars)

```bash
cp .dev.vars.example .dev.vars
# .dev.vars 를 편집해 실제 값 입력
# 이 파일은 .gitignore 에 등록되어 있어 커밋되지 않는다
```

---

## 8. Custom Domain 연결 (선택)

`relay.api-vault.app` 도메인을 릴레이에 연결하는 방법:

**방법 A — Cloudflare 대시보드:**
1. Workers & Pages → `api-vault-relay` → Settings → Triggers
2. Custom Domains → `relay.api-vault.app` 추가

**방법 B — wrangler.toml:**
`wrangler.toml` 의 주석을 해제:

```toml
routes = [
  { pattern = "relay.api-vault.app/*", custom_domain = true }
]
```

그 후 `pnpm deploy` 를 다시 실행.

---

## 9. 첫 배포

```bash
pnpm deploy
```

---

## 10. 배포 검증

```bash
# workers.dev URL (wrangler deploy 출력에서 확인)
curl https://api-vault-relay.<your-subdomain>.workers.dev/health

# custom domain 연결 후
curl https://relay.api-vault.app/health
```

정상 응답:

```json
{
  "status": "ok",
  "service": "api-vault-relay",
  "version": "0.1.0",
  "time": "2026-04-25T12:00:00.000Z"
}
```

---

## 11. 롤백 / 재배포

```bash
# 최근 배포 목록 확인
wrangler deployments list

# 특정 배포로 롤백
wrangler rollback
```
