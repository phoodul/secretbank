# Tasks — API Vault

> 작성자: Planner Agent
> 작성일: 2026-04-22
> 참조: docs/architecture.md (구조), docs/implementation_plan.md (TDD 세부)
> 총 태스크: **125개** (Must 89 / Should 21 / Could 15)
> 총 마일스톤: **15개** (M0 ~ M14)

---

## 태스크 스키마

각 태스크는 다음 필드를 가진다.

- **ID**: `T001` ~
- **Milestone**: `M0` ~ `M14`
- **Priority**: `Must` (MVP 필수) | `Should` (MVP 가능하면) | `Could` (Phase 2)
- **Depends on**: 선행 태스크 ID (없으면 `-`)
- **Title**: 동사 + 대상
- **Goal**: 완료 시 무엇이 가능해지는가 (1~2줄)
- **Definition of Done**: 체크리스트 (2~6 항목)
- **Files Touched**: 변경/생성 예상 파일 목록
- **Tests**: 작성할 테스트 (Rust unit / Vitest / Playwright / manual)

---

## 마일스톤 목록

| ID  | 이름                            | 태스크 범위 | Must 개수 | Status (2026-04-23) |
| :-- | :------------------------------ | :---------- | :-------- | :------------------ |
| M0  | Foundation                      | T001~T012   | 12        | ✅ 12/12 완료       |
| M1  | Local Vault Core                | T013~T024   | 12        | ✅ 12/12 완료       |
| M2  | Inventory UI + 드롭&스캔        | T025~T040   | 13+3S     | ✅ 16/16 완료       |
| M3  | Dependency Graph & Blast Radius | T041~T048   | 7+1S      | ✅ 8/8 완료         |
| M4  | Incident Feed                   | T049~T058   | 8+2S      | ✅ 10/10 완료       |
| M5  | GitHub Connector + RAILGUARD    | T059~T068   | 10        | ✅ 10/10 완료 (T063 완료 2026-04-25; T064 완료 2026-04-25) |
| M6  | Audit Log                       | T069~T074   | 6         | ✅ 6/6 완료         |
| M7  | Kill Switch                     | T075~T078   | 4         | ✅ 4/4 완료             |
| M8  | Auth (Passkey + OAuth)          | T079~T086   | 8         | ✅ 8/8 완료 (T079 · T080 · T081 · T082 · T083 클라 9 커맨드 · **T084 SignIn UI** · T085 KDF · T086 refresh) |
| M9  | Sync Infrastructure             | T087~T096   | 10        | ✅ 풀 완료 (Phase A + B + C + D + E + F + G 모두 종료, 28/28 sub-phases). 다음 → M18 (CLI + MCP server) |
| M10 | Payments                        | T097~T103   | 7         | ⏳ 대기             |
| M11 | Mobile Port                     | T104~T109   | 6         | ⏳ 대기             |
| M12 | Web Read-Only Viewer            | T110~T113   | 4         | ⏳ 대기             |
| M13 | i18n + Updater + Release        | T114~T118   | 5         | ⏳ 대기             |
| M14 | Auto Rotation                   | T119~T125   | 7         | ⏳ 대기 (M9 완료 후 진입) |
| M15 | CI/CD Integration               | T126~T133   | 5M+3S     | 🔄 진입 (T132/T133 부터) |
| M16 | Anonymous Telemetry (opt-in)    | TBD         | TBD       | ⏳ placeholder (M9 완료 후 신설 — 익명 집계로 데이터 해자 회복) |
| M17 | SDK Ecosystem                   | TBD         | TBD       | ⏳ placeholder (M5 + M9 완료 후 신설 — npm / pip / cargo) |
| M18 | **CLI + MCP server**            | TBD         | TBD       | ✅ M18 v1 완료 (CLI 3 subcommand list/reveal/run + MCP 5 tools 포함 supply) |
| M19 | Team / org / shared vault       | TBD         | TBD       | ⏳ placeholder (B2B 진입, M18+M21 후 베타 사용자 피드백 기반) |
| M20 | Supply chain risk graph         | TBD         | TBD       | ✅ M20 v2 완료 (v1 manifest+OSV+매칭+Tauri+MCP / **v2 lockfile parsers (npm v3+/pnpm v6/Cargo) + semver range eval — false positive 제거**) |
| M21 | VS Code / JetBrains plugin      | TBD         | TBD       | ✅ M21 v3 완료 (v1 commands+statusbar+diagnostic / v2 LM tools + package.json hover / **v3 Cargo.toml hover + ManifestCodeLens — risky deps inline**). 다음 → M22 JetBrains |

---

## 진행 현황 — 완료된 태스크와 매핑된 커밋

매 태스크 구현이 끝나고 commiter 가 커밋을 만든 직후, orchestrator 가 이 표에 **즉시** 한 줄을 추가한다. 세션 종료 전에 누락 여부를 다시 확인한다.

| Task ID | 제목                                                        | 완료일     | 커밋 해시 |
| :------ | :---------------------------------------------------------- | :--------- | :-------- |
| T001    | Cargo 워크스페이스 분리 스캐폴드                            | 2026-04-22 | `855c33c` |
| T002    | Rust 핵심 의존성 (workspace.dependencies)                   | 2026-04-22 | `855c33c` |
| T003    | Tauri v2 플러그인 활성화 (9종, Stronghold 제외)             | 2026-04-22 | `da0e5ae` |
| T004    | LICENSE (AGPL-3.0) + LICENSE_FAQ.md                         | 2026-04-22 | `de3706d` |
| T005    | CLA 자동화 (CLA Assistant)                                  | 2026-04-22 | `de3706d` |
| T006    | 커밋 컨벤션 + lint 설정 (rustfmt/clippy/ESLint/Prettier/CI) | 2026-04-22 | `de3706d` |
| T007    | README.md 초안                                              | 2026-04-22 | `de3706d` |
| T008    | Tailwind v4 시맨틱 토큰 (vault-danger/warning/success/info) | 2026-04-22 | `77c8c18` |
| T009    | shadcn/ui primitive 12종 + Badge                            | 2026-04-22 | `77c8c18` |
| T010    | 라우팅 + 셸 레이아웃 (AppShell/Sidebar/BottomNav)           | 2026-04-22 | `3c7d12d` |
| T011    | i18n 초기 설정 (react-i18next, en/ko/ja)                    | 2026-04-22 | `3c7d12d` |
| T012    | 개발 가이드 `docs/dev-setup.md`                             | 2026-04-22 | `3c7d12d` |
| T013    | SQLite 초기 스키마 + 마이그레이션                           | 2026-04-22 | `df43b55` |
| T014    | VaultStorage trait 정의                                     | 2026-04-22 | `09b1079` |
| T015    | MockVaultStorage + contract tests                           | 2026-04-22 | `09b1079` |
| T016    | AgeVaultStorage (age 0.11 + 옵션 α)                         | 2026-04-22 | `c8b2c1e` |
| T017    | KDF 유틸 (Argon2id + HKDF)                                  | 2026-04-22 | `2ac1674` |
| T018    | OS Keyring 래퍼                                             | 2026-04-22 | `2ac1674` |
| T019    | SQLite 레포지터리 9개                                       | 2026-04-22 | `57959f7` |
| T020    | 도메인 모델 (api-vault-core)                                | 2026-04-22 | `57959f7` |
| T021    | Tauri 커맨드 vault_init/unlock/lock/status                  | 2026-04-22 | `9d6841c` |
| T022    | Tauri 커맨드 credential\_\* (CRUD + reveal)                 | 2026-04-22 | `9d6841c` |
| T024    | Lock Screen + Create Vault Dialog (zxcvbn 강도 미터)        | 2026-04-22 | `7946476` |
| T023    | 클립보드 자동 만료 30초 (취소 토큰 + countdown 이벤트)      | 2026-04-22 | `71d37bc` |
| T025    | Inventory 페이지 목록 뷰 + 필터 바                          | 2026-04-23 | `ab69319` |
| T028    | Issuer 프리셋 10종 시드 + issuer_list/get 커맨드            | 2026-04-23 | `539347f` |
| T026    | Credential 등록 다이얼로그 (Dialog + Popover/Command 콤보박스) | 2026-04-23 | `a7e1d58` |
| T027    | Credential 상세 Drawer (Sheet + 클립보드 30초 Progress + 삭제) | 2026-04-23 | `4cbf8c0` |
| T029    | Cmd+K Command Palette (10 actions + localStorage recent)     | 2026-04-23 | `67dd892` |
| T030    | Settings 페이지 + settings_get/set 커맨드 + auto-lock 저장      | 2026-04-23 | `96337a5` |
| T031    | Auto-lock idle 타이머 (use-idle-lock + AutoLockGuard)        | 2026-04-23 | `34e8a90` |
| T032    | 드롭 존 + /onboarding/scan placeholder (Tauri v2 onDragDropEvent) | 2026-04-23 | `6f121ee` |
| T033    | env_scanner (엔트로피 3.5 + issuer regex 10 + .env/generic 파서)  | 2026-04-23 | `8e7c7a2` |
| T034    | env_scan_folder Tauri 커맨드 (spawn_blocking + scan:progress) | 2026-04-23 | `eeab911` |
| T035    | 드롭&스캔 결과 검토 UI + project/usage Tauri 커맨드             | 2026-04-23 | `6f31d56` |
| T011+   | i18n 중국어(zh-간체) 로케일 추가 (follow-up)                    | 2026-04-23 | `1168210` |
| T036    | Welcome 3단계 온보딩 + RequireOnboarding 가드                   | 2026-04-23 | `e22c452` |
| T037    | Project 관리 페이지 (CRUD + 연결 credential 뷰)                 | 2026-04-23 | `bf67527` |
| T038    | Deployment 관리 (ProjectDetail 내부 섹션, 플랫폼 5종)           | 2026-04-23 | `3072909` |
| T039    | Usage 링크 UI (Credential ↔ Project 수동 연결, usage_delete)    | 2026-04-23 | `cff6bf8` |
| T040    | Inventory 보안 점수 + SecurityDot (3단계 + 7 factor)            | 2026-04-23 | `11281cd` |
| T041    | `api-vault-core` 그래프 모델 (petgraph DiGraph)                 | 2026-04-23 | `5256f71` |
| T042    | Credential blast radius BFS 엔진                                | 2026-04-23 | `533485c` |
| T043    | Tauri commands `graph_fetch` + `blast_radius_for_credential`    | 2026-04-23 | `67cee48` |
| T044    | React Flow 셋업 + dagre 레이아웃 /graph 페이지                  | 2026-04-23 | `b118c99` |
| T045    | 커스텀 React Flow 노드 4종 (Issuer/Credential/Project/Deployment) | 2026-04-23 | `07ff733` |
| T046    | Blast Radius Highlight — credential 클릭 시 노드 3단계 강조     | 2026-04-23 | `4abe502` |
| T047    | Graph performance optimization — memo 비교 + 뷰포트 컬링 + compact 모드 | 2026-04-23 | `1477c0f` |
| T048    | Mobile graph alternate view — MobileGraphList + useIsMobile + GraphPage mobile 분기 | 2026-04-23 | `ebb9855` |
| T049    | NVD CVE API 2.0 클라이언트 (api-vault-feeds 크레이트 + governor rate limiter + wiremock 6 tests) | 2026-04-24 | `9a7895f` |
| T050    | GHSA 클라이언트 (GhsaClient + Link 헤더 커서 페이지네이션 + wiremock 9 tests) | 2026-04-24 | `344e024` |
| T051    | SaaS 상태 RSS 클라이언트 (RssClient + 10 프리셋 + feed-rs + 9 tests)           | 2026-04-24 | `5d9ec6b` |
| T052    | HIBP v3 클라이언트 (HibpClient + check_email + urlencoding + wiremock 10 tests) | 2026-04-24 | `7e8b27e` |
| T053    | Incident 매칭 엔진 (match_incident + IssuerMatch/Keyword + 14 tests)            | 2026-04-24 | `2da9770` |
| T054    | 피드 스케줄러 (FeedSchedulerHandle + Breaker + normalize 3종 + 20 tests)        | 2026-04-24 | `50f459f` |
| T055    | Tauri 커맨드 incident_* (list/dismiss/matches_for_credential/feed_refresh + IncidentFilter + repo 확장 + 12 tests) | 2026-04-24 | `a1605e0` |
| T056    | Incidents 페이지 UI (IncidentsPage + IncidentCard + use-incidents + types + i18n 4개 로케일 + Vitest 5 tests + incident_list 반환 확장 + FeedScheduler incidents:updated emit) | 2026-04-25 | `7bfac7c` |
| T057    | Credential Detail에 Incidents 섹션 통합 (list_incidents_with_matches_for_credential + IncidentsForCredential + use-incidents-for-credential + i18n 4개 + Vitest 5 tests + 2 repo tests) | 2026-04-25 | `3858a5d` |
| T058    | NVD API Key Setting UI (VaultStorage::flush + vault_setting_get/set 커맨드 + IntegrationsSection + i18n 4개 + flush/locked 테스트 2개 + 커맨드 테스트 5개 + Vitest 6 tests) | 2026-04-25 | `35548dd` |
| T059    | Connector trait 정의 (Auth/RemoteKey/RotationCap/ConnectorError + async_trait + MockConnector feature-gated + 6 tests)                                                       | 2026-04-25 | `119e11c` |
| T060    | GitHub App 등록 runbook + GithubConnector skeleton (Connector impl placeholder + 4 tests)                                                                                    | 2026-04-25 | `ec6b042` |
| T065    | RAILGUARD 템플릿 라이브러리 (4 tpl + render() + 8 snapshot tests)                                                                                                              | 2026-04-25 | `8ec8b32` |
| T066    | RAILGUARD preview/apply Tauri 커맨드 (ApplyMode: Overwrite{backup}/Append/SkipExisting + atomic tmp→rename + 6 tempdir tests)                                                | 2026-04-25 | `f57e84a` |
| T067    | RAILGUARD UI (/railguard 페이지 + 프로젝트 경로 + 4 체크박스 + Preview/Apply 2단계 + DetectedKeysReview CTA + Sidebar/BottomNav nav + Vitest 6)                                | 2026-04-25 | `892f671` |
| T068    | DetectedKeysReview → RAILGUARD 조건부 CTA (mount 시 railguard_preview 탐색, 모두 존재하면 숨김 + Vitest +1)                                                                   | 2026-04-25 | `d23ef6d` |
| T069    | api-vault-audit 크레이트 (append/verify + ed25519 + SHA-256 canonical + 7 tests)                                                                                              | 2026-04-25 | `79a8c1e` |
| T070    | Device identity 서비스 (ensure_device_keys: 볼트 + SQLite + 3원 정합 + partial-state 복구 + 3 tests)                                                                          | 2026-04-25 | `ee30a79` |
| T071    | Audit write 훅 모든 mutating 커맨드 (AuditCtx best-effort + 15 커맨드 훅 + AuditRepo 재작성 + 4 tests; DoD 편차: SQL 트랜잭션 래핑 미적용)                                   | 2026-04-25 | `e55b03d` |
| T072    | audit_list + audit_verify_chain 커맨드 (AuditEntry/ChainVerifyReport + hex 인코딩 + device별 VerifyingKey 검증 + 5 tests)                                                    | 2026-04-25 | `cf01646` |
| T073    | Audit UI (/audit 타임라인 + VerifyChainBanner + AuditFilterBar + 44 i18n 키 + Vitest 6)                                                                                        | 2026-04-25 | `4a3d8e2` |
| T074    | CredentialDetail Audit 섹션 (AuditForCredential + AuditPage useSearchParams 프리필 + action-family 공유 유틸 + Vitest 5)                                                      | 2026-04-25 | `4ac1c79` |
| M6 정책 | canonical_bytes 포맷 정정 + payload 라벨 제거 (정책 hotfix 1)          | 2026-04-25 | `36c54b5` |
| T075    | Kill Switch 백엔드 (ConfirmTokenStore 16바이트 hex 토큰 TTL 5분 + kill_switch_request_confirm + kill_switch_revoke {cred_id, token, also_delete_value} + 오탐 보호 + 6 tests) | 2026-04-25 | `ae471e9` |
| T076    | Kill Switch Dialog (2단계 확인 다이얼로그 + useKillSwitch 훅 + KillSwitchDialog + Vitest 5 tests) | 2026-04-25 | `27c307b` |
| T077    | Revoked 시각화 + Hide revoked 필터 (CredentialCard/List 상태 뱃지 + HideRevoked 체크박스 + Vitest +3) | 2026-04-25 | `0a26ff1` |
| T078    | Bulk Revoke Issuer 단위 (IssuerConfirmTokenStore + kill_switch_request_confirm_issuer + kill_switch_revoke_issuer + progress 이벤트 + BulkRevokeDialog + useBulkKillSwitch + Inventory 통합 + i18n 4개 + Rust 9→9+2 tests + Vitest 5 tests + InventoryPage +2 tests; DoD 편차: IssuerDetail 페이지 대신 InventoryPage issuer 필터 통합) | 2026-04-25 | `59c3ac8` |

