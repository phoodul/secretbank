# Workflow Progress

## Last Checkpoint

- **Time:** 2026-05-07 — **M24 Phase 2-4-a ✅ — Cmd+K Quick Add 다이얼로그 + 클립보드 prefill**
- **Phase:** Phase 3 — Implementation. **Phase 2-3-a ✅ + Phase 2-4-a ✅**. 다음 → **Phase 2-4-d (CLI quick-add)** 또는 **dogfooding** (사용자 결정).
- **Phase 2-4-a 결과** (`dfb9a57`): `action.quick-add` Cmd+K 액션 + `QuickAddDialog.tsx` 5필드 경량 폼 + 클립보드 prefill (`readText()` 1회) + URL→issuer 자동 감지 + "전체 옵션 보기" → CreateCredentialDialog 전환 + i18n 22키 × 4 로케일 + Vitest 7 PASS (535 → 542).
- **누적 검증 (Phase 2-4-a 종료 시점)**: `pnpm typecheck` ✅ / `pnpm vitest run` **542 (+7 from 535 baseline)** / `pnpm lint` 신규 0 / `pnpm format:check` ✅ / cargo 미수정.
- **다음 진입 전 큐**:
  1. **Phase 2-4-d (CLI quick-add)** — `apivault add --url ... --user ... --pw ...` + `APIVAULT_PASSPHRASE` 환경변수.
  2. **Dogfooding** — 본인 크롬 비번 export → CSV import → Quick Add 실사용 검증.
  3. **Phase 2-3-b (Bitwarden JSON import)** — 후순위.
- **풀체인 commit 매핑**:
  - 2-3-a-1 (`15d2cc1` + `58df540`) — Chrome/Edge/Brave CSV 파서 (9 단위 테스트, csv crate workspace dep)
  - 2-3-a-2 (`e7449a8` + `662dd3e`) — CSV row → `DetectedFromCsv` 변환 + URL host → issuer 도메인 매칭 (10 테스트, url crate)
  - 2-3-a-3 (`eea3657` + `3daaa65`) — Tauri `import_csv_prepare` + ImportSessionStore 5분 TTL + preview DTO (평문 IPC 미통과)
  - 2-3-a-4 (`3de251f` + `dd6ed7a`) — Tauri `import_csv_commit` + per-row 결과 + take-once session
  - **CI fix** (`9a2821d`) — prettier 포맷 정정 + Phase 2-3 결정 기록 + Researcher 보고서
  - 2-3-a-5 (`b2048e4` + `84536a7`) — DropZone `.csv` 분기 + `CSVImportDialog` 신규 (Bento 카드 preview + 5분 TTL 카운트다운 + alreadyExists 자동 해제 + 원본 CSV 삭제 버튼) + i18n 17키 × 4 로케일 + Vitest 7 PASS
- **누적 검증 (Phase 2-3-a 종료 시점)**: `pnpm typecheck` ✅ / `pnpm vitest run` **535 (+7 from 528 baseline)** / `pnpm lint` 신규 0 / `pnpm format:check` ✅ / cargo test 0 failed / clippy 0 warning.
- **차별화 포인트 검증됨**: 
  - **preview UI** — 1P/Bitwarden/Apple 모두 preview 없이 즉시 import (Researcher 확인). 우리는 Bento 카드 미리보기 + alreadyExists 충돌 표시 + matched issuer badge.
  - **원본 CSV 직접 삭제 버튼** — `@tauri-apps/plugin-fs::remove` + 확인 다이얼로그. "텍스트 권고만" 인 경쟁사와 차별화.
- **사용자 비전 갱신 (2026-05-07)**: Import 1순위를 Google CSV (Chrome/Edge/Brave) 로 승격. 1pux/Bitwarden 은 후순위. + Phase 2-4 신설 = 마찰 없는 등록 UX (Cmd+K Quick Add + CLI quick-add). HIBP Password check (2-2B) 는 M24 v2 로 미룸.
- **Researcher 결과 (`docs/research_phase2_3a_google_csv.md`)**: Chrome/Brave 5컬럼 (note feature flag 누락 가능) / Edge 3컬럼 / UTF-8 BOM 방어 / RFC 4180 escape / `secrecy::SecretBox` 즉시 래핑 / 차별화 정합성 검증.
- **신규 파일 (frontend)**: `src/features/onboarding/CSVImportDialog.tsx` (~380줄), `src/features/onboarding/__tests__/CSVImportDialog.test.tsx` (~195줄)
- **신규 파일 (backend)**: `src-tauri/crates/api-vault-connectors/src/import/{mod,csv_google,to_detected}.rs`, `src-tauri/crates/api-vault-app/src/import/mod.rs` (ImportSessionStore), `src-tauri/crates/api-vault-app/src/commands/import.rs`
- **신규 의존성**: `csv = "1"` + `url = "2.5"` (workspace), `@tauri-apps/plugin-fs = 2.5.1` (frontend npm), `fs:allow-remove` capability.
- **다음 진입 전 큐 (사용자 결정 필요)**:
  1. **Phase 2-4-a (Cmd+K Quick Add 강화)** — `actions.ts` 에 `action.quick-add` 추가 + 클립보드 자동 채움 + URL auto-detect 재사용. 작은 작업 (1~2 commits).
  2. **Phase 2-4-d (CLI quick-add)** — `apivault add --url ... --user ... --pw ...` + `APIVAULT_PASSPHRASE` 환경변수. 작음 (1 commit).
  3. **Dogfooding** — 본인 Chrome 비번 export → CSV import 실사용 검증. UX 이슈 발견 후 fix.
  4. **Phase 2-3-b (Bitwarden JSON import)** — 후순위, 우선순위 낮음.

### 이전 — Phase 2-2A + 2-2C 완료 (2026-05-06)

### 이전 — Phase 2-2A + 2-2C 완료 (2026-05-06)

- **Time:** 2026-05-06 (낮 — **Phase 2-2A + 2-2C-a 완료**)
- **Phase:** Phase 3 — Implementation. M24 Phase 2-1 ✅, 2-2A 5 sub-task ALL ✅, 2-2C-a ✅. 다음은 2-2C-b (KISA/ENISA/JVN URL 검증 후 추가) 또는 2-2B (HIBP password check).
- **2-2C-a 결과**: `2b42bcb` + `ae89b6f` — CISA (`https://www.cisa.gov/cybersecurity-advisories/all.xml`) + NCSC UK (`https://www.ncsc.gov.uk/api/1/services/v1/all-rss-feed.xml`) RSS 프리셋 추가. default_presets() 10 → 12. 5 신규 테스트.
- **2-2C-b 결과**: `6eea2a1` + `cb35f39` — KISA 5 RSS (보안공지 / 보고서·가이드 / 공지사항 / 취약점 / 경보단계) 추가. default_presets() 12 → 17. 사용자가 직접 검증한 URL. 7 신규 테스트.
- **2-2C-b 노이즈 메모**: kisa-report / kisa-notice 는 advisory 가 아니라 운영 정보 — dogfooding 후 IncidentsPage 노이즈 평가 후 제거 또는 "정보" 카테고리 분리 권고.
- **남은 다국가 RSS** (ENISA / JVN / JPCERT) — URL 검증 필요, 별도 sub-task. 한국 사용자 커버리지는 KISA 로 일단 확보됨.
- **Phase 2-2A 풀체인 완성**: HIBP `/breaches` 폴링 → Incident.domain → matcher Domain 매칭 → IncidentCard UI 까지.
  - 2-2A-3b: `cefbfb3` + `1e3a40c` — Incident.domain + matcher 도메인 매칭 + MatchReason::Domain (마이그레이션 0010, subdomain-safe `evil-supabase.com` 차단 검증)
  - 2-2A-4: `b1953c3` + `0c229bf` — IncidentCard reason 아이콘 (Globe/Tag/Search/Pin) + HIBP description + domain 라인 + 15 로케일 i18n
  - 누적: 9 commits (2-2A-1 / 2 / 3a / 3b / 4 + 각 docs(task))
- **누적 검증**: cargo test 0 failed / clippy 0 warning / typecheck / vitest **528 (+34 from baseline 494)**.
- **다음 (2-2C)**: KISA / 개인정보보호위 / ENISA / CISA RSS 프리셋 추가 — RSS 클라이언트 (T051) 이미 존재, sources.rs 에 프리셋만 추가하면 됨. 작은 작업 (1~2 commits 예상).
- **Phase 2-2A-3a 결과**: `9bac675` + `d96e838`. 마이그레이션 0009 + Issuer.domains: Vec<String> + IssuerRepo JSON 직렬화 + 10 preset 시드 + frontend Issuer 인터페이스 + 8 픽스처 + Yjs mapping.ts 동기화. 19 파일 +174 줄. 검증 27 suites 0 failed / vitest 522 0 failed.
- **2-2A-3b 진입 전 사양 메모**:
  - `MatchReason::Domain` variant 추가 (audit/UI 에서 매칭 근거 명확화)
  - `Incident` 모델에 `domain: Option<String>` 필드 추가 (마이그레이션 0010) — HIBP breach.domain 을 incident 에 보존
  - `normalize_hibp_breach` 에서 incident.domain 채움
  - `matcher.rs` 의 `match_incident` 확장: incident.domain 이 Some 이면 issuer.domains[] / credential.url host 양쪽과 subdomain-safe 매칭
  - subdomain-safe match: `host == domain || host.ends_with(&format!(".{domain}"))` — Phase 2-1 frontend matchIssuerByUrl 와 동일 정책
- **Phase 2-2A-2 결과**: `f1c05bb` feat(feeds): HIBP breach normalize + IncidentFeed 통합 + `72d4983` docs(task) 갱신.
  - `normalize_hibp_breach()` 추가 (severity 계층 매핑: malware/stealer_log → Critical / sensitive → High / spam_list → Low / 기본 Medium)
  - `feed_scheduler` 에 HIBP poller (24h, hibp_breaches_enabled=true default) + `FeedSchedulerError::Hibp` variant + `trigger_once` hibp 분기
  - 회귀 +9 (normalize 7 + scheduler integration 2). cargo test 전체 0 failed.
- **사용자 결정 (옵션 가)**: 2-2A (HIBP Breaches feed) → 2-2C (다국가 RSS) → 2-2B (Password check) → M25 placeholder. project-decisions [2026-05-06] 기록.
- **Phase 2-2A-1 결과**: `84602bb` feat(feeds): HibpClient::list_breaches — 글로벌 breach catalog 조회. 기존 `check_email` 옆에 메서드 추가. 회귀 +5 (T11~T15). cargo test 53 passed.
- **사전 조사 (2-2A-2 위해)**:
  - `IncidentSource::Hibp` enum 값 이미 존재 (`incident.rs:13`) — 추가 변경 불필요
  - `feed_normalize.rs` 에 `normalize_<source>()` 헬퍼 패턴 — `normalize_hibp_breach()` 추가만 하면 됨
  - `feed_scheduler.rs` 에 `run_<source>_poller` + `poll_<source>_once` 패턴 — 그대로 따라가면 됨
  - `FeedSchedulerConfig` 에 새 필드 추가
  - `trigger_once()` 에 hibp 분기 추가
- **사용자 결정 (이번 세션):** Phase 2 sub-task 우선순위 = **권고대로 1 → 2 → 3 → 4 → 5** (URL auto-detect → HIBP → 1Password CSV → Bitwarden JSON → browser autofill).
- **Phase 2-1 결과 (URL auto-detect + Password UI 통합):** 3 commits (1 implementator)
  - `5473437` feat(inventory): issuer URL 도메인 매핑 + matchIssuerByUrl 헬퍼 (M24 2-1a) — 10 preset 모두 domains[] 추가, subdomain-safe 매칭 (`evil-stripe.com` 차단), protocol-less URL 자동 보정
  - `48d067c` feat(inventory): CreateCredentialDialog kind/url/username 필드 + URL auto-detect (M24 2-1b) — kind 토글 (api_key/password) + URL onChange auto-select + issuer lock 추적 + i18n 4 로케일
  - `e638b0d` docs(task): Phase 2-1 커밋 해시 매핑 갱신
- **누적 검증:**
  - `pnpm typecheck` ✅
  - `pnpm vitest run` ✅ **494 → 522 (+28)** — `match-issuer-by-url.test.ts` 24 신규 + `CreateCredentialDialog.test.tsx` +4 (URL auto-detect / issuer lock / kind 토글 ×2)
  - `pnpm lint` ✅ (pre-existing 경고 18 개만, 신규 0)
  - `cargo test` 변경 없음 (백엔드 미수정)
- **사전 조사로 단축**: 백엔드 `CredentialInput` 에 `kind`/`url`/`username` 필드 이미 존재 (M24 Phase 1) — UI 입력 + issuer-presets domains 추가만 필요.
- **소소한 정정 (implementator 보고)**: zod `.default()` 가 `useForm` resolver 와 타입 충돌 → `defaultValues` 로 옮김. Radix Select 옵션 다중 DOM 매칭 → `findByRole("option", ...)` 로 변경.

### 다음 단계 — Phase 2-2 (HIBP breach alert) 진입 전 사용자 확인 큐

implementator 가 제기한 두 가지 정책 결정:

1. **HIBP 체크 트리거**: 수동(버튼) only vs 저장 시 자동도 포함 — 자동이면 저장 UX 에 약간의 딜레이 체감 가능
2. **결과 저장 위치**: `CredentialSummary` 에 `hibp_count: Option<u32>` 컬럼 추가 (재시작 후에도 유지) vs 세션 메모리만

후순위:
- 사용자 액션 #4-7 / dogfooding / GitHub Cowork 4 액션 (Phase 2 와 병행 가능)

---

## Previous Checkpoint (2026-05-06 Night mode)

- **Time:** 2026-05-06 (Night mode) — **M24 Phase 1.5 완전 완료 + 16 commits push (origin/main)**
- **Phase:** Phase 3 — Implementation. **M24 v1 Phase 1 + Phase 1.5 모두 ✅**. 다음은 Phase 2 (URL auto-detect / HIBP / 1Password import) 또는 사용자 결정 큐.
- **이번 세션 결과:**
  - **이전 세션 11 commits push** — `5a957c0..efce9d1` origin/main 으로 (admin bypass)
  - **Phase 1.5-C** (`d39fc5c`) — issuer pair labels (migration 0008 + DTO + IssuerRepo CRUD + preset 시드 4종)
  - **Phase 1.5-D** (`e96a22f`) — frontend types sync (`CredentialSummary` / `CredentialFull` / `Issuer` 인터페이스)
  - **Phase 1.5-E** (`a6ae705`) — BentoCard pair row + clipboard `slot` 옵션 + i18n 4 로케일
  - **Phase 1.5-F** (`9b57ff4`) — CreateCredentialDialog pair 토글 + issuer 라벨 자동 채움
  - **Phase 1.5-G** (`2e2226b`) — BentoCard hover MiniGraph (순수 SVG, project fan-out)
- **누적 검증 (Phase 1.5 종료):**
  - `pnpm typecheck` ✅
  - `pnpm vitest run` 전체 ✅ **494/494 passed**
  - `cargo test --workspace --lib --tests` ✅ **27 crates 모두 ok, 0 failed**
- **5 sub-tasks 모두 1 implementator = 1 commit 룰 준수.** 1.5-G 만 SendMessage 도구 부재로 새 implementator 가 마무리.
- **stash@{0}** (이전 세션 1.5-C WIP) — 새 commit 검증 통과 후 drop 완료.
- **memory 룰 보정** — `feedback_powershell.md` 두 갈래 (사용자 안내 PowerShell vs Bash 도구 내부 POSIX) 로 분리.

### 다음 세션 시작점 — **M24 Phase 2 (확정, 2026-05-06)**

