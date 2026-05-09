# Tasks — M24-E Browser Extension (Phase A~F sub-tasks)

> 작성자: Planner Agent (claude-opus-4-7)
> 작성일: 2026-05-09
> 상태: Phase A 완료 (A1~A7 모두 완료), Phase B 진입 — B1~B3 완료
> 참조: `docs/architecture.md` 10장, `docs/integrator_report_m24e.md`, `docs/project-decisions.md` [2026-05-09]
> 갱신: **기존 `docs/task.md` 의 T-24-E ("스켈레톤 only") 항목을 본 문서의 Phase A~F 풀구현 sub-task 들로 대체한다.**

---

## 변경 사실 명시 (2026-05-09)

### task.md 의 변경 사항 (orchestrator 가 첫 commit 시 반영할 diff)

다음 두 위치를 수정한다:

**1. `docs/task.md` 마일스톤 표 (라인 27~57 부근)** — 기존 표에 한 줄 추가:

```markdown
| **M24-E** | **Browser Extension (Phase A~F 풀구현)** | T-24-E-A1~F8 | 43 sub-tasks | 🔄 15/43 완료 |
```

위치: M25 행 뒤 (또는 알파벳/번호 순서에 따라 M24 행 직후).

**2. `docs/task.md` T-24-E 항목 (라인 2218~2228)** — 기존 "스켈레톤 only" 블록을 다음 한 줄로 교체:

```markdown
### T-24-E. 브라우저 autofill 확장 — **갱신 [2026-05-09]: 풀구현 격상**

→ Phase A~F 49 sub-task 로 분해. 상세는 `docs/task_m24e.md` 참조. 마일스톤 ID = M24-E.
```

> **변경 사실**: 기존 [2026-04-22] T-24-E 사양 ("스켈레톤 only — 실 구현 후속") 은 [2026-05-09] M24-E GATE 1 승인으로 풀구현 격상. Phase A~F 6 phase, 총 49 sub-task, 예상 55일.

### 진행 현황 표 (task.md 라인 60~) — 변경 없음

**기존 표는 건드리지 않는다.** M24-E sub-task 의 완료 매핑은 본 문서의 "진행 현황 — M24-E" 섹션에 기록한다 (orchestrator 가 commit 직후 즉시 갱신).

---

## sub-task 스키마

각 sub-task 는 다음 필드를 가진다:

- **ID**: `T-24-E-{Phase}{Number}` (예: `T-24-E-A1`, `T-24-E-B3`)
- **Goal**: 1 줄
- **DoD** (Definition of Done): 검증 가능한 기준 3~5개
- **Files Touched**: 예상 파일 경로
- **Tests**: Rust unit / Vitest / Playwright / web-ext / 수동
- **Depends on**: 선행 sub-task ID (없으면 `-`)
- **Risk**: LOW / MEDIUM / HIGH + 완화
- **예상 토큰**: 대략적 추정 (planner 의견)

---

## Phase A — WXT 모노레포 + shared lib 골격 (예상 7일)

위험도 LOW. 단순 빌드 환경 셋업.

### T-24-E-A1. WXT 프로젝트 골격 + Tailwind v4 + shadcn/ui

- **Goal**: `extension/` 디렉토리에 WXT v0.20.x 프로젝트 초기화 + popup 빈 셸 동작.
- **DoD**:
  - `extension/wxt.config.ts` — chromium + firefox 두 빌드 타깃
  - `extension/package.json` — `@secretbank/extension`, workspace 멤버, `pnpm dev` 가능
  - `extension/tailwind.config.ts` + `extension/postcss.config.cjs` (postcss-rem-to-px 포함)
  - `extension/components/ui/button.tsx` — shadcn/ui 별도 설치 (src/components/ui 와 분리)
  - `pnpm --filter @secretbank/extension build` 성공 → `dist/chromium/` + `dist/firefox/` 산출
- **Files Touched**: `extension/wxt.config.ts`, `extension/package.json`, `extension/tailwind.config.ts`, `extension/postcss.config.cjs`, `extension/components/ui/button.tsx`, `extension/entrypoints/popup/index.html`, `extension/entrypoints/popup/App.tsx`, `pnpm-workspace.yaml`, `package.json` (root scripts)
- **Tests**: Vitest (`extension/components/ui/button.test.tsx` 렌더 테스트), 빌드 성공 검증
- **Depends on**: -
- **Risk**: LOW (WXT 공식 가이드 따름)
- **예상 토큰**: 8k

### T-24-E-A2. packages/shared workspace + types 모듈

- **Goal**: `packages/shared/` 워크스페이스 신설 + 공유 타입 (CredentialKind / IssuerRecipe / pairing types) 정의.
- **DoD**:
  - `packages/shared/package.json` — `@secretbank/shared`, ESM only
  - `packages/shared/tsconfig.json` — composite 빌드, strict
  - `packages/shared/src/types/credential.ts` — 데스크톱 앱의 `CredentialKind` 와 동일 union (api_key / password / credit_card / passkey / totp_secret / secure_note)
  - `packages/shared/src/types/recipe.ts` — IssuerRecipe (min/max/uppercase/number/special/forbidden)
  - `packages/shared/src/types/pairing.ts` — PairingState / SessionToken / NMMessage union
  - `extension` 에서 `import { CredentialKind } from '@secretbank/shared'` 동작
- **Files Touched**: `packages/shared/package.json`, `packages/shared/tsconfig.json`, `packages/shared/src/index.ts`, `packages/shared/src/types/*.ts`
- **Tests**: Vitest type-only smoke tests
- **Depends on**: A1
- **Risk**: LOW
- **예상 토큰**: 6k

### T-24-E-A3. packages/shared/password-generator (Diceware 4 lang + zxcvbn-ts + recipe)

- **Goal**: 데스크톱 generator 로직을 shared lib 으로 이관 (또는 신규). desktop + extension 모두 동일 호출.
- **DoD**:
  - `packages/shared/src/password-generator/diceware.ts` — Diceware 6단어 (en/ko/ja/zh, BIP39 wordlist 기반)
  - `packages/shared/src/password-generator/strength.ts` — `zxcvbn-ts` (zxcvbn 원본은 미유지보수 → 대체) wrapper, 0-4 + 크랙 시간
  - `packages/shared/src/password-generator/recipe.ts` — issuer recipe → 무작위 문자열 생성기 (CSPRNG = `crypto.getRandomValues` / WebCrypto)
  - `packages/shared/src/password-generator/wordlists/{en,ko,ja,zh}.json` — BIP39 기반 (라이선스 명시)
  - 기존 desktop generator 호출 부분이 shared 모듈로 마이그레이션 (또는 양쪽 병행, 마이그레이션은 Phase E-1 에서 마무리)
  - 단위 테스트: Diceware 길이 검증, recipe 정책 위반 ❌, zxcvbn 점수 결정성
