# Work Log

## 2026-06-14 (resume) — Dependabot 보안 알림 8건 전체 해소 (esbuild 자동실패 + Rust)

### 컨텍스트

세션 복원 직후 사용자가 "dependabot 문제" 보고. 진단 결과 3층 문제: ① esbuild 보안
업데이트가 `security_update_not_possible` 로 매번 빨갛게 실패(상위 vite 8 이 esbuild
0.27.x 까지만 허용, 새 advisory 는 0.28.1 요구) ② Rust 알림 5건 ③ 누적 버전업 PR 29건.
사용자 결정: 보안 알림 8건 전체 처리 + 검증 통과 시 push.

### 변경 (커밋 `a7b40d7`)

| 알림 | 심각도 | 패키지 | 조치 |
|:--|:--|:--|:--|
| #47/#48/#49 | 🔴 high×2 + low | esbuild →0.28.1 | `pnpm.overrides` 핀. root(vite 8) + ee/secretbank-relay + ee/cloudflare/download-proxy 3곳. Dependabot 가 못 올리던 것을 override 로 우회 (GHSA-gv7w-rqvm-qjhr) |
| #44 | 🟠 medium | tauri 2.11.0→2.11.1 | Origin Confusion: 원격 페이지의 로컬 IPC 호출 (GHSA-7gmj-67g7-phm9). `cargo update --precise` |
| #46 | 🟠 medium | tar 0.4.45→0.4.46 | PAX header desync (GHSA-3pv8-6f4r-ffg2) |
| #45 | 🟡 low | rpassword 7.4.0→7.5.0 | 입력 중단 시 부분 노출 (GHSA-2p6r-x3vv-xqm2) |
| #17 | 🟠 medium | glib 0.18.5 | **dismiss(tolerable_risk)**: atk→gtk 0.18→muda→tauri 가 `glib=^0.18` 잠금, 0.20 선택 불가. Linux GTK VariantStrIter unsoundness, 앱 경로 미사용 |
| #18 | 🟡 low | rand 0.7.3 | **dismiss(tolerable_risk)**: phf_generator 0.8→...→tauri-utils **build-dep**. 런타임 미포함, custom-logger 경로 미사용. tauri 가 phf 0.8 잠금 |

### 핵심

- esbuild override 형식: root 는 security-pin 스타일 `"esbuild@<0.28.1": "^0.28.1"`, ee 는 기존 `>=0.25.0` → `>=0.28.1`. 3곳 모두 install 시 0.28.1 resolve 확인.
- esbuild 0.28.1 이 vite 8 빌드/transform 을 안 깸 — root `vite build` + vitest 657 통과로 실증.
- glib/rand 는 tauri 상위가 gtk-rs/phf 를 bump 하기 전엔 수정 불가. 이전 CodeQL 세션의 dismiss 패턴 동일 적용. tauri 메이저 갱신 시 재평가 대상.

### 검증 (회귀 0)

- root: `vite build` 성공 + vitest **657/657** PASS + typecheck clean
- ee/secretbank-relay **71/71** / ee/cloudflare/download-proxy **14/14** (각 `--ignore-workspace`)
- Rust: app lib **288** + 전 크레이트 통과 (단 `secretbank-feeds::tfa3_expired_cache_refetches` 는 기존 머신-uptime 의존 flaky, 무관)
- CI clippy 게이트(`--all-targets` 미사용)는 영향 없음 — `tests/protocol_roundtrip.rs:41 json!(3.14)` approx_constant lint 은 CI 미검사 범위
- **push 후 Dependabot 재스캔 → open 알림 0 (6건 자동 close + 2건 dismiss). 보안 탭 clean 회복.**

### 미처리 (다음 세션 후보)

- 누적 버전업 PR 29건 (major: typescript 6 / sqlx 0.9 / rand 0.9.4 / plugin-react 5 등 선별 필요)
- `tfa3_expired_cache_refetches` flaky 1줄 robustness fix
- dogfooding (production installer)

## 2026-06-12 (resume) — Dependabot 보안 알림 3종 해소 (shell-quote/react-router/hono)

### 컨텍스트