사용자가 세션 종료 시 명시적으로 결정. Phase 2 = "Unified Bento Inventory" 의 차별화 마무리.

**Phase 2 sub-task 후보 (다음 세션 첫 implementator 호출 전 사용자와 정렬 필요):**

1. **URL auto-detect** — Create dialog 의 URL 입력에서 issuer 자동 추측 (e.g. `https://supabase.com/...` → Supabase issuer 자동 선택). issuer slug ↔ domain 매핑 테이블 + URL 파싱.
2. **HIBP breach alert** — `password` kind 전용 자동 검사 (이미 `kill_switch` UI 자리에 placeholder 있음). T052 의 HibpClient 재사용. password 등록/저장 시 검사 + Inventory 카드에 경고 뱃지.
3. **1Password CSV import** — 1Password 8 export `.1pux` 또는 csv 파싱 → BentoCard 등록. 마이그레이션 마법사 1단계.
4. **Bitwarden JSON import** — Bitwarden export json 파싱.
5. **browser autofill (longer-term)** — Phase 3 후보, 우선순위 낮음.

**다음 세션 첫 액션 — sub-task 우선순위 정하기**: 1 ~ 4 를 한꺼번에 안 가고, 사용자가 "1 부터 진행" 또는 "2 가 더 시급" 같이 결정한 뒤 1 implementator = 1~2 commit 룰로 진행.

### 큐에 보류 중인 결정 (다음 세션에서 다룰 수 있음)

- **사용자 액션 #4-7** (Apple cert / Windows cert / 데모 영상 / HN+PH) — Phase 2 와 병행 가능
- **본인 dogfooding** — Windows/macOS 에 v0.1.0-pre10 직접 설치
- **GitHub Cowork 활성화 4 액션** (CLAUDE_CODE_OAUTH_TOKEN / ANTHROPIC_API_KEY / Branch protection / 라벨 2개)

---

## Previous checkpoint (2026-05-05 — M24 Phase 1 완료 + Phase 1.5 절반)

- **Time:** 2026-05-05 — **M24 Phase 1 완료 + Phase 1.5 (Option D pair 모델) 절반 진행 후 정리 종료**
- **Phase:** Phase 3 — Implementation. M24 v1 진행 중.
- **세션 결과:**
  - **Cargo.lock untrack** (`0fbeb27`) — `.gitignore` 등록되어 있었으나 추적 중이던 잔재 정리
  - **M24 Phase 1 (C-1 ~ C-4)** — types sync + BentoCard + BentoGrid + ⋮ 메뉴 type별 분기 + ID 마스킹 정정 + "API Key:" 라벨
  - **M24 Phase 1.5-A** (`938d968`) — migration 0007 (`secondary_value_ref` + `primary_label` + `secondary_label`) + Rust DTO 확장
  - **M24 Phase 1.5-B** (`63334c4`) — pair credential repo/command + `credential_reveal` 의 `slot` 옵션 파라미터
  - **결정 기록** (`93fd796`) — docs/project-decisions.md 의 [2026-05-05] M24 Phase 1.5 항목 (Option D + hover mini-graph)
- **commits 누적 (이번 세션):**
  - `0fbeb27` chore: untrack Cargo.lock per .gitignore
  - `966ea42` feat(inventory): credential kind/url/username 타입 sync (M24 C-1)
  - `44b37f2` feat(inventory): BentoCard 컴포넌트 + 30s reveal/copy (M24 C-2)
  - `d54121c` fix(inventory): BentoCard 디자인 정정 — ID 마스킹 + URL/ID/PW 라벨 (M24 C-2 정정)
  - `cb395a1` feat(inventory): BentoGrid 컴포넌트 — responsive auto-fill + empty/skeleton (M24 C-3)
  - `2bfc180` fix(inventory): BentoCard ⋮ 메뉴 type별 분기 + API Key 라벨 (M24 C-4)
  - `f81cde8` docs(task): M24 C-4 커밋 해시 갱신
  - `938d968` feat(storage): credential value pair 모델 — migration 0007 + DTO 확장 (M24 1.5-A)
  - `63334c4` feat(backend): pair credential repo/command + reveal slot 파라미터 (M24 1.5-B)
  - `93fd796` docs(decisions): M24 Phase 1.5 — Option D + hover mini-graph 결정 기록
- **push 안 됨** — 10 commits ahead of origin/main. 다음 세션이 검증 후 push 결정.
- **WIP stash 보관** — `git stash list` 의 `stash@{0}`:
  - 제목: `WIP: M24 1.5-C in progress — issuer preset default 라벨 (migration 0008 + issuer 모델/repo/test 변경, 미완성, 새 세션에서 재검토)`
  - 내용: Sub-task 1.5-C (issuer preset 의 default_primary_label / default_secondary_label) 진행 중 미완성 상태
    - 새 파일: `src-tauri/crates/api-vault-storage/migrations/0008_issuer_pair_labels.sql` (untracked)
    - 수정: `models/issuer.rs`, `repositories/issuer.rs`, `repositories/incident.rs`, `commands/credentials.rs`, `commands/kill_switch.rs`, `services/feed_normalize.rs`, `core/blast_radius.rs`, `core/graph.rs`, `feeds/matcher.rs` + 테스트 4개
  - **새 세션 결정 사항:** stash pop 후 검증 (typecheck/clippy/test 통과 여부) → 통과면 commit, 실패면 stash drop 후 1.5-C 재시작

### 다음 세션 시작점 — M24 Phase 1.5 이어서

남은 sub-tasks (예상 4-5h):

1. **1.5-C** (이어서) — issuer preset default 라벨 — stash pop 후 검증, 또는 처음부터 재구현
   - Supabase: `("Public Key", "Secret Key")`
   - AWS IAM: `("Access Key", "Secret Key")`
   - GitHub OAuth App: `("Client ID", "Client Secret")`
   - 기본: `("API Key", null)`
2. **1.5-D** — Frontend types.ts sync (primary_label / secondary_label / has_secondary)
3. **1.5-E** — BentoCard pair UI (두 번째 row 렌더 + 30s 타이머 독립 + slot="secondary" reveal)
4. **1.5-F** — CreateCredentialDialog 라벨 자동 + secondary 토글
5. **1.5-G** — BentoCard hover expand → mini dependency graph (순수 SVG 권장)

### 세션 조기 종료 사유

- implementator 한 번에 7 sub-tasks 위임이 무리였음. token 한계로 79 tool_uses 도달 후 멈춤
- SendMessage 로 이어서 한 번 더 진행했으나 사용자가 진행 속도에 답답함을 표현 → 세션 종료 + 새 세션 재시작 결정
- **재발 방지 룰:** Phase 단위가 아닌 **sub-task 1~2 개 단위로 implementator 위임**. 1 implementator 호출 = 1~2 commit 목표

---

## Previous checkpoint (2026-05-03 밤 — Dependabot 처리 풀 완주)