- **Files Touched**: `packages/shared/src/password-generator/*.ts`, `packages/shared/src/password-generator/wordlists/*.json`, (선택) `src/features/password-generator/*` 의 import 경로 갱신
- **Tests**: Vitest (각 lang 별 wordlist 무결성, recipe 위반 검증, zxcvbn 점수)
- **Depends on**: A2
- **Risk**: MEDIUM (zxcvbn-ts 마이그레이션 시 desktop 회귀 가능 — Phase E-1 에서 통합 검증)
- **예상 토큰**: 14k

### T-24-E-A4. packages/shared/validation (공유 zod schemas)

- **Goal**: 데스크톱 + extension 양쪽에서 사용하는 credential / recipe / pairing payload validator 통합.
- **DoD**:
  - `packages/shared/src/validation/credential.ts` — Zod schema (CredentialKind 별 분기 — discriminated union)
  - `packages/shared/src/validation/recipe.ts` — Zod IssuerRecipeSchema
  - `packages/shared/src/validation/pairing.ts` — NM message Zod schemas (init / pair / reveal / save)
  - desktop 측 사용 마이그레이션 (선택)
- **Files Touched**: `packages/shared/src/validation/*.ts`
- **Tests**: Vitest (positive + negative)
- **Depends on**: A2
- **Risk**: LOW
- **예상 토큰**: 6k

### T-24-E-A5. extension/\_locales + @wxt-dev/i18n 통합

- **Goal**: 4 로케일 (en/ko/ja/zh) YAML 셋업 + 타입 안전 사용.
- **DoD**:
  - `extension/_locales/{en,ko,ja,zh}.yml` — 빌드 시 messages.json 자동 생성
  - `extension/lib/i18n.ts` — `@wxt-dev/i18n` 초기화
  - `packages/shared/src/i18n-keys.ts` — 공통 키 상수 (desktop 과 공유 — 다음 phase 에서 desktop 도 이를 가리키도록)
  - popup 의 1개 문자열이 4 lang 모두 표시 (수동 검증 OK)
- **Files Touched**: `extension/_locales/*.yml`, `extension/lib/i18n.ts`, `extension/wxt.config.ts` (i18n 모듈 활성화), `packages/shared/src/i18n-keys.ts`
- **Tests**: Vitest (i18n key resolution)
- **Depends on**: A1, A2
- **Risk**: LOW
- **예상 토큰**: 7k

### T-24-E-A6. extension/popup 골격 + Theme + 기본 라우팅

- **Goal**: popup 의 Tab 라우팅 + ThemeProvider + 기본 화면 (Inventory / Settings) 셸 동작.
- **DoD**:
  - `extension/entrypoints/popup/App.tsx` — `<ThemeProvider>` + cmdk 없이 Tab 기반 라우팅 (popup 은 cmdk 미사용)
  - 4개 화면 placeholder: PairingDialog, CredentialList, SaveDialog, Settings (모두 빈 컴포넌트)
  - dark/light 토글 동작
  - `pnpm --filter @secretbank/extension dev` 시 popup 이 Chrome / Firefox 에서 표시
- **Files Touched**: `extension/entrypoints/popup/App.tsx`, `extension/entrypoints/popup/{PairingDialog,CredentialList,SaveDialog,Settings}.tsx`, `extension/components/theme/theme-provider.tsx`
- **Tests**: Vitest 렌더 테스트 (App.tsx)
- **Depends on**: A1, A5
- **Risk**: LOW
- **예상 토큰**: 7k

### T-24-E-A7. CI 빌드 매트릭스 (Chrome + Firefox 동시)

- **Goal**: GitHub Actions 가 매 commit 마다 chromium + firefox 빌드 검증.
- **DoD**:
  - `.github/workflows/extension-ci.yml` — pnpm install → `pnpm --filter @secretbank/extension build` (chromium + firefox)
  - 산출물 (`dist/chromium/`, `dist/firefox/`) artifact 업로드
  - typecheck + lint 게이트
  - 기존 cargo test / pnpm vitest CI 와 병렬 실행 (회귀 검증)
  - Safari / Edge 빌드는 Phase F (제외)
- **Files Touched**: `.github/workflows/extension-ci.yml`, (선택) 기존 `.github/workflows/ci.yml` 갱신
- **Tests**: 자체 (CI 자체가 검증)
- **Depends on**: A1, A6
- **Risk**: LOW
- **예상 토큰**: 5k

**Phase A 검증 게이트** (T-24-E-A1~A7 모두 완료 후):

- `pnpm --filter @secretbank/extension build` 성공 (Chrome + Firefox)
- 기존 `cargo test --workspace --manifest-path src-tauri/Cargo.toml` 586 PASS 회귀 없음
- 기존 `pnpm vitest run` 614 PASS 회귀 없음
- `pnpm typecheck` + `pnpm lint` PASS
- 수동: Chrome 에 unpacked 확장 로드 → popup 열림 / 4 lang 토글 / theme 토글 동작

---

## Phase B — Native Messaging Host + 페어링 (예상 10일, 위험도 최고)

**B1 ~ B5 blocker 완화 위해 사전 작업 필수** (implementation_plan.md 참조).

### T-24-E-B1. secretbank-nm-host Rust crate 신설 (stdio 이벤트 루프)

- **Goal**: `src-tauri/crates/secretbank-nm-host/` 새 binary crate. stdin/stdout 4-byte length header + UTF-8 JSON.
- **DoD**:
  - `Cargo.toml` — `[[bin]] name = "secretbank-nm-host"`, dependencies: `tokio`, `serde_json`, `secretbank-crypto` (workspace), `tracing`
  - `src/main.rs` — async 이벤트 루프, ctrl-c handler, panic hook → stderr 만 (stdout 오염 ❌)
  - `src/protocol.rs` — encode/decode (4-byte LE u32 length header + JSON body, 1MB 상한)
  - `cargo test --package secretbank-nm-host` PASS (encode/decode round-trip + invalid frame rejection)
  - `cargo clippy --package secretbank-nm-host -- -D warnings` PASS
- **Files Touched**: `src-tauri/Cargo.toml` (workspace members), `src-tauri/crates/secretbank-nm-host/Cargo.toml`, `src-tauri/crates/secretbank-nm-host/src/{main.rs,protocol.rs}`
- **Tests**: Rust unit (`tests/protocol_roundtrip.rs`)
- **Depends on**: A1 (workspace 기본)
- **Risk**: MEDIUM (stdout 오염 위험 — println!/dbg! 금지 강제 검증 필요)
- **예상 토큰**: 10k

### T-24-E-B2. NM Host installer 등록 (Win 레지스트리 / macOS plist / Linux config)