| T079    | Cloudflare Workers 릴레이 스캐폴드 (Hono + GET /health + D1/KV + vitest 7 tests)                                                                                                | 2026-04-26 | `4ec6248` |
| T061    | GitHub installation-token 엔드포인트 (POST + KV캐시 55분 + Rust fetch_installation_token + wiremock 3 tests)                                                                    | 2026-04-26 | `4ec6248` |
| T062    | GitHub Secret Scanning alerts API (list_alerts_with_base + RepoRef + with_repos 빌더 + list_keys 통합 + 9 tests)                                                                | 2026-04-26 | `6ddce61` |
| T063    | GitHub Connector UI (Settings 통합) — github.rs commands 5종 + vault_settings 확장 + GithubIntegrationSection + use-github-integration 훅 + i18n 4 로케일 + 테스트 9종           | 2026-04-26 | `0c517ba` |
| T064    | Pro 엔타이틀먼트 게이트 — entitlement.rs + commands/entitlement.rs + github/kill_switch NotPro 게이트 + SubscriptionSection + use-entitlement + GithubIntegration/InventoryPage Pro lock + i18n 4 로케일 + Rust 6 + Vitest +7 | 2026-04-26 | `8ef4ebb` |
| T132    | M15 internal — deploy-relay.yml 워크플로우 (cloudflare/wrangler-action@v3 + CLOUDFLARE_API_TOKEN + concurrency 원자성)                                                          | 2026-04-26 | `bf06db7` |
| T133    | M15 internal — ci.yml ee-relay job 추가 (typecheck + test, 시크릿 없어 fork PR 통과)                                                                                            | 2026-04-26 | `bf06db7` |
| T080    | D1 auth 스키마 마이그레이션 0002_auth.sql (user 컬럼 6 + device/passkey/oauth_account 3 신규) + Drizzle schema 동기화 + readD1Migrations TEST_MIGRATIONS 주입 + db.test.ts 4건 | 2026-04-27 | `6929c91` |
| T081    | Passkey (WebAuthn) 4 엔드포인트 (register/start, register/verify, assert/start, assert/verify) + JWT pair (HS256 access 1h / refresh 30d) + KV challenge (5분 TTL, consume-once) + salt_auth/salt_enc base64url 응답 | 2026-04-27 | `c60e023` |
| T082    | OAuth 2.0 (GitHub + Google) start/callback — buildAuthorizeUrl + exchangeCode + (provider, provider_id) UNIQUE 매핑 + email-private 폴백(/user/emails) + 9 회귀 테스트                    | 2026-04-27 | `11eeeea` |
| T086    | POST /auth/refresh — refresh token rotation (use=refresh 검증, access 거부, 새 페어 발급으로 leak 윈도우 30일 제한) + 4 회귀 테스트                                                       | 2026-04-27 | `03a0480` |
| T083-A  | RelayClient + AuthSession 서비스 골격 (services/relay_client.rs + services/session.rs + AppContext 확장 — relay_client 6 + session 6 회귀 = 12)                                          | 2026-04-27 | `1ec7a15` |
| T083-B  | Passkey 4 커맨드 (auth_passkey_register/assert × start/verify) + complete_session 헬퍼 + AuthCommandError + wiremock 6 회귀                                                              | 2026-04-27 | `2f17917` |
| T083-C  | OAuth(GitHub/Google) 2 커맨드 + tauri-plugin-deep-link `apivault://` scheme 등록 + on_open_url emit + tauri-plugin-opener 전환 + CSP 확장 + wiremock 5 회귀                                | 2026-04-27 | `e159415` |
| T083-D  | auth_refresh / auth_signout / auth_status + hydrate_session_from_vault 자동 통합 (vault_unlock 후 hydrate, vault_lock 시 메모리 캐시 None) + wiremock 5 회귀 = T086 클라이언트 측 완성    | 2026-04-27 | `7df5888` |
| T085    | Zero-Knowledge KDF — services/session.rs::derive_session_keys(passphrase, salt_auth_b64, salt_enc_b64) → DerivedSessionKeys{auth_hash, enc_key}. base64url 디코드 + SaltsIdentical/InvalidSalt 가드 + 회귀 4 (결정론 / 다른 salt → 다른 키 / 같은 salt 거부 / malformed base64) | 2026-04-28 | `17da027` |
| T084    | SignIn UI — `/auth/sign-in` (PasskeyButton + OAuthButton GitHub/Google + Keep offline) + use-deep-link-callback `apivault://auth/callback` 파서 + use-auth-session 훅 + Settings → CloudSyncSection 진입점 + i18n 4 로케일 + Vitest +19 (parser 4 / PasskeyButton 5 / OAuthButton 3 / SignInPage 4 / CloudSyncSection 3) — **M8 8/8 완료** | 2026-04-28 | `d619566` |
| T087-A  | M9 Phase A — Yjs + y-indexeddb dep + SyncProvider 골격 (Y.Doc 인스턴스 + IndexedDB persistence + useSync/useYMap 훅, App.tsx 마운트는 Phase B 까지 보류) + Vitest +4 + `docs/m9-phase-plan.md` (7-phase 분할 계획서, Open Issues 4건 명시) | 2026-04-28 | `40e630b` |
| T087-B  | M9 Phase B — AuthSession enc_key 라이프사이클 + verify 흐름 derive 통합 + sync_get_root_key 커맨드. 3 sub-phase 분할 (B-1 메모리 구조 + master_passphrase / B-2 verify+hydrate 자동 derive / B-3 sync_get_root_key). Rust lib 회귀 +16 (B-1 +5, B-2 +6, B-3 +5). project-decisions [2026-04-28] B 의 Auto-derive on unlock 디자인 구체화 | 2026-04-28 | `ead6834` (B-1), `fe3f522` (B-2), `dcc01e2` (B-3) |
| T087-C  | M9 Phase C — secsync 5개 stable 체크리스트 검증 결과 3 fail (npm publish 22개월 정지 + WS 전용 transport + beta 명시) → **fallback D 자동 채택** (사용자 결정 4 사전 승인). `SyncTransport` interface + `StubTransport` (Phase E 의 RelayTransport 도입 전 placeholder) + SyncProvider 확장 (`sync_get_root_key` invoke + rootKey context 노출 + NoSyncSession → status='offline_only' + unmount 시 transport.disconnect 자동). project-decisions D.1 갱신, m9-phase-plan.md Phase C 정정. Vitest +10 (Phase A 4 / Phase C 4 / transport 6) | 2026-04-28 | `b550575` |
| T087-B-4 | M9 Phase B-4 — OAuth callback salts (relay→client). `OAuthCallbackResponse` (services/session.rs) 가 `#[serde(flatten)] tokens` + `salt_auth` + `salt_enc` 로 분리. `exchange_oauth_callback` 가 응답의 salts 를 `complete_session(.., Some(...))` 로 forward — Passkey verify 와 동일 흐름. 회귀 갱신 1 (`_persists_session_and_records_salts`) + 신규 1 (`_with_passphrase_derives_enc_key`). Rust lib 152 → **153 (+1)**. clippy 0 warning. (relay 측은 T082 시점에 이미 salts 포함 응답 — 클라이언트 와이어가 ignore 하던 dead path 정리) | 2026-04-28 | `4f6ced0` |
| T087-D-1 | M9 Phase D-1 — mapping framework (D 분할 진입). `src/features/sync/origin.ts` (ORIGIN_LOCAL_DB / ORIGIN_REMOTE Symbol + runWithOrigin/isSyncOrigin 헬퍼 — Yjs transaction.origin 으로 무한 루프 방지) + `mapping.ts` (SYNC_ENTITIES 화이트리스트 6 + EntityMapper interface + 첫 reference `credentialMapper` — vault_ref/hash_hint/usages/score 4 device-local 필드 제외). Vitest +7 (whitelist match / origin round-trip / isSyncOrigin / toYMap 제외 / round-trip / device-local default / entity match). 백엔드 emit hookup 과 나머지 5 엔티티 매퍼는 D-2 로 분할 | 2026-04-28 | `2ba0069` |
| T087-D-2a | M9 Phase D-2a — 5 추가 엔티티 매퍼 (issuer/project/deployment/usage/settings) + ENTITY_MAPPERS registry. issuer/deployment/usage 는 모든 필드 sync. **project.local_path 는 device-local** (디바이스마다 다른 경로). settings 는 키-값 스토어 + `SYNC_SETTING_KEYS` 화이트리스트 (`isSyncableSettingKey` 헬퍼) — 새 setting 은 명시적 opt-in. Vitest +13 (issuer round-trip / project local_path 제외 + null 기본값 / deployment round-trip / usage round-trip / setting 화이트리스트 4 + round-trip + entity match / SYNC_SETTING_KEYS 정책 / ENTITY_MAPPERS registry 6 entity 커버리지) | 2026-04-28 | `7ca9a06` |
| T087-D-2b | M9 Phase D-2b — 백엔드 db:changed emit 통합. `services/sync_emit.rs` (`DbChangeEntity` 6 + `DbChangeOp` Upsert/Delete + `DbChangePayload` + `DbChangeEmitter` trait + `TauriDbChangeEmitter` prod / `NoopDbChangeEmitter` test) + `AppContext.db_change_emitter` 필드 + `AppContext::new(.., emitter)` 시그니처 변경 + lib.rs setup 에서 prod emitter 주입. 14 mutating 커맨드 hookup: credential 4 + kill_switch revoke (do_revoke_internal 공유) + settings 1 (None=delete / Some=upsert) + project 3 + deployment 3 + usage 2. issuer 는 사용자 mutation 명령 없어 emit 부착 없음 (preset seed 만). Rust lib 153 → **158 (+5)** sync_emit unit 회귀. clippy 0 | 2026-04-28 | `cfc1472` |
| T087-D-3 | M9 Phase D-3 — origin loop 회귀 + observer/bridge. `src/features/sync/observer.ts`: `observeMapWithOriginGuard` (sync origin LOCAL_DB/REMOTE 의 변경은 콜백 skip — user-edit propagation 채널만) + `applyDbChangeToYMap` (db:changed payload → Y.Map.set/delete with ORIGIN_LOCAL_DB transaction). settings 화이트리스트 적용. Vitest +10: observer (LOCAL_DB skip / REMOTE skip / user-origin propagate / unsubscribe) + bridge (upsert placeholder / upsert with value / delete present + missing / settings whitelist) + integration (db:changed 다중 echo 가 observer 발화 안 함 / user edit + 후속 echo 의 격리). **M9 Phase D 풀 완료** | 2026-04-28 | `10bdb92` |
| T087-E-1 | M9 Phase E-1 — AEAD adapter (XChaCha20-Poly1305 via @noble/ciphers v2.2.0). `src/features/sync/aead.ts`: 32B key + 24B random nonce + 16B Poly1305 tag. encrypt/decrypt + generateNonce + 키/envelope 길이 가드 + AAD 옵션. **왜 XChaCha20-Poly1305**: 24B nonce → random sampling 안전 (vs ChaCha20 의 12B + 2^32 한계), libsodium wire-호환 (미래 C/Swift 클라). Vitest +10 (round-trip / 다른 키 throw / ciphertext 1B tamper / nonce tamper / 빈 plaintext / AAD mismatch / 키 길이 가드 / envelope 길이 가드 / 동일 평문 두 번 encrypt 시 다른 envelope / generateNonce 무작위성). 신규 dep `@noble/ciphers ^2.2.0` (audited, MIT, 작은 번들). 전체 Vitest 386 → **396** | 2026-04-28 | `6d3b6aa` |
| T087-E-2 | M9 Phase E-2 — relay D1 0003_sync + endpoint 골격. `encrypted_doc` (user_id PK + version + ciphertext BLOB + cascade FK). 1 user = 1 doc 모델. `routes/sync.ts`: GET /sync/snapshot?since=N (200/204/401/400) + POST /sync/snapshot (200 with version / 401 / 400 / 413 1MB). Bearer access JWT (verifyToken use='access'). UPSERT 로 첫 push insert / 후속 version+1. relay vitest 35 → **36 (+1: encrypted_doc PK + cascade)** | 2026-04-28 | `af307c5` |
| T087-E-3 | M9 Phase E-3 — rate limit + Miniflare 회귀. `lib/rate-limit.ts`: KV fixed-window (per-user) 100req/min — sliding window 보다 단순, 경계 burst 는 보호 목적엔 무관. eventual consistency OK. routes/sync.ts 의 GET/POST 양쪽에 적용 (429 + Retry-After). relay vitest +10 (auth: 401 missing/invalid / validation: 400 negative since + missing ciphertext + 413 over-1MB / round-trip: POST→GET 200/204 + version monotonic + 신규 user 0/null / rate limit: 100→429 + per-user 격리). 36 → **46** | 2026-04-28 | `97712e6` |
| T087-E-4a | M9 Phase E-4a — RelayTransport (AEAD + HTTP wire) 골격. `src/features/sync/relay-transport.ts`: SyncTransport interface 충족, push (encrypt → POST /sync/snapshot, version 보관) + pollOnce (GET /sync/snapshot?since=lastVersion, 200=decrypt+emit / 204=no-op / 401=error / 429=ignore / non-2xx=error). **AAD = `user:<userId>`** — cross-user replay 차단. `getSessionKey()` null 시 push throw, poll error. manualPolling=true 옵션 (테스트 timer 의존성 회피). Vitest +13 (push: encrypt + bearer + plaintext leak guard / no-session throw / 401 throw — poll: decrypt + emit / 204 no-op / 401 error / 429 ignore / AEAD tamper error / cross-user AAD error / since 누적 — lifecycle: connect→connected, disconnect→disconnected, handler clear — Zero-Knowledge invariant 평문 누출 0). 전체 Vitest 396 → **409** | 2026-04-28 | `155c1a4` |
| T087-E-4b | M9 Phase E-4b — SyncProvider wiring (RelayTransport default). 신규 Tauri 커맨드 2건: `auth_get_access_token` (in-memory access JWT 반환, NoSession 에러) + `sync_get_relay_url` (relay_client.base_url() 반환). RelayTransport 의 baseUrl trailing-slash normalize. SyncProvider 의 sync boot 가 providedTransport 미공급 시 invoke 3건 (sync_get_root_key + auth_status + sync_get_relay_url) 후 RelayTransport 자동 생성 + connect. auth_status 가 null user_id 면 offline_only 폴백. Rust lib 158 → **162 (+4)** (auth_get_access_token: in-memory / no-session / refresh rotation 반영 + sync_get_relay_url 1). Vitest 409 → **411 (+2)** (default-transport happy path / null user_id offline_only) | 2026-04-28 | `113065c` |
| T087-E-5 | M9 Phase E-5 — 통합 round-trip (A push → mock relay → B pull). `__tests__/round-trip.test.ts`: 두 Y.Doc + 두 RelayTransport + in-memory MockRelay (Map<userId, snapshot>). MockRelay 는 실 relay 와 동일 wire (POST upsert version+1 / GET 200 with body or 204 if since == version). Vitest +5: A.set → B.applyUpdate state 동일 / multi-write latest snapshot / Zero-Knowledge raw envelope 평문 누출 0 + 다른 키 decrypt 실패 / poll twice with same lastVersion 204 (echo loop 없음) / AEAD sanity. 전체 Vitest 411 → **416**. **M9 Phase E 풀 완료** | 2026-04-28 | `61a1db3` |
| T087-F-1 | M9 Phase F-1 — value sync 채널 (D1 + relay endpoint). `0004_sync_values.sql` (`encrypted_secret_value` 테이블, PK (user_id, credential_id), version + ciphertext + updated_at, idx_user_updated, ON DELETE CASCADE FK to user). Drizzle `encryptedSecretValue` 추가. routes/sync.ts: POST /sync/values { credential_id, ciphertext_b64 } → 200 { version, updated_at } / 400 (missing/invalid credential_id) / 413 (64KB cap, value 한 row 의 합리 한도) + GET /sync/values?since=<ms> → 200 { values: [{ credential_id, version, ciphertext_b64, updated_at }] } / 400 / 401 / 429. since 가 ms timestamp 라 multi-credential 의 부분 변경분만 받음. relay vitest +8 (db: PK 충돌 + cascade / sync: 6 values endpoint 회귀). 46 → **54** | 2026-04-28 | `6d47f94` |
| T087-F-2 | M9 Phase F-2 — value_sync service + Tauri 커맨드. `chacha20poly1305 = 0.10` workspace dep + `api-vault-crypto::aead` (XChaCha20-Poly1305, frontend `@noble/ciphers` 와 wire 호환, 회귀 +9). `services/value_sync.rs`: derive_value_root_key (HKDF "value-root" subkey of enc_key) + AAD `user:<userId>:cred:<credentialId>` + push_value (encrypt + relay POST /sync/values) + pull_values_since (GET + decrypt 각 row → vault put_secret, 손상된 row best-effort skip). RelayClient 에 `post_json_authed` / `get_json_authed` (Bearer) 추가. Tauri 커맨드 `sync_value_push` / `sync_value_pull_since` 등록. crypto 회귀 +9, app 회귀 162 → **168 (+6)** (no-session × 2 / encrypt+post / pull+decrypt+vault upsert / 손상 row skip / round-trip A→B). clippy 0 | 2026-04-28 | `833081e` |

### Audit 무결성 hotfix + payload 점검 (2026-04-25, 태스크 진행 표에는 별도 항목 아님)

| 주제                                                                                         | 커밋 해시 |
| :------------------------------------------------------------------------------------------- | :-------- |
| canonical_bytes sentinel → existence flag 변경 + migration 0003 + 신규 테스트 1 (chain.rs)  | (미커밋)  |
| payload_json 라벨 제거 — 15 커맨드 점검, 6건 수정 (create/update fields, railguard fingerprint) + frontend lookup | (미커밋) |

### T054/T058 follow-up commits (Night mode 2026-04-25, 태스크 진행 표에는 별도 항목 아님)

| 주제                                                         | 커밋 해시 |
| :----------------------------------------------------------- | :-------- |
| typecheck 5 에러 hotfix (GraphPage.test.tsx vi.fn 시그니처)   | `c49ed8f` |
| Migration 0002 — incident (source, source_id) UNIQUE + INSERT OR IGNORE | `00e8bde` |
| RunEvent::Exit 전환 (scheduler shutdown 완료 보장)            | `6acbf64` |

### 재검증 라운드 hotfix (2026-04-27, 태스크 진행 표에는 별도 항목 아님)

| 주제 | 커밋 해시 |
| :--- | :-------- |
| **I4** Revoke 후 Radix compose-refs 무한 루프 — KillSwitchDialog/BulkRevokeDialog 부모 콜백 microtask defer | `6dda3e8` |
| **I5** Bulk revoke filter 에 `status=Active` 추가 — `ExpectedCountMismatch` 해결 + 회귀 테스트 1 | `cc1785b` |
| **I1/I2** Subscription 헤더 "Current plan: <Badge>" 그룹화 + Pro 활성 시 Upgrade 버튼 숨김 + 회귀 3 | `fea5562` |

### T083 수동 검증 라운드 hotfix (2026-04-27 → 2026-04-28, 태스크 진행 표에는 별도 항목 아님)

| 주제 | 커밋 해시 |
| :--- | :-------- |
| **J2** P0 — Passkey register_start/assert_start 에 vault unlocked 가드 누락 → OS Passkey 저장소와 서버 DB 비동기화 (NotAllowedError 회복 불가). 가드 추가 + direct_assert_start 헬퍼 + 회귀 2 | `5a556d4` |
| **J1** P2 — 로컬 D1 마이그레이션 미적용 (wrangler dev 자동 적용 안 함) → README + relay-deployment runbook 에 "신규 마이그레이션 시 재적용 필수 + 미적용 시 D1_ERROR no such column 발생" 경고 명시 | (이번 docs commit) |

### Night mode 정리 작업 (2026-04-27, 태스크 진행 표에는 별도 항목 아님)

| 주제 | 커밋 해시 |
| :--- | :-------- |
| Rust 1.95 새 clippy lint 14건 정리 (cloned_ref_to_slice_refs 9 + io_other_error 1 + unused_imports 1 + dead_code 1) | `a6b0a94` |
| KDF salt 시그니처 일반화 `&[u8; 16]` → `&[u8]` (T085 사전작업, M8 32바이트 salt 호환) | `d3a345f` |

### Night mode 3 인프라 작업 (2026-04-28, 태스크 진행 표에는 별도 항목 아님)

| 주제 | 커밋 해시 |
| :--- | :-------- |
| **I3 hotfix** — `useGithubIntegration` deep-link listener 표준화. `deep-link://github-callback` (lib.rs 가 emit 안 함, dead path) → `deep-link` 이벤트 + `apivault://github/callback` URL prefix 매칭. parseGithubCallbackUrl 헬퍼 + Vitest +8 + Setup URL 운영 가이드 강화 | `340e72c` |
| **Playwright browser-mode E2E 인프라** — `e2e/` 디렉토리 + `tauri-mock.ts` invoke polyfill + smoke 3 case (LockScreen / 라우팅 / SignInPage) + CI `e2e` 잡 + frontend 잡에 Vitest 통합 (이전 누락). Desktop binary E2E (tauri-driver) 는 진입 트리거 3가지 명시 후 deferred | `8672555` |
| **5건 결정 + Phased Expansion 기록** — Free 종류 무관 2대 / Auto-derive on unlock / SQLite 화이트리스트 / SecSync 잠정 / MVP API 특화 + v1.1 General Secrets + v1.2 자동입력. project-decisions.md + m9-phase-plan.md Open Issues Resolved 갱신 | `0593cc7` |

---

## M0 — Foundation

### T001. Cargo 워크스페이스 분리 스캐폴드

- **Milestone**: M0
- **Priority**: Must
- **Depends on**: -
- **Goal**: 현재 단일 `src-tauri/Cargo.toml` 구조를 `[workspace]` + `crates/*` 멀티 크레이트로 재구성.
- **DoD**:
  - `src-tauri/Cargo.toml` 이 `[workspace] members = ["crates/*"]` 로 변경됨
  - `crates/api-vault-core`, `api-vault-storage`, `api-vault-crypto`, `api-vault-audit`, `api-vault-feeds`, `api-vault-connectors`, `api-vault-railguard`, `api-vault-sync`, `api-vault-app` 9개 크레이트 생성 (stub lib.rs)
  - `api-vault-app` 이 기존 `src-tauri/src/lib.rs` 의 역할을 인계
  - `cargo build` 전 크레이트 성공
- **Files Touched**: `src-tauri/Cargo.toml`, `src-tauri/crates/*/Cargo.toml`, `src-tauri/crates/*/src/lib.rs`, `src-tauri/src/` (제거/이동)
- **Tests**: `cargo build --workspace` 통과; `cargo test --workspace` (빈 테스트 OK)

### T002. Rust 핵심 의존성 추가 (sqlx, tokio, serde, thiserror)

- **Milestone**: M0
- **Priority**: Must
- **Depends on**: T001
- **Goal**: 이후 크레이트가 쓸 공통 의존성을 workspace root 에 선언.
- **DoD**:
  - `[workspace.dependencies]` 에 `tokio`, `serde`, `serde_json`, `sqlx (features: runtime-tokio, sqlite, migrate, macros)`, `thiserror`, `anyhow`, `tracing`, `tracing-subscriber`, `ulid`, `time`, `reqwest (rustls-tls)` 등록
  - 각 크레이트의 `Cargo.toml` 에서 `{ workspace = true }` 로 참조
- **Files Touched**: `src-tauri/Cargo.toml`, `crates/*/Cargo.toml`
- **Tests**: `cargo build --workspace`

### T003. Tauri v2 플러그인 활성화 (sql, clipboard-manager, shell, os, updater, notification, biometric, deep-link, http)

- **Milestone**: M0
- **Priority**: Must
- **Depends on**: T001
- **Goal**: 향후 태스크가 쓸 Tauri 공식 플러그인을 설치하고 capability 초기화.
- **Historical Note (2026-04-22 갱신):** 최초 계획에는 `tauri-plugin-stronghold` 가 포함되어 있었으나, 2026-04-22 결정에 따라 볼트 암호화 엔진을 `age` crate 로 교체하면서 Stronghold 플러그인은 완전히 제외되었다 (`docs/project-decisions.md` "볼트 암호화 엔진 교체" 섹션 참조). 본 태스크 자체는 이미 완료됐으므로 되돌리지 않고 역사 기록만 남긴다.
- **DoD**:
  - `tauri-plugin-sql`, `tauri-plugin-clipboard-manager`, `tauri-plugin-shell`, `tauri-plugin-os`, `tauri-plugin-updater`, `tauri-plugin-notification`, `tauri-plugin-biometric`, `tauri-plugin-deep-link`, `tauri-plugin-http` 가 `api-vault-app/Cargo.toml` 에 있고 `lib.rs` 의 `Builder::default().plugin(...)` 체인에 등록됨
  - 대응하는 JS 패키지 `@tauri-apps/plugin-*` 설치
  - `capabilities/default.json` 에 사용할 permission 추가 (`sql:default`, `clipboard-manager:allow-write`, `os:allow-platform`, `updater:default`, `http:default` 등). Stronghold 관련 permission(`stronghold:default`) 은 포함하지 않는다.
