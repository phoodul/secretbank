# GitHub App 등록 Runbook

## 목적

API Vault 가 GitHub Secret Scanning alerts 를 폴링하고, webhook 이벤트를 수신하기 위해
**GitHub App** 을 사용한다. GitHub App 은 개인 액세스 토큰(PAT) 방식보다 세밀한 권한 제어와
installation-level 격리를 제공하며, OAuth App 과 달리 조직(org) 전체에 일괄 설치가 가능하다.

> **보안 원칙**: GitHub App private key 는 **릴레이(Cloudflare Workers)에만 보관**된다.
> 데스크톱 클라이언트는 릴레이가 발급한 short-lived installation token(유효기간 1시간)만 사용한다.
> 클라이언트 코드 또는 로컬 DB 에 private key 를 저장하지 않는다.

---

## 사전 조건

| 조건 | 설명 |
|:-----|:-----|
| GitHub.com 계정 | organization owner 또는 개인 계정 owner |
| Cloudflare Workers 릴레이 | `relay.api-vault.app` 이 배포되어 있어야 함 |
| `wrangler` CLI | `npm install -g wrangler` + `wrangler login` 완료 |
| Pro tier | Secret Scanning 알림 폴링은 T064 Entitlement 게이트 이후 Pro 전용으로 제한됨 |

---

## App 생성 — Step-by-Step

### Step 1. GitHub Apps 페이지 진입

1. GitHub.com 에 로그인.
2. **우상단 프로필 → Settings → Developer settings → GitHub Apps → "New GitHub App"** 클릭.

### Step 2. 기본 정보 입력

| 필드 | 값 |
|:-----|:---|
| GitHub App name | `api-vault` (또는 `api-vault-<org>` 로 구분) |
| Homepage URL | `https://api-vault.app` |
| Callback URL (OAuth) | `https://relay.api-vault.app/integrations/github/callback` |
| **Setup URL** (post-install) | `apivault://github/callback` ← **필수**. 사용자가 GitHub 에서 "Install" 누른 직후 OS 가 데스크톱 앱을 deep-link 로 다시 연다. URL 의 `?installation_id=N` 쿼리를 `useGithubIntegration` 의 `parseGithubCallbackUrl` 가 파싱한다. ✅ "Redirect on update" 체크 |
| Callback URL (deep link, 호환용) | `apivault://github/callback` (Setup URL 과 동일하게 두면 GitHub 이 OAuth 와 install 양쪽 redirect 를 모두 deep-link 로 보낸다) |
| Webhook URL | `https://relay.api-vault.app/integrations/github/webhook` |
| Webhook secret | 충분한 엔트로피를 가진 랜덤 값 생성 → `GITHUB_WEBHOOK_SECRET` 으로 릴레이에 등록 |

> **deep-link 동작 확인**: 앱 설치 직후 OS 알림에 "api-vault 가 apivault:// URL 을 열려고 합니다" 가 뜨고 허용하면, Settings → GitHub Integration 카드의 Connect 흐름이 자동으로 닫히면서 Installation 카드가 표시되어야 한다. 표시 안 되면 (1) Setup URL 오타, (2) 운영체제의 deep-link scheme 등록 누락 (`tauri-plugin-deep-link` 의 `register_all` 가 첫 부팅에 실행되어야 함), (3) 브라우저 보안 정책으로 사용자가 prompt 를 거부했을 수 있다.

Webhook secret 생성 예시:
```sh
openssl rand -hex 32
```

### Step 3. Permissions 설정

**Repository permissions**:

| 권한 | 수준 | 비고 |
|:-----|:-----|:-----|
| Secret scanning alerts | Read | MVP 핵심 — 필수 |
| Metadata | Read | 모든 App 필수 (자동 활성) |
| Actions secrets | Write | Pro 전용 (T064). 초기 등록 시에는 `None` 으로 두고, Pro 활성화 후 변경 |

**Organization permissions**: 초기 단계에서는 별도 설정 불필요.

> Actions Secrets Write 권한은 사용자 동의 재승인이 필요하다. 초기 등록 시 포함하지 않고
> T064 Pro 게이트 이후 별도 권한 업데이트 플로우로 처리한다.

### Step 4. Events 구독

**Subscribe to events** 섹션에서 다음을 체크:

- `secret_scanning_alert` — alert 생성/해소 시 webhook 발송

### Step 5. Install 대상 선정

- **"Only on this account"** — 개인 계정 테스트용
- **"Any account"** — 퍼블릭 배포 시 선택