- **Goal**: 데스크톱 앱 설치 시 NM host manifest 가 OS 표준 경로에 등록되어 브라우저가 binary 를 찾을 수 있다.
- **DoD**:
  - `src-tauri/crates/secretbank-nm-host/src/installer.rs` — 3 OS 별 등록/해제 함수
    - Windows: `HKCU\Software\Google\Chrome\NativeMessagingHosts\com.secretbank.nm_host` 레지스트리 + Firefox `HKCU\Software\Mozilla\NativeMessagingHosts\...`
    - macOS: `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.secretbank.nm_host.json` + Firefox `~/Library/Application Support/Mozilla/NativeMessagingHosts/...`
    - Linux: `~/.config/google-chrome/NativeMessagingHosts/...` + `~/.mozilla/native-messaging-hosts/...`
  - Tauri installer hook: 설치 후 자동 등록 (Tauri bundler `afterBundle` hook 또는 Tauri 앱 첫 실행 시 자동 등록)
  - 사용자 수동 명령: `secretbank-nm-host --install` / `--uninstall`
  - 3 OS 수동 테스트: 등록 후 `chrome://extensions` 의 unpacked extension 이 NM host 와 connect 성공 (T-24-E-B10 에서 자동화)
- **Files Touched**: `src-tauri/crates/secretbank-nm-host/src/installer.rs`, `src-tauri/tauri.conf.json` (bundler hook), 또는 Tauri 앱 setup hook
- **Tests**: Rust unit (manifest JSON 직렬화 검증), 수동 3 OS 검증 (T-24-E-B10)
- **Depends on**: B1
- **Risk**: HIGH (Blocker B1 — Win UAC / macOS Gatekeeper / Linux 배포판 차이). 완화: `native_messaging` Rust crate (researcher 보고서 출처) 의 install() 함수 패턴 참조 + Phase B 시작 전 3 OS 수동 등록 사전 검증
- **예상 토큰**: 12k

### T-24-E-B3. extension/lib/nm-client.ts (TypeScript NM client)

- **Goal**: 확장이 nm-host 와 통신하는 typed wrapper.
- **DoD**:
  - `extension/lib/nm-client.ts` — `connect()` / `sendMessage(msg)` / `onMessage(handler)` / `disconnect()`
  - `chrome.runtime.connectNative('com.secretbank.nm_host')` 사용 (long-lived port)
  - 메시지 schema = `packages/shared/src/types/pairing.ts` 의 NMMessage union
  - 에러 처리: `runtime.lastError` 검사, reconnect with exponential backoff
  - port 가 끊기면 (host 미설치 / 사용자 disconnect) → 사용자에게 안내 메시지
- **Files Touched**: `extension/lib/nm-client.ts`, `extension/lib/nm-errors.ts`
- **Tests**: Vitest (Mock chrome.runtime API + Mock NM Host stub — F-5 와 연계)
- **Depends on**: A2, B1
- **Risk**: MEDIUM (MV3 SW idle 타임아웃 — Port 연결 유지로 자동 keepalive, T6 완화)
- **예상 토큰**: 8k

### T-24-E-B4. 페어링 protocol — X25519 ECDH + ChaCha20-Poly1305

- **Goal**: KeePassXC 단순화 (3-key → 2-key) + secretbank-crypto 재사용.
- **DoD**:
  - `src-tauri/crates/secretbank-nm-host/src/pairing.rs` — Rust 측 X25519 keypair gen, ECDH, ChaCha20-Poly1305 encrypt/decrypt (모두 secretbank-crypto crate 호출)
  - `extension/lib/pairing.ts` — Web Crypto API 로 X25519 (`crypto.subtle.deriveKey`) + ChaCha20-Poly1305 (Web Crypto 미지원 → `@noble/ciphers` 또는 동등 폴리필 npm 패키지)
  - 메시지 흐름: extension → nm-host `init` → nm-host → desktop IPC `pair_request` → desktop dialog → 사용자 승인 → desktop X25519 keypair → pub 전달 → 확장 X25519 keypair → ECDH → 양쪽 shared key 일치
  - 단위 테스트: Rust ↔ TS 양쪽 ECDH 결과 동일성 (test vector 공유)
- **Files Touched**: `src-tauri/crates/secretbank-nm-host/src/pairing.rs`, `extension/lib/pairing.ts`, `extension/lib/crypto.ts` (@noble/ciphers wrapper), `packages/shared/src/types/pairing.ts` (확장)
- **Tests**: Rust unit (RFC 7748 X25519 test vectors), Vitest (Web Crypto + @noble/ciphers cross-check)
- **Depends on**: B1, B3
- **Risk**: HIGH (Blocker B4 — 보안 audit 대상). 완화: secretbank-crypto crate 재활용 + Phase B 완료 후 외부 audit (T-24-E-B9)
- **예상 토큰**: 14k

### T-24-E-B5. extension/popup PairingDialog + 확장 측 페어링 흐름

- **Goal**: 확장 첫 설치 시 자동 NM connect → 데스크톱 앱이 dialog 표시 → 승인 후 페어링 완료.
- **DoD**:
  - `extension/entrypoints/popup/PairingDialog.tsx` — 페어링 상태 표시 (uninitialized / pending / paired / error)
  - 첫 popup open 시 자동으로 `nm-client.connect()` 시도 → uninitialized → `init` 메시지 송신
  - 데스크톱 dialog 승인 결과를 polling 또는 Port event 로 수신 → "Paired ✓" 표시
  - 페어링 정보 저장: `chrome.storage.local` 의 `pairing.{extensionPriv, desktopPub, deviceId, pairedAt}` (extensionPriv 는 확장의 비밀, desktopPub 은 데스크톱의 공개키)
- **Files Touched**: `extension/entrypoints/popup/PairingDialog.tsx`, `extension/lib/storage.ts`, `extension/lib/pairing.ts`
- **Tests**: Vitest (Mock NM Host stub + 페어링 시뮬레이션)
- **Depends on**: B3, B4
- **Risk**: MEDIUM
- **예상 토큰**: 10k

### T-24-E-B6. Tauri 앱 측 페어링 dialog + device-bound key 보관

- **Goal**: 데스크톱 앱이 `pair_request` IPC 수신 시 modal dialog 표시 + 승인 시 X25519 keypair 생성 후 age vault 에 priv 저장.
- **DoD**:
  - 신규 Tauri command: `pairing_request_received(extension_pub: String) -> Result<PairingDecision, Error>`
  - 신규 React 컴포넌트: `src/features/extension-pairing/PairingApprovalDialog.tsx` — 확장 ID + 핑거프린트 + Approve / Reject
  - age vault 에 `device/extension/{ext_id}_priv` 레코드 추가 (X25519 priv)
  - audit log 1건 (`extension.pairing.approved` 또는 `.rejected`)
  - 다중 확장 (Chrome + Firefox 동시 설치) 지원: 각 ext_id 별 키 분리
- **Files Touched**: `src-tauri/crates/secretbank-app/src/commands/pairing.rs`, `src/features/extension-pairing/PairingApprovalDialog.tsx`, `src-tauri/crates/secretbank-storage/src/...` (vault 레코드 경로 추가), `src-tauri/crates/secretbank-audit/...` (action enum 추가)
- **Tests**: Rust unit (vault 레코드 round-trip), Vitest (Dialog 렌더 + Approve 흐름)
- **Depends on**: B4
- **Risk**: MEDIUM
- **예상 토큰**: 12k