- **Files Touched**: `src-tauri/crates/api-vault-app/Cargo.toml`, `src-tauri/crates/api-vault-app/src/lib.rs`, `src-tauri/capabilities/default.json`, `package.json`
- **Tests**: `cargo tauri dev` 앱 실행, 콘솔 에러 없음 (manual)

### T004. LICENSE (AGPL-3.0) + LICENSE_FAQ.md 추가

- **Milestone**: M0
- **Priority**: Must
- **Depends on**: -
- **Goal**: AGPL-3.0 라이선스 적용 + EE 경계 설명 파일 생성.
- **DoD**:
  - `LICENSE` 가 AGPL-3.0 공식 텍스트 (GNU AGPL v3, 2007)
  - `LICENSE_FAQ.md` 에 "OSS 코어 vs EE 독점" 경계 설명 (릴레이 서버, Pro 커넥터 팩, 자동 rotation 파이프라인은 EE)
  - `README.md` 상단에 라이선스 배지 + 링크
- **Files Touched**: `LICENSE`, `LICENSE_FAQ.md`, `README.md`
- **Tests**: manual — 파일 열람

### T005. CLA 자동화 설정 (CLA Assistant)

- **Milestone**: M0
- **Priority**: Must
- **Depends on**: T004
- **Goal**: 기여자 CLA 를 자동으로 요청하는 GitHub Actions 워크플로우 + CLA 텍스트 파일 준비.
- **DoD**:
  - `.github/CLA.md` — 기여자 라이선스 동의서 (Bitwarden / Infisical 참고)
  - `.github/workflows/cla.yml` — `cla-assistant/github-action@v2` 사용
  - PR 템플릿 `.github/pull_request_template.md` 에 CLA 안내 문구
- **Files Touched**: `.github/CLA.md`, `.github/workflows/cla.yml`, `.github/pull_request_template.md`
- **Tests**: manual — CLA Assistant 봇 설치 (owner action, 사용자가 수동 승인)

### T006. 커밋 컨벤션 + lint 설정 (rustfmt, clippy, eslint, prettier)

- **Milestone**: M0
- **Priority**: Must
- **Depends on**: T001
- **Goal**: 코드 스타일 자동화.
- **DoD**:
  - `rustfmt.toml` — `edition=2021`, `max_width=100`
  - `.github/workflows/ci.yml` — 다음 3개 잡: `cargo fmt --check`, `cargo clippy -- -D warnings`, `pnpm lint && pnpm typecheck`
  - `package.json` 에 `"lint"`, `"typecheck"` 스크립트
  - ESLint + Prettier 설정 (`eslint.config.js`, `.prettierrc`)
- **Files Touched**: `rustfmt.toml`, `.github/workflows/ci.yml`, `package.json`, `eslint.config.js`, `.prettierrc`
- **Tests**: `cargo clippy --workspace -- -D warnings`, `pnpm lint`, `pnpm typecheck`

### T007. README.md 초안 작성 (프로젝트 개요, 빌드 방법)

- **Milestone**: M0
- **Priority**: Must
- **Depends on**: T004
- **Goal**: GitHub 방문자가 처음 보는 README 정비.
- **DoD**:
  - 섹션: About, Features (MVP Must 요약), Tech Stack, Getting Started (Prerequisites, Install, Dev, Build), License, Contributing (CLA 링크)
  - Dev build 커맨드 예시 (`pnpm install && pnpm tauri dev`)
  - 배지: License, CI status (placeholder)
- **Files Touched**: `README.md`
- **Tests**: manual

### T008. Tailwind v4 디자인 토큰 확장 (시맨틱 vault-\* 토큰)

- **Milestone**: M0
- **Priority**: Must
- **Depends on**: -
- **Goal**: 기존 oklch 토큰 외에 의미적 토큰(`--color-vault-danger`, `--color-vault-warning`, `--color-vault-success`, `--color-vault-info`) 을 추가. Graph / Badge / Toast 에 재사용.
- **DoD**:
  - `src/styles/globals.css` 의 `:root` + `.dark` 에 `--color-vault-danger/warning/success/info` oklch 값 정의
  - `@theme inline` 에 매핑 추가
  - `src/components/ui/badge.tsx` 추가 (shadcn/ui Badge, variant: default/danger/warning/success/info)
- **Files Touched**: `src/styles/globals.css`, `src/components/ui/badge.tsx`
- **Tests**: Vitest — `Badge` 렌더 snapshot 4 variant

### T009. shadcn/ui 컴포넌트 대량 추가 (dialog, input, label, form, tabs, tooltip, toast, dropdown-menu, command, scroll-area, separator, skeleton)

- **Milestone**: M0
- **Priority**: Must
- **Depends on**: T008
- **Goal**: 이후 UI 태스크에서 즉시 쓸 primitive 준비.
- **DoD**:
  - 위 12개 shadcn/ui 컴포넌트가 `src/components/ui/` 에 존재
  - 각 컴포넌트가 Tailwind 토큰 (`bg-background`, `border-border`)만 사용 (하드코딩 색상 없음)
  - `cmdk`, `@radix-ui/react-dialog`, `@radix-ui/react-tabs`, `@radix-ui/react-tooltip`, `@radix-ui/react-dropdown-menu`, `@radix-ui/react-label`, `@radix-ui/react-scroll-area`, `@radix-ui/react-separator`, `@radix-ui/react-toast`, `react-hook-form`, `@hookform/resolvers`, `zod` 패키지 설치
- **Files Touched**: `src/components/ui/*.tsx` (12개), `package.json`
- **Tests**: Vitest — 각 컴포넌트 기본 렌더 테스트 (3~4개 대표)

### T010. 라우팅 + 셸 레이아웃 (react-router-dom)

- **Milestone**: M0
- **Priority**: Must
- **Depends on**: T009
- **Goal**: Inventory/Graph/Incidents/Settings 를 위한 최상위 라우팅과 사이드바 셸 구축.
- **DoD**:
  - `react-router-dom@7` 설치
  - `src/App.tsx` — `<BrowserRouter>` + `<Routes>` (플레이스홀더 페이지 5개: `/`, `/graph`, `/incidents`, `/audit`, `/settings`)
  - `src/components/shell/AppShell.tsx` — 좌측 사이드바 + 우측 컨텐츠 + 상단 타이틀 바
  - 사이드바 네비게이션이 `<NavLink>` 기반, active 상태 스타일
  - 모바일(`getPlatform() === 'mobile'`) 에서는 하단 탭 바로 대체
- **Files Touched**: `src/App.tsx`, `src/components/shell/AppShell.tsx`, `src/components/shell/Sidebar.tsx`, `src/components/shell/BottomNav.tsx`, `src/lib/platform.ts`, `package.json`
- **Tests**: Vitest — `AppShell` 렌더, 플랫폼별 분기 (platform mock)

### T011. i18n 초기 설정 (react-i18next, 영어 기본)

- **Milestone**: M0
- **Priority**: Must
- **Depends on**: T010
- **Goal**: 모든 UI 문자열을 키 기반 참조로 작성하는 기반 마련. MVP 출시는 영어만, Phase 2 에서 ko/ja 활성화.
- **DoD**:
  - `react-i18next`, `i18next`, `i18next-browser-languagedetector` 설치
  - `src/lib/i18n.ts` — init (namespace: `common`, fallbackLng `en`)
  - `src/locales/en/common.json` 기본 키 20여 개 (앱 타이틀, 네비 라벨, 버튼 라벨)
  - `src/locales/ko/common.json`, `src/locales/ja/common.json` 생성 (영어 복사본, 번역은 M13)
  - 기존 `App.tsx` 하드코딩 문자열을 `t()` 로 전환
- **Files Touched**: `src/lib/i18n.ts`, `src/locales/{en,ko,ja}/common.json`, `src/main.tsx`, `src/App.tsx`
- **Tests**: Vitest — `t()` 호출 렌더 테스트

### T012. 개발 가이드 (`docs/dev-setup.md`)

- **Milestone**: M0
- **Priority**: Should
- **Depends on**: T001~T006
- **Goal**: 신규 개발자(또는 미래의 나)를 위한 setup 가이드.
- **DoD**:
  - Prerequisites: Node 20+, Rust stable (rustup), pnpm, 플랫폼별 시스템 의존성
  - Commands: `pnpm install`, `pnpm tauri dev`, `cargo test --workspace`, `pnpm test`, `pnpm lint`
  - Folder layout 요약 (architecture.md 3.2 링크)
- **Files Touched**: `docs/dev-setup.md`
- **Tests**: manual

---

## M1 — Local Vault Core

### T013. SQLite 스키마 초기 마이그레이션 (0001_init.sql)

- **Milestone**: M1
- **Priority**: Must
- **Depends on**: T002, T003
- **Goal**: architecture.md 2.1 의 모든 테이블을 SQL 로 표현.
- **DoD**:
  - `crates/api-vault-storage/migrations/0001_init.sql` 에 `issuer`, `credential`, `project`, `deployment`, `usage`, `incident`, `incident_match`, `audit_log`, `device`, `sync_state`, `settings` 테이블 CREATE
  - 인덱스 7종 생성 (architecture.md 2.2)
  - `PRAGMA foreign_keys = ON`
  - `sqlx::migrate!` 런타임에서 동작
- **Files Touched**: `crates/api-vault-storage/migrations/0001_init.sql`, `crates/api-vault-storage/src/sqlite/mod.rs`
- **Tests**: Rust — `#[sqlx::test]` 로 마이그레이션 실행 후 `SELECT name FROM sqlite_master` 로 테이블 존재 확인

### T014. `VaultStorage` trait 정의

- **Milestone**: M1
- **Priority**: Must
- **Depends on**: T001
- **Goal**: 볼트 구현체 교체 가능하도록 볼트 I/O 추상화. (Gate 1 Q6=B 결정. 2026-04-22 결정에 따라 기본 구현체는 `AgeVaultStorage` 로 확정.)
- **DoD**:
  - `crates/api-vault-storage/src/vault/mod.rs` 에 `trait VaultStorage` 선언:
    - `async fn unlock(&mut self, password: SecretString) -> Result<(), VaultError>`
    - `async fn is_unlocked(&self) -> bool`
    - `async fn lock(&mut self) -> Result<(), VaultError>`
    - `async fn put_secret(&mut self, path: &str, value: SecretBytes) -> Result<(), VaultError>`
    - `async fn get_secret(&self, path: &str) -> Result<SecretBytes, VaultError>`
    - `async fn delete_secret(&mut self, path: &str) -> Result<(), VaultError>`
    - `async fn list_secrets(&self, prefix: &str) -> Result<Vec<String>, VaultError>`
  - `enum VaultError { Locked, NotFound, WrongPassword, Io(io::Error), Crypto(String) }`
- **Files Touched**: `crates/api-vault-storage/src/vault/mod.rs`, `crates/api-vault-storage/src/vault/error.rs`
- **Tests**: Rust — trait object `Box<dyn VaultStorage>` 컴파일 확인

### T015. `MockVaultStorage` 구현 (테스트용)

- **Milestone**: M1
- **Priority**: Must
- **Depends on**: T014
- **Goal**: `VaultStorage` 단위 테스트가 실제 암호화 볼트 파일 없이 가능하도록 인메모리 구현.
- **DoD**:
  - `crates/api-vault-storage/src/vault/mock.rs` 에 `MockVaultStorage`
  - 내부 `HashMap<String, Vec<u8>>` + `unlocked: bool` + `correct_password: String`
  - 모든 trait 메서드 구현 (잠김/해제 상태 검증 포함)
  - `#[cfg(any(test, feature = "mock"))]` 플래그로 노출
- **Files Touched**: `crates/api-vault-storage/src/vault/mock.rs`, `crates/api-vault-storage/Cargo.toml`
- **Tests**: Rust — `tests/vault_mock_contract.rs` 에서 7개 trait 메서드 CRUD 시나리오 전부 검증

### T016. `AgeVaultStorage` 구현

- **Milestone**: M1
- **Priority**: Must
- **Depends on**: T014, T003
- **Goal**: `age` crate(RustCrypto) 기반으로 단일 암호화 파일 위에 `VaultStorage` trait 구현. (2026-04-22 결정: Stronghold → age 교체. `docs/project-decisions.md` 참조)
- **DoD**:
  - `crates/api-vault-storage/src/age_vault/mod.rs` 에 `AgeVaultStorage`
  - `unlock` → Argon2id(password, salt_enc) → HKDF(info="age-vault") → age X25519 identity 도출 → `age::Decryptor` 로 볼트 파일 복호화 → 레코드 맵 로드 (scrypt recipient vs X25519 recipient 최종 모드는 구현 착수 시 확정)
  - `put_secret/get_secret/delete_secret/list_secrets` → 메모리 레코드 맵에 적용 후 flush 시점에 age 로 재암호화하여 atomic rename 으로 저장
  - 파일 경로: `<app_data_dir>/vault.age` (Tauri path API 로 획득, 하드코딩 금지)
  - 저장 전 `vault.age.bak-<timestamp>` 로 자동 백업 (롤백 계획)
  - 모든 민감 버퍼는 `secrecy::SecretBox` + `zeroize` on drop
- **Files Touched**: `crates/api-vault-storage/src/age_vault/mod.rs`, `crates/api-vault-storage/Cargo.toml` (추가 의존성: `age`, `secrecy`, `zeroize`)
- **Tests**: Rust — `tests/age_vault_integration.rs` (tempdir 사용, 실제 `vault.age` 파일 생성/잠금/해제/라운드트립 + 잘못된 패스프레이즈 시 `VaultError::WrongPassword`)

### T017. 키 파생 유틸 (Argon2id + HKDF)

- **Milestone**: M1
- **Priority**: Must
- **Depends on**: T002
- **Goal**: architecture.md 4.1 의 키 파생 체인을 Rust 로 구현.
- **DoD**:
  - `crates/api-vault-crypto/src/kdf.rs`
  - `derive_auth_hash(pw, salt_auth) -> [u8; 32]` (Argon2id m=64MiB,t=3,p=1)
  - `derive_enc_key(pw, salt_enc) -> Secret<[u8; 32]>`
  - `derive_subkey(enc_key, info: &str) -> Secret<[u8; 32]>` (HKDF-SHA256)
  - `argon2` crate 사용, `hkdf` crate, `secrecy` 로 래핑, `zeroize` on drop
- **Files Touched**: `crates/api-vault-crypto/src/kdf.rs`, `crates/api-vault-crypto/src/lib.rs`, `Cargo.toml`
- **Tests**: Rust — `salt_auth != salt_enc` 일 때 결과 다름, 같은 입력 결정론, KAT 벡터 3개

### T018. OS Keyring 래퍼 (`hwchen/keyring-rs`)

- **Milestone**: M1
- **Priority**: Must
- **Depends on**: T002
- **Goal**: 데스크톱 플랫폼 OS Keyring 을 통일 API 로 노출.
- **DoD**:
  - `crates/api-vault-crypto/src/os_keyring.rs`
  - `store_master(user_id, bytes) -> Result<(), KeyringError>`
  - `load_master(user_id) -> Result<SecretBytes, KeyringError>`
  - `delete_master(user_id) -> Result<(), KeyringError>`
  - 서비스 이름: `com.phoodul.apivault`, account: `master:<user_id>`
  - Linux headless 에서 실패 시 `KeyringError::Unavailable` (호출부에서 폴백)
- **Files Touched**: `crates/api-vault-crypto/src/os_keyring.rs`
- **Tests**: Rust — `#[cfg(not(target_os = "linux"))]` integration test (Linux CI는 headless이므로 스킵)

### T019. SQLite 레포지터리 레이어 (`CredentialRepo`, `IssuerRepo`, …)

- **Milestone**: M1
- **Priority**: Must
- **Depends on**: T013
- **Goal**: sqlx 쿼리를 레포지터리 패턴으로 캡슐화.
- **DoD**:
  - `crates/api-vault-storage/src/sqlite/repositories/{credential,issuer,project,deployment,usage,incident,audit,device,settings}.rs`
  - 각 레포: `insert`, `get_by_id`, `list(filter)`, `update`, `delete` 기본 CRUD
  - 도메인 모델 매핑: `sqlx::FromRow`
  - 시간 필드: `time::OffsetDateTime` → Unix ms (i64)
- **Files Touched**: `crates/api-vault-storage/src/sqlite/repositories/*.rs`
- **Tests**: Rust — 각 레포별 `tests/repo_{name}_test.rs` 에서 CRUD 라운드트립 (in-memory sqlite `sqlite::memory:`)

### T020. 도메인 모델 (`api-vault-core`)

- **Milestone**: M1
- **Priority**: Must
- **Depends on**: -
- **Goal**: 비즈니스 로직이 참조하는 struct 정의.
- **DoD**:
  - `crates/api-vault-core/src/models/{issuer,credential,project,deployment,usage,incident,audit_log,device}.rs`
  - `serde::{Serialize, Deserialize}` 파생
  - `enum Env { Dev, Staging, Prod }`, `enum CredentialStatus { Active, Revoked, Compromised }`
  - `struct CredentialInput` (insert 용), `struct CredentialSummary` (list 용), `struct CredentialFull` (detail 용)
  - 모든 id 는 `Ulid` wrapper type
- **Files Touched**: `crates/api-vault-core/src/models/*.rs`, `crates/api-vault-core/src/lib.rs`
- **Tests**: Rust — serde 직렬화 라운드트립 3개

### T021. Tauri 커맨드 `vault_init` / `vault_unlock` / `vault_lock` / `vault_status`

- **Milestone**: M1
- **Priority**: Must
- **Depends on**: T016, T017, T018, T019
- **Goal**: 프론트엔드가 볼트 상태를 제어하는 최초 4개 IPC.
- **DoD**:
  - `crates/api-vault-app/src/commands/vault.rs`
  - `vault_init(password)` → 최초 실행 시 마스터 패스프레이즈 설정 + `vault.age` 파일 생성 + OS Keyring 에 session key 저장
  - `vault_unlock(password)` → 기존 볼트 열기
  - `vault_status()` → `Locked | Unlocked | Uninitialized`
  - 에러는 `VaultCommandError` 로 flat enum (`#[serde(tag = "code")]`) — 프론트에서 case 분기
- **Files Touched**: `crates/api-vault-app/src/commands/vault.rs`, `crates/api-vault-app/src/lib.rs` (invoke_handler 등록)
- **Tests**: Rust — `#[tokio::test]` 에서 init → lock → unlock 흐름; Vitest — `invoke('vault_status')` mock

### T022. Tauri 커맨드 `credential_*` (create/list/get/update/delete/reveal)

- **Milestone**: M1
- **Priority**: Must
- **Depends on**: T019, T020, T021
- **Goal**: 크리덴셜 CRUD IPC.
- **DoD**:
  - `crates/api-vault-app/src/commands/credentials.rs`
  - `credential_create(input)` → SQLite row + `VaultStorage::put_secret` (값은 `input.value`, path: `credentials/<ulid>`, age 볼트 파일에 flush)
  - `credential_list(filter)` → `Vec<CredentialSummary>` (값 복호화 X)
  - `credential_get(id)` → `CredentialFull` (메타데이터만)
  - `credential_reveal(id)` → `String` (`VaultStorage::get_secret` 로 age 볼트에서 복호화)
  - 에러 시 볼트 쓰기는 pseudo-트랜잭션 롤백 (SQLite insert 후 볼트 put 실패 → SQLite 삭제)
- **Files Touched**: `crates/api-vault-app/src/commands/credentials.rs`
- **Tests**: Rust — create/get/reveal 라운드트립 (MockVaultStorage 로 주입); `create` 실패 시 SQLite 롤백 검증

### T023. 클립보드 자동 만료 유틸 (30초)

- **Milestone**: M1
- **Priority**: Must
- **Depends on**: T003, T022
- **Goal**: `credential_copy_to_clipboard(id)` 호출 시 30초 후 클립보드 초기화.
- **DoD**:
  - `crates/api-vault-app/src/commands/clipboard.rs`
  - `credential_copy_to_clipboard(id)` → `reveal` 결과를 `tauri_plugin_clipboard_manager::write_text` 로 기록 + `tokio::spawn` 으로 30초 후 `clear()`
  - 중복 호출 시 이전 timer 취소 (cancellation token)
  - UI 에 남은 초 tick 을 `emit("clipboard:countdown", remaining)` 로 브로드캐스트
- **Files Touched**: `crates/api-vault-app/src/commands/clipboard.rs`
- **Tests**: Rust — fake clock으로 30초 경과 후 clear 확인 (integration); manual — 실제 앱에서 복사 후 30초 대기