App 생성 후 **Install App** → organization 또는 사용자 계정 → 저장소 범위(모든 저장소 또는 선택) 지정.
설치 완료 시 **`installation_id`** 가 발급된다.

---

## App Private Key 관리

### Private key 생성 및 릴레이 주입

1. App 설정 페이지 → **"Generate a private key"** 클릭 → `.pem` 파일 다운로드.
2. 릴레이에 주입 (로컬 파일 시스템 잔류 최소화):
   ```sh
   wrangler secret put GITHUB_APP_PRIVATE_KEY < github-app.pem
   rm github-app.pem   # 즉시 삭제
   ```
3. `.pem` 파일을 절대 git 에 커밋하지 않는다. `.gitignore` 에 `*.pem` 추가 확인.

### 토큰 발급 흐름

```
클라이언트 (Desktop)
  │  POST /integrations/github/token
  │  { installation_id: 12345 }
  ▼
릴레이 (Cloudflare Workers)
  │  JWT 서명 (RS256, GITHUB_APP_PRIVATE_KEY)
  │  POST https://api.github.com/app/installations/{id}/access_tokens
  ▼
GitHub API  →  { token: "ghs_xxx", expires_at: "..." }
  ▼
릴레이  →  클라이언트에 token 반환 (유효기간 1시간)
```

클라이언트는 발급받은 `token` 을 메모리에만 유지하고, 만료 전 재발급한다.

---

## 환경변수 요약 (릴레이 `wrangler.toml`)

| 변수 | 종류 | 설명 |
|:-----|:-----|:-----|
| `GITHUB_APP_ID` | 공개 (var) | App 생성 후 표시되는 숫자 ID |
| `GITHUB_APP_PRIVATE_KEY` | **Secret** | `.pem` 전체 내용 |
| `GITHUB_WEBHOOK_SECRET` | **Secret** | webhook 서명 검증용 |
| `GITHUB_APP_CLIENT_ID` | 공개 (var) | OAuth 연동 준비용, 선택 |
| `GITHUB_APP_CLIENT_SECRET` | **Secret** | OAuth 연동 준비용, 선택 |

`wrangler.toml` 예시 (공개 변수만 커밋, secret 은 `wrangler secret put` 으로 별도 주입):
```toml
[vars]
GITHUB_APP_ID = "123456"
GITHUB_APP_CLIENT_ID = "Iv1.abc..."
```

---

## 클라이언트 저장 데이터

데스크톱 앱 로컬 DB(`settings` 테이블)에 저장하는 값:

| 키 | 예시 값 | Secret 여부 |
|:---|:--------|:------------|
| `github.installation_id` | `12345678` | 아니오 — 공개 ID |
| `github.relay_base_url` | `https://relay.api-vault.app` | 아니오 |

installation token 은 메모리에만 유지. 로컬 DB 에 저장하지 않는다.

---

## Troubleshooting

### installation_id 재발급

앱을 재설치하면 `installation_id` 가 변경된다. 변경 시:
1. 릴레이 webhook 으로 `installation` 이벤트(`action: created`) 수신.
2. 릴레이가 새 `installation_id` 를 API Vault 클라이언트에 통보.
3. 클라이언트가 설정 갱신 및 token 재발급 요청.

### Permission 변경 시 사용자 재승인

App 에 새 권한을 추가하면 기존 설치 사용자들이 재승인해야 한다:
1. GitHub 가 각 설치 org/user 에게 이메일로 승인 요청 발송.
2. 승인 전까지 신규 권한으로 호출하면 `403 Forbidden`.
3. API Vault UI 에서 "권한 업데이트 필요" 배너를 표시하고 재설치 링크를 제공 (T063 이후).

### Webhook 서명 검증 실패

- `X-Hub-Signature-256` 헤더가 없거나 불일치 → 릴레이에서 `400 Bad Request` 반환.
- `GITHUB_WEBHOOK_SECRET` 이 GitHub App 설정과 동기화되어 있는지 확인.
- `wrangler secret list` 로 키 존재 여부 확인 (값은 노출되지 않음).

---

## 관련 태스크

| 태스크 | 내용 |
|:-------|:-----|
| T060 (현재) | GitHub App 등록 runbook + connector skeleton |
| T061 | 릴레이 경유 installation token 발급 구현 |
| T062 | Secret Scanning alerts 읽기 + Incident 매핑 |
| T063 | GitHub connector UI (설치 플로우, 상태 표시) |
| T064 | Entitlement 게이트 — Pro 사용자만 Actions Secrets Write 허용 |