### T-24-E-B7. session token (HMAC-SHA256) 발급/검증 + Settings UI

- **Goal**: password reveal 첫 호출 시 Tauri 앱이 WebAuthn → session_token 발급. 4h TTL + 사용자 설정 변경.
- **DoD**:
  - `src-tauri/crates/secretbank-nm-host/src/session.rs` — HMAC-SHA256(secret_key, "session" || ts || nonce || ext_id) 발급 + 검증 + TTL
  - 데스크톱 앱 측 secret_key 는 device-bound (age vault 의 `device/extension/{ext_id}_session_secret`)
  - 사용자 설정: `Settings > Session lifetime` (30분 / 1시간 / 4시간 / 8시간 / 브라우저 종료 시) — Tauri Settings 페이지 + extension Settings 양쪽
  - 변경 시 즉시 적용 (기존 토큰 invalidate)
  - 기본값: 4시간 (Q4 결정)
- **Files Touched**: `src-tauri/crates/secretbank-nm-host/src/session.rs`, `src-tauri/crates/secretbank-app/src/commands/extension_settings.rs`, `src/features/settings/ExtensionSettings.tsx`, `extension/entrypoints/popup/Settings.tsx`
- **Tests**: Rust unit (HMAC verify, TTL expiry), Vitest (Settings UI)
- **Depends on**: B6
- **Risk**: MEDIUM
- **예상 토큰**: 10k

### T-24-E-B8. NM Host audit log 통합

- **Goal**: nm-host 의 모든 페어링/reveal/save 이벤트가 데스크톱 audit log 에 기록.
- **DoD**:
  - 신규 audit action: `extension.pairing.{request,approve,reject,revoke}`, `extension.session.{issue,revoke,expire}`, `extension.reveal.{password,api_key}`, `extension.save.{create,update}`
  - 기존 audit_ctx 통합 (hash chain + Ed25519 signature 유지)
  - `cargo test --package secretbank-audit` 회귀 PASS
- **Files Touched**: `src-tauri/crates/secretbank-audit/src/...` (action enum 확장), `src-tauri/crates/secretbank-nm-host/src/ipc.rs` (audit 호출 추가)
- **Tests**: Rust unit (audit chain 무결성)
- **Depends on**: B6
- **Risk**: LOW
- **예상 토큰**: 6k

### T-24-E-B9. 외부 보안 audit 발주 (페어링 + NM 흐름만)

- **Goal**: Phase B 완료 후 페어링 흐름 단독 외부 audit (Q5 결정).
- **DoD**:
  - audit 업체 선정 (사용자 액션) — 후보: Trail of Bits, Cure53, Radically Open Security
  - audit scope 문서화: `docs/audit/m24e_phase_b_scope.md` — 페어링 + NM 채널 + session token 한정
  - audit 결과 수령 + 발견 사항 별 sub-task 화 (별도 commits)
  - 일정 미확정 시 fallback: Q5 옵션 C (audit 없이 진행) — Phase F 종합 audit 으로 통합
- **Files Touched**: `docs/audit/m24e_phase_b_scope.md`, (audit 결과에 따라) 신규 sub-task 파일
- **Tests**: 자체 (외부)
- **Depends on**: B1~B8
- **Risk**: HIGH (Blocker B4) — 일정 미확정 시 옵션 C 로 fallback
- **예상 토큰**: 0 (외부 작업)

### T-24-E-B10. 3 OS 수동 연결 테스트 (B1 blocker 해소 검증)

- **Goal**: Win / macOS / Linux 모두 NM host 등록 → 확장 connect → ping 메시지 round-trip 성공.
- **DoD**:
  - 테스트 시나리오 문서: `docs/qa/m24e_phase_b_smoke.md` — 9개 cell (3 OS × Chrome/Firefox/Edge — Edge 는 Chromium 동등 가정)
  - 실제 3 OS 환경에서 수동 검증 (사용자 + planner) — Win 11 / macOS 14 / Ubuntu 22.04 LTS 기준
  - 발견된 OS 별 차이는 hotfix sub-task 추가
- **Files Touched**: `docs/qa/m24e_phase_b_smoke.md`
- **Tests**: 수동 (3 OS × 2 brower = 6 cell 최소)
- **Depends on**: B2, B3, B5
- **Risk**: HIGH (Blocker B1)
- **예상 토큰**: 4k (계획 문서 + hotfix 가이드)

**Phase B 검증 게이트** (T-24-E-B1~B10 완료 후):

- `cargo test --workspace --manifest-path src-tauri/Cargo.toml` PASS (회귀 + 신규 nm-host crate)
- `cargo clippy --workspace --manifest-path src-tauri/Cargo.toml -- -D warnings` PASS
- `pnpm vitest run` PASS (회귀 + extension 신규 테스트)
- 3 OS × Chrome + Firefox 수동 ping round-trip PASS (T-24-E-B10)
- 외부 audit 결과 수령 (또는 옵션 C fallback)

---

## Phase C — Form 감지 + autofill (read-only) (예상 10일)

위험도 MEDIUM. SPA / Shadow DOM / iframe 호환성이 핵심.

### T-24-E-C1. extension/lib/form-detector.ts (autocomplete 우선순위 + name/id regex)

- **Goal**: 페이지 내 모든 password / username input 을 우선순위에 따라 감지.
- **DoD**:
  - 우선순위: `current-password` → `new-password` → `type=password` → name/id regex
  - 인접 username 후보 탐색: `autocomplete=username|email` > `type=email` > name regex
  - form 단위 그룹핑 (closest("form") 또는 fieldset)
  - 단위 테스트: 5+ 실제 사이트 fixtures (Google / GitHub / Stripe / 가짜 phishing / multi-step) — DOM stub
- **Files Touched**: `extension/lib/form-detector.ts`, `extension/lib/__tests__/form-detector.test.ts`, `extension/lib/__fixtures__/*.html`
- **Tests**: Vitest + jsdom (or `happy-dom`)
- **Depends on**: A1
- **Risk**: MEDIUM
- **예상 토큰**: 12k

### T-24-E-C2. MutationObserver — SPA 동적 렌더링 대응

- **Goal**: React/Vue/Angular SPA 의 동적 DOM 변경 시 form-detector 재실행.
- **DoD**:
  - body 의 childList + subtree 변경 감지
  - History API hook (`pushState` / `popstate`) → URL 변경 → 재스캔
  - throttle (200ms debounce) 로 과도한 호출 방지
  - 단위 테스트: 동적 input 추가 / pushState 변경 / iframe insert
- **Files Touched**: `extension/lib/form-detector.ts` (확장), `extension/lib/spa-watcher.ts`
- **Tests**: Vitest + happy-dom (mutation 시뮬레이션)
- **Depends on**: C1
- **Risk**: MEDIUM
- **예상 토큰**: 8k

