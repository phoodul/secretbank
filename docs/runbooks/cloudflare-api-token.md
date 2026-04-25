# Runbook: Cloudflare API Token 발급 및 GitHub Secret 등록

`deploy-relay.yml` 워크플로우가 Cloudflare Workers 에 자동 배포하려면
`CLOUDFLARE_API_TOKEN` GitHub Secret 이 필요하다.

## 1. Cloudflare API Token 발급

1. [Cloudflare 대시보드](https://dash.cloudflare.com/) 로그인
2. 우측 상단 프로필 → **My Profile** → **API Tokens** 탭
3. **Create Token** 클릭
4. 템플릿 목록에서 **Edit Cloudflare Workers** 선택 후 **Use template**
5. 권한 확인 (기본값 유지):
   - Account > **Workers Scripts**: Edit
   - Account > **Workers KV Storage**: Edit
   - Account > **D1**: Edit
   - (선택) Zone > Zone: Read — custom domain 없으면 불필요
6. **Account Resources**: 본인 계정 선택
7. **Continue to summary** → **Create Token**
8. 토큰이 한 번만 표시됨 — 즉시 복사 (창 닫으면 재발급 필요)

> 보안 주의: 토큰 값을 채팅·슬랙·이메일에 공유하지 마라.
> 노출 시 즉시 Cloudflare 대시보드에서 해당 토큰을 **Revoke** 하고 재발급한다.

## 2. GitHub Repository Secret 등록

1. GitHub 저장소 → **Settings** → 왼쪽 사이드바 **Secrets and variables** → **Actions**
2. **New repository secret** 클릭
3. 입력:
   - **Name**: `CLOUDFLARE_API_TOKEN`
   - **Secret**: 1단계에서 복사한 토큰 값
4. **Add secret** 저장

## 3. 배포 검증

### 자동 트리거 검증

`ee/api-vault-relay/` 경로 파일 변경 후 main 에 push 하면
GitHub Actions 탭에서 **Deploy Relay** 워크플로우가 자동 실행된다.

### 수동 트리거 검증

1. GitHub 저장소 → **Actions** → **Deploy Relay** 워크플로우 선택
2. 우측 **Run workflow** → **Run workflow** 클릭
3. `test` job → `deploy` job 순서로 통과하면 성공

### 배포 확인

Cloudflare 대시보드 → Workers & Pages → `api-vault-relay` Worker → **Deployments** 탭에서
최신 배포 항목과 타임스탬프를 확인한다.

## 4. 토큰 갱신

토큰 만료 또는 노출 시:

1. Cloudflare → My Profile → API Tokens → 해당 토큰 **Revoke**
2. 위 1~2단계 반복
3. GitHub Secret 의 기존 `CLOUDFLARE_API_TOKEN` 을 새 값으로 **업데이트** (덮어쓰기)
