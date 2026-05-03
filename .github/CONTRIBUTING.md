# Contributing

이 프로젝트는 **Claude Code 기반 AI 코워크 워크플로우**로 운영됩니다. 외부 기여자는 아래 절차를 따라주세요.

## 빠른 시작

1. 이 레포를 fork
2. fork에서 새 브랜치 생성: `git checkout -b feat/my-change`
3. 변경 후 커밋·푸시
4. 원본 레포에 PR 생성

## 커밋 메시지 규칙

`type: 한글 제목` 형식. 72자 이내.

- type: `feat` / `fix` / `docs` / `refactor` / `test` / `chore` / `perf` / `ci` / `build`
- 예: `feat: 사용자 인증 플로우 추가`

## PR 워크플로우

### 자동 검증 (모든 PR — `ci.yml`)

다음 4개 job이 자동으로 실행되며, 모두 통과해야 머지 가능합니다 (branch protection):

- **Rust** — `cargo fmt --check`, `cargo clippy -D warnings`, `cargo test`
- **Frontend** — `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`
- **E2E smoke** — Playwright browser-mode 핵심 플로우
- **EE Relay** — `ee/api-vault-relay`의 typecheck + test

### Claude 자동 리뷰 (선택, 메인테이너 라벨)

- 메인테이너가 `claude-review` 라벨을 붙이면 Claude AI가 자동 리뷰합니다.
- Fork PR은 **추가로** `safe-to-review` 라벨이 필요합니다 (악성 코드 방지).
- AI 리뷰는 보조 수단이며 자동 승인/차단하지 않습니다 — 코멘트만.

### Desktop (Tauri v2) 도메인 게이트

이 프로젝트는 **desktop 프리셋**을 사용합니다. `claude-review` 라벨이 붙은 PR에서 다음 게이트가 자동 실행됩니다 (`domain-gate.yml`):

- Tauri v2 IPC + capability 검증
- 플랫폼 매트릭스 (Windows/macOS/Linux) 분기 누락 검사
- 코드사인 통과 (release PR만 — `tauri.conf.json` identifier/signing 변경 시 🟡 권장)

## 시크릿 안전

PR diff에 다음을 포함하지 마세요:

- `.env*`, API key, password, token, `DATABASE_URL`
- 발견 시 즉시 제거 + key rotation

자동 secret-scanning이 활성화되어 있으나, 사전 차단이 최선입니다.

## 보안 이슈 보고

보안 취약점은 **공개 이슈로 올리지 마세요**. 대신 Security tab → "Report a vulnerability"로 비공개 advisory를 사용하세요. 또는 `SECURITY.md` 참조.

## CLA

기여 시 `CLA.md`에 동의해야 합니다 (`cla.yml` 워크플로우가 자동 안내).

## 라이선스

기여 시 본 프로젝트 라이선스(`LICENSE` / `LICENSE_FAQ.md` 참조)에 동의한 것으로 간주합니다.