### T-24-E-C3. Shadow DOM 처리 (composedPath() + open shadow root)

- **Goal**: Web Components 내부 input 도 감지 + autofill 가능.
- **DoD**:
  - `attachShadow({ mode: 'open' })` 인 경우 `element.shadowRoot` 재귀 탐색
  - `attachShadow({ mode: 'closed' })` 인 경우 `event.composedPath()` 로 실제 target 파악
  - 단위 테스트: open / closed shadow root 양쪽 fixture
- **Files Touched**: `extension/lib/form-detector.ts` (확장)
- **Tests**: Vitest (custom element + attachShadow stub)
- **Depends on**: C1
- **Risk**: MEDIUM
- **예상 토큰**: 7k

### T-24-E-C4. extension/lib/autofill.ts (issuer 도메인 매칭 + Tiered Protection 호출)

- **Goal**: 사용자가 autofill 트리거 → nm-host 통해 데스크톱에서 credential 가져와 input.value 채움.
- **DoD**:
  - issuer 도메인 매칭: `subdomain-safe` (예: `accounts.google.com` 만 매칭, `g00gle.com` ❌)
  - HTTPS only (HTTP autofill ❌)
  - Tiered Protection 분기: password = session_token 검증 → reveal / 토큰 만료 시 WebAuthn 재요청
  - InputEvent dispatch (`input` + `change`) — React/Vue controlled input 호환
  - 단위 테스트: 도메인 매칭 + 만료 토큰 처리 + InputEvent 발생
- **Files Touched**: `extension/lib/autofill.ts`, `extension/lib/domain-match.ts`
- **Tests**: Vitest
- **Depends on**: B7, C1
- **Risk**: MEDIUM (T4 phishing 방어)
- **예상 토큰**: 10k

### T-24-E-C5. autofill 트리거 옵션 (focus / click / hotkey)

- **Goal**: 사용자가 autofill 시점을 선택 (page load 자동 fill ❌, 보안 우선).
- **DoD**:
  - 옵션 1: input focus 시 in-page small overlay 버튼 표시 → 클릭 시 fill
  - 옵션 2: 사용자 hotkey (Cmd+Shift+L 또는 Ctrl+Shift+L) → 활성 input fill
  - 옵션 3: extension popup 의 "Autofill this site" 버튼
  - Settings UI 에서 옵션 on/off
- **Files Touched**: `extension/lib/autofill-trigger.ts`, `extension/components/InlineOverlay.tsx`, `extension/entrypoints/popup/Settings.tsx`
- **Tests**: Vitest + 수동 검증
- **Depends on**: C4
- **Risk**: LOW
- **예상 토큰**: 8k

### T-24-E-C6. Multi-step login flow (History API 감지)

- **Goal**: Google / Microsoft 같은 "이메일 → 비밀번호" 2단계 로그인에서 비밀번호 단계 도달 시 fill.
- **DoD**:
  - History API hook (C2 와 통합)
  - "이메일 단계" 와 "비밀번호 단계" 식별 휴리스틱: same-domain + `autocomplete="current-password"` 출현 시점
  - 단위 테스트: Google 로그인 fixture
- **Files Touched**: `extension/lib/multi-step-login.ts`
- **Tests**: Vitest (fixture)
- **Depends on**: C2, C4
- **Risk**: MEDIUM
- **예상 토큰**: 6k

### T-24-E-C7. iframe / cross-origin 처리

- **Goal**: same-origin iframe 안의 form 도 감지. cross-origin 은 skip (보안).
- **DoD**:
  - same-origin iframe 재귀 처리
  - cross-origin iframe 은 skip + 로깅 (개발 모드만)
- **Files Touched**: `extension/lib/form-detector.ts` (확장)
- **Tests**: Vitest (iframe fixture)
- **Depends on**: C1
- **Risk**: LOW
- **예상 토큰**: 5k

### T-24-E-C8. content script Closed Shadow DOM 격리 + Clickjacking 방어 (D15)

- **Goal**: 확장이 인페이지에 그리는 모든 UI 는 Closed Shadow Root + MutationObserver 보호.
- **DoD**:
  - 확장 UI 컨테이너 = `attachShadow({ mode: 'closed' })` (외부 JS 의 shadow root 접근 ❌)
  - MutationObserver 가 컨테이너 위 transparent overlay 감지 → 위치 재배치 또는 사용자 경고
  - composedPath() 로 실제 click target 검증
  - 단위 테스트: clickjack 시뮬레이션 (transparent overlay 삽입 → 방어 동작)
- **Files Touched**: `extension/lib/clickjack-defense.ts`, `extension/lib/shadow-container.ts`
- **Tests**: Vitest (시뮬레이션)
- **Depends on**: C5
- **Risk**: MEDIUM (Blocker B5 — 신규 기법 잔여 위험)
- **예상 토큰**: 8k

**Phase C 검증 게이트**:

- 5개 실제 사이트 (Google / GitHub / Stripe / Discord / Cloudflare) 수동 autofill PASS
- multi-step (Google 이메일 → 비밀번호) PASS
- Shadow DOM 사이트 (예: Salesforce / Reddit 일부) PASS
- Vitest + 회귀 PASS

---

## Phase D — Save dialog + credential 저장 (예상 7일)

### T-24-E-D1. form submit listener + XHR/fetch hook (MAIN world)

- **Goal**: 사용자가 가입/로그인 폼 제출 시 감지 + 비밀번호 + username 캡처.
- **DoD**:
  - `extension/entrypoints/content-main.ts` (MAIN world) — XMLHttpRequest.prototype.send + fetch hook
  - form `submit` event listener (ISOLATED world)
  - 캡처: form 전체 input (password / username / email) + URL + timestamp
  - **credential plaintext 는 MAIN ↔ ISOLATED 메시지로 전달 ❌** (도메인 + 이벤트 타입만, 실제 값은 form 의 input element 에서 ISOLATED 가 직접 읽기)
- **Files Touched**: `extension/entrypoints/content-main.ts`, `extension/entrypoints/content.ts`
- **Tests**: Vitest (XHR/fetch hook + form submit fixture)
- **Depends on**: C1
- **Risk**: MEDIUM (T2 — postMessage 도청 위험)
- **예상 토큰**: 8k

### T-24-E-D2. content ↔ ISOLATED world postMessage (origin 검증)

- **Goal**: MAIN → ISOLATED 메시지 전달 시 origin 검증 강제.
- **DoD**:
  - `window.postMessage(payload, window.location.origin)` (절대 `'*'` 금지)
  - 수신 측: `event.origin === window.location.origin` 검증
  - payload 는 metadata only (도메인, 이벤트 타입, timestamp), credential plaintext ❌
  - 단위 테스트: origin mismatch 거부
- **Files Touched**: `extension/lib/world-bridge.ts`
- **Tests**: Vitest
- **Depends on**: D1
- **Risk**: MEDIUM
- **예상 토큰**: 6k

### T-24-E-D3. extension/components/SaveBanner (Shadow DOM in-page sticky)