- **Time:** 2026-05-03 (밤) — **F1+F2+F3 Dependabot 처리 풀 완주 — 14 alert 중 11 close (78.6%)**
- **최종 상태:** HIGH 4→**0** (100% 해소) / MEDIUM 7→2 / LOW 3→1 → **총 5 commit, 5 push**
- **commit 시리즈 (오늘 저녁):**
  - `35fac1b` F1 — drizzle-orm 0.36.4 → 0.45.2 (HIGH #1/#15 SQL 인젝션)
  - `54a11fa` F2-1 — vitest-pool-workers 0.5 → 0.8.71 (HIGH #5/#3 wrangler+devalue transitive)
  - `8da1aef` F2-2 — pnpm overrides wrangler ^4.59.1 (HIGH #19 새 advisory)
  - `28dd8bf` F3 — vitest 2→3 + overrides vite ^6.4.2 + esbuild ^0.25.0 (MEDIUM #14/#2)
  - `37793c1` docs(progress) F1 정리
- **잔여 3건 (모두 src-tauri Cargo, runtime 영향 없음):**
  - #16 sharks (medium, fix=none): M23 Vault Charter Shamir 의 random_polynomial 계수 편향. 공격 조건은 같은 secret 500~1500회 share. **1-share 모델이라 영향 0.** 권장 마이그레이션: blahaj fork (별도 작업)
  - #17 glib (medium, fix 0.20.0): webkit2gtk/wry transitive (Linux only). **Tauri 2.11+ minor upgrade 필요** (별도 작업)
  - #18 rand 0.7.3 (low, fix 0.8.6): phf_generator → kuchikiki → tauri-utils 2.8.3 transitive. **build-dependencies only — 런타임 영향 0.** Tauri minor upgrade 시 자동 해소
- **이전 turn (D. Demo capture, commit `e7a3446`):** 3 scene 모두 통과, media/ 에 lock-screen.webm (1442 KB) / charter-issuance.webm (1338 KB) / recovery-flow.webm (752 KB)
- **이전 turn (chore hooks, commit `c771383`):** Windows jq stdin 호환성 정리

---

## Previous checkpoint (2026-05-03 저녁 — F1 drizzle-orm)
- **이번 turn:**
  - GitHub Dependabot 14 alert 전체 분류 (gh api): HIGH 4 / MEDIUM 7 / LOW 3
  - drizzle-orm 0.36.4 → 0.45.2 + drizzle-kit 0.28.1 → 0.31.10 업그레이드 (commit `35fac1b`)
  - 영향: HIGH #1/#15 (SQL injection) 직접 close. typecheck + 71 tests 통과
  - vitest-pool-workers 0.5 → 0.15 시도 했으나 vitest 4 + cloudflare types 동기화 필요 — 별도 마이그레이션 commit 으로 분리
- **Dependabot 잔여 정리 (다음 작업):**
  - HIGH #5 (wrangler dev-only transitive 3.100), #3 (devalue dev-only transitive) — `@cloudflare/vitest-pool-workers` 0.15 + vitest 4 마이그레이션 필요. dev tooling 만이라 runtime 영향 0
  - MEDIUM 7 / LOW 3 — 대부분 위 마이그레이션으로 자동 해소 예상
  - **MEDIUM #16 sharks (fix=none)**: M23 Vault Charter Shamir 의 random_polynomial 계수 편향 — 공격 조건은 같은 secret 500~1500회 share. 우리 모델은 charter 1회 발급=1회 share → 영향 없음. 권장: blahaj fork 로 추후 마이그레이션
- **이전 turn (D. Demo capture, commit `e7a3446`):** 3 scene 모두 통과, media/ 에 lock-screen.webm (1442 KB) / charter-issuance.webm (1338 KB) / recovery-flow.webm (752 KB)
- **이전 turn (chore hooks, commit `c771383`):** Windows jq stdin 호환성 정리
- **이전 turn 변경 (e2e/demo.spec.ts 만):**
  - Scene 1 (lock-screen) — `getByRole("dialog")` → `#unlock-passphrase` (LockScreen 은 `motion.section + aria-labelledby` 으로 ARIA `region`, dialog 아님)
  - Scene 2 (charter-issuance) — 두 버그 수정:
    1. mock `vault_status` 의 `state: "needs_init"` → `"uninitialized"` (Rust serde 직렬화는 후자 — 잘못된 값이라 어떤 화면도 안 떴음)
    2. CreateVaultDialog 자동 안 열리므로 LockScreen 의 "Create a new vault" 링크 click 추가 (regex `/create a new vault|새 볼트 만들기/i`). submit 버튼은 dialog scope 로 좁혀 LockScreen 링크와 충돌 방지
  - Scene 3 (recovery-flow) — 첫 번째 dialog 대기 라인을 region(input) 으로, forgot-link 도 명시적 visibility 대기 (vault_has_charter 비동기 후 렌더). RecoveryDialog 마운트 후 진짜 dialog visibility 추가 검증
- **검증:** `pnpm capture:demo` 풀 통과, 산출물 `media/lock-screen.webm` (1442 KB) / `charter-issuance.webm` (1338 KB) / `recovery-flow.webm` (752 KB) — ffmpeg 변환만 남음 (사용자 액션 #6)
- **이전 세션 종료 직전 변경 (autoevolvingapp 도구가 4 commits 추가):**
  - `a033da3` feat: GitHub Cowork 통합 (Claude AI PR 리뷰 + desktop 도메인 게이트)
  - `112c916` fix: Cowork 워크플로우 인증을 OAuth 토큰으로 전환
  - `7d94f98` feat: @claude 멘션 트리거 워크플로우 추가
  - `71e8a4e` fix: Cowork 워크플로우에 id-token write 권한 추가

---

## Previous checkpoint (2026-05-03 오후 — GitHub Cowork 인프라)
- **세션 종료 직전 변경 (autoevolvingapp 도구가 4 commits 추가):**
  - `a033da3` feat: GitHub Cowork 통합 (Claude AI PR 리뷰 + desktop 도메인 게이트)
  - `112c916` fix: Cowork 워크플로우 인증을 OAuth 토큰으로 전환
  - `7d94f98` feat: @claude 멘션 트리거 워크플로우 추가
  - `71e8a4e` fix: Cowork 워크플로우에 id-token write 권한 추가
- **새 인프라 6개 (GitHub Cowork = Claude AI 자동 협업):**
  - `.github/CODEOWNERS` — 모든 파일 default reviewer = `@phoodul`
  - `.github/CONTRIBUTING.md` — 외부 기여자 가이드 (CLA + PR + secret safety + Claude 라벨 정책)
  - `.github/workflows/claude.yml` — `@claude` 멘션 시 응답
  - `.github/workflows/claude-pr-review.yml` — `claude-review` 라벨 시 자동 PR 리뷰 (한국어, 🔴/🟡/🟢)
  - `.github/workflows/claude-security-review.yml` — 보안 전담 리뷰 (anthropics/claude-code-security-review)
  - `.github/workflows/domain-gate.yml` — Tauri v2 desktop 특화 게이트 (IPC + capability + 크로스플랫폼)
- **Fork PR 보안**: 동일 repo = `claude-review` 만, fork = `claude-review` + `safe-to-review` (악성 코드 방지)
- **새 세션에서 사용자 액션 4개 필요**:
  1. **`CLAUDE_CODE_OAUTH_TOKEN`** secret 등록 — claude.yml / claude-pr-review.yml / domain-gate.yml 사용
  2. **`ANTHROPIC_API_KEY`** secret 등록 — claude-security-review.yml 사용
  3. **Branch protection rule** 설정 (main) — Required status checks (Rust + Frontend + E2E + EE Relay 4개) + linear history + no force push (CONTRIBUTING.md:22 가 강제)
  4. **라벨 2개 생성** — `claude-review` (메인테이너 트리거), `safe-to-review` (fork PR 안전성 검증 후)
- **이전 세션 (2026-05-02 ~ 05-03 오전) 완료된 것**: 출시 production 인프라 100% — repo public + Cloudflare Pages + custom domain + Workers Relay + first valid prerelease v0.1.0-pre8 + 무료 베타 정책 + Issue templates + Discussions + M24 (일반 비밀번호 vault) 마일스톤 신설.
- **다음 세션 우선순위 큐 (사용자 결정)**:
  - **A. GitHub Cowork 활성화** — 위 4 액션 처리 (가장 작은 작업, 즉시 OSS 협업 환경 완성)
  - **B. 본인 dogfooding** — Windows/macOS 에 v0.1.0-pre8 직접 설치, 1주 사용 (M24 진입 전 워크플로우 익히기)
  - **C. M24 v1 진행** — T-24-A (`credential.kind` 마이그레이션) 부터 phase 순차
  - ~~**D. Demo capture 디버깅** — `pnpm capture:demo` 의 dialog locator 실패 원인~~ ✅ 완료 (2026-05-03 오후 후반)
  - **E. 사용자 액션 #4-7** (Apple cert / Windows cert / 데모 영상 / HN+PH)

---

## Previous checkpoint (2026-05-03 오전 — 출시 production 인프라 완성)

- **Time:** 2026-05-03 — **출시 production 인프라 100% 완성 + 무료 베타 정책 결정**
- **Phase:** Phase 3 — Implementation 종료. **사용자 액션 3 (DNS) 완료**, 4–7 (Apple cert / Windows cert / 데모영상 / HN+PH) 은 다음 세션.
- **이번 세션 (2026-05-02 ~ 05-03) 핵심 마일스톤:**
  - **Repo public 전환 ✅** (`phoodul/api-vault` 공개) — anonymous .dmg / latest.json 다운로드 검증 완료
  - **Cloudflare Workers Relay 배포 ✅** — `api-vault-relay.phoodul.workers.dev` 라이브, JWT_SIGNING_KEY + GitHub OAuth + Google OAuth secrets 등록
  - **Cloudflare Pages 배포 + Custom domain ✅** — `api-vault.app` Active + SSL, 새 landing page 디자인 (bento grid + glassmorphism + light/dark + VaultMechanism 로고)
  - **무료 베타 가격 정책 결정 ✅** — Pro $2 즉시 도입 안 함, dogfooding + 법적 자문 + 일반 비밀번호 기능 + 첫 100~500 사용자 피드백 후 가격 재결정
  - **Issue templates + Discussions 6 categories ✅** — Bug / Feature / Q&A / Ideas / Show & Tell / Announcements / Polls / General
  - **첫 valid prerelease v0.1.0-pre8 ✅** — 12 assets + latest.json (4 platform), 누적 7 fix 후 안정화
  - **CI green ✅** — Rust fmt/clippy/test (Linux deps) + frontend lint/format/typecheck/vitest + e2e + EE relay
- **이번 세션 commit 시리즈 (총 ~15 commits):**
  - prerelease 시리즈: pre1 → pre8 (7개 fix lap, e848a75 → abc0baf)
  - CI 복구: 3b6cc36 fmt/lint/format + 28bcc89 migration/e2e + aadef9f Linux deps + e4e7bbb shamir + 7e89cd0 deploy-relay gating
  - Landing: bento grid + glassmorphism + 무료 베타 정책 + VaultMechanism logo + Issue templates (b546fea)
- **사용자가 직접 진행한 사용자 액션:**
  - GitHub Secrets — TAURI_SIGNING_PRIVATE_KEY + PASSWORD ✅
  - GitHub Variables — RELAY_DEPLOY_ENABLED=true ✅
  - Cloudflare API token + GitHub Secret ✅
  - Cloudflare Pages 도메인 연결 ✅ (UI 마이그레이션 우회 후 성공)
  - GitHub OAuth App 등록 + secret ✅
  - Google OAuth App 등록 + secret ✅
  - Repo Features 토글 (Wikis OFF / Issues+Discussions+Sponsorships+Preserve ON / Projects OFF) ✅
  - PR 옵션 (Squash ON / Merge commit OFF / Auto-delete branches ON) ✅
  - **Repo public 전환** ✅
  - Discussions 6 카테고리 setup ✅
- **남은 사용자 액션 (다음 세션):**
  - **#4** macOS notarization — Apple Developer $99/yr (2주 정도 dogfooding 후)
  - **#5** Windows OV cert — Sectigo / SSL.com ~$150/yr (대량 사용자 발생 시)
  - **#6** 데모 영상 — `pnpm capture:demo` 디버깅 (dialog locator 실패) + ffmpeg 변환 + edit
  - **#7** Hacker News "Show HN" + Product Hunt 게시
- **새 마일스톤 신설 — M24 일반 비밀번호 vault** (베타 종료 조건):
  - 사용자 결정 (2026-05-03 project-decisions.md): 일반 비밀번호 (1Password 류) 기능 추가 후에야 paid 가격 정당화 가능
  - phase: schema 확장 (`credential.kind: "api_key" | "password"`) → backend → UI tabs → 브라우저 autofill
  - launch 직후 dogfooding 결과 따라 next priority 결정

---

## Previous checkpoint (2026-05-01 ~ 2026-05-02 — 출시 launch 인프라 5 자율 lap)

- **Time:** 2026-05-01 ~ 2026-05-02 (Night mode 자율 lap — **출시 launch 인프라 5개 lap 완주**)
- **세션 개요:** 사용자 자는 동안 (option A 풀 진행 승인) 자율 모드로 5 lap 연속 진행. 모두 push 완료. 최종 commit `b391ebe` (origin/main).
- **이번 세션 5 lap 누적 commits (이전 세션 + 이번 turn):**
  - `82b5d79` chore(release) — GitHub repo URL `api-vault/api-vault` → `phoodul/api-vault` 일괄 정정 (17 파일) + 도메인 `apivault.app` → `api-vault.app` (4 파일) + tauri.conf.json updater pubkey 채움
  - `0f2dc32` feat(release) — release.yml dry-run 모드 (workflow_dispatch + dry_run boolean input)
  - `3e81836` fix(release) — dry-run 시 tauri-action 우회 (releaseId 없으면 "Release not found" 발생) → pnpm tauri build 직접 호출
  - **(2026-05-01 dry-run 100% 통과 — 3 매트릭스 모두 ✅)**
  - **(2026-05-01 v0.1.0-pre1 real tag push — release.yml 자동 trigger)**
  - `8d1d544` feat(demo) — marketing 영상 자동 캡처 (`pnpm capture:demo`, 3 시나리오 webm)
  - `5730e79` feat(i18n) — ja/zh 의 M23 Vault Charter 45 키 보강 (en parity 622/622)
  - `4da601e` feat(scripts) — version-bump.ts + changelog-from-commits.ts 자동화 (다음 release cut 두 명령으로 끝)
  - `b391ebe` docs(user-guide) — Troubleshooting 섹션 8개 추가 (en + ko)

### 자율 5 lap 상세

#### Lap 1 — Demo capture script (`8d1d544`)
- **`e2e/demo.spec.ts`** — 3 test, 각자 독립 webm 출력
  - `lock-screen` — sci-fi HUD + atmosphere + mouse gloss 주변 6 점 cycling
  - `charter-issuance` — 패스프레이즈 입력 → CharterDisplay (Lapis 톤) 8s 캡처
  - `recovery-flow` — Forgot link → RecoveryDialog → 6 단어 타이핑
- **`scripts/capture-demo.ts`** — Playwright 실행 + test-results/.../video.webm → media/<scene>.webm 복사
- **`e2e/playwright.config.ts`** — testIgnore `/.*demo\.spec\.ts$/` (regular E2E 와 분리)
- **`package.json`** — `capture:demo` 스크립트
- **`.gitignore`** — `media/*.webm`, `media/*.mp4` 제외 (큰 binary)
- **`media/README.md`** — ffmpeg 변환/concat 가이드
- 사용: `pnpm capture:demo` (vite dev server 자동 spawn → Playwright → 영상 출력)

#### Lap 2 — `v0.1.0-pre1` real tag push
- 메시지: M0~M9 + M18~M22 + M22.5 + M23 Vault Charter 누적, 차별화 4 축 모두 구현
- prerelease (`-pre1`) 표시로 GitHub Releases 메인 페이지에는 미게시
- Tauri signing 적용, Apple/Windows 코드 서명은 secrets 미등록이라 unsigned (SmartScreen/Gatekeeper 경고 발생 — Troubleshooting 섹션에 사용자 안내)
- VS Code extension publish skip (PAT 미등록)
- **사용자 깨었을 때 확인할 것:** https://github.com/phoodul/api-vault/releases — `v0.1.0-pre1` prerelease 가 published 되어있는지. workflow run 결과 (대략 ~20분 후 published).

#### Lap 3 — i18n ja/zh M23 키 보강 (`5730e79`)
- 부족 키 45 개 — 모두 M23 Vault Charter 관련 (`settings.charter*`, `vault.charter.*`, `vault.recovery.*`)
- ja: 일본어 formal 어조 (です/ます), 보안/리커버리 문구라 직역 회피
- zh: Simplified Chinese, formal tone
- 결과: ja/zh 모두 622/622 (en parity)
- **다른 12 locale (ar/de/el/es/fr/hi/it/pl/pt/ru/vi)** 은 17 키 (LangSwitcher 만) — 의도된 상태, 향후 lap 에서 보강

#### Lap 4 — 자동화 스크립트 (`4da601e`)
- **`scripts/version-bump.ts`** — root package.json + vscode-extension/package.json + tauri.conf.json + src-tauri/Cargo.toml (workspace + 모든 crate) + winget/snap/homebrew 매니페스트 일괄 bump. SemVer 검증 + `--dry-run`. 사용: `pnpm version:bump 0.2.0`
- **`scripts/changelog-from-commits.ts`** — `git log <from>..<to>` 의 conventional commits 를 카테고리별 그루핑 (Added/Fixed/Performance/Changed + Breaking marker `!`). docs/test/ci/build/style 무시. markdown 으로 stdout 출력. 사용: `pnpm changelog:gen v0.1.0 v0.2.0`
- **결과:** 다음 release cut 이 2 명령 (`version:bump` + `changelog:gen`) 으로 끝남. 이전엔 17 파일 수동 동기화 필요 (휴먼 에러 위험).

#### Lap 5 — Troubleshooting 섹션 8개 (`b391ebe`)
- en + ko 양쪽 추가 (en 520줄 → 645줄, ko 481줄 → 600줄+)
- 8 시나리오 — 출시 후 사용자가 가장 많이 부딪힐 것들:
  1. Windows SmartScreen (unsigned binary)
  2. macOS "앱이 손상되었습니다" (un-notarized) — `xattr -cr` 해결
  3. Linux libwebkit2gtk-4.1 missing (apt/dnf install)
  4. 패스프레이즈 맞는데 unlock 실패 (cooldown / vault 경로 / Caps Lock)
  5. Auto-updater 새 버전 못 찾음 (캐시 삭제 + pre-release skip 정책)
  6. CLI `command not found` (OS 별 PATH symlink)
  7. MCP 서버 Claude/Cursor 미인식 (JSON escape, Quit 재실행)
  8. Charter recovery 거부 (typo, Shamir 페어 조합, vault 교체)
- 코드 서명 인프라가 launch 후 도입되므로 13.1/13.2 가 v0.1.x 의 가장 빈번한 경고 — 미리 매뉴얼화로 support 부하 감소.

### 사용자 깨었을 때 확인 우선순위

1. **https://github.com/phoodul/api-vault/releases** — `v0.1.0-pre1` prerelease 와 artifacts (.dmg / .msi / .exe / .deb / .AppImage / .rpm + signature 파일) 확인
2. **workflow run 페이지** — 매트릭스별 빌드 상태 + `latest.json` 자동 생성 검증 (CHANGELOG 의 가정 검증)
3. **Demo script 동작 검증 (선택)** — `pnpm install` (tsx auto-install) 후 `pnpm capture:demo`. media/ 에 3 webm 생성 확인.

### 출시까지 남은 사용자 액션 (코드만으로 못 끝남, 우선순위 순)

1. ✅ ~~Tauri signing key + GitHub secrets~~ (완료)
2. ✅ ~~첫 release tag push~~ (자율로 완료, 결과 검증 대기)
3. **DNS — `api-vault.app` 도메인 → GitHub Pages / Cloudflare Pages 연결 + site/index.html 배포** ($0–$5)
4. **macOS notarization** — Apple Developer 등록 ($99/yr) → cert → secrets
5. **Windows OV cert** — Sectigo / SSL.com 구매 ($150/yr) → secrets
6. **데모 영상** — `pnpm capture:demo` 자동 캡처 + ffmpeg 으로 mp4 변환 (Lap 1 인프라로 자동화됨)
7. **Hacker News Show HN + Product Hunt** — Lapis Vault + Supply chain × AI agent + Charter recovery 묶어 게시

### 다음 자율 lap 후보 (사용자 결정 후)

| # | 작업 | 시간 | 가치 |
|:--|:--|:--|:--|
| A | 다른 12 locale 의 핵심 키 (~50) 보강 (de/fr/es/zh-TW 우선) | 1.5h | 글로벌 SaaS 첫 인상 |
| B | site/index.html 추가 폴리시 (Vault Charter 카드 강조 + screenshot) | 30분 | launch 페이지 임팩트 |
| C | M14 Auto rotation R1 phase (provider 1 — Stripe restricted key) | 큰 (3h+) | Pro 가격 정당화 |
| D | M10 Payments scaffold (Stripe webhook + entitlement) | 큰 | revenue 기반 |
| E | M15 CI/CD 의 T132/T133 정식 종료 (test-on-PR 통합) | 1h | 회귀 안전망 |

---

## Previous checkpoint (2026-05-01 — M23 Vault Charter 클로즈 + 출시 폴리시 lap 종료)

- **Time:** 2026-05-01 (M23 Vault Charter 클로즈 + 출시 폴리시 lap 종료 + **출시 경로 통일 lap** + **release.yml dry-run 모드 추가**)
- **release.yml dry-run lap (이번 turn):**
  - `workflow_dispatch.inputs` 에 `dry_run` boolean 추가, `tag` 를 optional + default `v0.0.0-dryrun` 으로 변경
  - `create-release` job 에 `if: !inputs.dry_run` — Release 생성 skip
  - `build-tauri` job 에 `if: always() && (success || skipped)` — `create-release` skip 도 통과
  - `tagName` 을 `github.event_name == 'push' ? github.ref_name : inputs.tag` 로 분기
  - `Upload bundle artifacts (dry run)` step 추가 — `actions/upload-artifact@v4` 로 bundle 캡처
  - `publish-release` 에 `if: !inputs.dry_run`
  - `publish-vscode-extension` 에 `if: !inputs.dry_run && !contains(ref_name, '-')`
  - `RELEASE_GUIDE.md` 에 "Dry-run pipeline check" 섹션 추가 — 사용법 + 실패 모드별 디버깅
  - **사용법**: GitHub Actions 페이지 → Release workflow → Run workflow → "Dry run" 체크 → Run. 빌드 결과는 workflow run artifacts 로 다운로드 가능.
- **사용자 secrets 등록 완료 (이전 turn):** `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` 둘 다 등록됨. dry-run 으로 즉시 검증 가능 상태.
- **출시 경로 통일 lap (이전 turn — `82b5d79`):**
- **출시 경로 통일 lap (이번 turn):**
  - GitHub repo URL: `api-vault/api-vault` → `phoodul/api-vault` (17 파일, 27 occurrences)
  - 잘못된 도메인 표기: `apivault.app` (squatter 보유) → `api-vault.app` (사용자 보유) (4 파일, 17 occurrences)
  - `src-tauri/tauri.conf.json` 의 updater pubkey 채워넣음 (사용자 로컬 `~/.tauri/api-vault.key.pub` 의 base64 형태)
  - `docs/project-decisions.md` 에 "GitHub repo: phoodul/api-vault" 결정 추가 (이전 "api-vault org" 결정 갱신)
  - 보존 5곳: winget path template (1), historical org 결정 (1), historical "왜 apivault.app 못 썼는지" 설명 (3)
  - 별도 식별자 (GitHub 와 무관, 그대로 유지): vscode-extension publisher / winget PackageIdentifier / snap name / homebrew cask name 모두 `api-vault`
- **Phase:** Phase 3 — Implementation. **출시 블로커 모두 해소**. 누적: M0~M9 ✅ + M18 v1 ✅ + M20 v1+v2 ✅ + M21 v1+v2+v3 ✅ + M22 v5 ✅ + M22.5 (Lapis Vault 디자인) ✅ + Night mode VaultMechanism 시리즈 ✅ + Night mode 18 LockScreen i18n 15개 언어 + RTL ✅ + **M23 Vault Charter ✅**.
- **M23 Vault Charter — 풀 마일스톤 클로즈 (2026-04-30 ~ 2026-05-01, 12 code + 6 docs commits):**
  - **A** `91ace0b` `api-vault-charter` crate — EFF Diceware 7776 + `sharks` SSS + XChaCha20-Poly1305 envelope (31 unit)
  - **B-1** `c82b790` vault 파일 포맷 v2 — charter envelope 슬롯 (CHARTER_FLAG + 2B LEN, max 1024B) + v1 backward compat (7 회귀)
  - **B-2** `24ce24a` `initialize_with_charter` (None/Single/Shamir2of3) + `CharterMode`/`CharterIssuance` (7 통합)
  - **B-3** `27802f0` `recover_with_charter` — charter → 새 passphrase + 옵션 새 charter, 옛 charter 자동 무효 (7 통합)
  - **B-4** `92531d0` Tauri 커맨드 3종 (`vault_init_with_charter` / `vault_recovery_unlock` / `vault_has_charter`) + audit hook (issued/recovered) + 9 unit
  - **C** `855cae0` Charter 발급 UI — `CharterDisplay` (Lapis 청금석 + 황동 봉인 + 인쇄 디자인) + `CreateVaultDialog` 3-phase + en/ko 36 i18n + Vitest 7→10
  - **D** `20d6752` `RecoveryDialog` (Single/Shamir 입력 + 새 charter 모드 라디오 + 에러 매핑) + LockScreen Forgot link (`vault_has_charter` 조건부)
  - **Hotfix** `ac1ef95` unlock 애니메이션 마지막 ring 감속 (spring → cubic-bezier ease-out [0.16, 1, 0.3, 1], 1.4s)
  - **E-1** `4769248` cooldown sidecar (`services/charter_cooldown.rs` + `vault.age.cooldown.json`) + `vault_unlock` 검사 + `apply_recovery_event` + 3 Tauri 커맨드 + 9 unit
  - **E-2** `1bf141e` `CharterCooldownSection` 토글 + LockScreen cooldown_active 메시지 + en/ko 9 i18n + audit metadata 확장
- **M23 클로즈 후 출시 폴리시 (5 commits — release infra/landing/docs):**
  - `800bd69` feat(release) — updater endpoint + README Vault Charter / supply / IDE 소개
  - `23e1510` feat(site) — 랜딩 페이지 Vault Charter recovery 카드 + 가격표 항목
  - `92acfef` docs(user-guide) — Vault Charter 섹션으로 24-word recovery 갱신 (en + ko)
  - `bc2c670` docs(terms) — recovery code → Vault Charter 용어 정정
  - `215b538` docs(changelog) — M23 Vault Charter 항목 추가
- **현재 git 상태:** branch `main`, working tree **clean**. 마지막 커밋 `215b538`.
- **테스트 (M23 클로즈 시점):** 워크스페이스 clippy 0, 모든 회귀 통과.
- **남은 핵심 마일스톤:** M10 Payments / M11 Mobile / M12 Web Viewer / **M13 i18n + Updater + Release** / M14 Auto Rotation / M15 CI/CD (T132/T133 진입) / M19 Team / M16/M17 placeholder.
- **출시까지 남은 사용자 액션 (이전 세션 마지막 메시지에서 확정 — 코드만으로 못 끝남):**
  1. **Tauri signing key 생성** + `tauri.conf.json` pubkey + GitHub secret (`TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`) — 사용자 로컬 `pnpm tauri signer generate`, 5분, 무료
  2. **첫 release tag push** — `git tag v0.1.0-pre1 && git push --tags` → `release.yml` 자동 빌드 트리거, 무료
  3. **DNS** — `api-vault.app` 도메인을 GitHub Pages / Cloudflare Pages 로 연결 후 `site/index.html` 배포, $0–$5
  4. **macOS notarization** — Apple Developer 등록 ($99/yr) → cert 발급 → secrets 등록
  5. **Windows OV cert** — Sectigo / SSL.com OV cert 구매 → secrets 등록 (~$150/yr). EV 는 트랙션 후
  6. **데모 영상** — LockScreen 애니메이션 + Charter 발급 + Recovery 흐름 30–60초 캡처 (OBS, 무료)
  7. **Hacker News "Show HN" + Product Hunt** — Lapis Vault + Supply chain × AI agent + Charter recovery 패키지로 (무료)
- **검증 필요한 가정:** CHANGELOG 의 "tauri-action 이 `latest.json` 자동 생성" 은 첫 dry-run release 에서 확인 필요 (현재 docs 만 명시).
- **자율 가능 다음 lap 후보 (사용자 우선순위 결정 대기):**
  - **A. Demo capture script** — `scripts/capture-demo.ts` puppeteer/playwright 스크립트로 LockScreen + Charter 흐름 무인 녹화. 사용자가 OBS 안 켜고 영상 추출 가능. ~30–60분.
  - **B. Pre-release smoke test workflow** — `.github/workflows/release.yml` dry-run 모드 (tag 없이 PR 단위로 unsigned bundle 생성 + artifacts 업로드). ~30–60분.
- **권장 우선순위:** 사용자 액션 1 (Tauri signing key) 먼저 → 그 사이 자율 lap A 또는 B 진행.

---

## Previous checkpoint (2026-04-30 Night mode 18 — LockScreen i18n 15개 언어)

- **Time:** 2026-04-30 Night mode 18 (사용자 trigger — **LockScreen 글로벌 LanguageSwitcher 15개 언어 + RTL**. 인도어 누락 보정 후속 lap.)
- **Phase:** Phase 3 — Implementation. M9 ✅ + M18 v1 ✅ + M20 v1+v2 ✅ + M21 v1+v3 ✅ + M22 ✅ + M22.5 (Lapis Vault 디자인) + Night mode 시리즈 (LockScreen sci-fi HUD) 진행 중. 이번 세션은 **글로벌 SaaS 비전의 첫 wedge — LockScreen i18n 진입**.
- **이번 Night mode 18 변경 (2 commits, 같은 날 lap):**
  - **commit 1 — 11개 언어 진입:**
    - 신규 7개 locale: `src/locales/{es,fr,de,it,el,pt,ru}/common.json`
    - `src/lib/i18n.ts` — 11개 언어 등록 + `SUPPORTED_LANGUAGES` export
    - 신규 `src/components/language-switcher.tsx` (corner / plain variant)
    - `src/features/vault/LockScreen.tsx` — 우측 상단 corner 통합
    - 단위 테스트 4개
  - **commit 2 — 4개 추가 (인도어 누락 보정 + RTL):**
    - 신규 4개 locale: `src/locales/{ar,hi,vi,pl}/common.json`
    - `src/lib/i18n.ts` — `SUPPORTED_LANGUAGES` 에 `dir` 메타필드 추가, `languageChanged` 이벤트로 `<html lang/dir>` 자동 동기화
    - 단위 테스트 +1 (RTL 검증 — 아랍어 선택 시 `document.documentElement.dir === "rtl"`)
- **Tests (Night mode 18 lap 종료 시점):**
  - Frontend Vitest: **450 passed** (이전 445 + LanguageSwitcher 5)
  - 기존 LockScreen 6 테스트 회귀 없음
  - typecheck 통과 / 변경 파일 lint 0
- **지원 언어 15개 최종 목록:**
  - 동아시아: en/ko/ja/zh
  - 유럽 (LTR): es/fr/de/it/el/pt/ru/pl
  - 남/동남아시아: hi/vi
  - MENA (RTL): ar
- **글로벌 SaaS 비전 정렬:**
  - LockScreen = 첫 인상 화면. 영어 외 사용자에게 **즉시 자국어 인지** → 글로벌 진입 wedge
  - 11개 언어 = IT 강국 + 인구 규모 기준 첫 lap 적정 폭 (en/ko/ja/zh/es/fr/de/it/el/pt/ru)
  - 자동 LanguageDetector cache → 사용자 선택 영속화
  - 다른 화면의 언어 보강은 **M13 i18n + Release** 시점에 단계적
- **이전 Night mode 17 체크포인트:**
  - **Time:** 2026-04-29 Night mode 17 (자율 모드 — **M21 v1 풀 완료**. VS Code extension: 3 commands + status bar + diagnostics + LM tools + package.json hover provider).
- **Phase:** Phase 3 — Implementation. M9 ✅ + M18 v1 ✅ + M20 v1 ✅ + **M21 v1 ✅**. 4 marquee 차별화 마일스톤 연속 완료.
- **이번 Night mode 17 신규 commits (3개):**
  - `755de93` feat(vscode) — M21-1: vscode-extension scaffold + 3 commands + status bar + 인라인 OSV 스캔 → Problems panel
  - `89e8e9a` docs — M21-1 follow-up (.gitignore + task.md status)
  - `f640927` feat(vscode) — M21-2: VS Code 1.96+ LanguageModel tools (apivault_list_credentials, apivault_scan_supply_chain) + package.json hover provider + 캐시. Copilot Chat / Claude / Cursor 모두 자동 인식.
- **Tests (Night mode 17 종료 시점):**
  - vscode-extension: TypeScript strict 컴파일 통과 (단위 회귀는 v3 에 추가 — VS Code API mock 인프라 도입 후)
  - api-vault-supply / mcp / app / cli / crypto / storage / etc.: 변동 없음 (Night mode 16 종료 시점 그대로)
  - 전체 워크스페이스 clippy 0
- **차별화 평가 — M21 v1 종료 시점:**
  - **VS Code marketplace 진입 가능 상태** (publisher "api-vault" 등록 + vsce package 시 .vsix 생성)
  - **Copilot Chat / Cursor / Claude 모두 자동 호환** — 한 host 마다 별도 plugin 안 만들어도 LM tool API 한 번 등록으로 cover
  - **graph + supply chain × AI agent × IDE** 의 4축 결합. 1Password / Doppler / Infisical / Snyk 어느 한 쪽도 못 함.

---

## M21 v1 클로즈 — 비전 점검 (2026-04-29)

운영 원칙: 매 마일스톤 클로즈 시 비전 정렬 점검 1회 의무.

### 회고

연속 4 마일스톤 (M9 → M18 → M20 → M21) 자율 진행. 글로벌 SaaS 진입 비용 (M9 sync) + 차별화 (M18 CLI/MCP) + moat (M20 supply) + 분배 채널 (M21 IDE) = **글로벌 dev tool 의 first-class 자리잡음 골격 완성**.

### 다음 단계 후보 (사용자 결정)

| # | 마일스톤 | 차별화 | 비용 |
|:--|:--|:--|:--|
| 1 | M22 JetBrains plugin | 큰 (enterprise dev) | 큰 (Kotlin/Gradle) |
| 2 | M19 Team / RBAC / SSO | 중 (B2B 진입) | 큰 (auth 재설계) |
| 3 | M14 Auto rotation | 중 (provider 별) | 큰 |
| 4 | M11 Mobile (iOS/Android) | 중 | 큰 (Tauri Mobile) |
| 5 | M13 i18n + Updater + Beta release | **준비된 빠른 출시** | 중 |
| 6 | M21 v3 (code-lens + Cargo hover) | 작 | 작 |
| 7 | M20 v2 (lockfile + semver range) | 작 (정확도) | 중 |

### 자율 추천

**M13 (Beta release) 진입** — 4 마일스톤의 차별화가 누적된 시점에서 실 사용자 피드백 수집이 다음 lap 의 가장 큰 입력. M22/M19/M14 는 모두 사용자 피드백 후 우선순위 확정 가능. M13 자체도 i18n + auto-updater + GitHub releases 같은 출시 인프라.

**또는 M21 v3 (small) + M20 v2 (small)** 으로 **현재 마일스톤들의 정확도 + 깊이** 끌어올려 출시 전 마무리.

다음 turn 에 사용자 명시 없으면 **M21 v3 → M20 v2 → M13** 순서로 자율 진입.

---

## Previous checkpoint (2026-04-29 Night mode 16)

- **Time:** 2026-04-29 Night mode 16 (자율 모드 — **M20 v1 풀 완료**. supply chain risk graph: schema + manifest parsers + OSV client + matcher + storage repos + Tauri 커맨드 + MCP tool. 4 commits.)
- **Phase:** Phase 3 — Implementation. M9 ✅ + M18 v1 ✅ + **M20 v1 ✅**. 113/132 태스크 + M18/M20 신설 4개. 다음 → M19 (Team) 또는 M14 (Auto rotation).
- **이번 Night mode 16 신규 commits (3개 + docs):**
  - `22373c7` feat(supply) — M20-1+2: api-vault-supply crate + 0005_supply.sql migration + ecosystem.rs + advisory.rs (OSV.dev client + AdvisoryCategory text-signal classifier) + matcher.rs + manifest.rs (package.json + Cargo.toml)
  - `0b55bcc` feat(supply) — M20-3: storage repos (PackageRepo / PackageAdvisoryRepo / PackageUsageRepo) + commands/supply.rs (`supply_scan_project`) + lib.rs invoke_handler 등록
  - `0af0c46` feat(mcp) — M20-4: MCP tool `check_supply_chain_risk` (manifest 파싱 + OSV query + category filter, read-only — DB 무관)
- **Tests (Night mode 16 종료 시점):**
  - api-vault-supply: **21 회귀** (ecosystem 4 + advisory 7 + matcher 5 + manifest 4 + osv wiremock 1)
  - api-vault-storage: +3 supply repo (전체 +3)
  - api-vault-app lib: +3 commands::supply (전체 173 → 176)
  - api-vault-mcp: 5 → 7 (전체 +2 — supply tool + tools_list 갱신)
  - 워크스페이스 clippy --all-targets --all-features -D warnings: 0
- **차별화 평가 — M20 v1 종료 시점:**
  - **Supply chain risk graph** = dependency graph 의 외부 확장. Project → Package → Advisory.
  - **AI agent 통합**: Claude / Cursor 가 새 코드 작성 전 `check_supply_chain_risk` 자동 호출 → secret-exfil history 패키지 발견 시 사용자 경고.
  - **차별화 강도**: 1Password / Bitwarden / Doppler / Infisical / HashiCorp Vault 모두 못 함. graph + breach feed + AI agent 의 결합은 우리만 가능.
- **이전 Night mode 15 체크포인트는 본 파일 아래 섹션 참조.**

---

## M20 v1 클로즈 — 비전 점검 (2026-04-29)

운영 원칙: 매 마일스톤 클로즈 시 비전 정렬 점검 1회 의무.

### 회고

M9 = 입장권 (sync), M18 = 첫 차별화 (CLI/MCP), **M20 = 두 번째 차별화** (supply chain × AI agent). 세 마일스톤 연속으로 글로벌 SaaS 의 진입 비용 + moat 구축 동시 진행.

### M20 v2 백로그

- **lockfile 통합**: pnpm-lock.yaml / package-lock.json / Cargo.lock → resolved version 정확화 (현재는 매니페스트 range 그대로).
- **semver range 평가**: advisory 의 affected_range 와 package 의 resolved version 정확 매칭 (false-positive 감소).
- **continuous scan**: feed scheduler 에 supply scan 통합 (1d 주기로 user 의 이전 scan 결과 OSV 재조회).
- **incident 통합**: 매칭된 advisory 를 incident 로 자동 등록 → blast_radius UI 에 supply chain 노드 표시.

### 다음 마일스톤 — 선택지

| # | 마일스톤 | 차별화 | 비용 |
|:--|:--|:--|:--|
| 1 | M19 Team / RBAC / SSO | 중 (B2B 진입 비용) | 큰 (auth 재설계) |
| 2 | M14 Auto rotation | 중 (provider 별) | 큰 |
| 3 | M11 Mobile (Android/iOS) | 중 (모바일 시장 진입) | 큰 (Tauri Mobile) |
| 4 | M21 VS Code / JetBrains plugin | 큰 (MCP 위에 IDE) | 중 |

### 자율 추천 (Night mode 17+)

**M21 VS Code plugin 우선** — MCP server 가 이미 있으니 plugin 은 thin wrapper. dev tool 시장에서 즉시 가시화 (VS Code marketplace). 비용 대비 효과 가장 높음.

다음 turn 에 사용자 명시 없으면 M21 자율 진입.

---

## Previous checkpoint (2026-04-28 Night mode 15)

- **Time:** 2026-04-28 Night mode 15 (자율 모드 — **M18 v1 풀 완료**. mcp-1 + mcp-2 종료. CLI + MCP 둘 다 동작.)
- **Phase:** Phase 3 — Implementation, M9 ✅ + **M18 v1 ✅** (CLI 3 subcommand + MCP 4 tools). 다음 → M19 (Team / RBAC) 또는 M20 (Supply chain) 또는 M14 (Auto rotation).
- **이번 Night mode 15 신규 commits (2개):**
  - `e893ccf` feat(mcp) — M18-mcp-1: stdio JSON-RPC MCP server scaffold + initialize / tools/list / tools/call (list_credentials, reveal_credential) + 30/hour reveal quota + audit-on-reveal stderr line
  - `0f666bd` feat(mcp) — M18-mcp-2: RAILGUARD MCP tools (check_railguard_status / suggest_railguard_template) + api-vault-railguard 통합
- **Tests (Night mode 15 종료):**
  - api-vault-mcp: **5 회귀** (initialize / tools/list × 4 / RpcError 코드 / suggest 렌더 / check 미존재 path)
  - api-vault-cli: 3 (변동 없음)
  - Frontend Vitest 445 / Relay vitest 71 / api-vault-app lib 173 / api-vault-crypto 15 (모두 변동 없음)
  - clippy --workspace --all-targets --all-features -D warnings: 0
- **차별화 평가 — M18 v1 종료 시점:**
  - **CLI**: dependency graph 매핑이 곧 config (Doppler/Infisical 의 manual yaml 없음)
  - **MCP**: 어떤 경쟁사도 안 만든 새 카테고리. AI agent 가 vault metadata + RAILGUARD 상태 + 사용자 명시 reveal 까지 한 인터페이스로
  - "그래프 + breach feed + RAILGUARD" 세 자산이 GUI 안에 갇혀있던 → 이제 dev surface 전체로 분배
- **이전 Night mode 14 체크포인트는 본 파일 아래 섹션 참조.**

---

## M18 v1 클로즈 — 비전 점검 (2026-04-28)

운영 원칙: 매 마일스톤 클로즈 시 비전 정렬 점검 1회 의무.

### M18 v1 의 의의

M9 (sync) 가 입장권이었다면 M18 은 **첫 차별화 표면**. dependency graph + RAILGUARD 자산을 GUI 밖으로 노출 — Doppler/Infisical 의 핵심 (CLI) 을 우리도 갖추고, 그 위에 **AI agent 직접 통합** (MCP) 까지. 한 마일스톤에 두 단계 도약.

### M18 v2 백로그 (현 클로즈 후 별도 마일스톤)

- **M18 v2 — keyring cache + biometric unlock**: passphrase 매번 prompt 대신 OS keyring (Windows Hello / macOS keychain / Linux secret service) 통합. CLI/MCP 양쪽.
- **M18 v3 — desktop confirmation IPC**: MCP reveal 호출 시 desktop app 의 별도 dialog 로 사용자 per-call 승인. 현 quota-only 보호 강화.
- **M18 v4 — VS Code / JetBrains plugin** (M21 으로 별도 마일스톤): MCP 위에 IDE plugin layer.

### 다음 마일스톤 — 사용자 결정 큐

세 후보:
1. **M19 — Team / RBAC / SSO** (B2B 진입). 글로벌 SaaS 의 가격 영역 ($10+/seat). 개인 사용자만이 아닌 팀 진입을 위해 필수.
2. **M20 — Supply chain risk graph** (npm/PyPI package → secret leak 자동 매핑). 우리 dependency graph + breach feed 의 진짜 큰 응용 — supply chain 공격이 hot 한 시기.
3. **M14 — Auto rotation** (AWS/Stripe/GCP key 자동 rotation). 매우 차별화되지만 provider API 마다 정교한 작업.

### Night mode 16 자율 진입 — 어디로?

자율 모드 운영 원칙: 마일스톤 클로즈 시 사용자 결정 trigger 필요. 현재 `loop_count.json` 의 phase 가 `M18-mcp-1-entry` 였고 종료. 다음 마일스톤은 사용자 명시 결정 후 진입.

내 권장 (자율 추천):
- **M20 (Supply chain risk graph) 우선** — dependency graph + breach feed 의 시너지가 가장 강함. supply chain 공격 (e.g., `noisycoder` npm 패키지 hack 같은 사례) 이 매년 늘어나는 시점. 우리만 가능한 차별화.
- M19 (Team) 은 사용자 베타 후 (실제 B2B 사용자가 요청할 때) 진입.
- M14 (Auto rotation) 은 사용자 베타 시 첫 사용자 피드백 기반.

다음 turn 에 사용자가 마일스톤 지정하면 자율 진행.
- **이번 Night mode 14 신규 commits (3개 + docs):**
  - cli-1a: `apivault-cli` crate scaffold + `apivault list` (issuer / env / status / json 출력)
  - cli-1b (`dc56e09`): `apivault reveal <id>` + clipboard auto-clear (30s default, --print, --clear-after)
  - cli-1c (`f4bfde9`): `apivault run --project=<id> -- <cmd>` env 자동 주입 (dependency graph 의 Usage(env_var) 매핑 자동, revoked/compromised 거부)
- **Tests:**
  - api-vault-cli: 3 단위 (truncate / status_label)
  - 전체 회귀 (frontend / relay / Rust workspace) 변동 없음 (Night mode 14 는 신규 binary)
  - clippy --workspace --all-targets --all-features -D warnings 0
- **차별화 진전 (Option A 비전 정렬):**
  - **CLI 표면 확보** — Doppler / Infisical 의 핵심 무기 (`run -- cmd` env 주입) 구현 완료. **단** 우리는 dependency graph (Project → Usage(env_var) → Credential) 가 매핑까지 **자동** — manual config 파일 (Doppler 의 `doppler.yaml`) 불필요. 이게 진짜 차별화.
  - 다음 Night mode 15: **MCP server** — Claude / Cursor 가 vault 와 직접 대화하는 새 카테고리. 글로벌 차별화의 두 번째 표면.

---

## Previous checkpoint (2026-04-28 Night mode 13)

- **Time:** 2026-04-28 Night mode 13 (자율 모드 — **M9 풀 완료**. G-conflict + G-offline + G-entitlement + G-pair-2.5 연속 종료. 다음 마일스톤 = M18 CLI + MCP server.)
- **Phase:** Phase 3 — Implementation, **M9 ✅ 풀 완료** (28/28 sub-phases). 113/132 태스크 (85.6%). 다음 → M18 (CLI + MCP server, 글로벌 SaaS 차별화의 첫 표면 — Option A 결정).
- **이번 Night mode 13 신규 commits (3개):**
  - `a7be401` feat(sync) — M9 Phase G-conflict: revoked > active 우선순위 정책 + observer 통합 + Vitest +11
  - `d972752` feat(sync) — M9 Phase G-offline: navigator.onLine 배지 + Sidebar 통합 + i18n + Vitest +3
  - `33bc6b2` feat(sync) — M9 Phase G-entitlement + G-pair-2.5: Free 2 device 한도 + /pair/poll joiner_pub 노출 + relay vitest +4
- **Tests (4-28 Night mode 13 종료 시점, M9 클로즈):**
  - api-vault-crypto: **15 passed** (aead 9 + pairing 6)
  - api-vault-app lib: **173 passed**
  - Frontend Vitest: **445 passed** (이전 431 + 14: conflict 9 + observer +2 + OfflineBadge 3)
  - Relay vitest: **71 passed** (이전 67 + 4: entitlement 3 + pair-2.5 1)
  - typecheck / lint / clippy 모두 0
- **이전 Night mode 12 체크포인트는 본 파일 아래 섹션 참조.**

---

## M9 클로즈 — 비전 정렬 점검 (2026-04-28)

project-decisions [2026-04-28] 의 자율 모드 운영 원칙: **매 마일스톤 클로즈 시 비전 정렬 점검 1회 의무.**

### M9 의 의의 (회고)

M9 sync 는 글로벌 SaaS 의 **기본 요건** — 그 자체가 차별화는 아니지만, sync 가 흔들리면 다른 모든 차별화 (graph, RAILGUARD, audit) 가 무의미. 8 night modes (Night mode 6~13) + 28 sub-phases 에 걸쳐 단단히 마무리. Zero-Knowledge 정책 (relay 가 ciphertext 만 보관, AAD-bound envelope, 별도 value 채널, X25519 ECDH pairing) 모두 회귀로 검증.

### 다음 — M18 진입 (Option A)

project-decisions [2026-04-28] Option A 결정에 따라 **즉시 M18 (CLI + MCP server)** 진입. 이게 진짜 차별화의 시작:
- **CLI**: `apivault run -- npm start` 같은 dev tool 일급 시민 표면. dependency graph + RAILGUARD 자산을 GUI 밖으로 노출하는 분배 채널.
- **MCP server**: Claude / Cursor 가 vault 와 직접 대화 — 아무 경쟁사가 아직 안 만든 새 카테고리. "Claude, OPENAI_KEY 알려줘" 흐름의 안전 표면.
- 글로벌 dev tool 시장 진입 비용 = 부재 (개발자가 매일 쓰는 도구로 자리잡음).

### 다음 Night mode 14 자율 진입 큐

1. **M18-cli-1** — `apivault-cli` Rust binary 신설 (api-vault-app 의 services / commands 재사용). `apivault list` / `apivault reveal <id>` / `apivault run -- <cmd>` (env 자동 주입 후 sub-process spawn).
2. **M18-cli-2** — vault unlock 흐름 (passphrase prompt + auto-lock 옵션) + audit log 통합.
3. **M18-mcp-1** — MCP server (stdio transport) — `mcp-vault-list-credentials` / `mcp-vault-reveal-credential` (with confirmation gate) tool 정의 + Claude/Cursor 프로토콜 호환성.
4. **M18-mcp-2** — RAILGUARD 자동 트리거 (MCP 서버가 새 credential 사용 패턴 감지 → suggested .cursorrules update).

---

## Previous checkpoint (2026-04-28 Night mode 12)

- **Time:** 2026-04-28 Night mode 12 (자율 모드 — G-pair-4b Joiner UI + G-pair-4c deep-link auto-route 연속 완료.)
- **Phase:** Phase 3 — Implementation, M9 🔄 (Phase A+B+C+D+E+F+G-pair-1/2/3+G-pair-4a/b/c 종료, 24/26 sub-phases). M9 잔여: G-pair-2.5 (poll 확장, 환경복구 후) / G-conflict / G-offline / G-entitlement.
- **이번 Night mode 12 신규 commits (2개):**
  - `4529519` feat(sync) — M9 Phase G-pair-4b: Joiner UI (use-pair-joiner + PairJoinerDialog + LockScreen 통합) + i18n 4 로케일 + Vitest +9
  - `64bac85` feat(sync) — M9 Phase G-pair-4c: pair deep-link auto-route (use-pair-deep-link + LockScreen prefillUrl wire)
- **Tests (4-28 Night mode 12 종료 시점):**
  - api-vault-crypto: 15 / api-vault-app lib: 173 / Frontend Vitest: **431 passed** (이전 422 + 9) / Relay vitest: 67
  - typecheck / lint / clippy 모두 0
- **이전 Night mode 11 체크포인트는 본 파일 아래 섹션 참조.**

---

## Previous checkpoint (2026-04-28 Night mode 11)

- **Time:** 2026-04-28 Night mode 11 (자율 모드 — G-pair-4a Initiator UI 완료. 다음 G-pair-4b joiner side 진입 예정.)
- **Phase:** Phase 3 — Implementation, M9 🔄 (Phase A+B+C+D+E+F+G-pair-1/2/3 + **G-pair-4a** 종료, 22/24 sub-phases). M9 잔여: G-pair-2.5 (poll 확장, 환경복구 후) / G-pair-4b (joiner + deep-link) / G-conflict / G-offline / G-entitlement.
- **이번 Night mode 11 신규 commits (1개):**
  - `8acc47b` feat(sync) — M9 Phase G-pair-4a: Pair Initiator UI + use-pair-initiator hook (PIN + deep-link copy + polling + finalize) + 4 로케일 i18n + Vitest +6
- **Tests (4-28 Night mode 11 종료 시점):**
  - api-vault-crypto: 15 / api-vault-app lib: 173 / Frontend Vitest: **422 passed** (이전 416 + 6) / Relay vitest: 67
  - typecheck / lint / clippy 모두 0
- **이전 Night mode 10 체크포인트는 본 파일 아래 섹션 참조.**

---

## Previous checkpoint (2026-04-28 Night mode 10)

- **Time:** 2026-04-28 Night mode 10 (자율 모드 — Option A 채택 후 G-pair-3 client services 풀 완료. 비전 정렬 점검 시 사용자 결정: M9 풀 마무리 → M18 (CLI + MCP server) 즉시 진입. M18~M21 placeholder 신설.)
- **Phase:** Phase 3 — Implementation, M9 🔄 (Phase A+B+C+D+E+F+G-pair-1/2/**3** 종료, 21/22 sub-phases). M9 잔여: G-pair-2.5 (poll 확장, 환경복구 후) / G-pair-4 (UI) / G-conflict / G-offline / G-entitlement.
- **이번 Night mode 10 신규 commits (1개):**
  - `0e7b58d` feat(sync) — M9 Phase G-pair-3: client services::pairing + Tauri 커맨드 7 (initiator/joiner full flow, vault_init + save_session 자동, AAD = "pair:<pin>")
- **이번 Night mode 10 핵심 결정 (project-decisions.md [2026-04-28]):**
  - **Option A 채택** — 시간 더 걸려도 M9 풀 마무리 후 M18 (CLI + MCP server) 진입. 단순 MVP 가 아닌 글로벌 SaaS moat-building 우선.
  - M18~M21 신설: CLI/MCP / Team / Supply chain / IDE plugin
- **Tests (4-28 Night mode 10 종료 시점):**
  - api-vault-crypto: 15 (변동 없음)
  - api-vault-app lib: **173 passed** (이전 168 + 5 pairing service)
  - Frontend Vitest: 416 (변동 없음)
  - Relay vitest: 67 (변동 없음 — Miniflare 환경 미복구)
  - clippy / typecheck 모두 0
- **이전 Night mode 9 체크포인트는 본 파일 아래 섹션 참조.**

---

## Previous checkpoint (2026-04-28 Night mode 9)

- **Time:** 2026-04-28 Night mode 9 (자율 모드 — G-pair-2 완료. G-pair-2.5 (poll joiner_pub 확장) 시도했으나 Miniflare workerd ConnectEx #1225 환경 오류로 회귀 검증 불가 → 워킹 카피 revert, 다음 night mode 에서 환경 복구 후 재시도).
- **Phase:** Phase 3 — Implementation, M9 🔄 (Phase A+B+C+D+E+F+G-pair-1+**G-pair-2** 종료, 20/22 sub-phases). M9 잔여: G-pair-2.5 / G-pair-3 (client) / G-pair-4 (UI) / G-conflict / G-offline / G-entitlement.
- **이번 Night mode 9 신규 commits (1개):**
  - `9911d77` feat(sync) — M9 Phase G-pair-2: relay /pair/* endpoints + KV channel
- **Tests (4-28 Night mode 9 종료 시점):**
  - api-vault-crypto: 15 (변동 없음)
  - api-vault-app lib: 168 (변동 없음 — Night mode 9 은 relay 만)
  - Frontend Vitest: 416 (변동 없음)
  - Relay vitest: **67 passed** (이전 54 + 13 pair endpoints 회귀)
- **이번 Night mode 9 의 Miniflare 진단**:
  - workerd 의 fallback service 가 `ConnectEx #1225 원격 컴퓨터가 네트워크 연결을 거부` — Windows 시스템 레벨 문제 (방화벽 / VPN / port 충돌 추정)
  - 해결: 다음 night mode 에서 환경 복구 후 G-pair-2.5 의 poll 응답 확장 (joiner_pub_b64 + payload_ciphertext_b64 동시 노출) 회귀 검증 + G-pair-3 client services 진입.
- **이전 Night mode 8 체크포인트는 본 파일 아래 섹션 참조.**

---

## Previous checkpoint (2026-04-28 Night mode 8)

- **Time:** 2026-04-28 Night mode 8 (자율 모드 — F-2 / F-3 / G-pair-1 연속 완료, 자동 진행으로 다음 sub-phase 큐로 무중단 이동)
- **Phase:** Phase 3 — Implementation, M9 🔄 (Phase A+B+C+D+E+**F 풀**+**G-pair-1** 종료, 19/22 sub-phases). M9 의 잔여: G-pair-2 (relay endpoint) / G-pair-3 (client service) / G-pair-4 (UI) / G-conflict / G-offline / G-entitlement.
- **이번 Night mode 8 신규 commits (3개):**
  - `833081e` feat(sync) — M9 Phase F-2: value_sync service + Tauri 커맨드 (chacha20poly1305 + AEAD adapter + sync_value_push/pull)
  - `924d321` feat(sync) — M9 Phase F-3: credential mutating → 자동 value push (best-effort)
  - `83bff31` feat(crypto) — M9 Phase G T092-pair-1: X25519 ECDH (pairing primitive)
- **Tests (4-28 Night mode 8 종료 시점):**
  - api-vault-crypto: **15 passed** (이전 0 — aead 9 + pairing 6 신규)
  - api-vault-app lib: **168 passed** (이전 162, value_sync +6)
  - Frontend Vitest: 416 (변동 없음 — Night mode 8 은 Rust 만)
  - Relay vitest: 54 (변동 없음)
  - clippy / typecheck 모두 0
- **이전 Night mode 7 체크포인트는 본 파일 아래 섹션 참조.**

---

## Previous checkpoint (2026-04-28 Night mode 7)

- **Time:** 2026-04-28 Night mode 7 (E-4b / E-5 / F-1 3건 연속 완료, 다음 세션은 M9 Phase F-2 부터)
- **Phase:** Phase 3 — Implementation, M4~M8 ✅ + M9 🔄 Phase A+B+C+D 풀+**E 풀**+**F-1** 종료 (16/19 sub-phases) + M15 🔄, 111/132 태스크 (84.1%)
- **이번 Night mode 7 신규 commits (3개):**
  - `113065c` feat(sync) — M9 Phase E-4b: SyncProvider 가 RelayTransport 자동 생성 (auth_get_access_token + sync_get_relay_url)
  - `61a1db3` feat(sync) — M9 Phase E-5: 통합 round-trip (A push → mock relay → B pull)
  - `6d47f94` feat(sync) — M9 Phase F-1: value sync 채널 (D1 0004 + /sync/values endpoints)
- **Tests (4-28 Night mode 7 종료 시점):**
  - Rust api-vault-app lib: **162 passed** (이전 158 + 4: auth_get_access_token 3 + sync_get_relay_url 1)
  - Frontend Vitest: **416 passed** (이전 409 + 7: SyncProvider default-transport +2 + round-trip +5)
  - Relay vitest: **54 passed** (이전 46 + 8: db schema 1 + sync values 7)
  - clippy 0 -D warnings / typecheck 0 / lint 0 errors
- **이번 Night mode 7 처리 완료:**
  1. ✅ **E-4b** — auth_get_access_token + sync_get_relay_url 신규 Tauri 커맨드 + lib.rs 등록 + RelayTransport baseUrl trailing-slash normalize + SyncProvider 가 providedTransport 미공급 시 invoke 3건 fan-out 후 RelayTransport 자동 생성. auth_status null user_id 시 offline_only 폴백.
  2. ✅ **E-5** — 통합 round-trip 회귀. MockRelay (in-memory Map) + 두 RelayTransport + 두 Y.Doc. A.set + push → B.poll → applyUpdate → state 동일. Zero-Knowledge 검증 (raw envelope 평문 누출 0). M9 Phase E 풀 완료.
  3. ✅ **F-1** — encrypted_secret_value 테이블 (per-credential LWW) + Drizzle schema + POST /sync/values + GET /sync/values?since=<ms> + Miniflare 회귀 7. 64KB cap.

- **다음 Night mode 8 큐:**
  1. **F-2** — 클라이언트 services (Rust): `value-root` HKDF subkey of enc_key + `services/value_sync.rs` (push: AEAD encrypt + invoke /sync/values, poll: invoke + decrypt + age vault upsert). 신규 Tauri 커맨드 sync_value_push / sync_value_pull.
  2. **F-3** — 통합: credential_create / _update / _rotate_value 가 value 변경 후 sync_value_push 자동 호출 (sync 활성 시). credential_get 이 latest pulled value 사용. 회귀 — Rust + Miniflare round-trip.
  3. **Phase G** — pairing (X25519 deep-link) + UI (Sync section) + conflict resolver + offline 배지 + Free 2 device entitlement (T092~T096)

- **이전 Night mode 6 체크포인트는 본 파일 아래 섹션 참조.**

---

## Night mode 7 detail entry

상세 처리 이력 + 테스트 카운트는 `docs/work-log.md` 의 "2026-04-28 Night mode 7" 섹션 참조.

---

## Previous checkpoint (2026-04-28 Night mode 6)

- **Time:** 2026-04-28 Night mode 6 (E-2 / E-3 / E-4a 3건 연속 완료, 다음 세션은 M9 Phase E-4b 부터)
- **Phase:** Phase 3 — Implementation, M4~M8 ✅ + M9 🔄 Phase A+B+C+**D 풀**+**E-1~E-4a** 종료 (13/16 sub-phases) + M15 🔄, 111/132 태스크 (84.1%)
- **이번 Night mode 6 신규 commits (3개):**
  - `af307c5` feat(sync) — M9 Phase E-2: D1 0003_sync + /sync/snapshot 골격
  - `97712e6` feat(sync) — M9 Phase E-3: KV rate limit + Miniflare 회귀 +10
  - `155c1a4` feat(sync) — M9 Phase E-4a: RelayTransport (AEAD + HTTP wire) 골격
- **Tests (4-28 Night mode 6 종료 시점):**
  - Rust api-vault-app lib: **158 passed** (변동 없음 — Night mode 6 은 frontend + relay 만)
  - Frontend Vitest: **409 passed** (이전 396 + 13 RelayTransport)
  - relay vitest: **46 passed** (이전 35 + 1 schema D-2 + 10 sync E-3 = 46)
  - clippy 0 -D warnings / typecheck 0 / lint 0 errors
- **이번 Night mode 6 처리 완료:**
  1. ✅ **E-2** — relay D1 0003_sync.sql (encrypted_doc 테이블 + cascade FK) + Drizzle schema + routes/sync.ts 골격 (GET/POST /sync/snapshot, JWT 검증, UPSERT version+1, 1MB cap). +1 schema 회귀
  2. ✅ **E-3** — lib/rate-limit.ts (KV fixed-window per-user 100req/min) + sync.ts hookup + 429 + Retry-After. +10 Miniflare 회귀 (auth/validation/round-trip/rate limit)
  3. ✅ **E-4a** — src/features/sync/relay-transport.ts (RelayTransport class). pushUpdate (encrypt + POST), pollOnce (GET + decrypt + emit), AAD = "user:<userId>" 로 cross-user replay 차단. manualPolling 옵션. +13 회귀 (mock fetch)

- **다음 Night mode 7 큐:**
  1. **E-4b** — SyncProvider 의 transport prop 을 RelayTransport 로 default 교체 + 인증 컨텍스트 연결 (relay url + getAccessToken from auth_session + getSessionKey from sync_get_root_key). App.tsx 마운트 결정.
  2. **E-5** — 통합 round-trip 검증: db:changed → applyDbChangeToYMap → user-edit observer → encodeUpdate → encrypt → POST → 다른 디바이스의 GET → decrypt → applyUpdate. 두 SyncProvider 인스턴스로 시뮬레이션.
  3. **Phase F** — value sync 채널 (encrypted_secret_values 테이블 + value-root key derive + value-only 채널)
  4. **Phase G** — pairing + UI + conflict + offline + entitlement (T092~T096)

- **이전 Night mode 5 체크포인트는 본 파일 아래 섹션 참조.**

---

## Night mode 6 detail entry

상세 처리 이력 + 테스트 카운트는 `docs/work-log.md` 의 "2026-04-28 Night mode 6" 섹션 참조.

---

## Previous checkpoint (2026-04-28 Night mode 5)

- **Time:** 2026-04-28 Night mode 5 (D-2a / D-2b / D-3 / E-1 4건 연속 완료, 다음 세션은 M9 Phase E-2 부터)
- **Phase:** Phase 3 — Implementation, M4~M8 ✅ + M9 🔄 Phase A+B+C+**D 풀**+**E-1** 종료 (10/16 sub-phases) + M15 🔄, 111/132 태스크 (84.1%)
- **이번 Night mode 5 신규 commits (4개):**
  - `7ca9a06` feat(sync) — M9 Phase D-2a: 5 엔티티 매퍼 + ENTITY_MAPPERS registry
  - `cfc1472` feat(sync) — M9 Phase D-2b: db:changed emit 통합 + 14 커맨드 hookup
  - `10bdb92` feat(sync) — M9 Phase D-3: origin loop 회귀 + observer/bridge
  - `6d3b6aa` feat(sync) — M9 Phase E-1: AEAD adapter (XChaCha20-Poly1305)
- **Tests (4-28 Night mode 5 종료 시점):**
  - Rust api-vault-app lib: **158 passed** (이전 153 + 5 sync_emit unit)
  - Frontend Vitest: **396 passed** (이전 363 + 33 — D-2a +13, D-3 +10, E-1 +10)
  - relay vitest 35 / clippy 0 -D warnings / typecheck 0
- **이번 Night mode 5 처리 완료:**
  1. ✅ **D-2a** — 5 추가 엔티티 매퍼 (issuer/project/deployment/usage/settings) + `ENTITY_MAPPERS` registry. project.local_path 는 device-local. settings 는 SYNC_SETTING_KEYS 화이트리스트 (명시 opt-in 정책).
  2. ✅ **D-2b** — `services/sync_emit.rs` (DbChangeEntity 6 + DbChangeOp + DbChangeEmitter trait + Tauri prod / Noop test). AppContext.db_change_emitter 필드 + AppContext::new 시그니처에 emitter 추가. lib.rs setup 에서 prod emitter 주입. 14 mutating 커맨드 hookup (credential 4 / kill_switch revoke / settings / project 3 / deployment 3 / usage 2). issuer 는 사용자 mutation 명령 없어 미부착.
  3. ✅ **D-3** — `src/features/sync/observer.ts`. observeMapWithOriginGuard (sync origin LOCAL_DB/REMOTE 변경은 callback skip — user-edit 채널만) + applyDbChangeToYMap (db:changed → Y.Map.set/delete with ORIGIN_LOCAL_DB). settings 화이트리스트 적용. 무한 루프 방지 검증.
  4. ✅ **E-1** — `src/features/sync/aead.ts`. @noble/ciphers v2.2.0 의 XChaCha20-Poly1305. 32B key + 24B random nonce + AAD 옵션. encrypt/decrypt round-trip + tamper / mismatch 검증.

- **다음 Night mode 6 큐:**
  1. **E-2** — relay D1 migration 0003_sync.sql (`encrypted_docs` 테이블) + 첫 endpoint 골격
  2. **E-3** — relay /sync/snapshot POST + /sync/deltas GET + JWT 보호 + KV rate limit + Miniflare 회귀
  3. **E-4** — RelayTransport (Phase C 의 StubTransport 자리 채우기 — AEAD + HTTP wire) + SyncProvider wire (App.tsx 마운트는 E-5 후)
  4. **E-5** — 통합 round-trip 검증 (db:changed → Y.Map → encrypt → push → relay → onRemoteUpdate → Y.applyUpdate)
  5. **Phase F** — value sync 채널 (encrypted_secret_values)
  6. **Phase G** — pairing + UI + conflict + offline + entitlement (T092~T096)

- **이전 Night mode 4 체크포인트는 본 파일 아래 섹션 참조.**

---

## Night mode 5 detail entry

상세 처리 이력 + 테스트 카운트는 `docs/work-log.md` 의 "2026-04-28 Night mode 5" 섹션 참조.

---

## Previous checkpoint (2026-04-28 Night mode 3)

- **Time:** 2026-04-28 Night mode 3 (T084 + I3 + Playwright + M9 Phase A + B-1 5건 연속 완료, 다음 세션은 M9 Phase B-2 부터)
- **Phase:** Phase 3 — Implementation, **M4~M8 ✅ + M5 10/10 ✅ + M8 8/8 ✅ + M9 🔄 Phase A+B-1 / 7 phases (Phase B 4 sub-phase 분할) + M15 🔄**, 110/132 태스크 (83.3%) + 결함 후속 처리 누적 (4-26 H1~H5 5건 + 4-27 I4/I5 2건 + I1/I2 2건 ✅, **4-28 I3 ✅ listener 표준화 + Playwright E2E 인프라 ✅ + M9 Phase Plan ✅ + 5건 결정 ✅ + Phase B-1 ✅** + J2 ✅ + J1 docs ✅)
- **이번 Night mode 3 신규 commits (10개):**
  - `d619566` feat(auth) — T084 SignIn UI + deep-link callback (M8 8/8 ✅)
  - `22a05ed` docs — T084 커밋 해시 매핑
  - `340e72c` fix(github) — I3 deep-link listener 표준화 (apivault://github/callback)
  - `8672555` test(e2e) — Playwright browser-mode smoke 인프라
  - `40e630b` feat(sync) — M9 Phase A: Yjs 스캐폴드 + 7-phase plan
  - `bcecdab` docs — T087-A 커밋 해시 매핑
  - `0593cc7` docs — M9 Open Issues 5건 사용자 결정 + Phased Expansion
  - `ead6834` feat(sync) — M9 Phase B-1: AuthSession enc_key 라이프사이클 토대
  - `fe3f522` feat(sync) — M9 Phase B-2: verify 흐름에 derive 통합
  - `dcc01e2` feat(sync) — M9 Phase B-3: sync_get_root_key 커맨드 (Phase B 종료)
- **Tests (4-28 Night mode 3 종료 시점):**
  - Rust api-vault-app lib: **152 passed** (이전 136 + 16 — Phase B-1 +5, B-2 +6, B-3 +5)
  - Frontend Vitest: **346 passed** (이전 315 + 31 — T084 +19, I3 +8, Phase A +4)
  - Playwright smoke: **3/3** 통과 (LockScreen / 라우팅 / SignInPage)
  - relay vitest 35 / Rust crypto 5 / storage 39 / 전체 워크스페이스 모두 그린
  - clippy --workspace --all-targets --all-features -D warnings: **0 에러**
  - typecheck: 0 에러
- **Blocker:** pre-existing clippy warnings (Rust 1.95 새 lint) — 이번 hotfix 와 무관, 후속 정리 큐
- **Mode:** Interactive manual verification — 라운드 A → B → C 단계별 사용자 실행, 결함 발견 시 즉시 진단 → hotfix → 재검증.
- **Verification 통과 (10/10 + C2 deferred):**
  1. **A1** 마이그레이션 0004 자동 적용 (DB 검사: `_sqlx_migrations(4)` + `idx_incident_match_unique` 존재)
  2. **A2** H1 멱등성 — 같은 (incident, credential) 27회 → 1회
  3. **A3** H2 — Audit Subject `vault:default` 정상 표기
  4. **A4** H4 — Drawer 상단 Revoke outline-destructive (빨간 border + 빨간 텍스트)
  5. **B1** H3 — RAILGUARD Apply (`Overwrite { backup: true }`) 4 파일 디스크 생성
  6. **C1** Pro 모의 활성화 (Developer Tools)
  7. **C2** GitHub Connect 풀 플로우 — **deferred (I3 의존, M8 후)**
  8. **C3** Pro + Connected 시뮬 (devtools dynamic import) → Scan 버튼 자물쇠 없이 활성
  9. **C4** H5 Single Revoke — IPC 통과 + DB status='revoked' + audit chain 정상 (I4 화이트 스크린은 같은 라운드 안에서 hotfix 후 재검증)
  10. **C5** H5 Bulk Revoke — progress 1/2 → 2/2 + 화면 정상 (I5 ExpectedCountMismatch 도 같은 라운드 안에서 hotfix 후 재검증)
- **새로 발견된 결함 5건:**
  - **I4** P0 ✅ — Single/Bulk Revoke 후 화이트 스크린 (Radix compose-refs 무한 setRef)
  - **I5** P0 ✅ — Bulk Revoke `ExpectedCountMismatch` (Rust filter 에 status 누락)
  - **I1** P3 backlog — Subscription 헤더 "Current plan" 라벨 ↔ Pro 뱃지 인접 배치
  - **I2** P2 backlog — Pro 활성 시에도 disabled "Upgrade to Pro" 버튼 노출
  - **I3** Architectural backlog — GitHub Connect 풀 플로우 4 사전 조건 (App 등록 / deep-link scheme / listener 표준화 / M8 Auth user JWT)
- **이번 Night mode 처리 완료:**
  1. ✅ **I1/I2 hotfix** — `fea5562` (Subscription 헤더 "Current plan" 그룹 + Pro 시 Upgrade 버튼 숨김 + 회귀 3)
  2. ✅ **Rust 1.95 clippy lint 14건** — `a6b0a94` (cloned_ref_to_slice_refs 9 + io_other_error 1 + unused 2; -D warnings 통과)
  3. ✅ **T080 D1 auth schema** — `6929c91` (0002_auth.sql + Drizzle schema 동기화 + readD1Migrations + db.test.ts 4)
  4. ✅ **T081 Passkey 4 엔드포인트 + JWT** — `c60e023` (HS256 access 1h / refresh 30d, KV challenge 5분 consume-once, salt base64url 응답)
  5. ✅ **T082 OAuth 2.0 (GitHub + Google)** — `11eeeea` (start/callback + provider_id UNIQUE 매핑 + email-private 폴백 + 9 회귀)
  6. ✅ **KDF salt 시그니처 일반화** — `d3a345f` (`&[u8; 16]` → `&[u8]`, M8 32바이트 salt 호환, 기존 호출자 자동 coerce)
  7. ✅ **T086 /auth/refresh** — `03a0480` (refresh token rotation, leak window 30일 제한, 4 회귀)

  - 릴레이 vitest 35/35 / Rust crypto 5/5 / storage 39/39 / clippy -D warnings 0 / typecheck 0 / Vitest (frontend) 315/315.

- **이번 세션 처리 완료 (M8 백엔드 8/8):**
  1. ✅ T083 Phase A — services 골격 (`1ec7a15`)
  2. ✅ T083 Phase B — Passkey 4 커맨드 (`2f17917`)
  3. ✅ T083 Phase C — OAuth + deep link (`e159415`)
  4. ✅ T083 Phase D — refresh/signout/status + hydrate (`7df5888`)
  5. ✅ docs — Phase E 갱신 (`a63133c`)
  6. ✅ J2 hotfix — register/assert start vault 가드 (`5a556d4`)
  7. ✅ docs — J1 + 검증 종합 기록 (`f7b6c9e`)
  8. ✅ T085 — Zero-Knowledge KDF (`17da027`)

- **이번 Night mode 3 처리 완료:**
  1. ✅ **T084** — `/auth/sign-in` 풀 페이지 + PasskeyButton (assert→register fallback 단일 버튼 UX) + OAuthButton (github/google) + deep-link `apivault://auth/callback` listener + Settings CloudSyncSection 진입점 + `@simplewebauthn/browser` dep + i18n 4 로케일 + Vitest +19. M8 마지막 1건 클로즈, **M8 8/8 ✅ 풀 완료**.
  2. ✅ **I3** — `useGithubIntegration` 의 deep-link listener 표준화. `deep-link://github-callback` (lib.rs 가 emit 안 함, dead path) → `deep-link` 이벤트 + `apivault://github/callback` URL prefix 매칭. `parseGithubCallbackUrl` 헬퍼 + Vitest +8 + Setup URL 운영 가이드 강화. 4 사전 조건 모두 ✅, 풀 플로우 unblocked (실 GitHub App 등록 + 릴레이 배포는 사용자 액션 필요).
  3. ✅ **Playwright browser-mode E2E** — `e2e/` 디렉토리, `tauri-mock.ts` invoke polyfill, smoke 3 case (LockScreen / 라우팅 / SignInPage). CI `e2e` 잡 + frontend 잡에 Vitest 통합 (이전 누락). Desktop binary E2E (tauri-driver) 는 deferred — 진입 트리거 3가지 명시 (Sync 회귀 누적 / M11 / M13).
  4. ✅ **M9 Phase Plan + T087 Phase A** — 10 태스크를 7-phase 로 분할 (`docs/m9-phase-plan.md`), Phase A 만 안전 실행 (yjs + y-indexeddb dep, 더미 SyncProvider, Vitest +4). App.tsx 마운트 보류, Phase B 의 enc_key 라이프사이클 작업이 준비된 후 마운트.
  5. ✅ **5건 사용자 결정 + Phased Expansion** — Free 종류 무관 2대 / Auto-derive on unlock / SQLite 화이트리스트 / SecSync 잠정 (Phase C 검증) / MVP API 특화 + v1.1 General Secrets + v1.2 자동입력. project-decisions.md 5건 기록 + m9-phase-plan.md Open Issues Resolved 갱신.
  6. ✅ **M9 Phase B-1** — AuthSession 에 `salt_auth`/`salt_enc`/`enc_key` 필드 + Debug 마스킹 + save/load_session 확장 (enc_key 영속 금지) + AppContext.master_passphrase 라이프사이클 (vault_unlock 시 채움 / vault_lock 시 zeroize) + 7 테스트 컨텍스트 갱신 + Rust lib 회귀 136 → 141 (+5).
  7. ✅ **M9 Phase B-2** — complete_session 시그니처에 new_salts 추가 + verify 4 커맨드 시그니처에 salt_auth/salt_enc 추가 + hydrate_session_from_vault 가 vault_unlock 직후 자동 derive + PasskeyButton 이 verify 호출 시 salts 송신. Rust lib 141 → **147 (+6)**, Vitest 346 유지 (+1 expect).
  8. ✅ **M9 Phase B-3** — commands/sync.rs 신설, sync_get_root_key 커맨드 (derive_subkey enc_key "crdt-root" → base64url 32바이트), NoSyncSession 에러. lib.rs handler 등록. Rust lib 147 → **152 (+5)**. **Phase B 종료** (B-4 OAuth는 옵션, Phase C 와 병행 가능).

- **다음 Night mode 큐:**
  1. **Phase C** — SecSync stable 5개 체크리스트 검증 → 채택 (또는 fallback D: Yjs + 자체 transport) → SyncProvider 에 SecSync 통합
  2. **B-4 (옵션, Phase C 와 병행)** — OAuth callback 응답에 salts 포함 (relay 측 변경)
  3. **Phase D~G** — `docs/m9-phase-plan.md` 순차 실행

- **T084 의 deferred 항목 (M9 진입 시점에 처리):**
  - 성공 후 redirect 경로를 `/settings/sync` 로 변경 (현재 `/settings`)
  - `derive_session_keys` 호출 통합 — verify 응답의 salt 로 enc_key 파생 → vault 저장 (M9 sync 가 활성화될 때)

---

## 2026-04-28 Night mode 4 — Phase C + B-4 + D-1 (3 commits)

### 세션 정보

- **시작점:** Night mode 3 종료 시점 (M9 Phase B 완료, 다음 큐 = Phase C / B-4 / D~G).
- **종료 시점:** Phase C / B-4 / Phase D-1 완료. 다음 큐 = D-2 / D-3 / E / F / G.
- **신규 commits (3개):**
  - `b550575` feat(sync) — M9 Phase C: fallback D 채택, transport stub + sync boot 통합
  - `4f6ced0` feat(sync) — M9 Phase B-4: OAuth callback salts → AuthSession derive
  - `2ba0069` feat(sync) — M9 Phase D-1: mapping framework + origin marker

### Phase C — secsync stable 검증 → fallback D 자동 채택

- **검증 결과 3 fail / 5**:
  1. ❌ npm publish `0.5.0` (2024-06-04, 22개월 정지)
  2. ⚠️ Yjs 13.6.x 호환 추정 (검증 미실행)
  3. ⚠️ React 19 + TS 5.x 추정 호환
  4. ✅ 보안 advisory 없음 (NLnet 펀딩)
  5. ❌ WS 전용 transport, CF Workers 통합 사례 0건, "WARNING: This is beta software."
- 사용자 결정 4 (≥3 fail 시 fallback D) 사전 승인에 따라 **secsync 미설치, fallback D 자동 채택**.
- `src/features/sync/transport.ts` — `SyncTransport` interface + `StubTransport` (Phase E 의 RelayTransport 도입 전 placeholder).
- `SyncProvider` 확장 — `sync_get_root_key` invoke + rootKey context 노출 + `NoSyncSession` → `status='offline_only'` + unmount 시 `transport.disconnect()` 자동.
- 신규 dep 0개. Vitest +10 (Phase A 4 + Phase C 4 + transport 6).
- project-decisions.md D.1 갱신, m9-phase-plan.md Phase C 정정.

### Phase B-4 — OAuth callback salts → AuthSession derive

- T082 시점에 relay 응답은 이미 salts 포함, 클라이언트가 ignore 하던 dead path 정리.
- `OAuthCallbackResponse` (services/session.rs) — `#[serde(flatten)] tokens` + `salt_auth` + `salt_enc`.
- `exchange_oauth_callback` 가 응답의 salts 를 `complete_session(.., Some(...))` 로 forward → Passkey verify 와 동일 흐름.
- Rust lib 152 → **153 (+1)**. clippy 0 warning.
- 회귀 갱신 1 (`_persists_session_and_records_salts`) + 신규 1 (`_with_passphrase_derives_enc_key`).

### Phase D-1 — mapping framework

Phase D 를 sub-phase 로 분할 (D 전체 = 백엔드 emit hookup + 6 엔티티 매퍼 + origin loop 회귀 → 단일 commit 으로 무리).

- **D-1 (이번 commit)** — framework only.
- **D-2 (다음 큐)** — 백엔드 db:changed emit + 나머지 5 엔티티 매퍼 (issuer / project / deployment / usage / settings).
- **D-3 (다음 큐)** — origin loop 회귀 (Y.Map → SQLite → Y.Map 무한 루프 방지 검증).

D-1 산출물:
- `src/features/sync/origin.ts` — `ORIGIN_LOCAL_DB` / `ORIGIN_REMOTE` Symbol + `runWithOrigin` / `isSyncOrigin` 헬퍼.
- `src/features/sync/mapping.ts` — `SYNC_ENTITIES` 화이트리스트 6 + `EntityMapper<TRow, TYValue>` interface + 첫 reference `credentialMapper` (vault_ref / hash_hint / usages / score 4개 device-local 필드 제외).
- 회귀 +7 (Vitest 363 / 전체 49 파일).

### Tests (4-28 Night mode 4 종료 시점)

- Rust api-vault-app lib: **153 passed** (이전 152 + 1 — B-4 +1)
- Frontend Vitest: **363 passed** (이전 346 + 17 — Phase C +10, D-1 +7)
- relay vitest 35 / Rust crypto 5 / storage 39 / 전체 워크스페이스 모두 그린
- clippy --workspace --all-targets --all-features -D warnings: **0 에러**
- typecheck: 0 에러

### 다음 Night mode 5 큐

1. **D-2** — 백엔드 db:changed emit hookup (15+ mutating 커맨드) + 나머지 5 엔티티 매퍼 (issuer / project / deployment / usage / settings)
2. **D-3** — origin loop 회귀 (Y.Map ↔ SQLite 무한 루프 방지 검증, Vitest +12 target)
3. **Phase E** — relay `/sync` 엔드포인트 + AEAD 라이브러리 결정 (`@noble/ciphers` 의 XChaCha20-Poly1305 후보) + RelayTransport 구현 + D1 migration 0003_sync.sql
4. **Phase F** — value sync 채널 (`encrypted_secret_values` + `value-root` 키 derive)
5. **Phase G** — pairing + UI + conflict resolver + offline + entitlement (T092~T096)

### Architectural seeds (Phase Plan 과 직교, ad-hoc commit 가능)

`m9-phase-plan.md` Open Issues E 에 명시된 4건:
1. `credential.kind` enum 확장 가능 (v1.1 General Secrets 진입 비용 ↓)
2. `issuer` → "Site" 명명 일반화 검토
3. HIBP password breach client prep (T052 패턴 재사용)
4. zxcvbn weak password detector (T024 LockScreen 패턴 재사용)

---

## 2026-04-26 수동 검증 라운드 + 5건 hotfix

세션 흐름: 사용자가 manual verification 을 요청 → step-by-step 9 단계 진행 (Relay /health → 앱 부팅 → 언락 → Incidents → Audit → RAILGUARD → GitHub Integration → Pro 토글 → Kill Switch). 단계마다 발견되는 결함을 큐(H1~H5)에 적어두고 검증 끝난 뒤 일괄 fix.

### Hotfix 상세

- **H1** `fix(matcher): b74d71d` — `IncidentRepo::insert_match` 가 plain INSERT 였던 탓에 매 `incident_feed_refresh` 마다 동일한 (incident, credential, reason) 행이 새 ULID 로 누적. 마이그레이션 0004 가 (1) 기존 dupe 를 dedup 하면서 dismissed_at 플래그를 surviving 행으로 propagate, (2) UNIQUE INDEX `idx_incident_match_unique` 생성. repo 함수는 INSERT OR IGNORE + 캐노니컬 id 반환으로 멱등화. 회귀 2 (same triple 3회 insert → 1행, 다른 reason → 2행 공존).
- **H2** `fix(audit): c2d45f9` — `resolveSubjectLabel` 의 `subjectId.slice(-6)` 이 ULID(26자) 만 가정. `state.user_id="default"` (7자) 에 적용되며 `"efault"` 가 잘려나옴. ULID 패턴 정규식 (`/^[0-9A-HJKMNP-TV-Z]{26}$/i`) 체크 후만 truncate. 회귀 7 (literal verbatim, ULID 마지막 6, 25/27 경계, name lookup hit).
- **H3** `fix(ipc): 19afd3d` (H5 와 묶음) — `railguard_apply` 의 `mode` 인자를 FE 가 `Vec<{tag, kind, ...}>` 로 보내는데 Rust 는 단일 `ApplyMode` 기대. `tag` 필드는 의미 없음 (apply_rules 는 룰 전체에 단일 mode 사용). FE `ApplyMode` 타입 재정의 + `apply()` 단일 객체 송신. RailguardPage 테스트의 array-shape 기대값도 정정. 회귀 4 (3 variant + array 거부).
- **H4** `fix(inventory): f350cad` — Drawer 상단 Revoke (`variant="outline"` neutral) 와 INCIDENTS 의 Revoke (`variant="destructive"` filled) 가 같은 `handleRevokeRequested` 를 부르지만 시각적으로 다른 액션처럼 보임. 상단을 outline-destructive (border-red + text-red) 로 정렬하여 파괴성을 표현하되 INCIDENTS 의 filled CTA 와 위계 분리.
- **H5** `fix(ipc): 19afd3d` — `KillSwitchRevokeInput` 필드가 `cred_id` (snake_case) 인데 FE 가 `credId` (camelCase) 송신. Tauri 의 자동 case 변환은 top-level 인자에만 적용, nested struct 필드에는 안 됨. Rust struct 에 `#[serde(rename_all = "camelCase")]` 부착 (Issuer 변형 동일). 회귀 2 (camelCase JSON deserialize 검증).

### 핵심 인사이트

- **자동 테스트의 빈 영역 = IPC 계약**. Rust unit 305+ / Vitest 305 모두 그린이었지만 H3/H5 같은 FE↔Rust 와이어 미스매치는 단위 테스트가 잡지 못했다. 이번 라운드에서 **wire-format regression 패턴** 도입 (kill_switch + railguard + use-subject-labels): 임의 JSON shape 을 직접 deserialize 해 와이어 호환을 고정.
- **마이그레이션은 누적 결함의 cleanup 도 책임진다.** 0004 는 단순히 UNIQUE INDEX 만 추가하지 않고 dismissed_at 의 의미를 보존하면서 dupe 를 제거. 사용자 앱 재기동 시 이전 누적 27행이 자동 정리됨.
- **두 진입점이 같은 핸들러를 부르더라도 시각적 위계가 다르면 사용자가 다른 액션으로 인지한다.** outline-destructive vs filled-destructive 분리로 위계 정리.

---

## M5 완료 + M15 진입 (2026-04-26 Night mode 2)

### 세션 개요

- T061~T064 완성 (Relay + GitHub Secret Scanning + UI + Entitlement)
- M5 10/10 ✅ 마크
- M14/M15/M16/M17 신설 (총 4 신 마일스톤, 132 태스크)
- Pro 가격 $1/월로 인하
- api-vault.app 도메인 확정
- Relay 로컬 가동 검증 (/health → 200 OK)
- M15 T132+T133 즉시 진입 (CI/CD)
- 백로그 hotfix 5건 (XSS / list locked / i18n / docstring / eslint)

### M5 마무리

**T061 Cloudflare Workers Relay**
- wrangler.toml 스캐폴드 + account_id/database_id 채움
- 로컬 개발 서버 동작 검증 (`curl /health → 200 OK`)
- D1/KV 생성 가이드 제공

**T062 GitHub Secret Scanning**
- `GitHubSecretScanner` trait
- Relay `/github/scan-secrets` endpoint
- Tauri 커맨드 통합

**T063 GitHub Connector UI**
- `GithubIntegrationSection` 컴포넌트
- Connect → installations → Scan (Pro gated)

**T064 Pro Entitlement**
- `Tier` enum (Free / Pro)
- `require_pro()` gate 함수
- Scan + Bulk Revoke Pro gated
- `entitlement_set_dev` (M10 before 테스트)

### M14 신설 — Auto Rotation (Phase R1~R4)

- R1: AWS IAM Full rotation
- R2: Stripe/GCP/Azure Full rotation
- R3: Manual + Provider intelligence
- R4: Schedule + Health monitoring
- M5 이후 M9 Sync 완료 후 진입 예정

### M15 CI/CD Integration (🔄 진입)

- T126: GitHub Actions Secrets API
- T127: sync 커맨드
- T128: Sync UI
- T129: Sync over relay (e2ee)
- T130: Offline queue + retry
- T131: Conflict resolution UI
- T132: **deploy-relay.yml** (완료)
- T133: **ci.yml ee-relay** (완료)

### M16/M17 Placeholder

- M16: Anonymous Telemetry (M9 후)
- M17: SDK Ecosystem (M5+M9 후)

---

## M4~M7 Complete (2026-04-25 Night mode 1 종료)

### M4 Incident Feed — 10/10 ✅

- T049~T055: Feeds (NVD/GHSA/RSS/HIBP) + Matcher + Scheduler
- T056~T058: UI (Incidents page / Credential section / NVD settings)
- Vitest 288 총누계

### M5 GitHub Connector + RAILGUARD — 6/10 + 4/10 (T061~T064 추가 후 10/10)

**Phase 1 (완료 6/10):**
- T059: Connector trait
- T060: GitHub skeleton
- T065: RAILGUARD templates
- T066: preview/apply
- T067: RAILGUARD UI
- T068: auto-suggestion

**Phase 2 (완료 4/10 → M5 10/10):**
- T061: Workers relay
- T062: GitHub Secret Scanning
- T063: GitHub Connector UI
- T064: Pro entitlement

### M6 Audit Log — 6/6 ✅

- T069~T074: AuditLog crate + Device ID + Hooks + Commands + UI + Credential section
- Hash chain (SHA256-HMAC) + Ed25519 signatures

### M7 Kill Switch — 4/4 ✅

- T075~T078: Backend (2-step confirm + Issuer bulk)
- T076: Dialog flow
- T077: REVOKED badge + filter
- T078: Bulk revoke

---

## Historical Checkpoint (2026-04-24 PM — M3 Manual Verification)

### M3 수동 검증 결과

| # | 항목 | 결과 |
|:--|:----|:----|
| ① | `/graph` 렌더 + 4 노드 색 | ✅ Issuer/Credential/Deployment 확인 |
| ② | TB ↔ LR 토글 + 핸들 회전 | ✅ 정상 |
| ③ | Blast Radius (실선/점선 + Esc) | ✅ 전부 통과 |
| ④ | Settings "Allow dragging" | ✅ localStorage 영속 + 동작 반영 |
| ⑤ | 모바일 MobileGraphList | 🕒 M11 defer (OS 기반 viewport) |

### 발견 및 hotfix

**피드 스케줄러 panic** (커밋 `85f347a`)
- 증상: `panic: no reactor running` at `feed_scheduler.rs:172`
- 원인: `tauri::Builder::setup` 콜백은 tokio context 외부
- 수정: `block_on(async { spawn_feed_scheduler(...) })` 래핑
- 교훈: Tauri `setup` 내 모든 tokio spawn 은 `block_on` 필수

---

## Workflow Phases

### Phase 1 — Planning (✅ 2026-03-01~2026-04-01)
- Vision + Architecture + Task decomposition (14 마일스톤, 118 태스크)
- Database schema migration 0001 (vault + settings)

### Phase 2 — Foundation (✅ 2026-04-01~2026-04-15)
- M1 Authentication skeleton
- M2 Vault core (encrypt/decrypt, credential CRUD, project CRUD)
- M3 Graph + Blast radius
- 기본 Tauri IPC 패턴 확립

### Phase 3 — Implementation (🔄 2026-04-15~ | M4~M7 ✅, M5 10/10 ✅, M15 🔄 진입)
- **M4 ✅** Incident Feed (NVD/GHSA/RSS/HIBP + Matcher + UI)
- **M5 ✅** GitHub Connector + RAILGUARD (Relay + Secret Scanning + UI + Entitlement)
- **M6 ✅** Audit Log (Hash chain + Device ID + UI)
- **M7 ✅** Kill Switch (2-step revoke + Bulk)
- M8 Auth (Passkey + OAuth) — Relay 의존, 이제 가능
- M9 Sync (Yjs + SecSync) — M8 후 진입
- M10 Billing (Stripe) — M8 필요
- M11 Mobile (iOS/Android Tauri)
- M12 Web Viewer (read-only)
- M13 Documentation
- **M14** Auto Rotation (R1~R4, M9 후)
- **M15 🔄** CI/CD Integration (deploy-relay.yml + ee-relay)
- **M16** Anonymous Telemetry (M9 후)
- **M17** SDK Ecosystem (M5+M9 후)

### Phase 4 — Testing (awaiting)
- Manual verification (M4~M15)
- E2E tests (Playwright)
- Security audit (3rd party)

### Phase 5 — Launch (awaiting)
- Beta release (GitHub releases)
- Web relay deploy (Cloudflare Workers)
- Apple Developer + Play Console (M11 after)

---

## Key Technical Decisions (Phase 3)

### Storage & Cryptography
- SQLite local (Tauri plugin-sql)
- age (X25519 + ChaCha20-Poly1305)
- Hash chain (SHA256-HMAC) + Ed25519 for audit log

### Feed Polling
- NVD CVE 2.0 API (governor rate limit 5/50)
- GitHub Security Advisories (Link header pagination)
- 10 RSS status pages (Semaphore 4)
- HIBP v3 (404 = no breach)
- Breaker pattern (3 fail → 1h cooldown)

### Entitlement & Price
- Pro: $1/month, $10/year
- Team: $5/seat/month
- Local tier (Free) + Pro (relay features)
- `entitlement_set_dev` for testing

### Relay Architecture
- Cloudflare Workers (wrangler.toml)
- GitHub App: client (install_id + 1h token) / relay (private key)
- D1 + KV
- `/health` + `/github/scan-secrets` endpoints
- Deploy via `deploy-relay.yml`

### RAILGUARD Templates
- 4 AI editors (Cursor/Windsurf/Claude/Copilot)
- `{{VAR}}` substitution (no template engine)
- Atomic write (tmp + rename)
- Snapshot tests (invariants only)

### Audit Log
- Immutable append (hash chain)
- Device ID (UUID v4, first-boot save)
- Best-effort (warn-log on device_id absent, SQL error)
- Chain verify fresh on each call

### Kill Switch
- 2-step confirm (generate token + consume)
- TTL 5min, 256-bit random
- Issuer bulk (1-step, authorization level)
- Revoke status immutable (timestamp recorded)

### Connector Trait
- `async fn fetch_incidents(&Auth)`
- `Auth` enum (GitHubApp / Token / None)
- `Send + Sync` (Arc<dyn Connector>)
- MockConnector (testing feature)

---

## Testing Infrastructure

### Rust Tests
- Unit tests per module (~120 new in M4~M5)
- Wiremock fixtures (NVD/GHSA/RSS/HIBP)
- Snapshot tests (RAILGUARD invariants)
- `#[cfg(test)]` feature gates (MockConnector)

### Frontend Tests
- Vitest 305 total (pre-M4: 288, new: 17)
- Reactive hooks (use-inventory, use-incidents)
- Components (Graph, CredentialDetail, IncidentsList)
- Integration tests (Tauri commands)

### Type Checking
- `pnpm typecheck` 0 errors (pre-M4: 5, all resolved)
- Path aliases (@/*) via tsconfig + vite.config

### Linting
- `cargo clippy` clean
- `pnpm lint` 0 errors (6 pre-existing shadcn warnings)

---

## Known Limitations & Deferrals

1. **Mobile (M11)** — Deferred to after M9 (Sync foundation)
2. **Web Viewer (M12)** — Read-only, after M8 (Auth)
3. **Auto Rotation (M14)** — After M9 (Sync), requires provider APIs
4. **Telemetry (M16)** — Anonymous, after M9 (Sync)
5. **SDK (M17)** — After M5+M9 (features + sync)
6. **MobileGraphList (M3)** — OS-based viewport, deferred to M11 Vitest coverage

## Environment

- **Node**: 20+
- **Rust**: stable (rustup)
- **pnpm**: latest
- **Tauri**: v2
- **Database**: SQLite (tauri-plugin-sql)
- **Encryption**: age crate

## Deployment

- **Desktop**: Tauri build (Windows/macOS/Linux)
- **Mobile**: Tauri Android/iOS (M11)
- **Relay**: Cloudflare Workers (wrangler publish)
- **CI**: GitHub Actions (.github/workflows/)

---

## M23 Vault Charter — 마일스톤 클로즈 (2026-05-01)

### 회고

passphrase 분실 시 vault 영구 손실 = 출시 블로커. M23 으로 해소. 차별화 4 축 모두 구현:

1. **컨셉 "Vault Charter"** (1Password Emergency Kit 와 다른 봉인 헌장 메타포)
2. **Diceware 6 단어 + 4-digit verifier** — 한 단어 typo 즉시 감지 (1Password base32 는 못 함)
3. **Shamir 2-of-3 분할** — 가족/유산 시나리오. 1Password 가 못 하는 영역
4. **Audit log + 7일 cooldown** — 도난 + charter 동시 탈취 시 시간 벌기

### 기술 요약

- crate: `api-vault-charter` (EFF Diceware wordlist 7776 + sharks SSS + XChaCha20-Poly1305 envelope) + 31 unit
- vault 파일 포맷 v2 (charter envelope 슬롯, v1 backward compat) + 7 file 회귀
- AgeVaultStorage: initialize_with_charter / recover_with_charter + 14 통합 회귀
- Tauri 커맨드: vault_init_with_charter / vault_recovery_unlock / vault_has_charter / charter_cooldown_status / charter_cooldown_set_enabled / charter_cooldown_clear
- Frontend: CharterDisplay (Lapis 톤 인쇄용) + CreateVaultDialog 확장 + RecoveryDialog + LockScreen Forgot link + Settings 토글
- audit log: vault.charter.issued / vault.charter.recovered (cooldown 메타 포함)
- cooldown sidecar (`vault.age.cooldown.json`) — vault 잠긴 상태에서도 unlock 시점 검사 가능
- unlock 애니메이션 감속 fix (cubic-bezier ease-out [0.16, 1, 0.3, 1] / 1.4s)

### 누적 commit (12 코드 + 6 docs)

- 91ace0b feat(charter): M23-A codec crate
- c82b790 feat(storage): M23-B-1 vault format v2
- 24ce24a feat(storage): M23-B-2 initialize_with_charter
- 27802f0 feat(storage): M23-B-3 recover_with_charter
- 92531d0 feat(commands): M23-B-4 Tauri 커맨드 + audit
- 855cae0 feat(ui): M23-C 발급 UI + 인쇄 디자인
- 20d6752 feat(ui): M23-D Recovery flow UI
- ac1ef95 fix(ui): unlock 애니메이션 감속
- 4769248 feat(commands): M23-E-1 cooldown backend
- 1bf141e feat(ui): M23-E-2 cooldown frontend
- c475633 docs(milestone): M23 클로즈

### 출시까지 남은 작업

- **M13 i18n + Updater + Release** — 자동 업데이트 + GitHub Releases 자동화 (자율 진입 가능)
- **Windows 코드 서명** — EV cert 또는 SmartScreen 평판 빌드업 (사용자 결정 필요)
- **macOS notarization** — Apple Developer ($99/yr, 사용자 결정 필요)
- **데모 영상** — LockScreen 애니메이션 + Charter 발급 흐름 30초 영상
- **랜딩 페이지** (`site/`) — Lapis Vault 톤 적용 (이미 도메인 api-vault.app 보유)

다음 자율 lap 후보: M13 v1 (auto-updater 설정 + GitHub Releases workflow) — 코드 서명 없어도 작업 가능.