### T024. Lock Screen 컴포넌트 (마스터 패스프레이즈 입력)

- **Milestone**: M1
- **Priority**: Must
- **Depends on**: T021, T009
- **Goal**: 앱 실행 시 볼트가 잠긴 상태면 패스프레이즈 입력 화면 노출.
- **DoD**:
  - `src/features/vault/LockScreen.tsx` — 중앙 정렬 Card + Input + Unlock 버튼 + "First time? Create vault" 링크
  - `src/features/vault/CreateVaultDialog.tsx` — 최초 실행 시 password 2회 입력 + 강도 표시 (zxcvbn)
  - 성공 시 라우터 `/` 로 이동
  - 실패 3회 연속 시 쿨다운 10초 (UI 표시)
  - `src/App.tsx` 가 마운트 시 `vault_status` 호출 → `Uninitialized` → CreateVault, `Locked` → LockScreen, `Unlocked` → AppShell
- **Files Touched**: `src/features/vault/LockScreen.tsx`, `src/features/vault/CreateVaultDialog.tsx`, `src/features/vault/use-vault-status.ts`, `src/App.tsx`, `package.json` (zxcvbn)
- **Tests**: Vitest — 잠금/해제/실패 시나리오 렌더 + mock `invoke`

---

## M2 — Inventory UI + 드롭&스캔

### T025. Inventory 페이지 목록 뷰

- **Milestone**: M2
- **Priority**: Must
- **Depends on**: T022, T024
- **Goal**: `/` 에 모든 credential 카드 그리드.
- **DoD**:
  - `src/features/inventory/InventoryPage.tsx`
  - `CredentialCard` (이름, Issuer 배지, Env 뱃지, 만료 status 색상, 마지막 교체일)
  - 필터 바: 검색 input, Issuer select, Env select, Status select
  - 빈 상태 empty state: "No credentials yet. Add one or drop a project folder."
  - Progressive Disclosure: 기본은 이름 + 상태만, hover 시 추가 메타 fade-in
- **Files Touched**: `src/features/inventory/InventoryPage.tsx`, `src/features/inventory/CredentialCard.tsx`, `src/features/inventory/CredentialList.tsx`, `src/features/inventory/use-inventory.ts`
- **Tests**: Vitest — 10개 mock credential 렌더, 필터 동작

### T026. Credential 등록 다이얼로그 (수동)

- **Milestone**: M2
- **Priority**: Must
- **Depends on**: T025
- **Goal**: "+ Add credential" 버튼 → 모달에서 Issuer/이름/값/환경/만료일 입력.
- **DoD**:
  - `src/features/inventory/CreateCredentialDialog.tsx` (shadcn/ui Dialog + react-hook-form + zod)
  - 필드: Issuer(combobox, 프리셋 10종 + "Custom"), Name, Value(password field, show/hide), Env, Scope, Expires at(optional)
  - 제출 시 `invoke('credential_create', { input })`
  - 성공 시 toast "Credential saved" + 목록 refresh
  - 값 필드는 `aria-autocomplete="off"` + `autocomplete="new-password"` (브라우저 저장 차단)
- **Files Touched**: `src/features/inventory/CreateCredentialDialog.tsx`, `src/features/inventory/issuer-presets.ts`
- **Tests**: Vitest — validation, 제출 invoke 호출 인자 확인

### T027. Credential 상세 Drawer / Detail view

- **Milestone**: M2
- **Priority**: Must
- **Depends on**: T025, T023
- **Goal**: 카드 클릭 → 우측 drawer 에 전체 메타데이터 + 값 복사 버튼.
- **DoD**:
  - `src/features/inventory/CredentialDetail.tsx` (shadcn/ui Sheet)
  - 섹션: 기본 정보, 사용처 (M3 에서 채워짐), 감사 로그 링크 (M6), 삭제 (destructive dialog)
  - "Copy value" 버튼 → `credential_copy_to_clipboard` → 30초 progress bar 표시
  - "Rotate" / "Revoke" 버튼 (M7 에서 구현, 지금은 disabled placeholder)
- **Files Touched**: `src/features/inventory/CredentialDetail.tsx`
- **Tests**: Vitest — open/close, copy 버튼 invoke 호출

### T028. Issuer 프리셋 라이브러리 (OpenAI, Stripe, GitHub, AWS, Vercel, Supabase, Google, Anthropic, Paddle, Cloudflare)

- **Milestone**: M2
- **Priority**: Must
- **Depends on**: T020
- **Goal**: 자주 쓰는 발급처를 미리 정의해 입력 속도 향상.
- **DoD**:
  - `src/features/inventory/issuer-presets.ts` — 10개 프리셋 (slug, display_name, docs_url, issue_url, status_url, security_feed_url, icon_key, key_pattern_regex)
  - `key_pattern_regex` 는 드롭&스캔 매칭용 (예: `^sk-proj-[A-Za-z0-9_-]{20,}$` for OpenAI)
  - 앱 최초 실행 시 `issuer_preset_seed` 커맨드로 SQLite `issuer` 테이블에 upsert
  - `crates/api-vault-app/src/setup.rs` 에 시드 로직
- **Files Touched**: `src/features/inventory/issuer-presets.ts`, `crates/api-vault-app/src/setup.rs`, `crates/api-vault-app/src/commands/issuer.rs` (list/get)
- **Tests**: Rust — 시드 실행 후 issuer count == 10

### T029. Cmd+K Command Palette

- **Milestone**: M2
- **Priority**: Must
- **Depends on**: T010, T009
- **Goal**: 전역 키보드 단축키로 앱 내 모든 액션 접근.
- **DoD**:
  - `src/features/command-palette/CommandPalette.tsx` (cmdk + Dialog)
  - `Cmd+K` (Mac) / `Ctrl+K` (Win/Linux) 로 열림 — `useHotkeys` 훅 사용
  - 그룹: Navigation (Inventory/Graph/Incidents/Audit/Settings), Actions (Create credential, Lock vault, Toggle theme)
  - 각 액션은 최근 사용 순 정렬 (localStorage)
  - 모바일에서는 숨김
- **Files Touched**: `src/features/command-palette/CommandPalette.tsx`, `src/features/command-palette/use-recent-commands.ts`, `src/App.tsx`
- **Tests**: Vitest — 단축키 트리거, 필터링

### T030. Theme Toggle + Settings 페이지 기본

- **Milestone**: M2
- **Priority**: Must
- **Depends on**: T010
- **Goal**: `/settings` 에서 테마 / 언어 / 자동 잠금 시간 설정.
- **DoD**:
  - `src/features/settings/SettingsPage.tsx` — 섹션: Appearance(theme, language), Security(auto-lock timer), About
  - 설정은 `sqlite.settings` (key-value) 에 저장 → `settings_get/set` 커맨드
  - i18n 기본은 `en`, 선택 가능 `ko`, `ja`
  - 자동 잠금: 5min/15min/30min/Never
- **Files Touched**: `src/features/settings/SettingsPage.tsx`, `src/features/settings/use-settings.ts`, `crates/api-vault-app/src/commands/settings.rs`, `crates/api-vault-storage/src/sqlite/repositories/settings.rs` (이미 T019에 포함)
- **Tests**: Vitest — 테마 전환이 `useTheme().setTheme` 호출, localStorage 저장

### T031. Auto-lock 타이머 (idle detection)

- **Milestone**: M2
- **Priority**: Must
- **Depends on**: T030, T021
- **Goal**: 설정된 시간 동안 키보드/마우스 입력 없으면 자동 잠금.
- **DoD**:
  - `src/hooks/use-idle-lock.ts` — `mousemove`, `keydown`, `touchstart` 이벤트 스로틀 감지 + setTimeout
  - idle 도달 시 `invoke('vault_lock')` + 라우터 리디렉션
  - "Never" 선택 시 비활성화
  - 앱 포커스 잃을 때 (window blur) 즉시 잠금 옵션 (선택)
- **Files Touched**: `src/hooks/use-idle-lock.ts`, `src/App.tsx`
- **Tests**: Vitest — fake timers로 idle trigger 검증

### T032. 드롭 존 컴포넌트 (파일/폴더 드래그 수신)

- **Milestone**: M2
- **Priority**: Must
- **Depends on**: T010, T003
- **Goal**: 앱 어디든 파일/폴더를 드롭하면 드롭존 표시 + 핸들링.
- **DoD**:
  - `src/features/onboarding/DropZone.tsx` — 전역 오버레이, `dragenter/dragover/drop` 핸들러
  - Tauri drop 이벤트: `tauri://file-drop` (window listener)
  - 폴더 드롭 시 `/onboarding/scan?path=...` 라우트로 이동
  - 브라우저 / 모바일에서는 비활성화 (`getPlatform() === 'desktop'`)
- **Files Touched**: `src/features/onboarding/DropZone.tsx`, `src/App.tsx`
- **Tests**: Vitest — drop 이벤트 dispatch, 라우터 navigate 확인

### T033. `.env` 파서 + 엔트로피 기반 키 감지 (Rust)

- **Milestone**: M2
- **Priority**: Must
- **Depends on**: T028
- **Goal**: 드롭된 폴더에서 `.env*`, `.env.local`, `config/*.json`, `config.ts` 등을 스캔하여 고엔트로피 값 + issuer 프리셋 패턴 매칭.
- **DoD**:
  - `crates/api-vault-connectors/src/env_scanner/mod.rs`
  - `scan_path(path: &Path) -> Vec<DetectedKey>` — 파일 재귀 탐색(`walkdir`, `.gitignore` 존중 `ignore` crate)
  - `.env` 파싱: `KEY=value` 형태, 주석 무시, quoted 값 지원
  - 엔트로피 계산: Shannon entropy > 3.5 bits/char
  - Issuer 매칭: preset regex 적용 → 가장 먼저 매치된 issuer 반환, 없으면 `None`
  - `struct DetectedKey { file_path, line, env_var_name, issuer_slug, value_hint (마지막 4자), confidence }`
- **Files Touched**: `crates/api-vault-connectors/src/env_scanner/mod.rs`, `crates/api-vault-connectors/src/env_scanner/entropy.rs`, `crates/api-vault-connectors/src/env_scanner/parser.rs`, `Cargo.toml`
- **Tests**: Rust — fixtures 폴더 (`tests/fixtures/sample_project/.env`) 에 10개 샘플 키 → scan 결과 10개, issuer 매칭 정확도

### T034. Tauri 커맨드 `env_scan_folder(path)`

- **Milestone**: M2
- **Priority**: Must
- **Depends on**: T033
- **Goal**: 프론트엔드에서 스캔 호출.
- **DoD**:
  - `crates/api-vault-app/src/commands/scanner.rs`
  - `env_scan_folder(path: String) -> Result<Vec<DetectedKey>, Error>`
  - 폴더가 너무 크면(>10k 파일) progress event 스트리밍 (`emit("scan:progress", ScanProgress)`)
  - 허용 권한 체크: capability `fs:scope` 가 사용자 폴더 허용
- **Files Touched**: `crates/api-vault-app/src/commands/scanner.rs`, `src-tauri/capabilities/default.json`
- **Tests**: Rust — 샘플 fixture scan; manual — 실제 프로젝트 폴더 drag

### T035. 드롭&스캔 결과 검토 UI

- **Milestone**: M2
- **Priority**: Must
- **Depends on**: T034, T026
- **Goal**: 스캔 결과 리스트 → 체크박스로 선택 → "Import N keys" 버튼으로 일괄 등록.
- **DoD**:
  - `src/features/onboarding/DetectedKeysReview.tsx`
  - 테이블: 체크박스 / Issuer 아이콘 / env_var_name / 파일 경로 / 마지막 4자 / confidence badge
  - 이미 등록된 값(해시 일치)은 "Already tracked" 표시 + 체크 불가
  - "Import" 클릭 시 선택된 항목 → Project 자동 생성(폴더명) → Usage 자동 생성
  - 성공 toast "{count} keys imported to {project}"
- **Files Touched**: `src/features/onboarding/DetectedKeysReview.tsx`, `src/features/onboarding/use-import-detected.ts`
- **Tests**: Vitest — render 10 mock detected, 선택 + import → invoke 3회 호출 검증 (project_create, credential_create × n, usage_create × n)

### T036. Welcome / 온보딩 플로우

- **Milestone**: M2
- **Priority**: Must
- **Depends on**: T024, T035
- **Goal**: 볼트 최초 생성 직후 3단계 온보딩.
- **DoD**:
  - `src/features/onboarding/WelcomePage.tsx`
  - 1단계: "Drop your project folder" (DropZone)
  - 2단계: "Or add your first key manually" (CreateCredentialDialog)
  - 3단계: "You're all set" + Inventory 이동
  - 스킵 가능, 완료 플래그 `settings.onboarding_done = true`
  - Progressive Disclosure 톤 (바이브 코더 친화, 보안 경고 최소)
- **Files Touched**: `src/features/onboarding/WelcomePage.tsx`, `src/App.tsx`
- **Tests**: Vitest — 단계 진행, skip 동작

### T037. Project 관리 페이지 (list / create / edit)

- **Milestone**: M2
- **Priority**: Should
- **Depends on**: T019, T025
- **Goal**: 사용자가 프로젝트 수동 관리 가능하게.
- **DoD**:
  - `src/features/projects/ProjectsPage.tsx` (`/projects`)
  - Project CRUD + 소속 credential 연결 UI
  - `project_*` 커맨드 추가
- **Files Touched**: `src/features/projects/*.tsx`, `crates/api-vault-app/src/commands/projects.rs`
- **Tests**: Vitest — CRUD 플로우

### T038. Deployment 관리 (프로젝트 내부)

- **Milestone**: M2
- **Priority**: Should
- **Depends on**: T037
- **Goal**: 각 프로젝트에 여러 배포 URL 을 붙일 수 있게.
- **DoD**:
  - `src/features/projects/DeploymentSection.tsx` (프로젝트 상세 내부)
  - Deployment CRUD + platform(vercel/railway/fly/...)
  - `deployment_*` 커맨드
- **Files Touched**: `src/features/projects/DeploymentSection.tsx`, `crates/api-vault-app/src/commands/deployments.rs`
- **Tests**: Vitest — CRUD

### T039. Usage (사용처) 링크 UI

- **Milestone**: M2
- **Priority**: Must
- **Depends on**: T037, T027
- **Goal**: credential 상세에서 "이 키가 쓰이는 곳" 섹션, 수동 연결.
- **DoD**:
  - `src/features/inventory/UsageSection.tsx` (Detail 내부)
  - Project 선택 → `where_kind`, `where_value` 입력 → 연결
  - 목록에서 제거 버튼
  - `usage_*` 커맨드
- **Files Touched**: `src/features/inventory/UsageSection.tsx`, `crates/api-vault-app/src/commands/usages.rs`
- **Tests**: Rust + Vitest CRUD

### T040. Inventory 보안 점수 시각화 (기본)

- **Milestone**: M2
- **Priority**: Should
- **Depends on**: T025
- **Goal**: 각 credential 에 간단한 위험도 점수 계산 (만료 임박, 오랜 미교체, scope 불명, prod=dev 동일 키).
- **DoD**:
  - `crates/api-vault-core/src/security_score.rs` — `fn score(cred: &Credential, usages: &[Usage]) -> ScoreBreakdown { total: u8, factors: Vec<ScoreFactor> }`
  - Card 에 3단계 색상 dot (safe/warn/danger), hover 시 tooltip 으로 factors 노출
  - tooltip 텍스트 i18n 키 + 해결 방법 제시 ("This key was last rotated 6 months ago. Consider rotation.")
- **Files Touched**: `crates/api-vault-core/src/security_score.rs`, `src/features/inventory/SecurityDot.tsx`
- **Tests**: Rust — 계산 로직 유닛 테스트; Vitest — 세 상태 렌더

---

## M3 — Dependency Graph & Blast Radius

### T041. `api-vault-core` 그래프 모델 (`petgraph`)

- **Milestone**: M3
- **Priority**: Must
- **Depends on**: T020
- **Goal**: Issuer → Credential → Usage → Project → Deployment 그래프 표현.
- **DoD**:
  - `crates/api-vault-core/src/graph.rs`
  - `struct DependencyGraph { graph: DiGraph<NodeRef, EdgeKind> }`
  - `enum NodeRef { Issuer(Ulid), Credential(Ulid), Project(Ulid), Deployment(Ulid) }`
  - `enum EdgeKind { Issues, UsedBy, DeployedAs }`
  - `fn build_from_repo(repos: &Repos) -> DependencyGraph`
- **Files Touched**: `crates/api-vault-core/src/graph.rs`, `Cargo.toml` (petgraph)
- **Tests**: Rust — fixtures (2 issuer, 3 credential, 2 project, 4 deployment, 5 usage) → 그래프 노드/엣지 수 검증

### T042. Blast Radius 계산

- **Milestone**: M3
- **Priority**: Must
- **Depends on**: T041
- **Goal**: 특정 credential 에서 도달 가능한 모든 하위 노드 집합 반환.
- **DoD**:
  - `crates/api-vault-core/src/blast_radius.rs`
  - `fn blast_radius(graph: &DependencyGraph, cred_id: Ulid) -> BlastRadius { primary: Vec<NodeRef>, secondary: Vec<NodeRef>, tertiary: Vec<NodeRef> }`
  - BFS with depth tracking (primary = depth 1, secondary = 2, tertiary = 3+)
- **Files Touched**: `crates/api-vault-core/src/blast_radius.rs`
- **Tests**: Rust — 체인 Issuer → Cred → Usage → Project → Deployment 에서 blast_radius(cred) 가 project, deployment 포함 확인

### T043. Tauri 커맨드 `graph_fetch` / `blast_radius_for_credential`

- **Milestone**: M3
- **Priority**: Must
- **Depends on**: T041, T042
- **Goal**: 프론트엔드에 React Flow 친화 페이로드 전달.
- **DoD**:
  - `crates/api-vault-app/src/commands/graph.rs`
  - `graph_fetch() -> GraphPayload { nodes: Vec<GraphNode>, edges: Vec<GraphEdge> }`
  - `GraphNode { id, kind, label, meta_json }` (React Flow `Node<T>` 로 매핑 가능)
  - `blast_radius_for_credential(id) -> BlastRadius`
- **Files Touched**: `crates/api-vault-app/src/commands/graph.rs`
- **Tests**: Rust — payload 직렬화 검증

### T044. React Flow 셋업 + dagre 레이아웃

- **Milestone**: M3
- **Priority**: Must
- **Depends on**: T043
- **Goal**: `/graph` 페이지에 기본 그래프 렌더링.
- **DoD**:
  - `@xyflow/react`, `@dagrejs/dagre` 패키지 설치
  - `src/features/graph/GraphPage.tsx`
  - `src/features/graph/DependencyGraph.tsx` — React Flow 컴포넌트, `useReactFlow` hook
  - `src/features/graph/layout.ts` — dagre 로 자동 위치 계산 (`TB` 방향 기본, `LR` 토글 버튼)
  - MiniMap + Controls + Background 컴포넌트
- **Files Touched**: `src/features/graph/GraphPage.tsx`, `src/features/graph/DependencyGraph.tsx`, `src/features/graph/layout.ts`, `package.json`
- **Tests**: Vitest — mock 10 nodes 렌더, dagre 위치 계산 결과 존재

### T045. 커스텀 노드 타입 (Issuer/Credential/Project/Deployment)

- **Milestone**: M3
- **Priority**: Must
- **Depends on**: T044, T008
- **Goal**: 4가지 노드를 시각적으로 구분.
- **DoD**:
  - `src/features/graph/nodes/{IssuerNode,CredentialNode,ProjectNode,DeploymentNode}.tsx`
  - shadcn/ui Card 기반, 각 타입별 아이콘 + 색상 (vault-accent/warning/info/muted)
  - `React.memo` 적용 (성능)
  - Node handles (top/bottom) 로 dagre 레이아웃과 매칭
- **Files Touched**: `src/features/graph/nodes/*.tsx`, `src/features/graph/node-types.ts`
- **Tests**: Vitest — 각 노드 렌더 snapshot

### T046. Blast Radius 하이라이트 (노드 클릭 시)

- **Milestone**: M3
- **Priority**: Must
- **Depends on**: T045, T043
- **Goal**: Credential 노드 클릭 → 하위 노드 하이라이트 + 나머지 dim.
- **DoD**:
  - `src/features/graph/use-blast-radius-selection.ts` — 클릭 이벤트로 `invoke('blast_radius_for_credential', { id })` 호출
  - 결과에 따라 각 노드에 `data-status="primary|secondary|tertiary|dimmed"` 적용
  - CSS 변수로 outline 색상 (danger/warning/muted) + opacity
  - 색맹 대응: dashed border 또는 두께 변형 (outline style)
  - Esc 키로 선택 해제