- **Goal**: form submit 감지 후 "Save to Secretbank?" 인페이지 sticky banner 표시.
- **DoD**:
  - Closed Shadow DOM 격리 (D15 + C8)
  - 1Password 스타일 UX: "Save" / "Update" / "Never for this site" / "Not now"
  - 5초 후 자동 dismiss (사용자 무동작 시)
  - Tailwind v4 + postcss-rem-to-px (host 페이지 rem 충돌 방지)
  - 단위 테스트: 렌더 + 4 액션 click 핸들러
- **Files Touched**: `extension/components/SaveBanner.tsx`, `extension/styles/content.css`
- **Tests**: Vitest
- **Depends on**: C8, D1
- **Risk**: LOW
- **예상 토큰**: 8k

### T-24-E-D4. extension/lib/save-handler.ts (신규 / rotation 분기)

- **Goal**: `autocomplete="new-password"` + 도메인 신규 → "새 로그인 저장" / + 기존 credential 존재 → "비밀번호 업데이트?".
- **DoD**:
  - nm-host 통해 데스크톱에 "이 도메인의 기존 credential" 조회
  - 신규 / rotation 분기 로직 + SaveBanner 텍스트 변경
  - 사용자 "Save" 클릭 시 nm-host → 데스크톱 `credential_create` 또는 `credential_update` 호출
  - audit log 1건 (`extension.save.create` 또는 `.update`)
- **Files Touched**: `extension/lib/save-handler.ts`, `extension/components/SaveBanner.tsx` (확장)
- **Tests**: Vitest
- **Depends on**: D3
- **Risk**: MEDIUM
- **예상 토큰**: 10k

### T-24-E-D5. Tauri 앱 측 credential 저장 (기존 commands 재사용 + 확장 audit_ctx)

- **Goal**: nm-host → desktop IPC 가 기존 `credential_create` / `credential_update` 호출. 확장 호출임을 audit_ctx 에 명시.
- **DoD**:
  - 기존 commands 변경 없이 `audit_ctx.actor = "extension:{ext_id}"` 로 분기
  - 확장 측 새 credential 저장 시 자동으로 issuer = 도메인 호스트 (또는 issuer recipe 매칭) 결정
  - issuer recipe 가 없으면 fallback: 도메인 첫 부분으로 placeholder issuer 생성 (사용자 사후 보정 가능)
- **Files Touched**: `src-tauri/crates/secretbank-app/src/commands/credential.rs` (audit_ctx 변경만), `src-tauri/crates/secretbank-nm-host/src/ipc.rs` (호출 라우팅)
- **Tests**: Rust unit (audit_ctx actor 검증)
- **Depends on**: D4
- **Risk**: LOW (기존 commands 재사용)
- **예상 토큰**: 6k

### T-24-E-D6. extension/popup SaveDialog (보조 UI)

- **Goal**: SaveBanner 의 "Save" 클릭 시 popup 열려 세부 정보 (issuer, name, notes) 편집 가능.
- **DoD**:
  - popup `SaveDialog.tsx` 신설
  - issuer 자동 매칭 결과 표시 + 사용자 변경 가능
  - 저장 후 popup 닫힘
- **Files Touched**: `extension/entrypoints/popup/SaveDialog.tsx`
- **Tests**: Vitest
- **Depends on**: D4
- **Risk**: LOW
- **예상 토큰**: 6k

**Phase D 검증 게이트**:

- 실제 사이트 가입 → SaveBanner 표시 → "Save" → 데스크톱 vault 에 credential 생성 확인
- 동일 사이트 비밀번호 변경 → "Update" 분기 동작
- 회귀: cargo test / pnpm vitest PASS

---

## Phase E — Generator inline + recipe + Site Logo (예상 7일)

### T-24-E-E1. extension 신규 가입 폼 인라인 generator

- **Goal**: `autocomplete="new-password"` 필드 옆 generator 아이콘 → 클릭 시 inline panel 에서 password 생성 + 채우기.
- **DoD**:
  - `packages/shared/password-generator` 호출 (A3 산출물)
  - Closed Shadow DOM 격리
  - 옵션: Diceware (lang 선택) / 무작위 (recipe 적용)
  - 생성된 password = input 에 InputEvent dispatch
- **Files Touched**: `extension/components/GeneratorIcon.tsx`, `extension/components/GeneratorPanel.tsx`
- **Tests**: Vitest
- **Depends on**: A3, C5
- **Risk**: LOW
- **예상 토큰**: 10k

### T-24-E-E2. issuer recipe inheritance (preset → 휴리스틱 → 사용자 보정 → 등록)

- **Goal**: 사이트별 password 정책 자동 추출 + 사용자 등록.
- **DoD**:
  - preset (17 issuer) 우선 사용
  - 없으면 input 의 `pattern` / `minlength` / `maxlength` 속성 휴리스틱
  - 생성 후 사용자가 보정한 값을 추후 같은 도메인에 자동 적용 (recipe 등록)
  - 데스크톱 IssuerRepo 에 저장 (`issuers.recipe_json` 컬럼 활용 또는 신규)
- **Files Touched**: `extension/lib/recipe-inherit.ts`, `src-tauri/crates/secretbank-storage/src/...` (issuer recipe 컬럼)
- **Tests**: Vitest + Rust unit
- **Depends on**: E1
- **Risk**: MEDIUM
- **예상 토큰**: 10k

### T-24-E-E3. Site Logo (favicon-proxy + IndexedDB 캐시 + fallback)

- **Goal**: extension 의 모든 credential 카드 + SaveBanner 에 Site Logo 표시.
- **DoD**:
  - `extension/lib/site-logo.ts` — fallback chain (bundled SVG → favicon-proxy → 첫 글자)
  - IndexedDB 캐시 (24h TTL, 키 = `favicon:v1:<sha256(host)>`)
  - chrome.storage.local 보조 캐시
  - timeout 3s + 4xx/5xx fallback
  - Privacy: Worker 호출 시 user_id / session_token 미포함
- **Files Touched**: `extension/lib/site-logo.ts`, `extension/lib/idb-cache.ts`, `extension/public/icons/issuers/*.svg` (17 preset)
- **Tests**: Vitest (cache hit/miss + timeout + fallback)
- **Depends on**: A1
- **Risk**: LOW
- **예상 토큰**: 8k

### T-24-E-E4. extension/popup credential 카드 (Site Logo + name + autofill 버튼)

- **Goal**: popup 의 CredentialList 가 카드 형태로 site logo + name + 도메인 + autofill 버튼 표시.
- **DoD**:
  - 데스크톱 앱과 디자인 일관성 (shadcn/ui Card)
  - 검색 필터 (인증된 도메인 우선)
  - autofill 버튼 클릭 → 활성 탭 content script 에 메시지 → C5 트리거
- **Files Touched**: `extension/entrypoints/popup/CredentialList.tsx`, `extension/components/CredentialCard.tsx`
- **Tests**: Vitest
- **Depends on**: E3, C4
- **Risk**: LOW
- **예상 토큰**: 8k