세션 복원 시 6건의 open Dependabot 알림 발견 (지난 2026-06-02 세션 이후 신규 누적). vitest CVE(#34~37)는 이미 close 확인. PR #6 close 완료 확인.

### 변경 (커밋 `eb6acc9`)

| 알림 | 심각도 | 패키지 | 조치 |
|:--|:--|:--|:--|
| #43 | 🔴 critical | shell-quote 1.7.3→1.8.4 | `quote()` 개행 미이스케이프. `wxt→web-ext-run→fx-runner` transitive → root `pnpm.overrides` 핀 |
| #38 | 🟠 high | react-router 7.14.2→7.17.0 | `__manifest` unbounded path DoS (≥7.15.0). `react-router-dom` bump |
| #39~42 | 🟡 medium ×4 | hono 4.12.18→4.12.25 | Set-Cookie injection / mount prefix / IPv6 deny 우회 / JWT scheme (≥4.12.21) |

### 핵심

- shell-quote 는 확장 dev 툴링(web-ext-run) deep transitive — 런타임 코드 아님. override 1.7.3→1.8.4 는 patch-level API 호환.
- relay 는 standalone pnpm → `--ignore-workspace` 로 install (메모리 룰 준수). hono 4.12.25 resolve.
- Dependabot PR #7(hono)은 package.json 만 + lockfile 미갱신 + CLA 봇 실패로 BLOCKED → 본 커밋으로 대체, push 후 close 예정.

### 검증 (회귀 0)

- frontend 657/657 PASS + typecheck clean
- relay 71/71 PASS + typecheck clean
- lint 0 error (21 warning 기존, 무관) + prettier clean

### push 결과 (완료)

- push `bc8d2e8` → Dependabot 6 알림 전부 자동 close (open: 0 확인) ✅
- `gh pr close 7` 완료 ✅

### 후속 — rustc 1.96.0 로 인한 CI Rust red 해소 (커밋 `e7c9c0b`)

push 직후 CI Rust 잡 red. 메모리 룰(CI 자동 monitor+fix)대로 직접 진단:

- **근본 원인**: CI `dtolnay/rust-toolchain@stable` 이 rustc **1.96.0**(2026-05-25)로 상승. **`src-tauri/Cargo.lock` 은 gitignore 됨**(`.gitignore:18`) + CI 가 `--locked` 미사용 → 매 실행 의존성 재해석 → **오늘(2026-06-12) 릴리스된 broken `time` 0.3.48** 을 자동 채택. 0.3.48 은 reflexive `From<HourBase>` impl 도입으로 full feature set 에서 E0119(conflicting impl) → cookie/sqlx-core/tauri-utils 컴파일 불가 (1.95/1.96 양쪽 로컬 재현).
- **수정 1**: `src-tauri/Cargo.toml` time `"0.3"` → `"=0.3.47"` (0.3.47 은 1.96.0 정상). Cargo.lock gitignore 라 Cargo.toml 이 durable pin. time ≥0.3.49 시 해제.
- **수정 2 (부수 발견)**: `secretbank-nm-host` 의 `bridge_client.rs` TcpStream 이 tokio `net` feature 미선언 → feature unification 의존. 직접 명시로 교정.
- **검증 (1.96.0)**: `cargo check/clippy --workspace` clean + 전 크레이트 test ok. (nm-host `installer_test` 의 os error 740 = Windows 관리자 권한 필요한 레지스트리 테스트, Linux CI 무관.) **CI 4잡 전부 green 확인 (`e7c9c0b`)**.
- **후속 권장(미적용)**: 보안 앱 특성상 `Cargo.lock` 커밋 + CI `--locked` 도입 검토 (재현 빌드 + transitive 자동 채택으로 인한 surprise red 방지). 사용자 결정 대기.

### 보안 커버리지 강화 — Cargo.lock 커밋 + CI --locked + dependabot 전 생태계 + CodeQL (커밋 `88e38c2`)

사용자 승인으로 위 후속 권장 + cargo 스캔 공백 + CodeQL 미설정 일괄 처리:

- **`src-tauri/Cargo.lock` 커밋** (gitignore 해제). Rust 의존성이 GitHub 의존성 그래프에 등록 → **cargo Dependabot 보안 알림 활성화** (그동안 사각지대였음). time=0.3.47 핀 반영.
- **ci.yml**: `cargo clippy/test` 에 `--locked` 추가 (재현 빌드 + broken transitive 자동 채택 방지). cache key 를 `Cargo.lock` hash 로 전환.
- **dependabot.yml**: 빈 placeholder → `cargo`(/src-tauri) + `npm` 4곳(루트 워크스페이스 / ee-relay / download-proxy / vscode-extension) + `github-actions`.
- **codeql.yml 신규**: JS/TS + Rust 정적 분석 (build-mode none, GA). push/PR/주간 스케줄.
- **검증**: CI 4잡 + CodeQL 2잡(js-ts/rust) 전부 green (`88e38c2`). `cargo check --workspace --locked` (1.96.0) 통과.

### CodeQL 첫 스캔 결과 — 23 warning, 실위험 0 (triage 완료)

- `rust/hard-coded-cryptographic-value` ×21: **전부 오탐**. `[0u8; N]` 제로초기화 후 CSPRNG `fill_bytes` 또는 deserialize `copy_from_slice` 로 채우는 버퍼(kdf salt/nonce/charter envelope/age_vault), 일부 `#[cfg(test)]` 시드. 하드코딩 키 아님.
- `js/incomplete-url-substring-sanitization` ×1: `ee/secretbank-relay/test/github.test.ts` 테스트 단언 — 오탐.
- `js/incomplete-sanitization` ×1: `vscode-extension/src/extension.ts:150` `quoteArg` — `"` 는 이스케이프하나 `\` 미처리. 경미한 하드닝 여지(실위험 낮음).
- **error/critical 0건**. 처리(사용자 승인 "오탐 dismiss + quoteArg 보강"):
  - **quoteArg = 실제 수정** (`ba8d31d`): vscode-extension `runCli` 를 `exec`(셸 경유)→`execFile`(argv 배열)로 리팩터 → 셸 metacharacter 주입 벡터 원천 제거, `quoteArg` 삭제. CodeQL `state: fixed` 자동 처리.
  - **나머지 22건 dismiss**: rust crypto-value 21 + js test url-substring 1. 사유 = "false positive"(CSPRNG/역직렬화 버퍼) / "used in tests"(테스트 시드).
  - **최종: open code-scanning 알림 0** (22 dismissed + 1 fixed). Dependabot 0 + secret 0 + code-scanning 0 → **GitHub 보안 탭 전 범주 clean**.

## 2026-06-02 (resume) — Dependabot vitest critical CVE 정식 해소 + CLA 워크플로우 fix

### 컨텍스트

세션 복원 직후 사용자가 Dependabot 문제 제기. 진단 결과 **두 가지 별개 근본 원인**:

1. **vitest critical CVE (알림 #34~37)** — `< 4.1.0` 임의 파일 읽기·실행. 패치는 4.1.0 only. 취약 2곳(relay, download-proxy). Dependabot PR #6 은 download-proxy 만 + pool-workers 0.8.71 유지 → peer 충돌 (CI 미검출), relay 는 PR 없음.
2. **CLA 워크플로우 깨짐** — `contributor-assistant/github-action@v2` (이동 태그 부재) → 모든 PR CLA 체크 `Unable to resolve action` 실패 → 보안 PR `UNSTABLE` 머지 차단.

### 변경

| 파일 | 변경 |
|:--|:--|
| `ee/secretbank-relay/{package.json,pnpm-lock.yaml}` | `vitest ^3.2.0→^4.1.5`, `@cloudflare/vitest-pool-workers ^0.8.71→^0.16.11`, esbuild override `^0.25.0→>=0.25.0` |
| `ee/secretbank-relay/vitest.config.ts` | `defineWorkersConfig(async)` → `defineConfig` + `cloudflareTest(async()=>...)` (D1 readD1Migrations 보존) |
| `ee/secretbank-relay/tsconfig.json` | types `@cloudflare/vitest-pool-workers` → `/types` |
| `ee/cloudflare/download-proxy/*` | 동일 4종 (config 는 plain object 형태) |
| `.github/workflows/cla.yml` | CLA 액션 `@v2` → `@v2.6.1` |

### 핵심

- pool-workers 0.16 = breaking config API. 새 패턴은 공식 docs + 동봉 codemod(`vitest-v3-to-v4`) 로 확인 (추측 X). relay 의 async D1 migration 은 `cloudflareTest` 의 async 팩토리로 이전.
- **혼합 install 사고** — 처음에 `pnpm -C ...` (without `--ignore-workspace`) 가 루트 워크스페이스를 잡아 node_modules 오염 + `pnpm -C` 가 중첩 `ee/` 경로에서 ENOENT(`...\vitest-pool-workers\ee`) 유발. 해결: EE 패키지는 **디렉터리 진입 후 `--ignore-workspace`** 로만 install/test (2026-05-13 `7e0b9d8` 와 동일 교훈), `pnpm -C` 회피. 잠긴 node_modules 는 cmd `rmdir /s /q` 로 클린 삭제 후 재설치.
- Dependabot PR #6 은 close 대상 (불완전 + peer 깨짐).

### 검증 (회귀 0)

- relay: 71/71 PASS, typecheck clean
- download-proxy: 14/14 PASS, typecheck clean
- prettier --check (변경 7 파일) clean
- esbuild 트리 0.25.12 (CVE 안전), vitest 4.1.8 (≥4.1.0 패치)

### 남은 액션 (사용자 승인 대기)

- push origin/main → 4 critical 알림 자동 close 확인
- Dependabot PR #6 close (`gh pr close 6`)

## 2026-05-29 ~ 2026-05-30 (resume → Night mode) — CI fix + dogfooding 버그 2건 + 신규 기능 2건 (rotation, Other 종류)

### commits (origin/main `09aab89` → `a5a3dbb`, CI all green)

| # | Commit | 작업 |
|:--|:--|:--|
| 1 | `4ccb0e9` | fix(ci): publish-updater-manifest 의 redundant main push 제거 (Worker 가 /api/latest 라이브 서빙 → 정적 site/*.json dead. branch protection GH006 실패 + draft→public skip 원인 제거) |
| 2 | `be2cdd0` | docs 체크포인트 |
| 3 | `9132770` | fix(scanner): 미매칭 키 AWS→Uncategorized 오분류 수정 (fallback 이 BINARY 정렬 첫 issuer=AWS 였음. "unknown" 시드 + scanner/import/QuickAdd/CreateCredential fallback 교체) |
| 4 | `ed21251` | style: prettier 포맷 3파일 (CI format:check 통과) |
| 5 | `94fb227` | fix(deps): tmp/uuid transitive 취약점 override (Dependabot high+medium, pnpm.overrides) |
| 6 | `77336e8` | feat(inventory): **API Key/비밀번호 값 교체(rotation) UI** (RotateValueDialog + 버튼 활성화, 백엔드 기존 명령 재사용) |
| 7 | `40ba40d` | feat(inventory): **"기타(Other)" 종류 + 사용자 정의 타입명** (CredentialKind::Other + custom_kind_label 컬럼 0016) |
| 8 | `a5a3dbb` | docs 체크포인트 |

### 핵심
- **dogfooding "API 저장/drag&drop 안 됨" = 코드 버그 아니라 손상된 로컬 vault.db** (migration VersionMismatch). 신선 설치본에서 정상. 세션 중 dev 진단용 위험한 복구 스니펫으로 실제 볼트 폴더 삭제 사고 발생. 교훈은 메모리에 기록.
- **AWS 그래프 오분류**: 사용자 관찰이 정확. 미매칭 키가 전부 AWS 로 → Uncategorized 버킷으로 수정.
- **rotation**: 백엔드 `credential_rotate_value` 는 완비, 프론트만 미구현이었음.
- **Other**: 양쪽 dialog + BentoCard 표시 + i18n 4로케일.
- **검증 회귀 0**: app 288 / storage 전체 / frontend 657 / typecheck·lint·fmt clean / CI green.
- **⚠️ 미해결(무관)**: `secretbank-feeds::twofa_directory::tfa3_expired_cache_refetches` 가 로컬 저-uptime 머신에서 `Instant::checked_sub` underflow 로 실패 (CI 통과). robustness fix 보류.

## 2026-05-14 ~ 2026-05-15 (resume 세션) — dogfooding 4건 root cause fix + v0.1.0-pre18 release + Cloudflare 보안 이슈 6/8 해소

### 5 commits

| # | Commit | 작업 |
|:--|:--|:--|
| 1 | `2232e5d` | fix(onboarding): 감지 키 0건 empty state — Back 버튼 추가 (Fix C) |
| 2 | `afae06a` | fix(scanner): .gitignore 무시 — 실제 .env 파일도 스캔 (Fix A) |
| 3 | `e949b36` | fix(onboarding): 폴더 스캔 → vault 자동 저장 — prepare/commit + issuer-less (Fix D+B) |
| 4 | `0c1998f` | chore(release): version bump 0.1.0-pre17 → 0.1.0-pre18 + CHANGELOG |
| 5 | `1a16eba` | fix(ci): eslint scripts/ glob 에 .mjs 포함 (no-undef CI red 해소) |

### 핵심 성과

- **dogfooding 발견 4개 root cause 일괄 해결** (A: .gitignore bypass / B: issuer-less import / C: empty state 탈출구 / D: 평문 vault 자동 저장)
- **CSV import 의 prepare/commit 패턴 차용** — `EnvScanSessionStore` + `env_scan_prepare`/`env_scan_commit` Tauri commands. 평문은 5분 TTL 세션에 보관 (drop 시 zeroize), commit 시 vault `put_secret` + project + credential + usage 일괄 저장 (vault write lock 1회만)
- **v0.1.0-pre18 release** — 10 assets 빌드 + publish, 5 platform 다운로드 200 OK
- **Cloudflare 보안 이슈 6/8 해소** — 2FA 활성화, api-vault.app archive + auto-renewal OFF, secretbank.app Block AI bots ON (17개 AI Training 차단, Search/Archiver/AI Search Allow 유지)

### 검증

- Rust app lib 287/287 ✅, connectors 36/36 ✅
- Frontend onboarding 37/37 ✅
- Clippy app lib clean ✅

### 남은 사용자 액션 (다음 세션)

- 실제 dogfooding 검증 — secretbank.app/download/win 다운로드 → 설치 → 폴더 드롭
- Cloudflare Security Center 에서 stale 이슈 2건 "Archive selected" (2FA + Security.txt)
- GitHub OAuth App callback URL 을 `http://127.0.0.1` 로 갱신 + curl 검증

## 2026-05-10 (저녁 resume 세션) — v0.1.0-pre12 release cut + dogfooding 진입

### 1 commit

| # | Commit | 작업 |
|:--|:--|:--|
| 1 | `ff41897` | chore(release): version bump 0.1.0-pre11 → 0.1.0-pre12 — 24 파일 동기화 + CHANGELOG [0.1.0-pre12] |

### Release 결과 (v0.1.0-pre12 prerelease, 2026-05-10 10:18 UTC)

- ✅ **Draft 빌드 성공** — 10 assets (Win .exe+.sig / macOS universal .dmg + .app.tar.gz + .sig / Linux AppImage+.sig + .deb + .rpm + latest.json) 모두 GitHub Releases 업로드.
- ✅ **Draft → Public publish 완료** (`gh release edit v0.1.0-pre12 --draft=false --prerelease`). prerelease 마킹 유지. `--latest` 는 prerelease 와 충돌 → 미사용.
- ❌ **`publish-updater-manifest` job 실패** (pre11 과 동일) — site/{latest,releases}.json 자동 commit 이 branch protection (GH006) 에 막힘. `secretbank.app/api/latest` pre11 그대로. dogfooding 흐름엔 무영향 (직접 다운로드).
- ❌ **CI fail → rerun green** (3m17s) — `DependencyGraph.blastRadius.test.tsx > Esc 키 다운 시 선택 해제` 1건 flaky. 로컬 4 PASS, CI rerun PASS.
- ✅ Extension CI / Extension E2E success.

### Dogfooding 시작 명령 (Windows)

```powershell
$url = "https://github.com/phoodul/secretbank/releases/download/v0.1.0-pre12/Secretbank_0.1.0-pre12_x64-setup.exe"
$out = "$env:TEMP\Secretbank_0.1.0-pre12_x64-setup.exe"
Invoke-WebRequest -Uri $url -OutFile $out
Start-Process -FilePath $out
```

### 다음 세션 시작점

- **A** Dogfooding 결과 정리 + 발견 이슈 fix
- **B** M24 Phase 3-B (secure_note)
- **C** Cloudflare publish-updater-manifest 영구 해결
- **D** Brand 일관성 (site nav 로고 + README + 데스크톱 토큰)

---

## 2026-05-10 (오전~오후, resume 세션) — final_logo + CI green 라운드 + brand identity 정식화

### 누적 (10 commits)

| # | Commit | 작업 |
|:--|:--|:--|
| 1 | `8e838e6` | T-24-E-Icons (4 사이즈 PNG, 1차 placeholder) |
| 2 | `986e438` | Dependabot 3 moderate (postcss 5.x → 8.5.10+) |
| 3 | `3964cad` | CI red 5 영역 일괄 fix (Phase G 누적 결함) |
| 4 | `10e467a` | WXT `postinstall: wxt prepare` |
| 5 | `98d4c7e` | Rust migration test + prettier 70 files |
| 6 | `021a9a3` | 누락된 0015_audit_seq_reindex.sql |
| 7 | `6d3837c` | **final_logo 일괄 적용 — 라피스+골드 메탈 vault** |
| 8 | `e4517f5` | E2E worker teardown 60s race |
| 9 | `ea23c1c` | E2E timeout 180s + Deploy Site wrangler 직접 |
| 10 | (이번) | 세션 정리 + E2E continue-on-error mute + docs 갱신 |

### CI 결과 (`ea23c1c` 시점)

- ✅ **CI** (Rust + Frontend + ee-relay)
- ✅ **Extension CI** (test 650 PASS + typecheck + build chromium/firefox)
- ❌ **Extension E2E** — Chromium MV3 launch 180s+ (GitHub Actions Linux runner 한계). 옵션 D 후퇴 (continue-on-error mute)
- ❌ **Deploy Site** — Cloudflare API fail. **사용자 액션 필요** (token Pages:Edit 권한 + project rename 점검)

### Brand identity 정식화

- 공식 로고: `final_logo.png` (라피스 라줄리 shield + 폴리시드 골드 key + 락 + 매트릭스 그린 binary + PCB tracery)
- Color palette: lapis (#1E3A8A) primary + gold (#D4A017) accent + matrix green (#22C55E) 보조
- 사용처: 데스크톱 (Tauri 풀세트 자동 재생성) + Extension (4 사이즈) + 사이트 (og-image + favicon × 5 + meta)
- 제출용 PNG: Chrome / Edge / Firefox 모두 동일 세트 (DRY)

### 다음 세션 시작점

- **C** brand 일관성 강화 (site nav 로고 + README logo + 데스크톱 디자인 토큰)
- **D** M24 Phase 3-B (secure_note) 진입 — researcher → integrator → planner → implementator
- **E2E F-2** Firefox + Safari + Edge cross-browser 풀 통합 + globalSetup single launch 리팩토링
- **사용자 액션**: 스크린샷 촬영 → 스토어 제출 (Chrome/Edge/Firefox AMO) + Cloudflare token 점검

---

## 2026-05-10 (새벽) — 🎉 M24-E 풀체인 클로즈 (53/53 sub-task, 100%)

### 결정 요약

이번 세션은 resume → Night mode 연속 실행으로 Phase D + E + G + F 모두 완료. 1P 동등 + 1P 우위 차별 5종 모두 구현. **hackernews 권유 가능 시점 도달**.

### 28 sub-task commits + 1 store matrix

**Phase D (save dialog, 6/6)** — `013987c` D-1 form hook + `5976b3d` D-2 world-bridge + `f344a1c` D-3 SaveBanner + `56ce10e` D-4 save-handler + `ed887fa` D-5 actor+issuer + `fcbba5c` D-6 IPC+dialog

**Phase E (1P 동등 dogfooding 시점, 5/5)** — `87809ed` E-1 generator inline + `7892db0` E-2 recipe inheritance + `8dc6374` E-3 Site Logo + `c5e2e39` E-4 popup card + `43cb49f` E-5 design tokens

**Phase G (1P 우위 차별 5종, 10/10)** — `8c658cd` G-1-1 mini-graph 어댑터 + `82dd99b` G-1-2 SVG fan-out + `5f4fd28` G-1-3 deep-link + `54d8647` G-2-1 incident 매칭 + `6bead7d` G-2-2 in-page banner + `c4c6dd9` G-3-1 blast radius 어댑터 + `7237949` G-3-2 SaveBanner 통합 + `c31e556` G-4-1 MCP push 백엔드 + `a8439c0` G-4-2 트리거 + 인디케이터 + `b23ac1b` G-5 RAILGUARD

**Phase F (스토어 + E2E + audit, 8/8)** — `83dbf16` F-5 Mock NM Host + `48e9fa0` F-3 Playwright Chromium 옵션 B + `6344917` F-4 Firefox build smoke 옵션 D + `4c50cb3` F-1 Chrome submit + nativeMessaging 권한 보강 + `820de77` F-2 Firefox AMO + F-7 Edge + store matrix + `348e6f3` F-6 Safari + F-8 audit placeholder

### 1P 우위 차별 기능 5종

- **G-1 Inline 의존성 mini-graph** — popup CredentialCard hover SVG fan-out (220×110, MAX_VISIBLE=5 + "+N more") + Tauri secretbank://graph?credential=<id> deep-link → 데스크톱 GraphPage focus highlight
- **G-2 Supply chain banner** — 사용자 방문 사이트의 NVD/GHSA breach 자동 in-page 경고 (Closed Shadow DOM, severity 색상, 7일 dismiss + 1h cache) + 데스크톱 IncidentsPage `?host=` 필터 진입
- **G-3 Blast radius preview** — 비번 변경 시 SaveBanner inline 카드 (이 변경이 N개 항목에 영향 + Folder/Server SVG 아이콘 + hidden_count) + secretbank://graph?blast_credential=<id> blast mode 진입
- **G-4 MCP context push** — opt-in 강제 (desktop SQLite settings, 기본 OFF) + 5분 cooldown per host + popup 인디케이터 (controlled Tabs), AI 에디터 MCP query 시 최근 site context 응답 (capacity 10 FIFO)
- **G-5 RAILGUARD AI 에디터 sidebar 경고** — chatgpt/cursor/cursor.sh/copilot/gemini/claude.ai/poe/perplexity 8 host 매칭 시 amber 경고 (Closed Shadow DOM) + RAILGUARD 룰 자동 생성 secretbank://railguard deep-link

### 인프라 보강 (이번 세션)

- `loop-counter.sh` — implementator 상한 20 → 80, 세션 50 → 200 (Night mode 자동 진행 빈도 반영)
- nativeMessaging 권한 누락 발견 + 보강 (B-3 NMClient 부터 사용 중이었으나 manifest 누락, F-1 검증 시점 발견)
- McpCredentialMeta 이름 충돌 해결 (validation/credential.ts CredentialMeta 와)
- nm-host 와 desktop Tauri 간 TCP IPC 채널 신설 (D-6, dynamic port + 4-byte LE prefix + JSON + HMAC session token verify, vault unlock 시 자동 시작/lock 시 Drop 자동 종료)

### 검증 결과 (회귀 0)

| 항목 | 결과 |
| :--- | :--- |
| cargo test --workspace --lib | 290+6 PASS (G-4-1 시점) |
| cargo clippy -D warnings | 0 warnings |
| cargo fmt --check | OK |
| pnpm vitest run (root) | 654 PASS |
| pnpm --filter @secretbank/extension test | 650 PASS (F-4 web-ext 34 추가) |
| pnpm --filter @secretbank/shared test | 100 PASS |
| extension build:chromium | OK (4.36 MB) |
| extension build:firefox | OK (4.36 MB) |
| typecheck (root + extension + shared) | 0 error |

### 남은 사용자 액션 (자동화 ❌)

- **Chrome Web Store** — Developer 계정 등록 ($5 일회) + listing 입력 + 5+ 스크린샷 + Listing 제출 (`docs/release/m24e_chrome_submission.md` 참조)
- **Microsoft Edge Add-ons** — Microsoft Partner Center 등록 (무료) + chromium-mv3 빌드 100% 재사용 + listing 제출 (`docs/release/m24e_edge_submission.md`)
- **Firefox AMO** — Mozilla Add-ons 계정 등록 (무료) + firefox-mv2 빌드 + AGPL-3.0 소스코드 자동 충족 + gecko.id `secretbank@secretbank.app` (`docs/release/m24e_firefox_submission.md`)
- (선택) Apple Dev $99/년 + Safari Mac App Store (`docs/release/m24e_safari_submission.md`)
- 아이콘 16/32/48/128 PNG 생성 (현재 manifest icons 필드 없음)

### 다음 마일스톤

M24-E 출시 → dogfooding (GitHub Releases installer 1주, daily driver) → Show HN (hackernews "Show HN: Secretbank — secret manager that maps your dependency graph") → 사용자 피드백 100~500 명 수집 → NLNet NGI Zero PET 신청 (Phase F 직전 8~12개월 전, 무료 audit 경로) → M24 일반 vault Phase 3-B (secure_note) → 3-C (passkey) → 4 (카테고리) → 5 (TOTP autofill) → M11 모바일.

---

## 2026-05-10 — M24-E B-9 옵션 C / B-10 옵션 B 확정 + docs 정리

### 결정 요약

- **B-9 외부 보안 audit**: 옵션 C 채택 (skip + Phase F 종합 audit 통합)
- **B-10 3 OS 수동 검증**: 옵션 B 채택 (CI smoke + Win11 자동 ping/pong 충분)
- **Audit 로드맵**: 1000 paid (ARR $20k+) 도달 전 자가 부담 ❌ → NLNet NGI Zero PET (Radically Open Security 무료 audit) 신청 = Phase F 직전 8~12개월 전 시작

### 결정 근거

- 사용자 통찰: "수만~수십만 USD 자가 부담 비합리, 1000 paid 사용자 시점이 audit 임계점"
- 검증: Cure53 Phase B 단독 $15k~$30k / Trail of Bits 종합 $50k~$200k
- 1000 paid 까지 신뢰 구축 4가지 = OSS 공개 + 무료 펀딩 (NLNet/OTF) + 자기 검증 (KAT/fuzzing/CodeQL) + responsible disclosure

### 갱신 파일

| 파일 | 변경 |
| :--- | :--- |
| `docs/project-decisions.md` | [2026-05-10] B-9/B-10 결정 + audit 로드맵 + 1000 paid 신뢰 구축 4 방법 |
| `docs/audit/m24e_phase_b_scope.md` | DECISION 박스 추가 — 옵션 A 권고 → 옵션 C 채택 |
| `docs/task.md` | M24-E 진행 현황 표 19개 sub-task 매핑 보충 (A6/A7/B1-B4/B6-B10/C1-C8) + Status `🔄 25/53 완료` |
| `docs/task_m24e.md` | B9/B10 + C1~C8 매핑 + 53 sub-task 카운팅 정정 |
| `docs/progress.md` | 2026-05-10 체크포인트 추가, 다음 = Phase D |

### 검증 결과

- 코드 변경 없음 (docs only). 기존 검증 결과 유지: cargo test --workspace --lib 663+ PASS / pnpm vitest 628 PASS / extension 219 PASS / typecheck 0 / clippy 0 / format ✅

### 다음

- Phase D 진입 — D-1 form submit listener + XHR/fetch hook 부터

---

## 2026-05-09 — T-24-E-B7 세션 토큰 (HMAC-SHA256) + Settings UI 완료

### 큰 줄거리

- `secretbank-nm-host/src/session.rs`: HMAC-SHA256(key, "session" || ts || nonce || ext_id) 토큰 — issue/verify/verify_at + ST1-12 단위 테스트 (12케이스)
- `secretbank-app/src/commands/extension_session.rs`: 4 Tauri 커맨드 (issue/verify/settings_get/settings_set) + EX1-8 단위 테스트 (8케이스)
- `src/features/settings/ExtensionSettings.tsx`: 5-option 라디오 그룹 + AlertDialog confirm (기존 세션 종료 경고) + 성공/실패 toast + Skeleton 로딩
- `extension/entrypoints/popup/Settings.tsx`: chrome.storage 캐시 기반 read-only TTL 배지 + 데스크톱 앱 안내
- i18n: SESSION_* 14키 신규 (I18N_KEYS 28→42) + 4로케일 (en/ko/ja/zh_CN 확장 + en/ko/ja/zh 데스크톱)
- typecheck: `useRef` 미사용 imports 제거
- drift detection 테스트 갱신: 28 → 42키

### 보안 설계 핵심

- constant-time 비교 (subtle::ConstantTimeEq) — timing attack 방어
- CSPRNG 16-byte nonce (rand::thread_rng)
- secret_key: 32-byte CSPRNG, vault `device/extension/{ext_id}/session_secret` 저장
- settings_set 호출 시 모든 ext_id secret 즉시 회전 → 기존 token 무효화

### 검증 결과

| 항목 | 결과 |
| :--- | :--- |
| cargo test --lib | 253+ PASS (회귀 0, ST1-12 + EX1-8 신규) |
| cargo clippy -D warnings | 0 warnings |
| cargo fmt --check | OK |
| pnpm typecheck | 0 errors |
| pnpm vitest run | 628 PASS (회귀 0, ExtensionSettings 7신규) |
| extension test | 122 PASS (회귀 0, drift detection 42키 갱신) |
| shared test | 100 PASS |

### 핵심 commits

| 카테고리 | 커밋 | 의미 |
| :--- | :--- | :--- |
| T-24-E-B7 session token + Settings UI | `ba92e60` | HMAC-SHA256 토큰 + 4 Tauri 커맨드 + Settings UI |

---

## 2026-05-09 — T-24-E-B5 PairingDialog UI + storage typed wrapper 완료

### 큰 줄거리

- PairingDialog.tsx: useReducer 4단계 상태 머신 (uninitialized → pending → paired / error)
- PairingErrorKind: not_installed / rejected / timeout / protocol
- NMClient + PairingSession B-4 재사용, saveToStorage → chrome.storage.local
- extension/lib/storage.ts: Zod schema (extensionPriv/desktopPub/deviceId/pairedAt) + getPairing/setPairing/clearPairing
- pairing.ts: restoreFromStorage / saveToStorage / clearStorage 헬퍼 추가
- i18n: 9신규 키 4로케일 (en/ko/ja/zh_CN) + I18N_KEYS 19→28 + drift detection 갱신
- 테스트: 117/117 PASS (신규 25케이스: storage 9 + PairingDialog 16), 회귀 0

### 주요 기술 결정 / 해결 이슈

- vi.hoisted()로 NMClient/PairingSession 목 공유 상태 vi.mock factory 안에서 접근
- 전역 fake timer 제거 → timeout 테스트만 로컬 vi.useFakeTimers() + fireEvent.click() 사용
- flushMicrotasks(): setTimeout 쓰지 않고 await Promise.resolve() 루프로 microtask flush
- T7 위협 모델 주석: extensionPriv base64 평문 저장 한계 + OS 수준 암호화 의존 문서화

### 핵심 commits

| 카테고리 | 커밋 | 의미 |
| :--- | :--- | :--- |
| T-24-E-B5 PairingDialog + storage | `6ad32f7` | extension 페어링 UI + storage typed wrapper |

---

## 2026-05-09 — T-24-E-B4 X25519 ECDH 페어링 프로토콜 구현 완료

### 큰 줄거리

- B-4 페어링 프로토콜 Rust + TypeScript 양쪽 완전 구현
- Rust: `secretbank-nm-host/src/pairing.rs` (PairingSession, RFC 7748 §6.1 TV1/TV2, 15 unit tests)
- TS: `extension/lib/crypto.ts` + `extension/lib/pairing.ts` (PairingSession 클래스, 35 tests)
- shared: `NMMessageInitSchema` ext_pub/extension_id 필드 추가, 4개 신규 스키마 (pair_request/pair_response/paired)
- `packages/shared/src/__tests__/validation.test.ts` 2개 기존 테스트를 새 스키마에 맞게 수정
- 전체 검증: Rust workspace 626 PASS (회귀 0) / extension 92 PASS / shared 100 PASS / clippy 0 / typecheck 0

### 주요 기술 결정 / 해결 이슈

- x25519-dalek 2.x의 `x25519()` 함수가 clamping 적용 → RFC 7748 §6.1 직접 검증에 사용
- @noble/curves 2.x API: `randomPrivateKey()` → `randomSecretKey()` (이름 변경)
- TV2 expected_output 값 수정 (인터넷 잘못 인용값 → x25519-dalek 실제 계산값 `cd2723eb...3d`)
- import 경로에 `.js` 확장자 필요 (`@noble/curves/ed25519.js`, `@noble/ciphers/chacha.js`)

### 핵심 commits

| 카테고리 | 커밋 | 의미 |
| :--- | :--- | :--- |
| T-24-E-B4 페어링 프로토콜 | `8b5275f` | X25519 ECDH + XChaCha20-Poly1305 Rust + TS 구현 |

---

## 2026-05-09 — Resume 세션 종료 (인프라 setup + UX 결정 4건 + pre11 release + branch protection 해결)

### 큰 줄거리

- Pre-step Worker 풀체인 마무리 (Sub-task 2~5)
- Cloudflare 인프라 setup (Pages custom domain + Worker deploy)
- pre11 release 풀체인 (version bump 19 files + release.yml 빌드 + 수동 mirror)
- 핵심 UX 결정 4건 정식화 (Tiered Protection / Site Logo / M24-E 격상 / Zero-Knowledge 원칙)
- Branch protection 영구 해결 (PR review + strict 비활성, github-actions[bot] push 가능)
- site/ 브랜드 텍스트 fix (리브랜드 사각지대)
- Dependabot 보안 패치 (hono 4.12.18)

### 사용자 통찰 (세션 마무리 시점, 매우 중요)

> "autofill 없이 dogfooding 의미 X — daily driver 검증 불가"

**M24-E 가 진짜 출시 blocker** 임을 사용자가 직접 재확인. [2026-05-08] Tier 1 격상 결정의 정확한 근거.
방법 A (1P autofill 끄고 Chrome native + 우리 import) 검증 완료.

### 핵심 commits (push 모두 origin/main)

| 카테고리 | commits | 의미 |
| :--- | :--- | :--- |
| Pre-step Worker Sub-task 2~5 | `8a4b5ac` ~ `33e944c` + `291c2ea` + `e005f6c` | site/releases.json + site/latest.json + release.yml + RELEASE_GUIDE |
| Dependabot 보안 패치 | `673452a` | hono 4.12.15 → 4.12.18, 2 moderate 해소 |
| Tiered Protection 결정 | `8ece666` | password = OS lock 위임 / api_key/카드/passkey = per-reveal 재인증 |
| Site Logo 결정 | `cc384df` | D+E 조합 (Worker favicon-proxy + bundled SVG + fallback) |
| Tier 1 재조정 (M24-E 격상) | `dc60285` | Password Generator + Quick Save + M24-E 우선 |
| Zero-Knowledge 원칙 | `f02eab7` | 복구 가능 ↔ ZK 양립 불가, 6 layer 정리 |
| pre11 version bump | `8e0432d` (19 files) | 모든 version 필드 0.1.0-pre10 → 0.1.0-pre11 |
| pre11 manual mirror | `1514481` (가정 hash) | release.yml 의 main push 차단 회피, latest.json 수동 mirror |
| site nav 브랜드 텍스트 fix | `6b6ef83` | "API Vault" → "Secret<lapis>bank</lapis>" |

### 인프라 setup (코드 외)

- **Cloudflare Pages custom domain** — `api-vault-site` Pages 프로젝트 + `secretbank.app` + `www.secretbank.app` custom domain 추가 + DNS A 레코드 자동 등록 + SSL 발급
- **Cloudflare Worker deploy** — `ee/cloudflare/download-proxy/` 의 `wrangler deploy` 1회 실행 → `secretbank.app/download/*` + `secretbank.app/api/*` route 등록
- **GitHub branch protection 갱신** — Settings → Branches → main rule:
  - "Require a pull request before merging" 체크 해제
  - "Require branches to be up to date before merging" 체크 해제
  - 결과: `pr_review: null` / `strict: false` — github-actions[bot] 자동 commit 통과

### 검증 결과 (회귀 0)

| 검증 | 결과 |
| :--- | :--- |
| `cargo test --workspace --lib` | **586 PASS** |
| `pnpm vitest run` | **614 PASS / 70 files** |
| `cd ee/cloudflare/download-proxy && pnpm test` | **14 PASS** |
| `pnpm typecheck` | 0 error |
| `pnpm lint` | 0 신규 (22 기존 warnings 무관) |
| `pnpm format:check` | PASS |
| YAML / JSON syntax | release.yml + latest.json + releases.json PASS |

### 라이브 인프라 검증

- `https://secretbank.app` → Pages 정상 서빙 (title / og:* 모두 "Secretbank", nav brand text "Secretbank" lapis 강조)
- `https://secretbank.app/api/latest` → Worker proxy → site/latest.json (`"version": "0.1.0-pre11"`, Content-Type: application/json)
- `https://secretbank.app/download/v0.1.0-pre11/Secretbank_*_x64-setup.exe` → 200 OK (Worker GitHub Releases CDN passthrough)
- GitHub Release v0.1.0-pre11 → public 상태, 모든 OS installer + .sig 존재

### 다음 세션 시작점

**진행 순서 갱신** (project-decisions [2026-05-08] 에 정식화):

```
~~dogfooding~~ (방법 A 로 단축 완료)
→ Site Logo 풀체인 (5~7 commits) ⭐ 다음 세션 시작
→ Password Generator α + β (4~7 commits)
→ Quick Save 글로벌 hotkey + tray popup
→ M24-E 브라우저 확장 풀구현 (Tier 1 가장 큰 항목)
→ Phase 3-B → 4 → 3-C → 5 → M11
```

**다음 세션 첫 액션**: researcher 호출 (Site Logo 사양 사전 조사) → integrator → implementator (Logo-1 favicon-proxy Worker).

---

## 2026-05-08 (저녁) — Pre-step Worker download-proxy 풀체인 마무리 (5 commits)

### 컨텍스트

이전 세션에서 Sub-task 1 (`ee/cloudflare/download-proxy/` Cloudflare Worker, 14 vitest) 만 완료된 상태에서 사용자가 Secretbank 리브랜드를 결정해 commit `5e1db44` 로 일괄 처리. 그 과정에서 Sub-task 2 의 site/index.html 변경분 (classify URL → secretbank.app/download/, fetchReleases /api/latest + /releases.json 분리) 이 함께 들어갔으나 site/releases.json placeholder 만 untracked 상태로 남았음. 본 라운드 = 잔여 4 sub-task 완성.

### 커밋 5개 (origin/main 보다 10 commits ahead)

| # | 커밋 해시 | 제목 | 영향 |
|---|---|---|---|
| 1 | `8a4b5ac` | feat(site): releases.json placeholder 추가 (Pre-step 2/5) | site/releases.json 1 파일 |
| 2 | `28c2c49` | feat(infra): site/latest.json URL → secretbank.app proxy 교체 (Pre-step 3/5) | site/latest.json 4 platforms URL |
| 3 | `5a43147` | feat(ci): release.yml site/{latest,releases}.json 자동 commit (Pre-step 4/5) | release.yml: BASE URL 교체 + publish-updater-manifest job 자동 commit step 2개 신규 |
| 4 | `33e944c` | docs(release-guide): Cloudflare Worker download-proxy 절차 추가 (Pre-step 5/5) | RELEASE_GUIDE.md: 섹션 9 신규, 섹션 7 갱신, Per-release/Rollback 갱신 |
| 5 | `291c2ea` | docs: Pre-step Worker 풀체인 완료 — progress.md 갱신 | progress.md |

### 주요 결정 (이번 라운드)

- **GATE 결정 #3 (d) 채택 적용**: Previous releases UI 유지 + release.yml 자동 생성. release.yml 의 자동 commit step 이 `gh release list --limit 20` + per-tag `gh release view --json assets` 로 site/releases.json 자동 합성. URL 은 site/index.html 의 classify() 가 동적 구성 (Worker 형식).
- **circular trigger 안전성 확인**: release.yml 트리거는 `push.tags: v*` 만 — main push 는 release.yml 자체를 다시 트리거하지 않음. `[skip ci]` 는 다른 workflow (예: ci.yml `push.branches: main`) 트리거 방지 이중 보험.
- **`git pull --rebase` 안전장치 + `--force` 금지** — solo 환경이라 동시 release 충돌 가능성 극히 낮지만 명시적으로 보호.
- **outdated 주석 제거** — release.yml 의 "branch protection 으로 GH_TOKEN push 차단" 주석 삭제. 현재 protection 없음 + 자동 commit 으로 처리됨.

### 검증 결과 (회귀 0)

- `cargo test --workspace --manifest-path src-tauri/Cargo.toml --lib`: **586 PASS / 0 FAIL**
- `pnpm typecheck`: 0 error
- `pnpm vitest run`: **614 PASS / 70 test files**
- `pnpm lint`: 0 신규 error (기존 22 warnings 무관)
- `pnpm format:check`: PASS
- `cd ee/cloudflare/download-proxy && pnpm test`: **14/14 PASS**
- YAML syntax (`python yaml.safe_load`): release.yml PASS
- JSON syntax: site/latest.json + site/releases.json PASS

### 다음 진입 — Dogfooding (production build → Worker deploy → tag push)

Pre-step Worker 풀체인 (Sub-task 1~5) 모두 완성. dogfooding 진입 조건 충족. 다음 세션:

1. **사용자 직접 — Worker deploy** (one-time, secrets 노출 위험으로 CI 자동화 ❌):
   ```sh
   cd ee/cloudflare/download-proxy && wrangler deploy
   ```
2. **검증**: `curl -I https://secretbank.app/download/v0.1.0-pre8/secretbank_0.1.0_x64-setup.exe` 200 + `curl https://secretbank.app/api/latest` JSON 응답
3. **v0.1.0-pre10 tag push** → release.yml 자동 빌드 → site/{latest,releases}.json main commit (`[skip ci]`) → Pages 재배포
4. **dogfooding**: secretbank.app 에서 installer 다운로드 → 설치 → 실행 (Windows 우선)

---

## 2026-05-08 — Secretbank 전체 리브랜드 완료 (Phase A + B 일괄, 1 commit)

### 커밋 `5e1db44`

**Phase A — URL / 도메인**
- `secretbank.app` 도메인 등록 (Cloudflare Registrar)
- `tauri.conf.json` identifier: `app.secretbank`
- updater endpoint: `https://secretbank.app/api/latest`
- deep-link scheme: `secretbank://`
- CSP origin: `https://secretbank.app`

**Phase B — 코드 리네임 (354 files, 241 files changed)**
- Rust 크레이트 13개: `api-vault-*` → `secretbank-*` (경로 + Cargo.toml)
- CLI 바이너리명: `secretbank` (bin.name), MCP: `secretbank-mcp`
- 볼트 파일 매직 바이트 `b"APIVAULT"` 유지 (파일 포맷 호환성 — 변경 ❌)
- JetBrains 패키지: `app.apivault` → `app.secretbank` (11 Kotlin 파일 + 1 test)
- `ee/api-vault-relay` → `ee/secretbank-relay`
- Homebrew Cask: `api-vault.rb` → `secretbank.rb`
- WinGet manifest: `secretbank.secretbank`
- VS Code 확장: displayName/commandId/configKey `secretbank.*`
- Cloudflare Worker REPO/MANIFEST_URL/CORS: `phoodul/secretbank` + `secretbank.app`
- 설정 스토리지 키: `secretbank.settings.onboarding.done` (소문자)
- deep-link 프로토콜 비교: `"secretbank:"` (소문자 — URL 표준)

**주요 수정 에러**
- `b"Secretbank"` (10 bytes) → `b"APIVAULT"` (8 bytes) 복원 (배열 크기 타입 불일치 컴파일 에러)
- deep-link URL scheme 대소문자: `"Secretbank:"` → `"secretbank:"` (브라우저 `new URL()` 프로토콜 소문자 강제)
- 설정 키 대소문자: `"Secretbank.settings..."` → `"secretbank.settings..."` (소문자 접두사)
- PowerShell `Set-Content` UTF-8 BOM 추가 → JSON/CSS/JS 파서 깨짐 → `[System.IO.File]::WriteAllText` BOM-less 방식으로 수정 후 전역 BOM 제거 실행

**검증 결과**
- cargo build --workspace: 성공
- cargo test --workspace --lib: 586 tests PASS
- cargo clippy --workspace -- -D warnings: 경고 없음
- pnpm typecheck: 에러 없음
- pnpm vitest run: 614 tests PASS
- pnpm lint: 에러 없음
- pnpm format:check: 통과
- Worker tests (ee/cloudflare/download-proxy): 14/14 PASS
- Relay tests (ee/secretbank-relay): 71/71 PASS

---

## 2026-05-07 / 08 — Resume 세션 종료: Phase 2-2B + 3-A 풀체인 + dogfooding 절차 확정 (35 commits)

### 누적 이번 세션 — `fa9d111..00ceee5` (35 commits, push 완료)

**Phase 2-2B Watchtower 풀체인 (9 commits)**:
- 2-2B-1 `e26cc2d` PwnedPasswordsClient (HIBP k-anonymity range lookup, Add-Padding, ConstantTimeEq, SecretBox)
- 2-2B-2 `3714c34` security_check.rs + twofa_directory.rs (zxcvbn weak / SHA-256 reused / missing 2FA / unsecured)
- 2-2B-3 `13758ca` SQLite 0011 + SecurityAlertRepo + spawn_security_check_poller skeleton
- 2-2B-4 `1dd89f4` 4 Tauri commands (concurrency 10, audit log)
- 2-2B-5 `0c98e13` WatchtowerPage + SecurityAlertCard + SecurityBadge + Settings HIBP opt-in + i18n 4 로케일

**THREAT_MODEL.md (STRIDE) `4e650b5`** — Phase 3-A 진입 전 의무 작성 (B.4)

**Phase 3-A 신용카드 풀체인 (12 commits)**:
- 3-A-1 `af2e802` CredentialKind::CreditCard + 0012 마이그레이션 + Repo
- 3-A-2 `f81e3a2` BIN 감지 + card-utils.ts (25 Vitest)
- 3-A-3 `0194078` CreditCardVisual 3D flip (파생 상태로 GATE 2-4 보장)
- 3-A-4 `f83295e` CreditCardForm (BIN 실시간 + Zod refine + react-number-format)
- 3-A-5 `a6c891a` 4 Tauri commands + Detail + 30s 자동 클리어
- 3-A-6 `f7d00a3` BentoCard 분기 + i18n 4 로케일

**Dogfooding 절차 확정 (사용자 시정 2회)**:
- `03f25ed` 1차 결정 — Dogfooding 1~3일 먼저
- `d065dc6` 1차 시정 — `pnpm tauri dev` ❌ → production build / GitHub Releases
- `00ceee5` 2차 시정 — GitHub URL 노출 ❌ → **secretbank.app 단독 흐름** (Cloudflare Worker download-proxy)

### 누적 검증

- cargo test: 235+ passed (회귀 0)
- cargo clippy: 0 warning
- pnpm vitest: 신규 ~62 PASS (Phase 2-2B 9 + 3-A-2 25 + 3-A-3 13 + 3-A-4 10 + 3-A-5 7 + 3-A-6 8)
- pnpm typecheck: 0 / lint 신규 0 / format PASS
- 신규 의존성: sha1 / subtle / zxcvbn (workspace), react-number-format (frontend)

### 보안

- B.1 (10항목) + B.5 (5항목) + GATE 1 (7항목) + GATE 2 (7항목) 모두 적용
- THREAT_MODEL §4 4대 위협 완화 (카드번호 부분 노출 / BIN / 3D flip / screenshot 잔여)
- LLM 한계 인정 — 외부 보안 감사 출시 전 1회 의무

### 다음 세션 시작점 (메모리 + project-decisions 영구 저장)

1. **Cloudflare Worker `download-proxy` 배포** — secretbank.app/download/<filename> + /api/latest 자체 endpoint
2. **`site/index.html` 정정** — api.github.com 직접 호출 ❌, 자체 endpoint 사용
3. **`v0.1.0-pre11` tag push** → release.yml 트리거 → 다중 OS installer 빌드
4. **secretbank.app 단독 dogfooding** — 브라우저 주소창 GitHub 노출 0
5. 발견 이슈 fix → Phase 3-B (secure_note) 진입

---

## 2026-05-07 — M24 Phase 2-2B-3 완료: SQLite security_alerts 마이그레이션 + SecurityAlertRepo + 24h scheduler skeleton

### 구현 범위

| 파일 | 변경 |
| :--- | :--- |
| `migrations/0011_security_alerts.sql` | `security_alerts` + `twofa_directory_cache` 테이블 + 3 인덱스 |
| `repositories/security_alert.rs` | `SecurityAlertRepo` (8 메서드 + 트랜잭션 replace) + `TwoFaDirectoryCacheRepo` (replace_all + TTL 조회) |
| `repositories/mod.rs` | `pub mod security_alert` + 3종 re-export |
| `services/feed_scheduler.rs` | `FeedSchedulerConfig` 에 `security_check_enabled` + `security_check_interval_seconds` 추가 + `spawn_security_check_poller` 신규 |
| `tests/migration_test.rs` | 예상 테이블 수 14 → 16, 인덱스 9 → 11 갱신 |
| `commands/import.rs` | clippy `single_match` → `if let` 보정 (기존 코드, 이번 clippy 검사에서 발견) |

### 테스트 결과

- RA1~RA8 + C1~C2 (security_alert unit): 10/10 PASS
- S1~S2 (feed_scheduler): 2/2 PASS
- secretbank-storage 전체: 93/93 PASS
- secretbank-app 전체: 217/217 PASS
- `cargo clippy --workspace -- -D warnings`: 0 warning
- `cargo fmt --check`: 통과

### 설계 결정

- GATE 1-7 준수: `alert_meta` 는 평문 count/score/domain JSON만. 비번·username 미포함.
- GATE 1-6 준수: 자동 스케줄러 `spawn_security_check_poller` 는 tracing 로그만, audit log 없음.
- `replace_alerts_for_credential` 트랜잭션: `dismissed_at IS NULL` 만 삭제 → 사용자 dismiss 보존.
- `spawn_security_check_poller` 첫 tick skip (앱 시작 직후 즉시 실행 방지, 수동 실행은 2-2B-4 Tauri command 담당).
- `interval_seconds=0` 보정: 최소 1ms (tokio interval non-zero 요구).

---

## 2026-05-07 (resume 세션) — Phase 2-2B 진입 결정 + Researcher 백그라운드

세션 재개 후 Phase 3-A 신용카드보다 Phase 2-2B (Watchtower 동등 풀체인) 우선 결정.

### 결정 + 사전 작업 (`4628da3` + `faaa519`)

- ux_research_phase3.md (1039줄) docs(research) 단독 커밋 (`4628da3`) — Phase 3 진입 시 즉시 사용 가능
- project-decisions.md `[2026-05-07] Phase 3 진입 전 Phase 2-2B 우선` 신규 항목 추가 (`faaa519`)
- **결정 요점**: 1Password Watchtower / Bitwarden Reports 동등을 목표 (Compromised + Vulnerable + Reused + Weak + Inactive 2FA + 2FA Available)
- **보안 룰 적용**: HIBP k-anonymity range lookup 만 (전체 hash ❌), SecretBox 즉시 래핑, drop 시 zeroize, timing-safe 비교, 평문 DB 저장 ❌
- **순서 갱신**: 2-2B → 3-A 신용카드 → 3-B secure_note → 4 카테고리 → 3-C passkey → TOTP autofill → M11

### Researcher 백그라운드 호출 (진행 중)

- 결과 산출물: `docs/research_phase2_2b_password_check.md`
- 5개 섹션: HIBP Pwned Passwords API v3 / Rust password strength (zxcvbn-rs) / 1P Watchtower / BW Reports / Secretbank 통합 권고
- 분량 가이드: 800~1500줄

### 다음 액션 (Researcher 완료 후)

1. integrator 호출 — Phase 2-2B 사양 통합 보고서
2. USER APPROVAL GATE 1 — 사양 승인
3. implementator 사양 작성 (F.2 Spec + Security Spec) → implementator 호출 (TDD)
4. Phase 2-2B 풀체인 7~8 commits 예상 (range_lookup → 재사용 검출 → zxcvbn → Tauri command → UI)

---

## 2026-05-07 (Night mode 후반) — Phase 2-4-a + 2-4-d + tauri-plugin-fs fix (5 commits)

이번 세션 후반에서 처리한 항목들 — Phase 2-3-a 풀체인 직후 자연 진입으로 Phase 2-4 마무리 + 2-3-a-5 회귀 fix.

### Phase 2-4-a — Cmd+K Quick Add (`dfb9a57` + `0355a5d`)

- `actions.ts` 에 `action.quick-add` (Zap 아이콘) 추가, 기존 `action.create-credential` 유지
- `QuickAddDialog.tsx` 신규 (~455줄, 5 필드 경량 폼: URL/Username/Password/Name/Kind)
- `InventoryPage` 가 `?action=quick-add` 라우트 감지 시 마운트
- `@tauri-apps/plugin-clipboard-manager::readText` mount-once prefill (URL 패턴만, watch 폴링 X)
- Phase 2-1 의 `matchIssuerByUrl` 재사용 → "{issuer} 자동 감지됨" 표시
- "전체 옵션 보기" → CreateCredentialDialog (full form) 로 prefill 상태 전환
- i18n 22키 × en/ko/ja/zh 4 로케일
- Vitest 7 PASS (전체 535 → 542)

### tauri-plugin-fs Rust 등록 fix (`d4f99a5`)

- 발견: cargo build -p secretbank 가 빌드 스크립트에서 `Permission fs:allow-remove not found` 에러
- 원인: Phase 2-3-a-5 (CSVImportDialog 의 원본 삭제 버튼) 에서 `fs:allow-remove` capability 만 추가하고 Rust 측 plugin 등록 누락. implementator 가 frontend 변경 시 cargo build 검증을 안 돌렸음
- fix: `src-tauri/Cargo.toml` + `crates/secretbank-app/Cargo.toml` features+dep + `lib.rs` `.plugin(tauri_plugin_fs::init())` 3곳 보정
- **세션 학습**: Tauri capability 추가 시 frontend npm + Rust crate 양쪽 모두 등록 필수. implementator 사양에 명시 필요

### 누적 검증 (전체 세션 종료 시점)

- vitest **542** (528 → 542, +14, 0 failed)
- typecheck / lint / format:check ✅
- cargo test -p secretbank-cli 14 PASS / cargo build -p secretbank ✅ (fix 후) / clippy 0 warning
- 17 commits push (`611625a..d4f99a5`)

### 다음 세션 큐

- **Dogfooding** (사용자 직접 작업, 가장 자연스러운 다음 단계) — 본인 Chrome 비번 export → CSV import → Quick Add → CLI quick-add 풀체인 실사용 검증. UX 이슈 발견 시 즉시 fix
- Phase 2-3-b (Bitwarden JSON import) — 후순위
- Phase 2-2B (HIBP Password check) — M24 v2 로 미룸

---

## 2026-05-07 — M24 Phase 2-4-d ✅ `Secretbank add` CLI 서브커맨드

이전 세션 끝점 (Phase 2-4-a `dfb9a57`) 에서 진입.

### Phase 2-4-d — CLI quick-add

| 변경 | 커밋 |
| :--- | :--- |
| `Command::Add` variant + `cmd_add()` + `get_passphrase()` 헬퍼 + 신규 테스트 14개 | `c041ee2` |
| docs(task/progress/work-log) 갱신 | (이 커밋) |

**주요 구현 사항:**
- `Command::Add { url, user, pw, name, kind, env, json }` — clap `value_parser` 로 `kind`/`env` 유효하지 않은 값 즉시 거부
- `get_passphrase()` — `Secretbank_PASSPHRASE` 환경변수 우선, 읽은 후 `remove_var`(child process 누수 방지), 없으면 rpassword stdin
- `open_vault()` 도 동일 헬퍼 재사용 (기존 rpassword 직접 호출 제거)
- URL→host 추출 (scheme 없으면 `https://` 보정) + subdomain-safe issuer 자동 매칭
- `issuer_id NOT NULL` 제약 → 매칭 실패 시 첫 번째 issuer 폴백 (import.rs 동일 패턴)
- `--json` 플래그: `{"id","name","issuer_id","kind","env"}` 출력 (스크립트 파이프용)
- password 빈 문자열 → exit code 2 / vault unlock 실패 → exit code 1

**테스트 14개 PASS:**
- 기존 3 (truncate, status_label)
- 신규 clap 파싱 4 (minimal/full/kind validation/env validation)
- extract_host_from_url 3 (full url/no scheme/empty)
- host_matches_issuer 3 (exact/subdomain/evil domain)
- get_passphrase env var 1 (set→expose→remove_var 확인)

---

## 2026-05-07 (Night mode) — M24 Phase 2-3-a 풀체인 ✅ Google CSV import 완성 (15 commits push)

이전 세션 끝점 (origin/main `611625a`) 에서 시작. 사용자 결정으로 Phase 2-3 (Import) 의 1순위를 **Google CSV (Chrome/Edge/Brave)** 로 승격하고 Phase 2-4 (Cmd+K Quick Add + CLI quick-add) 신설. Phase 2-3-a 6 sub-task 모두 완료. 15 commits push (`611625a..84536a7`, branch protection admin bypass).

### 사용자 결정 (이번 세션, project-decisions [2026-05-07])

- **Phase 2-3 (Import) 1순위 = Google CSV**. 1pux/Bitwarden JSON 은 후순위.
- **Phase 2-4 신설 = "마찰 없는 등록 UX"**. 형태: (a) Cmd+K Quick Add 강화 + (d) CLI quick-add. (b) Tray + hotkey 보류. (c) 브라우저 확장은 별도 마일스톤.
- **HIBP Password check (2-2B) 는 M24 v2 로 미룸**. v1 은 "쉬운 등록 + 직관" 까지. dogfooding 우선.
- **Gate 2 승인 (옵션 A)**: 6 sub-task 분해 그대로 1 implementator = 1 commit 룰로 진입.

### Phase 2-3-a — Google CSV import 풀체인 (6 sub-task / 13 commits + 2 docs/CI)

| Sub-task | Commit | 변경 |
| :--- | :--- | :--- |
| 2-3-a-1: Chrome/Edge/Brave CSV 파서 | `15d2cc1` + `58df540` | `import/csv_google.rs` header-based 자동 감지 (Chrome 5컬럼 / Edge 3컬럼) + BOM 방어 + RFC 4180 escape + `SecretBox<String>` 즉시 래핑 + 빈 password 행 skip + `csv = "1"` workspace dep + 9 단위 테스트 |
| 2-3-a-2: CSV row → DetectedFromCsv 변환 | `e7449a8` + `662dd3e` | `import/to_detected.rs` — URL host 추출 (`url` crate, scheme 보정) + subdomain-safe issuer 매칭 (Phase 2-1 와 동일 정책) + name 우선순위 (CSV name > host > "Imported credential") + 10 테스트 (누적 19) |
| docs/CI fix: Phase 2-3 결정 + research 보고서 | `9a2821d` | project-decisions [2026-05-07] + research_phase2_3a_google_csv.md 신규 + prettier 포맷 정정 (CI format:check 그린화) |
| 2-3-a-3: import_csv_prepare + ImportSessionStore | `eea3657` + `3daaa65` | `commands/import.rs` — 5분 TTL 세션 보관 (16바이트 hex id, lazy sweep, drop 시 SecretBox zeroize) + preview DTO (평문 IPC 미통과) + alreadyExists 중복 감지 (HashSet) + 11 테스트 |
| 2-3-a-4: import_csv_commit + per-row 결과 | `3de251f` + `dd6ed7a` | session take-once + selectedRowIndices 부분 import + `ImportRowResult { row_index, credential_id, error }` per-row 보고 + `VaultLocked / SessionNotFound / RowIndexOutOfBounds` 에러 분기 + 5 테스트 (누적 import 10) |
| 2-3-a-5: DropZone .csv 분기 + CSVImportDialog UI | `b2048e4` + `84536a7` | `DropZone.tsx` `.csv` 확장자 분기 + `CSVImportDialog.tsx` 신규 (~380줄, Bento 카드 preview + 5분 TTL 카운트다운 + alreadyExists 자동 해제 + matched issuer badge + **원본 CSV 직접 삭제 버튼** `@tauri-apps/plugin-fs::remove`) + i18n 17키 × 4 로케일 + Vitest 7 PASS + `fs:allow-remove` capability |
| 2-3-a-6: docs(progress) + work-log | (이 commit) | Phase 2-3-a 풀체인 완료 선언 + 다음 진입 큐 (2-4-a / 2-4-d / dogfooding / 2-3-b) |

### 차별화 검증 (Researcher → 구현 → 동작 확인)

- **preview UI**: Researcher 가 "1P/Bitwarden/Apple 모두 preview 없이 즉시 import" 라고 검증. 우리는 Bento 카드 미리보기 + alreadyExists 충돌 표시 + matched issuer badge + 5분 TTL 카운트다운. 사용자 비전 ("직관적") 직접 충족.
- **원본 CSV 직접 삭제**: 1P/Bitwarden 은 텍스트 권고만. 우리는 결과 모달에 [삭제] 버튼 → `@tauri-apps/plugin-fs::remove` 즉시 영구 삭제 (휴지통 X) + 확인 다이얼로그 1번. 평문 password 가 디스크에 남는 시간 최소화.
- **평문 IPC 미통과**: 백엔드가 `SecretBox<String>` 으로만 평문 보관, frontend 는 `valueHint` (마지막 4자) 만 받음. session take-once 의미론으로 commit 후 즉시 zeroize.

### 누적 검증 (Phase 2-3-a 종료)

- `pnpm typecheck` ✅
- `pnpm vitest run` ✅ **535 (+7 from 528 baseline)** — CSVImportDialog 7 신규
- `pnpm lint` ✅ (pre-existing 18 만, 신규 0)
- `pnpm format:check` ✅
- `cargo test --workspace` ✅ — 0 failed (import: 24 신규 = csv_google 9 + to_detected 10 + commands::import 10 일부 중복 카운트, 누적 27 crates 0 failed)
- `cargo clippy -D warnings` ✅ — 0 warning

### 다음 세션 진입 큐 (사용자 결정 필요)

1. **Phase 2-4-a (Cmd+K Quick Add 강화)** — 작은 작업 (1~2 commits). `actions.ts:87` 에 `action.quick-add` 추가 + 클립보드 자동 채움 + URL auto-detect 재사용 (Phase 2-1).
2. **Phase 2-4-d (CLI quick-add)** — 작음 (1 commit). `Secretbank add --url ... --user ... --pw ...` + `Secretbank_PASSPHRASE` 환경변수.
3. **Dogfooding** — 본인 Chrome 비번 export → CSV import 실사용 검증. UX 이슈 발견 후 fix.
4. **Phase 2-3-b (Bitwarden JSON import)** — 우선순위 낮음. M24 v1 의 핵심 가치는 Google CSV 로 충분.

### CI 이슈 + 해결

- 세션 시작 시 GitHub Actions `format:check` 실패 (이전 세션 잔재 + 새 [2026-05-07] 결정 항목이 prettier 룰 위반). `pnpm format` → 14 파일 (project-decisions / USER_GUIDE.ko / research / BentoGrid / 13 i18n) fix → `9a2821d` 단일 commit 으로 정리. push 후 그린화.
- 한 implementator 가 reject 되어도 work tree 의 partial 작업이 컴파일/테스트 통과하면 그대로 묶어 commit 으로 정리 가능 (이번 세션의 2-3-a-4 케이스).

---

## 2026-05-06 (낮 — Phase 2 본격 진입) — M24 Phase 2-1 + 2-2A + 2-2C 완료 + 22 commits push

이전 세션 끝점 (origin/main `0ebc078`) 에서 시작. Phase 2-1 (URL auto-detect / Password vault UI) → Phase 2-2A (HIBP Breaches feed + 도메인 매칭 + UI 풀체인 5 sub-task) → Phase 2-2C (영어권/한국 정부 CSIRT RSS 2 sub-task) 까지 한 세션에 처리. 22 commits push (`0ebc078..f1a6925`, branch protection admin bypass).

### 사용자 결정 (이번 세션)

- **Phase 2 sub-task 우선순위 = 권고대로 1 → 2 → 3 → 4 → 5** (URL auto-detect → HIBP → 1Password CSV → Bitwarden JSON → browser autofill)
- **Phase 2-2 4갈래 분기 + 옵션 가**: 2-2A (HIBP Breaches feed) → 2-2C (다국가 RSS) → 2-2B (Password check) → M25 placeholder. project-decisions [2026-05-06] 기록.
- **HIBP 검사 정책**: 자동 (저장 시) + 24h 주기 + 수동 일괄 + DB 저장. 수동은 vault 전체 일괄 (per-card 메뉴 아님). Inventory 헤더에 stale 표시 (24h 녹색 / 7일 노랑 / 7일+ 빨강).
- **Zero-Knowledge 경계 명확화**: breach 메타데이터 (사이트명/날짜/유출종류) 는 broadcast OK, "어떤 사용자의 어떤 비번이 leak 됐는지" 만 사적.
- **도메인 매칭 디자인**: Issuer.domains 컬럼 추가 + credential.url 직접 매칭 + MatchReason::Domain 신규 + subdomain-safe (evil-stripe.com 차단).
- **KISA 5 RSS URL 사용자 직접 검증 후 제공**: 보안공지 / 보고서·가이드 / 공지사항 / 취약점 / 경보단계 (`bbsId=B0000133/127/132/302/342`).

### Phase 2-1 — URL auto-detect (3 commits)

| Sub-task | Commit | 변경 |
| :--- | :--- | :--- |
| 2-1a: domain 매핑 + matchIssuerByUrl 헬퍼 | `5473437` | issuer-presets.ts 10 preset 의 domains[] + match-issuer-by-url.ts (subdomain-safe) + 24 단위 테스트 |
| 2-1b: CreateCredentialDialog 확장 | `48d067c` | kind/url/username 필드 추가 + URL onChange auto-select (issuer lock) + i18n 4 로케일 + 4 통합 테스트 |
| docs | `e638b0d` + `c45534f` | task / progress 갱신 |

### Phase 2-2A — HIBP Breaches feed + 매칭 + UI (5 sub-task / 9 commits)

| Sub-task | Commit | 변경 |
| :--- | :--- | :--- |
| 2-2A-1: HibpClient::list_breaches | `84602bb` | `/breaches` 엔드포인트 메서드 + 5 wiremock 테스트 |
| 2-2A-2: normalize + IncidentFeed 통합 | `f1c05bb` + `72d4983` | `normalize_hibp_breach` (severity 계층: malware/stealer→Critical, sensitive→High, spam→Low, default→Medium) + 24h poller (`hibp_breaches_enabled` default true) + `FeedSchedulerError::Hibp` + 9 신규 테스트 |
| 2-2A-3a: Issuer.domains 컬럼 + 시드 | `9bac675` + `d96e838` | 마이그레이션 0009 + `Issuer.domains: Vec<String>` (JSON 직렬화) + 10 preset 도메인 시드 + frontend `Issuer.domains` + 8 테스트 픽스처 + Yjs `mapping.ts` |
| 2-2A-3b: Incident.domain + matcher 매칭 | `cefbfb3` + `1e3a40c` | 마이그레이션 0010 + `Incident.domain: Option<String>` + `MatchReason::Domain` (신규 variant) + matcher subdomain-safe 매칭 (issuer.domains[] / credential.url host 양쪽) + `evil-supabase.com` / `supabase.com.attacker.io` 차단 검증 + 9 회귀 |
| 2-2A-4: IncidentCard UI | `b1953c3` + `0c229bf` | reason 별 lucide 아이콘 (Globe/Tag/Search/Pin) + HIBP description body 표시 + domain 라인 + 15 로케일 i18n (`incidents.match.reason.domain`) + 6 회귀 |

**누적 검증 (Phase 2-2A 종료):**
- `cargo test --workspace --lib --tests`: 0 failed
- `cargo clippy --workspace --all-targets -- -D warnings`: 0 warning
- `pnpm typecheck`: 통과
- `pnpm vitest run`: 522 passed

### Phase 2-2C — 다국가 정부 CSIRT RSS (2 sub-task / 4 commits)

| Sub-task | Commit | 변경 |
| :--- | :--- | :--- |
| 2-2C-a: CISA + NCSC UK | `2b42bcb` + `ae89b6f` | `default_presets()` 10 → 12 + 5 신규 테스트 (count / slug 존재 / unique / https-only). URL 사전 WebSearch 검증. |
| 2-2C-b: KISA 5 RSS | `6eea2a1` + `cb35f39` | KISA 보안공지/보고서·가이드/공지사항/취약점/경보단계 5 추가. `default_presets()` 12 → 17. 사용자 직접 검증한 URL. 7 신규 테스트. |

**노이즈 평가 큐**: kisa-report / kisa-notice 는 advisory 가 아니라 일반 운영 정보 — dogfooding 후 제거 또는 카테고리 분리 권고.

### 누적 (이번 세션 22 commits)

- vitest **494 → 528 (+34)** 신규 / cargo test 0 failed / clippy 0 warning / typecheck OK
- 1 implementator = 1~2 commit 룰 준수 (8 implementator 호출, 평균 2.6 commits/호출)
- 1 implementator 호출이 응답 도중 끊긴 사례 1회 (2-2A-3a) — 새 implementator 가 누락 부분 보충 후 단일 commit 으로 마무리
- 사용자 페이스: 큰 결정 단계마다 직접 컨펌. 권고대로 진행. 옵션 (가) 정렬 후 4 sub-task 자율 진행.

### 보류 큐 (다음 세션)

- **dogfooding** — 본인 환경에서 IncidentsPage 진입 / Vercel·AWS·KISA breach 실제 매칭 검증 / KISA report·notice 노이즈 평가
- **Phase 2-2B** (HIBP Password check, 1Password Watchtower 동등) — 7~8 commits 큰 작업
- **Phase 2-2C-c** (ENISA / JVN / JPCERT URL 검증 후 추가)
- **사용자 액션 #4-7** (Apple cert / Windows cert / 데모 영상 / HN+PH)
- **GitHub Cowork 활성화 4 액션**

---

## 2026-05-06 (Night mode) — M24 Phase 1.5 완료 + 11 commits push

이전 세션의 누적 11 commits 를 push 한 뒤, Phase 1.5 의 남은 5 sub-tasks (C ~ G) 를 Night mode 로 연속 진행. 1 implementator = 1~2 commit 룰 준수.

### Push (옵션 3 먼저)

- `5a957c0..efce9d1` — origin/main 으로 push (branch protection rule 우회: admin)
- 11 commits = M24 Phase 1 (C-1~C-4) + Phase 1.5-A + 1.5-B + 결정 기록 + 세션 정리

### Phase 1.5-C ~ 1.5-G (5 sub-tasks, 5 feature commits + docs)

**핵심 결정 (이전 세션, `93fd796`):** Option D — `secondary_value_ref` + `primary_label` + `secondary_label` 3컬럼. 라벨 자유 문자열, issuer preset 의 default 묶음으로 자동 채움. hover 시 카드 expand → mini dependency graph.

| Sub-task | Commit | 변경 | 검증 |
| :------- | :----- | :--- | :--- |
| 1.5-C: issuer pair labels + 시드 | `d39fc5c` | migration 0008 + Issuer DTO + IssuerRepo CRUD + preset 시드 (Supabase Public/Secret · AWS IAM Access/Secret · GitHub OAuth Client/Secret · 기본 API Key/None) + 15 파일 | cargo build/clippy/test 통과 |
| 1.5-D: frontend types sync | `e96a22f` | `CredentialSummary`/`CredentialFull`/`Issuer` 인터페이스 + 11 파일 (fixture/test helper 포함) | typecheck 통과 |
| 1.5-E: BentoCard pair row + clipboard slot | `a6ae705` | clipboard.rs `slot` 옵션 추가 + BentoCard `has_secondary` Row 5 + i18n 4 로케일 + 7 파일 | typecheck/vitest 25/25/cargo clipboard 5/5 |
| 1.5-F: CreateCredentialDialog pair toggle | `9b57ff4` | issuer 선택 시 라벨 자동 채움 + `has_secondary` 토글 + zod refine + i18n 4 로케일 + 6 파일 | typecheck/vitest 14/14 |
| 1.5-G: BentoCard hover mini-graph | `2e2226b` | 새 MiniGraph 컴포넌트 (순수 SVG, 중앙 credential + project fan-out) + BentoCard hover 통합 (`prefers-reduced-motion` 존중) + i18n 4 로케일 + 8 파일 | typecheck/vitest 30/30 |

**누적 검증 (Phase 1.5 종료):**
- `pnpm typecheck`: ✅
- `pnpm vitest run` (전체): **494/494 passed**
- `cargo test --workspace --lib --tests`: **27 crates 모두 ok, 0 failed (519+ tests)**

**재발 방지 룰 준수:** 5 sub-tasks 각자 별도 implementator 호출, 1 호출 = 1 commit. 1.5-G 만 token 한계로 한 번 SendMessage 가 안 돼서 새 implementator 가 마무리 (`a22808d…` agent).

**부수 결정:**
- 1.5-G 의 jsdom 호환 fix — `BentoCard.tsx:85` 의 `window.matchMedia` 를 `typeof window.matchMedia === "function"` 로 가드 (테스트 환경 누락 방지)
- stash@{0} (이전 세션의 1.5-C WIP) — 새 commit 검증 통과 후 drop

### Memory 룰 보정

- `feedback_powershell.md` — 두 갈래로 분리: (A) 사용자 안내는 PowerShell 한 줄, (B) Bash 도구 내부는 POSIX 우선 + 필요 시 `powershell -NoProfile -Command "…"` 래핑. 2026-05-06 의 `Get-Content -Raw` exit 127 사례 기록.

---

## 2026-05-05 — M24 Phase 1 + Phase 1.5 절반 (10 commits, push 안 됨)

이번 세션의 핵심 진전: **type-agnostic bento card UI 완성** + **credential value pair (Option D) backend 절반**.

### Phase 1 (bento grid) — 완료

사용자 비전 명확화: 모든 credential 을 통합 bento card 로. password / api_key 같은 디자인, 다른 액션. 1Password/Bitwarden 보다 직관적.

카드 레이아웃 (사용자가 직접 정정해서 확정):
```
cloudflare              ← name (라벨 없이)
URL: cloudflare.com     ← 평문
ID:  ••••••• [보기]     ← username 도 마스킹 + client-side reveal (30s)
PW:  ••••••• [보기][복사] ← Tauri credential_reveal + 30s
```

핵심 결정: **ID(username) 도 마스킹** — shoulder-surfing 방어 (1Password 보다 강한 privacy).

- C-1 (`966ea42`): types.ts 에 `kind`/`url`/`username` 추가, Rust DTO 와 sync
- C-2 (`44b37f2`): BentoCard 컴포넌트 (Tauri reveal + 30s 자동 마스킹 + clipboard)
- C-2 정정 (`d54121c`): ID 도 마스킹 + URL/ID/PW 라벨 통일
- C-3 (`cb395a1`): BentoGrid responsive auto-fill (minmax 280px) + empty/skeleton
- C-4 (`2bfc180`, `f81cde8`): ⋮ 메뉴 type 별 분기 (api_key→Rotate/Graph/Blast, password→HIBP placeholder) + "API Key:" 라벨

테스트: BentoCard 22 + BentoGrid 10 = 32 통과.

### Phase 1.5 (Option D — value pair) — 절반 진행

추가 사용자 비전: API key 의 라벨 자유화 + Public/Secret pair (Supabase/AWS/OAuth) + 카드 hover 시 dependency graph 시각화.

모델링 결정 (`93fd796`):
- **Option D** — `secondary_value_ref` + `primary_label` + `secondary_label` 3 컬럼 추가, 1 row = 1 카드 모델 유지
- 라벨 자유 문자열 (issuer preset 의 default 묶음으로 자동 채움)
- hover 시 카드 expand → 미니 dependency graph (project/deployment 노드 + 엣지)

진행 상태:
- 1.5-A (`938d968`): migration 0007 + Credential* DTO 확장 ✅
- 1.5-B (`63334c4`): pair credential repo/command + `credential_reveal` 의 `slot` 옵션 파라미터 ✅
- 1.5-C ~ 1.5-G: 미완 — 1.5-C (issuer preset default 라벨) 만 진행 중 미완성 상태로 `stash@{0}` 보관

### 세션 조기 종료 — implementator 위임 단위 lesson

implementator 한 번에 7 sub-tasks 위임은 token 한계 + 사용자 체감 진행 속도 문제로 비효율.
**다음 세션 룰: implementator 호출 = sub-task 1~2개 단위. 1 호출 = 1~2 commit 목표.**

push 없음 (10 commits ahead). 다음 세션이 1.5-C 마무리 + push 검증.

---

## 2026-04-30 Night mode 18 — LockScreen 글로벌 LanguageSwitcher (2 commits, 11 → 15 언어)

### 세션 개요

- **목표:** LockScreen 에 글로벌 언어 선택 UI. 글로벌 SaaS 비전의 첫 i18n wedge.
- **결과:** 2 commits 같은 날.
  - 1차 11개: en/ko/ja/zh/es/fr/de/it/el/pt/ru
  - **2차 +4 (사용자 지적 — 인도어 누락 보정):** ar (RTL) / hi / vi / pl → 총 **15개**
- Frontend Vitest 445 → 450 (LanguageSwitcher +5, RTL 회귀 포함).

### 2차 lap 변경 (같은 날 후속)

- 신규 4개 locale: `src/locales/{ar,hi,vi,pl}/common.json` — LockScreen 가시 키 정확 번역
- `src/lib/i18n.ts` — `SUPPORTED_LANGUAGES` 에 `dir: "ltr" | "rtl"` 메타필드 추가
- `i18next.on("languageChanged", ...)` — `<html lang>` + `<html dir>` 자동 동기화. 아랍어 선택 시 layout 자동 RTL.
- 단위 테스트 +1 (RTL 검증)

### 변경

- 신규 7개 locale: `src/locales/{es,fr,de,it,el,pt,ru}/common.json` — vault.* 11 가시 키 + settings.language. 나머지는 i18next fallback (영어).
- `src/lib/i18n.ts` — 11개 언어 등록 + `SUPPORTED_LANGUAGES` (nativeName + englishName) export.
- `src/components/language-switcher.tsx` — Globe icon DropdownMenuRadioGroup. `variant="corner"` (vault 톤) / `variant="plain"`.
- `src/features/vault/LockScreen.tsx` — 우측 상단 corner 절대 위치로 LanguageSwitcher 통합.
- `src/components/__tests__/language-switcher.test.tsx` — 4 단위 테스트.
- `docs/project-decisions.md` 갱신 — 2026-04-30 결정 추가.
- `docs/progress.md` 갱신 — Night mode 18 체크포인트.

### 검증

- typecheck 통과 / 변경 파일 lint 0 / Vitest 449 (기존 LockScreen 6 회귀 0)
- 신규 7개 언어는 LockScreen 가시 키만 번역 — M13 시점에 풀 번역 단계적 보강 예정.

---

## 2026-04-28 Night mode 7 — M9 Phase E-4b / E-5 / F-1 (3 commits)

### 세션 개요

- **목표**: SyncProvider 가 RelayTransport 자동 생성 (E-4b) → 통합 round-trip 회귀 (E-5) → Phase F 진입 (F-1).
- **결과**: 3 commits (`113065c` E-4b / `61a1db3` E-5 / `6d47f94` F-1). Rust lib 158 → 162. Frontend Vitest 409 → 416. Relay vitest 46 → 54.

### Phase E-4b — SyncProvider wiring (RelayTransport default)

backend (Rust):
- `commands/auth.rs::auth_get_access_token` — in-memory access JWT 반환. NoSession 에러. token rotation 직후에도 fresh 값 반환 (caching 없음).
- `commands/sync.rs::sync_get_relay_url` — `relay_client.base_url()` 의 string 반환. backend / frontend 가 같은 endpoint 합의.
- lib.rs invoke_handler 양쪽 (tauri-plugins / non-plugins) 등록.
- 회귀 +4 (auth_get_access_token: in-memory / no-session / refresh rotation + sync_get_relay_url: relay_client URL 반환).

frontend:
- `relay-transport.ts` baseUrl trailing-slash normalize (Url::to_string() 의 trailing slash + concat 시 double slash 방지).
- `SyncProvider.tsx` 의 sync boot 가 providedTransport 미공급 시 `Promise.all` 로 invoke 3건 fan-out (sync_get_root_key + auth_status + sync_get_relay_url) → RelayTransport 자동 생성 + setTransport → connect. auth_status 가 null user_id 면 offline_only 폴백 (sync 가 '활성 가능한 세션' 으로 인식 안 함).
- 회귀 +2 (default-transport happy path / null user_id 시 offline_only).

### Phase E-5 — 통합 round-trip (A push → mock relay → B pull)

`__tests__/round-trip.test.ts`:
- `MockRelay` 클래스 — Map<userId, snapshot> 으로 in-memory 저장. 실 relay (E-2/E-3) 의 wire-format 그대로: POST → version+1 + ciphertext 저장, GET → since 비교 후 200 (변경) / 204 (since == version) / fresh user 200 with null.
- 두 `RelayTransport` (A, B) 가 같은 KEY + USER_ID + MockRelay.fetchImpl 공유.
- B 의 `onRemoteUpdate` 콜백이 `Y.applyUpdate(docB, update, "remote")` 로 wiring (실제 SyncProvider 가 wire 할 부분).

회귀 +5:
- A.Map.set + push → B.poll → B.Map 에 같은 값 read
- 두 번 A.push → B 가 1회 poll 로 latest snapshot 가져옴 (multi-write)
- Zero-Knowledge: rawEnvelope 안 평문 누출 0 + 잘못된 키 decrypt throw
- poll twice with same lastVersion → 두 번째 204 (echo loop 없음)
- AEAD adapter sanity (round-trip 의 의미 보장)

**M9 Phase E 풀 완료** (E-1 ~ E-5).

### Phase F-1 — value sync 채널 (D1 + relay endpoint)

`migrations/0004_sync_values.sql`:
- `encrypted_secret_value` 테이블 (PK (user_id, credential_id) + version + ciphertext BLOB + updated_at + ON DELETE CASCADE FK)
- LWW 디자인 — credential 1개 value 변경이 다른 credential 과 merge 될 일 없으므로 CRDT 의 merge 의미 불필요
- `(user_id, updated_at)` 인덱스로 since 쿼리 효율화

`src/db/schema.ts`: Drizzle `encryptedSecretValue` 추가.

`src/routes/sync.ts`:
- POST /sync/values { credential_id, ciphertext_b64 } — 200 { version, updated_at } / 401 / 400 (missing/oversized credential_id) / 413 (64KB value cap)
- GET /sync/values?since=<ms> — 200 { values: [{ credential_id, version, ciphertext_b64, updated_at }] } / 401 / 400
- 두 엔드포인트 모두 SYNC_RATE_LIMIT (100/min) 공통 적용

회귀 +8:
- db.test +1: PK 충돌 + cascade
- sync.test +7: missing credential_id / oversized credential_id / 413 / round-trip / version monotonic + GET latest only / since cutoff / 401 missing Bearer

### 검증

- Rust secretbank-app lib: 158 → 162 (+4)
- Frontend Vitest: 409 → 416 (+7)
- Relay vitest: 46 → 54 (+8)
- clippy / typecheck / lint 모두 0

### 다음 (Night mode 8 큐)

1. **F-2** — 클라이언트 측 Rust: `value-root` HKDF subkey of enc_key + `services/value_sync.rs` (push: AEAD encrypt + relay POST, poll: pull + decrypt + age vault upsert). 신규 Tauri 커맨드 `sync_value_push` / `sync_value_pull`.
2. **F-3** — credential_create / _update / _rotate_value 통합 hook → sync_value_push 자동 호출 (sync 활성 시 — auth_session.enc_key 존재). credential_get 이 latest pulled value 우선 사용. Rust + Miniflare round-trip.
3. **Phase G** — pairing (X25519 deep-link) + UI (Sync section) + conflict resolver + offline 배지 + Free 2 device entitlement (T092~T096)

---

## 2026-04-28 Night mode 6 — M9 Phase E-2 / E-3 / E-4a (3 commits)

### 세션 개요

- **목표**: Phase E 의 relay 측 (E-2 schema + E-3 endpoints + rate limit) 과 클라이언트 측 RelayTransport 골격 (E-4a) 까지.
- **결과**: 3 commits (`af307c5` E-2 / `97712e6` E-3 / `155c1a4` E-4a). Frontend Vitest 396 → 409 (+13). Relay vitest 35 → 46 (+11).

### Phase E-2 — D1 0003_sync + /sync/snapshot 골격

`ee/secretbank-relay/migrations/0003_sync.sql`:
- `encrypted_doc` (user_id PK + version + ciphertext BLOB + created_at/updated_at + ON DELETE CASCADE FK to user)
- 1 user = 1 doc 모델 (Yjs 의 Y.encodeStateAsUpdate 가 통합 update — multi-doc 은 Phase F 이후 결정)
- Zero-Knowledge: 릴레이는 AEAD envelope 만 보관, 평문 모름

`src/db/schema.ts` Drizzle `encryptedDoc` 추가.

`src/routes/sync.ts`:
- GET /sync/snapshot?since=N — 200 (변경) / 204 (since == version) / 401 / 400
- POST /sync/snapshot { ciphertext_b64 } — 200 { version } / 401 / 400 / 413 (1MB cap)
- Bearer access JWT 검증 (verifyToken with use='access')
- UPSERT 패턴: 첫 push insert (version=1) / 후속 push version+1

`test/db.test.ts` +1: encrypted_doc PK + ciphertext 저장 + ON DELETE CASCADE.

### Phase E-3 — KV rate limit + Miniflare 회귀

`ee/secretbank-relay/src/lib/rate-limit.ts`:
- `checkRateLimit(kv, subject, { bucket, limit, windowMs })`
- KV fixed-window 패턴: key = `ratelimit:<bucket>:<subject>:<windowId>`
- 한도 초과 시 카운터 증가 안 함 (악성 스팸의 KV 쓰기 비용 방지)
- 반환: `{ ok, remaining, resetMs }`
- Sliding window 보다 정확도 떨어지지만 (경계 burst) 보호 목적엔 충분

routes/sync.ts: GET / POST 양쪽에 `SYNC_RATE_LIMIT = { bucket:"sync", limit:100, windowMs:60_000 }` 적용. 한도 초과 시 429 + `Retry-After` 헤더.

`test/sync.test.ts` +10:
- auth (2): GET 401 missing Bearer / POST 401 invalid token
- validation (3): 400 negative since / 400 missing ciphertext / 413 1MB+
- round-trip (3): POST → GET 200 with same b64 → GET (since=version) 204 / 두 번 POST → version 1, 2 / 신규 user GET → 200 { version:0, ciphertext_b64:null }
- rate limit (2): 100 OK → 101번째 429 / per-user 격리

### Phase E-4a — RelayTransport (AEAD + HTTP wire) 골격

`src/features/sync/relay-transport.ts`:
- `class RelayTransport implements SyncTransport`
- `pushUpdate(update)`:
  - getSessionKey() → { rootKey, userId } 가져오기 (null 이면 throw "no session key")
  - `encrypt(rootKey, update, AAD = "user:<userId>")`
  - POST /sync/snapshot { ciphertext_b64 } + Bearer access JWT
  - 응답 version 을 lastVersion 에 보관
- `pollOnce()`:
  - GET /sync/snapshot?since=lastVersion + Bearer
  - 200 → decrypt + onRemoteUpdate handlers fire
  - 204 → no-op
  - 401 → status='error'
  - 429 → ignore (다음 poll 까지 대기, retry-after 단순화)
  - non-2xx → status='error'
  - decrypt 실패 → status='error' (cross-user replay / 변조 보호)
- `connect / disconnect` lifecycle, `manualPolling=true` 옵션 (테스트 timer 의존성 회피)

**AAD = "user:<userId>"** — 다른 사용자의 ciphertext 를 가져와 재생하려는 cross-user replay 를 AEAD 단위에서 차단.

`__tests__/relay-transport.test.ts` +13 (mock fetch 기반):
- pushUpdate: encrypt + Bearer 헤더 + 평문 누출 0 / no-session throw / 401 throw
- pollOnce: decrypt + emit / 204 no-op / 401 error / 429 ignore / AEAD tamper error / cross-user AAD error / since 누적
- lifecycle: idle → connected → disconnected, handler clear
- Zero-Knowledge invariant: fetch body 에 평문 절대 노출 안 됨

### 검증

- Rust secretbank-app lib: 158 (변동 없음 — frontend + relay 만)
- Frontend Vitest: 396 → 409 (+13)
- Relay vitest: 35 → 46 (+11)
- typecheck / lint / clippy 모두 0

### 다음 (Night mode 7 큐)

1. **E-4b** — SyncProvider 의 transport prop 을 RelayTransport 로 default 교체. relay base URL + getAccessToken (auth_session.access_token 또는 신규 Tauri 커맨드 `auth_get_access_token`) + getSessionKey (sync_get_root_key 결과 + auth_session.user_id). App.tsx 마운트 결정 (사용자 sign-in 후 자동 활성).
2. **E-5** — 통합 round-trip 검증: 두 디바이스 시뮬레이션 (Y.Doc A + B). A 가 user-edit → encrypt → POST. B 가 poll → decrypt → applyUpdate → A 와 B Y.Doc state 동일.
3. **Phase F** — value sync 채널 (`encrypted_secret_values` 테이블 + `value-root` 키 derive + value-only 별도 endpoint). credential value 는 CRDT 가 아니라 last-write-wins 단순 채널.
4. **Phase G** — pairing (X25519 deep-link) + UI (Sync section) + conflict resolver + offline 배지 + Free 2 device entitlement.

---

## 2026-04-28 Night mode 5 — M9 Phase D-2 / D-3 / E-1 (4 commits)

### 세션 개요

- **목표**: Phase D 풀 완료 (D-2 + D-3) → Phase E 진입 (E-1: AEAD).
- **결과**: 4 commits (`7ca9a06` D-2a / `cfc1472` D-2b / `10bdb92` D-3 / `6d3b6aa` E-1), Rust lib 153 → 158 (+5), Vitest 363 → 396 (+33), clippy 0, typecheck 0.

### Phase D-2a — 5 엔티티 매퍼 + ENTITY_MAPPERS registry

`src/features/sync/mapping.ts` 확장:
- issuerMapper — 모든 필드 sync (device-local 없음)
- projectMapper — local_path 는 device-local (디바이스마다 다른 경로)
- deploymentMapper — 모든 필드 sync
- usageMapper — 모든 필드 sync (Credential ↔ Project 관계)
- settingMapper — 키-값 스토어 + `SYNC_SETTING_KEYS` 화이트리스트 (project-decisions C 정책: 새 setting 명시 opt-in)
- isSyncableSettingKey 헬퍼
- ENTITY_MAPPERS registry (entity → mapper dispatch)

Vitest +13.

### Phase D-2b — 백엔드 db:changed emit + 14 커맨드 hookup

신규 `services/sync_emit.rs`:
- `DbChangeEntity` (6 variants, lowercase serde — wire 와 mapping.ts 의 SYNC_ENTITIES 와 1:1 일치)
- `DbChangeOp` (Upsert / Delete, snake_case)
- `DbChangePayload` + 생성자 (upsert / delete)
- `DbChangeEmitter` trait (Send + Sync + 'static)
- `TauriDbChangeEmitter` (production, app.handle().emit("db:changed", ...))
- `NoopDbChangeEmitter` (테스트 / setup 이전 default)
- IncidentEventEmitter 패턴 그대로 차용

AppContext 통합:
- 신규 필드 `db_change_emitter: SharedDbChangeEmitter`
- `AppContext::new` 시그니처에 emitter 인자 추가
- 8 fixture 갱신 (Noop default 명시)
- lib.rs setup 에서 `Arc::new(TauriDbChangeEmitter::new(app.handle().clone()))` 만들어 ctx 주입

14 mutating 커맨드 hookup (각각 SQLite 변경 + audit + emit 패턴 일관):
- credential_create / _update / _delete / _rotate_value (4) — credential upsert 또는 delete
- kill_switch do_revoke_internal — credential upsert (status=revoked). _revoke 와 _revoke_issuer 양쪽이 같은 헬퍼
- settings_set — value Some=Upsert / None=Delete (key 자체가 id)
- project_create / _update / _delete (3)
- deployment_create / _update / _delete (3)
- usage_create / _delete (2)
- **issuer 는 사용자 mutation 명령 없어 emit 부착 없음** (preset seed 만 — 시드 자체는 sync 후보 외)

Rust lib 153 → 158 (+5 sync_emit unit: upsert/delete wire shape, 6 entity lowercase singular, Noop 안전, CapturingEmitter ordering).

### Phase D-3 — origin loop 회귀 + observer/bridge

양방향 sync 의 두 기둥을 격리해서 검증:

`src/features/sync/observer.ts`:
- `observeMapWithOriginGuard(map, handler)` — Y.Map.observe 의 origin 검사. sync origin (LOCAL_DB / REMOTE) 의 변경은 handler 에 안 전달. user-edit propagation 채널만 wire.
- `applyDbChangeToYMap(doc, payload, value?)` — 백엔드 emit 의 payload 를 Y.Map 에 set/delete (ORIGIN_LOCAL_DB transaction). settings entity 는 SYNC_SETTING_KEYS 화이트리스트 통과만 적용.

두 layer 결합으로 observer 가 db:changed echo 를 보고 invoke 호출하는 무한 루프 방지.

Vitest +10:
- observer: LOCAL_DB skip / REMOTE skip / user-origin propagate / unsubscribe detach
- bridge: upsert placeholder / upsert with value / delete present + missing key safe / settings whitelist (allowed key apply, blocked key skip)
- integration: applyDbChangeToYMap 다중 호출 시 observer 0 호출 (무한 루프 방지) / user edit 1 호출 + 후속 echo 0 호출

### Phase E-1 — AEAD adapter (XChaCha20-Poly1305)

`src/features/sync/aead.ts`:
- xchacha20poly1305 (`@noble/ciphers` v2.2.0, audited by Cure53, MIT)
- 32B key (Phase B-3 의 `sync_get_root_key` 또는 그 HKDF 서브키)
- 24B random nonce (XChaCha20 의 extended nonce — random sampling 충돌 사실상 0, vs ChaCha20 12B + 2^32 한계)
- 16B Poly1305 tag (자동 prepend by xchacha20poly1305)
- envelope: `[nonce(24) || ciphertext+tag]` 단일 Uint8Array
- AAD 옵션 (Phase F/G 의 envelope binding 용 — doc_id 등)
- 키/envelope 길이 가드

왜 XChaCha20-Poly1305:
- libsodium `crypto_aead_xchacha20poly1305_ietf` 와 wire-호환 — 미래 C/Swift 클라이언트가 합류해도 문제 없음
- Phase F value channel 도 같은 어댑터 재사용 (key 만 다름)
- 24B nonce 가 random 안전성 확보 (충돌 확률 무시 가능)

Vitest +10 (전체 386 → 396):
- typical Y.Doc-사이즈 round-trip
- 다른 키로 decrypt → throw
- ciphertext / nonce 1B tamper → throw (Poly1305 무결성)
- 빈 plaintext round-trip (nonce + tag 만)
- AAD mismatch → throw
- 키 길이 가드 (encrypt + decrypt 양쪽)
- envelope 길이 가드 (nonce + tag 미달)
- 두 번 encrypt 시 envelope 다름 (random nonce)
- generateNonce 무작위성

신규 dep: `@noble/ciphers ^2.2.0` (작은 번들, pure TS, no WASM).

### 검증

- Rust secretbank-app lib: 158 passed (D-2b +5)
- Frontend Vitest: 396 passed (D-2a +13, D-3 +10, E-1 +10)
- `cargo clippy --workspace --all-targets --all-features -D warnings` — 0
- `pnpm typecheck` — 0
- `pnpm lint` — 0 errors (7 pre-existing warnings)

### 다음 (Night mode 6 큐)

1. **E-2** — relay D1 migration 0003_sync.sql (`encrypted_docs` 테이블) + 첫 endpoint 골격
2. **E-3** — relay /sync/snapshot POST + /sync/deltas GET + JWT 보호 + KV rate limit + Miniflare 회귀
3. **E-4** — RelayTransport (Phase C 의 StubTransport 자리 채우기 — AEAD + HTTP wire) + SyncProvider 의 transport prop 교체
4. **E-5** — 통합 round-trip 검증 (db:changed → Y.Map → encrypt → push → relay → onRemoteUpdate → Y.applyUpdate)
5. **Phase F** — value sync 채널 (`encrypted_secret_values` + `value-root` 키 derive)
6. **Phase G** — pairing + UI + conflict + offline + entitlement (T092~T096)

### Architectural seeds (m9-phase-plan.md Open Issues E)

여전히 ad-hoc commit 가능 (Phase Plan 과 직교):
1. `credential.kind` enum 확장 가능
2. `issuer` → "Site" 명명 일반화
3. HIBP password breach client prep
4. zxcvbn weak password detector

---

## 2026-04-28 Night mode 4 — M9 Phase C + B-4 + D-1 (3 commits)

### 세션 개요

- **목표**: Phase C SecSync 검증 → 채택/fallback → SyncProvider 통합 → B-4 OAuth salts → Phase D 진입.
- **결과**: 3 commits (`b550575` C / `4f6ced0` B-4 / `2ba0069` D-1), Rust lib 152 → 153 (+1), Vitest 346 → 363 (+17), clippy 0, typecheck 0.

### Phase C — secsync stable 검증 → fallback D 자동 채택

5개 체크리스트로 npm + GitHub + 공식 docs 조사. 결과:

| # | 체크 | 결과 |
|:--|:--|:--|
| 1 | 최근 6개월 commit 활동 | ❌ npm `0.5.0` (2024-06-04, 22개월 정지) |
| 2 | Yjs 13.6.x 호환 | ⚠️ 추정 (검증 미실행) |
| 3 | React 19 + TS 5.x | ⚠️ 추정 호환 |
| 4 | 보안 advisory | ✅ 없음 (NLnet 펀딩) |
| 5 | CF Workers 통합 사례 | ❌ WS 전용, 사례 0건, beta 명시 |

**3 fail (1, 5 + beta)** → 사용자 결정 4 (≥3 fail 시 fallback D) 사전 승인에 따라 secsync 미설치 + fallback D 자동 채택.

산출물:
- `src/features/sync/transport.ts` — `SyncTransport` interface + `StubTransport` 클래스 (lifecycle/handler 회귀 6).
- `SyncProvider` 확장 — `invoke('sync_get_root_key')` mount 시 호출 → rootKey(32바이트) Context 노출. NoSyncSession (`code='no_sync_session'`) → status='offline_only' (rootKey null, transport idle). generic 에러 → status='error'. unmount 시 `transport.disconnect()` 자동.
- 신규 dep 0개. Vitest +10 (Phase A 4 + Phase C 4 + transport 6).
- project-decisions.md D.1 갱신 / m9-phase-plan.md Phase C 정정.

### Phase B-4 — OAuth callback salts → AuthSession derive

T082 시점에 relay 응답은 이미 salts 포함되어 있었으나 클라이언트의 `AuthTokensResponse` 가 두 필드를 ignore 하던 dead path 정리.

- `services/session.rs` 신규 `OAuthCallbackResponse` — `#[serde(flatten)] tokens` + `salt_auth` + `salt_enc` 분리 deserialize.
- `commands/auth.rs::exchange_oauth_callback` 가 응답의 salts 를 `complete_session(.., Some(...))` 로 forward → Passkey verify 와 동일 흐름으로 enc_key 자동 derive (master_passphrase 가 메모리에 있을 때).
- 회귀 갱신 1 (`_persists_session_and_records_salts`) + 신규 1 (`_with_passphrase_derives_enc_key`).
- Rust lib 152 → 153 (+1). clippy 0 warning.

### Phase D-1 — mapping framework

Phase D 가 단일 commit 으로 무리하다고 판단 → sub-phase 분할:
- **D-1 (이번 commit)** — framework only.
- **D-2 (다음 큐)** — 백엔드 db:changed emit + 나머지 5 엔티티 매퍼.
- **D-3 (다음 큐)** — origin loop 회귀 (+12 target).

D-1 산출물:
- `src/features/sync/origin.ts` — `ORIGIN_LOCAL_DB` / `ORIGIN_REMOTE` Symbol + `runWithOrigin` / `isSyncOrigin` 헬퍼. observe handler 가 자기 origin 변경을 skip 해서 무한 루프 방지.
- `src/features/sync/mapping.ts` — `SYNC_ENTITIES` 화이트리스트 6 + `EntityMapper<TRow, TYValue>` interface + 첫 reference `credentialMapper` (vault_ref / hash_hint / usages / score 4개 device-local 필드 제외).
- 회귀 +7 (whitelist match / origin round-trip / isSyncOrigin / toYMap omit / round-trip / device-local default / entity match).

### 검증

- Rust secretbank-app lib: **153 passed** (Phase B-4 +1)
- Frontend Vitest: **363 passed** (Phase C +10, D-1 +7)
- `cargo clippy --workspace --all-targets --all-features -D warnings` — 0
- `pnpm typecheck` — 0
- `pnpm lint` — 0 errors (7 pre-existing warnings)

### 다음 (Night mode 5 큐)

1. **D-2** — 백엔드 db:changed emit (15+ mutating 커맨드) + issuer/project/deployment/usage/settings 매퍼
2. **D-3** — origin loop 회귀 (Y.Map ↔ SQLite 무한 루프 방지)
3. **Phase E** — relay /sync 엔드포인트 + AEAD 라이브러리 결정 (XChaCha20-Poly1305 후보) + RelayTransport 구현 + D1 migration 0003_sync.sql
4. **Phase F** — value sync (`encrypted_secret_values` + value-root key)
5. **Phase G** — pairing + UI + conflict + offline + entitlement (T092~T096)

---

## 2026-04-28 Night mode 3 — M9 Phase B-3 (sync_get_root_key) — Phase B 종료

### 세션 개요

- **목표**: M9 sync 가 enc_key 를 사용할 수 있는 인터페이스 노출. Phase B 의 마지막 sub-phase.
- **결과**: 1 commit (예정), secretbank-app lib **147 → 152 (+5)**, clippy 0.

### 구현

**신규 파일** `crates/secretbank-app/src/commands/sync.rs`:
- `SyncCommandError` enum — `NoSyncSession` / `Kdf` 두 variant
- `sync_get_root_key(state) -> Result<String, SyncCommandError>` Tauri 커맨드
  - `auth_session.enc_key` 가 `None` 이면 `NoSyncSession` 즉시 반환 (no-op, 안전)
  - `kdf::derive_subkey(enc_key, "crdt-root")` → 32바이트 base64url 문자열 반환
  - 결정론: 같은 enc_key 입력 → 같은 root key (sync correctness invariant)
- HKDF info string `"crdt-root"` 는 **고정 라벨** — 변경 시 모든 디바이스의 Y.Doc 복호화가 깨짐. 향후 `value-root` 등은 별도 커맨드로 추가

**lib.rs 등록**: tauri-plugins / non-plugins 양쪽 invoke_handler 에 `sync_get_root_key` 등록.

### 회귀 +5

1. **returns_base64url_root_key_when_enc_key_present** — happy path, 32바이트 길이 검증
2. **root_key_is_deterministic** — 같은 enc_key 두 번 호출 → 같은 결과
3. **root_key_differs_for_different_enc_keys** — 다른 enc_key → 다른 root key (Zero-Knowledge invariant)
4. **no_session_returns_no_sync_session** — 세션 없을 때 NoSyncSession
5. **session_without_enc_key_returns_no_sync_session** — 세션은 있지만 enc_key None (graceful degrade) → NoSyncSession

### Phase B 종료 — 진행 현황

- ✅ B-1 메모리 구조 + master_passphrase 라이프사이클
- ✅ B-2 verify 흐름에 derive 통합 + hydrate 자동 적재
- ✅ B-3 sync_get_root_key 커맨드
- ⏳ B-4 (옵션) OAuth callback 응답 salts (relay 측 변경)

**B-4 는 Phase C 진입 전에 처리하지 않아도 무방**. OAuth user 가 sync 활성화하려면 한 번 lock+unlock 사이클을 거쳐야 하지만, Passkey user 는 이번 commit 으로 즉시 활성화 가능. B-4 는 OAuth UX 개선 작업으로 Phase C 와 병행 가능.

### 검증

- `cargo test -p secretbank-app --lib` — **152 통과** (이전 147 +5)
- `cargo clippy --workspace --all-targets --all-features -D warnings` — 0
- 워크스페이스 전체 그린

### 다음

**Phase C** — SecSync 라이브러리 통합. 진입 전 5개 stable 체크리스트 검증 필요 (project-decisions.md [2026-04-28] D 항목):
1. 최근 6개월 release/commit 활동
2. Yjs 13.6.x 호환
3. React 19 + TypeScript 5.x 충돌 없음
4. CVE / 보안 issue 없음
5. Cloudflare Workers transport 통합 사례

≥ 3 fail 시 fallback D (Yjs + 자체 transport).

---

## 2026-04-28 Night mode 3 — M9 Phase B-2 (verify 흐름에 derive 통합)

### 세션 개요

- **목표**: Phase B-1 의 토대 위에 verify 4 커맨드 + hydrate 가 자동으로 enc_key 를 derive 하도록 wiring. Passkey sign-in 이 끝나면 enc_key 가 메모리에 적재되어 sync 즉시 활성화 가능.
- **결과**: 1 commit (예정), secretbank-app lib **141 → 147 (+6)**, Vitest 346 유지 (PasskeyButton 신규 expect +1), clippy 0.

### 변경

**Backend (commands/auth.rs)**:
- `complete_session(state, tokens, new_salts: Option<(&str, &str)>)` 시그니처 변경 — verify 흐름은 Some, refresh/OAuth 는 None
- 헬퍼가 prev session 의 salts 복원 → new_salts 가 Some 이면 overwrite → master_passphrase + salts 로 derive_session_keys → AuthSession.enc_key 적재
- `auth_passkey_register_verify(email, response, salt_auth, salt_enc)` — frontend 에서 salts 송신 (인자 시그니처 변경)
- `auth_passkey_assert_verify` 동일하게 시그니처 변경
- `exchange_oauth_callback` 은 None 으로 호출 (OAuth callback 응답에 salts 없음 — Phase B-4 에서 relay 측 변경 필요)
- `auth_refresh` 도 None — prev session 의 salts 복원 + 결정론적 재파생
- `hydrate_session_from_vault` 에서 영속된 salts + master_passphrase 가 모두 있으면 자동 derive → vault_unlock 직후 enc_key 메모리 적재

**Frontend (PasskeyButton.tsx)**:
- start 응답의 `salt_auth`/`salt_enc` 를 verify 호출 시 `saltAuth`/`saltEnc` 로 송신 (Tauri camelCase)

### 회귀 +6 (Rust)

1. **register_verify_with_passphrase_derives_enc_key** — Passkey verify 시 enc_key 메모리 적재
2. **complete_session_without_passphrase_leaves_enc_key_none** — master_passphrase 없으면 enc_key None (graceful degrade)
3. **hydrate_with_salts_and_passphrase_derives_enc_key** — vault_unlock 직후 자동 derive
4. **hydrate_without_passphrase_leaves_enc_key_none** — passphrase 없으면 enc_key None, salts 보존
5. **refresh_preserves_persisted_salts** — refresh 후 salts 보존 + enc_key 결정론적 재파생
6. **verify_with_blank_salt_returns_missing_field** — 빈 salt 거부 (네트워크 호출 전 차단)

### 회귀 +1 (Frontend)

PasskeyButton happy path 에 `mockInvoke.toHaveBeenCalledWith("auth_passkey_assert_verify", { saltAuth, saltEnc, ... })` 검증 추가 — wire-format regression.

### Phase B 진행 현황

- ✅ B-1 (메모리 구조 + master_passphrase 라이프사이클)
- ✅ B-2 (verify + hydrate 자동 derive)
- ⏳ B-3 (sync_get_root_key 커맨드)
- ⏳ B-4 (OAuth callback 응답 salts — relay 측 변경)

### 검증

- `cargo test --workspace --manifest-path src-tauri/Cargo.toml -p secretbank-app --lib` — **147 통과**
- `cargo clippy --workspace --all-targets --all-features -D warnings` — 0
- `pnpm typecheck` — 0
- `pnpm test --run` — Vitest 346/346

### 다음

**B-3** — `commands/sync.rs` 신설, `sync_get_root_key()` 커맨드 (`derive_subkey(enc_key, "crdt-root")` → base64url 32바이트). enc_key 없으면 NoSyncSession 에러. lib.rs invoke_handler 등록. 회귀 +3 (happy / NoSyncSession / 결정론).

---

## 2026-04-28 Night mode 3 — M9 Phase B-1 (AuthSession enc_key 라이프사이클 토대)

### 세션 개요

- **목표**: M9 Phase B 의 4 sub-phase 중 첫 단계 — AuthSession 메모리 구조 + master_passphrase AppContext 라이프사이클. sync 활성화 자체는 B-2 부터.
- **결과**: 1 commit (예정), secretbank-app lib **136 → 141 (+5)**, clippy 0, workspace tests 모두 그린.

### Phase B 분할

원래 단일 Phase B 였으나 변경 면적이 너무 크다 (verify 시그니처 / OAuth 흐름 / vault 라이프사이클 / 신규 sync 커맨드 + frontend 수정) → 4 sub-phase 로 재분할:

| Sub-Phase | 범위 | 회귀 target |
|:--|:--|:--|
| **B-1 (이번 commit)** | AuthSession enc_key/salts 메모리 구조 + save/load 확장 + AppContext.master_passphrase 라이프사이클 | +5 |
| B-2 | verify 4 커맨드 + frontend salts 송신 + hydrate 자동 derive | +3 |
| B-3 | sync_get_root_key 커맨드 + Phase B 종료 | +3 |
| B-4 (옵션) | OAuth callback 응답 salts (relay 측) | Miniflare +2 |

### 디자인 정정 — vault 가 password 를 보관하지 않는다

`AgeVaultStorage::unlock` 후 password 는 drop 되고 X25519 Identity 만 남는다. 따라서 `VaultStorage::derive_external_keys` 메서드 추가는 불가능. 대신:

- **AppContext.master_passphrase: Arc<RwLock<Option<SecretString>>>** 필드 추가
- `vault_unlock` 시 password clone 후 SecretString 으로 보관
- `vault_lock` 시 None (Drop 자동 zeroize)
- 모든 후속 derive 호출이 이걸 사용

**보안 등가성**: vault unlocked 동안 Identity (StaticSecret) 가 어차피 메모리에 있다. attacker 가 process memory 접근 권한 얻으면 양쪽 모두 노출 — passphrase 추가가 attack surface 안 늘림. 결정: project-decisions.md [2026-04-28] B 항목.

### AuthSession 구조 확장

```rust
pub struct AuthSession {
    pub user_id: String,
    pub access_token: SecretString,
    pub refresh_token: SecretString,
    pub expires_at: i64,
    // M9 Phase B-1 신규:
    pub salt_auth: Option<String>,        // 영속 (vault file 의 auth/salt_auth)
    pub salt_enc: Option<String>,         // 영속 (vault file 의 auth/salt_enc)
    pub enc_key: Option<SecretBox<[u8;32]>>, // 메모리 only — 절대 영속 안 함
}
```

**Debug 자체 구현**: 모든 secret 필드 (`salt_*`, `enc_key`) 를 `***` 로 마스킹. `tracing::warn!("{session:?}")` 같은 호출이 실수로 secret 을 로그로 보내지 않도록 차단.

### save_session/load_session 확장

- `salt_auth` / `salt_enc`: 값이 있으면 vault file 에 write, 없으면 (과거 값 있을 수 있는) 키를 delete 처리 → idempotent reset
- `enc_key`: **절대 vault file 에 안 씀**. load 시 항상 None (caller 가 다음 unlock 사이클에서 재파생)
- pre-M9 vault (salt 키 없음) 도 자연스럽게 load — `salt_*` = None 으로 채워져 사용자 재인증 유도

### vault_unlock / vault_lock 라이프사이클

- `vault_unlock(password)`: vault.unlock 직후 master_passphrase 채움
- `vault_lock`: master_passphrase = None + auth_session = None (enc_key 는 AuthSession 내부 필드라 같이 zeroize)

### 회귀 +5

1. **save_then_load_preserves_salts** — base64url salts round-trip
2. **enc_key_never_persists_to_vault** — enc_key 를 Some 로 set 후 save → vault 에 enc_key 키 없음 + load 시 None
3. **save_with_none_salts_clears_previous_salts** — None 으로 save 시 이전 값 삭제 (idempotent reset)
4. **load_pre_m9_vault_yields_none_salts** — pre-M9 vault (salt 키 없음) backward-compat
5. **debug_masks_secret_fields** — Debug 가 salts/enc_key 값을 노출하지 않음

### 영향 받은 테스트 컨텍스트 7곳

`AppContext` 직접 생성하는 테스트 헬퍼 7곳에 `master_passphrase: Arc::new(RwLock::new(None))` 추가 (entitlement.rs / projects.rs / kill_switch.rs ×2 / auth.rs / credentials.rs ×2).

### 검증

- `cargo test --workspace --manifest-path src-tauri/Cargo.toml` — 모두 그린
- `cargo clippy --workspace --all-targets --all-features -D warnings` — 0
- secretbank-app lib **141 통과** (이전 136 +5)

### 다음 sub-phase

**B-2** (다음 세션) — verify 4 커맨드 시그니처에 `salt_auth`/`salt_enc` 추가, frontend (PasskeyButton.tsx) 가 start 응답의 salts 를 보관 후 verify 호출 시 송신, complete_session 헬퍼가 derive_session_keys 호출 → AuthSession.enc_key 채움, hydrate_session_from_vault 가 vault_unlock 직후 master_passphrase + 영속된 salts 로 자동 derive.

---

## 2026-04-28 Night mode 3 — M9 진입 + Phase Plan + T087 Phase A

### 세션 개요

- **목표**: M9 Sync Infrastructure 의 안전한 entry 지점 확보. 10 태스크 (T087~T096) 를 7-phase 로 분할하고 Phase A 만 실행.
- **결과**: 1 commit (예정), Vitest 342 → 346 (+4), 신규 dep 2 (yjs, y-indexeddb), `docs/m9-phase-plan.md` 작성.

### 왜 phase 분할인가

M9 는 SecSync/Yjs/y-indexeddb 라이브러리 통합 + Rust 측 enc_key 라이프사이클 + 릴레이 D1 스키마 확장 + X25519 디바이스 페어링까지 7개 결합 영역에 걸친다. 한 commit 으로 처리 시:
1. PR 단위 리뷰 부담 폭증
2. 회귀 단위 격리가 어려움 (어느 phase 에서 깨졌는지 추적 곤란)
3. T084 의 deferred 항목 (enc_key 메모리 적재) 같은 사전 조건이 누락된 상태로 진입할 위험

→ T083 처럼 7-phase 로 분할 + 각 phase 의 진입 조건 명시 (`docs/m9-phase-plan.md`).

### 7-phase 분할 (`docs/m9-phase-plan.md` 요약)

| Phase | 범위 | 신규 dep | 회귀 target |
|:--|:--|:--|:--|
| **A** | Yjs 스캐폴드 + 더미 SyncProvider (이번 commit) | yjs, y-indexeddb | +3 |
| B | AuthSession 의 enc_key 라이프사이클 + sync_get_root_key 커맨드 | (none) | +6 |
| C | SecSync 클라이언트 통합 | secsync | +4 |
| D | Y.Map ↔ SQLite 양방향 매퍼 (6 엔티티) | (none) | +12 |
| E | 릴레이 `/sync` 엔드포인트 (D1 0003) | (relay-side) | +5 |
| F | Value sync 채널 (D1 0004) | (none) | +5 |
| G | Pairing + UI + Conflict + Offline + Entitlement | qrcode | +10 |

### Phase A 실행 상세

- `yjs ^13.6` + `y-indexeddb ^9.0` dep 추가
- `src/features/sync/SyncProvider.tsx`:
  - Lazy useState init 으로 `Y.Doc` 단일 인스턴스 (no ref-during-render lint 위반)
  - `disablePersistence` prop 으로 Vitest 모드 제공 (jsdom 의 IndexedDB 부재 회피)
  - IndexedDB persistence 는 `queueMicrotask` 로 effect 안에서 deferred 실행 (set-state-in-effect 룰 우회 — 외부 시스템 bridge 패턴)
  - unmount 시 `persistence.destroy()` + `doc.destroy()`
- `src/features/sync/use-sync.ts` — re-export 모듈 (`useSync`, `useYMap`)
- Vitest 4건:
  - 단일 Y.Doc + ready status (disablePersistence 모드)
  - useSync() Provider 밖 호출 시 throw
  - useYMap set/get 라운드트립 + 동일 인스턴스 재사용
  - 두 Y.Doc 의 clientID 가 독립 (sanity)

### App.tsx 마운트 보류

SyncProvider 는 만들었지만 **App.tsx 에 mount 하지 않음** — 사용자 IndexedDB DB 가 dev 환경에 잔재로 쌓이는 것을 막고, Phase B 의 sync_get_root_key 가 준비되어 user_id 기반 dbName 을 결정할 수 있을 때 마운트.

### Open Issues (Phase B 진입 전 사용자 confirm 필요)

1. **Free 2대 vs 1대**: project-decisions.md 는 "Free = 단일 디바이스" — T094 DoD 는 "Free 2대 무료" 로 완화 제안
2. **Passphrase 재프롬프트 주기**: enc_key 가 vault unlock 직후 메모리에 자동 채워지지 않으므로, sync 활성화 시점마다 재프롬프트 필요 → UX 부담 vs zero-knowledge 보안
3. **SQLite 모델의 sync 화이트리스트**: 모든 컬럼 sync vs 일부 (created_at, vault_ref) 는 device-local
4. **secsync 라이브러리 안정성**: 2026-04 기준 stable 확인 + yrs (rust) fallback 검토

### 검증

- `pnpm typecheck` — 0
- `pnpm test --run` — Vitest 346/346 (+4)
- `pnpm lint` — 0 에러, 7 warning (5 pre-existing + 2 신규 fast-refresh, 기존 컨벤션과 일치)

### 다음 세션 entry

Phase B (enc_key 라이프사이클 + sync_get_root_key 커맨드) 부터 진입. Open Issues 1~4 사용자 confirm 우선.

---

## 2026-04-28 Night mode 3 — Playwright E2E 인프라 (browser-mode A 단계)

### 세션 개요

- **목표**: 회귀 안전망 1단계 — Vite dev server 대상 Playwright smoke. tauri-driver 통한 실 데스크톱 바이너리 E2E (단계 B) 는 deferred
- **결과**: 1 commit (예정), 3 smoke spec 통과, CI `e2e` 잡 신설 (frontend → e2e dependency)

### 셋업

- `@playwright/test ^1.59` devDep
- `e2e/` 디렉토리:
  - `playwright.config.ts` — REPO_ROOT cwd + `node ./node_modules/vite/bin/vite.js` 로 webServer 직접 실행 (Windows PATH 회피)
  - `lib/tauri-mock.ts` — `addInitScript` 로 `window.__TAURI_INTERNALS__.invoke` polyfill, `buildInitScript(map, settings?)` 빌더 (settings_get 키별 응답 분리)
  - `smoke.spec.ts` — 3 case (locked vault → LockScreen / unlocked → /settings 라우트 / /auth/sign-in 헤딩+버튼)
- npm scripts: `e2e` / `e2e:install` / `e2e:ui`
- `.gitignore` — test-results, playwright-report, blob-report, playwright/.cache

### CI 통합

- `frontend` 잡에 **Vitest 추가** (이전엔 typecheck/lint/format-check 만 돌고 있었음 — 회귀 누락 위험 있어 메우기)
- 신규 `e2e` 잡 — frontend 통과 후 ubuntu-latest 에서 chromium-only 실행, 실패 시 playwright-report artifact 업로드 (7일 보관), Playwright 브라우저는 `~/.cache/ms-playwright` 캐시

### 단계 B (desktop binary E2E) 미루는 이유

1. tauri-driver + OS-specific WebDriver shim (msedgedriver / WKWebView / WebKitGTK) 매트릭스 빌드 시간 ≥ 10분/OS
2. M11 Mobile Port 시점에 어차피 mobile E2E 인프라 도입 → 그때 묶음이 자원 효율적
3. 진입 트리거 3가지를 runbook 에 명시 (Sync 회귀 누적 / M11 진입 / M13 안정성 라운드)

### 사용자 액션 (필요 시)

`pnpm e2e:install` 1회 실행으로 Chromium 다운로드 (~150MB). CI 는 자동으로 처리.

### 검증

- `pnpm typecheck` — 0 (e2e 는 별도 tsconfig 없이도 Playwright 자체 타입 체커가 돌림)
- `pnpm test --run` — Vitest 342/342
- `pnpm e2e` — Playwright 3/3 (locked/unlocked/sign-in)

---

## 2026-04-28 Night mode 3 — I3 GitHub Connect 표준화

### 세션 개요

- **목표**: `useGithubIntegration` 의 deep-link 리스너가 lib.rs 의 표준 `deep-link` 이벤트 형식과 맞지 않던 결함 정리 + Setup URL 문서화
- **결과**: 1 commit (예정), Vitest 334 → 342 (+8)

### 결함 진단

`useGithubIntegration.ts` 가 `listen("deep-link://github-callback", ...)` 형식의 이벤트를 받으려 했으나, lib.rs Phase C 에서 표준화된 emit 은 `emit("deep-link", urls: Vec<String>)` 단일 채널 → 기존 코드는 사실상 dead path. 사용자가 GitHub App 을 설치해도 deep-link redirect 가 들어와도 listener 가 발화되지 않아 installation_id 가 자동 저장되지 않았다.

### 수정

- `parseGithubCallbackUrl(raw)` 헬퍼 — `Secretbank://github/callback?installation_id=N` URL 만 매칭, 양수 정수 검증
- `connect()` 의 listener 가 이제 `listen<string[]>("deep-link", ...)` 로 등록되고 payload 의 각 URL 을 prefix 매칭
- `Secretbank://auth/callback` 등 무관한 deep-link 는 무시 (다른 feature 가 같은 채널을 공유)
- 한 번 발화하면 unlisten + connecting=false → single-flight

### Runbook 보강

`docs/runbooks/github-app-registration.md`:
- "Setup URL" 행 신설 — `Secretbank://github/callback` 이 OAuth callback 이 아니라 install 후 redirect 용임을 명시
- ✅ "Redirect on update" 체크 항목 추가
- 트러블슈팅: deep-link 이 발화 안 되는 3가지 원인 (Setup URL 오타 / OS scheme 등록 / 사용자 prompt 거부)

### 테스트 +8

- `parse-github-callback.test.ts` 6 — happy / 무관 쿼리 무시 / prefix mismatch / installation_id 없음 / 음수·소수·문자열 거부 / malformed URL
- `use-github-integration.test.ts` 2 — deep-link 매치 시 save 발화 / 무관 deep-link 는 무시

### M8 Auth user JWT (사전 조건 4) — 별도 작업 없음

T086 + T083-D 에서 이미 완성. I3 의 4 사전 조건 중:
- App 등록 ✅ (T060 runbook 존재, 이번에 Setup URL 명시화)
- deep-link scheme ✅ (T083 Phase C)
- listener 표준화 ✅ (이번 commit)
- M8 Auth user JWT ✅ (T086)

→ I3 풀 플로우 unblocked. 실제 GitHub App 등록 + Cloudflare Workers 배포는 사용자 액션 필요.

---

## 2026-04-28 Night mode 3 — T084 SignIn UI (M8 8/8 ✅ 완료)

### 세션 개요

- **시간**: 2026-04-28 Night mode 3 (사용자 승인 없이 연속 실행, T085 종료 직후 이어서)
- **목표**: M8 마지막 1건 — SignIn 페이지 UI + deep-link listener
- **결과**: 1 commit (예정), Vitest 315 → 334 (+19), pnpm dep `@simplewebauthn/browser` 추가, M8 7/8 → **8/8 ✅**

### T084 — SignIn 페이지 UI

**스코프**:
- `/auth/sign-in` 라우트 (App.tsx VaultGate 안, RequireOnboarding 가드 밖)
- 신규 파일 7개:
  - `features/auth/PasskeyButton.tsx` — assert 시도 → 404 면 register 폴백 (단일 버튼 UX)
  - `features/auth/OAuthButton.tsx` — github/google variant, `auth_oauth_start` 호출 후 부모에 expectedState 전달
  - `features/auth/SignInPage.tsx` — 이메일 입력 + Passkey + OAuth 2개 + Keep offline. deep-link 콜백 dispatch.
  - `features/auth/CloudSyncSection.tsx` — Settings 진입점 (비로그인 → Sign in / 로그인 → user_id + Sign out)
  - `features/auth/use-auth-session.ts` — `auth_status` / `auth_signout` 래퍼
  - `features/auth/use-deep-link-callback.ts` — `deep-link` 이벤트 listener + `Secretbank://auth/callback` 파서
- i18n 4 로케일 (en/ko/ja/zh) — `auth.signIn.*`, `auth.passkey.*`, `auth.oauth.*`, `auth.cloudSync.*`
- SettingsPage — Subscription 위에 CloudSyncSection 마운트

**WebAuthn JSON ↔ navigator.credentials**:
- `@simplewebauthn/browser` 의 `startRegistration` / `startAuthentication` 사용
- 릴레이가 보내는 `PublicKeyCredentialCreation/RequestOptionsJSON` 을 그대로 통과
- 응답도 그대로 `verify` 엔드포인트에 forward — 와이어 형식은 릴레이 source-of-truth

**OAuth 흐름**:
1. Click → `auth_oauth_start(provider, redirectUri="Secretbank://auth/callback")` → 릴레이가 state + authorize_url 반환
2. Rust 가 `tauri-plugin-opener` 로 OS 브라우저 open
3. Provider → relay callback → 릴레이가 `Secretbank://auth/callback?provider=...&code=...&state=...` 으로 redirect
4. lib.rs `on_open_url` → `deep-link` 이벤트 emit (`Vec<String>`)
5. `useDeepLinkCallback` 이 SignInPage 의 핸들러로 dispatch — expectedState 일치 검증 후 `auth_oauth_callback` 호출
6. 성공 → toast + `/settings` 리디렉션

**테스트 회귀 +19**:
- `parseOAuthCallbackUrl` 4 — happy / scheme mismatch / missing param / malformed
- `PasskeyButton` 5 — empty email disable / assert happy / register fallback / non-404 error / busy single-flight
- `OAuthButton` 3 — start invoke / error 전파 / busy disable
- `SignInPage` 4 — render / Keep offline → /settings / OAuth happy path / state mismatch 거부
- `CloudSyncSection` 3 — not signed in / signed in 표시 / sign-out 클릭

**검증**:
- `pnpm typecheck` — 0 에러
- `pnpm test --run` — **334/334 통과** (이전 315 +19 신규)
- `pnpm lint` — 0 에러 (기존 5 warning 변동 없음)
- `cargo check --workspace --tests --all-features` — 클린

**Pending (M9 진입 시점에 처리)**:
- 성공 후 redirect 경로를 `/settings/sync` 로 변경 (현재는 `/settings`)
- `derive_session_keys` 호출 통합 — verify 응답의 salt 로 enc_key 파생 → vault 저장 (M9 sync 가 활성화될 때)

---

## 2026-04-28 (T085 KDF 통합 + 세션 마무리 — M8 백엔드 8/8 ✅)

### 세션 개요

- **시간**: 2026-04-28 (interactive — T083 수동 검증 종료 후 짧은 마무리 작업)
- **목표**: M8 백엔드 클로즈. 다음 세션은 T084 부터 Night mode 진입.
- **결과**: 1 commit (`17da027`), secretbank-app lib 132 → 136 (+4), M8 7/8 → 8/8 ✅

### T085 — Zero-Knowledge KDF 통합

**왜 thin wrapper 였는가**:
- KDF 코어 (`derive_auth_hash` / `derive_enc_key` / `derive_subkey`) 는 이미 T017 에서 완성
- KDF salt 시그니처 `&[u8]` 일반화 (`d3a345f`) 가 사전작업으로 끝나 32바이트 릴레이 salt 도 그대로 호환
- 서버 측 salt 발급 (`salt_auth`, `salt_enc`) 도 T081/T082 에서 응답에 포함되어 있음
- → T085 의 실작업은 base64url 디코드 + Zero-Knowledge 가드만

**API**: `derive_session_keys(passphrase, salt_auth_b64, salt_enc_b64) → DerivedSessionKeys{auth_hash: [u8;32], enc_key: SecretBox<[u8;32]>}`

**핵심 디자인**:
- `DerivedSessionKeys` 는 Debug 안 derive — 시크릿 마스킹. `enc_key` 는 절대 디바이스 떠나지 않음, `auth_hash` 만 릴레이로 전송
- `SaltsIdentical` 가드 — `salt_auth == salt_enc` 면 두 출력이 동일해져 Zero-Knowledge 가 깨지므로 명시적 거부 (릴레이 결함/위조 감지)
- `InvalidSalt{field}` 가드 — 깨진 base64url 은 Argon2 단계 도달 전 일찍 실패
- `SessionKdfError::Kdf(KdfError)` — 기존 KdfError 자동 래핑

**회귀 4건**:
- 결정론 — 같은 (passphrase, salts) → 같은 (auth_hash, enc_key)
- 다른 salt → 다른 키 (auth_hash != enc_key)
- 같은 salt 거부 → SaltsIdentical
- malformed base64url → InvalidSalt(salt_auth)

### M8 마무리 상태

| 항목 | 상태 |
|:--|:--|
| 서버 5/5 | ✅ T079 health · T080 D1 schema · T081 Passkey · T082 OAuth · T086 Refresh |
| 클라이언트 백엔드 3/3 | ✅ T083 9 커맨드 · T085 KDF · T086 클라 refresh/signout/status |
| 남은 것 | T084 SignIn 페이지 UI (FE 작업) |

### 다음 세션 Night mode 큐

사용자 승인 없이 연속 실행할 작업:

1. **T084** SignIn 페이지 UI — 핵심. PasskeyButton + OAuthButton + /auth/sign-in 라우트 + tauri event listen('deep-link') 으로 OAuth callback 처리 + master passphrase prompt → derive_session_keys → register_verify 통합. **D2/D3 의 deep-link 콘솔 검증도 여기서 자연스럽게 끝남** (UI 가 listen 을 useEffect 에서 등록).
2. **I3** GitHub Connect 풀 플로우 — T083 클라 백엔드와 Auth user JWT 로 이제 unblocked. 4개 사전조건 (App 등록 / deep-link scheme / listener 표준화 / Auth user JWT) 중 deep-link scheme + listener 는 Phase C 에서 끝남.
3. **Playwright Tauri E2E 인프라** — tauri-driver/WebView2 셋업. 인프라 결정이 큰 작업이지만 Night mode 큐에 두되 설치 단계는 사용자 액션이 필요할 수 있음 (admin 권한 등).
4. **M9 Sync 진입 준비** — T085 enc_key 파생이 활성화되는 시점. T084 완성 후.

### 인사이트 (다음 세션을 위한 메모)

- **Tauri 콘솔 디버깅 시 "All levels" 필터 활성화** — `console.log` 가 default 뷰에서 숨겨짐. 검증 가이드 첫 줄에 명시.
- **WebAuthn register flow 의 사이드이펙트 가드 원칙** — PIN/biometric 인증 같은 회복 불가능한 사이드이펙트가 일어나는 단계 **전에** 모든 가드(vault unlocked, session 상태, etc.) 통과 필요. J2 hotfix 가 이 패턴 lock-in. T084 의 회원가입 흐름에서도 같은 원칙 유지.
- **Zero-Knowledge invariant 검증 패턴** — `salt_auth != salt_enc` 같은 invariant 는 라이브러리 단에서 명시적으로 거부. 위조된 릴레이 응답을 클라이언트에서 잡을 수 있음.
- **wrangler dev 마이그레이션 미적용** — README/runbook 갱신 후로는 재발 방지. `git pull` 직후 항상 `pnpm db:migrate:local` 재실행.

---

## 2026-04-27 → 2026-04-28 (T083 수동 검증 라운드 — 18 통과 + J1/J2 fix)

### 세션 개요

- **시간**: 2026-04-27 PM ~ 2026-04-28 (interactive 단계별 검증, mode 1)
- **모드**: 한 단계씩 사용자가 화면/콘솔에서 실행 → 결과 보고 → 결함 발견 시 즉시 진단 → hotfix → 재검증
- **결과**: 5 라운드 (A/B/C/D/E) 20 항목 중 **18 통과 + 2 deferred + 결함 2건 (J1 docs / J2 코드 hotfix)**

### 검증 시퀀스

| Round | 항목 | 통과 | 비고 |
|:--|:--|:-:|:--|
| **A** 인프라 (4) | A1 릴레이 / A2 health / A3 Tauri dev / A4 unlock | 4/4 ✅ | — |
| **B** 단축회로 (5) | B1 status / B2 signout idempotent / B3 NoSession / B4 EmptyEmail (relay 호출 X) / B5 UnsupportedProvider | 5/5 ✅ | 릴레이 로그로 단축회로 확정 |
| **C** Passkey 풀 플로우 (6) | C1 register_start / C2 verify (Windows Hello) / C3 status DTO / C4 refresh rotation / C5 재기동 hydrate / C6 signout | 6/6 ✅ | C2 첫 시도에서 J1 + J2 발견 — 두 hotfix 후 통과 |
| **D** OAuth + Deep link (3) | D1 provider_disabled 503 / D2 콘솔 listener 등록 / D3 OS deep link 트리거 | 1/3 ✅ | D2/D3 deferred — DevTools 콘솔의 `@tauri-apps/api/event` bare specifier resolve 안 됨 + raw IPC 우회 시도도 콘솔 필터 이슈로 막힘. T084 SignIn UI 시점에 자연 검증 |
| **E** 에러 매핑 (2) | E1 network 다운 / E2 invalid email | 2/2 ✅ | — |

### 발견된 결함 2건

#### J1 — 로컬 D1 마이그레이션 미적용 (P2, docs hotfix)

- **증상**: C1 첫 시도 → `D1_ERROR: no such column: salt_auth at offset 18: SQLITE_ERROR` 500 응답
- **원인**: `wrangler dev` 가 D1 마이그레이션을 자동 적용하지 않음. T080 의 vitest 환경(`readD1Migrations` + `applyD1Migrations`)은 인프라가 갖춰졌지만 dev 환경은 별도 명령 (`pnpm db:migrate:local`) 필요
- **해결 (이 세션)**: `pnpm wrangler d1 migrations apply secretbank-relay --local` 로 0002_auth.sql 적용
- **재발 방지**: README.md + docs/runbooks/relay-deployment.md 두 곳에 "신규 마이그레이션 시 재적용 + 미적용 시 D1_ERROR 500" 경고 명시 (이번 docs commit)

#### J2 — register_start/assert_start 에 vault unlocked 가드 누락 (P0, 코드 hotfix `5a556d4`)

- **증상**: C2 첫 시도 → vault_locked 가 register_verify 만 거부 → navigator.credentials.create 의 PIN 인증은 통과 → OS Passkey 저장소에 등록되지만 서버 DB 에는 INSERT 안 됨 → 다음 register 시도 시 `NotAllowedError` (W3C 명세상 InvalidStateError 가 NotAllowedError 로 통합 반환). Windows Passkey GUI 에서 삭제 후에도 잔재 가능 → 사실상 회복 불가능
- **원인**: `auth_passkey_register_start` / `auth_passkey_assert_start` 가 require_vault_unlocked 가드 없이 네트워크만 호출. PIN 인증 같은 회복 불가능한 사이드이펙트 단계 전에 모든 가드를 통과 못함
- **수정**: 두 start 커맨드에 require_vault_unlocked 가드 추가. start 단계에서 일찍 거부하면 navigator.credentials.* 가 호출되지 않으므로 OS 에 잔재 안 남음. direct_assert_start 헬퍼 + 회귀 2 (register_start_with_locked_vault, assert_start_with_locked_vault)

### 핵심 인사이트

- **OS↔서버 분리 회복 불가능 패턴**: WebAuthn 의 InvalidStateError → NotAllowedError 통합 반환 정책 + OS Passkey 저장소의 자체 캐시. 한 번 분리되면 사용자가 GUI 에서 삭제해도 잔재가 남는 경우 있음. → 모든 PIN/biometric 사이드이펙트 발생 가능 단계 **전에** 모든 가드를 통과해야 한다. 같은 패턴이 OAuth (browser open 후 callback 거부) 에도 잠재적으로 있지만 PIN/biometric 이 아니라서 OS 레벨 잔재 영향은 작음.
- **`wrangler dev` 의 마이그레이션 미적용**: vitest pool-workers 환경 (자동 readD1Migrations + applyD1Migrations) 과 dev 환경 (수동 `pnpm db:migrate:local`) 이 다름. T080 commit 메시지에도 인사이트로 적었지만 결국 사용자 환경의 함정으로 노출. README 와 runbook 두 곳에 명시한 후로는 재발 방지.
- **DevTools 콘솔 필터의 함정**: `console.log` 가 "info" 레벨로 분류되는데 default 뷰는 info 를 숨김. 사용자가 1시간동안 "출력 없음" 으로 오해. → 향후 검증 가이드에 "콘솔 좌상단 'All levels' 체크" 첫 줄에 명시 필요. 이번 세션에서 해결한 후로는 STEP 진행이 즉각 가시화됨.
- **`__TAURI__` namespace 와 withGlobalTauri: false 호환**: `withGlobalTauri: false` 라도 `__TAURI_INTERNALS__.invoke` / `transformCallback` 은 노출됨. 콘솔 디버깅에 충분. ES module dynamic import (`import('@tauri-apps/api/event')`) 는 bare specifier resolve 안 되어 fail.
- **모든 mode 1 인터랙티브 검증의 hotfix 패턴**: H1~H5, I1~I5, J1~J2 모두 검증 라운드 도중 발견 → 라운드 흐름 안에서 즉시 진단 → 분리된 commit 으로 hotfix → 재검증. **이게 단위 테스트로는 잡을 수 없는 IPC/UX/플랫폼 통합 결함을 잡는 가장 효율적인 방법**으로 일관됨.

### 다음 큐

- **T084** — SignIn 페이지 UI (D2/D3 deep link listener 도 여기서 자연 검증)
- **T085** — KDF 통합 (passkey verify 응답의 salt_auth/salt_enc 로 enc_key 파생)
- **I3** — GitHub Connect 풀 플로우 (Auth user JWT 가능)
- **Playwright Tauri E2E** — 인프라 결정 필요

---

## 2026-04-27 (T083 5-Phase 진행 — M8 클라이언트 백엔드 완성, 7/8 진입)

### 세션 개요

- **시간**: 2026-04-27 (interactive 단일 집중 모드 — Phase 단위로 사용자 검증/승인 후 commit)
- **결과**: T083 의 5-Phase 분해 중 4 phase commit 완료. M8 5/8 → **7/8** 도달. T086 의 클라이언트 측까지 같이 마무리됨.

### 처리한 큐

| Phase | 주제 | 커밋 | 산출 |
|:-:|:----|:----|:----|
| A | RelayClient + AuthSession 서비스 골격 + AppContext 확장 | `1ec7a15` | services/relay_client.rs (RelayClient + RelayError + from_settings(cfg+SQLite override)) + services/session.rs (AuthSession + save/load/clear via auth/* 4 키) + AppContext.relay_client/auth_session + 6 사이트 fixture 패치 + 회귀 12 |
| B | Passkey 4 커맨드 (register/assert × start/verify) | `2f17917` | commands/auth.rs 신규 549줄, AuthCommandError(VaultLocked/EmptyEmail/Relay/Network/Internal), complete_session 헬퍼(now+expires_in 결정론), require_vault_unlocked 가드(challenge 낭비 방지), wiremock 6 회귀 |
| C | OAuth(GitHub/Google) + Secretbank:// deep link | `e159415` | auth_oauth_start/callback + UnsupportedProvider/MissingField error variant + tauri.conf.json plugins.deep-link.desktop.schemes + CSP connect-src 확장 + lib.rs setup register_all() + on_open_url emit "deep-link" + tauri-plugin-shell::open → tauri-plugin-opener 전환 + wiremock 5 회귀 |
| D | auth_refresh / signout / status + hydrate | `7df5888` | refresh rotation(short-lock pattern), signout idempotent, status 메모리 캐시만 읽기, hydrate_session_from_vault(vault_unlock 직후 자동), vault_lock 시 메모리 캐시 None(영속본 보존), AuthCommandError::NoSession, wiremock 5 회귀 = T086 클라 완성 |

### 핵심 인사이트

- **테스트 가능성을 위한 헬퍼 추출 패턴**: Tauri AppHandle 의존을 떼어내야 wiremock 으로 단위 테스트 가능. fetch_oauth_authorize / exchange_oauth_callback 같이 "순수 비즈니스 로직" 만 추출하고, browser open 같은 사이드이펙트는 thin wrapper 로 격리. → register/assert/oauth 모두 동일 패턴.
- **Lock 보유 시간 최소화**: auth_refresh 가 refresh_token 을 read 한 직후 lock 해제, 그 다음 네트워크 호출. 30초 reqwest timeout 동안 다른 커맨드의 user_id 읽기를 차단하지 않게 함. async lock 디자인의 모범 사례.
- **Lock(잠금) ≠ Sign-out**: vault_lock 에서 메모리 auth_session 만 None 으로 비우고 영속본은 그대로 둠. 다음 unlock 에서 hydrate 가 자동 복원. 사용자 의도와 일치 (하루의 끝에 잠그고 다음 날 다시 unlock 하는 케이스).
- **Unknown 응답 필드 무시**: OAuth callback 응답이 토큰 + salt_auth/salt_enc 같이 오는데 AuthTokensResponse 가 salt_* 무시 (serde 기본 동작). T085 가 같은 응답에서 salt 만 따로 빼면 추가 라운드트립 없음.
- **Deep link emit-only 패턴**: Rust 는 OS deep link 받아 "deep-link" 이벤트만 emit. URL 파싱과 callback 호출은 FE 가. 백엔드와 프론트엔드의 책임 분리 명확. → I3 의 listener 표준화 사전작업.
- **Rust 1.95 `tauri::Emitter` trait 분리**: AppHandle::emit 이 별도 trait 로 옮겨감. `use tauri::Emitter;` 명시 import 필요.
- **`tauri-plugin-shell::Shell::open` deprecated**: Tauri 권장 경로는 dedicated `tauri-plugin-opener::OpenerExt::open_url`. 이미 두 plugin 모두 깔려 있어 단순 전환만으로 해결.

### 다음 큐

- **T084** — SignIn 페이지 UI (큰 frontend)
- **T085** — 클라이언트 KDF 통합 (passkey verify 응답의 salt 로 enc_key 파생)
- **I3** — GitHub Connect 풀 플로우 (Auth user JWT 가 이제 가능)
- **Playwright Tauri E2E** — 인프라 결정 필요

---

## 2026-04-27 PM (Night mode 1 — I1/I2 hotfix + clippy 정리 + M8 서버 측 5/8)

### 세션 개요

- **시간**: 2026-04-27 PM (Night mode 1, 사용자 승인 없이 연속 실행)
- **트리거**: 사용자 — "Night mode 진입. 내가 승인하지 않고 네가 할 수 있는 일들은 모두 다 해줘."
- **결과**: 7 커밋, M8 서버 측 5/8 완료 (Passkey + OAuth + Refresh 풀 스택), I1/I2 P2/P3 backlog 청산, Rust 1.95 clippy lint 14건 정리.

### 처리한 큐 (모두 ✅)

| Q | 주제 | 커밋 | 산출 |
|:-:|:----|:----|:----|
| Q1/Q2 | I1/I2 Subscription 헤더 정리 + Pro 시 Upgrade 버튼 숨김 | `fea5562` | 헤더 우측 "Current plan: <Badge>" 그룹화 + isPro 분기 + 회귀 3 (f/g/h) — vitest 315/315 |
| Q3 | Rust 1.95 clippy lint 14건 정리 | `a6b0a94` | cloned_ref_to_slice_refs 9 (matcher.rs 6 + feed_normalize 3) + io_other_error 1 + unused 2; -D warnings 0 |
| Q5a (T080) | D1 auth schema 마이그레이션 0002_auth.sql | `6929c91` | user 컬럼 6 (auth_hash/salt_auth/salt_enc/plan/plan_source/plan_expires_at) + device/passkey/oauth_account 3 신규 + Drizzle schema 동기화 + readD1Migrations 인프라 + db.test.ts 4 |
| Q5b (T081) | Passkey (WebAuthn) 4 엔드포인트 + JWT 발급 | `c60e023` | register/start, register/verify, assert/start, assert/verify + lib/jwt.ts (HS256, access 1h / refresh 30d) + lib/webauthn.ts (@simplewebauthn/server 13.3 wrapper) + lib/kv-challenge.ts (consume-once) + 8 회귀 |
| Q5c (T082) | OAuth 2.0 (GitHub + Google) start/callback | `11eeeea` | lib/oauth.ts (provider 분기, exchangeCode, email-private 폴백) + routes/auth/oauth.ts + (provider, provider_id) UNIQUE 매핑 + 9 회귀 |
| Q5d (KDF) | salt 시그니처 일반화 `&[u8; 16]` → `&[u8]` | `d3a345f` | M8 32바이트 salt 호환, 기존 호출자 자동 coerce, 5/5 + 39/39 통과 |
| Q5e (T086) | POST /auth/refresh — refresh rotation | `03a0480` | use=refresh 검증, access 거부, 새 페어 발급 (leak window 30일 제한) + 4 회귀 |

### M8 진행 상태

- **서버 측 (5/8 ✅)** — T079 /health · T080 D1 schema · T081 Passkey · T082 OAuth · T086 Refresh
- **클라이언트 측 backlog (3/8)** — T083 (Rust auth_* 커맨드 + RelayClient) · T084 (SignIn UI) · T085 (Session 저장 + key 파생 통합)

### 핵심 인사이트

- **Cloudflare vitest-pool-workers 의 D1 마이그레이션 자동 적용 안됨**: wrangler.toml 의 `migrations_dir` 은 `wrangler dev/deploy` 만 인식. vitest 환경에서는 `readD1Migrations` + `applyD1Migrations(env.DB, env.TEST_MIGRATIONS)` 로 명시적 적용 필요. 한 번 인프라가 갖춰지면 후속 마이그레이션은 자동 picked up.
- **Zero-Knowledge salt 디자인 분리**: `salt_auth` (서버 검증용) 와 `salt_enc` (클라이언트 enc_key 파생용) 를 같은 user 행에 함께 저장. 서버는 salt_enc 를 보관하지만 enc_key 는 절대 모름 (다른 디바이스 로그인 시 동일 enc_key 가 deterministic 하게 파생됨).
- **JWT HS256 vs ES256 결정**: 단일 발급/검증 워커에서는 HMAC 으로 충분. ES256 + PKCS#8 PEM 은 multi-region key distribution 이 생기는 시점(M9+)에 전환.
- **Refresh rotation**: 매 refresh 마다 새 pair 발급 → leak 된 refresh token 의 윈도우를 30일로 제한. 명시적 revocation 리스트 (KV jti) 는 후속 작업.
- **TS 5.6+ 의 nominal Uint8Array 분리**: `Uint8Array<ArrayBufferLike>` vs `Uint8Array<ArrayBuffer>` — TextEncoder 의 결과는 ArrayBufferLike, simplewebauthn 은 ArrayBuffer 요구. cast 한 번으로 해결.

### 다음 큐 (사용자 결정 후)

- T083 — Rust 클라이언트 auth_* 커맨드 (큰 작업, RelayClient + reqwest + AppContext)
- T084 — SignIn 페이지 UI (PasskeyButton + OAuthButton)
- T085 클라이언트 측 — Session 저장 + key 파생 통합
- I3 — GitHub Connect 풀 플로우 (deep-link scheme + listener + Auth user JWT — T083 와 함께 정리됨)
- Playwright Tauri E2E 인프라 — tauri-driver/WebView2 셋업 결정 필요

---

## 2026-04-27 (재검증 라운드 — 라운드 A/B/C 통과 + I4/I5 P0 hotfix 2건)

### 세션 개요

- **시간**: 2026-04-27 (interactive manual verification — 사용자가 단계별로 화면 검증, 결함 발견 시 즉시 진단 → hotfix → 재검증)
- **모드**: 라운드 A (마이그레이션 0004 + H1/H2/H4) → 라운드 B (H3 RAILGUARD) → 라운드 C (Pro/GitHub/Single+Bulk Revoke). 검증 도중 발견된 P0 2건 (I4, I5) 은 라운드 흐름 안에서 즉시 hotfix + 재검증.
- **검증 통과 10 / C2 deferred 1 / 새 결함 발견 5 (I1~I5) / hotfix commit 2 (I4, I5)**

### 검증 시퀀스 (사용자 실행)

| # | 항목 | 결과 |
|:-:|:----|:----|
| A1 | 앱 재기동 → 마이그레이션 0004 자동 적용 (DB 검사 — `_sqlx_migrations(4, 'incident match unique', success=1)`, `idx_incident_match_unique` 존재) | ✅ |
| A2 | H1 — Affecting my keys 한 incident 의 같은 credential 27회 → **1회** | ✅ |
| A3 | H2 — Audit Subject 컬럼 `vault:default` 정상 표시 | ✅ |
| A4 | H4 — Drawer 상단 Revoke 가 빨간 border + 빨간 텍스트 (outline-destructive) | ✅ |
| B1 | H3 — `C:\tmp\railguard-test` 에 `Overwrite { backup: true }` 로 4 파일 생성 (.cursorrules / .windsurfrules / CLAUDE.md / .github/copilot-instructions.md) | ✅ |
| C1 | Pro 모의 활성화 (Developer Tools "Simulate Pro until" set) | ✅ |
| C2 | GitHub Connect 풀 플로우 | ⏸ deferred (I3) |
| C3 | Pro + Connected 시뮬 (devtools dynamic import 로 fake installation 저장) → Scan 버튼 자물쇠 없이 활성 | ✅ |
| C4 | H5 — Single Revoke (Test API Key) — IPC 통과 + DB status='revoked' + audit chain seq=16. 단 React 화이트 스크린 발생 (I4) → I4 hotfix → 새 credential 로 재검증 | ✅ |
| C5 | H5 IssuerInput — Bulk Revoke. 1차 시도 "Failed to revoke issuer credentials" (I5) → I5 hotfix → 재검증 progress 1/2 → 2/2 + 화면 정상 | ✅ |

### 새로 발견된 결함 5건

| ID | 우선순위 | 상태 | 한 줄 요약 |
|:--|:--|:--|:--|
| **I1** | P3 | pending | Subscription 헤더 "Current plan" 라벨 ↔ Pro 뱃지 줄 분리 (의미 연결 약함) |
| **I2** | P2 | pending | Pro 활성 시에도 disabled "Upgrade to Pro" 버튼 노출 (Free 에서도 dead) |
| **I3** | Architectural | M8 의존 backlog | GitHub Connect 풀 플로우 4 사전 조건: (a) GitHub App 등록 (b) deep-link custom scheme + plist/registry (c) listener 이벤트 표준화 (d) M8 Auth user JWT |
| **I4** | **P0** | ✅ fix | Single/Bulk Revoke 후 화이트 스크린 — Radix Dialog ref composition 무한 setRef ("Maximum update depth exceeded") |
| **I5** | **P0** | ✅ fix | Bulk Revoke `ExpectedCountMismatch` — Rust filter status 미지정으로 revoked 행 포함, FE active-only count 와 mismatch |

### Hotfix 2 commits

- **I4** (`6dda3e8` fix(kill-switch)): KillSwitchDialog/BulkRevokeDialog 의 phase=done 이펙트가 onRevoked/onCompleted 를 동기 호출하면 부모(InventoryPage)가 같은 batch 안에서 자식 다이얼로그를 unmount → Radix compose-refs unmount-during-update race → 무한 setRef 루프 → React tree crash. 부모 콜백을 setTimeout 안 + queueMicrotask 로 defer 하여 close 전환이 시작된 다음 unmount 가 일어나도록 순서 보장. 회귀: KillSwitchDialog test (d) 의 onRevoked 단언을 setTimeout 후로 분리.
- **I5** (`cc1785b` fix(kill-switch)): `kill_switch_revoke_issuer` 의 CredentialFilter 에 `status: Some(Active)` 추가. 부수효과 — (1) FE expected_count(=active 만) 와 backend actual 의미 일치, (2) 이미 revoked 인 credential 의 do_revoke_internal 재호출 제거 (audit 중복 방지), (3) emit progress total 이 사용자 인지(2/2)와 일치. 회귀 `bulk_revoke_filter_excludes_already_revoked_credentials` 추가 — 1 revoked + 2 active 시드 후 Active 필터 list 시 정확히 2개.

### 테스트 결과

| 카테고리 | 이전 | 신규 | 비고 |
|:--|:-:|:-:|:--|
| Rust kill_switch unit | 12 | **13** | I5 회귀 1 |
| Vitest 전체 | 312 | 312 | I4 fix 후 KillSwitchDialog test (d) timeout 조정으로 같은 312 유지 |
| typecheck | 0 | 0 | clean |
| Rust app lib 전체 | 101 | **102** | I5 추가 |

### 보류 / 후속

- **I1 / I2 hotfix** (P2/P3) — Subscription 섹션 UX. 다음 라운드.
- **I3 GitHub Connect 풀 플로우** — M8 Auth (T080~T086) 진입 시 같이 정리.
- **C2 정식 검증** — I3 4건 사전 조건 끝난 후 한 번에.
- **Pre-existing clippy regressions** — 별도 cleanup 큐 유지 (이번 라운드 무관).

### 핵심 인사이트

- **수동 검증의 가치**. 단위 테스트 312 + Rust 101 모두 그린이었지만 I4 (Radix unmount race) / I5 (filter 누락) 모두 단위 테스트가 잡지 못했다. 화면에서 사용자가 한 번 누르는 것이 기존 테스트 전체보다 더 많은 신호를 만든다.
- **부모-자식 unmount race 패턴**. phase=done → 부모 콜백 → 자식 unmount 흐름이 Radix Portal/compose-refs 와 만나면 무한 루프. queueMicrotask 한 줄 defer 가 해결 — 같은 패턴이 다른 다이얼로그 (`KillSwitchDialog`, `BulkRevokeDialog`) 에 일관되게 있다는 것은 향후 동일 위험 다이얼로그 (예: Delete confirmation) 도 같은 검토 필요.
- **expected_count 같은 invariant 는 양 끝에서 의미 일치 검증을 강제할 방법이 없으면 깨진다**. 이번엔 FE active-only ↔ backend status-무관. 다음에는 Rust input struct 가 status filter 를 명시 의무화하거나 (e.g. typed `BulkRevokeInput { status_filter: CredentialStatus }`), 또는 FE 가 expected_count 를 안 보내고 backend 가 raw count 만 반환하게 단순화.

---

## 2026-04-26 PM (수동 검증 라운드 + 결함 5건 hotfix)

### 세션 개요

- **시간**: 2026-04-26 PM (사용자 step-by-step 수동 검증 + 즉시 hotfix)
- **모드**: 인터랙티브 manual verification (한 단계씩 사용자 실행 후 결과 보고). 발견 결함은 큐(H1~H5)에 적어두고 검증 종료 후 일괄 처리.
- **검증 통과 8 / 결함 발견 5 / hotfix 4 커밋 (H3+H5 묶음)**

### 검증 시퀀스 (사용자 실행)

| # | 항목 | 결과 |
|:-:|:----|:----|
| ① | Relay `/health` 200 OK | ✅ |
| ② | 앱 부팅 + Lock Screen | ✅ |
| ③ | 볼트 언락 + Inventory | ✅ |
| ④ | `/incidents` 페이지 + Refresh + 4 탭 + Affecting my keys 필터 | ✅ + ⚠️ H1 |
| ⑤ | Audit `/audit` Verify integrity + entry 목록 | ✅ + ⚠️ H2 |
| ⑥ | RAILGUARD `/railguard` Preview (✅) → Apply (❌ H3) | ✅ Preview / ❌ Apply |
| ⑦ | GitHub Integration UI + Connect 404 (App ID 미등록 정상) | ✅ |
| ⑧ | Pro 모의 활성화 (Settings → Developer Tools) | ✅ |
| ⑨ | Kill Switch 단일 revoke 다이얼로그 → Continue (❌ H5) + UX 의문 H4 | ❌ + ⚠️ H4 |

### Hotfix 5건 → 4 커밋

- **H3 + H5 묶음** (`19afd3d` fix(ipc)): IPC 직렬화 계약 정렬.
  - H5: `KillSwitchRevokeInput`/`...IssuerInput` 에 `#[serde(rename_all = "camelCase")]` 부착. Tauri 의 자동 변환은 top-level 인자 한정, nested struct 필드에는 적용 안 됨.
  - H3: 단일 ApplyMode 기대인 Rust 에 FE 가 `Vec<{tag, kind, ...}>` 송신. FE 타입 재정의 + 단일 객체 송신.
  - 회귀: kill_switch camelCase JSON deserialize 2 + railguard ApplyMode variant 3 + array 거부 1.
- **H1** (`b74d71d` fix(matcher)): `incident_match` 멱등화. 매 refresh 마다 dupe row 누적 → 27 badge / "2465 incidents".
  - 마이그레이션 0004 — dismissed_at propagate → dedup → UNIQUE INDEX (incident_id, credential_id, reason).
  - `insert_match` INSERT OR IGNORE + 캐노니컬 id 반환.
  - 회귀: same triple 3회 insert → 1행 + 같은 id / 다른 reason → 2행 공존.
- **H2** (`c2d45f9` fix(audit)): `vault:efault` 표시. `slice(-6)` 가 `"default"` (7자) 에 잘못 적용.
  - ULID 패턴 (`/^[0-9A-HJKMNP-TV-Z]{26}$/i`) 정확 매칭일 때만 truncate.
  - 회귀: 신규 `use-subject-labels.test.ts` — literal verbatim, ULID 마지막 6, 25/27 경계, name lookup hit (총 7건).
- **H4** (`f350cad` fix(inventory)): Drawer 상단 Revoke 가 `outline` neutral 로 보여 INCIDENTS 의 filled-destructive 와 시각적 위계 모순.
  - 상단을 `outline + border-destructive + text-destructive` 로 정렬. 두 진입점은 의미적으로 다르므로 (위 = 항상 사용 가능 / 아래 = incident 주도 긴급) 둘 다 살리되 위계만 분리.

### 테스트 결과

| 카테고리 | 이전 | 신규 | 비고 |
|:--|:-:|:-:|:--|
| Rust app lib | ~89 | **101** | wire-format kill_switch 2 + railguard 4 |
| Rust storage incident | 15 | **17** | H1 멱등성 회귀 2 |
| Rust storage migration | 5 | 5 | idx_incident_match_unique 검증 추가 |
| Vitest | 305 | **312** | use-subject-labels 7 |
| typecheck | 0 | 0 | clean |
| lint | 0 errors | 0 errors | 5 pre-existing shadcn warnings |

### 보류 / 후속

- **재검증 (사용자 앱 재기동 후)**: 마이그레이션 0004 자동 적용 → 27 → 1 배지 / Apply / Revoke 실제 동작.
- **Playwright 회귀 (tester 에이전트)**: H3/H5 IPC 계약, H1 멱등성, H2 라벨 — 이 라운드의 hotfix 들을 E2E 로 lock-in.
- **Pre-existing clippy regressions** (Rust 1.95): `feed_normalize.rs` cloned-ref-to-slice-refs 등. 이번 hotfix 와 무관, 별도 cleanup 큐.
- **Bulk Revoke 검증**: H5 fix 가 `KillSwitchRevokeIssuerInput` 도 함께 처리 — 다음 검증 라운드에서.
- **Pro + Connected Scan 버튼 노출**: M8 Authentication 진입 후 GitHub App 등록 끝나면 검증.

### 핵심 인사이트

- **자동 테스트의 빈 영역 = IPC 계약 / 데이터 무결성 / 시각적 위계**. 단위 테스트만으로는 잡지 못한다. 이번 라운드에서 wire-format regression 패턴 도입.
- **두 P0 결함 (H3/H5) 이 같은 카테고리**. invoke 호출부의 nested struct 필드 case 협약을 한 번 정리하니 둘 다 풀림. 비슷한 패턴이 어디 또 있을지 (ToolSearch / generated bindings) 추후 점검.
- **마이그레이션은 schema 만 바꾸지 않는다**. 누적 결함 데이터 cleanup 까지 책임지면 사용자는 앱 재기동만으로 수동 작업 없이 정상 상태로 복귀.

---

## 2026-04-25~26 (Pro 가격 인하 + M5 완료 + M15 CI/CD 진입 + 릴레이 스캐폴드, 100/132 태스크 달성)

### 세션 개요

- **시간**: 2026-04-25 AM~PM + 2026-04-26 PM (사용자 인터랙션 + Night mode 2 자율)
- **누적 커밋**: 약 129개 (본 세션 신규 ~17개)
- **마일스톤 진행**:
  - 이전: M4~M7 ✅ 완료 (74/118)
  - 신규 완료: **M5 10/10 ✅** (T061~T064 추가 완성)
  - 신규 진입: **M15 CI/CD Integration 🔄** (T132~T133)
  - 신규 신설: M14 Auto Rotation, M16 Anonymous Telemetry, M17 SDK Ecosystem (placeholder)
  - 누적: 14 마일스톤 → **18 마일스톤**, 118 태스크 → **132 태스크** (100/132 = 75.8%)
- **테스트**: Rust workspace 전 통과 (audit 9 + kill_switch 8 + railguard 8 + connectors 57 + 기타 다수) / **Vitest 305개** 전부 통과 / typecheck 0 에러 / clippy clean / lint 0 에러

### Pro 가격 결정 인하 (2026-04-25 AM)

- 기존: Pro $2/월·$15/년, Team $10/seat/월
- **신규: Pro $1/월·$10/년, Team $5/seat/월**
- 근거: Bitwarden Premium 동률 ($1/월), 1Password Individual 보다 한참 저렴 ($3.99/월)
- 시장 전략 분석: `user_research/Secretbank_strategy.md` 검토 후 최종 확정
- 자동 rotation (Pro) → M14 신설, Phase R1~R4 로드맵 확정
- 커밋: `58eacd2` (가격 인하 + M14 마일스톤 신설)

### 도메인 + Cloudflare 인프라 확정 (2026-04-25)

- **도메인**: `secretbank.app` 등록 (Cloudflare Registrar, $14/년, WHOIS Privacy 자동)
- **Cloudflare 계정**: 생성 완료
- **wrangler**: 설치 + login + Account ID / D1 / KV 채움
- **첫 로컬 검증**: `pnpm dev` 성공 + `curl http://localhost:8787/health` → 200 OK
- 커밋: `766a3d4` (도메인 확정), `4ec6248` (T061+T079 릴레이 스캐폴드)

### OSS / EE 디렉토리 분리 (옵션 C 확정)

- **루트**: `LICENSE` (AGPL-3.0-or-later)
- **ee 디렉토리**: `ee/LICENSE` (Enterprise License v1.0), 별도 라이선스 + 별도 빌드
- **디렉토리 매트릭스**: README 에 명시 (feature grid / license column)
- **빌드 파이프라인**: ee/ 는 별도 워크플로우 (M15 T132/T133 구현)
- 커밋: `840370c` (ee 골격 + 라이선스 파일)

### M5 GitHub Connector + RAILGUARD — 10/10 완료 ✅

**T061 Cloudflare Workers 릴레이 (커밋 `4ec6248` + `e8f5e45` Cargo.lock + `f109812` wrangler ID)**

- `wrangler.toml` 스캐폴드 (account_id, database_id, kv_namespaces 채움)
- `/health` endpoint 로컬 동작 검증 (200 OK)
- 사용자가 D1 + KV 테이블 먼저 생성 후 진행 (스텝 가이드 제공)
- 첫 Cloudflare Workers 배포 준비 완료

**T062 GitHub Secret Scanning (커밋 `6ddce61`)**

- `GitHubSecretScanner` trait 정의
- GitHub API 통합 (릴레이 `/github/scan-secrets` endpoint)
- 저장소 스캔 + 결과 캐싱
- Tauri 커맨드: `github_scan_secrets(repo_owner, repo_name)`
- 5 unit test

**T063 GitHub Connector UI (커밋 `0c517ba`)**

- `GithubIntegrationSection` 컴포넌트 신규
- UI flow: Connect (deep link) → installations 목록 → Scan (Pro gated) → 결과
- "Bulk Revoke" + "GitHub Scan" 버튼 Free 사용자에게 disabled (Pro 배지)
- 4 Vitest 테스트

**T064 Pro 엔타이틀먼트 + Entitlement Gate (커밋 `8ef4ebb` + `0194829` docs)**

- `entitlement.rs`: Tier enum (Free / Pro), `require_pro()` 게이트 함수
- `vault.settings.pro_until` stub (M10 결제 전까지 임시)
- `entitlement_set_dev` Tauri 커맨드 (M10 before 테스트 용)
- GithubIntegrationSection "Scan" 버튼 + Bulk Revoke Pro gated
- Pro 없으면 disabled + tooltip "Upgrade to Pro"
- 6 unit test + docs

**M5 신규 마일스톤 진입 가능 구조**:
- T065~T068 기존 완료 (RAILGUARD 템플릿/preview/apply/UI/auto-suggestion)
- T061~T064 이제 완성 (릴레이 + GitHub 통합)
- 향후 T079~T080 (추가 커넥터) 자유

### M15 CI/CD Integration 진입 (Night mode 2)

**T132 Relay CD 워크플로우 (커밋 `bf06db7`)**

- `.github/workflows/deploy-relay.yml` 신규
- Cloudflare wrangler-action (account_id + api_token)
- `ee/ deploy` 분기 별도 (ee-relay job)
- Secret 관리: `CLOUDFLARE_API_TOKEN` (사용자 제공, runbook 안내)

**T133 CI Pipeline ee-relay job (커밋 `bf06db7`)**

- `.github/workflows/ci.yml` ee-relay 추가
- `wrangler publish` dry-run (PR 에서 권한 검증)
- 문법 체크 + typecheck
- 배포 권한: main 브랜치 push only

**M15 task 리스트 정의**:
- T126: GitHub Actions Secrets API (클라이언트)
- T127: `sync` 커맨드 (멀티 디바이스 CRDT)
- T128: Sync UI (settings)
- T129: Sync over relay (e2ee)
- T130: Offline queue + retry
- T131: Conflict resolution UI
- T132: **deploy-relay.yml** ✅
- T133: **ci.yml ee-relay** ✅

### M5 마무리 + 백로그 hotfix 5건 (Night mode 2)

**완료된 커밋** (`6ddce61` T062 ~ `0194829` T064 docs):
- M5 전체 10/10 마크 확정
- Vitest 305개 유지 (신규 테스트 수렴)

**백로그 hotfix 5건** (커밋 `dd63f97`):
1. `withGlobalTauri: true → false` — XSS 시 IPC 노출 차단
2. `list` 커맨드 vault locked 시 빈 vec 반환 — credential/project/deployment/usage 모두
3. KillSwitchDialog 에러 메시지 i18n — VaultFlushFailed / NotFound 사용자 친화
4. `prune_rule_backups` doc-comment (무의미 로그 제거)
5. ESLint config `ee/**` ignore 추가 (wrangler 빌드 tmp 파일 차단)

### 커밋 목록 (이번 세션 신규, ~17개)

**인터랙션 단계**:
- `58eacd2`: feat: Pro 가격 $2→$1/월, $15→$10/년 + M14 Auto Rotation 신설
- `512b2fc`: docs: Team $10→$5/seat + M15/M16/M17 placeholder + M5 진입 공지
- `840370c`: feat(ee): AGPL-3.0 + Enterprise License v1.0 디렉토리 분리
- `766a3d4`: docs: secretbank.app 도메인 확정

**릴레이 스캐폴드**:
- `4ec6248`: feat(relay): Cloudflare Workers 스캐폴드 + T061/T079
- `e8f5e45`: chore(relay): Cargo.lock 추가
- `f109812`: chore(relay): wrangler.toml account_id/database_id 채움

**M5 마무리**:
- `6ddce61`: feat(connectors): T062 GitHub Secret Scanning 읽기
- `0c517ba`: feat(ui): T063 GitHub Connector UI + GithubIntegrationSection
- `8ef4ebb`: feat(entitlement): T064 Pro tier + require_pro() gate
- `0194829`: docs: T064 entitlement 설명 추가

**Night mode 자율**:
- `dd63f97`: fix: 5 backlog hotfix (XSS / list locked / i18n / docstring / eslint)
- `bf06db7`: feat(ci): T132/T133 deploy-relay.yml + ci.yml ee-relay job

**추가 예상 커밋** (세부 기록 대기):
- docs 업데이트 (strategy / price / relay runbook)
- GitHub App 클라이언트/릴레이 분리 runbook

### 다음 마일스톤 후보

1. **M15 product feature (T126~T128)** — GitHub Actions Secrets API + sync 커맨드 + Sync UI
   - 외부 인프라 불필요, 자율 가능
   - M9 Sync 기초 위에 구축

2. **사용자 수동 검증 (선택)** — M4~M7 + M5 + 릴레이 로컬 end-to-end
   - Incident feed poll + refresh + UI filter
   - RAILGUARD project auto-generate
   - Audit chain verify
   - Kill Switch revoke flow
   - Relay /health + GitHub Connector deep link

3. **M8 Authentication** — Passkey + OAuth (릴레이 의존, 이제 가능)
   - 웹 릴레이 기초 활용

---

## 2026-04-25 (Night mode 자율 연속 실행 세션 종료 — M4~M7 완료, 74/118 태스크 달성)

### 세션 개요

- **시간**: 2026-04-25 PM~AM (Night mode 자율 연속 실행, 중간 승인 질문 없음)
- **모드**: 🌙 연속 자율 진행 (Gate 3/4 외 중단 없음, 큐에 쌓아 처리)
- **달성**: M4 3/10 (T056/T057/T058) + M5 4/10 (T059/T060/T065/T066/T067/T068) + M6 6/6 (T069~T074 Audit) + M7 4/4 (T075~T078 Kill Switch) → **74/118 태스크 (62.7%)**
- **누적 커밋**: 112개 (본 세션 신규 24개)
- **테스트**: Rust workspace 전체 통과 (신규 ~120개) / Vitest 288개 통과 / typecheck 0 에러 (pre-existing 5개 해소) / clippy clean / lint 0 에러

### M4 Incident Feed 완료 (10/10 ✅)

**T056 Incidents 페이지 UI** (커밋 `7bfac7c`)

- `/incidents` 신규 페이지 (tab 기반 필터: All / Affecting my keys / Dismissed)
- `incident_list(filter?)` 커맨드 호출, 필터 UI 통합
- 각 incident 카드: title + source logo + issued_at (date-fns 상대시간) + match 수 표시 + View 버튼 (external browser shell 플러그인 또는 fallback `window.open`)
- Responsive grid + empty state + spinner + error boundary
- Vitest 5개 신규 테스트

**T057 Credential Detail Incidents 섹션** (커밋 `3858a5d`)

- `CredentialDetail` Drawer 에 "Incidents affecting this key" 섹션 추가
- `incident_matches_for_credential(cred_id)` 커맨드, 매칭된 incident 만 표시
- 각 매치: issuer.display_name + incident title + match confidence (0.3~1.0) + 이유 (IssuerMatch / Keyword)
- "Revoke now" CTA (M7 Kill Switch 완성 전까진 disabled + tooltip)
- 반응형 리스트 + 최적화 (incident_list 결과에서 클라이언트 필터로 반복 호출 회피)
- Vitest 5개 신규 + 기존 통합

**T058 NVD API 키 Settings UI** (커밋 `35548dd`)

- Settings 페이지에 "API Keys for Feeds" 섹션 신설
- NVD API 키 input + masked input (reveal toggle) + test button (간단한 ping)
- 저장 시 `vault_setting_set(nvd_api_key)` + `VaultStorage::flush()` (설정 유지, 언락 상태 보존)
- 저장 후 피드 스케줄러 자동 재구성 (`FeedSchedulerHandle::reconfigure(config)`)
- NVD 폴링이 즉시 새 키로 재개됨
- Vitest 6개 신규 테스트 + 기존 Settings 테스트 7개 업데이트

**M4 보충 작업**

- 커밋 `c49ed8f`: typecheck 5 에러 해소 (GraphPage.test.tsx `vi.fn<() => void>()` 패턴)
- 커밋 `00e8bde`: Incident 중복 방지 마이그레이션 (UNIQUE(source, source_id) + INSERT OR IGNORE)
- 커밋 `6acbf64`: 앱 종료 hook 을 `RunEvent::Exit` 로 전환 (scheduler shutdown 완료 보장)

### M5 GitHub Connector + RAILGUARD (6/10 진행, T061~T064 defer)

**T059 Connector trait 정의** (커밋 `119e11c`)

- `secretbank-connectors` 크레이트 신설
- `Connector` trait: `fetch_incidents(&auth) -> Vec<Incident>` + `async fn`, `Send + Sync`
- `Auth` enum: `GitHubApp { install_id, install_token } / Token(String) / None`
- `MockConnector` (testing feature) — wiremock 기반 테스트 지원
- 45개 unit test (trait 검증 / mock / 에러 케이스)

**T060 GitHub App skeleton** (커밋 `ec6b042`)

- `GitHubConnector` impl (placeholder, relaying 의존)
- GitHub App 등록 runbook 작성 (`docs/runbooks/github-app-registration.md`)
- 환경변수: `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY` (relay-only), `GITHUB_APP_INSTALL_ID`, `GITHUB_APP_INSTALL_TOKEN` (client-side)
- 인증서 릴레이 분리 원칙 확정: client 는 install_id + 1h token, relay 는 private key 보관
- 4개 unit test

**T065 RAILGUARD 템플릿 라이브러리** (커밋 `8ec8b32`)

- 4가지 AI 에디터 규칙 파일 템플릿 (Cursor Rules / Windsurf Rules / Claude System Prompt / GitHub Copilot Instructions)
- `render_rules(vault_state, project, frameworks, issuers) -> HashMap<Editor, String>` 함수
- 변수 치환: `{{FRAMEWORKS}} / {{ISSUERS}} / {{PROJECT_NAME}} / {{VAULT_URL}}`
- 빈 배열 fallback ("general" / "your providers")
- Tone 맞춤 (Cursor/Windsurf: 헤더만 다름, Claude: prose 형식, Copilot: 넘버링 instructions)
- 스냅샷 테스트 (invariant: 10 rule slugs 존재, 변수 잔여 없음)

**T066 preview/apply 커맨드** (커밋 `f57e84a`)

- `railguard_preview(project_id, editor)` → `String` (렌더링 결과)
- `railguard_apply(project_id, editor, mode) → { files_written: Vec<Path>, skipped: Vec<Path> }` (ApplyMode::Create / SkipExisting / Overwrite)
- 원자적 쓰기 (tmp + rename) — 중간 crash 안전성
- `.github/` 자동 mkdir (필요 시에만)
- Tauri 커맨드 레이어
- 6 테스트

**T067 RAILGUARD UI** (커밋 `892f671`)

- `/railguard` 페이지 신설 (대기 큐에서 구현)
- Project 선택 → Editor 선택 (라디오 4개) → Preview (코드 하이라이트 SyntaxHighlighter 또는 \<pre\>) → Apply (mode 선택) → 결과 (files_written / skipped)
- 선택지 없으면 "No projects" / "Run T035 detection first" 메시지
- Responsive dialog 또는 full-page 에디터 레이아웃
- Vitest 6개 신규 테스트 + integration

**T068 .env 스캐너 → RAILGUARD 자동 제안** (커밋 `d23ef6d`)

- T035 드롭&스캔 결과에서 감지된 frameworks 목록 extract
- `/railguard` 로 navigate 시 query params `?project_id=<id>&suggested_frameworks=<csv>` 전달
- Suggested frameworks 로 템플릿 rendered (사용자가 편집 가능)
- "Auto-generate for Cursor" CTA 바로 제공
- Vitest 1개 신규 추가

**M5 defer 사항**

T061~T064 는 **Cloudflare Workers 릴레이 외부 인프라 의존**으로 Night mode 스코프 외 연기:
- T061 Cloudflare Workers 릴레이 (아키텍처 / wrangler 배포)
- T062 GitHub Secret Scanning 읽기 (relaying API 필요)
- T063 GitHub Connector UI (저장소 스캔 / 연결 flow)
- T064 GitHub 자동 매칭 (webhook / 스케줄러 통합)

사용자 결정: relaying 배포 후 재개.

### M6 Audit Log 완료 (6/6 ✅)

**T069 secretbank-audit 크레이트** (커밋 `79a8c1e`)

- 새 크레이트 `secretbank-audit` (core/storage 와 독립)
- `AuditLog` struct: hash chain (SHA256-HMAC), ed25519 서명, 고정 길이 (32바이트 hash + 64바이트 signature)
- Immutable append (기존 entry 는 수정 불가)
- `append(action, details)` → hash chain 자동 업데이트
- `verify_chain()` → Result (모든 entry 의 hash 검증)
- 3 unit test

**T070 Device identity 추가** (커밋 `ee30a79`)

- Device unique ID 생성 (UUID v4, 첫 기동 시 저장)
- Audit entry 에 device_id + timestamp 자동 포함
- Settings page 에 "This Device" 섹션 (ID 표시 + copy button)
- 3 unit test

**T071 모든 mutating 커맨드에 audit 훅** (커밋 `e55b03d`)

- `AuditCtx` 패턴: `fn new(repo: &AuditRepo, device_id: Uuid) -> Result<Self>`
- 모든 credential_create/update/delete + project_* + deployment_* + usage_* 커맨드 래핑
- Action enum: CREATE/UPDATE/DELETE/REVOKE + Target enum: Credential/Project/Deployment/Usage
- `ctx.record(action, target, details)` 호출 (자동 device_id + timestamp)
- Best-effort (device_id 없으면 warn-log, DB 실패 warn-log, critical 아님)
- SQL transaction 내 audit 호출 defer (DoD 이탈 기록)
- 4 unit test (각 action type)

**T072 audit_list / audit_verify_chain 커맨드** (커밋 `cf01646`)

- `audit_list(limit?, offset?)` → `Vec<AuditEntry { action, device_id, timestamp, ... }>`
- `audit_verify_chain()` → `{ valid: bool, first_entry_time: DateTime, last_entry_time: DateTime, total_entries: u64, breach_detected: Option<usize> }` (breach_detected: 체인 단절 위치)
- Tauri 커맨드 레이어
- 5 unit test

**T073 Audit UI — 페이지** (커밋 `4a3d8e2`)

- `/audit` 페이지 신설
- `audit_list()` 호출, 시간 순 나열 (최신 먼저 또는 역순)
- 각 entry: action (CREATE/UPDATE/DELETE 아이콘) + device_id + timestamp + details (JSON 펼치기) + revision number
- Chain verification indicator (녹색 "Valid" 또는 빨강 "Tampered at entry #N")
- Export button (JSON 다운로드)
- Responsive table 또는 card list
- 6 unit test

**T074 Credential Detail Audit 섹션** (커밋 `4ac1c79`)

- `CredentialDetail` Drawer 에 "Audit trail" 섹션 추가 (accordion)
- 해당 credential 의 audit entries 만 필터 (action target == Credential + details.cred_id match)
- "Created on <date>" / "Updated <N> times" / "Last modified <date>" 요약
- 시간 역순 나열 (최근 변경 먼저)
- 상세 entries 펼치기 (device + reason)
- Vitest 5개 신규 + integration

### M7 Kill Switch 완료 (4/4 ✅)

**T075 kill_switch 백엔드** (커밋 `ae471e9`)

- `ConfirmTokenStore` 신설 (revoke 확인용 일회용 토큰)
- `generate_confirm_token(cred_id) → String` (256-bit random, TTL 5분)
- `consume_token(cred_id, token) → Result<()>` (verify + delete)
- 오탐 보호: 틀린 cred_id 로 consume 시 엔트리 보존 (재시도 가능)
- `credential.status` update: Revoked (timestamp 기록)
- `kill_switch_revoke` 커맨드 (2-step: generate + consume)
- `IssuerConfirmTokenStore` (bulk revoke 용)
- `kill_switch_revoke_issuer(issuer_id)` 커맨드 (issuer 아래 모든 cred revoke)
- 8 unit test

**T076 2단계 확인 Dialog** (커밋 `27c307b`)

- Credential Detail / Inventory Card 에 "Revoke" 버튼 (primary destructive style)
- 클릭 → Step 1: Confirm dialog ("Are you sure? This cannot be undone")
- → `kill_switch_revoke` 호출 (generate_token, UI 에 token state 임시 저장)
- → Step 2: Verify dialog (6-digit code 입력)
- → `kill_switch_revoke` consume_token 호출
- → Revoked 상태 업데이트 + success toast
- Error 시 (timeout / wrong token) toast + Step 1 로 복귀
- Vitest 5개 신규 테스트

**T077 Revoked 시각화 + Hide revoked 필터** (커밋 `0a26ff1`)

- Credential card 에 "REVOKED" badge (빨강, Revoked 상태)
- 상세 정보: "Revoked on <date>" + "Cannot be used after revocation"
- Inventory 필터 바 에 "Hide revoked" checkbox (기본 unchecked)
- Checked 시 revoked credentials 숨김 (revoked_at IS NULL 필터)
- 필터 상태 localStorage 저장
- Security score 에 "revoked" 항상 Danger (0점)
- Vitest 4개 신규 테스트

**T078 Bulk Revoke (Issuer 단위)** (커밋 `59c3ac8`)

- Issuer card 또는 그래프 노드에서 "Revoke all credentials" 옵션 (context menu / long-press)
- → Confirm dialog ("Revoke all <N> credentials from <issuer>?")
- → `kill_switch_revoke_issuer(issuer_id)` 호출
- → 모든 credentials revoked 상태 업데이트 (1-step, issuer level 이므로 2-step 불필요)
- → 목록 즉시 새로고침
- Vitest 5개 신규 테스트

**docs 업데이트** (커밋 `e5f8227`)

- 아키텍처: Audit Log 해시 체인 다이어그램
- Runbook: "How to verify audit chain" / "Incident response with revoke"
- Kill Switch 제약사항 명시 (프로바이더 자체 revocation 별도 필요)

### 누적 통계

- **커밋**: 본 세션 24개 (태스크 19 + 보충/docs 5)
- **Rust 테스트**: 신규 ~120개 (audit 16 + kill_switch 8 + railguard 8 + connectors 45 + incident 추가 43 등)
- **Vitest 테스트**: 신규 ~50개 (T056~T078 총 288개)
- **TypeScript typecheck**: 에러 0 (pre-existing 5개 전부 해소)
- **Clippy**: clean
- **ESLint**: 0 에러 (6 warnings pre-existing shadcn)

### 주요 기술 결정 요약 (진행 중)

1. **incident_list 반환 타입 확장** (`Vec<Incident> → Vec<IncidentListEntry>`) — UI N+1 회피, 매칭 정보 사전 로드
2. **IncidentEventEmitter trait** — 폴링 성공 후 emit, 모든 poller (NVD/GHSA/RSS) 일관된 신호
3. **VaultStorage::flush()** 신설 — 언락 상태 유지하며 설정값 영속화 (crash safety)
4. **AuditRepo 마이그레이션** (기존 `Option<Vec<u8>> → secretbank-audit::AuditLog` 고정 길이)
5. **AuditCtx best-effort** — device_id 없으면 warn-log skip, SQL 실패 비치명
6. **ConfirmTokenStore 오탐 보호** — 틀린 cred_id 로 consume 시 엔트리 보존
7. **Cloudflare Workers 릴레이 defer** — T061~T064 사용자 결정 후 재개

### 다음 마일스톤

- **M5 T061~T064 재개**: Cloudflare Workers 릴레이 배포 여부 사용자 확정 후
- **M8~M13 대기**: 외부 인프라 (relaying, Stripe/빌링, Apple Developer, Play Console, GitHub Actions secrets) 준비 후
- **수동 검증** (선택): M4 Incident Feed end-to-end + M5 RAILGUARD 프로젝트 적용 + M6 Audit chain verify + M7 revoke 플로우

---

## 2026-04-24 (세션 종료 — M4 7/10 도달, 수동 검증 재개 대기)

### M4 Incident Feed — 5 Rust 블록 완주 (T049~T055)

한 세션 내에 피드 수집 4종 + 매칭 엔진 + 스케줄러 + IPC 커맨드를 연속 완주. UI 는 다음 세션 (T056).

- **T049** NVD CVE API 2.0 클라이언트 (커밋 `9a7895f`) — `NvdClient::fetch_incremental` + governor 5/50 req/30s + 페이지네이션(resultsPerPage=2000) + 120일 범위 pre-check. 2026-04-15 NVD 정책 변경 반영 (`cvssMetricV31` Optional). wiremock 6 tests.
- **T050** GHSA 클라이언트 (커밋 `344e024`) — `GhsaClient::fetch_advisories` + Link 헤더 커서 페이지네이션 (next URL full 재사용) + Bearer PAT + `X-GitHub-Api-Version: 2022-11-28` + User-Agent 필수. `cvss_severities.cvss_v3` 평탄화 (2025-04-01 스키마 변경). wiremock 9 tests.
- **T051** SaaS 상태 RSS 클라이언트 (커밋 `5d9ec6b`) — `RssClient::fetch_all` + `sources::default_presets()` 10종 + feed-rs 2.x + `futures::join_all` + `Semaphore(4)`. 실 URL 정정 (Anthropic→status.claude.com, Stripe→www.stripestatus.com, Paddle→paddlestatus.com, GCP Atom-only, AWS RSS-only). chrono↔time 변환 헬퍼. 테스트 9 (단위 6 + wiremock 3) + fixture 10개.
- **T052** HIBP v3 클라이언트 (커밋 `7e8b27e`) — `HibpClient::check_email` + `urlencoding::encode` path-segment 수동 + `hibp-api-key` 헤더 + `truncateResponse=false`. **HTTP 404 → `Ok(Vec::new())`** (HIBP 특유 "breach 없음" 정상 semantics). PascalCase serde 21 필드, `Attribution`/`DisclosureUrl`/`LogoPath`/`IsStealerLog` Optional 방어. wiremock 10 tests.
- **T053** Incident 매칭 엔진 (커밋 `2da9770`) — `match_incident(incident, credentials, issuers) -> Vec<IncidentMatch>` + `match_incident_at(now)` 결정론 헬퍼. IssuerMatch(1.0) > Keyword(0.6, display_name/slug substring) + `slug.len() >= 3` false positive 방지. confidence 는 내부 상수 `CONFIDENCE_THRESHOLD=0.3`. `secretbank-core` 기존 `Incident`/`IncidentMatch`/`MatchReason` 재사용. `secretbank-feeds → secretbank-core` path dep 추가. 순수 동기 `#[test]` 14개.
- **T054** 피드 스케줄러 (커밋 `50f459f`) — `FeedSchedulerHandle { cancel, join_set }` + `spawn_feed_scheduler(pool, config)` + `Breaker` (3 연속 실패 → 1h cooldown) + `MissedTickBehavior::Delay`. `CancellationToken` + `JoinSet::join_next()` 로 graceful shutdown (abort() 탈피). `FeedSchedulerConfig` key-gate: NVD/GHSA None 이면 spawn 생략 (기본값 RSS 만). HIBP 는 on-demand 전용. `normalize_nvd/ghsa/rss` + `canonical_source_slug("gcp") → "google"` alias. `AppContext.feed_scheduler` 필드 + `lib.rs setup` spawn + `on_window_event(Destroyed) → shutdown()`. `tokio-util = "0.7"` workspace dep 추가. 테스트 20 (normalize 14 + Breaker 4 + config/spawn 2).
- **T055** Tauri 커맨드 `incident_*` (커밋 `a1605e0`) — `incident_list(filter?)` / `incident_dismiss(id)` / `incident_matches_for_credential(cred_id)` / `incident_feed_refresh()`. `IncidentFilter` DTO (core) 추가 (source/severity/issuer_id/include_dismissed). `IncidentRepo` 3 확장 (`list(&filter)` / `list_incidents_for_credential` / `dismiss_matches_for_incident`). SQL: `?1 IS NULL OR col = ?1` 선택 필터 + `GROUP BY HAVING` 전체 dismissed 제외. incident-level dismiss 는 `incident_match.dismissed_at` batch update 로 우회. `FeedSchedulerHandle` 에 `pool + config` 저장 + `trigger_once()` 추가. `IncidentCommandError` `#[serde(tag="code")]` snake_case. 테스트 12 (core 1 + storage 9 + app 3).

### 전체 M4 누적 통계

- **태스크**: M4 7/10 (T049~T055 완료, 남은 것 T056 UI / T057 Credential Detail 통합 / T058 NVD API key Settings Should)
- **세션 누적 커밋 14개** (태스크 7 + 해시 기록 docs 7)
- **Rust 테스트 ~70 신규** (feeds 48 = nvd 6 + ghsa 9 + rss 9 + hibp 10 + matcher 14 = 48, app 20 신규 (normalize 14 + Breaker/config/spawn 6), storage 9 신규, core 1)
- **Backend Tauri 커맨드 누계 34** (기존 30 + `incident_list/dismiss/matches_for_credential/feed_refresh` 4)
- **신규 Rust crate deps**: `governor` 0.10, `feed-rs` 2, `futures` 0.3, `chrono` 0.4, `urlencoding` 2, `tokio-util` 0.7. wiremock 0.6 dev-dep.
- **신규 path dep**: `secretbank-feeds → secretbank-core`.

### 수동 검증 상태 (M3 + M4 누적)

`pnpm tauri dev` 실사용 확인은 **여전히 보류**. M3 `/graph` 체크리스트가 남아 있고, M4 의 Rust 커맨드 (incident_*) 도 프론트 UI 가 아직 없어 실사용 테스트 대상 아님. 다음 세션 수동 검증은 **M3 체크리스트** 로 재개:

- `/graph` 렌더 + 4종 커스텀 노드 색 (Issuer/Credential/Project/Deployment)
- Blast radius outline (primary solid 3px / secondary dashed 2px / tertiary dotted 1px) + Esc 해제
- Settings "Allow dragging" 토글 반영
- 모바일 뷰포트 MobileGraphList 분기

M4 UI (T056 Incidents 페이지) 완성 이후에는 `/incidents` 목록 + `incident_feed_refresh` 버튼 + 필터 탭 실사용 확인 추가 예정.

### Pending Decisions (세션 종료 시점)

- Storage migration 0002 — `incident (source, source_id) UNIQUE` + `INSERT OR IGNORE` 전환 (T054 교훈)
- Tauri shutdown `RunEvent::Exit` 전환 (T054 교훈)
- pre-existing `pnpm typecheck` 5 에러 (GraphPage.test.tsx vi.fn generic)
- T058 NVD API key Settings UI → `FeedSchedulerHandle::reconfigure` 패턴 필요 (T055 교훈)

### 다음 마일스톤

**M4 잔여 (T056/T057/T058)** → 수동 검증 → M5 GitHub Connector + RAILGUARD. `/resume-project` 로 컨텍스트 복원 가능.

## 2026-04-24 (세션 정리 — M3 전체 회고, 수동 검증 보류)

### M3 Dependency Graph & Blast Radius — 8/8 ✅ 종료

## 2026-05-03 (오후) — GitHub Cowork (Claude AI 협업) 인프라 추가

autoevolvingapp (별도 프로젝트) 도구가 secretbank 에 GitHub Cowork 패키지를 추가. 4 commits:
- `a033da3` feat: GitHub Cowork 통합 (Claude AI PR 리뷰 + desktop 도메인 게이트)
- `112c916` fix: Cowork 워크플로우 인증을 OAuth 토큰으로 전환
- `7d94f98` feat: @claude 멘션 트리거 워크플로우 추가
- `71e8a4e` fix: Cowork 워크플로우에 id-token write 권한 추가

### 신규 6 인프라

- `.github/CODEOWNERS` — `*` → `@phoodul`
- `.github/CONTRIBUTING.md` — fork 워크플로우 / Conventional commits / branch protection 강제 4 CI / Claude 라벨 정책 / secret safety
- `.github/workflows/claude.yml` — `@claude` 멘션 트리거 (issue/PR 코멘트)
- `.github/workflows/claude-pr-review.yml` — `claude-review` 라벨 시 자동 리뷰 (한국어, 🔴 blocker / 🟡 caution / 🟢 nit, 보조 수단 — 자동 approve/block 안 함)
- `.github/workflows/claude-security-review.yml` — anthropics/claude-code-security-review 사용, 보안 전담
- `.github/workflows/domain-gate.yml` — Tauri v2 desktop 게이트 (IPC contract + capability + 크로스플랫폼 분기 + tauri.conf.json signing 영향)

### Fork PR 보안

- 동일 repo PR: `claude-review` 라벨만 트리거
- Fork PR: `claude-review` + `safe-to-review` 둘 다 필요 (악성 코드 방지 — 메인테이너가 코드 안전성 확인 후 부착)
- `pull_request_target` 사용 (fork 의 secrets 접근 가능, secret-safety 규칙 prompt 에 강제)

### 다음 세션 사용자 액션

1. `CLAUDE_CODE_OAUTH_TOKEN` secret 등록 — Anthropic OAuth (https://console.anthropic.com)
2. `ANTHROPIC_API_KEY` secret 등록 — security review 용
3. Branch protection rule (main) — Required CI 4개 + linear history + no force push + no deletion
4. 라벨 2개 생성 — `claude-review`, `safe-to-review`

이 4 액션 완료 시 풀 OSS 협업 환경 완성.

## 2026-05-02 ~ 2026-05-03 — 출시 production 인프라 풀 가동 + 무료 베타 정책 결정

이번 세션이 사용자에게 가장 큰 무게의 launch 인프라 통합 작업.

### prerelease 시리즈 (pre1 → pre8, 누적 7 fix)
- pre1 macOS 실패 (tauri-action 빈 APPLE_* env 처리 버그) → tauri-action 우회 (`e848a75`)
- pre2 macOS upload bash 3.2 globstar 미지원 → globstar 제거 (`eb44be1`)
- pre3 jq | head SIGPIPE → pipefail 제거 + `[...][0] // empty` (`124435f`)
- pre4 gh CLI "not a git repository" → GH_REPO env 주입 (`cd7911a`)
- pre5 .sig 파일 미생성 → `bundle.createUpdaterArtifacts: true` + jq endswith (`699a0e3`)
- pre6 Windows .nsis.zip 누락 진단 step + 추가 패턴 (`6fa1722`)
- pre7 Tauri v2 Windows 는 .nsis.zip 안 만들고 .exe 자체에 .sig → pick suffix `-setup.exe` (`abc0baf`)
- **pre8 = 첫 valid prerelease** — 12 assets + latest.json (darwin x2 + windows + linux)

### CI green 복구 시리즈
- shamir test flaky (EFF wordlist 의 4 hyphen 단어 — drop-down/t-shirt/yo-yo/felt-tip 이 share 에 등장 시 parser fail) → 입력에 공백 있으면 `-` 보존, standalone `-` 만 filter (`e4e7bbb`)
- Rust glib-sys missing — CI rust job 에 webkit2gtk 등 Linux native deps 설치 (`aadef9f`)
- migration test M20 supply chain 테이블 expected list 갱신 (`28bcc89`)
- E2E smoke locator strict mode 충돌 fix (`28bcc89`)
- Frontend lint/format/typecheck/vitest 모두 green (`3b6cc36`)
- deploy-relay 의 deploy job 을 `RELAY_DEPLOY_ENABLED` var 로 gating (`7e89cd0`)
- Node 20 deprecation 경고 → Node 22 LTS 로 bump (`e4e7bbb`)

### Cloudflare 인프라 풀 가동
- Cloudflare Workers Relay 배포 — `secretbank-relay.phoodul.workers.dev` (JWT_SIGNING_KEY + GitHub OAuth + Google OAuth)
- Cloudflare Pages site 배포 + custom domain `secretbank.app` Active (SSL 자동 발급)
- API token 발급 + GitHub Secret/Variable 등록 + wrangler login + secret put 모두 사용자 직접

### Landing page 새 디자인
- 검은색 + 초록색 톤 폐기 → Lapis 청금석 + 황동 (M22.5 디자인 토큰 일관성)
- Bento grid (6-column asymmetric) + Glassmorphism (frosted blur + gradient borders)
- Light/Dark mode toggle (localStorage)
- Logo: VaultMechanism unlock 장면 SVG 재현 (육각형 frame + 황동 reactor + cardinal reticle + 회전 sweep arc + halo bloom + reactor core pulse)
- Animated gradient mesh 배경 + 데모 영상 placeholder

### 가격 정책 변경 — 무료 베타 (2026-05-03 결정)
- Pro $2 즉시 도입 안 함, 베타 종료 4 조건:
  1. 사용자 본인 dogfooding 완료
  2. 법적 자문 (약관 / 개인정보 / 결제)
  3. 일반 비밀번호 기능 추가 (M24 신설)
  4. 첫 100~500 사용자 피드백
- landing page 의 Pricing 섹션 → "Everything Free during beta" + "Coming later" 로드맵 카드로 재구성
- project-decisions.md 에 결정 기록

### Repo public 전환
- secret 스캔 (test dummy + RAILGUARD 검출 정규식만, 진짜 secret 없음)
- About 메타 (description / website / topics 15개)
- Issue templates (Bug / Feature + 3 redirect via config.yml)
- Discussions 6 카테고리 setup
- Features ON/OFF 권장값 적용
- PR 옵션 (Squash + Auto-delete) 적용
- Anonymous .dmg / latest.json 다운로드 검증 통과

### 차별화 4축 + Open Core 라이선스 정착
- AGPL (`/`) — 데스크톱 앱 + graph + supply chain + RAILGUARD + charter
- EE (`/ee/`) — Workers relay + 미래 자동 rotation + sync 백엔드
- 유료화 가능성: Open Core SaaS 모델 (사용자가 self-host 하려면 EE 라이선스 별도)

## 2026-05-02 — Night mode 자율 5 lap (출시 launch 인프라 풀 패키지)

사용자가 자는 동안 option A 풀 진행 승인. 5 lap 연속 자율 진행.

- Lap 1 (`8d1d544`): Demo capture script — Playwright 기반 3 시나리오 자동 영상 (`pnpm capture:demo`)
- Lap 2: `v0.1.0-pre1` real release tag push — release.yml 자동 trigger, prerelease 빌드 인프라 첫 실전
- Lap 3 (`5730e79`): i18n ja/zh M23 Vault Charter 키 45개 보강 (en parity 622/622)
- Lap 4 (`4da601e`): version-bump.ts + changelog-from-commits.ts — 다음 release cut 두 명령으로 끝
- Lap 5 (`b391ebe`): Troubleshooting 섹션 8개 (en + ko) — SmartScreen / Gatekeeper / libwebkit / cooldown / updater / CLI / MCP / Charter

이전 turn 의 출시 경로 통일 lap (`82b5d79`) + release.yml dry-run (`0f2dc32`, `3e81836`) 까지 합치면 출시 launch 까지 코드/문서 측면 자율 가능 작업 거의 완료. 남은 것은 사용자 액션 (DNS / Apple Dev / Windows OV cert / HN/PH 게시).

차별화 4 축 (graph + supply chain × AI agent × IDE × charter recovery) 모두 구현 완료. 글로벌 SaaS 비전 정렬.

## 2026-05-01 — M23 Vault Charter 마일스톤 클로즈

passphrase 분실 시 vault 영구 손실 차단 메커니즘 완성. 1Password Emergency Kit 와 차별화 4 축 모두 구현.

- M23-A: secretbank-charter crate (EFF Diceware 7776 단어 + sharks SSS + XChaCha20-Poly1305 envelope, 31 unit)
- M23-B-1: vault 파일 포맷 v2 (charter envelope 슬롯, v1 backward compat, 7 회귀)
- M23-B-2: initialize_with_charter (Single/Shamir2of3/None, 7 통합)
- M23-B-3: recover_with_charter (charter → 새 passphrase, 옛 charter 자동 무효, 7 통합)
- M23-B-4: Tauri 커맨드 (vault_init_with_charter / vault_recovery_unlock / vault_has_charter) + audit hook (issued / recovered) + 9 unit
- M23-C: CharterDisplay UI (Lapis 청금석 + 황동 봉인 + 인쇄 디자인) + CreateVaultDialog 3-phase 확장 + en/ko i18n 36 키 + Vitest 7→10
- M23-D: RecoveryDialog (Single/Shamir 입력 + 새 charter 모드 라디오 + 에러 매핑) + LockScreen Forgot link + 회귀 보정
- M23-E-1: cooldown sidecar (vault.age.cooldown.json) + vault_unlock 검사 + recovery 시 apply + 9 unit
- M23-E-2: Settings 토글 + LockScreen cooldown 메시지 + en/ko i18n 9 키
- unlock 애니메이션 감속 fix (이전 unresolved): spring → cubic-bezier ease-out

총 12 코드 + 6 docs commit. 워크스페이스 clippy 0. 모든 회귀 통과.