- **Files Touched**: `src/features/graph/use-blast-radius-selection.ts`, `src/features/graph/DependencyGraph.tsx`, `src/features/graph/nodes/*.tsx`
- **Tests**: Vitest — 클릭 시 invoke 호출, 결과 반영

### T047. Graph 성능 최적화 (React.memo + viewport culling)

- **Milestone**: M3
- **Priority**: Must
- **Depends on**: T045
- **Goal**: 500 노드에서 60fps 유지.
- **DoD**:
  - 모든 커스텀 노드 `React.memo` 적용 (이미 T045) + comparison fn
  - `nodesDraggable={false}` 기본, 사용자 설정으로 활성화
  - 노드 수 > 200 시 라벨 숨김 옵션 (zoom < 0.5)
  - Zustand selector 기반 state (사용 시 `@xyflow/react` 내부 state 최적화 확인)
- **Files Touched**: `src/features/graph/DependencyGraph.tsx`, `src/features/graph/performance.md` (메모)
- **Tests**: manual — 500 노드 fixture seed 후 프레임 측정; Vitest — memoization 검증 (상태 변경 시 불필요 리렌더 없음)

### T048. 모바일 Graph 대체 뷰 (리스트 카드)

- **Milestone**: M3
- **Priority**: Should
- **Depends on**: T044
- **Goal**: 모바일에서는 인터랙티브 그래프 대신 계층형 리스트.
- **DoD**:
  - `src/features/graph/MobileGraphList.tsx` — 선택한 credential 의 "영향받는 프로젝트" 들여쓰기 리스트
  - `getPlatform() === 'mobile'` 분기로 `GraphPage` 에서 이 컴포넌트 렌더
- **Files Touched**: `src/features/graph/MobileGraphList.tsx`, `src/features/graph/GraphPage.tsx`
- **Tests**: Vitest — platform mock 변경 시 다른 뷰 렌더

---

## M4 — Incident Feed

### T049. NVD CVE API 2.0 클라이언트

- **Milestone**: M4
- **Priority**: Must
- **Depends on**: T002
- **Goal**: 증분 쿼리로 CVE 수집.
- **DoD**:
  - `crates/api-vault-feeds/src/nvd.rs`
  - `NvdClient::fetch_incremental(&self, since: OffsetDateTime) -> Result<Vec<NvdCve>, NvdError>` (api_key는 NvdClient 생성 시 주입)
  - Rate limit: 키 없음 5req/30s, 키 있음 50req/30s → `governor` crate 로 토큰 버킷 (NVD 공식 2026 기준)
  - `lastModStartDate`, `lastModEndDate` 파라미터 사용
- **Files Touched**: `crates/api-vault-feeds/src/nvd.rs`, `Cargo.toml`
- **Tests**: Rust — wiremock 서버로 200, 429, 503 응답 시나리오

### T050. GitHub Advisory DB 클라이언트

- **Milestone**: M4
- **Priority**: Must
- **Depends on**: T002
- **Goal**: GHSA 목록 수집.
- **DoD**:
  - `crates/api-vault-feeds/src/ghsa.rs`
  - `GhsaClient::fetch_advisories(&self, since: OffsetDateTime) -> Result<Vec<GhsaAdvisory>, GhsaError>` (token 은 생성자 주입)
  - 페이지네이션(`Link` 헤더 커서, `after=<base64>` 불투명 문자열) 처리
  - `sort=updated&direction=asc`, `modified=>{since}` (GitHub search 구문), `per_page=100`, API Version `2022-11-28`, User-Agent 필수
- **Files Touched**: `crates/api-vault-feeds/src/ghsa.rs`
- **Tests**: Rust — wiremock (단일/페이지네이션/429/503/nullable 필드 총 9건)

### T051. 주요 SaaS 상태 RSS 클라이언트

- **Milestone**: M4
- **Priority**: Must
- **Depends on**: T002
- **Goal**: 10개 공급자 RSS/Atom 폴링.
- **DoD**:
  - `crates/api-vault-feeds/src/rss.rs`, `crates/api-vault-feeds/src/sources.rs`
  - 프리셋 10개 URL (2026-04-24 기준 실제 호스트 확인): OpenAI `status.openai.com/history.rss`, Stripe `www.stripestatus.com/history.rss` (구 status.stripe.com 폐기), AWS `status.aws.amazon.com/rss/all.rss`, Vercel `www.vercel-status.com/history.rss`, Supabase `status.supabase.com/history.rss`, GitHub `www.githubstatus.com/history.rss`, Cloudflare `www.cloudflarestatus.com/history.rss`, Anthropic `status.claude.com/history.rss` (구 status.anthropic.com 리다이렉트), GCP `status.cloud.google.com/en/feed.atom` (Atom 전용), Paddle `paddlestatus.com/history.rss`
  - `feed-rs` crate 2.x 로 파싱 (RSS 2.0 + Atom 1.0 통합)
  - `RssClient::fetch_all(&self, sources: &[RssSource]) -> Vec<RssEntry>` (실패 소스는 tracing::warn 후 skip, 성공만 수집)
  - `RssClient::fetch_one(&self, source: &RssSource) -> Result<Vec<RssEntry>, RssError>`
  - 동시성 제어: `tokio::sync::Semaphore::new(4)` + `futures::future::join_all`
  - chrono → time 변환 헬퍼 (feed-rs 는 chrono::DateTime<Utc> 반환, 프로젝트는 time crate 사용)
- **Files Touched**: `crates/api-vault-feeds/src/rss.rs`, `crates/api-vault-feeds/src/sources.rs`, `crates/api-vault-feeds/tests/fixtures/rss/*.xml` (10개)
- **Tests**: Rust — fixture 10개 파싱 + fetch_all/fetch_one wiremock 시나리오 (단위 6 + 통합 3 = 9건)

### T052. HIBP v3 클라이언트

- **Milestone**: M4
- **Priority**: Should
- **Depends on**: T002
- **Goal**: 이메일 유출 조회.
- **DoD**:
  - `crates/api-vault-feeds/src/hibp.rs`
  - `HibpClient::check_email(&self, email: &str) -> Result<Vec<HibpBreach>, HibpError>` (api_key 는 생성자 주입)
  - 엔드포인트: `GET https://haveibeenpwned.com/api/v3/breachedaccount/{email}?truncateResponse=false`
  - Email path segment 는 `urlencoding::encode` 로 수동 percent-encoding (reqwest `.query()` 는 path 에 적용 안 됨)
  - `hibp-api-key` 헤더 + `User-Agent` 헤더 (reqwest Client builder user_agent) 둘 다 필수
  - HTTP 404 → `Ok(Vec::new())` ("breach 없음" 은 정상 응답, Err 아님)
  - `HibpError` variants: `Unauthorized(401)`, `Forbidden(403)`, `BadRequest(400)`, `RateLimited(429 + retry-after)`, `Server(5xx)`, `Http`, `Decode`, `ParseTime`
  - Rate limiter: Core 1 티어 10 req/min (governor `Quota::per_minute(10)`)
  - `HibpBreach` DTO: PascalCase serde 로 21 필드 매핑, `Attribution`/`DisclosureUrl`/`LogoPath`/`IsStealerLog` Optional, `BreachDate` 는 `String` 유지 (`YYYY-MM-DD` — OffsetDateTime 변환 시 혼란), `AddedDate`/`ModifiedDate` 는 RFC3339 파싱
- **Files Touched**: `crates/api-vault-feeds/src/hibp.rs`, `src-tauri/Cargo.toml` (+urlencoding), `api-vault-feeds/Cargo.toml`, `api-vault-feeds/src/lib.rs`
- **Tests**: Rust — wiremock 10 tests (200/404-empty/401/403/429+retry-after/503 + hibp-api-key 헤더 검증 + truncateResponse 쿼리 검증 + email URL-encode path 검증 + Optional 필드 null 파싱)

### T053. Incident 매칭 엔진

- **Milestone**: M4
- **Priority**: Must
- **Depends on**: T049, T050, T051
- **Goal**: 수집된 incident 를 issuer_id + keyword 기반으로 등록된 credential 과 매칭.
- **DoD**:
  - `crates/api-vault-feeds/src/matcher.rs` — 순수 함수 (비동기 아님)
  - 공개: `pub fn match_incident(incident: &Incident, credentials: &[Credential], issuers: &[Issuer]) -> Vec<IncidentMatch>` (+ 테스트용 결정론 헬퍼 `pub fn match_incident_at(..., now: OffsetDateTime)`)
  - 기존 `api-vault-core::models::{Incident, IncidentMatch, MatchReason, Credential, Issuer}` 재사용 (신규 타입 정의 금지, `api-vault-core` path dep 추가)
  - 매칭 규칙:
    1. `incident.issuer_id == credential.issuer_id` → `reason: IssuerMatch`, 내부 confidence 1.0
    2. `incident.title + body` 의 lowercase substring 에 issuer `display_name` 또는 `slug` 포함 (slug 는 `len >= 3` 필터, false positive 방지) → 해당 issuer 의 credential 들에 `reason: Keyword`, 내부 confidence 0.6
    3. 동일 credential 중복 시 IssuerMatch 우선 (dedupe)
    4. 내부 `CONFIDENCE_THRESHOLD = 0.3` 필터 (현재 모든 reason 이 ≥ 0.6 이라 실효 없음이나 향후 weaker signal 대비 구조 유지)
  - confidence 는 `IncidentMatch` 구조체에 저장 안 함 (core 모델에 해당 필드 없음) — 내부 상수로만 사용
  - `Explicit` reason 은 생성 금지 (사용자 명시 override 용, 다른 경로에서 생성)
  - 결정론적 정렬: `(reason discriminant, credential_id ULID string)` 기준
- **Files Touched**: `crates/api-vault-feeds/src/matcher.rs`, `crates/api-vault-feeds/src/lib.rs`, `crates/api-vault-feeds/Cargo.toml` (+api-vault-core path dep)
- **Tests**: Rust 14 개 (DoD 10 + bonus 4: short_slug false positive 방지, matched_at 주입, multi-word display_name, 결정론 순서). 순수 `#[test]`, fixture 는 인라인 helper.

### T054. 스케줄러 (tokio interval, 폴링 주기 관리)

- **Milestone**: M4
- **Priority**: Must
- **Depends on**: T049, T050, T051, T053
- **Goal**: 앱 실행 중 주기적 incident 폴링 + 저장.
- **DoD**:
  - `crates/api-vault-app/src/services/feed_scheduler.rs` + `feed_normalize.rs` (+ `services/mod.rs`)
  - `FeedSchedulerConfig { nvd_api_key: Option<String>, ghsa_token: Option<String>, nvd_interval: 2h, ghsa_interval: 24h, rss_interval: 5min }` — **NVD/GHSA 는 key 가 Some 일 때만 spawn** (현재 기본값 None → RSS 만 활성). T055/T058 에서 settings 연동.
  - RSS/NVD/GHSA 각 `tokio::time::interval` + `MissedTickBehavior::Delay` (밀린 tick 대량 발화 방지)
  - **HIBP 미포함** — on-demand 전용, 스케줄러 대상 아님 (T053 matcher 에는 활용)
  - Circuit Breaker: 연속 3회 실패 → 1h cooldown (`Breaker { consecutive_failures, cooldown_until }`)
  - 앱 시작 시 `spawn_feed_scheduler(pool, config)` → `FeedSchedulerHandle { cancel, join_set }` 를 `AppContext.feed_scheduler` 에 저장
  - Shutdown: `Builder::on_window_event(Destroyed)` → `handle.shutdown()` → `CancellationToken::cancel()` + `JoinSet::join_next` 대기 (graceful). `JoinHandle::abort()` 보다 강건.
  - DTO → Incident 정규화 3종 (NVD/GHSA/RSS): severity 매핑, `issuer_id = issuer_index.get(canonical_source_slug(&entry.source_slug))` (RSS "gcp" → Issuer "google" alias)
  - 성공 시 `incident_repo.insert(&incident)` + `match_incident(&incident, credentials, issuers)` → `incident_repo.insert_match(...)` 파이프라인
  - 중복 source_id 방지: storage 에 `UNIQUE(source, source_id)` 제약 없음 → `repo.insert` Err 시 `tracing::debug!` 후 skip (향후 storage migration 필요 — Pending)
- **Files Touched**: `crates/api-vault-app/src/services/feed_scheduler.rs` (신규), `feed_normalize.rs` (신규), `services/mod.rs` (신규), `context.rs` (+feed_scheduler 필드), `lib.rs` (spawn + on_window_event), `src-tauri/Cargo.toml` (+tokio-util), `api-vault-app/Cargo.toml` (+api-vault-feeds, +tokio-util)
- **Tests**: Rust — normalize 14개 (NVD/GHSA/RSS 변환 + canonical_slug + issuer_index) + scheduler 6개 (Breaker 4건 + config default + spawn/shutdown 라운드트립). fake clock interval trigger 는 wiremock+tempfile 복잡도 이슈로 생략, T056/T057 UI 연동 시 e2e 커버 예정.

### T055. Tauri 커맨드 `incident_*`

- **Milestone**: M4
- **Priority**: Must
- **Depends on**: T054
- **Goal**: 프론트에 feed 제공.
- **DoD**:
  - `crates/api-vault-app/src/commands/incidents.rs` 신규 + 4 Tauri 커맨드 + `IncidentCommandError` (`#[serde(tag="code", rename_all="snake_case")]` NotFound/SchedulerUnavailable/Scheduler/Internal)
  - `incident_feed_refresh(state) -> Result<usize, ...>` — `FeedSchedulerHandle::trigger_once()` 위임, 삽입 incident 수 반환
  - `incident_list(filter: Option<IncidentFilter>, state) -> Result<Vec<Incident>, ...>` — filter None 이면 default
  - `incident_dismiss(id: IncidentId, state) -> Result<u64, ...>` — 해당 incident 의 모든 활성 match 를 dismiss (incident 테이블 자체는 수정 안 함, `incident_match.dismissed_at` 만 채움), 업데이트 row 수 반환
  - `incident_matches_for_credential(credential_id: CredentialId, state) -> Result<Vec<Incident>, ...>` — credential 에 **활성 match** (dismissed 제외) 가 연결된 incident 반환
  - `IncidentFilter` DTO 신규 (`api-vault-core/src/models/incident.rs`): `source: Option<IncidentSource>`, `severity: Option<IncidentSeverity>`, `issuer_id: Option<IssuerId>`, `include_dismissed: bool` (default false — 모든 match 가 dismissed 인 incident 제외; match 없는 incident 는 포함)
  - `IncidentRepo` 3 메서드 확장: `list(&filter)`, `list_incidents_for_credential(cred_id)`, `dismiss_matches_for_incident(incident_id)` — SQL 은 `?1 IS NULL OR col = ?1` 선택 필터 + `GROUP BY HAVING` 서브쿼리로 전체 dismissed 제외
  - `FeedSchedulerHandle` 에 `pool: Arc<SqlitePool>` + `config: FeedSchedulerConfig` 필드 추가 (Clone derive) → `trigger_once()` 가 RSS 항상 + NVD/GHSA 는 key-gate 로 즉시 폴
  - `lib.rs` `generate_handler!` 에 4 커맨드 등록, `commands/mod.rs` 에 `pub mod incidents;`
- **Files Touched**: `crates/api-vault-app/src/commands/incidents.rs` (신규), `commands/mod.rs`, `lib.rs`, `services/feed_scheduler.rs` (+trigger_once), `api-vault-core/src/models/incident.rs` (+IncidentFilter), `api-vault-core/src/lib.rs` (re-export), `api-vault-storage/src/sqlite/repositories/incident.rs` (+3 메서드)
- **Tests**: Rust — core IncidentFilter default smoke + storage 9 (list 무필터/source/severity/issuer_id 필터/dismissed 제외/match 없음 포함/credential 매치 기본/dismissed 무시/dismiss 여러 row) + app 3 (error 변환 + serde tag snake_case). **12+ 신규**.

### T056. Incidents 페이지 UI

- **Milestone**: M4
- **Priority**: Must
- **Depends on**: T055, T009
- **Goal**: `/incidents` 에 피드 + 필터.
- **DoD**:
  - `src/features/incidents/IncidentsPage.tsx`
  - `IncidentCard` (severity 색상 bar, source 배지, 제목, 영향받는 credential 칩들, "View" / "Dismiss" 버튼)
  - 필터 탭: All / Critical / Affecting my keys / Dismissed
  - 실시간 업데이트: `listen('incidents:updated', ...)` 이벤트 수신
- **Files Touched**: `src/features/incidents/IncidentsPage.tsx`, `src/features/incidents/IncidentCard.tsx`, `src/features/incidents/use-incidents.ts`
- **Tests**: Vitest — 10 mock incident 렌더 + 필터

### T057. Credential Detail 에 Incidents 섹션 통합

- **Milestone**: M4
- **Priority**: Must
- **Depends on**: T027, T055
- **Goal**: credential 상세에서 이 키에 영향 있는 incident 표시.
- **DoD**:
  - `CredentialDetail` 에 `IncidentsForCredential` 서브 섹션
  - 매칭된 incident 목록 + "이 키 revoke 권장" CTA (M7 Kill Switch 로 이어짐)
- **Files Touched**: `src/features/inventory/CredentialDetail.tsx`, `src/features/incidents/IncidentsForCredential.tsx`
- **Tests**: Vitest — 렌더

### T058. NVD API 키 설정 UI (Settings)

- **Milestone**: M4
- **Priority**: Should
- **Depends on**: T030, T054
- **Goal**: 사용자가 NVD API 키 등록 시 레이트 리밋 확대.
- **DoD**:
  - Settings > Integrations > NVD API Key 필드
  - 키는 age 볼트 파일 내 `settings/nvd_api_key` 레코드 경로에 저장 (일반 SQLite 가 아니라)
  - 저장 시 feed scheduler 재로드
- **Files Touched**: `src/features/settings/IntegrationsSection.tsx`, `crates/api-vault-app/src/commands/settings.rs`
- **Tests**: Vitest — 저장 invoke

---

## M5 — GitHub Connector + RAILGUARD

### T059. Connector trait 정의

- **Milestone**: M5
- **Priority**: Must
- **Depends on**: T020
- **Goal**: 각종 공급자 통합 공통 인터페이스.
- **DoD**:
  - `crates/api-vault-connectors/src/lib.rs`
  - `#[async_trait] pub trait Connector { fn provider_id(&self) -> &'static str; async fn list_keys(&self, auth: &Auth) -> Result<Vec<RemoteKey>>; async fn revoke_key(&self, auth: &Auth, id: &str) -> Result<()>; async fn fetch_incidents(&self) -> Result<Vec<Incident>>; fn rotation_capability(&self) -> RotationCap; }`
  - `enum RotationCap { Full, Partial, Manual }`
  - 지금 단계 GitHub 만 구현, AWS/Stripe/OpenAI 는 Phase 2
- **Files Touched**: `crates/api-vault-connectors/src/lib.rs`, `crates/api-vault-connectors/src/types.rs`
- **Tests**: Rust — `MockConnector` compile

### T060. GitHub App 등록 + webhook 구조

- **Milestone**: M5
- **Priority**: Must
- **Depends on**: T003
- **Goal**: GitHub 에 App 등록 매뉴얼 + 설정 저장 준비.
- **DoD**:
  - `docs/runbooks/github-app-registration.md` — GitHub.com 에서 App 생성 step (권한, webhook URL)
  - App private key 는 릴레이 서버에만 (`GITHUB_APP_PRIVATE_KEY` wrangler secret)
  - 클라이언트는 `installation_id` + 릴레이가 발급한 `installation_token` (1h) 만 쓴다
  - `crates/api-vault-connectors/src/github/mod.rs` — `GithubConnector { installation_id, relay_base_url }` 구조
- **Files Touched**: `docs/runbooks/github-app-registration.md`, `crates/api-vault-connectors/src/github/mod.rs`
- **Tests**: manual runbook 검증

### T061. GitHub Installation Token 발급 (릴레이 경유)

- **Milestone**: M5
- **Priority**: Must
- **Depends on**: T060
- **Goal**: 클라이언트가 private key 없이 short-lived token 획득.
- **DoD**:
  - 릴레이 엔드포인트 `POST /integrations/github/installation-token` — JWT 인증된 user → 해당 user 의 installation_id 로 GitHub App JWT 생성 → `/app/installations/{id}/access_tokens` 호출 → token 반환
  - 릴레이 임시 KV 캐시 (55분, 5분 여유)
  - 클라이언트 `fetch_installation_token()` 호출 헬퍼
- **Files Touched**: `api-vault-relay/src/routes/integrations_github.ts`, `crates/api-vault-connectors/src/github/auth.rs`
- **Tests**: Workers — Miniflare + mock GitHub JWT; Rust — mock 릴레이 응답

### T062. GitHub Secret Scanning 읽기