### T-24-E-E5. 디자인 시스템 토큰 desktop 동기화

- **Goal**: extension 의 Tailwind v4 토큰을 desktop `src/styles/globals.css` 와 동일하게 유지.
- **DoD**:
  - extension `src/styles/globals.css` 또는 `tailwind.config.ts` 에서 desktop 토큰 (oklch + radius + font) 모두 import 또는 mirror
  - dark/light + reduced-motion 모두 desktop 과 동일 동작
- **Files Touched**: `extension/styles/globals.css`, `extension/tailwind.config.ts`
- **Tests**: 수동 시각 비교 (스크린샷)
- **Depends on**: A1, E4
- **Risk**: LOW
- **예상 토큰**: 5k

**Phase E 검증 게이트**:

- 신규 가입 폼에서 generator inline 동작 (en/ko/ja/zh)
- 17 preset issuer + 휴리스틱 site recipe 동작
- popup 카드 시각 검증 (desktop 과 일관)
- 회귀 PASS

---

## Phase F — 출시 준비 (예상 14일)

### T-24-E-F1. Chrome Web Store 제출 패키지

- **Goal**: Chrome Web Store 심사 통과 + 릴리즈.
- **DoD**:
  - Privacy Policy: `secretbank.app/privacy.html` 확장 (nativeMessaging 데이터 처리 명시) — `docs/PRIVACY.md` 갱신 (B3)
  - 아이콘: 16/32/48/128 PNG (`extension/public/icons/`)
  - 스크린샷 5+ (popup, save banner, generator inline, autofill, site logo)
  - 권한 정당화 텍스트 (nativeMessaging, optional_host_permissions, activeTab)
  - 심사 제출 + 결과 (예상 1~3 영업일)
- **Files Touched**: `docs/PRIVACY.md` (확장), `extension/public/icons/*`, `docs/release/m24e_chrome_submission.md`
- **Tests**: 자체 (심사 통과)
- **Depends on**: E1~E5
- **Risk**: MEDIUM (Blocker B3) — 심사 거부 시 수정 + 재제출
- **예상 토큰**: 4k

### T-24-E-F2. Firefox AMO 제출 패키지

- **Goal**: Firefox Add-ons 심사 통과 + 릴리즈.
- **DoD**:
  - 소스코드 제출 (AMO 정책) — AGPL-3.0 공개 → 유리
  - Privacy Policy URL 동일 (F-1)
  - 심사 제출 + 결과 (예상 1~7일, 사람 심사 가능)
- **Files Touched**: `docs/release/m24e_firefox_submission.md`
- **Tests**: 자체
- **Depends on**: F-1
- **Risk**: MEDIUM
- **예상 토큰**: 3k

### T-24-E-F3. Playwright E2E (Chromium)

- **Goal**: autofill / save / generator 시나리오 E2E (Chrome).
- **DoD**:
  - `extension/tests/e2e/autofill.spec.ts` — 가짜 사이트 (httpserver fixture) → autofill 검증
  - `extension/tests/e2e/save.spec.ts` — form submit → SaveBanner → 저장
  - `extension/tests/e2e/generator.spec.ts` — generator inline → 강도 미터
  - Mock NM Host (F-5) 사용
  - GitHub Actions 통합
- **Files Touched**: `extension/tests/e2e/*.spec.ts`, `playwright.config.ts`, `.github/workflows/extension-e2e.yml`
- **Tests**: 자체 (Playwright)
- **Depends on**: D6, E4, F-5
- **Risk**: MEDIUM
- **예상 토큰**: 10k

### T-24-E-F4. web-ext E2E (Firefox)

- **Goal**: Firefox 에서 동일 시나리오 검증 (Playwright 미지원 → Mozilla web-ext 사용).
- **DoD**:
  - `extension/tests/web-ext/*.test.js`
  - GitHub Actions 통합
- **Files Touched**: `extension/tests/web-ext/`, `.github/workflows/extension-e2e.yml` (확장)
- **Tests**: 자체 (web-ext)
- **Depends on**: F-3
- **Risk**: MEDIUM
- **예상 토큰**: 6k

### T-24-E-F5. Mock Native Messaging Host (Node.js stub)

- **Goal**: Tauri 앱 없이 단독 E2E 가능. stdin/stdout 4-byte header + JSON 처리하는 Node.js stub.
- **DoD**:
  - `extension/tests/mock-nm-host/index.js` — stdin 읽고 JSON 파싱 + 응답 송신
  - 페어링 / reveal / save 모든 메시지 타입 stub 구현
  - registry/plist 등록 fixture (CI 한정 임시 디렉토리)
- **Files Touched**: `extension/tests/mock-nm-host/index.js`, `extension/tests/mock-nm-host/install.sh`
- **Tests**: 자체
- **Depends on**: B1
- **Risk**: LOW
- **예상 토큰**: 6k

### T-24-E-F6. Safari Xcode wrapper (macOS runner) — Phase F-2

- **Goal**: Safari Web Extension 빌드 + Mac App Store 제출.
- **DoD**:
  - WXT safari target + xcrun + Xcode 16+ (커뮤니티 패키지 `wxt-module-safari-xcode` 재확인 — Phase F-2 진입 전 maintenance 상태 확인 필수)
  - Apple Developer Program 가입 ($99/년)
  - macos-latest runner CI 추가 (비용 ↑)
  - 심사 제출 (예상 수 주)
- **Files Touched**: `extension/wxt.config.ts` (safari target), `.github/workflows/extension-safari.yml`, `docs/release/m24e_safari_submission.md`
- **Tests**: 자체
- **Depends on**: F-1, F-2
- **Risk**: HIGH (Blocker B2)
- **예상 토큰**: 6k

### T-24-E-F7. Edge Add-ons 제출 — Phase F-2

- **Goal**: Microsoft Edge Add-ons 제출 (Chromium 빌드 재사용).
- **DoD**:
  - 빌드는 Chrome 빌드와 동일 (`dist/chromium/` 재사용)
  - 심사 제출 (예상 수일)
- **Files Touched**: `docs/release/m24e_edge_submission.md`
- **Tests**: 자체
- **Depends on**: F-1
- **Risk**: LOW
- **예상 토큰**: 2k

### T-24-E-F8. 외부 보안 audit 결과 반영 (B4 blocker 해소)

- **Goal**: B9 (Phase B audit) + 출시 직전 종합 audit 의 발견 사항을 모두 sub-task 화 + 패치.
- **DoD**:
  - audit 결과 별 별도 commits
  - HIGH severity 는 출시 전 모두 해소
  - MEDIUM 이하는 별도 마일스톤 후속 가능
  - 결과 요약: `docs/audit/m24e_final_report.md`
- **Files Touched**: (audit 결과에 따름)
- **Tests**: audit 별 검증
- **Depends on**: B9, F-1~F-7
- **Risk**: MEDIUM (audit 발견에 따라 변동)
- **예상 토큰**: 0~30k (가변)

**Phase F 검증 게이트** (출시 직전):

- Chrome Web Store + Firefox AMO 심사 통과
- Playwright + web-ext E2E PASS
- 외부 audit 결과 HIGH 모두 해소
- 회귀 검증 PASS (cargo test / pnpm vitest / typecheck / lint)
- `docs/work-log.md` + `docs/progress.md` + `docs/task.md` (M24-E Status `✅ 49/49 완료`) 갱신

---

## 진행 현황 — M24-E (orchestrator 가 commit 직후 즉시 갱신)

| Sub-task ID | 제목                                             | 완료일 | 커밋 해시 |
| :---------- | :----------------------------------------------- | :----- | :-------- |
| T-24-E-A1   | WXT 골격 + Tailwind v4 + shadcn/ui               | 2026-05-09 | `bd126bb` |
| T-24-E-A2   | packages/shared types                            | 2026-05-09 | `7d3191d` |
| T-24-E-A3   | password-generator (Diceware 4 lang + zxcvbn-ts) | 2026-05-09 | `f8a8a6f` |
| T-24-E-A4   | shared validation                                | 2026-05-09 | `a983000` |
| T-24-E-A5   | i18n (4 lang YAML + @wxt-dev/i18n + I18N_KEYS)  | 2026-05-09 | `d093ffe` |
| T-24-E-A6   | popup 골격 (ThemeProvider + Tab 라우팅 + placeholder 4종) | 2026-05-09 | `edcc2e3` |
| T-24-E-A7   | CI 빌드 매트릭스                                 | 2026-05-09 | `dcd686b` |
| T-24-E-B1   | nm-host crate (stdio 이벤트 루프 + 프로토콜)     | 2026-05-09 | `3198bf1` |
| T-24-E-B2   | NM installer (3 OS)                              | 2026-05-09 | `7145f2d` |
| T-24-E-B3   | nm-client.ts                                     | 2026-05-09 | `465c82c` |
| T-24-E-B4   | 페어링 protocol                                  | 2026-05-09 | `8b5275f` |
| T-24-E-B5   | 확장 PairingDialog                               | 2026-05-09 | `6ad32f7` |
| T-24-E-B6   | 데스크톱 PairingApprovalDialog                   | 2026-05-09 | `21ecccb` |
| T-24-E-B7   | session token + Settings                         | 2026-05-09 | `ba92e60` |
| T-24-E-B8   | NM Host audit                                    | 2026-05-09 | `fc1809d` |
| T-24-E-B9   | 외부 audit (Phase B)                             | -      | -         |
| T-24-E-B10  | 3 OS 수동 검증                                   | -      | -         |
| T-24-E-C1   | form-detector                                    | -      | -         |
| T-24-E-C2   | MutationObserver                                 | -      | -         |
| T-24-E-C3   | Shadow DOM 처리                                  | -      | -         |
| T-24-E-C4   | autofill                                         | -      | -         |
| T-24-E-C5   | autofill 트리거 옵션                             | -      | -         |
| T-24-E-C6   | multi-step login                                 | -      | -         |
| T-24-E-C7   | iframe / cross-origin                            | -      | -         |
| T-24-E-C8   | Clickjack 방어                                   | -      | -         |
| T-24-E-D1   | form submit + XHR/fetch hook                     | -      | -         |
| T-24-E-D2   | postMessage origin 검증                          | -      | -         |
| T-24-E-D3   | SaveBanner                                       | -      | -         |
| T-24-E-D4   | save-handler 신규/rotation                       | -      | -         |
| T-24-E-D5   | 데스크톱 credential 저장                         | -      | -         |
| T-24-E-D6   | popup SaveDialog                                 | -      | -         |
| T-24-E-E1   | generator inline                                 | -      | -         |
| T-24-E-E2   | issuer recipe inheritance                        | -      | -         |
| T-24-E-E3   | Site Logo                                        | -      | -         |
| T-24-E-E4   | popup credential 카드                            | -      | -         |
| T-24-E-E5   | 디자인 토큰 동기화                               | -      | -         |
| T-24-E-F1   | Chrome Web Store 제출                            | -      | -         |
| T-24-E-F2   | Firefox AMO 제출                                 | -      | -         |
| T-24-E-F3   | Playwright E2E                                   | -      | -         |
| T-24-E-F4   | web-ext E2E                                      | -      | -         |
| T-24-E-F5   | Mock NM Host                                     | -      | -         |
| T-24-E-F6   | Safari Xcode wrapper                             | -      | -         |
| T-24-E-F7   | Edge Add-ons                                     | -      | -         |
| T-24-E-F8   | 외부 audit 결과 반영                             | -      | -         |

**총 sub-task: 43** (Phase A 7 + B 10 + C 8 + D 6 + E 5 + F 8 — F 의 sub-task 8 중 일부는 외부 작업 의존이라 commit 단위 카운팅에 따라 가변. 마일스톤 표 표기는 `🔄 12/43 완료`).

> 정정: 위 표는 43 sub-task. project-decisions [2026-05-09] 에 표기된 "약 50 sub-task" 추정 대비 7 차이. 이는 Phase F 의 외부 audit / 스토어 제출이 단일 sub-task 단위로 합쳐졌기 때문 (commit 단위로는 audit 발견 사항 별로 추가 sub-task 가 생성될 수 있음 — F8 의 가변성).

---

## sub-task 의존성 그래프

```
A1 ──┬─► A2 ──┬─► A3
     │        ├─► A4
     │        └─► A5 ──► A6 ──► A7
     │
     └─► B1 ──┬─► B2 ──► B10
              ├─► B3 ──┬─► B4 ──┬─► B5 ──► B7 ──► B8
              │        │         └─► B6 ──┘
              │        └─► B9 (Phase B 완료 후 외부 작업)
              │
              └─► C1 ──┬─► C2 ──► C6
                       ├─► C3
                       ├─► C4 ──► C5 ──► C8
                       └─► C7

C8 + B7 ──► D1 ──► D2 ──► D3 ──► D4 ──┬─► D5
                                       └─► D6

A3 + C5 ──► E1 ──► E2
A1 ──► E3 ──► E4 + E5

D6 + E4 + B1 ──► F5 ──► F3 ──► F4 ──► F1 ──► F2 ──► F7
                                              └─► F6 (Phase F-2)
B9 + F1~F7 ──► F8
```

**병렬 실행 가능 구간**:

- A3 / A4 / A5 (A2 후 동시)
- B 와 C 동시 진행 가능 (B1 + C1 후): C 는 B7 (session token) 까지 갖추면 C4 autofill 통합 가능
- E1 / E3 / E4 동시 (A3 + A1 후)
- F1 / F2 / F7 (Chrome / Firefox / Edge) 동시 가능 — F6 (Safari) 만 macOS runner 필요로 Phase F-2 분리

---

_M24-E task 문서 끝._