- **Milestone**: M5
- **Priority**: Must
- **Depends on**: T061
- **Goal**: `list_keys` 구현 — 저장소 Secret Scanning alerts.
- **DoD**:
  - `GET /repos/{owner}/{repo}/secret-scanning/alerts` 호출
  - 응답을 `RemoteKey { id, provider, first_detected, locations_count, secret_type }` 로 매핑
  - 페이지네이션 처리
  - 저장소별 설정 화면에서 scan 버튼
- **Files Touched**: `crates/api-vault-connectors/src/github/secret_scanning.rs`
- **Tests**: Rust — wiremock GitHub API

### T063. GitHub 커넥터 UI (연결 / 저장소 선택 / 스캔)

- **Milestone**: M5
- **Priority**: Must
- **Depends on**: T062, T030
- **Goal**: Settings > Integrations > GitHub 섹션.
- **DoD**:
  - "Connect GitHub" 버튼 → OS 기본 브라우저 열기 (`tauri_plugin_shell::open`) → `https://github.com/apps/api-vault/installations/new` → 완료 후 `apivault://github/callback?installation_id=...` deep link 수신
  - 연결된 installation 목록 + 저장소 리스트 + "Scan" 버튼
  - 스캔 결과를 credential inventory 와 매칭 후 새로운 것은 "Import" 제안
- **Files Touched**: `src/features/settings/GithubIntegrationSection.tsx`, `src/features/settings/use-github-integration.ts`, `crates/api-vault-app/src/commands/github.rs`
- **Tests**: Vitest — 연결/스캔 플로우 mock

### T064. Pro 엔타이틀먼트 게이트 (GitHub write)

- **Milestone**: M5
- **Priority**: Must
- **Depends on**: T062
- **Goal**: "Actions Secrets 쓰기" 동작은 Pro 구독 확인 후에만 실행 (Gate 1 Q5=B).
- **DoD**:
  - `crates/api-vault-app/src/entitlement.rs` — `fn require_pro(state: &AppState) -> Result<(), EntitlementError>`
  - Free 사용자에게는 UI 에서 쓰기 버튼을 disabled + tooltip "Pro feature"
  - 백엔드도 방어적 체크 (요청 시 Pro 아니면 거부)
  - Entitlement 정보는 릴레이 `/me` 캐시 (5분)
- **Files Touched**: `crates/api-vault-app/src/entitlement.rs`, `src/features/billing/use-entitlement.ts`
- **Tests**: Rust — Free/Pro 분기 검증; Vitest — 버튼 disabled 표시

### T065. RAILGUARD 템플릿 라이브러리

- **Milestone**: M5
- **Priority**: Must
- **Depends on**: T002
- **Goal**: `.cursorrules`, `.windsurfrules`, `CLAUDE.md`, `.github/copilot-instructions.md` 기본 템플릿 제공.
- **DoD**:
  - `crates/api-vault-railguard/templates/` 하위에 4개 `.tpl` 파일
  - 각 템플릿은 "이 프로젝트에서는 API 키를 하드코딩하지 말 것, 대신 .env + process.env 사용, 발견 즉시 API Vault 로 이동" 형태의 규칙 10개
  - 프로젝트 메타(name, detected frameworks, issuer list)를 주입할 `{{variables}}`
  - `crates/api-vault-railguard/src/lib.rs` — `fn render(template: RuleKind, ctx: &Context) -> String`
- **Files Touched**: `crates/api-vault-railguard/templates/*.tpl`, `crates/api-vault-railguard/src/lib.rs`
- **Tests**: Rust — 4 rule × 2 fixture context = 8 snapshot tests

### T066. RAILGUARD 커맨드 `railguard_preview` / `railguard_apply`

- **Milestone**: M5
- **Priority**: Must
- **Depends on**: T065
- **Goal**: 프로젝트 폴더에 룰 파일 쓰기.
- **DoD**:
  - `railguard_preview(project_path, rules)` → `Vec<RuleFilePreview { path, content, exists, action: "create"|"update"|"skip" }>`
  - `railguard_apply(project_path, rules)` → 실제 파일 쓰기, 기존 파일은 백업(`.bak-<timestamp>`) 후 덮어쓰기 또는 "append" 모드 선택
  - 사용자 확인 없이 덮어쓰지 않음
- **Files Touched**: `crates/api-vault-app/src/commands/railguard.rs`
- **Tests**: Rust — tempdir 에서 create/update/skip 3 시나리오

### T067. RAILGUARD UI (preview → apply 2단계)

- **Milestone**: M5
- **Priority**: Must
- **Depends on**: T066
- **Goal**: 드롭&스캔 결과 화면에서 "AI 가드레일 룰 생성" 제안 + 별도 `/railguard` 페이지.
- **DoD**:
  - `src/features/railguard/RailguardPage.tsx` — 프로젝트 선택 → 4개 체크박스 → Preview → diff 렌더 → Apply
  - 드롭&스캔 완료 화면(T035)에 CTA 배너 "Add AI guardrail rules to this project? [Preview]"
  - 바이브 코더 친화 톤(파란 정보 배너, 경고 X)
- **Files Touched**: `src/features/railguard/RailguardPage.tsx`, `src/features/railguard/RuleFilesPreview.tsx`, `src/features/onboarding/DetectedKeysReview.tsx`
- **Tests**: Vitest — preview + apply 플로우

### T068. `.env` 스캐너 이벤트 → RAILGUARD 자동 제안

- **Milestone**: M5
- **Priority**: Should
- **Depends on**: T035, T067
- **Goal**: 드롭 폴더에 rule 파일이 없으면 자동으로 "추가할까요?" 안내.
- **DoD**:
  - `DetectedKeysReview` 가 mount 시 `railguard_preview` 호출 → 4개 파일 중 하나라도 `exists=false` 이면 배너 표시
- **Files Touched**: `src/features/onboarding/DetectedKeysReview.tsx`
- **Tests**: Vitest — 배너 표시/숨김 조건

---

## M6 — Audit Log

### T069. `api-vault-audit` 크레이트 (hash chain + ed25519)

- **Milestone**: M6
- **Priority**: Must
- **Depends on**: T017
- **Goal**: architecture.md 4.5 의 체인 구현.
- **DoD**:
  - `crates/api-vault-audit/src/chain.rs`
  - `fn append(repo: &mut AuditRepo, entry: AuditInput, device_key: &SigningKey, prev: Option<&AuditLog>) -> Result<AuditLog>`
  - `fn verify(chain: &[AuditLog], device_public_key: &VerifyingKey) -> ChainVerification { valid_count, first_invalid_seq }`
  - `ed25519-dalek` 사용, `Signer<Signature>` trait
  - 최초 엔트리 `prev_hash = [0u8; 32]`
- **Files Touched**: `crates/api-vault-audit/src/chain.rs`, `Cargo.toml`
- **Tests**: Rust — append 10 entries, 정상 verify; 중간 payload 변조 시 first_invalid_seq 감지

### T070. Device key 생성 + 볼트 저장

- **Milestone**: M6
- **Priority**: Must
- **Depends on**: T016, T069
- **Goal**: 각 디바이스에 ed25519 키 페어 발급(최초 실행 1회).
- **DoD**:
  - `crates/api-vault-app/src/services/device_identity.rs`
  - `fn ensure_device_keys(vault: &mut dyn VaultStorage, sqlite: &DeviceRepo) -> Result<DeviceIdentity>`
  - 없으면 생성, age 볼트 파일의 `device/signing_key` 경로 + SQLite `device` 테이블 insert(public key)
  - 있으면 로드
- **Files Touched**: `crates/api-vault-app/src/services/device_identity.rs`, `crates/api-vault-app/src/lib.rs` (setup)
- **Tests**: Rust — 두 번 호출 시 같은 키 반환

### T071. Audit write 훅 (모든 mutating 커맨드에 삽입)

- **Milestone**: M6
- **Priority**: Must
- **Depends on**: T069, T070
- **Goal**: credential_create, credential_update, credential_delete, kill_switch_revoke, project_create, usage_create/delete, github_scan 등 후에 AuditLog append.
- **DoD**:
  - `crates/api-vault-app/src/audit_ctx.rs` — `struct AuditCtx { device_key, repo }`; `fn record(action: &str, subject_kind, subject_id, payload_json) -> Result<()>`
  - 각 command 말미에 `audit_ctx.record(...)` 호출
  - transaction 기반: command 트랜잭션 안에서 audit insert 가 실패하면 전체 rollback
- **Files Touched**: `crates/api-vault-app/src/audit_ctx.rs`, 모든 mutating `commands/*.rs`
- **Tests**: Rust — credential_create 후 audit_log row 존재 검증

### T072. Audit 커맨드 `audit_list` / `audit_verify_chain`

- **Milestone**: M6
- **Priority**: Must
- **Depends on**: T069
- **Goal**: UI 제공.
- **DoD**:
  - `crates/api-vault-app/src/commands/audit.rs`
  - `audit_list(limit, offset, filter)` → `Vec<AuditEntry>` (device별)
  - `audit_verify_chain()` → `ChainVerification` (전체 device 기준)
- **Files Touched**: `crates/api-vault-app/src/commands/audit.rs`
- **Tests**: Rust — 체인 검증

### T073. Audit UI (`/audit`)

- **Milestone**: M6
- **Priority**: Must
- **Depends on**: T072, T009
- **Goal**: 타임라인 뷰 + 체인 검증 버튼.
- **DoD**:
  - `src/features/audit/AuditPage.tsx`
  - 테이블: 시간, actor, action, subject, device 배지
  - 상단 "Verify chain" 버튼 → 검증 결과 banner (green: "All {n} entries valid", red: "Chain broken at seq {k}")
  - 필터: action kind, date range
- **Files Touched**: `src/features/audit/AuditPage.tsx`, `src/features/audit/use-audit.ts`
- **Tests**: Vitest — 렌더 + verify 버튼

### T074. Credential Detail 에 Audit 섹션

- **Milestone**: M6
- **Priority**: Must
- **Depends on**: T027, T072
- **Goal**: 해당 키의 audit log 만 필터링.
- **DoD**:
  - `src/features/inventory/CredentialDetail.tsx` 내부에 `AuditForCredential` 서브 섹션
  - 최근 10개 표시 + "View all in audit log" 링크
- **Files Touched**: `src/features/inventory/CredentialDetail.tsx`, `src/features/audit/AuditForCredential.tsx`
- **Tests**: Vitest — 렌더

---

## M7 — Kill Switch

### T075. Revoke 커맨드 (로컬 표시만)

- **Milestone**: M7
- **Priority**: Must
- **Depends on**: T022, T071
- **Goal**: credential 을 `status='revoked'` 로 변경 + 모든 usage 에 "이 키는 revoked" 플래그.
- **DoD**:
  - `crates/api-vault-app/src/commands/kill_switch.rs`
  - `kill_switch_request_confirm(cred_id) -> ConfirmationToken` (random 16 bytes hex, KV 인메모리 5분 TTL)
  - `kill_switch_revoke(cred_id, token) -> Result<()>` — 토큰 검증 후 credential status 업데이트 + audit log append
  - 값 자체를 age 볼트에서 삭제할지는 사용자 선택 (기본: 유지, "Also delete value" 체크박스)
- **Files Touched**: `crates/api-vault-app/src/commands/kill_switch.rs`
- **Tests**: Rust — 토큰 없이 호출 시 reject, 정상 플로우 시 status 변경

### T076. Kill Switch 2단계 확인 UI

- **Milestone**: M7
- **Priority**: Must
- **Depends on**: T075, T009
- **Goal**: Credential Detail 에서 "Revoke" 버튼 → 확인 모달.
- **DoD**:
  - `src/features/kill-switch/KillSwitchDialog.tsx`
  - 1단계: "Type the credential name to confirm" input → 일치해야 활성화
  - 2단계: `kill_switch_request_confirm` 응답 토큰 기반 "I understand, revoke now" 버튼
  - 옵션 체크박스: "Also delete encrypted value"
  - 성공 toast "Credential revoked"
  - 모바일에서는 biometric 추가 (`@tauri-apps/plugin-biometric`)
- **Files Touched**: `src/features/kill-switch/KillSwitchDialog.tsx`, `src/features/inventory/CredentialDetail.tsx`
- **Tests**: Vitest — 이름 미일치 시 버튼 disabled, 성공 플로우

### T077. Revoked 상태 시각화 (Inventory / Graph)

- **Milestone**: M7
- **Priority**: Must
- **Depends on**: T075, T025, T045
- **Goal**: revoked credential 은 strikethrough + "Revoked" 배지 + 그래프 노드는 빨간 outline.
- **DoD**:
  - `CredentialCard`, `CredentialNode` 에 status 기반 스타일 분기
  - Inventory 필터 "Hide revoked" 기본 활성
- **Files Touched**: `src/features/inventory/CredentialCard.tsx`, `src/features/graph/nodes/CredentialNode.tsx`
- **Tests**: Vitest — 상태별 렌더

### T078. Bulk Revoke (Issuer 단위)

- **Milestone**: M7
- **Priority**: Must
- **Depends on**: T075
- **Goal**: 발급처 전체에 대해 일괄 revoke (Incident 대응).
- **DoD**:
  - Issuer 상세 화면에 "Revoke all credentials from this issuer" 버튼
  - 확인 모달: issuer name 타이핑 + 개수 확인 ("This will revoke 5 credentials")
  - 모든 credential 에 대해 순차 revoke, progress bar
- **Files Touched**: `src/features/issuers/IssuerDetail.tsx`, `src/features/kill-switch/BulkRevokeDialog.tsx`, `crates/api-vault-app/src/commands/kill_switch.rs` (`kill_switch_revoke_issuer`)
- **Tests**: Rust — 5개 credential 일괄 처리; Vitest — progress

---

## M8 — Auth (Passkey + OAuth)

### T079. Cloudflare Workers 릴레이 프로젝트 스캐폴드

- **Milestone**: M8
- **Priority**: Must
- **Depends on**: -
- **Goal**: `api-vault-relay/` 레포 (EE, private) 초기 구성.
- **DoD**:
  - 별도 GitHub 레포 (private) + local symlink or 서브모듈
  - `wrangler init`, Hono + Drizzle + D1 + KV 바인딩
  - `GET /health` 200 OK 엔드포인트
  - `wrangler dev` 로컬 실행 가능, `wrangler deploy` 프로덕션 배포 성공
- **Files Touched**: `api-vault-relay/` 전체 (별도 레포)
- **Tests**: `curl localhost:8787/health` → 200

### T080. D1 마이그레이션 (릴레이 스키마)

- **Milestone**: M8
- **Priority**: Must
- **Depends on**: T079
- **Goal**: architecture.md 3.4 의 D1 테이블 생성.
- **DoD**:
  - `api-vault-relay/src/db/schema.ts` — Drizzle 정의
  - `api-vault-relay/src/db/migrations/0001_init.sql`
  - `wrangler d1 migrations apply` 로 dev/prod 둘 다 실행
- **Files Touched**: `api-vault-relay/src/db/*`
- **Tests**: integration — `curl /health` 후 D1 console `SELECT name FROM sqlite_master`

### T081. WebAuthn (Passkey) 서버 구현

- **Milestone**: M8
- **Priority**: Must
- **Depends on**: T080
- **Goal**: 등록/로그인 엔드포인트.
- **DoD**:
  - `@simplewebauthn/server` 사용
  - `/auth/passkey/register/start`, `/auth/passkey/register/verify`
  - `/auth/passkey/assert/start`, `/auth/passkey/assert/verify`
  - challenge 는 KV 5분 TTL
  - 성공 시 JWT (ES256, `JWT_SIGNING_KEY` wrangler secret) 발급
- **Files Touched**: `api-vault-relay/src/routes/auth.ts`, `api-vault-relay/src/lib/webauthn.ts`, `api-vault-relay/src/lib/jwt.ts`
- **Tests**: Miniflare + `@simplewebauthn/browser` 로 E2E

### T082. OAuth (GitHub, Google) 서버 구현

- **Milestone**: M8
- **Priority**: Must
- **Depends on**: T080
- **Goal**: OAuth 2.0 authorization code flow.
- **DoD**:
  - `/auth/oauth/:provider/start` → state 생성, authorize URL 반환
  - `/auth/oauth/:provider/callback` → code 교환 → provider API `/user` 호출 → 사용자 매핑 → JWT 발급
  - state 는 KV 5분 TTL
  - 지원 provider: github, google
- **Files Touched**: `api-vault-relay/src/routes/auth.ts`, `api-vault-relay/src/lib/oauth.ts`
- **Tests**: Miniflare + nock GitHub/Google

### T083. 클라이언트 `auth_*` 커맨드 (Passkey + OAuth)

- **Milestone**: M8
- **Priority**: Must
- **Depends on**: T081, T082, T003
- **Goal**: Rust 백엔드에서 릴레이 호출 + 세션 JWT 저장.
- **DoD**:
  - `crates/api-vault-app/src/commands/auth.rs`
  - Passkey: Tauri WebView 에서 `navigator.credentials.create/get` 을 사용 → 프론트가 payload 생성 후 백엔드에 전달 → 백엔드가 릴레이 호출
  - OAuth: `tauri_plugin_shell::open(auth_url)` → OS 브라우저 → deep link `apivault://auth/callback` → 수신 → 릴레이에 code 교환
  - JWT 는 age 볼트 파일의 `auth/session_token` 레코드 경로에 저장
- **Files Touched**: `crates/api-vault-app/src/commands/auth.rs`, `src-tauri/tauri.conf.json` (deep link scheme)
- **Tests**: Rust — mock 릴레이 응답 테스트; manual E2E

### T084. SignIn 페이지 UI

- **Milestone**: M8
- **Priority**: Must
- **Depends on**: T083
- **Goal**: `/auth/sign-in` 화면 (로컬 볼트와는 별개 — 클라우드 동기화 활성화 시에만 필요).
- **DoD**:
  - `src/features/auth/SignInPage.tsx` — Passkey 버튼 + GitHub/Google 버튼 + "Keep offline" 옵션
  - 이미 볼트는 로컬 unlock 되어 있는 상태에서 호출 (동기화 활성화 플로우)
  - 성공 시 `/settings/sync` 로 리디렉션
- **Files Touched**: `src/features/auth/SignInPage.tsx`, `src/features/auth/PasskeyButton.tsx`, `src/features/auth/OAuthButton.tsx`
- **Tests**: Vitest — 버튼 click invoke

### T085. Salt 저장 + 키 파생 통합 (Zero-Knowledge)

- **Milestone**: M8
- **Priority**: Must
- **Depends on**: T017, T083
- **Goal**: 회원가입 시 릴레이가 `salt_auth`, `salt_enc` 발급 → 클라이언트가 저장.
- **DoD**:
  - 회원가입 응답 body 에 `salt_auth`, `salt_enc` 포함 (base64)
  - 클라이언트는 local master passphrase 를 받아 `derive_auth_hash(pw, salt_auth)` 로 서버 검증용 해시 생성 + `derive_enc_key(pw, salt_enc)` 로 로컬 enc key 파생
  - 향후 로그인 시 서버가 salt 둘 다 다시 내려줌
- **Files Touched**: `api-vault-relay/src/routes/auth.ts`, `crates/api-vault-app/src/services/session.rs`, `crates/api-vault-crypto/src/kdf.rs`
- **Tests**: Rust — salt_auth != salt_enc 일 때 key 달라짐

### T086. Session 관리 + 토큰 갱신

- **Milestone**: M8
- **Priority**: Must
- **Depends on**: T083
- **Goal**: JWT 만료 시 자동 refresh (refresh token).
- **DoD**:
  - 릴레이 refresh 엔드포인트 `POST /auth/refresh`
  - 클라이언트 reqwest middleware 로 401 시 자동 refresh 후 재시도
  - refresh token 은 age 볼트 파일의 `auth/refresh_token` 레코드 경로
- **Files Touched**: `api-vault-relay/src/routes/auth.ts`, `crates/api-vault-app/src/services/session.rs`
- **Tests**: Rust — mock 401 → refresh → 200 재시도

---

## M9 — Sync Infrastructure

### T087. Yjs + SecSync 프론트엔드 셋업

- **Milestone**: M9
- **Priority**: Must
- **Depends on**: T085
- **Goal**: 로컬 Y.Doc + SecSync client 초기화.
- **DoD**:
  - `yjs`, `@syncedstore/core`, `secsync` 패키지 설치
  - `src/features/sync/SyncProvider.tsx` — Y.Doc 생성, IndexedDB persistence (`y-indexeddb`), SecSync 커넥터
  - `useSync()` 훅으로 `Y.Map` 읽기/쓰기 래핑
- **Files Touched**: `src/features/sync/SyncProvider.tsx`, `src/features/sync/use-sync.ts`, `package.json`
- **Tests**: Vitest — Y.Doc 생성, set/get

### T088. SecSync 암호화 키 주입

- **Milestone**: M9
- **Priority**: Must
- **Depends on**: T085, T087
- **Goal**: `crdt_root_key` 를 SecSync 에 전달.
- **DoD**:
  - 세션 복원 시 `derive_subkey(enc_key, "crdt-root")` 결과를 프론트로 전달
  - Tauri 명령 `sync_get_root_key()` (세션 활성 + 메모리에만 존재)
  - 클라이언트는 이 키로 SecSync 초기화
- **Files Touched**: `crates/api-vault-app/src/commands/sync.rs`, `src/features/sync/SyncProvider.tsx`
- **Tests**: Rust — key 파생 결정론; Vitest — init mock

### T089. CRDT ↔ SQLite 양방향 매핑 (credential/issuer/project/...)

- **Milestone**: M9
- **Priority**: Must
- **Depends on**: T087
- **Goal**: Y.Map 변경 시 SQLite 에 반영, SQLite 변경 시 Y.Map 에 반영 (이벤트 방향성 중복 방지).
- **DoD**:
  - `src/features/sync/mapping.ts` — 각 엔티티별 bidirectional mapper
  - `Y.Map` observe → Tauri invoke upsert (origin tag 로 루프 방지)
  - Tauri emit `db:changed` → Y.Map update (origin tag)
  - `vault_ref` 같은 디바이스 로컬 필드는 CRDT 밖
- **Files Touched**: `src/features/sync/mapping.ts`, `crates/api-vault-app/src/commands/sync.rs` (`sync_apply_update`, emit `db:changed`)
- **Tests**: Vitest — Y.Map 변경 → invoke 호출 추적

### T090. 릴레이 `/sync` 엔드포인트 구현

- **Milestone**: M9
- **Priority**: Must
- **Depends on**: T080, T081
- **Goal**: 암호화된 CRDT 델타 업로드/다운로드.
- **DoD**:
  - `POST /sync/snapshot` — body `{ doc_id, version, ciphertext_b64, nonce_b64 }` → `encrypted_docs` insert
  - `GET /sync/deltas?since=<clock>` → `pending_deltas` 에서 해당 user 의 delta 반환
  - Rate limit: user 당 100req/min (KV sliding window)
  - JWT 필수
- **Files Touched**: `api-vault-relay/src/routes/sync.ts`
- **Tests**: Miniflare — upload + download 라운드트립

### T091. 키 값 동기화 채널 (value sync)

- **Milestone**: M9
- **Priority**: Must
- **Depends on**: T088, T090
- **Goal**: architecture.md 2.5 의 값 전용 채널.
- **DoD**:
  - 릴레이 `encrypted_secret_values` 테이블 추가
  - `POST /sync/values` / `GET /sync/values?since=...`
  - 클라이언트: credential 값 변경 시 `value_root_key` 로 AEAD → 업로드; 새 credential 수신 시 다운로드 → age 볼트 파일에 저장
- **Files Touched**: `api-vault-relay/src/routes/sync.ts`, `api-vault-relay/src/db/schema.ts` (encrypted_secret_values), `crates/api-vault-app/src/services/value_sync.rs`, `src/features/sync/value-sync.ts`
- **Tests**: Rust + Miniflare — 라운드트립

### T092. Device pairing (X25519 QR + PIN)

- **Milestone**: M9
- **Priority**: Must
- **Depends on**: T070, T090
- **Goal**: 신규 디바이스가 기존 디바이스와 E2EE 방식으로 페어링 → 같은 enc_key 복제.
- **DoD**:
  - 기존 디바이스: `sync_pair_device_start()` → X25519 ephemeral keypair 생성 + 6자리 PIN + QR (`apivault://pair?pk=...&pin=...&user=...`) 표시
  - 신규 디바이스: QR 스캔 또는 코드 입력 → 자체 X25519 keypair 생성 → ECDH → `HKDF(ecdh, "pair-transport")` → 기존 디바이스가 `enc_key` 를 이 채널로 암호화 전송
  - 릴레이는 `pair-challenge:<code>` KV 로 암호문 중계 (5분 TTL)
  - 성공 후 신규 디바이스가 `enc_key` 로 SecSync 참여 가능
- **Files Touched**: `api-vault-relay/src/routes/pair.ts`, `crates/api-vault-app/src/commands/pair.rs`, `src/features/sync/DevicePairingDialog.tsx`
- **Tests**: Rust — 두 `MockVaultStorage` 간 페어링 시뮬; Vitest — QR 렌더

### T093. Settings > Sync 섹션

- **Milestone**: M9
- **Priority**: Must
- **Depends on**: T084, T092
- **Goal**: 사용자가 동기화 활성/비활성, 디바이스 목록, 페어링 트리거.
- **DoD**:
  - `src/features/settings/SyncSection.tsx`
  - 상태: "Sync disabled" / "Sync active (last synced X min ago)"
  - 버튼: "Sign in to enable sync" (T084 로), "Add device" (DevicePairingDialog), "Sign out"
  - 디바이스 목록 (이 디바이스 highlighted) + "Remove" 버튼 (revoke)
- **Files Touched**: `src/features/settings/SyncSection.tsx`
- **Tests**: Vitest — 상태 분기 렌더

### T094. Pro 엔타이틀먼트 게이트 (Sync)

- **Milestone**: M9
- **Priority**: Must
- **Depends on**: T064
- **Goal**: Free 사용자는 2대까지 무료, 3대 이상은 Pro 필요 (project-decisions.md "Pro = 멀티 디바이스 동기화" 의 현실적 운영 — Free도 2대까지 허용하여 진입장벽 낮춤).
- **DoD**:
  - 디바이스 pairing 시 서버 확인: 현재 디바이스 수 + plan → Free 2대 초과 또는 Pro=false 면 거부 (혹은 "Upgrade to add more devices")
  - UI에서 명확한 업셀 메시지
  - **결정 확인 필요:** project-decisions.md 에 "Free 는 단일 기기" 로 명시됨 — 2대 허용은 Open Issue 로 제출 (아래 Open Issues 참조)
- **Files Touched**: `api-vault-relay/src/routes/pair.ts`, `src/features/sync/DevicePairingDialog.tsx`
- **Tests**: Miniflare — Free 2대 시 거부; Vitest — upsell UI

### T095. Conflict resolution 전략 (last-write-wins + 사용자 알림)

- **Milestone**: M9
- **Priority**: Must
- **Depends on**: T089
- **Goal**: Y.Map CRDT 는 기본적으로 충돌 해결 내장이지만, 값 채널은 따로 (value sync 는 CRDT 아님).
- **DoD**:
  - 값 채널: `version` 필드로 monotonic, 높은 쪽 승리
  - CRDT 쪽 충돌 시 UI 토스트 "Conflict on {field} resolved by {policy}"
  - Credential `status` 필드처럼 중요한 필드는 별도 해결 로직 (revoked > active always)
- **Files Touched**: `src/features/sync/conflict.ts`
- **Tests**: Vitest — 시나리오 3개 (동시 edit, revoke vs update, 값 업데이트 경합)

### T096. 오프라인 지원 확인 (IndexedDB persistence)

- **Milestone**: M9
- **Priority**: Must
- **Depends on**: T087
- **Goal**: 네트워크 없을 때도 모든 기능 동작, 복귀 시 자동 sync.
- **DoD**:
  - `y-indexeddb` provider 로 오프라인 상태 persist
  - 온라인 복귀 감지(`window.online`) 후 `sync_trigger()` 호출
  - 네트워크 상태 배지 (상단 바 "Offline" / "Syncing..." / "Synced")
- **Files Touched**: `src/features/sync/SyncProvider.tsx`, `src/components/shell/SyncStatusBadge.tsx`
- **Tests**: Vitest — offline/online 전환 시 동작

---

## M10 — Payments

### T097. Paddle 계정 등록 + 가격 설정 (runbook)

- **Milestone**: M10
- **Priority**: Must
- **Depends on**: -
- **Goal**: Paddle MoR 벤더 승인 + Pro $2/월 제품 생성.
- **DoD**:
  - `docs/runbooks/paddle-setup.md` — 벤더 신청, KYC, 제품 생성, 가격 등록 (USD $2/월)
  - Paddle 샌드박스 환경 먼저 테스트
  - webhook URL: `https://relay.apivault.app/billing/paddle/webhook`
- **Files Touched**: `docs/runbooks/paddle-setup.md`
- **Tests**: manual — 샌드박스 checkout 성공

### T098. RevenueCat 프로젝트 + App Store / Play Store 제품 연결

- **Milestone**: M10
- **Priority**: Must
- **Depends on**: T097
- **Goal**: 크로스 플랫폼 구독 통합.
- **DoD**:
  - `docs/runbooks/revenuecat-setup.md`
  - App Store Connect 구독 그룹 `api_vault_pro_monthly` 생성 (필요: Apple Developer Program)
  - Play Console 구독 SKU 생성 (필요: Play Console)
  - RevenueCat Project: iOS/Android/Web (Paddle) 3개 앱 등록
  - Entitlement: `pro`
- **Files Touched**: `docs/runbooks/revenuecat-setup.md`
- **Tests**: manual

### T099. Paddle webhook 수신 (릴레이)

- **Milestone**: M10
- **Priority**: Must
- **Depends on**: T097, T080
- **Goal**: subscription 이벤트 처리 → `users.plan` 업데이트.
- **DoD**:
  - `/billing/paddle/webhook` → Paddle HMAC 서명 검증 → 이벤트별 분기 (`subscription.created`, `updated`, `canceled`, `payment.succeeded`)
  - `billing_events` 로깅
  - 멱등성: 같은 `event_id` 중복 수신 시 skip
- **Files Touched**: `api-vault-relay/src/routes/billing.ts`, `api-vault-relay/src/lib/paddle.ts`
- **Tests**: Miniflare — Paddle 샘플 payload 3개

### T100. RevenueCat webhook 수신 (릴레이)

- **Milestone**: M10
- **Priority**: Must
- **Depends on**: T098, T080
- **Goal**: iOS/Android 구독 이벤트 처리.
- **DoD**:
  - `/billing/revenuecat/webhook` → RC HMAC 검증 → `INITIAL_PURCHASE`, `RENEWAL`, `CANCELLATION`, `EXPIRATION`
  - `users.plan` + `plan_source` + `plan_expires_at` 업데이트
- **Files Touched**: `api-vault-relay/src/routes/billing.ts`, `api-vault-relay/src/lib/revenuecat.ts`
- **Tests**: Miniflare — RC 샘플 payload 4개

### T101. 클라이언트 `billing_*` 커맨드

- **Milestone**: M10
- **Priority**: Must
- **Depends on**: T099, T100
- **Goal**: UI 에 구독 상태 제공 + checkout 트리거.
- **DoD**:
  - `billing_status()` → `Entitlement { plan, source, expires_at, grace }`
  - `billing_open_checkout(plan)` → 데스크톱: Paddle JS overlay URL 생성 후 `shell::open`; 모바일: RevenueCat SDK IAP 트리거 (native plugin)
  - 5분 캐시, 수동 refresh 가능
- **Files Touched**: `crates/api-vault-app/src/commands/billing.rs`, `src/features/billing/use-entitlement.ts`, `src/features/billing/use-paddle-checkout.ts`
- **Tests**: Rust — mock 릴레이 응답; Vitest — checkout click

### T102. Upgrade 다이얼로그 + 프리미엄 CTA

- **Milestone**: M10
- **Priority**: Must
- **Depends on**: T101
- **Goal**: Pro 기능 호출 시 비업그레이드 사용자에게 upsell.
- **DoD**:
  - `src/features/billing/UpgradeDialog.tsx` — 기능별 설명 + "Upgrade for $2/month" 버튼
  - Settings > Billing 섹션: 현재 plan, 만료일, "Manage subscription" (Paddle customer portal 또는 App Store subscriptions)
  - 업그레이드 후 자동 엔타이틀먼트 refresh
- **Files Touched**: `src/features/billing/UpgradeDialog.tsx`, `src/features/settings/BillingSection.tsx`
- **Tests**: Vitest — 버튼 flow

### T103. RevenueCat 모바일 SDK 통합 (Tauri 플러그인 또는 네이티브 브릿지)

- **Milestone**: M10
- **Priority**: Must
- **Depends on**: T098, T101
- **Goal**: iOS/Android 에서 IAP 트리거.
- **DoD**:
  - `tauri-plugin-revenuecat` 커뮤니티 플러그인 있으면 사용; 없으면 간단한 네이티브 플러그인 생성 (Swift / Kotlin wrapper)
  - `billing_open_checkout` 이 모바일에서 `purchase(sku)` 네이티브 호출
  - 구매 성공 이벤트 → 릴레이 status 재확인
- **Files Touched**: `crates/api-vault-app-mobile-plugin-revenuecat/` (new mobile plugin crate), `src/features/billing/use-revenuecat.ts`
- **Tests**: manual — iOS 시뮬레이터 + sandbox 구매; Android 에뮬레이터 + test SKU

---

## M11 — Mobile Port

### T104. Tauri 모바일 init (iOS / Android 프로젝트 생성)

- **Milestone**: M11
- **Priority**: Must
- **Depends on**: T003
- **Goal**: `tauri ios init`, `tauri android init` 실행.
- **DoD**:
  - `src-tauri/gen/apple/`, `src-tauri/gen/android/` 생성
  - Bundle ID: `com.phoodul.apivault`
  - iOS: Xcode project 열기 → Signing team 설정 (Apple Developer Program 필요)
  - Android: Gradle sync 성공
  - `pnpm tauri ios dev` / `pnpm tauri android dev` 에뮬레이터 실행 성공
- **Files Touched**: `src-tauri/gen/*`, `src-tauri/tauri.conf.json`, `docs/runbooks/mobile-setup.md`
- **Tests**: manual — 에뮬레이터 실행

### T105. age 볼트 파일 모바일 동작 검증 (PoC)

- **Milestone**: M11
- **Priority**: Must
- **Depends on**: T016, T104
- **Goal**: iOS/Android 에서 `AgeVaultStorage` 기반 볼트 파일 생성/해제/CRUD 정상 동작 확인. (과거 Stronghold PoC 였으나 2026-04-22 교체 결정에 따라 age 기반으로 재정의. age 는 pure Rust 이므로 네이티브 C 의존성 이슈는 사전 해소됨.)
- **DoD**:
  - `crates/api-vault-storage/tests/mobile_age_vault_poc.rs` (feature-gated)
  - 실제 기기 1회 수동 테스트: vault_init → put_secret → lock → unlock → get_secret 라운드트립
  - 파일 경로: iOS `$DOCUMENTS/vault.age`, Android `$FILES/vault.age` (Tauri path API 사용, 하드코딩 금지)
  - iOS 샌드박스/Android scoped storage 권한 경계 확인
- **Files Touched**: `crates/api-vault-storage/src/age_vault/mod.rs` (mobile 경로 분기), `docs/runbooks/mobile-age-vault-verification.md`
- **Tests**: manual on device

### T106. Biometric 잠금 해제 (iOS Face/Touch ID, Android BiometricPrompt)

- **Milestone**: M11
- **Priority**: Must
- **Depends on**: T104
- **Goal**: 모바일에서 매번 패스프레이즈 입력하지 않도록.
- **DoD**:
  - `@tauri-apps/plugin-biometric` 통합
  - 볼트 unlock 시 "Unlock with Face ID / Fingerprint" 제안
  - 인증 성공 시 OS Keychain 에 저장된 derived key 로 age 볼트 파일 unlock
  - iOS: `biometryCurrentSet` 플래그로 바이오메트릭 변경 시 무효화
  - Android: `setUserAuthenticationRequired(true)` + `KeyPermanentlyInvalidatedException` 처리 → 재등록 UX
- **Files Touched**: `crates/api-vault-app/src/commands/biometric.rs`, `src/features/vault/BiometricUnlock.tsx`
- **Tests**: manual on device

### T107. 모바일 하단 네비게이션

- **Milestone**: M11
- **Priority**: Must
- **Depends on**: T010
- **Goal**: 데스크톱 사이드바 대신 iOS/Android 표준 하단 탭.
- **DoD**:
  - `src/components/shell/BottomNav.tsx` — Inventory / Graph(List) / Incidents / Settings 4탭
  - 터치 타겟 최소 24×24px (WCAG 2.5.8)
  - 활성 탭 하이라이트
  - `getPlatform() === 'mobile'` 분기로 AppShell 에서 렌더
- **Files Touched**: `src/components/shell/BottomNav.tsx`, `src/components/shell/AppShell.tsx`
- **Tests**: Vitest — 탭 전환

### T108. 모바일 한계 대응 (`.env` 스캔 제한 등)

- **Milestone**: M11
- **Priority**: Must
- **Depends on**: T035, T104
- **Goal**: architecture.md 5.3 의 제약 적용.
- **DoD**:
  - `.env` 스캔: 모바일에서는 DropZone 숨김 + "Desktop 에서 스캔 후 동기화" 안내 배너
  - Updater: 모바일에서는 `tauri-plugin-updater` 비활성화, 스토어 업데이트 안내 대신 표시
  - RAILGUARD: 모바일에서 비활성화
- **Files Touched**: 여러 features 에서 platform 분기
- **Tests**: Vitest — platform mock

### T109. 푸시 알림 (iOS APNs / Android FCM) — Incident 알림

- **Milestone**: M11
- **Priority**: Should
- **Depends on**: T054, T104
- **Goal**: 중요한 incident 발생 시 푸시.
- **DoD**:
  - `@tauri-apps/plugin-notification` 로 토큰 발급 → 릴레이 `/devices/register-push` 로 저장
  - 릴레이에서 incident 매칭 시 해당 user 의 디바이스에 FCM/APNs 전송
  - user opt-in 설정 (Settings > Notifications)
- **Files Touched**: `api-vault-relay/src/routes/devices.ts`, `api-vault-relay/src/lib/push.ts`, `src/features/settings/NotificationsSection.tsx`
- **Tests**: manual on device

---

## M12 — Web Read-Only Viewer

### T110. 웹 빌드 타겟 분리 (`VITE_BUILD_TARGET=web`)

- **Milestone**: M12
- **Priority**: Must
- **Depends on**: T010
- **Goal**: Vite 빌드 옵션으로 Tauri 전용 코드 제거.
- **DoD**:
  - `package.json` script: `"build:web": "VITE_BUILD_TARGET=web vite build --outDir dist-web"`
  - `src/lib/tauri.ts` 의 모든 `invoke()` 는 `isTauri()` 가드
  - 웹에서 서버 API 직접 호출 (릴레이 `/sync`, `/auth`)
  - `wrangler pages` 배포 준비 — Cloudflare Pages 프로젝트 `api-vault-web`
- **Files Touched**: `vite.config.ts`, `src/lib/tauri.ts`, `package.json`
- **Tests**: `pnpm build:web` 성공

### T111. 웹 전용 데이터 레이어 (릴레이 직접 호출)

- **Milestone**: M12
- **Priority**: Must
- **Depends on**: T110, T090
- **Goal**: 웹에서는 SQLite 없이 릴레이에서 CRDT 가져와 로컬 복호화 후 메모리에서만 동작.
- **DoD**:
  - `src/lib/data-source.ts` — `Tauri` 구현체 vs `Web` 구현체 전환
  - Web 구현체: 릴레이 `/sync/deltas` + SecSync 로컬 복호화 → Y.Map 렌더
  - 읽기 전용: 모든 mutating action disabled + tooltip "Use the desktop app to edit"
- **Files Touched**: `src/lib/data-source.ts`, `src/lib/data-source-web.ts`, `src/lib/data-source-tauri.ts`
- **Tests**: Vitest — web 구현체는 mutating API 가 throw

### T112. Passkey 웹 로그인 (WebAuthn 브라우저)

- **Milestone**: M12
- **Priority**: Must
- **Depends on**: T081, T110
- **Goal**: 웹에서 passkey 만으로 인증 (패스프레이즈 입력은 별도 모달).
- **DoD**:
  - `@simplewebauthn/browser` 로 `navigator.credentials.get` 호출
  - 패스프레이즈는 세션 중 한 번만 입력 → `enc_key` 메모리 파생
  - 브라우저 종료 시 메모리 소멸 (자동 로그아웃)
- **Files Touched**: `src/features/auth/WebAuthFlow.tsx`
- **Tests**: Playwright — Chromium + virtual authenticator

### T113. Cloudflare Pages 배포

- **Milestone**: M12
- **Priority**: Must
- **Depends on**: T110
- **Goal**: `app.apivault.app` 에 웹 뷰어 배포.
- **DoD**:
  - `wrangler.pages.toml`
  - GitHub Actions `.github/workflows/deploy-web.yml` — main 브랜치 push 시 `pnpm build:web && wrangler pages deploy dist-web`
  - CORS: 릴레이에서 `app.apivault.app` 허용
- **Files Touched**: `.github/workflows/deploy-web.yml`, `wrangler.pages.toml`, `api-vault-relay/src/index.ts` (CORS)
- **Tests**: manual — https 접속 확인

---

## M13 — i18n + Updater + Release

### T114. i18n 번역 (ko, ja)

- **Milestone**: M13
- **Priority**: Should
- **Depends on**: T011
- **Goal**: 한국어, 일본어 핵심 키 번역.
- **DoD**:
  - `src/locales/ko/common.json`, `src/locales/ja/common.json` 주요 키 ~150개 번역
  - Settings > Language 에서 전환 가능
  - 전환 시 날짜/숫자 locale format 도 반영 (`Intl.DateTimeFormat`)
- **Files Touched**: `src/locales/ko/common.json`, `src/locales/ja/common.json`
- **Tests**: Vitest — language switch render

### T115. tauri-plugin-updater + minisign 서명 인프라

- **Milestone**: M13
- **Priority**: Must
- **Depends on**: T003
- **Goal**: 자동 업데이트.
- **DoD**:
  - `src-tauri/tauri.conf.json` `updater.pubkey` 에 minisign public key
  - `src-tauri/.keys/minisign.pub` 커밋, private key 는 GitHub Secrets
  - GitHub Actions `release.yml` 에서 `minisign -S` 호출
  - 클라이언트에서 주기적 체크 + "Update available" 배너 + 1-click 설치
- **Files Touched**: `src-tauri/tauri.conf.json`, `.github/workflows/release.yml`, `src-tauri/.keys/minisign.pub`, `src/features/updater/UpdateBanner.tsx`
- **Tests**: manual — 테스트 릴리스 업로드 후 업데이트 수신

### T116. GitHub Actions 릴리스 매트릭스 (win/mac/linux)

- **Milestone**: M13
- **Priority**: Must
- **Depends on**: T115
- **Goal**: 태그 push 시 자동 빌드 + 서명 + GitHub Release 생성.
- **DoD**:
  - `.github/workflows/release.yml` — `tauri-apps/tauri-action@v0` 사용, matrix 6개 (Win x64/arm64, Mac x64/arm64, Linux x64, Linux arm64)
  - Tauri signing (minisign) + Windows Authenticode (SignPath/Azure) + macOS notarization
  - Release body 에 변경사항 (conventional commits → CHANGELOG)
- **Files Touched**: `.github/workflows/release.yml`, `CHANGELOG.md`
- **Tests**: dry-run tag `v0.1.0-rc.1` → release artifacts 생성 확인

### T117. iOS / Android 스토어 제출 (Fastlane)

- **Milestone**: M13
- **Priority**: Must
- **Depends on**: T104, T116
- **Goal**: App Store Connect + Play Console 제출.
- **DoD**:
  - `fastlane/Fastfile` iOS lane: `match`, `gym`, `pilot` (TestFlight)
  - Android lane: `supply` (Play Store internal track)
  - 스크린샷 (5개 디바이스 사이즈) 자동 생성 또는 수동 업로드
  - 앱 스토어 심사 승인 (수동 대기 1~2주)
- **Files Touched**: `fastlane/Fastfile`, `fastlane/Appfile`, `.github/workflows/release-mobile.yml`
- **Tests**: manual — TestFlight/Internal track 빌드 수신

### T118. 런치 준비 (프라이버시 정책, 약관, 마케팅 사이트)

- **Milestone**: M13
- **Priority**: Must
- **Depends on**: T113
- **Goal**: 법적 문서 + 랜딩 페이지.
- **DoD**:
  - `docs/legal/privacy.md`, `docs/legal/terms.md` 작성 (템플릿 기반 + 변호사 리뷰는 Open Issue)
  - `apps/marketing/` Astro 프로젝트 (별도 repo or monorepo): 홈, Features, Pricing, Download, Blog (empty), Docs 링크
  - `apivault.app` 도메인 연결 (Cloudflare DNS)
  - `README.md` 에 마케팅 사이트 + 다운로드 링크
- **Files Touched**: `docs/legal/*.md`, `apps/marketing/*`, `README.md`
- **Tests**: manual — https://apivault.app 200 OK

---

## M14 — Auto Rotation

자동 rotation 은 Pro 의 핵심 가치 기둥. T059 `Connector` trait `RotationCap { Full / Partial / Manual }` 활용. 4 phase 단계화: R1 Full → R2 Partial → R3 Manual + provider intelligence → R4 Schedule + Health.

### T119. Rotation 도메인 모델 + 상태 머신

- **Milestone**: M14
- **Priority**: Must
- **Depends on**: T020, T059, T071
- **Goal**: rotation 진행 상태 추적 모델.
- **DoD**:
  - `crates/api-vault-core/src/models/rotation.rs`
  - `RotationJob { id, credential_id, connector_id, state: RotationState, started_at, finished_at, error: Option<String> }`
  - `enum RotationState { Pending, IssuingNewKey, UpdatingUsages, RevokingOldKey, Completed, Failed, RolledBack }`
  - SQLite migration 0004 추가: `rotation_job` 테이블 + index `(credential_id, started_at DESC)`
- **Files Touched**: `crates/api-vault-core/src/models/rotation.rs`, `crates/api-vault-storage/migrations/0004_rotation_job.sql`, `crates/api-vault-storage/src/sqlite/repositories/rotation.rs`
- **Tests**: Rust — repo CRUD, 상태 전이 invariant (terminal state 진입 후 변경 불가)

### T120. Phase R1 — AWS IAM Full rotation 구현

- **Milestone**: M14
- **Priority**: Must
- **Depends on**: T119, T059
- **Goal**: AWS IAM access key 무중단 자동 회전.
- **DoD**:
  - `crates/api-vault-connectors/src/aws/mod.rs` — `AwsIamConnector` 구현 (`Connector` trait + `RotationCap::Full`)
  - `rotate(credential)` 메서드: CreateAccessKey → 사용처 업데이트 (`UsageRepo` 의 모든 row) → 30초 헬스체크 → DeleteAccessKey
  - 실패 시 RolledBack: 새 키 즉시 폐기
  - 릴레이 경유 OAuth credential 사용 (T119 와 별도 OAuth 보관 모델)
- **Files Touched**: `crates/api-vault-connectors/src/aws/mod.rs`, `crates/api-vault-connectors/src/aws/iam.rs`
- **Tests**: Rust — `aws-sdk-mock` 또는 wiremock 기반 5 시나리오 (성공 / 헬스체크 실패 / 권한 부족 / 롤백 / 동시 rotation 거부)

### T121. Phase R2 — Stripe / GCP / Azure rotation

- **Milestone**: M14
- **Priority**: Must
- **Depends on**: T120
- **Goal**: 두 번째 batch 의 Full rotation 가능 provider.
- **DoD**:
  - Stripe restricted key rolling (rolling key API): `crates/api-vault-connectors/src/stripe/`
  - GCP Service Account Key: `crates/api-vault-connectors/src/gcp/`
  - Azure Key Vault rotation: `crates/api-vault-connectors/src/azure/`
- **Files Touched**: `crates/api-vault-connectors/src/{stripe,gcp,azure}/`
- **Tests**: Rust — 각 provider 별 wiremock fixture

### T122. Phase R3 — Manual + provider intelligence

- **Milestone**: M14
- **Priority**: Must
- **Depends on**: T120
- **Goal**: 자동 rotation 미지원 provider (OpenAI, Anthropic, Slack 등) 에 대한 webhook + 가이드.
- **DoD**:
  - 릴레이가 provider 의 deprecation 알림 webhook 수신 → 사용자에게 push notification
  - Credential Detail 화면에 step-by-step rotation 가이드 (provider 별 markdown)
  - "Mark as rotated" 버튼 — 사용자가 수동 회전 후 새 키를 등록하면 옛 키 자동 revoke
- **Files Touched**: `src/features/rotation/ManualRotationGuide.tsx`, `crates/api-vault-app/src/commands/rotation.rs`
- **Tests**: Vitest — 가이드 렌더, "Mark as rotated" 플로우

### T123. Phase R4 — Rotation 스케줄러 + Health monitoring

- **Milestone**: M14
- **Priority**: Must
- **Depends on**: T120, T071
- **Goal**: 사용자 정책 기반 자동 트리거 + rotation 실패 alert + 30일 grace period.
- **DoD**:
  - Settings 화면: "Rotate every {N} days" (default 90)
  - rotation_job 상태가 Failed 면 Incident Feed 에 자동 항목 추가 + push notification
  - 옛 키 30일 grace period (DeleteAccessKey 즉시가 아니라 30일 후) — credentials 테이블 `pending_revoke_at` 컬럼 추가
  - 사용자가 grace period 동안 "Rollback" 버튼으로 즉시 복구 가능
- **Files Touched**: `crates/api-vault-app/src/services/rotation_scheduler.rs`, `src/features/settings/RotationPolicySection.tsx`
- **Tests**: Rust — fake clock 기반 스케줄 트리거 / Vitest — 정책 UI

### T124. Rotation UI (`/rotations`)

- **Milestone**: M14
- **Priority**: Must
- **Depends on**: T119, T009
- **Goal**: 진행 중 / 과거 rotation 작업 타임라인.
- **DoD**:
  - `src/features/rotation/RotationsPage.tsx` — RotationJob 리스트 + 상태별 색상 + 수동 트리거 버튼 ("Rotate now")
  - Credential Detail 에 RotationsForCredential 서브 섹션 (최근 5개)
- **Files Touched**: `src/features/rotation/RotationsPage.tsx`, `src/features/rotation/RotationsForCredential.tsx`, `src/pages/RotationsPage.tsx`
- **Tests**: Vitest — 리스트 렌더, "Rotate now" 클릭 invoke

### T125. Pro 엔타이틀먼트 게이트 + Free 사용자 안내

- **Milestone**: M14
- **Priority**: Must
- **Depends on**: T120, T064
- **Goal**: Pro 가입 사용자만 자동 rotation 사용 가능.
- **DoD**:
  - T120 ~ T123 의 모든 자동 rotation 진입점에 `entitlement::require_pro` 가드
  - Free 사용자에게는 RotationsPage 가 잠금 상태 표시 + "Upgrade to Pro" CTA
  - 수동 rotation (T122) 은 Free 도 가능 (가이드만 제공)
- **Files Touched**: `crates/api-vault-app/src/commands/rotation.rs`, `src/features/rotation/RotationsPage.tsx`
- **Tests**: Rust — Free/Pro 분기 / Vitest — 잠금 UI

---

## Open Issues (사용자 확인 필요)

이들은 docs/project-decisions.md 값과 충돌하거나 사용자 결정이 필요한 사항. planner 가 임의 결정 금지.

1. **Free tier 디바이스 수 (T094 관련)**
   - project-decisions.md 는 "무료 = 단일 기기 (동기화 없음)"
   - 대안 A (현재 decisions 준수): Free = 1대, 2대부터 Pro. 매우 엄격.
   - 대안 B (planner 제안): Free = 2대(랩탑+폰), 3대부터 Pro. 진입장벽 ↓, Pro 전환 명확.
   - 사용자 결정 요청.

2. **도메인 확보 (`apivault.app`)**
   - 대안: `api-vault.dev`, `keyvault.dev`, `apivault.io`
   - 등록 비용 ~$10~30/년

3. **Apple Developer Program ($99/yr) + Play Console ($25 일회)**
   - 모바일 출시 필수. 언제 결제할지 (M11 시작 전)

4. **Cloudflare Workers Paid plan ($5/월)**
   - M9 이전까지 Free 로 충분, M9 실제 사용자 테스트부터 Paid 전환

5. **SignPath.io / Azure Trusted Signing (Windows Authenticode)**
   - 비용 ~$15~50/월. 초기에는 self-signed warning 감수 → 출시 직전 활성화

6. **법률 리뷰 (Privacy Policy / ToS)**
   - 템플릿 기반 작성 후 변호사 검토 권장. B2C 앱 기준 $500~1500.

7. **GitHub Organization 이름 (OSS + EE repo 분리)**
   - 제안: `apivault` (github.com/apivault/core, /apivault/relay, /apivault/marketing)

---

## 의존성 그래프 요약

```
M0 (Foundation)
  ├─► M1 (Local Vault Core)
  │      └─► M2 (Inventory UI)
  │             ├─► M3 (Graph) — uses core graph model from M1
  │             └─► M5 (GitHub + RAILGUARD) — builds on inventory + connectors
  │      └─► M4 (Incident Feed) — parallel with M2/M3
  │      └─► M6 (Audit Log) — depends on M1/M2 mutating commands
  │             └─► M7 (Kill Switch) — uses audit log
  │
  └─► M8 (Auth) — independent, can parallel with M1~M7
         └─► M9 (Sync) — requires M8 + M1 data model
                ├─► M10 (Payments) — requires M8 session + M9 entitlement gate
                ├─► M11 (Mobile) — requires full desktop stack + M8 auth + M9 sync
                └─► M12 (Web Viewer) — requires M8 + M9

M13 (Release) — depends on all prior milestones
```

**병렬 실행 가능 구간:**

- M2 & M4 (Inventory UI + Incident Feed) — T049~T054 는 T025~T028 과 독립
- M6 & M7 (Audit + Kill Switch) — 같은 시점에 진행 가능
- M8 스캐폴드 (T079~T082) 는 M1~M7 과 완전 병렬

---

## M15 — CI/CD Integration

api-vault 의 두 갈래 통합:

- **Product** (사용자 시크릿 → CI 환경변수): T126~T131
- **Internal** (api-vault 자체 deploy/test): T132~T133

### T126. GitHub Actions Secrets API 클라이언트 (read/write/list)

- **Milestone**: M15
- **Priority**: Must
- **Depends on**: T062
- **Goal**: GitHub REST API v3 를 통해 저장소의 Actions Secrets 를 조회·생성·갱신·삭제한다.
- **DoD**:
  - `crates/api-vault-connectors/src/github/actions_secrets.rs`
  - `list_secrets(owner, repo, token) -> Vec<SecretMeta>` (이름·updated_at 만, 값은 API 가 반환 안 함)
  - `upsert_secret(owner, repo, token, name, value)` — Sodium sealed box 암호화 (GitHub public key 로)
  - `delete_secret(owner, repo, token, name)`
  - `libsodium-sys` 또는 `crypto_box` crate 사용 (`sealed_box` 구현)
  - HTTP 클라이언트: `reqwest` (기존 패턴)
- **Files Touched**: `crates/api-vault-connectors/src/github/actions_secrets.rs`, `Cargo.toml`
- **Tests**: Rust — `mockito` 로 GitHub API mock, upsert → sealed box 검증

### T127. Secrets sync 커맨드 (인벤토리 credential ↔ Actions Secret)

- **Milestone**: M15
- **Priority**: Must
- **Depends on**: T126, T022
- **Goal**: 인벤토리의 credential 을 선택한 저장소의 GitHub Actions Secret 에 푸시(sync)한다.
- **DoD**:
  - Tauri 커맨드 `sync_to_actions(credential_id, owner, repo, secret_name) -> Result<(), Error>`
  - credential reveal → Actions Secrets upsert 원자적 처리
  - 감사 로그 기록 (`AuditEvent::SyncToActions { credential_id, repo, timestamp }`)
  - 에러 시 사용자 친화적 메시지 (403 → "GitHub token 권한 부족", 404 → "저장소 없음")
- **Files Touched**: `crates/api-vault-app/src/commands/ci_sync.rs`, `crates/api-vault-app/src/commands/mod.rs`
- **Tests**: Rust — mock GitHub API, audit log 기록 확인

### T128. GitHub Actions Secrets UI (Settings > GitHub > "Sync to Actions")

- **Milestone**: M15
- **Priority**: Must
- **Depends on**: T127
- **Goal**: 크레덴셜 상세 화면에서 "Sync to Actions" 버튼으로 원클릭 동기화.
- **DoD**:
  - `src/features/ci/SyncToActionsButton.tsx` — 저장소 선택 Popover + 시크릿 이름 입력 + 확인
  - 동기화 상태 (idle / pending / success / error) badge 표시
  - Settings > Integrations > GitHub Actions 탭에서 연결된 저장소 목록 + 마지막 sync 시각
  - 에러 toast
- **Files Touched**: `src/features/ci/SyncToActionsButton.tsx`, `src/features/settings/IntegrationsPage.tsx`
- **Tests**: Vitest — 버튼 클릭 → invoke mock, 상태 전환

### T129. Vercel API 통합 (placeholder)

- **Milestone**: M15
- **Priority**: Should
- **Depends on**: T127
- **Goal**: Vercel 프로젝트 환경변수에 credential 을 동기화하는 기반 구조를 정의한다.
- **DoD**:
  - `crates/api-vault-connectors/src/vercel/mod.rs` — `VercelClient` struct skeleton
  - `list_env_vars`, `upsert_env_var`, `delete_env_var` trait 정의 (미구현, `todo!()`)
  - 문서: `docs/integrations/vercel.md` — API 토큰 발급 방법, 권한 범위
- **Files Touched**: `crates/api-vault-connectors/src/vercel/mod.rs`, `docs/integrations/vercel.md`
- **Tests**: 없음 (placeholder — 구현 시 추가)

### T130. GitLab CI / CircleCI 통합 (placeholder)

- **Milestone**: M15
- **Priority**: Should
- **Depends on**: T127
- **Goal**: GitLab CI Variables 와 CircleCI Context Secrets 를 위한 클라이언트 skeleton 정의.
- **DoD**:
  - `crates/api-vault-connectors/src/gitlab/mod.rs` — skeleton
  - `crates/api-vault-connectors/src/circleci/mod.rs` — skeleton
  - 각각 `list_variables / upsert_variable / delete_variable` trait stub
- **Files Touched**: `crates/api-vault-connectors/src/gitlab/mod.rs`, `crates/api-vault-connectors/src/circleci/mod.rs`
- **Tests**: 없음 (placeholder)

### T131. Pre-commit hook generator (RAILGUARD 연계)

- **Milestone**: M15
- **Priority**: Should
- **Depends on**: T068
- **Goal**: RAILGUARD 패널에서 `.pre-commit-config.yaml` (gitleaks / trufflehog) 자동 생성.
- **DoD**:
  - Tauri 커맨드 `generate_precommit_config(project_path) -> Result<String, Error>`
  - gitleaks + trufflehog hooks 포함 YAML 생성
  - 기존 `.pre-commit-config.yaml` 있으면 merge (중복 hook 방지)
  - RAILGUARD UI 에 "Pre-commit hooks" 섹션 추가 (복사/저장 버튼)
- **Files Touched**: `crates/api-vault-app/src/commands/railguard.rs`, `src/features/railguard/PreCommitSection.tsx`
- **Tests**: Rust — 생성된 YAML 파싱 검증 (serde_yaml)

### T132. deploy-relay.yml — wrangler deploy 자동화

- **Milestone**: M15
- **Priority**: Must
- **Depends on**: -
- **Goal**: `ee/api-vault-relay/` 변경이 main 에 push 될 때 Cloudflare Workers 자동 배포.
- **DoD**:
  - `.github/workflows/deploy-relay.yml` 신규 생성
  - `paths` 필터: `ee/api-vault-relay/**` + 워크플로우 파일 자체
  - `test` job (pnpm typecheck + vitest) → `deploy` job (wrangler-action@v3, `CLOUDFLARE_API_TOKEN` secret)
  - `concurrency: cancel-in-progress: false` (배포 중단 방지)
  - `workflow_dispatch` 수동 트리거 지원
  - Runbook: `docs/runbooks/cloudflare-api-token.md`
- **Files Touched**: `.github/workflows/deploy-relay.yml`, `docs/runbooks/cloudflare-api-token.md`
- **Tests**: workflow_dispatch 수동 실행으로 검증

### T133. ci.yml 보강 — ee-relay job 추가

- **Milestone**: M15
- **Priority**: Must
- **Depends on**: -
- **Goal**: 기존 CI 파이프라인에 `ee/api-vault-relay/` typecheck + test step 추가.
- **DoD**:
  - `.github/workflows/ci.yml` 에 `ee-relay` job 추가
  - `pnpm typecheck` + `pnpm test` (vitest run)
  - `pnpm-lock.yaml` 경로: `ee/api-vault-relay/pnpm-lock.yaml`
  - 기존 `rust` + `frontend` job 회귀 없음
- **Files Touched**: `.github/workflows/ci.yml`
- **Tests**: PR 생성 → Actions 통과 확인

---

## 태스크 통계

| 우선순위                          | 개수    | 비율     |
| :-------------------------------- | :------ | :------- |
| Must                              | 89      | 71.2%    |
| Should                            | 21      | 16.8%    |
| Could (Phase 2, 이 문서에 미포함) | 15      | 12.0%    |
| **Total**                         | **125** | **100%** |

| 마일스톤  | 태스크 수 |
| :-------- | :-------- |
| M0        | 12        |
| M1        | 12        |
| M2        | 16        |
| M3        | 8         |
| M4        | 10        |
| M5        | 10        |
| M6        | 6         |
| M7        | 4         |
| M8        | 8         |
| M9        | 10        |
| M10       | 7         |
| M11       | 6         |
| M12       | 4         |
| M13       | 5         |
| M14       | 7         |
| **Total** | **125**   |

---

_문서 끝._
