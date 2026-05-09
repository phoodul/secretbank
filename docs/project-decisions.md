# Project Decisions

본 문서는 Secretbank 프로젝트의 확정된 핵심 결정 사항을 시간순으로 기록한다.
**내용은 근거 없이 변경하지 않는다.** 방향 전환이 발생하면 "갱신" 섹션을 추가하고 기존 결정의 상태를 명시한다.

---

## [2026-05-10] **M24-E B-9 / B-10 클로즈 + Audit 로드맵** — 옵션 C 채택 + NLNet 무료 audit 경로

### 사용자 통찰

> "수만~수십만 USD 라면 내가 감당할 수 없는 수준인데, 실제 사용자가 그렇게 많지 않은 상태에서도 그렇게 해야 하는 건가?"
> "년간 20USD 사용자가 적어도 1000명 정도는 있어야 audit 를 받을 수 있는 거 아냐? 그 시점까지는 어떻게 하지?"

### 핵심 결정

**B-9 외부 보안 audit**: **옵션 C 채택** (skip + Phase F 종합 audit 으로 통합)

- 2026-05-09 작성된 `docs/audit/m24e_phase_b_scope.md` 의 옵션 A 권고 → 옵션 C 로 갱신
- 이유: pre11 무료 베타 단계, ARR 0, 자가 부담 비합리
- Phase B 단독 audit 비용 ($15k~$30k Cure53 / $20k~$80k 종합) → 출시 직전 종합 audit 한 번에 통합

**B-10 3 OS 수동 검증**: **옵션 B 채택** (CI smoke + Win11 자동 ping/pong 으로 충분)

- macOS / Ubuntu 수동 검증 SKIP — `commit ef03358` 의 `future B-10.5` 표기 유지
- hotfix 발견 시점에 별도 sub-task 화 (사용자가 macOS / Linux 환경 갖추거나 외부 사용자 발견 시점)

### Audit 자가 부담 임계점 (사용자 직관 검증)

| 단계                        | 사용자          | ARR (연 $20)    | audit 가능성                                |
| :-------------------------- | :-------------- | :-------------- | :------------------------------------------ |
| 현재 (pre11)                | 0~10            | ~$0             | ❌                                          |
| 베타 종료                   | 100~500         | ~$2k~$10k       | ❌ — 운영비 미달                            |
| **임계점**                  | **1000~2000**   | **~$20k~$40k**  | ✅ **Cure53 Phase B 단독 ($15k~$30k) 가능** |
| 성숙기                      | 5000+           | ~$100k+         | ✅ Trail of Bits 종합 + bug bounty          |

### 1000 paid 도달 전 신뢰 구축 4가지 방법

1. **OSS 공개 자체가 audit 신호** (AGPL-3.0 셀링 포인트) — 1P/Bitwarden 과 차별점, KeePassXC/Bitwarden 도 자가 부담 audit 전 수년간 이 방법으로 사용자 모음
2. **무료 audit 펀딩 채널** — Secretbank 가 정확히 타깃:
   - **NLNet NGI Zero PET** ⭐ — €5k~€50k + Radically Open Security audit (사이클 6~12개월). **Phase F 직전 신청 = 정식 v1.0 시점에 결과**
   - **OTF Red Team Lab** — Cure53 / iSEC Partners 직접 audit ($0)
   - **Sovereign Tech Fund** (EU/DE OSS) / **GitHub Security Lab CodeQL** ($0) / **Mozilla MOSS/SOS** ($0~$10k)
3. **자기 검증 강화** — KAT (RFC 7748 X25519 / RFC 7539 ChaCha20-Poly1305) + `cargo-fuzz` + MIRI + `rustsec audit` + `cargo deny` + CodeQL/Semgrep. 외부 audit 의 70~80% 효과
4. **Responsible disclosure 채널** — HackerOne/Bugcrowd 채널만 운영 (bounty 없이, 비용 0). 1000 사용자 시점부터 소액 bounty ($50~$500)

### 권장 로드맵

```
지금~정식 v1.0:
  → 자기 검증 강화 (KAT + fuzzing + CodeQL/Semgrep)
  → THREAT_MODEL.md 풀공개 + SECURITY.md PGP/responsible disclosure (이미 존재)
  → Phase F 직전: NLNet NGI Zero PET 신청 (~12개월 cycle)

v1.0 ~ 1000 paid:
  → NLNet audit 결과 수령 → 사용자 신뢰 자료 활용

1000+ paid (ARR $20k+):
  → Cure53 Phase B 단독 audit 자가 부담 ($15k~$30k)
  → bug bounty 본격 시작

5000+ paid (ARR $100k+):
  → Trail of Bits 종합 audit
```

### 영향 범위

- **task_m24e.md** B-9 / B-10 — Status 갱신 (옵션 C / 옵션 B 확정)
- **docs/audit/m24e_phase_b_scope.md** — Status 박스 갱신 (scope → DECISION-옵션 C)
- **task.md** M24-E 진행 현황 표 — 누락 19개 sub-task + B-9/B-10 매핑 commit `ef03358` 추가
- **Phase F 진입 시 액션 추가**: NLNet 신청 (사용자 액션, 8~12개월 전 시작 필요)

---

## [2026-05-09] **M24-E Phase G 신설** — Secretbank 만의 차별화 기능 통합 (1P 의존성 제거)

### 사용자 통찰 (Phase B-8 진행 중 제기)

> "현재 만들고 있는 방식이 1password의 라이선스를 침해하지는 않는가? 분명 우리 프로그램이 단순히 dependency 이외에도 더 낫고 1password와 다른 방식이어야 해."

### 라이선스 안전성 검증

- **1Password 코드 복사 ❌** — 1P = closed-source. 우리는 코드 본 적 없음
- **Design pattern 합법** — Sega v. Accolade (1992) / Lotus v. Borland (1995) 판례. interface / behavior / design pattern 자체는 저작권 보호 ❌
- **Industry standard**: X25519 (RFC 7748) / ChaCha20-Poly1305 (RFC 7539) / HMAC-SHA256 (RFC 2104) / Native Messaging (Chrome/Firefox 공개 spec) — 1P 의 소유물 ❌
- **상표 침해 ❌** — 우리는 Secretbank + 자체 디자인
- **실제 reference**: KeePassXC-Browser (GPL OSS, AGPL-3.0 호환) 의 페어링 protocol 단순화. 1P 가 아닌 OSS 직접 인용
- **결론**: 법적으로 안전. 단, "1P 의존성 같다" 는 **인식상 차별점이 약함** = 진짜 문제

### 결정 — Phase G 신설 (G-1~G-5 모두 채택, 사용자 일괄 승인)

기존 Phase A~F (autofill / save / generator) 는 1P 동등 = 차별점 ❌. Phase G 에서 Secretbank 만의 차별 기능을 확장에 inline 통합.

|                sub-task                | 의미                                                                                                                                                 | 1P 보유? |
| :------------------------------------: | :--------------------------------------------------------------------------------------------------------------------------------------------------- | :------: |
|    **G-1 Inline 의존성 mini-graph**    | autofill 시 popup 에 "이 비번이 어떤 project / deployment 에 쓰이는지" 카드 hover graph (M3 의 graph 엔진 + M24 1.5 의 hover mini-graph 패턴 재사용) |    ❌    |
|      **G-2 Supply chain banner**       | 가입 사이트가 최근 NVD/GHSA alert 보유 시 in-page banner — "이 service 가 N일 전 breach 보고됨" (M5 incident feed + M20 supply chain risk 재사용)    |    ❌    |
| **G-3 Blast radius preview on revoke** | 확장에서 비번 변경 시 "이 변경이 어떤 dependency 영향" 미리보기 (M3 blast radius BFS 재사용)                                                         |    ❌    |
|        **G-4 MCP context push**        | 확장이 현재 사이트 정보 (URL + credential 메타) 를 데스크톱 MCP server 에 push → Claude / Cursor 즉시 활용 (M18 MCP server 재사용)                   |    ❌    |
|     **G-5 RAILGUARD 인라인 hint**      | AI 에디터 사이트 (chatgpt.com / cursor.com) sidebar 에 "AI 에 비번/키 입력 시 위험" 경고 (RAILGUARD 룰 재사용)                                       |    ❌    |

### 영향 범위

- **task_m24e.md** — Phase G sub-task 분해 (planner)
- **architecture.md** — Phase G 섹션 신설
- **implementation_plan_m24e.md** — Phase G 진입 시점 / 의존성 / 검증 절차
- **일정**: 기존 8주 (43 sub-tasks) → **약 11주 (50+ sub-tasks)**. ~3주 추가
- **Phase G 진입 시점**: Phase F-1 (Chrome+Firefox 우선 출시) 직전. 즉 A → B → C → D → E → **G** → F-1 → F-2

### Night mode 운용

- 결정 자체는 사용자 명시 응답 (AskUserQuestion 통한 Phase G 신설 채택)
- planner 호출 → GATE 2-bis (Phase G 구현 계획 승인) 1회 호출 후 implementator 자동 진행

### CLI / Android / iOS 비교 결과

| 항목     |                Secretbank                | 1Password | 비고                    |
| :------- | :--------------------------------------: | :-------: | :---------------------- |
| CLI      | ✅ M18 (`secretbank` + `secretbank-mcp`) |  ✅ `op`  | 동등                    |
| Android  |      ⏳ M11 (Tauri Mobile, 미진입)       | ✅ stable | 출시 후 1년 내 따라잡기 |
| iOS      |                  ⏳ M11                  | ✅ stable | 동상                    |
| Web 뷰어 |                  ⏳ M12                  |    ✅     | 동상                    |

→ 현재 우선순위는 M24-E + Phase G. M11 / M12 = M24-E 출시 후 1년 내.

### 핵심 차별점 누적 (이미 보유, M24-E + Phase G 출시 시 모두 발현)

1. 의존성 그래프 (M3) + Blast radius (M3)
2. Supply chain risk (M20 v2)
3. Incident feed auto-match (M5)
4. Kill Switch (multi-key revoke)
5. RAILGUARD (.cursorrules / CLAUDE.md / Copilot)
6. MCP server (Claude / Cursor / Copilot stdio, M18)
7. VS Code + JetBrains plugin (M21+M22)
8. Card hover → mini-graph (M24 1.5)
9. Vault Charter (Diceware + Shamir, M23) — 1P Emergency Kit 보다 안전

**Phase G = 위 8 항목을 확장 안에서 inline 발현. "확장 자체에 dependency-aware 기능" = 진짜 차별**

---

## [2026-05-09] **M24-E GATE 1 일괄 승인** — 18 핵심 결정 + 6 사용자 결정 항목 확정

### 승인 흐름

- researcher → `docs/research_m24e_browser_extension.md` (1370줄, 25+ 출처 인용)
- integrator CRAAP 평가 → `docs/integrator_report_m24e.md` (LOW 신뢰도 출처 ❌, MEDIUM 1건 = `wxt-module-safari-xcode` Phase F 진입 전 재확인)
- **사용자 일괄 승인** (Night mode, 단일 GATE 호출)

### D1~D18 확정 결정 (모두 ✅ 승인)

|    #    | 항목                  | 확정                                                                                                                                                                 |
| :-----: | :-------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D1**  | 빌드 도구             | **WXT v0.20.x** (Plasmo 배제 — Tailwind v4 미지원 + 유지보수 모드)                                                                                                   |
| **D2**  | 통신 채널             | **Native Messaging** (stdio + 4-byte length header + UTF-8 JSON)                                                                                                     |
| **D3**  | vault 모델            | **1P 모델** — vault key = 데스크톱 앱, 확장 = client. Bitwarden 모델 ❌ (Zero-Knowledge 충돌)                                                                        |
| **D4**  | NM Host 구현          | **별도 `secretbank-nm-host` Rust binary** 신설 (AGPL-3.0 단일 라이선스 + Tauri 앱과 분리)                                                                            |
| **D5**  | 페어링 프로토콜       | **KeePassXC 단순화** (3-key → 2-key) + **우리 secretbank-crypto 의 X25519 + ChaCha20-Poly1305 재사용** (TweetNaCl 별도 dep ❌)                                       |
| **D6**  | 모노레포 구조         | pnpm workspace 안에 **`extension/` + `packages/shared/`** 추가 (shared = `password-generator.ts` / `validation.ts` / `types.ts`)                                     |
| **D7**  | Phase 분할            | **A~F 6 phase, 총 55일 ≈ 8주**. Phase B (NM Host) 위험도 최고                                                                                                        |
| **D8**  | UI 라이브러리         | popup = **shadcn/ui + Tailwind v4** (build-time CSS) / content script = **Shadow DOM + 인라인 CSS + postcss-rem-to-px**                                              |
| **D9**  | i18n                  | **`@wxt-dev/i18n`** (YAML 포맷, 타입 안전, `_locales/` 표준, 4 로케일)                                                                                               |
| **D10** | 권한 최소화           | manifest = `activeTab` + `storage` + `nativeMessaging` + `scripting`. host permissions = `optional_host_permissions` (사용자 선택)                                   |
| **D11** | Tiered Protection     | **WebAuthn (Touch ID / Windows Hello) = Tauri 앱에서 호출**, 확장은 session token (HMAC) 받기. password = 1회 인증 후 세션, api_key/카드/passkey = per-reveal 재호출 |
| **D12** | Site Logo 통합        | 기존 `secretbank.app/api/favicon/*` Worker + IndexedDB 캐시 24h + fallback chain (Worker → bundled SVG → 첫 글자)                                                    |
| **D13** | Password Generator    | `packages/shared/password-generator.ts` — Diceware 4 lang (en/ko/ja/zh) + zxcvbn 강도 미터 + issuer recipe (대문자/숫자/특수문자/길이). desktop 앱과 동일 코드       |
| **D14** | Save dialog UX        | **in-page sticky banner (Shadow DOM 격리)** + extension popup 보조. 신규 가입 vs rotation 분기 (`autocomplete="new-password"` + 기존 credential 존재 여부)           |
| **D15** | DOM Clickjacking 방어 | MutationObserver (extension UI 스타일 변경 감지) + Closed Shadow Root + composedPath() — NordPass/ProtonPass/Dashlane 패치 기법 동일                                 |
| **D16** | E2E 테스트            | Playwright (Chromium) + `web-ext` (Firefox) + macOS runner (Safari) + Mock Native Messaging Host (Node.js stub)                                                      |
| **D17** | 스토어 제출           | ⚠️ **수정 권고 채택** — Chrome + Firefox 우선 출시 (Phase F-1) → Safari + Edge 단계적 추가 (Phase F-2). [2026-05-09] 원 결정 (4 브라우저 동시) 변경                  |
| **D18** | AGPL-3.0 경계         | 확장 코드 = OSS core (`extension/` + `packages/shared/`). EE 기능 (auto-rotation 등) = 데스크톱 측만. 확장은 EE 코드 ❌                                              |

### Q1~Q6 확정 (모두 권고 채택)

|   Q    | 항목           | 확정                                                                                                                                  |
| :----: | :------------- | :------------------------------------------------------------------------------------------------------------------------------------ |
| **Q1** | 첫 출시 범위   | **Chrome + Firefox 먼저** (Phase F-1), Safari + Edge 단계적 (Phase F-2). Apple Developer Program $99 = Phase F-2 진입 시점에 결제     |
| **Q2** | NM Host 형태   | **별도 Rust binary** (D4 와 일관) — `secretbank-nm-host`. Tauri installer 가 자동 등록                                                |
| **Q3** | 페어링 UX      | **자동 페어링 + 승인 다이얼로그** (1P 스타일) — 확장 첫 설치 시 데스크톱 앱이 dialog 표시, 사용자 한 번 승인 후 device-bound key 생성 |
| **Q4** | session 만료   | **기본 4시간 + 사용자 설정** (30분 / 1시간 / 4시간 / 8시간 / 사용자 잠금까지). 1P / Bitwarden 와 동등                                 |
| **Q5** | 외부 보안 감사 | **Phase B 완료 후 페어링 흐름만 audit** ([2026-05-07] B.4 외부 감사 일정과 합산). Phase F 전체 audit 은 출시 직전                     |
| **Q6** | commit 단위    | **sub-task 분할 (1~2일 단위)** — Night mode 운용 호환성. Phase A~F 각각 5~10 sub-task                                                 |

### Blocker / High Risk (계속 추적)

- **B1** Phase B NM Host OS 별 installer 등록 — Win 레지스트리 / macOS plist / Linux config. Phase B 시작 전 3 OS 수동 연결 테스트 선행 강제
- **B2** Safari Xcode 빌드 + macOS runner CI 비용 (Phase F-2 진입 시점)
- **B3** Chrome Web Store privacy policy 강화 (2025-01) — privacy policy 작성 + 심사 비용
- **B4** 페어링 프로토콜 보안 audit — 우리 crypto crate 재활용으로 audit 비용 ↓
- **B5** DOM Clickjacking 잔여 위험 — 모든 사이트 수동 audit 불가, 사용자에게 in-page banner 만 신뢰하도록 UX 강화

### 영향 범위

- **task.md** — `T-24-E` 를 Phase A~F sub-task 로 분해 (planner 진행 중)
- **architecture.md** — M24-E 섹션 신설 (NM Host + 페어링 + Tiered Protection + 모노레포 구조)
- **implementation_plan.md** — Phase A~F 순서 + 위험 완화 + 검증 절차 (planner 진행 중)
- **THREAT_MODEL.md** — M24-E 자산 신설 (T1~T7 위협 + 완화) — Phase A 진입 후 implementator 갱신
- **`packages/shared/`** — desktop / extension 양쪽 공유. Diceware wordlist (4 lang) + zxcvbn + validation
- **`secretbank-nm-host` crate** — Tauri workspace 에 신규 추가 (Phase B-1)
- **외부 감사 일정** — Phase B 완료 후 페어링 흐름만, Phase F 완료 후 전체

### Night mode 운용 결과

- 단일 GATE 호출로 18 결정 + 6 사용자 결정 일괄 처리 (총 24 항목)
- 사용자 응답: "전체 일괄 승인"
- 다음 단계 = planner → GATE 2 (구현 계획 승인)

---

## [2026-05-09] **M24-E 직행 결정** — Site Logo / Password Generator / Quick Save 우선순위 통합 (Night mode)

### 사용자 결정 (직접)

> "자 이제 M24-E 진행하자. Night mode"

### 배경 — 기존 진행 순서 ([2026-05-08] Tier 1 재조정)

이전 결정은:

```
dogfooding ✅ → Site Logo (5~7 commits) → Password Generator α+β (4~7 commits)
  → Quick Save 글로벌 hotkey + tray popup (1주) → M24-E 브라우저 확장 (1~2 개월)
  → Phase 3-B → 4 → 3-C → 5 → M11
```

### 결정 (변경 후)

```
✅ dogfooding (방법 A 단축 완료)
→ ⭐ M24-E 브라우저 확장 풀구현 — 직행 (Tier 1 가장 큰 항목)
   ├─ form auto-detect → recipe inheritance → save dialog
   ├─ Tiered Protection 적용 (device biometric 1회 → 세션 유지)
   ├─ Site Logo 표시 (D+E 조합 결정 — extension UI 에서도 동일 활용)
   ├─ Password Generator inline (가입 폼에서 강력 비번 생성, α+β 사양 통합)
   └─ Quick Save (가입 후 자동 저장 dialog — autofill save handler 가 곧 Quick Save)
→ Phase 3-B (secure_note) → 4 (카테고리) → 3-C (passkey)
→ Phase 5 (TOTP autofill) → M11 (모바일)
```

### 근거 — Site Logo / Password Gen / Quick Save 가 M24-E 안에서 자연스럽게 발현

| 이전 별도 항목                                             | M24-E 안에서의 발현                                                                                                                                                                                  |
| :--------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Site Logo                                                  | extension popup + content script 의 카드 미리보기에 동일 favicon-proxy Worker 호출 — desktop 앱과 디자인 일관성. 별도 commits 불필요 (M24-E 의 UI sub-task 안에서 함께 구현)                         |
| Password Generator α+β (Diceware + zxcvbn + issuer recipe) | extension 의 신규 가입 폼 인라인에서 호출 — desktop 의 generator 모듈을 shared lib 로 빼서 양쪽 사용. **분리 구현 ↔ 통합 구현 비용 차 ≈ 0**, daily UX 가치는 통합 시 극대화 (1P / Bitwarden 와 동등) |
| Quick Save (글로벌 hotkey + tray popup)                    | extension 이 form submit 감지 후 자동 save dialog 띄우는 흐름 = Quick Save 의 본래 의도 (autofill save handler). **글로벌 hotkey + tray 는 단기 우회책이었고 본질 해결은 M24-E**                     |

### 재확인된 통찰 — M24-E 가 daily driver 검증의 진짜 blocker

[2026-05-09 resume 세션 마무리] 사용자 발언:

> "autofill 없이 dogfooding 의미 X — daily driver 검증 불가"
> "기본 설정이 1P 인 상황에서 Secretbank 에 비번 넣는 흐름 자체가 마찰 큼"

→ Site Logo / Password Gen / Quick Save 를 M24-E 전에 먼저 끝내도 **daily driver 진입은 여전히 막힘** (autofill 없으면 매 가입 시마다 수동 복붙 마찰). 따라서 M24-E 직행이 사용자 가치 우선순위와 일치.

### 영향 범위

- **task.md `T-24-E`** — 기존 "스켈레톤 only" → **풀 구현으로 격상** (Phase A~F 분할 예정, planner 단계에서 확정)
- **m24_vision.md** — 진행 순서 갱신 (M24-E 직행 표시)
- **progress.md** — 다음 세션 시작점 = `researcher` 호출 (M24-E 사양 조사)
- **researcher 임무 범위** — Manifest V3 / Native Messaging / form auto-detect / Tiered Protection 호환 / cross-browser 빌드 (Chrome / Firefox / Safari / Edge) / E2E 테스트 / 경쟁 제품 분석 (1P / Bitwarden) — 풀구현 사양 (Site Logo + Password Gen + Quick Save 통합 포함)

### Night mode 운용 규칙 적용

- **GATE 1-4 외 중간 "진행 여부" 질문 금지** (메모리 [feedback_night_mode] 따름)
- 큐에 쌓고 계속 진행 — researcher 결과 + integrator_report 작성까지 자동 진행 후 GATE 1 에서만 사용자 승인 요청

---

## [2026-05-08] **Zero-Knowledge 원칙 재확인** — "복구 가능 ↔ zero-knowledge" 양립 불가

### 배경 — 사용자 통찰 (직접 인용)

> "이 시스템의 가장 큰 문제는 비번 하나로 너무니 많은 중요한 것들을 관리한다는 점이고 만약 1password를 잊어버리면 재앙이지 ... 사용자가 설정한 질문 3개, 안면인식, e-mail 확인, 패턴인식, 스마트폰 authenticator 등 여러 단계를 모두 알아야 복원할 수 있도록 해도 zero knowledge에 위배되어 신뢰도를 떨어뜨리겠지?"

**사용자 인식 100% 정확**. 이는 암호화 시스템의 근본 원리.

### 본질적 분석 — 양립 불가 증명

"사용자가 N단계 (질문 / 안면 / 이메일 / authenticator) 통과 → 서버가 vault key derive" 가 동작하려면:

1. 서버가 N단계 인증 정보를 **어떤 형태로든 보관**해야 함
2. 통과 시 master key 의 derive 함수를 갖고 있어야 함
3. 즉 서버가 vault 를 열 수 있는 능력 보유 = **zero-knowledge 위반**

설령 각 단계를 hash + salt 로 저장해도 통과 시 master key 함수를 derive 해야 하므로 본질적으로 동일. **단계가 늘어날수록 사용자 편의 ↑ 지만 zero-knowledge 는 정확히 같은 비율로 무너짐**.

→ **zero-knowledge 깨면 1P / Bitwarden 과 차별점 없음 + Secretbank 가치 명제 (`README` 핵심 + `docs/PRIVACY.md`) 자체 붕괴**. 출시 후 깨면 평판 회복 불가.

### 기존 서비스들의 처리 — 모두 "사용자 / 신탁자 책임" 으로 우회

| 서비스                     | 복구 방식                                                 | zero-knowledge?                |
| :------------------------- | :-------------------------------------------------------- | :----------------------------- |
| 1Password Emergency Kit    | 종이 출력 (사용자 본인 보관)                              | ✅ 유지                        |
| Bitwarden Emergency Access | 신탁자 m-of-n — 신탁자 자신의 key 로 vault receive        | ✅ 유지                        |
| Apple iCloud Keychain      | HSM (Hardware Security Module) + custodian protocol       | ✅ 유지 (Apple 도 vault 못 봄) |
| Web3 Wallet                | Seed phrase 종이 + 옵션 social recovery (m-of-n trustees) | ✅ 유지                        |

**서버가 복구 책임을 가지는 password manager 는 없음** — 그건 정의상 password manager 가 아님.

### 우리의 답 — Zero-knowledge 유지 + 재앙 회피 Layer 다중화

각 layer 가 **책임 주체 분리**되어 있어 zero-knowledge 안 깨짐:

| Layer                         | 의미                                                                                                       | zero-knowledge? | 책임 주체                          | 우리 상태                  |
| :---------------------------- | :--------------------------------------------------------------------------------------------------------- | :-------------- | :--------------------------------- | :------------------------- |
| **L1 Charter** (M23)          | Diceware 6-word + 4-digit verifier + Shamir 2-of-3 옵션                                                    | ✅              | 사용자 (종이 / PDF / Shamir split) | ✅ 구현됨                  |
| **L2 Multi-device sync** (M9) | E2EE Yjs CRDT + Cloudflare Workers relay                                                                   | ✅              | 사용자 (디바이스 보유)             | ✅ 구현됨                  |
| **L3 Biometric quick-unlock** | Touch ID / Windows Hello + device-bound key + OS keychain. passphrase 입력 빈도 ↓ → **잊을 가능성 자체 ↓** | ✅              | 사용자 (device + OS 잠금)          | 🟡 부분 (자동잠금 idle 만) |
| **L4 Emergency Access**       | 신탁자 m-of-n, waiting period (예: 7일), 신탁자가 자기 key 로 vault receive                                | ✅              | 사용자 (신탁자 선정) + 신탁자      | ⏳ Tier 2 placeholder      |
| **L5 Hardware Key**           | YubiKey FIDO2 / WebAuthn 물리 토큰                                                                         | ✅              | 사용자 (물리 토큰 보관)            | ⏳ Phase 3-C passkey 합류  |
| **L6 Charter reminder**       | 정기 재출력 알림 + 신탁자 등록 권장 + multi-device sync 권장                                               | ✅ (UX 만)      | 사용자                             | ⏳                         |

**핵심 인사이트**: **분실 가능성 자체를 줄이는 것** 이 가장 효과적. L3 biometric quick-unlock 으로 passphrase 입력 빈도 월 1회 수준으로 줄이면 잊을 가능성도 그만큼 ↓.

### UX 원칙 — "사용자 책임 명시" 의 명확한 alerting

zero-knowledge 의 trade-off 를 사용자가 **명확히 인지**하게 만드는 것이 출시 후 신뢰도의 핵심:

1. **vault 생성 시** — "당신의 passphrase 는 우리가 절대 못 봅니다. 분실 시 복구 불가 — Charter 출력 필수" 명시
2. **Charter 출력 안 한 사용자는 vault 사용 자체 차단** — 이미 M23 에서 Charter 발급 강제
3. **정기 Charter 재출력 reminder** (L6 / 6개월마다 / 새 device 추가 시)
4. **신탁자 등록 권장** (L4 출시 후, "재앙 회피 layer 추가" 권유)
5. **Onboarding 에 명시적 trade-off 설명** — "편한 복구 = 우리가 vault 봄. 우리는 절대 안 본다 = 당신이 책임진다"

→ 1P / Bitwarden 보다 **더 명확하게 사용자 책임을 알림** → 역설적으로 신뢰도 ↑. 우리만의 차별점.

### 결정 (2026-05-08)

- **Zero-knowledge 는 절대 깨지 않는다** — 이는 출시 전후 모든 결정에서 가장 우선되는 원칙
- "여러 단계 인증 기반 서버 측 복구" 같은 기능은 **요청이 있어도 구현 ❌**
- 모든 재앙 회피 layer 는 **책임 주체 분리** 형태로만 추가 (사용자 본인 / 신탁자 / 물리 토큰 / device)

### 영향 범위

- **모든 미래 implementator 호출** — 위 원칙 인용 가능. "복구 편의" 기능 검토 시 zero-knowledge 영향 분석 필수
- **마케팅 / 랜딩 페이지** — "분실 시 우리가 못 도와줍니다 (그래서 안전합니다)" 명시
- **Onboarding 흐름** — Charter 발급 + trade-off 설명 강조 (현재 구현 그대로 유지)
- **THREAT_MODEL.md** — 본 결정 인용 추가 권고

### 구현 우선순위 (2026-05-08 시점)

**원칙만 정식화. 구현 일정은 현재 순서 유지** (M24-E 격상 결정 그대로):

```
dogfooding → Site Logo → Password Generator → Quick Save → M24-E
  → Phase 3-B → 4 → 3-C → 5 → M11
```

**향후 dogfooding 피드백** 받고 L3 / L4 / L6 격상 여부 재결정. 특히:

- L3 biometric quick-unlock — 자주 passphrase 입력 부담 호소 시 격상
- L6 Charter reminder — 사용자가 Charter 분실 우려 표현 시 격상
- L4 Emergency Access — 가족 / 회사 사용자 피드백 받고 격상

---

## [2026-05-08] **Tier 1 우선순위 재조정** — Password Generator + Quick Save + M24-E 격상

### 배경 — 사용자 통찰 (직접 인용)

> "secret을 가져올 때 csv에서 한번에 가져오는 게 아니라 새로 입력할 때 바로 저장할 수 있는 게 가장 중요해. 사용자가 새로운 사이트에 가입하면서 만든 비번을 자동으로 저장해주는 간단한 UX가 중요해. 또한 각 사이트의 조건에 맞는 안전한 비번을 자동으로 만들어주는 기능도 있으면 좋겠어"

**문제 정의**: 1P / Bitwarden 의 daily driver 핵심 UX 두 가지 = "가입 시 자동 저장" + "사이트 맞춤 비번 생성". CSV import 만으로는 daily driver 진입 불가. 이는 **브라우저 확장 (M24-E) 의 핵심 기능** 이며, 우리 Tier 1 의 가장 큰 항목.

### 결정 — 두 기능 분해 + 시간축 분리

#### 1. Password Generator (즉시 가능, 작은 작업)

- **α. 정적 generator** (1~2 commits): length / symbols / digits / uppercase / lowercase 토글 + Diceware passphrase 모드 + zxcvbn entropy meter (라이브러리 이미 있음)
- **β. issuer preset password recipe** (3~5 commits): 17개 preset 에 `password_recipe: { min, max, symbols_allowed, digits_required }` 필드 추가 + 사이트별 사전 조사
- **γ. M24-E 합류**: 브라우저 확장이 form `<input pattern>` / `minlength` 속성 읽어 자동 조정 (M24-E 풀구현 시점)

#### 2. Quick Save UX (단기 대안 + 장기 풀구현)

| 단계                       | 옵션                                                                                                                                                 | 작업량                  | UX 동등    |
| :------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------- | :---------------------- | :--------- |
| **단기 (dogfooding 기간)** | **B. 글로벌 hotkey + tray popup** — 가입 form 에서 `Cmd+Shift+G` → 데스크톱 popup → generator → 비번 자동 입력 + Quick Save (URL/username 추가 입력) | 중 (1주)                | 부분 동등  |
| **장기 (출시 전 필수)**    | **A. M24-E 브라우저 확장 풀구현** — Chrome / FF / Safari / Edge × manifest v3 × form detection × autofill × save dialog                              | 매우 큼 (1~2 개월 단독) | 1P 동등 ✅ |

**거부된 대안**:

- **C. OS Keychain bridge** (Chrome Password Manager / Apple Keychain 양방향 sync) — 우리만의 차별 ❌, privacy / 권한 / 안정성 모두 복잡
- **D. 클립보드 passive 감지** ("비번 같은 패턴 감지 → Save?" 토스트) — privacy 우려 + 다른 앱 복사도 보임

### Tier 1 우선순위 재조정 — M24-E 격상

이전 진행 순서 (2026-05-07 비전 명확화):

```
dogfooding → Site Logo → Phase 3-B (secure_note) → Phase 4 (카테고리)
  → Phase 3-C (passkey) → Phase 5 (TOTP autofill) → M11 → M24-E
```

**변경 후** (이번 결정):

```
dogfooding → Site Logo (5~7 commits)
  → Password Generator α + β (4~7 commits)
  → Quick Save 글로벌 hotkey + tray popup (B, 중)
  → M24-E 브라우저 확장 풀구현 (매우 큼, 단독 1~2 개월) ⭐ Tier 1 가장 큰 항목
  → Phase 3-B (secure_note) → Phase 4 (카테고리) → Phase 3-C (passkey)
  → Phase 5 (TOTP autofill, Tiered Protection 적용)
  → M11 (모바일, Tiered Protection 적용)
```

**근거**:

- 신용카드 / secure_note / passkey 같은 새 데이터 type 보다 **일반 password 의 daily UX 완성** 이 daily driver 진입의 더 큰 blocker
- M24-E 풀구현 시 **Tiered Protection (autofill 재인증 없음)** + **Site Logo (시각 식별)** + **Password Generator + Quick Save** 가 모두 발현 → daily driver 자격 충족
- secure_note / 카테고리 는 dogfooding 자체에 blocking ❌ — 있으면 좋지만 daily driver 가능성 무관

### Trade-off (명시)

- **M24-E 풀구현 = 단독 1~2 개월** — 그 사이 Phase 3-B / 3-C / 4 / 5 보류. 출시 전체 일정 지연
- **단기 글로벌 hotkey** 도 1주 단독 작업 — Site Logo / Password Generator 와 직렬
- 결과: 출시 전체 일정은 늘어나지만 출시 시점의 **daily driver 자격은 1P 동등 이상**
- 사용자 명시 "시간이 걸리더라도" → 본 trade-off 수락

### M24-E 사양 사전 메모 (사양 작성 시 적용)

본 결정에 따라 M24-E 진입 시 implementator 에게 전달할 핵심 사양:

1. **Tiered Protection 적용** — device biometric 1회 → 세션 유지 → password kind autofill 재인증 ❌. api_key/카드/passkey 는 재인증
2. **Form auto-detect + recipe inheritance** — 가입 form 의 `<input pattern>` / `minlength` / `maxlength` 속성 읽어 generator 옵션 자동 조정. 매칭되는 issuer preset 의 recipe 우선
3. **Save dialog 마찰 최소화** — 1P 의 "save / never / not now" 3옵션 그대로. 자동 hide 옵션 ON 시 noise 없음
4. **Site Logo 표시** — autofill 옵션 popup 에 issuer logo 노출 (시각 식별)
5. **manifest v3** — 모든 4 브라우저 지원
6. **Form detection 의 false positive 최소화** — 가입 form vs 로그인 form 구분 (heuristic)

---

## [2026-05-08] **Site Logo 기능 신설** — BentoCard 로고 표시 (Phase 3-B 직전 진입)

### 배경 — 사용자 질문

> "각 비번카드는 이름 url ID PW/Key/Token 등이 들어간다고 했는데 각 카드에서 해당 카드를 잘 알아볼 수 있게 로고를 가져올 수 있는가?"

현재 BentoCard 가 로고 미표시 → 카드 시각 식별성 부족. 1P / Bitwarden 모두 favicon 자동 fetch 가 기본. UX 4축 중 디자인 / 직관성 격차 좁히는 가시적 개선.

### 현재 코드 상태

- `Issuer` 모델에 `icon_key: Option<String>` + `domains: Vec<String>` 필드 **이미 존재** (`src-tauri/crates/secretbank-core/src/models/issuer.rs:17,24`)
- 17개 issuer preset 시드 — domains 등록됨
- BentoCard 는 로고 슬롯 미구현. CredentialDetail 도 동일

### 결정 — D + E 조합 (Tiered source priority)

**source priority** (1 → 2 → 3 fallback):

1. **issuer preset (17개)** → bundled SVG (`src/assets/issuer-logos/<id>.svg`) — offline 동작 / 일관된 디자인 / `simpleicons.org` 패키지 활용
2. **그 외 URL 보유 credential** → **Cloudflare Worker favicon-proxy** (`ee/cloudflare/favicon-proxy/`)
   - route: `secretbank.app/api/favicon/<domain>`
   - 내부에서 Google s2 API 호출 + Cloudflare KV 24h 캐시
   - 응답: WebP 64x64 (모든 OS / 디바이스 일관)
   - **Privacy**: Worker 가 secretbank 계정과 무관 → 누가 어떤 사이트 favicon 을 요청했는지 묶을 수 없음. zero-knowledge 와 양립
3. **fallback** → 도메인 첫 글자 + brand-aware gradient (Phase 1.5 hover graph 와 동일 톤)

### 거부된 대안 (이유)

- **Google s2 / DuckDuckGo 직접 호출**: 외부 서비스가 사용자가 어떤 사이트에 계정이 있는지 학습 → zero-knowledge 위반
- **사이트 origin 직접 fetch** (`<host>/favicon.ico`): 사이트마다 경로 (apple-touch-icon / favicon.png) 다양해 신뢰성 ↓ + CORS 이슈
- **순수 local bundle 만**: 사용자가 추가하는 신규 issuer 는 fallback 만 — daily driver 시각 식별성 부족

### Settings 토글 — 사용자 선택권 (Tiered Protection 원칙과 일관)

- **"Fetch site logos from web"** — 기본 ON
- OFF 시: bundled SVG 만, 그 외는 첫 글자 fallback. fully air-gapped 사용자 케이스 충족

### 진입 시점 — dogfooding 직후, **Phase 3-B (secure_note) 이전 우선**

근거:

- BentoCard 가 현재 시각적으로 가장 빈약함 → daily driver 체감 대폭 향상
- secure_note 는 보통 로고 없으니 (개인 메모/문서) Site Logo 와 작업 충돌 ❌
- UX 4축 중 가장 빠르게 격차 좁히는 작업 (작업량 대비 효과)

### 작업 규모 (예상 5~7 commits)

| Sub-task   | 작업                                                                                      |
| :--------- | :---------------------------------------------------------------------------------------- |
| **Logo-1** | `ee/cloudflare/favicon-proxy/` Worker 신규 + vitest (download-proxy 패턴)                 |
| **Logo-2** | issuer preset 17개 SVG 번들 (`simpleicons.org` 또는 직접) + `useIssuerLogo` priority 1    |
| **Logo-3** | `useIssuerLogo` 훅 priority 2 (Worker fetch + IndexedDB 24h 캐시) + priority 3 (fallback) |
| **Logo-4** | BentoCard 로고 슬롯 (좌측 상단 32x32) + LazyImage + 빈 상태                               |
| **Logo-5** | CredentialDetail 로고 표시 (헤더 영역)                                                    |
| **Logo-6** | Settings `fetch_logos_enabled` 토글 + i18n 4 로케일                                       |
| **Logo-7** | THREAT_MODEL.md 갱신 (favicon-proxy 위협 모델 / privacy 보장 명시)                        |

### 갱신된 진행 순서 (2026-05-08)

dogfooding (Worker deploy + tag push + installer 검증)
→ **Site Logo 풀체인 (5~7 commits)** ⭐ 신규 우선순위
→ Phase 3-B (secure_note)
→ Phase 4 (카테고리)
→ Phase 3-C (passkey)
→ Phase 5 (TOTP autofill, Tiered Protection 적용)
→ M11 (모바일)
→ M24-E (브라우저 확장, Tiered Protection 적용)

---

## [2026-05-08] **Tiered Protection 모델 채택** — UX 핵심 설계 원칙

### 배경 — 사용자 통찰 (직접 인용)

> "일반적인 비번의 경우 구글로 로그인을 하면 비번이 바로 완성되어 사용가능한데, 1password를 사용하면 다시 1password 비번을 입력해야 한다는 거야. 불필요하게 잠금을 건 경우라고도 할 수 있지. 내 생각에는 저장만 완벽하게 하고, import를 단순하게 하고 입력은 굳이 재확인 없이 구글 자동완성을 이용해도 될 것 같아"

**문제 정의**: 1P 의 가장 큰 마찰점 = device 가 OS-level 잠금 해제된 상태에서 일반 password autofill 에 vault 재잠금까지 요구 → daily driver 비대칭 비용. autofill 한 번에 추가 단계 1~2개.

이는 Secretbank 가 1P / Bitwarden 과 차별되는 가장 중요한 UX 결정 중 하나.

### 결정 — 자산별 보호 수준 차등화

**모든 credential 을 같은 수준으로 잠그지 않는다.** 위험도에 따라 보호 수준 분리:

| 자산 kind                                               | 보호 수준                                             | autofill / reveal 흐름                                                             |
| :------------------------------------------------------ | :---------------------------------------------------- | :--------------------------------------------------------------------------------- |
| **password** (일반 웹사이트)                            | OS keychain 위임 (Touch ID / Windows Hello / OS lock) | **재인증 없이 즉시 자동완성** (vault unlock 한 번 후 device 잠금 풀릴 때까지 유지) |
| **api_key / 토큰**                                      | Secretbank vault + reveal-on-demand 30s 자동 클리어   | passphrase 1회 (auto-lock idle 정책 적용)                                          |
| **credit_card / passkey / vault charter / TOTP secret** | Secretbank vault + per-reveal 인증                    | reveal 시점마다 재인증 (현재 3-A 신용카드 흐름과 일치)                             |

### 구현 방향

**short-term (Settings 토글, dogfooding 후 즉시 가능)**:

- Settings 에 **"Auto-unlock for low-stakes credentials"** 토글 추가 (기본값: ON — daily driver 우선)
- vault unlock 한 번 후 device OS 잠금 풀린 동안 `kind == password` 인 credential 의 reveal/copy 는 passphrase 재입력 ❌
- `kind in { api_key, credit_card, passkey, totp_secret, vault_charter }` 는 그대로 재인증 (현 흐름 유지)
- 보안 우선 사용자는 토글 OFF 로 1P 모드 (모든 reveal 재인증) 선택 가능 — **명시적 선택권 보장**

**long-term — M24-E 브라우저 확장 + Phase 5 TOTP autofill 핵심 설계 원칙**:

- M24-E 브라우저 확장은 **device biometric 한 번 → 세션 유지 → autofill** 흐름을 기본으로. 매 사이트마다 vault 재잠금 ❌. 1P / Bitwarden 보다 마찰 한 단계 적게.
- Phase 5 TOTP 자동 채움 — `kind == password` 인 credential 에 연결된 TOTP 는 autofill 시 함께 전달. `kind == totp_secret` (독립 TOTP) 만 재인증.
- 모바일 (M11) 도 동일 — OS 의 biometric/PIN 통과하면 일반 password autofill 즉시 가능.

### 영향

- **Settings 토글** — Phase 3-B (secure_note) 직후 또는 dogfooding 1일 안에 추가 가능 (작은 작업, 1~2 commits)
- **F.1 4축 분석 갱신** — UX 축의 격차가 좁혀짐. "1P 의 마찰 1단계 제거" 가 우리만의 차별로 등장
- **THREAT_MODEL.md 갱신 필수** — `kind == password` 의 보호 모델이 OS lock 으로 위임됨. shoulder surfing / device unattended 시점의 위험을 OS keychain 모델과 동일 수준으로 명시
- **Phase 5 / M24-E 사양** — implementator 호출 시 본 결정 인용 필수
- **랜딩 페이지 마케팅** — "1P 보다 한 단계 빠른 autofill" 직접 어필 가능

### 사용자 제안 3가지의 정식 처리

| 제안                     | 정식 처리                                                                                                                                  |
| :----------------------- | :----------------------------------------------------------------------------------------------------------------------------------------- |
| "저장만 완벽하게"        | 이미 충족 (zero-knowledge + Charter 복구 + Yjs CRDT sync). 단 강력한 generator (Diceware + entropy meter) 추가 — Tier 2 작은 작업으로 격상 |
| "Import 를 단순하게"     | Chrome CSV preview 가 이미 단순. 1pux / BW JSON 추가 시 **동일 단순함 유지** 가 기준. 5분 TTL + 충돌 자동 해제 패턴 그대로                 |
| **"입력은 재확인 없이"** | **본 Tiered Protection 모델의 핵심**. password kind 의 reveal/copy/autofill 에 한해 재인증 제거. Phase 5 / M24-E 의 default 설계           |

### Trade-off (명시)

- **OS lock 위임 = device 가 도난당했을 때 OS 잠금만이 방어선**. 단 이는 일반 password manager 와 동일 수준 (1P 의 vault 재잠금이 추가 보호선이긴 하나 daily 마찰 대비 이익 미미)
- **고위험 자산은 여전히 vault 재인증** — shoulder surfing / over-the-shoulder 방어 유지
- **사용자 명시 선택권** — Settings 토글로 "1P 모드" 선택 가능 — "보안 강조" 사용자 케이스 충족

---

## [2026-05-08] Pre-step Worker 배포 — GATE 1 사양 확정 (Dogfooding 진입 전)

이번 resume 세션 첫 GATE 1. m24_vision.md "다음 세션 시작점" Pre-step 5개 작업의 구체적 사양 확정.

### 사용자 결정 3가지 (모두 권장 옵션)

1. **Worker 코드 배치 위치**: `ee/cloudflare/download-proxy/` (별도 Worker + Routes)
   - 근거: 기존 `ee/secretbank-relay/` 와 일관, ee/ 격리 (Open Core / EE License) 유지, Pages 와 같은 도메인이지만 wrangler routes 로 `secretbank.app/download/*` + `secretbank.app/api/*` 만 Worker 가 catch
2. **`/api/latest` manifest 갱신 방식**: release.yml 이 `site/latest.json` 을 main 에 commit (정적)
   - 근거: GitHub API rate limit 의존성 제거, Worker 가 site/latest.json 을 KV 또는 정적 복제로 제공. release 후 GitHub Actions 가 자동으로 main branch 에 commit + push (PAT/`GITHUB_TOKEN` 권한 사용)
3. **구현 사이클**: researcher 짧게 → integrator → implementator (full)
   - 근거: Worker stream proxy 패턴 / GitHub Releases CDN URL 형식 / Worker free plan 한계 / cache 전략 사전 검증. 보안·신뢰성 우선 (Project Vision = 1P/Bitwarden 동등)

### 자동 결정 (memory 룰 + Project Vision 에 의해 자동 확정)

- **도메인 매핑**: 단일 도메인 `secretbank.app/download/*` + `secretbank.app/api/latest`. **서브도메인 ❌** (`download.secretbank.app` 같은 서브도메인은 사용자 신뢰감 분산). m24_vision.md "어디에도 'github' 단어 미노출" 룰 충족.
- **Proxy 방식**: Stream proxy (Worker 가 fetch + 청크 stream). **302 redirect ❌** (사용자 브라우저 주소창에 GitHub CDN URL 노출됨, 룰 위반).
- **Manifest 형식**: tauri-plugin-updater 호환 (`version` + `notes` + `pub_date` + `platforms[].url + .signature`) — 기존 `site/latest.json` 형식 그대로 유지.
- **`tauri.conf.json` updater endpoint**: `https://secretbank.app/api/latest` 단일 endpoint (`{{current_version}}` placeholder 제거 — tauri-plugin-updater 는 단일 endpoint + 응답의 version 비교로 동작).

### 영향

- 향후 Cloudflare R2 자체 호스팅 전환 시 Worker 내부 fetch URL 만 변경하면 됨 (사용자 노출 URL 불변)
- Phase 3-B / 4 / M14 진입 전 dogfooding 가능
- v0.1.0-pre11 release 시 GitHub Actions 가 main 에 site/latest.json commit → Pages 자동 재배포 → Worker 가 정적 manifest 제공

### GATE 2 — 통합 사양 승인 (2026-05-08, integrator_report_pre_step_worker.md 508줄 기반)

**전체 권고 채택**:

- **Section 3-3**: 별도 Worker (`ee/cloudflare/download-proxy/`) 유지 (Pages Functions ❌). 라이선스 경계 우선 + 회색 지대 리스크는 deploy 후 `curl` 검증으로 즉시 탐지 + Pages Functions fallback 경로 명확
- **Section 4**: 7대 위협 모델 (W1~W7) 모두 적용. `ALLOWED_FILENAME_RE` 의 `.` 이스케이프 implementator 검토
- **Section 5**: 5개 sub-task 분할 (Worker → tauri/latest.json → release.yml → site/index.html → RELEASE_GUIDE), 1 implementator = 1 sub-task = 1 commit 룰
- **결정 1**: Pages Functions fallback 트리거 = deploy 후 24h 내 `curl` 실패 시 즉시
- **결정 2**: `release.yml` push 권한 = `GITHUB_TOKEN` 그대로 (branch protection 추가 시 PAT 마이그레이션)
- **결정 3**: ~~"Previous releases" UI = 제거~~ → **유지 + (d) 자동 생성 채택** (2026-05-08 사용자 지적 반영)
  - **사용자 지적**: "Python 등 다른 release 는 업데이트 되더라도 previous release 를 사용하는 경우가 있다"
  - **유지 근거**: vault 파일 schema 마이그레이션 호환성 / 신버전 critical regression rollback / 버그 재현 / 회사·정부·은행 검증된 특정 버전만 허용
  - **구현 (d)**: release.yml 이 release 후 `site/releases.json` 도 자동 생성 + `[skip ci]` main commit. CI `GITHUB_TOKEN` 으로 `releases?per_page=20` 호출 (rate limit 5000/h 무관).
  - **Worker 변경 ❌**: 정적 파일은 Pages 가 직접 서빙 (`secretbank.app/releases.json`). `/api/releases` endpoint 추가 ❌
  - **Sub-task 영향**: Sub-task 2 (`site/index.html`) `renderPreviousReleases()` → `fetch("/releases.json")` 변경, Sub-task 4 (`release.yml`) site/releases.json 자동 생성 step 추가, Sub-task 5 (RELEASE_GUIDE) releases.json 절차 명시. Sub-task 1 Worker 영향 ❌
- **결정 4**: GitHub PAT 추가 시점 = 미설정 시작, 100+ DAU 또는 `429` 발생 시
- **결정 5**: Workers plan = Free 시작, 50k req/day 도달 시 Paid 전환
- **결정 6**: sub-task 묶음 = 5 implementator 분할 (commit 단위 추적 명확)
- **결정 7**: Worker secrets = wrangler.toml 주석 미리 기록 (relay 패턴 일관)

**추가 결정 (이번 세션 GATE 2 옵션)**:

- **Sub-task 1 vitest 포함**: `@cloudflare/vitest-pool-workers` — filename allowlist / cache / SSRF 방어 / Range 헤더 단위 테스트. Project Vision = 1P/Bitwarden 동등 신뢰성
- **wrangler deploy 주체**: 사용자 직접. Cloudflare account 인증 / API token / DNS route 설정 secrets 노출 위험으로 implementator 는 코드 작성만, 사용자가 RELEASE_GUIDE 따라 deploy

---

## [2026-05-08] 브랜드 / 도메인 재검토 — Pre-step Worker 진행 중 사용자 제기

### 사용자 지적

> "secretbank 로 시작했지만 점차 활용 확대 중. secretbank 라는 이름이 우리의 가치를 오히려 축소시키고 있다. secretbank 가 차라리 어떨까?"

### 평가

**사용자 지적이 타당**. 현재 구현 / 향후 비전 vs "secretbank" 이름의 격차:

- API key (✅ 이름과 일치) / password (M24, ❌) / 신용카드 (Phase 3-A ✅, ❌) / passkey (Phase 3-C, ❌) / secure_note (Phase 3-B, ❌) / 의존성 graph + blast radius (핵심 차별화, ❌) / supply chain risk / incident matching / browser autofill / TOTP autofill 모두 "secretbank" 가 표현 못함.
- Project Vision = 1P/Bitwarden 동등 시장 출시. 그들은 카테고리 자체를 broad 로 ("1Password", "Bitwarden"). Secretbank 는 카테고리를 좁힘.

### 검토된 후보

**Tier A (강력)**: Vaultmap (graph 차별화 직접 표현) / Secretbank (사용자 제안, secret broad scope + bank 메타포) / Lockmesh (supply chain mesh)
**Tier B**: Truststack / Keymap / Bastion / Aegis / Knox / Strongbox
**Tier C**: Vaultweb / Linkvault / Cipherline 등

### 사용자 결정 (2026-05-08, 이번 세션)

1. ~~**브랜드 / 도메인 = 일단 보류**~~ → **`secretbank.app` 확정 (2026-05-08, 이번 세션 후반)**
   - 사용자 검색 결과 가용 후보: `topsecretbank.com` / `secretbank.app` / `topsecretkeeper.com` / `digitalsecretkeeper.com` / `safe-secret.com` / `safe-secret.app`
   - 비교 결론 (.com vs .app):
     - .com 일반 소비자 자동 입력 / non-tech 신뢰감 — 단 긴 합성어 .com 은 cybersquatter 톤
     - .app Google 운영 (DNSSEC + HSTS 자동 preload) — 보안 카테고리에서 강한 시그널 + Tauri 데스크톱 앱과 일관 (`tauri.app`)
     - 보안 / 모던 SaaS 카테고리: linear.app / framer.app / height.app 등 .app 흔함
     - **brand 강도 > TLD** 원칙 → 짧고 강한 `secretbank.app` (10자, 2단어, 메타포 명확) > 길고 약한 `topsecretbank.com` (13자, 3단어, "top secret" 영화/군대 톤)
   - 후보 제외: `topsecretkeeper.com` / `digitalsecretkeeper.com` (16~21자, "keeper" 애매, "digital" 중복) / `safe-secret.*` (하이픈이 brand 결정적 약점)
2. **Phase B (broad rename) 시점 = Phase A + B 동시 완료 후 dogfooding 진입** — URL 만 바꾸고 코드 내부는 secretbank 유지하는 부분 적용 ❌. 일관성 우선
3. **이번 세션 진행 상태**: Sub-task 1 (Worker) ✅ 완료 + commit. Sub-task 2 (site/index.html) ✅ 코드 작성 완료, **working tree 에 보존, commit 보류** (도메인 결정 후 URL 일괄 교체 필요). Sub-task 3, 4, 5 진입 ❌.

### `secretbank.app` 확정 후 선결 작업 (사용자 직접 — 다음 세션 시작 전 권장)

1. **상표 검색 (필수, 5~10분)** — brand 사용 후 cease-and-desist / 상표 분쟁 회피:
   - USPTO TESS (미국): https://tmsearch.uspto.gov — "SECRETBANK" / "SECRET BANK" 검색 (Live Trademark)
   - EUIPO (유럽): https://euipo.europa.eu/eSearch/ — 동일 검색
   - KIPRIS (한국): https://www.kipris.or.kr — "시크릿뱅크" / "SECRETBANK" 검색
   - 보안 / 금융 / 소프트웨어 분야 상표 등록 확인 (Class 9 / 36 / 42)
   - 동음이의 / 유사 상표도 검토 (e.g. "SecureBank", "SecretBox", "SafeBank")
2. **`secretbank.app` 도메인 등록**:
   - Cloudflare Registrar (at-cost, ~$13/yr) — relay 와 같은 계정 권장
   - 또는 Porkbun (~$13.7/yr) / Google Domains
   - DNSSEC 활성화 + 자동 HTTPS preload 확인
3. **`secretbank.com` 인수 검토 (선택, 병행 트랙)**:
   - WHOIS: https://who.is/whois/secretbank.com — 사용 상태 분류 (Parked+sale / Parked-no-sale / Active site)
   - Parked + Sedo/GoDaddy sale page = 즉시 buyout 가격 확인
   - Active site = 거절 多 또는 매우 비쌈 — 포기
   - 가격 $5K 이하 → 즉시 인수 / $10K+ → 자금 확보 후 인수 / 1Password 도 수년 걸림

### 사용자 결정 (2026-05-08, 추가)

4. **Phase A + B 마이그레이션 = 이번 세션 즉시 시작** — DNSSEC propagation 24h 대기 시간에 코드 마이그레이션 완료
5. **secretbank.app registrar = Cloudflare Registrar** — DNSSEC DS record 자동 등록, ee/secretbank-relay 와 동일 계정, at-cost ~$13/yr
6. **GitHub repo rename = OK** — GitHub 자동 redirect 작동 (web URL / git clone / API endpoints / Releases / Pages 모두 자동), 기존 PR/Issue/Star 보존. 코드 내부 hardcoded 문자열 (`REPO = "phoodul/secretbank"` 상수, README badge URL, Cargo.toml `repository`, package.json `repository`) 만 수동 갱신 필요

### Cloudflare 보안 설정 결정 (2026-05-08, secretbank.app)

이번 세션 사용자가 Cloudflare 콘솔에서 직접 설정:

- **HSTS**: Enable / Max Age 6 months (15552000) / includeSubDomains ON / **Preload OFF** (dogfooding 안정 후 ON 검토) / No-Sniff Header ON
- **WAF (Web application exploits)**: 활성화 (OWASP managed rules)
- **DDoS attacks**: 활성화 (모든 plan 기본)
- **Bot Fight Mode**: 활성화 (Free tier)
- **Domain settings**: DNSSEC + Domain Lock + WHOIS Privacy + Auto-renew 모두 활성화
- **Rule templates** (managed rules): 활성화
- **Certificate Transparency Monitoring**: 활성화 (rogue cert 발급 시 이메일 알림)
- **Email Security (DMARC + SPF + DKIM null)** Cloudflare wizard 자동 set:
  - SPF: `v=spf1 -all` (root)
  - DKIM null: `*._domainkey` `v=DKIM1; p=` (wildcard 빈 키 — spoofing 차단 강화)
  - DMARC: `v=DMARC1; p=reject; sp=reject; adkim=s; aspf=s;` (root + subdomain reject + strict alignment)
- **DNSSEC**: Enable (DS record Cloudflare Registrar 자동 등록)
- **Multi-signer DNSSEC / Multi-provider DNS**: Skip (Cloudflare 단일 provider)
- **Zero Trust Email Security**: Skip (이메일 인박스 없음)
- **ACM ($10/월) / Total TLS**: Skip (Universal SSL 무료로 충분)

**비활성화**: Detection tools - Fraud (결제 미적용 단계), Super Bot Fight Mode (Pro plan), Turnstile (form 없음)

**향후 활성화 검토**:

- Preload (HSTS): 안정 운영 3-6개월 후 max-age 2y + Preload ON → hstspreload.org 등록
- Email Routing: support/security 인박스 운영 시작 시
- ACM: DAU 1000+ 또는 multi-tenant subdomain 출시 시
- Zero Trust Email Security: 이메일 서버 운영 시작 후

### 다음 세션 시작점 (Brand/Domain Decision)

**선결 작업** (사용자가 다음 세션 시작 전 또는 시작 시 결정):

1. **도메인 가용성 조사**:
   - WHOIS 조회 도구: https://who.is, https://lookup.icann.org
   - 가용성 검사: https://porkbun.com, https://www.cloudflare.com/products/registrar/, https://domains.google
   - 만료 임박 도메인: https://www.snapnames.com, https://www.dropcatch.com

2. **상표 검색 (필수)**:
   - USPTO TESS (미국): https://tmsearch.uspto.gov
   - EUIPO (유럽): https://euipo.europa.eu
   - KIPRIS (한국): https://www.kipris.or.kr

3. **`.com` 인수 옵션 (사용자 질문 답)**:
   - WHOIS 로 owner 확인 (대부분 GDPR privacy proxy — proxy forward 이메일은 보임)
   - 사용 상태 4가지: Parked+sale (즉시 buyout) / Parked-no-sale (broker 협상) / Active site (거절 多 또는 매우 비쌈) / Expiring (drop catch)
   - Broker 서비스: GoDaddy Domain Broker ($69 service fee + 협상가) / Sedo (commission ~15%) / Afternic / Dan.com (escrow)
   - 직접 컨택: WHOIS proxy email forward 또는 LinkedIn
   - 가격 범위: parked $500~5K / Sedo buyout $3K~20K / active $10K~100K+ / premium $50K+
   - 1Password 도 1password.com 인수에 수년 걸림 → .app 으로 시작은 정상 경로

4. **후보 비교 표** (다음 세션 시작 시 사용자 직접 선택):
   - 사용자가 Vaultmap / Secretbank / Lockmesh / 기타 신규 후보를 USPTO + 도메인 가용성 매트릭스로 평가

### Phase A + B 통합 영향 범위 (도메인 결정 후 일괄 적용)

**Phase A (사용자 노출 면)**:

- `site/index.html` (Sub-task 2 working tree 보존, URL 일괄 교체)
- `site/latest.json` (Sub-task 3)
- `src-tauri/tauri.conf.json` updater endpoint (Sub-task 3)
- `ee/cloudflare/download-proxy/src/index.ts` `MANIFEST_URL` + `Access-Control-Allow-Origin`
- `ee/cloudflare/download-proxy/wrangler.toml` routes 4개
- `docs/RELEASE_GUIDE.md` 도메인 명시 (Sub-task 5)

**Phase B (코드 내부 broad rename)**:

- GitHub repo 이름 (`phoodul/secretbank` → `phoodul/<new>`, GitHub 자동 redirect 7년)
- Worker `REPO` 상수
- Cargo.toml workspace name + `package.name`
- 27 Rust crate 이름 (`secretbank-app`, `secretbank-cli`, `secretbank-core`, ...)
- package.json `name` (root + vscode-extension)
- Tauri identifier (`app.secretbank` → `app.<new>` — 0 사용자 / dogfooding 시작 직전이라 영향 ❌)
- CLI binary 이름 (`Secretbank` → `<new>` 또는 짧은 alias)
- VS Code extension publisher (`secretbank`)
- 이메일 / 로고 / 카피 / docs 전반

**예상 작업량**: Phase A ~3 commits / Phase B ~10~20 commits. broad rename 자동화 도구 (sed-style) 사용 + 수동 검토 병행.

---

## [2026-05-07] 다음 세션 = Dogfooding (Phase 2-2B + 3-A 풀체인 검증)

### 사용자 결정 (resume 세션 종료 직전)

> "Phase 2-2B + 3-A 풀체인 구현 끝났으므로, 다음 세션은 Phase 3-B / 4 / M14 진입 전에 dogfooding 1~3 일 먼저."

### 사용자 시정 1차

> "Dogfooding 은 `pnpm tauri dev` 가 아니라 **다른 사람처럼 URL 에서 다운로드 받아 시행** 해야 한다."

### 사용자 시정 2차 — GitHub 다운로드 방식 거부

> "GitHub 에서 다운로드 하는 방식을 원하지 않아. 실제 **secretbank.app** 에서 다운로드 받기를 원해."

**근거**: 진짜 사용자 흐름 = 검색/링크로 secretbank.app 방문 → "Download for Windows/macOS/Linux" 버튼 → 다운로드 → 설치. 브라우저 주소창에 GitHub 노출되면 1Password/Bitwarden 동등 신뢰감 ❌. 회사 방화벽으로 GitHub 차단된 환경도 커버해야 함.

**현재 site/index.html 의 다운로드 로직** (`site/index.html:1850~1949`): `api.github.com/repos/phoodul/secretbank/releases` API 호출 + `asset.browser_download_url` (= GitHub CDN) 으로 redirect. 사용자가 원하지 않는 방식.

### 사용자 결정 — Cloudflare Worker proxy (옵션 가)

secretbank.app/download/&lt;filename&gt; 요청 → Cloudflare Worker → GitHub Releases CDN stream-proxy. 사용자 브라우저는 secretbank.app 도메인에서 다운로드한 것으로 보임.

**구현 항목** (다음 세션):

1. **신규 Cloudflare Worker** `download-proxy` 또는 `ee/` 의 기존 relay 확장 — `/download/<filename>` 라우트 → GitHub Releases asset stream-proxy
2. **신규 endpoint** `secretbank.app/api/latest` — 최신 release manifest (자체 JSON, GitHub API 직접 호출 ❌, Worker 가 캐시)
3. **`site/index.html` 수정** — `api.github.com` 호출 ❌, `/api/latest` 호출 + 다운로드 링크 `https://secretbank.app/download/...` 로 변경
4. **`site/latest.json`** — tauri-plugin-updater endpoint. 현재 GitHub Releases 가리키는지 확인 후 secretbank.app 자체 endpoint 로 변경
5. **`docs/RELEASE_GUIDE.md`** 갱신 — 새 흐름 반영
6. **dogfooding 시 검증** — secretbank.app 어디에도 "github" 단어 미노출 확인 (브라우저 주소창 / 다운로드 링크 / 자동 업데이트 manifest)

**비용**: Cloudflare Workers 무료 티어 (10만 req/day) 충분. 추가 0원.

**향후 (선택)**: Cloudflare R2 자체 호스팅으로 전환하면 GitHub 의존 완전 제거. 다음 결정 시점.

### A. Dogfooding 진짜 절차 (정정)

#### Pre-step 1: Cloudflare Worker download-proxy 배포 (신규)

다음 세션 implementator 가 처리:

- `ee/cloudflare/download-proxy/` (또는 적절한 위치) Worker 작성 — `/download/<filename>` 라우트 + `/api/latest` endpoint
- `wrangler deploy` → secretbank.app 도메인 라우팅 설정
- `site/index.html` 다운로드 로직을 `/api/latest` + `https://secretbank.app/download/...` 로 정정
- `site/latest.json` 또는 tauri updater endpoint 정정

#### Pre-step 2: pre11 release 생성

기존 인프라 활용 — `.github/workflows/release.yml` + `docs/RELEASE_GUIDE.md` 완비. 이전 v0.1.0-pre1~pre10 10회 release 이력.

```powershell
# 1. 버전 bump
git tag v0.1.0-pre11
git push origin v0.1.0-pre11

# 2. GitHub Actions release.yml 자동 트리거 → 다중 OS installer 빌드 (draft)
#    - GitHub Releases 에 자산 업로드 (Worker 가 proxy 할 backend)
#    - 사용자에게는 노출 ❌
```

#### Dogfooding 시나리오 (secretbank.app 사용자 흐름)

1. **secretbank.app 접속** → 랜딩 페이지 → 자동 OS 감지 → "Download for {OS}" 버튼
2. **버튼 클릭** → `https://secretbank.app/download/secretbank_0.1.0-pre11_x64-setup.exe` (브라우저 주소창에 **secretbank.app 만 노출**, GitHub 단어 ❌)
3. Cloudflare Worker → GitHub Releases CDN stream-proxy → installer 다운로드
4. **"unidentified developer" / SmartScreen / Gatekeeper 경고 확인** — 실제 사용자가 만나는 마찰. signing 적용 여부 검증
5. **설치 → 실행** — DevTools ❌ / source map ❌ / hot reload ❌ / 개발 의존성 ❌
6. **첫 실행 onboarding** — vault 생성 / Charter 발급 (PDF 출력) / passphrase 설정
7. **실제 사용 시나리오**:
   - Phase 2-3-a CSV import (Chrome 비번 export → drag-drop)
   - Phase 2-4-a Cmd+K Quick Add (클립보드 prefill + URL auto-detect)
   - Phase 2-2B Watchtower (Settings HIBP opt-in 활성화 → [Run Check] → 5 카테고리 결과)
   - Phase 3-A 신용카드 (Credit Card kind → BIN 자동 감지 → 미리보기 그레이디언트 → 저장 → BentoCard 그리드 → Detail reveal 카드번호/CVC → **30초 자동 클리어 검증** → **마스킹 상태 flip 금지 검증**)
8. **i18n 4 로케일 전환** (en/ko/zh/ja) — 신규 UI 정상 번역 확인
9. **자동 업데이트 검증** (M13 updater) — 다음 release 시 in-app update 안내 표시 + minisign 서명 검증
10. **백그라운드 동작** — 24h scheduler / 시스템 트레이 / 자동 잠금 (M9 cooldown)
11. **회귀** — Phase 1.5 hover mini-graph / 1.5-D issuer pair labels / 기존 BentoCard / IncidentsPage

### B. UX 이슈 발견 시 우선순위

- **Critical (출시 블로커)**: 데이터 손실 / 평문 노출 / 보안 룰 위반 → 즉시 fix
- **High (출시 전 fix)**: 키보드 접근성 / i18n 누락 / 빈 상태 미흡 / 에러 메시지 모호
- **Medium (Phase 3-B 와 병행)**: 마이크로 인터랙션 부드러움 / 로딩 표시 / hover 상태
- **Low (개선 backlog)**: 색상 미세 조정 / 폰트 / 여백

### C. Dogfooding 후 진입 순서 (확정)

1. Dogfooding 보고서 (`docs/dogfooding_phase2_2b_3a.md`) — 발견 이슈 + fix 우선순위
2. Critical / High 이슈 fix
3. Phase 3-B (secure_note) 진입 — `ux_research_phase3.md` §2 기반
4. 그 후 Phase 4 (카테고리) → 3-C (passkey)

### D. ChatGPT 사전 조사 (`user_research/chatgpt_answer_0.md`) 와 정합 확인

이미 구현된 핵심 권고: graph 관계 / 공급자 사고 알림 / push protection / Watchtower 동등.
미구현 권고 = M14 자동 rotation (장기 로드맵), 단기 토큰 / OIDC 우선 가이드 (RAILGUARD M5 확장 가능). dogfooding 결과에 따라 우선순위 재평가.

---

## [2026-05-07] Phase 3-A GATE 2 일괄 승인 (Integrator 권고 7항목)

### 사용자 결정

Integrator 보고서 (`docs/integrator_report_phase3a.md` §5) 권고 7항목 모두 일괄 승인.

| GATE | 결정                                                                                   |
| :--- | :------------------------------------------------------------------------------------- |
| 2-1  | DB 스키마 = **별도 `credit_card_meta` 테이블** (마이그레이션 0012, Phase 3-B/C 일관성) |
| 2-2  | 카드번호 reveal = **30초 자동 클리어** (CVC 와 동일, 보수적)                           |
| 2-3  | BIN 표 = **하드코딩** (`src/lib/card-utils.ts`, 의존성 0개)                            |
| 2-4  | 3D flip — 마스킹 상태 = **flip 완전 금지** (THREAT_MODEL §4 보수적)                    |
| 2-5  | 청구주소 = **포함** (선택 텍스트 필드, 1P 동등)                                        |
| 2-6  | PIN 필드 = **미룸** (Phase 3-B/4 사이)                                                 |
| 2-7  | 3D flip 사용 = **3D flip** (1P 동등 차별화, prefers-reduced-motion 시 즉시 전환)       |

### Sub-task 분할 (6개, 11~13 commits 예상)

1. 3-A-1: `CredentialKind::CreditCard` + DB 마이그레이션 0012 + Rust 모델 (`CreditCardMeta` / `CreditCardSecret` / `CreditCardSummary` / `CreditCardInput`) + Repo
2. 3-A-2: `src/lib/card-utils.ts` BIN 감지 + 그레이디언트 + 포맷팅 (4-4-4-4 + Amex 4-6-5)
3. 3-A-3: `CreditCardVisual` 3D flip (마스킹 상태 flip 금지)
4. 3-A-4: `CreditCardForm` 자연 순서 + 입력 마스크 + Zod
5. 3-A-5: `CreditCardDetail` + `reveal_card_number` / `reveal_cvc` Tauri commands (30s 자동 클리어 + audit + capability)
6. 3-A-6: BentoCard 통합 + i18n 4 로케일 + Vitest

### 보안 룰 (B.1 + B.5 모두 적용)

- `card_number` / `cvc` / `pin` = `SecretBox<String>` + Zeroizing on drop
- `valueHint` last_4 만 frontend 전달 (B.5-3)
- BIN 감지 prefix 6자만 (B.5-5)
- vault encryption (age) 동일 (B.5-4)
- reveal 별도 Tauri command + 30s 자동 클리어 (B.5-2)
- audit log 기록 (reveal 작업 모두)

### 위험 처리

- R1 (MEDIUM) BIN 표 정확성 → implementator 가 Wikipedia IIN Ranges 1회 교차 확인
- R2 (MEDIUM) screenshot 캡처 미차단 → Phase 3-A 미구현, 잔여 위험 placeholder. 장기 macOS NSWindow secureContentView / Windows DRM
- R3 (LOW) DB 호환 → 0012 신규 테이블만, ALTER ❌
- R4 (LOW) 입력 마스크 라이브러리 → react-number-format 또는 IMask, implementator 결정

### 다음 액션

1. progress.md 갱신
2. Phase 3-A-1 implementator 호출 (CredentialKind + DB + Rust 모델 + Repo)

---

## [2026-05-07] Phase 2-2B 풀체인 완료 + Threat model 작성 후 Phase 3-A 진입

### 사용자 결정

> Phase 2-2B 풀체인 완성 후, Phase 3-A 신용카드 진입 전 Threat model 문서 (STRIDE) 1회 작성.

### A. Phase 2-2B 풀체인 결과 (2026-05-07)

5 sub-task / 9 commits / 누적 16 commits (research + integrator + 5 features + 4 docs + 2 final).

- `e26cc2d` PwnedPasswordsClient (HIBP k-anonymity)
- `3714c34` security_check + twofa_directory
- `13758ca` SQLite 0011 + Repo + scheduler skeleton
- `1dd89f4` 4 Tauri commands (concurrency 10 + audit)
- `0c98e13` WatchtowerPage + Settings opt-in + i18n 4 로케일

검증: cargo test 230+ passed / clippy 0 / fmt PASS / typecheck 0 / vitest 9 신규 PASS.

위험 처리: R1 (zxcvbn `Score::PartialOrd` derive 됨, `u8::from()` 비교) / R3 (HIBP 부분 실패 → `hibp_failed: true`) / R4 (`Credential.totp_uri` 부재 → `secondary_value_ref` + label fallback).

### B. 다음 액션 — Threat model 문서 작성 후 Phase 3-A

1. **Threat model 문서** (`docs/THREAT_MODEL.md`) — 30분 작업, STRIDE 분석
   - 자산 식별: vault file (age 암호화) / master passphrase / Charter recovery key / audit log chain / credential data / sync key / 외부 API key
   - 신뢰 경계: frontend ↔ Tauri IPC ↔ Rust backend ↔ SQLite ↔ 외부 API (HIBP / 2fa.directory / OSV / RSS) ↔ Cloudflare relay
   - STRIDE 매트릭스: 각 자산 + 경계별 위협 + 완화책
   - 잔여 위험 명시 (LLM 한계 인정 — 외부 보안 감사 출시 전 1회 필수)
2. **Phase 3-A integrator 호출** — `ux_research_phase3.md` §1 (신용카드 UI) 기반 통합 보고서 작성
3. **USER APPROVAL GATE 2** — Phase 3-A 사양 승인
4. **Phase 3-A implementator 연속 호출** (Night mode 동등)

### C. Phase 3-A 적용할 보안 룰 ([2026-05-07] B.1 + 사용자 추가 결정)

- 카드번호 + CVC = sensitive secret. 둘 다 `SecretBox<String>` + `Zeroizing` 즉시 래핑
- CVC reveal **30초 자동 클리어** (1Password 와 다름 — 보수적)
- 카드번호 마스킹 frontend 에서 `valueHint` 마지막 4자만
- 별도 SQLite 테이블 (옵션 Y) → vault encryption 동일 (age) → vault unlock 시에만 평문 디크립트
- BIN 감지는 prefix 6자만 사용, full hash 미사용 (k-anonymity 원칙)

---

## [2026-05-07] Phase 2-2B GATE 1 일괄 승인 (Integrator 권고 7항목)

### 사용자 결정

Integrator 보고서 (`docs/integrator_report_phase2_2b.md` §4) 권고 7항목 모두 일괄 승인. 변경 없음.

| GATE | 결정                                                                                 |
| :--- | :----------------------------------------------------------------------------------- |
| 1-1  | HIBP opt-in 기본값 = **비활성** (첫 실행 시 안내 배너로 활성화 유도)                 |
| 1-2  | WatchtowerPage = 사이드바 **신규 최상위 섹션** (Inventory 아래)                      |
| 1-3  | 스케줄 = **24h 자동 + 수동 [Run Check] 병행**                                        |
| 1-4  | Vulnerable vs Compromised = **별도 카테고리** (1P 동등)                              |
| 1-5  | HIBP 동시성 = **concurrency = 10** + tokio JoinSet (1000개 ≈ 10초)                   |
| 1-6  | audit log = **수동 실행만** (24h 자동은 tracing 로그)                                |
| 1-7  | `alert_meta` JSON = **평문 메타데이터** (count/score/domain — 비번/필드 자체 미포함) |

### B.1 보강 사항 (모든 implementator 호출 자동 적용)

- B.1-4 — HIBP suffix 길이 != 35자 행 skip guard
- B.1-5 — `run_security_check` Tauri capability deny-by-default
- B.1-6 — 수동 실행 시 audit log (M6 chain)
- B.1-9 — 에러 메시지 범용화 (URL/credential ID 미노출)

### 위험 요소 처리

- R1 (HIGH): zxcvbn Score PartialOrd → implementator 가 docs.rs 직접 확인 후 미지원 시 `matches!` 매크로
- R4 (MEDIUM): `Credential.totp_uri` 부재 → 2-2B-2 에서 fallback 로직 (`secondary_value_ref` 또는 `name`/`label` 기반 추론), 별도 마이그레이션은 별도 결정

### 다음 액션

1. progress.md / loop_count.json 갱신
2. Phase 2-2B-1 implementator 호출 (PwnedPasswordsClient + Add-Padding + ConstantTimeEq + wiremock 7 테스트)

---

## [2026-05-07] Phase 3 진입 전 Phase 2-2B (Watchtower 동등 풀체인) 우선

### 사용자 결정 (resume 세션)

> "Phase 3-A (신용카드) 진입 전, Phase 2-2B (HIBP password check) 를 먼저 풀체인으로 끝낸다."

### A. 결정 사항

1. **순서 갱신**: Phase 2-2B → Phase 3-A → 3-B → 4 → 3-C (기존 m24_vision 와 정합)
2. **2-2B 범위 (옵션 가)**: **1Password Watchtower 동등 풀체인**
   - HIBP Pwned Passwords API k-anonymity range lookup (`/range/<5-char SHA1 prefix>`)
   - 재사용된 비밀번호 검출 (vault 내 동일 password hash 카운트)
   - 약한 비밀번호 검출 (zxcvbn 또는 동등 라이브러리, score ≤ 2)
   - 2FA 가능 계정인데 TOTP 미설정 경고
   - UI: Watchtower 페이지 (또는 IncidentsPage 통합) + BentoCard 배지
3. **예상 작업량**: 7~8 commits (researcher → implementator 2~3회 → ux-designer 검증)

### B. 보안 우선 적용 ([2026-05-07] B.1 Security Spec 모두)

- **range_lookup 만 사용** — 풀 hash 전송 ❌, k-anonymity 만
- **password 평문은 SecretBox 즉시 래핑** — SHA1 prefix 추출 후 즉시 zeroize
- **HIBP API call rate limit** — 기존 governor 재사용
- **timing-safe 비교** — `subtle::ConstantTimeEq`
- **재사용 검출은 vault unlock 시 메모리 내** — DB 평문 저장 ❌
- **error message 누설 방지** — 어떤 password 가 pwn 되었는지 사용자 본인만 보이도록

### C. ux_research_phase3.md 처리

- **먼저 docs(research) 로 단독 커밋** — Phase 3 진입 시 즉시 사용 가능. 미커밋 보류 ❌.

### D. 다음 액션

1. ux_research_phase3.md 커밋
2. Researcher 호출 — HIBP Pwned Passwords API + zxcvbn + 1P Watchtower 비교 자료
3. Researcher 결과 → integrator 호출 (Phase 2-2B 사양 통합)
4. implementator 사양 작성 (F.2 Spec + Security Spec)
5. implementator 호출 (TDD)

---

## [2026-05-07] 보안 절대 우선 + "1인 + LLM 가능성 검증" 단계 정의

### 사용자 결정 (직접 인용)

> "물론 영원히 혼자서 하는 건 말이 되지 않아. 본격적으로 사업성이 생긴다면 직원을 채용하고 확대해야지. 다만 그 가능성을 확인해보는 거야. 정말 보안사고가 나면 최악이라고 할 수 있지. 보안사고가 나지 않도록 가장 안전하게 만들어야 하는 게 맞아."

### A. 현 단계 = 가능성 검증 (Feasibility validation)

- 영원히 1인 ❌. 사업성 생기면 채용 + 확대.
- 채용 우선순위 (사업성 검증 후): (1) 보안 엔지니어 → (2) iOS/Android → (3) 디자이너 → (4) DevOps/on-call → (5) 마케팅.

### B. 보안 절대 우선 — Security-First Spec (최상위 룰)

다른 모든 결정 (속도/비용/기능/일정/UX) 과 충돌하면 보안 우선.

#### B.1 매 implementator 호출 시 적용 (F.2 Spec 와 동급)

1. 암호학 직접 구현 ❌ — `age` / `argon2` / `chacha20-poly1305` / `ed25519-dalek` / `secrecy` / `zeroize` 검증된 라이브러리만.
2. 평문 메모리 시간 최소화 — `SecretBox` 또는 `Zeroizing` 즉시 래핑, drop 시 zeroize.
3. 평문 IPC 미통과 — Tauri command 응답에 `valueHint` (마지막 4자) 같은 마스킹 메타만.
4. Input 신뢰 0 — 파서 fuzz-safe, malformed input 으로 panic 안 됨.
5. 공격 표면 최소화 — Tauri capability deny-by-default + 필요한 권한만.
6. 모든 secret 작업 audit log (M6 Audit chain).
7. dependency 보안 검사 자동 (Dependabot / cargo audit / pnpm audit).
8. secret scanning 자기 적용 (GitHub Secret Protection + pre-commit hook).
9. error message 누설 방지 (path / KDF salt / 사용자 식별자 ❌).
10. timing-safe 비교 (`subtle::ConstantTimeEq`, `==` ❌).

#### B.2 출시 전 의무 보안 검증

| 항목                                     | 비용                                | 시기                   |
| :--------------------------------------- | :---------------------------------- | :--------------------- |
| 외부 보안 감사 (pentest + crypto review) | $5~10k                              | 출시 전 1회 + 매년     |
| Bug bounty (HackerOne)                   | critical $500 / high $200 / med $50 | 출시 직후              |
| SOC 2 Type 1 (Drata/Vanta 자동화)        | $5~10k/년                           | 출시 + 6개월           |
| Cryptography review (PhD-level 외부)     | $2~5k                               | vault format 변경 시   |
| Cargo audit / pnpm audit CI gate         | $0                                  | 영구                   |
| Threat model 문서 (STRIDE)               | 본인 시간                           | Phase 3-A 진입 전 권고 |

#### B.3 incident response plan (출시 전 작성 의무)

문서 위치: `docs/SECURITY_INCIDENT_RESPONSE.md` — 0~1h detection / 1~4h 사용자 알림 / 4~24h 임시 조치 / 24~72h RCA + fix / 72h+ post-mortem 공개 + 영향 받은 사용자 무료 회복.

#### B.4 LLM 한계 인정

Claude Opus 4.7 도 cryptography 미세 실수 가끔 함. 매 implementator 호출 후 보안 critical 코드 (vault.rs / kdf.rs / connector auth / IPC boundary) 본인 직접 review + 외부 보안 감사 출시 전 1회 필수. **LLM 만 믿고 출시 ❌**.

### C. 이전 비전 결정과 정합

- F.2 Spec (디자인/UX) + Security Spec (B.1) **둘 다 동시 적용**, 한 쪽 희생 ❌
- 충돌 시 보안 우선 (예: 신용카드 3D flip 이 평문 메모리 점유 시간 늘림 → 점유 시간 최소화 우선, 시각 효과는 그 안에서)

### D. 다음 세션 (Phase 3-A) 진입 시 적용

1. implementator 사양에 **F.2 Spec + Security Spec 둘 다 명시**
2. 신용카드 = 카드번호 + CVC = sensitive secret. 둘 다 SecretBox + drop zeroize
3. CVC reveal 30초 자동 클리어
4. 카드번호 마스킹 (`•••• •••• •••• 1234`) frontend 에서 valueHint 마지막 4자만
5. 별도 SQLite 테이블 (옵션 Y) → vault encryption 동일 (age) → vault unlock 시에만 평문 디크립트
6. **Threat model 문서 1회 작성** (Phase 3-A 진입 전, 30분)

---

## [2026-05-07] 비전 명확화 — "시장 출시 가능 수준" 까지 격차 좁히기 (1P / Bitwarden 경쟁)

### 사용자 결정 (2026-05-07, 직접 인용)

> "나의 비전은 단순한 dogfooding 이 아님. 나는 시간이 걸리더라도 1Password 나 Bitwarden 과 경쟁할 수 있는 프로그램을 시장에 내놓고 싶음. 어느 정도는 부족하더라도 강점이 있어서 시장에서 점진적으로 확대되어 가려면 현재의 수준으로는 턱없이 부족한 상태로는 내놓을 수가 없는 거야."

### A. 비전 갱신 — dogfooding 은 검증 수단, 출시는 목표

기존 `m24_vision.md` 의 "dogfooding 우선" 은 검증 단계의 하나로 **격하**. 진짜 목표 = **시장 출시 가능 수준 + 점진 확대**.

- "MVP 충분" 또는 "dogfooding 만으로 출시" 는 **금지**.
- 우리 강점 (dependency graph / supply chain / RAILGUARD / MCP / multi-source incident feed) 만으로는 일반 사용자에게 **충분하지 않음** — 데이터 type / autofill / 기본 기능에서 1P / BW 와 비교당함.
- 시장 진입 = 강점 + **최소 동등 수준의 기본 기능** 두 축 동시 충족.

### B. "시장 출시 가능 수준" 정의 (Launch Readiness 체크리스트)

격차 분석 [2026-05-07] 의 5 영역 (A 사용 환경 / B 데이터 type / C 가족·팀 / D 보안 검사 / E 운영) 기준 우선순위:

#### B.1 Tier 1 — Launch Blocker (이거 없으면 출시 불가)

| 항목                                                               | 작업량                               | 비고                                     |
| :----------------------------------------------------------------- | :----------------------------------- | :--------------------------------------- |
| **데이터 type 확장** (신용카드 / secure note / passkey)            | 큼 (Phase 3 진입)                    | 1P 격차 가장 가시적. **이번 결정 (나)**. |
| **카테고리 / 폴더 시스템**                                         | 작 (1~2 commits)                     | dogfooding 때 즉시 통증. Phase 4 신설.   |
| **브라우저 확장 (Chrome / Firefox / Safari / Edge)**               | 매우 큼 (M24-E placeholder → 실구현) | autofill 없으면 daily driver 불가        |
| **모바일 (iOS / Android)**                                         | 매우 큼 (M11 placeholder → 실구현)   | autofill 없으면 daily driver 불가        |
| **HIBP password check**                                            | 중 (2-2B 미룸 → 합류)                | Watchtower 동등                          |
| **CSV 외 import 다양화** (Bitwarden JSON / 1pux / Apple / Firefox) | 중 (2-3-b ~ 2-3-d)                   | 마이그레이션 필수                        |
| **2FA / TOTP 자동 채움**                                           | 중                                   | 1P 의 핵심 기능                          |
| **자동 잠금 + 생체 인증** (이미 일부)                              | 작 (강화)                            | 신뢰성                                   |

#### B.2 Tier 2 — Launch Strengthener (출시 후 단기 확대)

| 항목                                             | 작업량                       |
| :----------------------------------------------- | :--------------------------- |
| Family / Shared vault (M19)                      | 큼                           |
| 첨부 파일 (PDF / 이미지)                         | 중                           |
| Send (자동 만료 일회성 공유)                     | 중                           |
| Emergency access (신탁자)                        | 중 — Vault Charter 와 차별점 |
| Travel mode (1P 만 보유)                         | 작 (niche)                   |
| 더 많은 issuer preset (현재 10 개 → 50+)         | 작                           |
| 강력한 비번 generator (Diceware + entropy meter) | 작                           |

#### B.3 Tier 3 — Differentiation (강점 강화, 시장 확대 후 단계)

| 항목                                            | 작업량                  |
| :---------------------------------------------- | :---------------------- |
| **Auto Rotation (M14)** + dependency graph 통합 | 매우 큼 — 우리만의 차별 |
| MCP tool 확장 (5 → 10+)                         | 중                      |
| 더 많은 incident feed source                    | 중                      |
| Browser extension 의 dependency graph 통합      | 중                      |

### C. 갱신된 진행 순서 (2026-05-07 시점)

이번 세션 직후 진입할 순서:

1. **Phase 3-A — 신용카드 kind** (5~7 commits, 이번 (나) 결정 직접 후속)
2. **Phase 3-B — secure_note kind** (3~5 commits)
3. **Phase 4 — 카테고리 시스템** (사용자 정의 그룹) (2~3 commits)
4. **Phase 2-2B — HIBP password check** (M24 v2 → v1 으로 승격) (5~7 commits)
5. **Phase 3-C — passkey kind** (7~10 commits, WebAuthn / OS API)
6. **Phase 5 — TOTP 자동 채움** (3~5 commits)
7. **Phase 6 — 더 많은 import (Bitwarden JSON / 1pux / Firefox CSV)** (각 3 commits)
8. **M11 — 모바일 (iOS / Android)** — 매우 큼, 별도 마일스톤 시작
9. **M24-E — 브라우저 확장** — 매우 큼, 별도 마일스톤 시작
10. (M14 / M19 / 첨부파일 / Send 등은 출시 후 확대)

### D. 일정 인식

사용자 명시: "시간이 걸리더라도". → 출시 전까지 **수개월** 가능. 단 각 Phase 가 5~7 commits 로 잘게 끊겨있어 매 Phase 마다 검증 + dogfooding 가능.

### E. dogfooding 위치 재정의

- dogfooding ≠ 출시 시기 결정의 종점.
- dogfooding = **각 Phase 의 검증 수단**. 신용카드 만든 직후 본인 카드 등록해보고 UX 이슈 fix → 다음 Phase. 매 Phase 마다 mini-dogfooding 사이클.
- "출시 가능" 시점 = Tier 1 풀체인 완료 + Tier 2 의 50% 이상 + 신뢰성 검증 (외부 사용자 100~500명 베타).

### F. 품질 기준 — "디자인 / UX / 직관성 / 기능 모두 1Password 동등" (2026-05-07 추가)

사용자 명시 (직접 인용):

> "디자인과 UX, 직관적인 사용, 기능 등 모든 수준에서 1password 에 준하는 수준으로 만들거야."

이는 **차별화 (dependency graph 등) 만으로 차이를 메꿀 수 없다** 는 강한 인식. 출시 가능 = 4 축 모두 1P 동등 이상.

#### F.1 4 축의 의미 + 우리 현재 위치

| 축         | 1P 기준                                                                 | 우리 현재                                                    | 격차                                                                               |
| :--------- | :---------------------------------------------------------------------- | :----------------------------------------------------------- | :--------------------------------------------------------------------------------- |
| **디자인** | 일관된 디자인 토큰 / 미세 디테일 (gradient / shadow / spacing) / 브랜딩 | shadcn + Tailwind v4 + Bento Card (M24 1+1.5)                | 🟡 중 — 토큰은 OK, 디테일 (마이크로 인터랙션 / 빈 상태 일러스트) 부족              |
| **UX**     | 학습 0 — 처음 켠 사용자도 5분 안에 vault 가 채워짐                      | Welcome 3단계 + 드롭&스캔 + Quick Add                        | 🟡 중 — Welcome 흐름은 있으나 1P 의 "import 바로 권유" 같은 적극적 onboarding 부족 |
| **직관성** | 라벨 없이도 알 수 있는 아이콘 / hover 즉시 피드백 / undo 흔함           | Bento Card + reason 아이콘 (Phase 2-2A-4) + clipboard 토스트 | 🟢 양호 — 다만 매 Phase 마다 직관성 검증 필요                                      |
| **기능**   | password / 카드 / passkey / note / TOTP / autofill / sharing / family   | password / api_key (pair)                                    | 🔴 큼 — Phase 3 + 모바일 + 확장으로 메꿈                                           |

#### F.2 매 implementator 호출 시 적용할 사양 (F.2 Spec)

**모든 frontend implementator 사양에 다음 항목 추가**:

1. **디자인 토큰만** — hex 하드코딩 금지. `--color-*`, `--radius-*`, `--font-*` 사용.
2. **prefers-reduced-motion 존중** — 모든 애니메이션 단축.
3. **미세 마이크로 인터랙션** — hover / focus / active 모두 200ms 이내 시각적 피드백. 1P 의 "버튼 클릭 시 살짝 가라앉음" 정도.
4. **빈 상태 (empty state)** — 단순 "결과 없음" 텍스트 ❌. 1P 처럼 친절한 안내 + CTA 버튼 ✅.
5. **로딩 / 스켈레톤** — 즉시 피드백, 스피너 단독 ❌, 콘텐츠 모양 미러 ✅.
6. **에러 처리** — 빨강 토스트 ❌, 명확한 원인 + 다음 액션 (e.g. "vault 잠금 해제하세요" + [잠금 해제] 버튼) ✅.
7. **키보드 fully accessible** — Tab order + Enter / Esc / Cmd+K 모두 동작.
8. **i18n 4 로케일** (en / ko / ja / zh) — 1P 도 다국어 지원.

#### F.3 ux-designer agent 정기 호출

매 Phase 종료 직후 **ux-designer 에이전트 호출** 로 검증:

- 신규 UI 컴포넌트 의 1P 동등 수준 검토
- 접근성 (a11y) / 디자인 시스템 일관성 / 모션 정합성
- 발견한 이슈는 fix sub-task 로 즉시 진입.

이는 비용이 들어도 출시 품질 확보의 핵심 단계. dogfooding 으로 못 잡는 미세한 디테일을 ux-designer 가 잡음.

#### F.4 일정 인식 갱신

사용자 명시 "시간이 걸리더라도". → Tier 1 완료 + 4 축 모두 1P 동등은 **3~6 개월** 단위. 이 기간 동안:

- 매 Phase = sub-task 5~7 commits + ux-designer 검증 + mini-dogfooding
- 한 Phase 끝나야 다음 Phase. 병렬 X (1 implementator = 1 commit 룰 유지).
- 모바일 / 브라우저 확장 같은 큰 마일스톤은 별도 streamline 으로.

---

## [2026-05-07] M24 Phase 3 신설 — credential `kind` 3종 확장 (신용카드 / passkey / secure_note)

### 배경 — 1Password / Bitwarden 격차 분석 (2026-05-07)

dogfooding 직전 격차 분석 결과:

- **1P / Bitwarden 이 가진 데이터 type**: password / API key / 신용카드 / **passkey** / secure note / ID document / 첨부파일 / SSH key / software license
- **우리는 password + api_key (pair 모델 포함)** 만 — 격차 큼
- 사용자 직접 예시: "온라인 ID/PW / 개발자 / 신용카드 / PC passkey / Private Secrets (현관문 / 가족 주민번호 / 개인통관)"

### 결정 — 옵션 (나) 채택: kind 3종 확장 즉시 진입

| 옵션                                                    | 사용자 결정 |
| :------------------------------------------------------ | :---------- |
| (가) 카테고리 시스템만 + dogfooding                     | 미선택      |
| **(나) 신용카드 / passkey / secure_note kind 3종 추가** | ✅ **선택** |
| (다) dogfooding 만, 모두 후순위                         | 미선택      |
| (라) 카테고리 + 신용카드만                              | 미선택      |

**작업 순서 (가시성 + 작업량 기준)**:

1. **Phase 3-A — 신용카드 (`credit_card` kind)** — 가장 가시적. 1P 격차의 대표 항목.
2. **Phase 3-B — secure_note kind** — 가장 단순 (자유 텍스트 + 라벨 활용). Phase 3-A 패턴 재사용.
3. **Phase 3-C — passkey kind** — 가장 복잡. WebAuthn / OS API 통합. 후순위.

**카테고리 시스템 (사용자가 이전 메시지에서 제안)**: M24 Phase 3 종료 후 별도 진입 (Phase 4). kind 확장 우선.

### 데이터 모델 결정 (Phase 3-A 진입 전 확정 필요)

3가지 패턴 후보:

- **옵션 X (단일 테이블 + kind enum 확장)**: 기존 `credentials` 테이블에 컬럼 추가 + nullable. 단순하지만 신용카드의 카드번호/CVC/만료일 같은 강타입 필드가 nullable 로 흩어짐.
- **옵션 Y (별도 테이블 join)**: `credential_credit_card` / `credential_passkey` 테이블 신규. main `credentials` 와 1:1 join. type-safe 하지만 cross-table 쿼리 복잡.
- **옵션 Z (JSON blob `type_data` 컬럼)**: 유연하나 type-safety 잃고 마이그레이션 어렵다.

**제 권고**: **옵션 Y (별도 테이블 join)**. 이유 — 우리 Vault Charter / Audit / Yjs sync 모두 schema 명시적. JSON blob 은 sync conflict 시 머지 어렵다. 별도 테이블이 마이그레이션 안전 + type-safe.

→ Phase 3-A-0 sub-task 에서 사용자 확정 필요.

### Phase 3-A 잠정 sub-task 분해 (5~7 commits 예상)

1. **3-A-0**: 데이터 모델 옵션 (X / Y / Z) 사용자 확정.
2. **3-A-1**: 마이그레이션 0011 + `CredentialKind::CreditCard` enum + `CreditCard { number: SecretBox, cvc: SecretBox, expires: String, holder: String, brand: Option<String> }` schema (옵션 Y 가정).
3. **3-A-2**: `CredentialRepo::insert_credit_card` + `credential_credit_card_get` Tauri commands + audit hook + 단위 테스트.
4. **3-A-3**: BentoCard `credit_card` 분기 — masked 표시 (`•••• •••• •••• 1234`) + brand 아이콘 + 만료 + reveal 시 number/cvc 30s 자동 클립보드.
5. **3-A-4**: CreateCredentialDialog kind toggle 에 `credit_card` 추가 + 카드 폼 + brand 자동 감지 (BIN prefix).
6. **3-A-5**: i18n 4 로케일 + Vitest 5~7.
7. **3-A-6**: docs(task / progress / work-log).

### 후순위 (M24 v2 또는 v3)

- 모바일 / 브라우저 확장 (격차 가장 큼이지만 작업량 매우 큼 — M11 / M24-E)
- 첨부 파일 (PDF / 이미지)
- Send (자동 만료 일회성 공유)
- HIBP password check (2-2B) — 변함없이 M24 v2

### 차별화 유지

격차 좁히면서도 우리 강점 (dependency graph / supply chain / RAILGUARD / MCP / multi-source incident feed) 은 그대로 유지. 신용카드 / passkey / secure_note 는 **격차 좁히기**, dependency graph 와 결합되는 통합 시나리오 (Stripe 카드 결제 → 어떤 service 영향 등) 가 후속 차별화 가능.

---

## [2026-05-07] M24 Phase 2-3 / 2-4 — Import 범위 확장 + "마찰 없는 등록 UX" 신설

### 사용자 결정 요지 (2026-05-07)

> "Import 에서 Bitwarden / 1Password 안 쓰는 사람은 그냥 Google 비번을 import 해올 수 있어야 한다.
> 그리고 사용자가 id/pw, api key, token 등을 입력할 때마다 secretbank 에 등록하는 게 쉬워야 하고, 직관적으로 보여야 한다."

### A. Phase 2-3 (Import) 의 범위 확장

이전 plan: 1pux + Bitwarden JSON 만 (m24_vision.md). **갱신**: Google 비밀번호 (Chrome / Edge 가 export 하는 Google 계정 동기화 CSV) 를 **1순위 import** 로 승격.

| 우선순위 | 포맷                                                                                   | 근거                                                                                           |
| :------- | :------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------- |
| **1차**  | **Google CSV** (Chrome / Edge / Brave 의 `chrome://password-manager/passwords` export) | 1P/Bitwarden 비사용자가 가장 많이 쓰는 비번 저장소. 표준 4 컬럼 (`name,url,username,password`) |
| 2차      | Bitwarden JSON                                                                         | OSS, 사용자층 두꺼움                                                                           |
| 3차      | 1Password 1pux (8.x)                                                                   | 유료 사용자, 마이그레이션 동기 큼                                                              |
| 4차      | Firefox CSV / KeePass XML / Safari CSV                                                 | nice-to-have, 우선순위 낮음                                                                    |

- **공통 import 파이프라인**: drag-drop 단일 파일 → 형식 감지 → preview (행 수 / 충돌 / 새 issuer 자동 추출) → confirm. 모두 같은 UI 흐름.
- 모든 import 는 **client-side parsing only**, 평문이 vault DB 들어가기 전에 keyring 으로 암호화 (기존 AgeVaultStorage 그대로).

### B. Phase 2-4 (신설) — "마찰 없는 등록 UX"

매번 사이트에 가입할 때마다 vault 에 등록하는 마찰을 줄이는 게 목표. **dogfooding 의 daily-driver 화** 의 핵심.

후보 (구체적 형태는 별도 결정 필요 — 아래 큐 참조):

| 후보                                                         | 작업량             | 효과                                                                           |
| :----------------------------------------------------------- | :----------------- | :----------------------------------------------------------------------------- |
| **a. Cmd+K Quick Add 강화**                                  | 작음               | 글로벌 hotkey → 모달 → URL/ID/PW 3 필드 + 클립보드 자동 채움 (사용자 액션 1회) |
| **b. System tray + 글로벌 hotkey**                           | 중간               | OS 단축키 (e.g. Ctrl+Shift+V) → tray 메뉴 → 빠른 등록. Tauri tray API 사용     |
| **c. Browser extension** (M24-E placeholder)                 | 큼 (별도 마일스톤) | 사이트에서 입력 시 "Save to Secretbank?" 토스트 (1P/Bitwarden 동등)            |
| **d. CLI quick-add** (`Secretbank add --url ... --user ...`) | 작음               | 개발자 친화 + 스크립트화 가능                                                  |
| **e. 클립보드 monitor (자동 감지)**                          | 보안 위험          | 패스. 명시적 사용자 의도 없는 캡처는 우리 정책 위반                            |

### C. "직관적으로 보여야 한다" — 이미 만든 것 + 추가 요구

- ✅ 이미 만든 차별화: Bento Card 통합 디자인 / hover mini-graph / URL auto-detect / IncidentCard 도메인 매칭 reason 아이콘
- ⏳ Phase 2-3/2-4 에서 강화할 것:
  - Import preview 화면이 **시각적으로** 충돌/신규/중복을 한눈에 보여줘야 함 (텍스트 리스트 ❌, 색상 배지 + 아이콘 ✅)
  - Quick Add 가 **최소 3 클릭 / 최대 5 초** 이내 완료
  - 등록 직후 BentoGrid 에 새 카드가 **slide-in 애니메이션** (prefers-reduced-motion 지키면서)

### D. M24 Phase 우선순위 갱신 (2026-05-07)

[2026-05-06] 결정 (옵션 가) 의 **2-2B (HIBP Password check) 진입을 후순위로 미룸**. 사용자 비전: "daily driver 화" 가 더 시급.

**갱신된 순서**:

1. ✅ 2-1 (URL auto-detect) — 완료
2. ✅ 2-2A (HIBP Breaches feed + 매칭) — 완료
3. ✅ 2-2C-a/b (CISA + NCSC + KISA RSS) — 완료
4. **다음 → 2-3 (Import: Google CSV 1차)** — 새 결정
5. **그 다음 → 2-4 (마찰 없는 등록 UX: 구체 형태 결정 후 진입)**
6. 후순위로 밀림: 2-2B (HIBP Password check), 2-2C-c (ENISA / JVN / JPCERT), 2-3-2nd~4th (Bitwarden/1pux/Firefox)

### E. 사용자 결정 — 진입 순서 + Quick Add 형태 (2026-05-07 확정)

**Gate 1 응답:**

- 진입 순서: **(가) 2-3 Import 먼저** → 이후 2-4 Quick Add → 2-4 CLI
- Quick Add 형태: **(a) Cmd+K Quick Add 강화 + (d) CLI quick-add**. (b) Tray + hotkey 는 보류, (c) 브라우저 확장은 별도 마일스톤 (M24-E placeholder).
- 권고대로 진행 = 하나씩 순서대로 1 implementator = 1 commit 룰 유지.

**확정된 sub-task 순서**:

1. **2-3-a Google CSV import (1차)** — Chrome / Edge / Brave 가 export 하는 표준 4-컬럼 (`name,url,username,password`) CSV → drag-drop → preview → confirm → BentoGrid 등록.
2. **2-3-b Bitwarden JSON import** — 2차.
3. **2-3-c 1Password 1pux import** — 3차.
4. **2-4-a Cmd+K Quick Add** — 글로벌 hotkey (이미 있는 Cmd+K 팔레트에 "Add credential" 액션 + URL/ID/PW 3 필드 + 클립보드 자동 채움).
5. **2-4-d CLI quick-add** — `Secretbank add --url ... --user ... --pw ...` (CLI 크레이트가 이미 있으니 subcommand 추가).

**HIBP Password check (2-2B) 의 미래**: M24 v2 로 미룸. v1 = "쉬운 등록 + 직관" 까지가 dogfooding 의 최소 조건. v2 = Pro 진입 직전 합류 후보.

---

## [2026-05-06] M24 Phase 2 — Breach awareness 4 갈래 분기 + 진행 순서

### A. Phase 2-2 (HIBP) 가 두 갈래로 분기 — Breaches feed + Password check

이전 단일 sub-task ("HIBP breach alert") 였던 항목을 두 갈래로 분리.

| 갈래                                      | 내용                                                                                             | 차별 가치                                                           |
| :---------------------------------------- | :----------------------------------------------------------------------------------------------- | :------------------------------------------------------------------ |
| **2-2A: HIBP Breaches feed + 매칭**       | HIBP `/breaches` API → IncidentFeed 통합. breach.Domain ↔ credential.url / issuer.domains[] 매칭 | "Vercel 털림 → 내 vault 의 Vercel 키 영향" 즉시 인지                |
| **2-2B: HIBP Password check**             | 비밀번호 자체가 leak 됐는지 k-Anonymity 검사 (저장 시 자동 + 24h 주기 + 수동 일괄)               | 1Password Watchtower 동등                                           |
| **2-2C: 다국가 breach RSS**               | KISA / 개인정보보호위 / ENISA / CISA RSS 프리셋 추가                                             | 한국·EU·미국 사용자 커버리지 (HIBP 는 글로벌·영어권 위주)           |
| **M25 (별도 마일스톤): Breach Broadcast** | Relay 가 새 breach 폴링 → 사용자에게 이메일 (즉시) / 모바일 푸시 (M11 후) fanout                 | 앱 안 열어도 알림 — Zero-Knowledge 와 양립 (메타데이터만 broadcast) |

### B. 진행 순서 — 옵션 (가): 2-2A → 2-2C → 2-2B → M25

- **이유:**
  - 작업량 / 사용자 가치 비율로 2-2A 가 가장 높음 — M4 IncidentFeed (T049~T058) 인프라 그대로 재사용
  - 2-2A 가 끝나면 dogfooding / 시연에서 즉시 가치 체감 ("Vercel 유출 사고 → 내 키 영향" 라인 표시)
  - 2-2B 의 Password check 는 1Password 동등성 도달이 목표 — 작업량 큼 (DB 마이그레이션 + 백그라운드 스케줄러 + per-credential 검사). 가치도 크지만 후순위.
  - 2-2C 는 가벼워서 2-2A 직후 합류 — 한국 사용자 (쿠팡 / SK텔레콤 / 카카오 등) 커버리지 확보
  - M25 는 EE relay 영역, 별도 마일스톤. 우선 placeholder 등록만.

### C. Zero-Knowledge 와 알림의 경계 — 명확화

- **공개 OK** (알림 / 푸시 / 이메일에 포함 가능): breach 메타데이터 — 사이트명, 날짜, 영향 계정 수, 유출 데이터 종류
- **사적** (Zero-Knowledge 보호 — 클라이언트 측에서만 매칭): "이 사용자가 그 사이트의 키를 가지고 있는지", "이 사용자의 어떤 비밀번호가 leak 됐는지"
- → M25 broadcast 는 generic 이 아니라 **breach 메타데이터까지 포함** 해도 안전. 클라이언트가 받아서 자기 vault 와 매칭.

### D. 한계 정직 공개

- **Zero-Knowledge 트레이드오프**: 앱이 닫혀 있는 동안엔 새 leak 을 detect 불가. 1Password (SaaS, 서버에서 검사) 와의 본질적 차이.
- **격차 좁히는 UX**:
  - Inventory 헤더에 "마지막 유출 검사: N일 전" 표시 (24h 녹색 / 7일 노랑 / 7일+ 빨강 + 검사 CTA 강조)
  - M25 Breach Broadcast (이메일 / 모바일 푸시) — 앱을 열도록 유도하는 채널
  - USER_GUIDE / Settings 한 줄: "주 1회 이상 앱을 열어주세요. 또는 Breach Broadcast (Pro / 추후) 를 켜주세요."

### F. 도메인 매칭 디자인 (2-2A-3, 2026-05-06 확정)

- **Issuer 테이블에 `domains` 컬럼 추가** (마이그레이션 0009, JSON array text). 백엔드가 source of truth — frontend `issuer-presets.ts` 의 domains[] (Phase 2-1) 와 일치.
- **Credential.url 직접 매칭 포함** — 사용자가 입력한 URL host 와 breach.domain 직접 비교. 1Password 와 동일 방식.
- **`MatchReason::Domain` 신규 variant** — IssuerMatch / Keyword 와 별도. UI 에서 "Vercel 도메인 매칭됨" 명확히 표현.
- **subdomain-safe match**: `host === domain || host.endsWith("." + domain)` (Phase 2-1 의 matchIssuerByUrl 과 동일 정책). evil-stripe.com 차단.

### E. 수동 검사 = vault 전체 일괄 (per-card 메뉴 아님)

- **결정:** "유출 검사" 버튼은 Inventory 페이지 헤더 + Settings 양쪽에 1개. 모든 password kind credential 일괄 검사 (병렬 N=8, scan:progress 이벤트 패턴). per-card 메뉴 없음.
- **이유:** 사용자 의도 — "각 카드가 아니라 vault 에 저장된 모든 번호를 한꺼번에 검사".

---

## [2026-05-05] M24 Phase 1.5 — credential value pair 모델 + 카드 hover mini-graph

### A. value pair 모델링 — Option D (secondary_value_ref + 자유 라벨)

- **결정:** credential 1 row 에 secret 1~2개 보유. 새 컬럼 4개 추가:
  - `secondary_value_ref TEXT NULL` — 두 번째 secret 의 vault entry 참조 (없으면 null = 단일 secret)
  - `primary_label TEXT NULL` — primary 의 라벨 (예: `"API Key"`, `"Public Key"`, `"Password"`). null 이면 type 별 fallback (api_key→"API Key:", password→"PW:")
  - `secondary_label TEXT NULL` — secondary 의 라벨 (예: `"Secret Key"`, `"Client Secret"`). secondary_value_ref 와 항상 같이 채워짐
  - issuer preset 에 default 라벨 묶음: Supabase → `["Public Key", "Secret Key"]`, AWS IAM → `["Access Key", "Secret Key"]`, OAuth → `["Client ID", "Client Secret"]`, 기본 → `["API Key", null]`
- **이유:**
  - 사용자 케이스 (Cloudflare 단일 / Supabase pair / AWS access+secret / OAuth client+secret) 모두 1 row 로 자연스럽게 표현
  - "1 row = 1 카드 = 1 rotate 단위 = 1 blast radius 단위" 모델 유지 — 기존 graph / dependency / kill-switch 로직 변경 0
  - 라벨 자유 문자열로 issuer 가 부르는 호칭 그대로 (1Password 의 hardcoded "Username/Password" 보다 직관적)
  - 3개 이상 secret 가진 provider 는 사실상 없음 (있어도 sibling credential 2개로 표현 가능)
- **대안 비교:**
  - Option A (sub_kind enum 확장): enum 추가마다 코드 변경, 자유도 낮음
  - Option B (sibling group_id): 한 카드 = 여러 row 묶기 로직 복잡, rotate 단위 모호
  - Option C (JSON envelope): crypto layer 변경, 부분 reveal 어려움
- **영향:**
  - migration `0007_credential_value_pair.sql` 추가
  - `credential_create` Tauri command — secondary 가 Some 이면 vault 에 두 번째 entry 별도 암호화 후 secondary_value_ref 채움
  - `credential_reveal` — `slot: "primary" | "secondary"` 옵션 파라미터 추가 (default "primary", backward compat)
  - audit log: secondary reveal 도 기록
  - 기존 데이터 100% 호환 (secondary 는 모두 null = 단일 secret)

### B. 카드 hover expand → mini dependency graph

- **결정:** BentoCard hover 시 카드 자동 expand → 미니 dependency graph 시각화 (이 credential 을 중심으로 사용 중인 project 들이 엣지로 연결).
- **이유:**
  - 사용자 비전: "API 키가 어느 project 에 사용되었는지가 등록이 되어서 dependency graph 를 알 수 있고" — 카드 자체가 사용처를 즉시 보여주는 게 직관적
  - 기존 GraphPage 는 전체 그래프 (모든 credential) — 단일 credential 중심 미니뷰는 카드에 inline 으로 보여주는 게 인지 부하 낮음
  - 1Password / Bitwarden 차별점: 그들은 단순 텍스트 "Used in N items", 우리는 시각적 그래프
- **구현:**
  - hover (또는 focus) 시 카드 height auto-expand (CSS transition, prefers-reduced-motion 시 즉시 표시)
  - 미니 SVG 또는 react-flow miniature: 중앙 credential 노드 + 사용처 (project / deployment) 노드 + 엣지
  - 데이터 소스: 기존 `credential_get` 의 usages 배열 → project_id 들을 lookup → ProjectsPage / GraphPage 와 동일 데이터
  - 클릭 시 GraphPage 로 navigate (전체 그래프 + 해당 credential focus)
  - usages 가 0 이면 "Not used in any project yet" placeholder
- **영향:**
  - BentoCard 에 expand state + mini-graph subcomponent
  - card height 가변 → BentoGrid 의 auto-fill 레이아웃 그대로 (rowspan 자동)

---

## [2026-04-28] M9 Sync 진입 — 5건 결정 (Free 2대 / Auto-derive / 화이트리스트 / SecSync / Phased Expansion)

### A. Free 디바이스 정책 — 종류 무관 2대 (Open Issue 1 결정)

- **결정:** Free 사용자는 OS instance **2대까지 무료** (종류 무관 — 데스크탑+폰 / 데스크탑 2대 / 폰 2대 모두 가능). 3대 이상은 Pro 필요.
- **이유:**
  - 1대만 정책 (Dashlane / NordPass) 은 모바일 시대에 너무 빡빡 → 사용자 이탈
  - 무제한 (Bitwarden / 1Password Personal) 은 우리 가격대 ($2/mo) 에서 Pro 가치 깎음
  - "회사 PC + 집 PC + 폰" 3대 조합이 흔함 → 자연스런 Pro 전환 트리거
  - 종류 분류 (데스크탑 1 + 모바일 1 강제) 는 D1 schema 와 페어링 프로토콜에 device_kind 메타데이터 추가로 ~30% 복잡도 증가 — 단순 카운트가 운영 단순
- **갱신:** 기존 project-decisions 의 "Free = 단일 디바이스" 항목은 **본 결정으로 대체** — 향후 갱신 시 본 항목 참조.
- **영향:**
  - T094 entitlement 게이트: 디바이스 카운트 ≥ 3 + tier=free → 거부 + "Upgrade to add more devices" 업셀
  - 릴레이 D1: device 테이블에 `kind` 컬럼은 추가하지만 entitlement 검증에는 안 씀 (UX 표시용 — "이 디바이스: MacBook Pro" 같은 라벨)

### B. Passphrase 재프롬프트 정책 — Auto-derive on unlock (Open Issue 2 결정)

- **결정:** `vault_unlock(passphrase)` 시점에 vault decrypt 와 동시에 `derive_session_keys` 자동 호출, `enc_key` 메모리 적재, **passphrase 즉시 zeroize**. Sync 활성화 시 사용자에게 passphrase 재입력 요구하지 않음.
- **이유:**
  - **보안 등가성:** vault unlocked 동안 vault file decryption key 가 어차피 메모리에 있다. attacker 가 process memory 접근 권한이 있으면 양쪽 다 노출 — enc_key 추가가 attack surface 안 늘림
  - **Zero-Knowledge 정의:** 서버가 enc_key 를 못 본다는 의미 — 디바이스 메모리 보관 여부와 무관
  - **UX 일관성:** 1Password / Bitwarden / Dashlane 모두 master pw 한 번 = 모든 기능 활성. 우리만 다르면 사용자 이탈
  - **passphrase 자체는 즉시 wipe:** `secrecy::SecretString` 의 `zeroize` 로 derive 직후 메모리에서 삭제, `enc_key: SecretBox<[u8;32]>` 만 보관
- **구현 디자인:**
  - `AgeVaultStorage` 는 unlock 후 password 를 보관하지 않으므로 (Identity 만 보관), vault 내부 derive 메서드 추가는 불가
  - 대신 `commands/vault.rs::vault_unlock` 커맨드가 password 를 받아 `vault.unlock(password.clone())` 호출 직후 **그 자리에서** `derive_session_keys` 호출, AuthSession.enc_key 적재 후 password drop (`SecretString` 의 자동 zeroize)
  - `AuthSession` 에 신규 필드:
    - `salt_auth: Option<String>` (base64url, 영속)
    - `salt_enc: Option<String>` (base64url, 영속)
    - `enc_key: Option<SecretBox<[u8;32]>>` (Debug/Serialize skip, **메모리만**)
  - verify 커맨드들이 salts 를 frontend 로부터 받아 AuthSession 에 저장 (start 응답의 salts 를 frontend 가 verify 호출 시 다시 송신 — round-trip 단순화)
  - `vault_lock` 시 `auth_session.enc_key = None` 강제 (Drop 자동 zeroize)

### C. SQLite Sync 화이트리스트 (Open Issue 3 결정)

- **결정:** Sync 대상은 **명시 화이트리스트** 로 관리. 새 entity 추가 시 sync 여부 명시적 opt-in.
- **이유:**
  - **보안 사고 방지:** 새 entity (예: 미래 webhook log) 가 의도치 않게 server 로 sync 되어 Zero-Knowledge 깨짐 방지
  - **보안 audit 단순화:** "어떤 데이터가 sync 되는가?" 한 곳 문서화
  - **CRDT 구조와 일치:** SecSync 의 변경 추적은 `Y.Map.observe` — observe 안 하는 entity 자동 device-local
- **Sync 대상 (CRDT)**:
  - `credential` — issuer*id / name / kind / status / last_rotated_at *(value 자체는 별도 채널 T091)\_
  - `issuer` — 사용자 정의 issuer 메타
  - `project` / `deployment` — 모든 메타
  - `usage` — credential ↔ project 관계
  - `settings` 의 `Secretbank.settings.shared.*` prefix — auto-lock 시간, NVD API key 등 vault-level
- **Device-local (sync 안 함)**:
  - `audit_entry` — 디바이스별 hash chain + Ed25519 서명 (sync 시 verify 깨짐)
  - `github_installations` — 디바이스별 OAuth state
  - `settings` 의 `Secretbank.settings.local.*` prefix — UI 테마, language
  - `vault_ref` 같은 디바이스 로컬 reference
  - `onboarding.done` 플래그

### D. SecSync 라이브러리 채택 (잠정 — Phase C 진입 시 stable 검증) (Open Issue 4 결정)

- **결정:** `secsync` (Serenity Kit, MIT) 를 Yjs E2EE sync layer 로 채택. 단 **Phase C 진입 시점에 stable 여부 1차 검증** 후 확정.
- **이유:**
  - 자체 구현 = +1주 + 보안 사고 위험. SecSync 의 "snapshot encryption + delta encryption + ephemeral message + key rotation" 디자인은 그냥 Yjs+AEAD 보다 훨씬 정교
  - MIT 라이선스 — AGPL-3.0 코어와 호환
  - TypeScript 기반 — React 19 + TS 5.x 와 자연 통합
- **Phase C 진입 직전 검증 체크리스트** (5개 중 ≥ 3 fail 시 fallback D = Yjs + 자체 transport):
  - [ ] 최근 6개월 release/commit 활동 (GitHub serenity-kit/secsync)
  - [ ] Yjs 13.6.x 호환
  - [ ] React 19 + TypeScript 5.x 충돌 없음
  - [ ] 알려진 보안 이슈 (CVE / advisory) 없음
  - [ ] Cloudflare Workers (D1 + KV + Hono) transport 통합 사례
- **Fallback (D):** Yjs + 자체 AEAD transport — snapshot/delta 분리 우리가 직접 설계 (+1주 추가 일정)

#### D.1 [2026-04-28 Night mode 4 갱신] — secsync 검증 결과: **3/5 fail → fallback D 채택**

Phase C 진입 시점에 위 5개 체크리스트로 1차 검증 (npm + GitHub + 공식 docs 조사). 결과:

| #   | 체크                                          | 결과         | 근거                                                                                                                                                                                           |
| :-- | :-------------------------------------------- | :----------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 최근 6개월 release/commit 활동                | ❌ FAIL      | npm 마지막 publish `0.5.0` (**2024-06-04, 22개월 정지**). GitHub "No releases published"                                                                                                       |
| 2   | Yjs 13.6.x 호환                               | ⚠️ 추정 호환 | 공식 docs `useYjsSync` 예제 — yjs major 호환 가능성 높음, 다만 검증 안 함                                                                                                                      |
| 3   | React 19 + TypeScript 5.x 충돌 없음           | ⚠️ 추정 호환 | 95.3% TypeScript, 다만 React 19 명시 호환 표기 없음                                                                                                                                            |
| 4   | 알려진 보안 이슈 없음                         | ✅ PASS      | NLnet 펀딩, advisory 없음                                                                                                                                                                      |
| 5   | Cloudflare Workers (D1 + KV + Hono) 통합 사례 | ❌ FAIL      | WebSocket 전용 transport (`websocketEndpoint` URL 만 설정 가능, transport layer 추상화 없음). CF Workers 가 WS Upgrade 지원하지만 사례 0건. **stable 명시: "WARNING: This is beta software."** |

**총 3 fail (1, 5 + beta 명시) → fallback D 자동 채택.** 사용자 결정 4 의 사전 승인에 따름 (≥ 3 fail).

- **실제 채택 stack:** `yjs` 13.6.30 + `y-indexeddb` 9.0.12 (이미 Phase A 에서 도입) + **자체 transport** (`SyncTransport` interface + `StubTransport` Phase C, 실 `RelayTransport` Phase E 도입) + 자체 AEAD (Phase E 진입 시 결정 — `@noble/ciphers` 의 XChaCha20-Poly1305 후보).
- **Phase C 의 신규 의존성: 0개** (secsync 미설치). Phase E 진입 시 AEAD 라이브러리 1개만 추가.
- **+1주 일정 추가는 Phase E~F 에 흡수:** snapshot/delta 분리 우리가 설계. M9 전체 일정은 변동 없음 (m9-phase-plan.md "총 예상 +45 회귀" 유지).
- **Why this is OK:** 자체 transport 의 코어 디자인은 단순 — `Y.encodeStateAsUpdate(doc)` 를 AEAD 로 감싸 `POST /sync/snapshot`, `Y.applyUpdate(doc, decrypted)` 로 수신. 키 회전/스냅샷 압축은 Phase F 이후 점진적 도입 가능 (MVP 충분).

### E. 시장 포지셔닝 — Phased Expansion (MVP API 특화, v1.1 General Secrets)

- **결정:** MVP (M0~M13) 는 "DevOps/풀스택 개발자의 API key 의존성 관리" 슬로건으로 **API 특화** 출시. 일반 ID/PW 관리 + Watchtower-like 기능은 **v1.1 (M18 신설)** 에서 도입. 자동입력 (브라우저 익스텐션 + 모바일 자동입력) 은 v1.2 (M19/M20).
- **이유:**
  - **MVP 일정 보호:** 비번 기능 MVP 포함 시 +6~12개월 지연. 초기 타겟 (개발자) 은 비번 관리 이미 1Password/Bitwarden 사용 중 — 우리 MVP 에 없어도 진입 가능
  - **포지셔닝 우선:** "그래프 + blast radius" 차별점이 시장에 각인된 후 영역 확장 → "그래프 가진 비번 매니저" 라는 강력한 차별 (1Password 가 못 따라옴)
  - **사용자 피드백 검증:** 베타 사용자에게 "비번도 통합 원하는지?" 데이터 기반 결정
  - **점진적 보안 audit:** 비번 매니저 audit 은 API key 매니저보다 훨씬 까다로움 — 단계적 확장이 비용 분산
- **시너지 — 향후 v1.1 진입 시:**
  - 비번 → 사용 사이트 → "breach 발생 시 영향" 그래프 표시 (1Password Watchtower 가 못 함)
  - Incident feed 매처가 비번 사이트도 매칭 → blast radius 시뮬
  - "비번 5개 사이트 재사용 + Site A breach → B/C/D/E 도 즉시 위험" 그래프
- **Architectural seeds — MVP 시점에 미리 깔아둘 것 (v1.1 확장 비용 0~1시간):**
  1. **`credential.kind` enum 확장 가능 schema** — 현재 `api_key`/`oauth_token` 외에 `login`/`totp`/`secure_note`/`wifi`/`ssh_key`/`license_key` 받을 수 있게 (kind 는 이미 string, 마이그레이션 0건)
  2. **`issuer` 모델 일반화** — "Issuer" 를 "Site" 로 일반화 명명 (예: github.com 도 issuer 이지만 일반 비번 사이트도 issuer). T028 issuer 시드 확장만
  3. **HIBP password breach prep** — 우리 incident matcher (T053) 가 이미 issuer 패턴 매칭. HIBP password client (T052 와 같은 패턴) 를 v1.1 에서 추가 시 매처 그대로 재사용
  4. **zxcvbn weak password detector** — 이미 있음 (T024 LockScreen). 비번 등록 흐름에 동일 미터 적용만
- **v1.1 신설 마일스톤 (placeholder):**
  - **M18 General Secrets** — login / totp / secure_note kind 추가 + Watchtower-like (재사용 / weak / HIBP password / 오래된 비번)
  - **M19 Browser Extensions** — Chrome / Firefox / Edge / Safari (4 manifest, 4 release process)
  - **M20 Mobile Autofill** — iOS Credential Provider + Android Autofill Service (M11 Mobile 완료 후)
- **MVP 베타 메시징:** "API key + 의존성 그래프 + Incident 자동 매칭" — 비번 통합은 **v1.1 로드맵** 에 명시 (사용자 기대치 관리)

---

## [2026-04-22] 문서 갱신 정책 — task.md 태스크 상태 추적 의무화

- **배경:** 지금까지 태스크(T001~T022) 구현이 완료됐으나 `docs/task.md` 에 완료 상태나 커밋 해시 매핑이 전혀 없는 채로 세션이 종료될 뻔했다. 사용자가 다른 프로젝트에서도 동일한 누락을 겪었음을 지적.
- **결정:** Orchestrator 는 다음 규칙을 준수한다.
  1. 각 태스크의 commiter 가 커밋을 만든 **직후** `docs/task.md` 의 "진행 현황" 표에 한 줄 추가 (Task ID · 제목 · 완료일 · 커밋 해시).
  2. 같은 시점에 마일스톤 목록 표의 `Status` 컬럼 (⏳ 대기 / 🔄 N/M 진행 / ✅ 완료) 갱신.
  3. 세션 종료 또는 단계 전환(마일스톤 경계, Gate 통과) 직전에 task.md 최신 여부 반드시 확인.
- **영향:**
  - 글로벌 `C:\Users\JSS\.claude\CLAUDE.md` 의 "세션 시작 시", "작업 완료 전" 체크리스트에 `docs/task.md` 항목 추가. 이로써 다른 프로젝트에도 동일 규칙 적용.
  - 프로젝트 `CLAUDE.md` 에 "태스크 완료 즉시 docs/task.md 갱신" 섹션 신설.
  - 본 세션 종료 전 T001~T022 의 완료 기록을 task.md 에 일괄 추가 (22줄, 커밋 해시 7종: 855c33c, da0e5ae, de3706d, 77c8c18, 3c7d12d, df43b55, 09b1079, c8b2c1e, 2ac1674, 57959f7, 9d6841c).

---

## [2026-04-22] 개발 환경 정책 (Windows SAC/Defender + 문제 해결 프로토콜 + 배포 서명 전략)

### A. Windows Defender 실시간 보호 제외 경로 (이미 적용됨)

- **결정:** 로컬 개발자(Windows)는 `C:\Users\JSS\Projects\secretbank\src-tauri\target` 을 Windows Defender 실시간 보호의 제외 경로로 추가한다.
- **수동 실행 (관리자 권한 PowerShell):**
  ```powershell
  Add-MpPreference -ExclusionPath 'C:\Users\JSS\Projects\secretbank\src-tauri\target'
  ```
- **원복:** `Remove-MpPreference -ExclusionPath 'C:\Users\JSS\Projects\secretbank\src-tauri\target'`
- **상태:** 2026-04-22 사용자 적용 완료.

### A-2. Windows Smart App Control (SAC) Off — 개발자 PC 한정

- **문제:** T021+T022 진행 중 `pnpm tauri dev` 풀 빌드가 `markup5ever` 등 proc-macro 와 build script `.exe` 실행 시 `os error 4551 (ERROR_FILE_HASH_NOT_ALLOWED)` 로 차단. 진단 결과 `SmartAppControlState: On` 확인. SAC 가 서명 없는 실행 파일을 일괄 차단하여 Cargo 컴파일이 불가.
- **결정:** 개발자(나)의 Windows 11 기기에서 SAC 를 Off 로 전환한다.
  - 경로: Windows Security → App & browser control → Smart app control settings → **Off**.
  - **한 번 Off 로 전환하면 Windows 재설치 전까지 복구 불가** (Microsoft 공식 정책).
  - 재부팅 후 적용.
- **이 결정의 범위:**
  - ✅ **개발자 PC 만 해당.** 최종 사용자 배포 앱에는 영향 없음.
  - 개발자 PC 는 이미 SmartScreen, Defender 실시간 보호, UAC, Windows Firewall 이 활성 상태로 유지. SAC 이외 방어 계층은 그대로 유지.
- **대안 기록 (기각 사유):**
  - WSL2 이전 → Tauri 는 Windows 네이티브 타깃이므로 실제 앱 창은 여전히 Windows 에서 띄워야 함.
  - 레지스트리 편집 → Microsoft 비공식, Windows Update 로 재활성 위험.
  - CI 전용 빌드 → 피드백 루프가 수 분 단위 → M1~M13 전체 개발 효율 심각 저하.

### A-3. 최종 사용자 배포 시 SAC 대응 = 코드 서명 + reputation (Gate 2 Q6=A 와 일관)

- **결정:** 개발자 PC 의 SAC Off 결정은 사용자 배포에 영향을 주지 않는다. 사용자가 받는 최종 앱은 **Authenticode 서명**으로 SAC 및 SmartScreen 을 통과시킨다.
- **단계별 계획:**
  1. **M13 Release 직전:** [SignPath OSS Foundation](https://signpath.org/) 에 AGPL-3.0 공개 레포 증빙으로 신청 (무료). 승인 1~2주.
  2. **GitHub Actions 에 SignPath 연동:** `actions/signpath-action` 또는 공식 API 로 Tauri 빌드 산출물(`secretbank-setup.exe`, `.msi`) 자동 Authenticode 서명.
  3. **첫 배포 이후 reputation 축적 기간:** 다운로드 수 수십~수백 건 쌓일 때까지 SmartScreen "알 수 없는 게시자" 경고가 일부 사용자에게 뜰 수 있음. README 와 다운로드 페이지에 "More info → Run anyway" 가이드 명시.
  4. **SAC On 사용자 대응:** 소수지만 SmartScreen 경고만으로 부족할 수 있음. 대응 옵션:
     - Microsoft Store 동시 배포 (Store 앱은 SAC 자동 허용) — 심사 1~2주.
     - EV 인증서로 업그레이드 ($300~600/년) — 즉시 reputation, Gate 2 Q6 에 명시된 장기 대안.
- **배포 전 README/docs 에 명시할 안내:**
  - Windows SmartScreen 경고 우회 방법 (스크린샷 포함).
  - Smart App Control 사용자를 위한 "Store 배포 링크" 또는 "allow list 요청 방법".
  - 코드 서명 검증 방법 (`Get-AuthenticodeSignature .\secretbank-setup.exe`).
- **레퍼런스:** Bitwarden / 1Password / Obsidian 등 독립 데스크톱 앱의 초기 배포 경험 — 모두 비슷한 과정을 거침.

### B. 테스트 실행 패턴: `-p <crate>` 우선

- **결정:** `cargo test --workspace` 대신 **각 크레이트별로 `cargo test -p secretbank-<crate>`** 를 우선 사용한다. 전체 워크스페이스 테스트는 CI(Ubuntu) 에서 최종 검증.
- **이유:** A 를 적용해도 일부 환경에서 첫 컴파일 직후 바이너리 실행이 지연될 수 있음. `-p` 로 크레이트를 좁히면 캐시 히트와 재현성이 좋다.
- **영향:** implementator/tester 에이전트 호출 시 `cargo test -p <crate>` 패턴을 명시. 전체 워크스페이스 검증은 `cargo build --workspace` 와 `cargo clippy --workspace` 로 대체 (컴파일 + 정적 분석은 바이너리 실행이 없어 차단 미발생).

### C. 에러 대응 프로토콜 — "1회 자체 시도 → 실패 시 반드시 검색"

- **결정:** implementator / problem-solver / tester 가 에러를 만났을 때:
  1. **1회 자체 수정 시도.** 에러 메시지를 읽고 명백한 원인을 고친다.
  2. **실패 시 반드시 외부 검색** — WebSearch/WebFetch 로 (a) 에러 메시지 원문 인용, (b) 크레이트/라이브러리 공식 이슈 트래커, (c) Stack Overflow · GitHub Discussions · 공식 문서에서 해결책을 찾는다.
  3. **2번째 시도 후에도 실패** 하면 informer 로 사용자에게 보고하고 인간 판단을 기다린다.
- **이유:** 에이전트가 모르는 크레이트 버전 차이, 플랫폼 특이 버그, Tauri v2 변경사항 등은 추측보다 검색이 빠르고 정확. "No package info in the config file" 같은 케이스도 검색으로 T001 구조 이슈를 더 빨리 발견할 수 있었다.
- **영향:**
  - implementator 프롬프트 템플릿에 이 프로토콜을 기본 포함.
  - problem-solver 가 호출될 때 WebSearch 필수 (이미 해당 에이전트 정의에 포함).
  - 검색 질의는 구체적이어야 함: 에러 원문 + 크레이트 이름 + 버전 + 플랫폼.

---

---

## [2026-04-22] 프로젝트 정의 및 포지셔닝

- **결정:** Secretbank는 "API 키 저장소"가 아니라 **"API 키 의존성 그래프(Dependency Graph) 관리 플랫폼"** 으로 포지셔닝한다. 타깃 캐치프레이즈는 **"Bitwarden for APIs, with Dependency Graph"**.
- **이유:** 기존 시크릿 매니저(Vault, 1Password, Doppler 등)는 저장/회전은 잘하지만 "어떤 키가 어느 프로젝트/URL/배포환경에 쓰이고, 교체 시 무엇이 깨지는지"를 추적하지 못한다. 이 시장 공백을 노린다.
- **영향:**
  - 단순 CRUD UI가 아니라 **Graph 시각화** + **Blast Radius 계산 엔진** + **Incident Feed 자동 매칭** + **Kill Switch** 가 핵심 기능.
  - 데이터 모델은 `Issuer → Credential → Usage → Project → Deployment → URL` 관계형 그래프로 설계.

---

## [2026-04-22] 타깃 사용자 페르소나 (Q1 확정)

- **결정:** 두 개의 주요 페르소나를 타깃으로 한다.
  1. **전문 개발자 (Power User)** — 여러 SaaS API 키를 관리해야 하는 프리랜서·인디해커·소규모 팀 개발자. 기존 시크릿 매니저의 한계를 인지하고 있음.
  2. **바이브 코더 (Vibe Coder)** — Cursor/v0/Lovable/Bolt 등 AI 보조 도구로 빠르게 앱을 만드는 비전문 빌더. **"API 키 관리의 복잡한 설정을 앱이 대신해주기를 원하는"** 사용자. 시장이 폭발적으로 성장 중인 것으로 판단.
- **구체적 요구사항 차이:**
  - 전문 개발자 → Graph, Blast Radius, Kill Switch 등 고급 기능 수요.
  - 바이브 코더 → **"복잡한 설정을 자동화해주는 가드레일"** 이 핵심. 발급처 보안 사고 자동 대응, 자동 rotation, `.env` 자동 반영 등이 더 중요.
- **이유:** AI 보조 개발 시대에 "API 키를 실제로 다루는 인구"는 전문 개발자 범위를 크게 초과한다. 바이브 코더는 보안 지식이 부족할수록 이런 자동화 도구에 대한 의존도가 크고, Gemini Deep Research의 "RAILGUARD / Cognitive Security Model" 챕터(섹션 4.1)와 정확히 맞닿는다.
- **영향:**
  - UI/UX는 **"개발자 친화 + 비개발자도 이해할 수 있는 시각화"** 를 동시에 만족해야 한다.
  - 온보딩은 **"복잡한 설정을 묻지 않고 자동 탐지/추론"** 을 지향한다 (예: 프로젝트 폴더 드롭 → `.env`/`git` 스캔으로 자동 인벤토리 구축).
  - 5000만이라는 구체 수치는 **aspirational goal**로 유지하되, KPI는 "바이브 코더가 첫 5분 안에 첫 credential을 등록할 수 있는가"에 둔다.

---

## [2026-04-22] 타깃 플랫폼 (Q2 확정) — **[갱신 전 결정 대체]**

- **결정:** **풀스택 멀티 디바이스**. Bitwarden / 1Password 모델에 가까움.
  - 데스크톱: **Windows, macOS, Linux** (Tauri v2)
  - 모바일: **iOS, Android** (Tauri v2 모바일 — Research Phase에서 성숙도 확인 필요)
  - 웹: **웹 대시보드** (뷰어·원격 Kill Switch·팀 공유 중심)
- **이전 결정 (데스크톱 전용)은 폐기.** 이유:
  - 5000만 사용자 목표 달성에 모바일 포기는 불가능 (사용자 풀의 60%+ 손실).
  - 바이브 코더 페르소나는 PC·모바일 간 컨텍스트 전환이 잦다.
  - Gemini Deep Research 섹션 2.2(Local-First + CRDT E2EE)는 명시적으로 "랩탑 + 스마트폰" 멀티 디바이스를 가정.
- **플랫폼 간 역할 분담 (잠정):**
  - **데스크톱** = 풀 기능 (Graph 편집, 코드 스캔, CI 연동, rotation 실행)
  - **모바일** = 빠른 조회, 알림 수신, 긴급 Kill Switch, Biometric 인증
  - **웹** = 팀 공유 볼트(Phase 2), 읽기 전용 뷰어, 관리자 감사 로그 열람
- **영향:**
  - 기술 스택 재검토 필요 (웹 대시보드를 Tauri 웹뷰와 별도로 Next.js/SvelteKit로 갈지, 아니면 공통 React 앱의 웹 버전으로 갈지).
  - Tauri v2 모바일 지원 성숙도(iOS/Android 알파·베타 여부)를 Research Phase에서 확정해야 한다.

---

## [2026-04-22] 기술 스택 — **[일부 갱신]**

- **확정:**
  - Shell: **Tauri v2** (Rust backend + Web frontend) — 데스크톱 확정, 모바일은 Research에서 확인
  - Backend: **Rust** (tokio 비동기, reqwest, sqlx)
  - Frontend: **React + TypeScript**
  - Styling: **Tailwind CSS + shadcn/ui** (최종 디자인 시스템은 UX Research 후 확정)
  - 메타데이터 저장: **SQLite** (로컬) + 동기화 서버(E2EE 릴레이)
  - 시크릿 값 암호화 저장: **Tauri Stronghold** (XChaCha20-Poly1305 + Argon2id)
  - 마스터 키 보관: **OS Keyring**
- **Research Phase에서 확정할 항목 (변경):**
  - Graph 시각화 라이브러리: React Flow vs Cytoscape.js vs Reaflow
  - CRDT 라이브러리: **Yjs vs Automerge vs Loro** (멀티 디바이스 E2EE 동기화용)
  - 동기화 서버 인프라: **Supabase vs Cloudflare Workers + D1 vs 자체 호스팅** (1인 운영 가능성 판단)
  - 웹 대시보드 스택: React(공용) vs Next.js 분리
  - Tauri v2 모바일 지원 성숙도
- **보안 결정 유지:**
  - 감사 로그 = ed25519 서명 체인, append-only
  - 앱 업데이트 = tauri-plugin-updater + minisign 서명 강제
  - 키 메모리 노출 = `secrecy` crate로 Zeroize, 클립보드 자동 만료 30초
  - **영지식(Zero-Knowledge) 아키텍처** — 서버는 암호문과 논스만 릴레이, 복호화 키는 서버가 절대 보지 않음 (Gemini 섹션 2.1)

---

## [2026-04-22] 수익 모델 (Q3 확정)

- **결정: Freemium**
  - **무료 (Free tier)** — 1인 사용자 대상의 핵심 기능 전체
    - 로컬 볼트, 수동 키 등록/조회
    - 단일 기기 사용 (동기화 없음)
    - 기본 Graph 보기
    - CVE/NVD 공용 Incident feed
    - GitHub 커넥터 1개
  - **Pro ($1/월 또는 $10/년)** — 프로슈머·바이브 코더·1인 프리랜서 대상 _(2026-04-25 인하)_
    - **멀티 디바이스 E2EE 동기화** (데스크톱 ↔ 모바일 ↔ 웹)
    - **자동 rotation** (무중단 Zero-Downtime 파이프라인)
    - **Incident Feed 프리미엄** (공급자 status RSS, Twitter/X 모니터링, AI 요약)
    - **Blast Radius 시뮬레이션** (가상 폐기 시 영향 예측)
    - **커넥터 팩** (AWS, OpenAI, Stripe, Vercel, Supabase, Google Cloud 등)
    - **Kill Switch**
    - **Audit Log Export**
  - **Team (Phase 2)** — **$5/seat/월** _(2026-04-25 인하: 기존 $10/seat → $5/seat)_
    - 팀 공유 볼트, SSO, RBAC, SCIM
    - Pro($1) 와 함께 동일한 가격 인하 정책: "API 키 관리" 신규 카테고리 침투 가격대로 정렬. 1Password Teams ($7.99/user) 보다 저렴.
- **이유:** 5000만 사용자 목표에 도달하려면 무료 진입 장벽 제거가 필수 (Bitwarden 모델). 2026-04-25 인하 후 $1/월 = Bitwarden Premium 과 동률, 1Password Individual ($3~5) 보다 한참 저렴한 **신규 카테고리 침투 가격**.
- **영향:**
  - 무료 tier의 기능이 충분히 쓸만해야 한다 ("유인 광고형 무료"는 바이브 코더 페르소나에게 역효과).
  - **"멀티 디바이스 동기화 + 자동 rotation" 이 $1/월 구매 동기의 두 기둥**이 되도록 설계.
  - 결제 인프라(Stripe, Apple IAP, Google Play Billing) 필요 → Research Phase에서 1인 운영 관점으로 비교.

---

## [2026-04-22] 오픈소스 전략 (Q4 확정)

- **결정: Open Core**
  - **오픈소스 (OSS)** — 로컬 코어 (볼트 저장소, 그래프 엔진, 수동 Rotation UI, 기본 Incident Feed)
  - **클로즈드 소스 (Proprietary)** — 프리미엄 커넥터 팩, E2EE 동기화 서비스, 무중단 rotation 파이프라인, 프리미엄 Incident Feed
- **이유:**
  - Bitwarden/Infisical 모델 검증됨. OSS가 **신뢰 확보 + 개발자 커뮤니티 유입 + 보안 감사** 세 가지를 동시에 해결.
  - 1인 개발자가 **프리미엄 기능만 클로즈드**로 유지하면 복제 난이도 확보 가능.
- **영향:**
  - 라이선스: OSS 부분은 **AGPL-3.0 (Bitwarden/Infisical 모델)** 또는 **MPL 2.0** 중 Research Phase에서 선택.
  - 레포지터리 구조를 처음부터 "퍼블릭 코어 + 프라이빗 프리미엄" 분리 가능한 형태로 설계.
  - 프리미엄 기능은 **별도 서버 서비스**로 구현하여 "OSS 빌드만으로는 동기화·자동 rotation 불가" 형태로 자연스런 구분.

---

## [2026-04-22] 팀 구성 및 개발 리소스 (Q5 확정)

- **결정:** **1인 개발 프로젝트로 끝까지 간다.** 극적인 성공 시에만 개발자 추가 채용 고려.
- **영향:**
  - 모든 인프라는 **매니지드 서비스 최대 활용** — 서버 관리 부담 최소화.
  - 프리미엄 기능의 백엔드는 **Cloudflare Workers + D1/KV 또는 Supabase** 같이 "scale-to-zero"가 되는 스택 우선 검토.
  - **AI 보조 개발(Claude Code, Cursor 등) 적극 활용** — 이는 바이브 코더 페르소나에 대한 dogfooding도 됨.
  - **관측성·온콜 부담이 큰 기능은 의도적으로 늦게 출시** (예: 팀 공유 볼트, SCIM).
  - 모든 의사결정에서 **"1인이 운영 가능한가?"** 가 비용·기능 우선순위의 기본 필터.

---

## [2026-04-22] 개발 기간 정책 — **[갱신 전 결정 대체]**

- **결정:** **고정된 MVP 기간 없음.** "3주 MVP" 제약은 폐기.
- **이유:** 목표가 "3주 내 출시"가 아니라 **"실용적이고 가치 있는 앱을 월 $1·년 $10 에 전 세계 사용자에게 제공"**. 품질과 실제 유용성이 출시 시점보다 우선.
- **영향:**
  - MVP 범위는 "3주에 들어가는 것"이 아니라 **"Pro 구독을 $1/월 에 결제할 가치가 있는 최소 기능"** 기준으로 재정의한다.
  - 구체적 태스크 분할은 planner가 `docs/task.md` 에 작성 (Phase 2.6).

---

## [2026-04-22] Gate 1 확정 사항 (Integrator Report 승인 후 8개 오픈 질문 결정)

### Q1 — Kill Switch 무료/Pro 경계 → **C (절충안)**

- **결정:** Kill Switch 자체 (키 revoke, 2단계 확인 UI) 는 **무료** tier 포함. "revoke 이후 새 키 자동 배포"는 **Pro** 전용.
- **이유:** 긴급 사고 대응은 신뢰 확보의 핵심이므로 무료로 제공. 사고 후 자동화 복구 (자동 rotation) 는 Pro 가치를 정당화하는 핵심 기능으로 분리.
- **영향:** Kill Switch UI 와 revoke 엔드포인트는 MVP Must, 자동 배포 파이프라인은 Phase 2 Could.

### Q2 — 모바일 MVP 포함 여부 → **A (데스크톱 + 모바일 동시 출시)** ⚠️ integrator 권장(B)과 반대

- **결정:** 데스크톱과 모바일을 **동시에 MVP에 포함**한다.
- **이유:** "3주는 중요하지 않다, 실용적이고 가치 있는 앱이 목적"이라는 사용자 방향. Pro 구독의 핵심 동기인 "멀티 디바이스 E2EE 동기화"를 반쪽으로 출시하지 않기 위함.
- **영향:**
  - MVP 범위가 **Must + Phase 2 Could** 의 상당 부분까지 확장됨. 특히 **Yjs + SecSync + Cloudflare Workers 동기화 인프라**가 MVP Must로 승격.
  - Tauri v2 모바일 플러그인 안정성 리스크(🟡)를 감수. Stronghold 모바일 동작 여부를 개발 초반에 검증 필수.
  - 개발 기간이 크게 증가. "고정 기간 없음" 정책으로 대응.

### Q3 — 앱스토어 수수료 전략 → **A (RevenueCat + Apple IAP 15% / Google Play Billing)**

- **결정:** iOS는 **Apple IAP Small Business Program (15%)**, Android는 **Google Play Billing**, 웹/데스크톱은 **Paddle MoR**. **RevenueCat** 으로 크로스 플랫폼 구독 상태 통합.
- **이유:** 단순하고 사용자 편리. 외부 결제 링크 유도는 법률 리스크와 UX 복잡도 증가. Small Business 15% 수수료는 수용 가능한 손익.
- **영향:**
  - Paddle(Merchant of Record)로 VAT/세금 자동 처리.
  - RevenueCat 월정액은 매출 $10K까지 무료, 이후 유료 전환.
  - 크로스 플랫폼 구독 동기화를 위해 **유저 계정 인증(OAuth/Passkey)** 이 Phase 1 후반부에 필요.

### Q4 — 라이선스 → **A (AGPL-3.0 + EE 독점 이중 라이선스)**

- **결정:** OSS 코어 = **AGPL-3.0**, 프리미엄/클라우드 기능 = **독점 EE(Enterprise Edition) 라이선스** (Bitwarden 모델).
- **이유:** SaaS 경쟁자의 무임 재판매를 강하게 차단. B2C 중심이므로 기업 기피 영향 미미. 커뮤니티 기여 수령은 CLA(Contributor License Agreement) 필수.
- **영향:**
  - GitHub 레포지터리에 `LICENSE` (AGPL-3.0) + `LICENSE_FAQ.md` (EE 경계 설명) 필수.
  - 기여자 CLA 자동화 (CLA Assistant 봇 등) 가 Phase 1 후반 태스크로 편입.
  - 향후 라이선스 변경(예: BUSL 전환) 가능성 대비 CLA 설정 필수.

### Q5 — GitHub 커넥터 무료 범위 → **B (읽기 무료, 쓰기 Pro)**

- **결정:** 무료 tier = Secret Scanning 조회 + `.env` 파일 스캔(읽기). Pro = Actions Secrets 자동 갱신 + PR 자동 생성(쓰기).
- **이유:** 읽기는 진입 장벽 제거 (유입·신뢰), 쓰기는 Pro 가치 정당화 기능 (자동화로 시간 절약).
- **영향:**
  - GitHub App 권한은 초기 설치 시 읽기·쓰기 모두 요청하되, 쓰기 동작은 Pro 라이선스 검증 후 실행.
  - 무료 사용자도 "이 기능은 Pro에서 1-click 자동화됩니다" 업셀 UX 노출.

### Q6 — Stronghold v3 대체 기술 사전 결정 → **B (지금은 trait 추상화만)**

- **결정:** `VaultStorage` trait 를 지금 설계하고, Stronghold 구현체를 교체 가능한 구조로 만든다. v3 대체 기술은 v3 출시 시점에 결정.
- **이유:** v3 출시 시점 불확실. 미래 결정을 지금 고정하면 오히려 잘못될 수 있음. 추상화 레이어만 있으면 마이그레이션 비용은 관리 가능.
- **영향:**
  - `src-tauri/src/vault/storage/` 디렉터리에 `trait VaultStorage` 정의. Stronghold 구현체는 `StrongholdStorage` 로 격리.
  - 단위 테스트용 `MockVaultStorage` 도 함께 제공.

### Q7 — 웹 대시보드 읽기 전용 뷰어 Phase 1 포함 → **A (포함)**

- **결정:** Phase 1 후반부에 **웹 읽기 전용 뷰어** 를 포함. URL에서 그래프 조회, Incident 알림 조회, 계정 관리(구독 상태)가 가능.
- **이유:** Q2=A(모바일 MVP 포함)와 짝을 이루어 "멀티 디바이스" 가치를 완성. 웹 뷰어는 공유 링크로 협업 트리거 기능도 됨(Phase 2 팀 기능의 기초).
- **영향:**
  - 웹 스택은 **Vite React 공용** (Tauri 번들과 소스 공유, 조건부 분기로 Tauri-only API 보호).
  - 정적 랜딩 페이지는 **Astro** 별도로 구성 (SEO·마케팅 페이지).
  - 도메인·호스팅 필요 (Cloudflare Pages 권장).

### Q8 — RAILGUARD (.cursorrules 자동 생성) MVP 포함 → **A (포함)**

- **결정:** 바이브 코더 페르소나 핵심 차별점으로 MVP Must 에 포함.
- **이유:** 구현 복잡도 낮음 (텍스트 템플릿 + 파일 쓰기). Gemini Deep Research 섹션 4.1 의 "Cognitive Security Model" 해자(Moat) 포인트와 직결.
- **영향:**
  - `.cursorrules` / `.windsurfrules` / `CLAUDE.md` / `.github/copilot-instructions.md` 등 주요 AI 에디터용 룰 파일을 자동 생성·갱신하는 템플릿 엔진 필요.
  - 프로젝트 폴더 드롭 시 자동 검출 → "이 프로젝트를 위한 AI 가드레일 룰을 생성할까요?" 제안 UX.

---

## [2026-04-22] MVP 범위 재정의 (Gate 1 이후)

**Q2=A 결정으로 MVP 범위가 기존 "데스크톱 우선" 플랜에서 크게 확장됨.** planner가 task.md 를 작성할 때 기준이 될 새 범위:

### MVP Must (Phase 1 출시 조건)

로컬 볼트 + 수동 등록 + SQLite 그래프 모델 + React Flow 그래프 + ed25519 감사 로그 + NVD/GitHub Advisory Incident Feed + GitHub 커넥터(읽기) + Progressive Disclosure UX + 드롭&스캔 온보딩 + AGPL-3.0 + **Kill Switch (revoke) + RAILGUARD 룰 파일 생성 + 데스크톱(Win/Mac/Linux) + 모바일(iOS/Android) + 웹 읽기 뷰어 + Yjs+SecSync E2EE 동기화 + Cloudflare Workers 릴레이 서버 + Paddle+RevenueCat 결제 + 유저 인증(Passkey/OAuth)**

### MVP Should (가능하면 출시 포함)

Cmd+K Command Palette + 보안 점수 시각화 + HIBP v3 + 자동 업데이트 + i18n(영/한/일 우선)

### Phase 2 (MVP 이후)

자동 rotation 무중단 파이프라인 + 커넥터 팩(OpenAI/Stripe/AWS/Vercel/Supabase) + Blast Radius 시뮬레이션 + Incident Feed 프리미엄 + 감사 로그 Export + 팀 공유 볼트 + CISA KEV

### Won't

LiteLLM Python 사이드카 + Sigstore/Rekor + 집단지성 DB + Dynamic Secrets + Vanta/Drata 연동

---

## [2026-04-22] 디자인 시스템 선택 (Gate 1.5)

- **결정: Option A — "Security Minimal"**
  - **컴포넌트 라이브러리:** shadcn/ui (copy-paste) + Radix UI primitives
  - **스타일링:** Tailwind CSS v4 (`@theme` 기반 CSS-first 설정)
  - **Base Color Ramp:** **slate** (2026-04-22 부트스트랩 시 `neutral`에서 변경 — 미세한 쿨 톤이 "보안 도구" 신뢰감에 더 부합)
  - **타이포그래피:** 본문 **Inter Variable**, 코드·키 **JetBrains Mono Variable**
  - **아이콘:** **Lucide** (shadcn/ui 기본값, 1450+ 아이콘, MIT)
  - **모션:** **Motion** (구 Framer Motion 후속) — prefers-reduced-motion 자동 대응
  - **보일러플레이트 참고:** `agmmnn/tauri-ui` (Tauri v2 + shadcn/ui 검증 완료)
  - **그래프 테마:** React Flow 노드/엣지를 slate 토큰 + 상태 컬러(위험/주의/안전)로 스타일링하여 일관성 확보
- **이유:**
  1. **Tauri v2 검증 완료**: 공식 지원에 준하는 보일러플레이트 존재 → 1인 개발자가 설계 공수 없이 즉시 시작 가능
  2. **접근성 자동 처리**: Radix primitives 기반이라 WCAG 2.2 AA 키보드 네비게이션 + ARIA 속성이 기본값으로 제공됨
  3. **두 페르소나 균형**: "Security Minimal"의 깔끔·정밀 톤은 전문 개발자 취향과 일치하면서, Progressive Disclosure로 바이브 코더도 수용
  4. **번들 크기·1인 유지보수 최적**: copy-paste 방식이므로 라이브러리 업그레이드 부담 없음
- **하이브리드 보완 (채택):** Option C 의 일부 요소를 선택적으로 결합
  - **Cmd+K Command Palette** (`cmdk` + shadcn/ui Dialog)
  - **조밀한 Graph 파워 뷰** (전문 개발자용 밀도 토글)
  - **Motion One 스타일의 최소 모션** (과도한 애니메이션 지양)
- **영향:**
  - `package.json` 에 추가될 의존성: `tailwindcss@4`, `@radix-ui/react-*` (필요한 primitive만 설치), `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`, `motion`, `cmdk`
  - 디자인 토큰은 `src/styles/tokens.css` 에 **Radix Colors 기반**으로 정의 (라이트/다크 자동 전환)
  - CLAUDE.md 프론트엔드 섹션에 Option A 구성 명시 (향후 세션에서 일관성 유지)
  - UI 컴포넌트는 `src/components/ui/` 에 shadcn/ui CLI로 설치 (초기엔 Button, Input, Dialog, DropdownMenu, Tooltip, Toast, Tabs, Command 정도)
  - **ui-prototype 스킬** 로 초기 파일 생성 예정 (Tailwind 설정, 토큰, 기본 컴포넌트 몇 개)

---

## [2026-04-22] Gate 2 확정 사항 (Planning 산출물 승인 + Open Issues 결정 7건)

사용자가 `docs/architecture.md`, `docs/task.md`, `docs/implementation_plan.md` 3종을 승인하고 Open Issues 7건을 전부 확정함.

### Q1 — 리포지터리 구조 → **A (분리 레포)**

- **결정:** 코어는 퍼블릭 AGPL-3.0 레포, 릴레이 서버는 별도 프라이빗 EE 레포로 분리한다.
  - `secretbank` (public, AGPL-3.0) — Tauri 앱, 코어 크레이트, React 프론트, 웹 읽기 뷰어
  - `secretbank-relay` (private, EE proprietary) — Cloudflare Workers 동기화 릴레이, 결제 웹훅
- **이유:** EE 라이선스 경계 명확화. 오픈소스 기여자가 릴레이 내부 로직·DB 스키마·인증 흐름에 접근하지 못하게 하여 무임 재판매 위험 차단.
- **영향:**
  - 현재 `C:\Users\JSS\Projects\secretbank\` = 퍼블릭 `secretbank` 레포로 유지.
  - M9 시점에 별도로 `C:\Users\JSS\Projects\secretbank-relay\` 프라이빗 레포 생성 예정.
  - 공통 프로토콜/타입은 퍼블릭 `secretbank` 에 정의하여 릴레이가 참조한다 (단방향 의존).

### Q2 — GitHub Organization 이름 → **`secretbank`**

- **결정:** GitHub Organization 이름은 `secretbank`. 최종 URL은 `github.com/secretbank/secretbank` 와 `github.com/secretbank/secretbank-relay`.
- **이유:** 제품명과 직접 일치, 기억하기 쉬움, 검색 유리.
- **영향:**
  - GitHub Organization 생성(사용자 수동 작업, M0 직전 또는 병행). 결제 없음(무료 org).
  - CLA Assistant 설정 시 org 이름 필요.
  - 도메인(Q4)도 `secretbank.app` 으로 통일 (2026-04-25 확정).

### Q3 — Free tier 디바이스 수 → **A (2대)**

- **결정:** 무료 tier 사용자는 최대 **2대 디바이스**까지 E2EE 동기화 가능. 3대부터 Pro 전환 필요.
- **이유:** 바이브 코더 페르소나는 보통 PC + 스마트폰 두 디바이스에서 작업. 진입 장벽을 낮춰 "직접 써본 뒤 가치 체감" 경로를 열어둔다. 3대째부터 Pro 유도는 Bitwarden 패턴과 유사.
- **영향:**
  - 릴레이 서버의 `device_count` 엔포스먼트 로직에 `if tier == "free" && count >= 2: reject pair` 반영.
  - UI: "현재 2/2 디바이스 사용 중 — 3번째 디바이스를 추가하려면 Pro로 업그레이드" 업셀 메시지.
  - 기존 project-decisions.md의 "Freemium" 설명을 갱신 (단일 기기 사용 → 2대까지 무료 동기화).

### Q4 — 도메인 → **`secretbank.app` 확정 (2026-04-25 갱신)**

- **결정:** **`secretbank.app`** 단일 도메인 등록 확정. M5 릴레이 진입과 함께 즉시 등록 (당초 M12/M13 직전 확보 계획에서 앞당김).
- **갱신 사유:** `Secretbank.app` 후보 1순위는 이미 사용 중 (제3자 보유). `secretbank.app` 가능 → 즉시 확보. `.app` TLD 는 HSTS preload 강제 (HTTPS 필수) — 보안 도구가 보안 TLD 사용하는 메시지 일관성. M5 릴레이 도메인 + 마케팅 사이트 + product 진입점 통합.
- **`.com` 추가 등록은 M10 (Payments) 시점으로 defer:** 1인 운영 비용 최소화 우선. 이메일 (`support@secretbank.com`) + SEO 안전망은 SaaS 정식 출시 직전에 추가.
- **영향:**
  - 코드의 도메인 표기를 `secretbank.app` 으로 통일. `ee/LICENSE`, `ee/README.md`, README 한국어 요약 등 placeholder 갱신.
  - 비즈니스 이메일 임시: `licensing@secretbank.app` / `support@secretbank.app` (Cloudflare Email Routing 으로 forward 설정 후 사용).
  - 환경변수: 클라이언트는 `VITE_APP_DOMAIN=secretbank.app` (또는 절대 URL 빌드 타임 주입). 릴레이는 `wrangler.toml` 의 `routes` 또는 `custom_domains` 에 `relay.secretbank.app` (서브도메인) 또는 `secretbank.app/api/*` 패턴 사용 — M5 스캐폴드 시 결정.

### Q5 — 계정 등록/결제 타이밍 → **마일스톤별 Just-in-Time**

- **결정:**
  - Apple Developer Program ($99/년) — **M11 시작 직전**에 등록
  - Google Play Console ($25 일회성) — **M11 시작 직전**에 등록
  - Paddle Merchant Account — **M10 시작 2주 전**에 신청 (소프트웨어 벤더 검증 기간 확보)
  - RevenueCat — **M10 시점**에 무료 tier로 생성 ($2.5K ARR까지 무료)
  - Cloudflare Workers Paid ($5/월) — **M9 시작 직전** 활성화 (그전엔 무료 tier로 개발)
  - GitHub App registration — **M5 시점**에 생성 (공식 커넥터 인증용)
- **이유:** 선결제 비용을 최소화하면서 각 마일스톤에 맞춰 필요할 때만 활성화. 1인 개발자의 현금 흐름 보호.

### Q6 — Windows 서명 방식 → **A (SignPath OSS)**

- **결정:** SignPath Foundation의 오픈소스 무료 코드 서명 프로그램을 이용한다.
- **이유:** 비용 제로. 본 프로젝트는 AGPL-3.0 퍼블릭 코어이므로 자격 충족. 승인은 신청 후 1~2주.
- **영향:**
  - M13 Release 직전에 SignPath에 신청 (GitHub org `secretbank`, AGPL 라이선스, public repo 증빙).
  - 승인 후 GitHub Actions에서 SignPath Secure Build 연동 설정.
  - 만약 Pro 사용자 수가 수천 명 규모 이상으로 성장하여 SmartScreen reputation 이슈가 생기면 **EV 인증서 구매로 전환** 검토 (연 $300~600).

### Q7 — 법률 리뷰 예산 → **A (iubenda/Termly로 시작) → 추후 B 전환**

- **결정:** 초기 출시는 자동화된 Privacy Policy/Terms 생성기(iubenda 또는 Termly, 월 $15 수준) 로 시작한다. Pro 사용자가 수천 명 규모로 성장한 시점에 변호사 1회 리뷰($500~$1,500) 로 전환.
- **이유:**
  - 초기 비용 최소화 (1인 운영 원칙).
  - iubenda/Termly는 GDPR/CCPA/CPRA 기본 조항을 자동 생성, 지역별 언어 지원.
  - E2EE 특성상 "개인정보 수집 최소화" 구조이므로 위험 프로파일이 낮음.
- **영향:**
  - M13 Release 직전에 iubenda/Termly 계정 생성 + Privacy Policy/Terms 페이지 생성.
  - Landing 사이트와 앱 내 링크에 삽입.
  - Paddle/RevenueCat의 기본 소비자 보호 조항과 중복되지 않게 정리.

### 추가 — Stronghold 모바일 실패 시 우회 태스크 (planner Open Issue #8)

- **결정:** M11 T105(Stronghold 모바일 PoC)에서 실패하면 즉시 확장 태스크를 열고 대체 구현을 진행한다. 대체 후보: (a) iOS Keychain/Android Keystore 직접 사용 + `age`/`rage` crate로 파일 암호화, (b) `rust-crypto` 직접 구현.
- **이유:** Stronghold v2 모바일 지원은 research_raw.md 에서 🟡 조건부 평가. 데스크톱보다 성숙도 낮음.
- **영향:** M11 T105를 PoC 성격으로 가볍게 설계하고, 실패 시 M11 태스크 수가 6개 → 10~12개로 늘어날 수 있음을 미리 인지.

---

## [2026-04-22] T003 — Tauri v2 플러그인 활성화 (M0)

- **결정:**
  - `secretbank-app/Cargo.toml`에 Tauri 공식 플러그인 9종 추가 (stronghold 포함 시 10종이나 AppLocker 환경 제약으로 일시 비활성화, 아래 이슈 참조).
    - 공통: `tauri-plugin-sql` (features=["sqlite"]), `tauri-plugin-clipboard-manager`, `tauri-plugin-shell`, `tauri-plugin-os`, `tauri-plugin-notification`, `tauri-plugin-deep-link`, `tauri-plugin-http`
    - 데스크톱 전용 `cfg(not(android/ios))`: `tauri-plugin-updater`
    - 모바일 전용 `cfg(android/ios)`: `tauri-plugin-biometric`
  - `lib.rs` Builder 체인에 9개 플러그인 등록. `updater`/`biometric`은 표준 `target_os` cfg 분기 사용.
  - `capabilities/default.json`에 9개 permission 추가. `capabilities/desktop.json`에 `updater:default` 분리.
  - JS 패키지 10종 설치 (`@tauri-apps/plugin-{sql,stronghold,clipboard-manager,shell,os,updater,notification,biometric,deep-link,http}`).
- **이유:** T013(SQLite), T016(Stronghold), T023(Clipboard) 등 후속 태스크들이 사용하는 플러그인 사전 등록.
- **이슈 (AppLocker 환경 특이사항):**
  - `tauri-plugin-stronghold`의 전이 의존성 `iota_stronghold` → `iota-crypto` → `libsodium-sys-stable` 빌드 스크립트가 Windows AppLocker에 의해 차단됨.
  - Rust 의존성은 주석 처리, `lib.rs` 초기화 코드도 주석. JS 패키지는 정상 설치됨.
  - **활성화 조건:** 관리자 권한으로 `Add-MpPreference -ExclusionPath <src-tauri/target>` 실행 후 주석 해제.
  - 동일 이유로 `capabilities/default.json`에서 `stronghold:default`, `biometric:default`는 해당 플러그인 활성화 시 추가.
  - `updater:default`는 `capabilities/desktop.json`으로 분리 (플랫폼별 capability 파일 패턴 도입).
- **영향:**
  - `cfg(desktop)` 대신 `cfg(not(any(target_os = "android", target_os = "ios")))` 표준 cfg 사용 (Tauri build-script cfg 플래그는 cargo dependency resolution에서 사용 불가).
  - Stronghold 활성화 후 `lib.rs`에서 `Builder::with_argon2(salt_path).build()` 패턴 사용 예정 (T017에서 실제 KDF 로직 구현).

---

## [2026-04-22] T001+T002 — Cargo 워크스페이스 분리 + 핵심 의존성 (M0)

- **결정:**
  - `src-tauri/Cargo.toml`을 workspace root로 교체 (`[workspace] members = ["crates/*"]`, `resolver = "2"`).
  - `src-tauri/crates/` 아래 9개 크레이트 생성: `secretbank-app` (bin+lib), `secretbank-{core,storage,crypto,audit,feeds,connectors,railguard,sync}` (lib stub).
  - 기존 `src-tauri/src/` + `src-tauri/build.rs` 를 `secretbank-app` 크레이트 내부로 이동.
  - `secretbank-app/src/lib.rs`에서 `tauri::generate_context!("../../tauri.conf.json")`으로 workspace root의 `tauri.conf.json` 경로 명시.
  - `secretbank-app/build.rs`에서 `std::env::set_current_dir(workspace_root)`로 `tauri-build`가 `tauri.conf.json`을 찾도록 처리.
  - `[workspace.dependencies]`에 공통 의존성 선언 (tokio, serde, serde_json, sqlx, thiserror, anyhow, tracing, tracing-subscriber, ulid, time, reqwest, secrecy, zeroize, tauri, tauri-build, tauri-plugin-opener).
- **이유:** 이후 크레이트별 도메인 분리(crypto, storage, audit 등) + 버전 일원화를 위한 토대.
- **영향:**
  - 모든 Rust 기능 개발은 `src-tauri/crates/` 아래 적절한 크레이트에 배치.
  - `secretbank-app`이 Tauri 진입점. 다른 크레이트는 `tauri` 의존 없이 순수 도메인 로직.
  - `tauri.conf.json`, `capabilities/`, `gen/`은 계속 `src-tauri/` 최상단 유지.

---

## [2026-04-22] Phase 3 실행 모드 → **Auto edits**

- **결정:** 사용자가 **Auto edits 모드**를 선택. implementator·commiter·tester 가 파일 편집·테스트 작성·커밋까지 자동 진행한다.
- **자동 진행 범위 (승인 없이 가능):**
  - 파일 생성/수정/삭제
  - 패키지 설치 (pnpm/cargo)
  - 단위 테스트·통합 테스트 실행
  - `git commit` (단, `git push`는 제외)
  - lint/format/typecheck
  - 로컬 빌드
- **여전히 명시적 사용자 승인이 필요한 위험 작업 (Auto edits 모드와 무관):**
  - `git push` → Gate 4 전까지 절대 금지
  - 앱 배포 / 릴리스 / 앱스토어 제출 → Gate 3
  - `main` 브랜치 병합 (PR·force-push 포함)
  - `.env` / credential 파일 열람·수정
  - 외부 결제 API 호출 (Paddle/RevenueCat 실제 트랜잭션)
  - 외부 SaaS에 대한 쓰기 작업 (GitHub rotate secret, Slack 전송 등)
  - 보안 훅·CLA·라이선스 비활성화
- **영향:**
  - 각 태스크 단위로 commit이 생성됨 → 롤백 용이.
  - 사용자는 중간중간 리뷰보다는 **마일스톤 경계** 또는 **위험 작업 지점**에서 집중 검토.
  - 문제 발생 시 implementator 재시도 1회 → problem-solver 호출 (최대 3 라운드 × 5 방법) → 해결 실패 시 informer로 사용자 호출.

---

## [2026-04-22] 볼트 암호화 엔진 교체: Stronghold → age — **[갱신: 이전 결정 대체]**

- **결정:** 로컬 볼트 암호화 엔진을 **Tauri Stronghold**에서 **`age` crate(v1.2+)** 로 교체한다.
  - `tauri-plugin-stronghold` 와 `@tauri-apps/plugin-stronghold` 는 완전히 제거.
  - `age` (RustCrypto 생태계, MIT/Apache-2.0 듀얼 라이선스) 를 직접 Rust 의존성으로 추가.
  - 파생 키로부터 age identity(X25519) 를 만들어 볼트 파일(`vault.age`)을 암호화/복호화한다.
  - 세부 모드(X25519 recipient vs scrypt passphrase, streaming vs one-shot) 는 M1 T016 진입 시 확정.
- **이유 (4가지):**
  1. **Windows AppLocker/Defender 블로커** — `libsodium-sys-stable` build.rs 바이너리가 Windows 에서 실행 차단 (OS error 4551). 개발자 환경 예외 설정만으로는 **최종 사용자 환경에서도 같은 문제가 재발**할 위험이 있다.
  2. **Stronghold v3 deprecated 예정** — `docs/research_raw.md` 주제 #1 의 🟡 평가. 어차피 교체할 운명이었으며, `VaultStorage` trait 추상화(Q6=B)는 이 교체를 대비한 것.
  3. **모바일 성숙도 이슈 해소** — Stronghold 의 `iota-crypto` 체인은 모바일에서 🟡. `age` 는 pure Rust + 가벼운 의존성이라 iOS/Android 빌드에서 문제 없음.
  4. **단순성** — age는 표준 포맷(X25519 + ChaCha20-Poly1305), 1Password/Fastmail/Mozilla SOPS 등 다수 프로덕션 검증.
- **유지되는 것 (변경 없음):**
  - **OS Keyring 으로 마스터 키 저장** — 그대로.
  - **Argon2id KDF + HKDF 키 파생 체인** — 그대로. 차이는 최종 symmetric key 가 age identity 로 변환되는 점.
  - **Zero-Knowledge 아키텍처** — 서버는 여전히 암호문만 본다.
  - **CRDT 델타 암호화(Yjs + SecSync)** — 독립적 레이어, 영향 없음.
  - **`VaultStorage` trait 추상화(Q6=B)** — 오히려 이 결정을 바로 활용. 구현체 이름만 `StrongholdStorage` → `AgeVaultStorage`.
- **영향:**
  - `src-tauri/crates/secretbank-app/Cargo.toml` 에서 `tauri-plugin-stronghold` dependency 제거 (주석 포함).
  - `src-tauri/crates/secretbank-app/src/lib.rs` 에서 Stronghold 관련 TODO 주석 삭제.
  - `package.json` 에서 `@tauri-apps/plugin-stronghold` 제거.
  - M1 T016 의 태스크 제목을 `StrongholdStorage 구현` → `AgeVaultStorage 구현` 으로 변경 필요 (task.md, implementation_plan.md 정리 태스크를 M1 진입 전에 처리).
  - `docs/architecture.md` 섹션 4(보안) 의 "Stronghold" 언급을 `age` 로 갱신 필요.
- **대안 후보 검토:**
  - `age` (선정) — 표준 포맷, 성숙, RustCrypto, 다수 프로덕션 검증.
  - `orion` — 순수 Rust, 하지만 파일 포맷 표준 없음.
  - `chacha20poly1305` + `argon2` 직접 조합 — 가장 유연하나 포맷 설계/검증 부담 큼.
- **M1 T016 착수 전 확인 항목:**
  - `age::Encryptor::with_recipients(vec![x25519_recipient])` vs `age::scrypt::Recipient` 최종 선택.
  - 볼트 파일 경로: `${app_data_dir}/vault.age` (Tauri path API 로 획득).
  - 키 회전 시 파일 재암호화 배치 절차.

---

## [2026-04-22] 보안 핵심 결정 — **[일부 갱신]**

- 마스터 키 = OS keyring (+ Phase 2에서 Passkey/WebAuthn 선택적 2차 인증)
- 볼트 암호화 = ~~Tauri Stronghold~~ → **`age` crate** (XChaCha20-Poly1305 기반, X25519 또는 scrypt recipient + Argon2id 파생 키). 위 "Stronghold → age 교체" 섹션 참조.
- **영지식 아키텍처 (Zero-Knowledge)** = 클라이언트에서 암호화/복호화, 서버는 암호문만 릴레이
- **멀티 디바이스 페어링** = X25519 ECDH + QR/PIN 대역 외 검증 (Gemini 섹션 2.2)
- **CRDT 동기화** = Delta-based 또는 Operation-based CRDT + E2EE (SecSync 모델 참조)
- 감사 로그 = ed25519 서명 체인, append-only
- 앱 업데이트 = tauri-plugin-updater + minisign 서명 강제
- 키 메모리 노출 = `secrecy` crate로 Zeroize, 클립보드 자동 만료 30초
- Rust `unsafe` 정당화 없이 금지

---

## [2026-04-22] T008 — Tailwind v4 시맨틱 토큰 (vault 상태 색상)

- **결정:** Secretbank 고유의 의미적 상태 토큰 4종을 `src/styles/globals.css`에 추가한다.
  - `--vault-danger` / `--vault-warning` / `--vault-success` / `--vault-info` (각각 foreground 포함)
  - 라이트: destructive 기반 빨강, 앰버, 그린, 블루/사이안 oklch 값
  - 다크: 채도 낮추고 밝기 높인 버전
  - `@theme inline`에 `--color-vault-*` 매핑 → Tailwind 유틸리티 클래스 `bg-vault-danger` 등 사용 가능
- **이유:** Badge, Toast, Graph 노드, Incident 알림에서 일관된 상태 색상 표현. shadcn `destructive`만으로는 4가지 상태를 구분할 수 없음.
- **영향:** `badge.tsx`의 danger/warning/success/info variant에서 이 토큰 사용. 이후 모든 상태 표시 컴포넌트는 이 토큰을 참조.

---

## [2026-04-22] T009 — shadcn/ui primitive 12종 + 통합 radix-ui 패키지

- **결정:** shadcn/ui CLI 최신 버전은 개별 `@radix-ui/react-*` 패키지 대신 통합 `radix-ui` 패키지를 사용한다. 이를 수용한다.
  - 설치된 컴포넌트: dialog, input, label, form, tabs, tooltip, sonner, dropdown-menu, command, scroll-area, separator, skeleton
  - 신규 의존성: `radix-ui@^1.4.3`, `sonner@^2.0.7`, `cmdk@^1.1.1`, `react-hook-form@^7.73.1`, `@hookform/resolvers@^5.2.2`, `zod@^4.3.6`
- **이유:** shadcn/ui New York 스타일 + slate baseColor. 이후 M1+ 태스크에서 즉시 사용 가능.
- **조정:** `sonner.tsx`의 `next-themes` 의존성을 자체 `@/components/theme/theme-provider` 로 교체. `main.tsx`에서 `<Toaster />` 마운트 (ThemeProvider 내부).
- **영향:** `next-themes` 패키지는 설치되어 있으나 실제로 사용하지 않음 (shadcn CLI가 자동 설치). 추후 `pnpm remove next-themes`로 제거 고려 (타입체크/린트에는 영향 없음).

---

## [2026-04-22] T001 Cargo 구조 재조정 — `pnpm tauri dev` 수정 [갱신: 이전 T001+T002 결정 부분 대체]

- **결정:** Tauri v2 공식 권장 구조로 재조정. `src-tauri/Cargo.toml`이 `[workspace]` + `[package]` + `[[bin]]`을 동시에 담는 manifest가 된다.
  - `src-tauri/Cargo.toml` — `[workspace]` + `[workspace.dependencies]` 유지. 하단에 `[package]` (name="secretbank"), `[[bin]]` (path="src/main.rs"), `[build-dependencies]` (tauri-build), `[dependencies]` (tauri, tauri-plugin-opener, secretbank-app, 플러그인 9종 mirror) 추가.
  - `src-tauri/src/main.rs` — 한 줄 shim (`secretbank_app::run()`). Tauri CLI가 여기서 바이너리 타겟을 찾음.
  - `src-tauri/build.rs` — 표준 `tauri_build::build()`. capability 검증은 여기서만 실행.
  - `crates/secretbank-app/Cargo.toml` — `[[bin]]` 제거. `[lib]` name="secretbank_app". `tauri-build` build-dependency 제거. 플러그인 deps는 그대로 유지.
  - `crates/secretbank-app/build.rs` — `cargo::rustc-check-cfg` 선언만 (OUT_DIR 확보 + mobile/desktop/dev cfg 인식). `tauri_build::build()` 미호출 (Windows에서 embed-resource가 `rustc-link-arg-bins` 발행하면 lib에서 오류).
  - `crates/secretbank-app/src/main.rs` — 삭제.
  - `src-tauri/Cargo.toml`의 루트 `[dependencies]`에 플러그인 9종을 mirror로 추가한 이유: `tauri_build::build()`가 capabilities 검증 시 직접 dependency만 조회함. lib의 전이 의존성으로는 permission 인식 불가.
  - `tauri.conf.json`에 `plugins.updater` 섹션 추가 (pubkey=""로 초기화).
- **이유:** T001에서 virtual manifest로 교체한 결과 Tauri JS CLI(`@tauri-apps/cli`)가 `[package]` 섹션을 못 찾아 `"No package info in the config file"` 오류로 `pnpm tauri dev` 실패.
- **영향:**
  - `secretbank_app::run()` 공개 API 유지. 9개 lib 크레이트 변경 없음.
  - `crates/secretbank-app`은 이제 library crate. 향후 Tauri 명령 등록 및 플러그인 초기화의 거점 역할 유지.

---

## [2026-04-22] Tauri workspace 에서 `generate_context!` 는 **반드시 root crate 에서** 호출 [갱신: T001 재조정 결정 보강]

- **결정:** `tauri::generate_context!()` 는 root crate (`src-tauri/src/main.rs`) 에서 호출하고 결과를 subcrate 의 `run(context: tauri::Context)` 로 넘긴다. subcrate 의 `lib.rs` 에서 직접 호출하면 안 된다.
  - `src-tauri/src/main.rs` — `secretbank_app::run(tauri::generate_context!())` 로 변경.
  - `src-tauri/crates/secretbank-app/src/lib.rs` — `pub fn run(context: tauri::Context)` 시그니처. 매크로 호출 제거, `.run(context)` 로 전달.
  - `src-tauri/Cargo.toml` root `[dependencies]` 에 `serde`, `serde_json` 추가 (`generate_context!` 매크로 expansion 이 참조).
- **이유:** `tauri_build::build()` 는 root crate 의 `build.rs` 에서 실행되어 `gen/schemas/{capabilities,acl-manifests}.json` 을 **root crate 의 OUT_DIR** 에 emit 한다. `generate_context!` 매크로는 호출 crate 의 `CARGO_MANIFEST_DIR` 기준으로 이 파일들을 찾아 플러그인 ACL 을 로드하는데, subcrate 에서 호출하면 subcrate 의 OUT_DIR 에서 찾다가 실패하여 **모든 플러그인 IPC 가 `Plugin not found` 로 차단된다**. 커스텀 `#[tauri::command]` 는 `core:default` 로만 검증되므로 이 문제가 드러나지 않다가 T023 수동 검증에서 처음 `tauri-plugin-sql` 을 호출했을 때 폭발.
- **영향:**
  - 이전 결정(T001 재조정 라인 450 "`tauri::generate_context!("../../tauri.conf.json")`으로 workspace root의 `tauri.conf.json` 경로 명시") 는 **잘못된 접근이었음**. 경로 명시로 `tauri.conf.json` 은 찾을 수 있지만 `gen/schemas/` ACL 매니페스트는 여전히 subcrate OUT_DIR 기준으로 탐색되어 플러그인이 모두 깨진다.
  - 향후 Tauri workspace 분리 시 이 패턴을 **기본 규칙**으로 유지. `generate_context!` 의 모든 호출은 root crate 에서만 허용.
  - 커밋: `eaece03 fix(tauri): generate_context!를 root crate 로 이동해 플러그인 ACL 복구`.

---

## [2026-04-23] T035 범위 — Project/Usage Tauri 커맨드 동시 구현 (A안)

- **결정:** T035 드롭&스캔 결과 검토 UI 를 구현하면서 `project_create` / `usage_create` Tauri 커맨드 래퍼도 같은 태스크에서 함께 추가한다. T035 DoD ("폴더명으로 Project 자동 생성 → Usage 자동 생성") 를 풀 스코프로 만족시키기 위해 선택된 A안.
- **대안 기각:**
  - B안 (credential 만 등록, project/usage 는 T037/T038 로 연기): DoD 의 "import → project + usage 자동 링크" 가 깨짐. 사용자가 스캔 결과를 import 해도 Inventory 에서 어느 프로젝트에 속하는지 알 수 없어 UX 반쪽.
  - C안 (project 만 추가, usage 는 T038): project 단독으로는 "어느 파일에서 어떤 env var 로 쓰이는가" 추적 불가. UsageGraph (M3) 의 선행 데이터가 쌓이지 않음.
- **구현 범위 (T035 확장):**
  1. `crates/secretbank-app/src/commands/projects.rs` 신설 — `project_create(input: ProjectInput)` + `project_list()` + `project_get(id)`. storage repo `project.rs` 는 이미 존재.
  2. `crates/secretbank-app/src/commands/usage.rs` 신설 — `usage_create(input: UsageInput)` + `usage_list_by_credential(id)`. storage repo `usage.rs` 는 이미 존재.
  3. `commands/mod.rs` 에 `pub mod projects; pub mod usage;` 등록, `lib.rs` 의 `invoke_handler!` 에 커맨드 추가.
  4. Vault unlock 상태 체크(기존 credential 커맨드 패턴) 재사용.
  5. `src/features/onboarding/DetectedKeysReview.tsx` — 테이블 + 일괄 import 플로우 (project_create → credential_create × n → usage_create × n, 단일 트랜잭션 대신 best-effort 순차 실행, 실패 시 toast 에 성공/실패 건수 표시).
- **영향:**
  - T037 "Project 관리 페이지" 는 CRUD UI 측면만 남음 (커맨드는 T035 에서 완비). Priority Should 유지.
  - T038 "Deployment 관리" 는 project-scoped deployment CRUD 가 본 스코프. usage 커맨드와 별개. 영향 없음.
  - UsageGraph (M3 T041~) 선행 데이터 확보 — 드롭&스캔으로 자동 생성된 usage 행들이 그래프 노드/엣지 소스가 됨.

---

## [2026-04-23] i18n 지원 언어 확장 — 중국어(간체) 추가

- **배경:** T011 i18n 초기 구성은 en/ko/ja 만 포함했다. 사용자가 세션 재개 시점에 "이전 대화에서 중국어 추가를 요청했다"고 확인.
- **결정:** 지원 언어를 en / ko / **ja** / **zh(간체)** 4종으로 확장.
- **구현 규약:**
  1. 신규 locale 파일 `src/locales/zh/common.json` 은 en/ko/ja 와 **완전히 동일한 키 구조**를 유지. 누락 키 허용 금지 (i18next fallback 으로 en 표시는 가능하나, 팀 원칙상 4개 언어 일관 번역).
  2. `src/lib/i18n.ts` `supportedLngs` 배열에 `"zh"` 등록 + `resources.zh` 추가.
  3. `SettingsPage` 언어 셀렉터 `currentLang` 분기와 `<SelectItem>` 목록에 "中文" 옵션 추가.
  4. **새 feature 에서 번역 키를 추가할 때마다 4개 언어 전부에 동기 업데이트.** 별도 자동화 없이 수동 규율로 유지 (PR 리뷰 시 locale diff 라인 수 4파일 비교).
- **영향:**
  - T036 Welcome(13키 × 4) / T037 Project(40키 × 4) / T038 Deployment(28키 × 4) / T039 Usage(22키 × 4) / T040 Security Score(20+키 × 4) 모두 동시 번역 완료.
  - 추후 M3~M13 에서 추가되는 feature 는 본 규약을 계속 준수. 자동화(CI 키 누락 검사) 는 M13 Release 전 고려.
- **커밋:** `1168210` (중국어 초기 추가), 이후 모든 T036+ 커밋에 zh 동기 포함.

---

## [2026-04-23] T040 — 보안 점수 설계 (3단계 + 7 factor, Rust authoritative)

- **배경:** T040 DoD 는 "각 credential 에 간단한 위험도 점수 계산 + Card 의 3단계 색상 dot + hover tooltip". 구체 임계값과 factor 목록은 플래너가 지정하지 않음 → 구현자가 결정.
- **결정:**
  - **레벨 임계값**: `total ≥ 80` = **safe**, `total ≥ 50` = **warn**, 그 아래 = **danger**. 만점 100 에서 감점 방식.
  - **Revoked / Compromised 단락**: status 가 Revoked 또는 Compromised 일 때는 나머지 factor 평가를 건너뛰고 즉시 `total=0, level=Danger, factors=[해당 코드]` 반환. 다른 factor 와 혼합하지 않음.
  - **FactorCode 7종과 감점**:
    | FactorCode | 조건 | penalty | severity |
    |:--|:--|:-:|:--|
    | `Revoked` | status==Revoked | 100 (단락) | Danger |
    | `Compromised` | status==Compromised | 100 (단락) | Danger |
    | `Expired` | expires_at ≤ now | 50 | Danger |
    | `ExpiringSoon` | 0 < (expires_at − now) ≤ 30d | 20 | Warn |
    | `RotationOverdue` | last_rotated + policy_days < now | 15 | Warn |
    | `NoRotationHistory` | last_rotated==None & created_at ≤ now − 90d | 10 | Warn |
    | `NoScope` | scope==None | 5 | Info |
  - **Rust authoritative**: 점수 계산 로직은 `secretbank-core/src/security_score.rs` 의 pure 함수 (`score(cred)` / `score_at(cred, now)`). `CredentialSummary` 와 `CredentialFull` 응답에 서버가 계산한 `score: ScoreBreakdown` 필드를 주입. **프런트 TS 에 동일 로직 재구현 금지** — Single source of truth.
  - **FactorCode 직렬화 규약**: `#[serde(rename_all = "snake_case")]` 로 JSON 에서 `"expired"` / `"expiring_soon"` 등 snake_case. 프런트 i18n 키는 `inventory.factor.{code}` / `inventory.factorShort.{code}` 자동 매핑.
- **향후 factor 추가 규칙:**
  1. `secretbank-core/src/security_score.rs` 의 `FactorCode` enum 에 variant 추가 + `score_at()` 내 분기 + 유닛 테스트.
  2. 4개 언어 (`en/ko/ja/zh`) 의 `inventory.factor.{code}` 와 `inventory.factorShort.{code}` 키 동시 추가.
  3. 프런트 UI 코드는 **수정 불필요** — SecurityDot 이 `inventory.factor.{factor.code}` 로 자동 매핑.
- **Follow-up (M3 이후):**
  - `usages.is_empty()` 기반 factor ("NoUsages") 는 `CredentialFull` 전용으로 추가 가능. 현재 list 경로는 usages 를 쿼리하지 않으므로 list 와 detail 의 score 값이 달라질 수 있음 — 추가 시점에 UX 결정 (list 에도 표시할지, detail 에서만 노출할지).
- **커밋:** `11281cd` feat(security-score): T040 Credential 보안 점수 + 3단계 시각화.

---

## [2026-04-23] UI — BottomNav 모바일 6탭 확장 (T037 부수 결정, 재검토 예약)

- **배경:** T037 에서 `/projects` 라우트를 추가하면서 `src/components/shell/BottomNav.tsx` 의 `grid-cols-5` 를 6개 네비 항목 수용을 위해 `grid-cols-6` 로 확장.
- **결정 (잠정):** 모바일 BottomNav 는 6탭 구성 (Inventory / Projects / Graph / Incidents / Audit / Settings). 모바일 5탭 관례를 의도적으로 깼다.
- **재검토 예약 (M3~M6 중):**
  - 후보 A: Audit 탭을 Settings 내부로 이동 → 5탭으로 환원.
  - 후보 B: 탭을 스크롤 구조 (overflow-x) 로 전환 → 7탭 이상 확장 가능.
  - 후보 C: 현재 6탭 유지 (iPad/데스크톱 우선 사용 가정).
- **판단 트리거:** M6 Audit Log 실제 구현 시점에 UX 검증. 만약 모바일에서 Audit 접근 빈도가 낮으면 A안 적용.
- **커밋:** `bf67527` feat(projects): T037 Project CRUD 페이지 + 연결된 credential 뷰 (BottomNav 수정 포함).

---

## [2026-04-24] 그래프 노드 위치 영속화 (T047 follow-up, C 옵션 채택)

- **결정:** 사용자가 드래그로 배치한 노드 위치를 **localStorage 에 영구 저장**. 앱 재시작 및 페이지 이동 후에도 유지.
- **이유:** 사용자 의견 — "드래그해도 저장 안 되면 드래그 기능의 목적이 없다". 유스케이스(복잡한 그래프 정리 / 비즈니스 그룹핑 / 프레젠테이션) 는 모두 영속화 전제. "MVP 이상 탁월함 지향" 비전과 일치.
- **영향:**
  - `src/features/graph/use-graph-node-positions.ts` 훅 신규 (localStorage key `Secretbank:graph:nodePositions`, `setPosition` / `clear` / `pruneStale` API).
  - `adapter.toReactFlowElements(payload, direction, savedPositions?)` 3번째 파라미터 — dagre 위에 merge.
  - `DependencyGraph` 가 `onNodeDragStop` 저장 + 조건부 "Reset layout" 버튼 + payload 변경 시 stale entry 자동 prune.
  - 4 locales `graph.resetLayout` i18n 키 (en/ko/ja/zh).
- **대안 기각:** A(현상 유지 — UX 의도 미충족), B(세션 내만 — 앱 재시작마다 리셋되어 실익 낮음), D(드래그 기능 제거 — 유스케이스 가치 있음).
- **커밋:** `7d5f3f3` feat(graph): 노드 드래그 위치 영속화 + Reset layout 버튼.

---

## [2026-04-24] 프로젝트 비전 확정 — "MVP 이상 탁월함 지향"

- **결정:** "필요 최소한" 구현 타협 금지. 동 기능 세계 최고 프로그램을 **능가하는** 완성도 목표. 글로벌 SaaS 판매 (가격은 [2026-04-25] 결정 참조).
- **이유:** 저가격 × 고품질 포지셔닝이 시장 경쟁력의 핵심. 저렴한 가격이 UX 허술함의 정당화가 될 수 없다.
- **영향 (이후 모든 의사결정에 적용):**
  - 옵션 제시 시 "빠른 대신 허술함 / 느리지만 제대로" 중 **제대로** 를 기본 권장.
  - 기능 축소(D 옵션 류) 는 "단순화가 실제 사용자 가치에 부합할 때만" 제안. 구현 부담 회피용 제안 금지.
  - UX 디테일(드래그 영속화 같은 당연한 기대) 은 언제나 충족.
- **메모:** 개인 메모리 `project_vision.md` 에 자동 기록됨 (향후 모든 세션에서 로드).

---

## [2026-04-25] 가격 인하 — Pro $2/월·$15/년 → **$1/월·$10/년**

- **결정:** Pro 플랜 가격을 **$1/월 또는 $10/년** 으로 인하. 기존 결정 ($2/월·$15/년) 대체.
- **이유:**
  - 사용자 판단: "$1/월·$10/년 이면 충분히 지갑을 연다." — 진입장벽 ↓ 으로 무료 → Pro 전환률 ↑ 우선.
  - 가격 비교: Bitwarden Premium ($1/월) 과 동률, 1Password Individual ($3-5/월) 보다 한참 저렴 → "API 키 관리 SaaS" 라는 신규 카테고리에 가격 우위로 침투.
  - 연간 할인: $10/년 = 월 $0.83 → 사실상 2개월 무료. 연간 결제 유도.
- **영향:**
  - 기존 모든 의사결정 항목의 "$2/월" / "$15/년" 표기를 일괄 갱신 (이 문서 + README 한국어 요약 + memory `project_vision.md` 등).
  - "Pro 구독을 $X 에 결제할 가치가 있는 최소 기능" 기준점이 $2 → $1 로 낮아지지만, **기능 축소 의미 아님** — 가격 인하는 진입장벽 완화이고 품질 기준은 그대로 유지 (위 비전 결정과 일치).
  - Apple/Google IAP 최소 가격 단위 ($0.99 / $0.99) 와 정렬 — IAP 문제 없음. Paddle MoR 도 $1 결제 처리 가능 (수수료 비율은 약간 ↑).
  - **자동 rotation 은 Pro 핵심 가치 기둥으로 격상** (다음 결정 참조).
  - **팀 플랜 가격 별도 검토 필요** — 사용자당 모델은 향후 결정 (현재 placeholder $10/seat/월 그대로 유지).

---

## [2026-04-25] 자동 rotation — Must 격상 + 본격 마일스톤화

- **결정:** **자동 rotation** 을 Pro 의 **핵심 가치 기둥** 으로 격상하고 별도 마일스톤 (M14 또는 M5 후속) 으로 분리. 기존 task.md 의 T064 (Pro 게이트) 와 별개로, 실제 rotation 파이프라인 구현을 정식 태스크로 추가한다.
- **이유:**
  - 사용자 강조: "자동 rotation 이 기능은 반드시 필요하다."
  - 시장 전략 분석 (`user_research/Secretbank_strategy.md`) 에서 3단계 (기업이 돈 내는 이유) 의 핵심 기능으로 식별 — "키 회전 자동화" 가 보안 사고 예방·규정 준수·시간 절약의 직접적 가치.
  - 데이터 해자 + 락인 구조의 일부: rotation 파이프라인이 깊게 연동되면 **떠나는 비용 ↑**.
- **영향 — rotation capability 단계화** (T059 `RotationCap { Full / Partial / Manual }` 활용):
  - **Phase R1 — Full**: AWS IAM (`CreateAccessKey + DeleteAccessKey`), GCP Service Account Key, Azure Key Vault. 완전 무중단 자동 rotation 구현.
  - **Phase R2 — Partial**: Stripe restricted key (rolling), GitHub fine-grained PAT (만료일 기반 알림 + 수동 rotation 가이드), Vercel/Netlify 환경변수.
  - **Phase R3 — Manual + Provider intelligence**: OpenAI / Anthropic / Slack 등 자동 rotation 미지원 provider 는 webhook 기반 알림 (provider 가 키 deprecation 발표 시) + 수동 step-by-step 가이드.
  - **Phase R4 — Schedule + Health**: 사용자 정책 (예: 90일마다) + rotation 실패 alert + rollback (이전 키 30일 grace period 후 폐기).
- **마일스톤 신설:** task.md 에 **M14 — Auto Rotation** 추가. M9 (Sync) 완료 후 진입. 릴레이 의존 (provider API 호출 위한 OAuth/credential 보관) 이라 M5/M9 와 동시에 설계 진행.
- **커밋 / 후속:** task.md 에 새 마일스톤 + 6~10 태스크 추가 후 별도 PR.

---

## [2026-04-25] 백로그 — 시장 전략 부합 권장 조치 (사용자 결정 갱신)

`user_research/Secretbank_strategy.md` 점검 결과 도출된 후속 안건. 즉시 구현 아님, 향후 마일스톤 검토 시 우선 고려.

1. **팀 플랜 가격 결정**: ✅ **$5/seat/월** 확정 (위 가격 인하 결정에 반영). 1Password Teams ($7.99) 보다 저렴, API 키 관리 신규 카테고리 침투 가격대 정렬.
2. **익명 집계 통계 옵트인**: zero-knowledge 가 네트워크 효과 약화 → 사용자가 명시 옵트인 시 "어떤 issuer 가 가장 많이 노출되는가" 같은 익명 집계 채널 도입. 데이터 해자 회복 경로. **M9 동기화 안정화 이후 신설 마일스톤 (M16)** 으로 진행.
3. **SDK 로드맵**: npm (`@Secretbank/sdk`), pip (`Secretbank`), cargo (`Secretbank-sdk`) 패키지로 코드 안에서 import → 락인 강화. **M5 connector 완료 + M9 동기화 안정화 후 신설 마일스톤 (M17)** 으로 진행.
4. **CI/CD 통합 마일스톤**: GitHub Actions / GitLab CI / Vercel preview / Netlify build hook 통합으로 키 누출 차단 자동화. **M5 GitHub connector (T060+) 완료 후 신설 마일스톤 (M15)** 으로 진행. 새 마일스톤 placeholder 는 task.md 에 동시 추가.

마일스톤 신설 순서 (확정):

- **M14** Auto Rotation (T119~T125) — M9 완료 후
- **M15** CI/CD Integration — M5 완료 후
- **M16** Anonymous Telemetry (옵트인) — M9 완료 후
- **M17** SDK Ecosystem (npm/pip/cargo) — M5 + M9 완료 후

---

## [2026-04-25] M5 릴레이 진입 결정 — Cloudflare Workers 스캐폴드 시작

- **결정:** M5 T061 ~ T064 (Cloudflare Workers 릴레이 + GitHub installation token + Secret Scanning + Connector UI) 진입.
- **이유:** "릴레이가 락인의 입구" — `Secretbank_strategy.md` 분석에서 도출된 우선순위 1번. 자동 rotation, OAuth 인증, 동기화 인프라 모두 릴레이 의존이라 빨리 시작할수록 후속 마일스톤이 풀린다.
- **영향:**
  - T079 (M8 Cloudflare Workers 스캐폴드) 가 사실상 T061 의 선행 작업 — M5 진입 시 자동으로 함께 진행.
  - 외부 인프라 의존 (사용자 수동 처리 필요): Cloudflare 계정, wrangler CLI, D1 데이터베이스, KV namespace, GitHub App 등록 (T060 runbook).
  - 모노레포 vs 별도 repo 결정 — **옵션 C 확정** (다음 결정 참조).

---

## [2026-04-25] OSS / EE 디렉토리 분리 — 옵션 C (실용적 분리) 확정

- **결정:** OSS 코어는 루트에 그대로 두고, EE 코드는 `ee/` 서브트리로 격리한다. `ee/LICENSE` 에 별도 라이선스 (Secretbank Enterprise License v1.0) 파일 + `ee/README.md` 명시.
- **이유:**
  - 1인 개발 + 빠른 진입 + 회귀 위험 최소화.
  - "엄격 분리" 의 본질 (라이선스 파일 + 디렉토리 + 안내) 충족 — 옵션 D (모든 OSS 까지 `oss/` 로 이동) 의 import 경로 / Cargo workspace / Tauri config 대규모 이동 비용 회피.
  - Bitwarden 모델과 정렬 — 한 repo 안에 디렉토리별 라이선스 분리.
- **영향:**
  - `ee/secretbank-relay/` 가 Cloudflare Workers 릴레이의 위치. `ee/` 는 향후 다른 EE 모듈 (premium connectors 등) 도 수용.
  - 빌드 파이프라인 분리: OSS 는 기존 GitHub Actions, EE 는 별도 워크플로우 (`.github/workflows/deploy-relay.yml` 예정 — Cloudflare API token 시크릿 의존).
  - LICENSE 텍스트는 placeholder (Bitwarden License v1.0 변형). 정식 라이선스는 변호사 1회 리뷰 후 (project-decisions Open Issue 항목).
- **커밋:** ee/ 골격 — 다음 커밋에 포함.

---

---

## [2026-04-24] 피드 스케줄러 spawn 패턴 확정 (M3 수동 검증 중 발견)

- **결정:** `tauri::Builder::setup` 안에서 tokio 런타임 핸들을 요구하는 **모든 동기 호출** (`JoinSet::spawn`, `tokio::spawn`, `Handle::current`) 은 반드시 `tauri::async_runtime::block_on` 안에서 실행한다.
- **이유:** `setup` 콜백은 tokio 런타임 context 바깥에서 실행돼 동기 spawn 시 panic (`there is no reactor running`).
- **영향:** T054 `spawn_feed_scheduler` 호출이 `setup` 에서 panic → hotfix 로 `block_on` 안으로 이동. 향후 setup 에 추가되는 모든 service 초기화 코드가 같은 패턴 준수 필요.
- **커밋:** `85f347a` fix(app): 피드 스케줄러 spawn 을 tokio context 안으로 이동.

---

## [2026-04-23] M2 종료 (Inventory UI + 드롭&스캔) — 16/16 완료 ✅

- **기간:** 2026-04-22 T025 시작 ~ 2026-04-23 T040 완료.
- **스코프:** 태스크 16 (Must 13 + Should 3) / 완료 100%.
- **커밋 범위:** `ab69319` (T025) ~ `11281cd` (T040) + 문서 정리. 누적 57 commits (프로젝트 전체 기준).
- **핵심 산출물:**
  - **Backend Tauri 커맨드 28개**: vault 4 + credential 6 + issuer 2 + project 5 + deployment 4 + usage 4 + settings 2 + scanner 1.
  - **Frontend features**: `inventory`, `projects`, `onboarding` (DropZone/Scan/Welcome), `settings`, `command-palette`.
  - **도메인 로직 모듈**: `security_score` (T040), `env_scanner` (T033), `issuer-presets` (T028 Rust seed + TS 10종).
  - **테스트**: Rust 95+ 통과 (security_score 9 + 기존), Vitest 140 통과.
- **다음 마일스톤:** M3 Dependency Graph & Blast Radius (T041~T048). PetGraph 의존성 그래프 엔진 → React Flow 렌더 → blast radius 시뮬레이션.
- **Follow-up 큐 (M3 이후 해결):**
  1. 드롭&스캔 secure import 경로 (scan 결과의 실제 값을 재파싱해 age 볼트에 직접 주입 — T035 교훈).
  2. Deployment 삭제 시 `usage.deployment_id` cascade 처리 (T038 교훈).
  3. BottomNav 6탭 UX 재검토 (상단 항목 참조).
  4. Security Score 에 `NoUsages` factor 추가 (CredentialFull 전용).

---

## [2026-04-25] M15 CI/CD Integration 진입 순서 결정

- **결정:** M15 의 두 갈래(Product / Internal) 중 **Internal infra (T132, T133) 를 먼저 구현**하고, Product feature (T126~T131) 는 후속 세션에서 진행한다.
- **이유:** Internal infra 가 안정화되어야 Product feature 의 배포 파이프라인이 작동한다. GitHub Actions Secrets 를 관리하는 코드(T126~T128) 자체도 ci.yml + deploy-relay.yml 을 통해 검증/배포되기 때문에 인프라 선행이 필수.
- **T132 세부 결정:**
  - `deploy-relay.yml` — `paths` 필터로 `ee/secretbank-relay/**` 변경 시만 트리거 (불필요한 배포 방지)
  - `concurrency.cancel-in-progress: false` — 배포 중단은 절대 불가 (wrangler 배포 원자성 보장)
  - `cloudflare/wrangler-action@v3` 사용 (`account_id` 는 `wrangler.toml` 에서 읽음)
  - pnpm 9, Node 20 고정 (현재 lockfile 기준)
- **T133 세부 결정:**
  - 기존 `ci.yml` 에 `ee-relay` job 추가 (별도 파일 아님)
  - CI 단계에서는 시크릿 불필요 — typecheck + vitest 만 실행
  - fork PR 에서도 `ee-relay` job 동작 (시크릿 없이)
- **영향:** `.github/workflows/deploy-relay.yml` 신규, `.github/workflows/ci.yml` `ee-relay` job 추가, `docs/runbooks/cloudflare-api-token.md` 신규, `ee/README.md` CI/CD 섹션 갱신.

---

## [2026-04-28] 비전 정렬 점검 — Option A (sync 풀 완료 후 CLI/MCP 진입)

### 배경

자율 모드 Night mode 8/9 진행 중 사용자가 비전 점검 요구. "단순히 MVP 가 아니라 글로벌 SaaS 로 성장할 비전" — 1Password / Bitwarden / Doppler / Infisical 같은 글로벌 경쟁자를 능가할 차별화가 필요.

### 진단 (2026-04-28 시점)

**현재 강점 (실재 차별화):**

- M3 dependency graph + blast radius (1Password/Doppler 가 못 함)
- M4 incident feed auto-match (Bitwarden Watchtower 보다 정확)
- M5 RAILGUARD (.cursorrules / CLAUDE.md / Copilot — AI 에디터 시대의 신선한 카테고리)
- M6 audit hash chain (1Password 도 안 함)

**비전 대비 부족 (글로벌 경쟁 관점):**

- CLI 부재 — Doppler 의 `doppler run -- npm start` 같은 dev tool 일급 시민 표면 부재
- MCP server 부재 — Claude / Cursor 가 vault 와 직접 대화하는 새 카테고리 (아직 어떤 경쟁사도 안 만듦, **우리 선점 가능**)
- Team / RBAC / SSO 부재 — B2B 진입 비용 0
- Auto rotation (M14) 미구현
- Supply chain risk graph (npm package → secret leak 자동 감지) 미구현 — 우리 dependency graph + breach feed 의 시너지 자산

### 결정 — Option A

- **M9 풀 완료 후 신설 M18 (CLI + MCP server) 즉시 진입.** 시간 더 걸려도 좋은 프로그램 우선.
- M9 의 잔여 sub-phase (G-pair-2.5/3/4 + UI + conflict + offline + entitlement) 모두 충실히 마무리. sync 가 흔들리면 다른 차별화도 무의미.
- M14 (auto rotation) 은 M18 (CLI/MCP) 직후 진입. **차별화 = (graph + RAILGUARD) × (CLI/MCP 표면) × (rotation 자동화)** 의 곱셈 효과.

### 신설 마일스톤 (placeholder)

- **M18** — CLI + MCP server (`Secretbank run -- cmd` + Claude/Cursor MCP 통합)
  - **왜 핵심인가**: dependency graph + RAILGUARD 가 GUI 안에 갇혀있으면 dev tool 시장 진입 못 함. CLI/MCP 가 그 자산을 모든 dev surface 에 노출하는 분배 채널.
- **M19** — Team / org / shared vault (B2B 진입)
- **M20** — Supply chain risk graph (npm/PyPI package → secret leak 자동 감지 + dependency graph 와 결합)
- **M21** — VS Code + JetBrains plugin (M18 이후, MCP server 가 plugin layer 도 cover 가능)

### 우선순위 재배열 (2026-04-28 → 2026-05-end)

```
현재 → M9 잔여 (G-pair-3/4 + UI + conflict + offline + entitlement) 풀 완료
→ M14 (auto rotation) 또는 M18 (CLI/MCP) 중 결정
→ 둘 다 차례로 (M18 우선 추천 — moat 효과 즉각)
→ M19 (team)
→ M11 (mobile)
→ M12 (web viewer)
→ M13 (i18n + updater + release)
→ M20 (supply chain)
→ M21 (IDE plugins)
→ Beta launch + post-deploy review
```

### 자율 모드 운영 원칙 (강화)

- 자율 모드는 sub-phase 작업에만 적용 — **비전 정렬 점검은 사용자 trigger 가 필요**.
- 매 마일스톤 클로즈 시 (M9, M14, M18 ...) "다음 어디로?" 의 비전 점검 1회 의무.
- 단순 MVP 채우기 ≠ 글로벌 SaaS. 차별화 우선.

---

## [2026-04-30] LockScreen 글로벌 LanguageSwitcher — 11개 → 15개 언어로 확장 (사용자 trigger)

- **갱신 (같은 날 내 후속):** 사용자 지적으로 인도어(힌디) 누락이 잘못 — 인구 규모 (~6억) 상 한국어/일본어/그리스어보다 더 큰 시장 무시. 4개 추가:
  - **ar** (العربية / 아랍어, **RTL**): MENA 권역 + 글로벌 무슬림 + IT 시장 (UAE/사우디 정부 디지털화 가속)
  - **hi** (हिन्दी / 힌디어): IT 강국 인도. 직전 lap 누락 보정.
  - **vi** (Tiếng Việt / 베트남어): 동남아 IT 허브 (FPT/VNG/Tiki 생태계)
  - **pl** (Polski / 폴란드어): 유럽 IT 강국 (CD Projekt/Allegro)
- **RTL 처리:** `SUPPORTED_LANGUAGES` 에 `dir: "ltr" | "rtl"` 메타필드 추가. `i18n.ts` 에서 `i18next.on("languageChanged", ...)` 으로 `<html lang>` + `<html dir>` 자동 동기화 → 아랍어 선택 시 layout 자동 RTL.
- **결정 (원본):** LockScreen 우측 상단 corner 에 `LanguageSwitcher` (globe icon dropdown) 통합. **지원 언어 15개**:
  - 기존 4개: en, ko, ja, zh
  - 신규 11개 (이번 lap): es, fr, de, it, el, pt, ru, **ar, hi, vi, pl**
- **이유:**
  - 글로벌 SaaS 비전 (project_vision.md "월 $2 / 년 $15 글로벌 SaaS") 을 위해서는 **첫 인상 화면인 LockScreen 의 언어 가시성**이 가장 큰 wedge
  - IT 강국 + 인구 규모 기준 11개 언어가 첫 lap 의 적정 폭. 추가 언어 (아랍어 RTL, 힌디어, 베트남어, 폴란드어 등) 는 사용자 수요 기반으로 추후 lap 에서 단계적
  - LanguageDetector 의 `localStorage` 캐시로 사용자 선택이 자동 영속화 → 다음 실행에도 유지
- **번역 범위:** 신규 7개 언어 common.json 은 **LockScreen 가시 키만 정확 번역** (vault.\* 11개 키 + settings.language). 다른 화면은 i18next 의 fallback 메커니즘으로 자동 영어 표시. 전체 번역 보강은 **M13 (i18n + Updater + Release) 시점에 단계적**.
  - 기존 4개 언어 (en/ko/ja/zh) 는 이미 전체 709줄 번역 — 그대로 사용
  - 신규 언어 자동 fallback 설계는 i18next 의 표준 동작 — 별도 코드 없음
- **컴포넌트 위치:** `src/components/language-switcher.tsx` (일반 컴포넌트). LockScreen 외 settings 페이지 등에서 재사용 가능. `variant="corner"` (vault 톤 globe 버튼) / `variant="plain"` (표준 폼 dropdown) 두 형태.
- **영향:**
  - 신규 locale 7개 추가 → bundle 사이즈 미세 증가 (각 ~500B) — 첫 lap 핵심 키만 포함이라 전체 영향 미미
  - 추후 M13 에서 11개 언어 × 709 키 풀 번역 단계로 진입 — 현재 골격 그대로 확장
  - 다른 화면 (Inventory/Graph/Settings 등) 의 언어 보강은 사용자 베타 피드백으로 우선순위 결정

---

## 2026-04-30 — M23 Vault Charter (recovery 메커니즘) 신설

- **결정:** passphrase 분실 대비 recovery 메커니즘으로 "Vault Charter" 마일스톤(M23) 신설.
- **이유:** Zero-Knowledge 아키텍처 특성상 passphrase 를 잊으면 vault 가 영구 손실. 출시 블로커. 서버 reset 불가 (relay 는 ciphertext 만 보유). 사용자 단 한 명이라도 passphrase 잊고 vault 날아가면 평판 회복 불가.
- **영향:**
  - 출시 전 필수 마일스톤. 시나리오 A 베타 출시 전 M23-A~D 완료 필요.
  - vault 파일 포맷에 두 번째 envelope 추가 (charter-derived key 로 enc_key wrap).
  - Settings 에 "Charter cooldown 7일" 토글 추가 (도난 방지).

## 2026-04-30 — Charter 차별화 4 축 (1Password Emergency Kit 와 다름)

- **결정:** 출시 시 4 차별화 축을 모두 구현.
  1. **컨셉 이름**: "Vault Charter" (1Password 의 "Emergency Kit" 과 다른 봉인 헌장 메타포).
  2. **포맷**: Diceware 6 단어 + 4-digit verifier (entropy ≈ 77.55 bit + 한 단어 오타 즉시 감지).
  3. **분할**: Shamir Secret Sharing 2-of-3 — 한 장 분실해도 vault 살아남고, 1 장 도난 시 정보 0 노출.
  4. **알림 hook**: charter unwrap 시점 callback 노출 → 백엔드가 sync 알림 emit (페어링 디바이스 push).
- **포맷 선택 근거:**
  - EFF large wordlist (7776 단어, public domain). BIP-39 (cryptocurrency 색채) 와 차별화.
  - 6 단어 = 약 2^77.55 ≈ 220 sextillion 조합. brute-force 비현실적.
  - 4-digit verifier = SHA-256 첫 4byte mod 10000. 한 단어 typo 시 99.99% 확률로 즉시 감지 — 1Password 의 base32 는 이게 안 됨.
- **분할 선택 근거:**
  - sharks crate (GF(2⁸) byte-wise SSS, 정보 이론적 보안).
  - 단일 mode 와 별개로 user 가 옵션 선택 (일반 사용자 = 단일, 가족/유산 시나리오 = 분할).
  - 각 share = 7 단어 (index 1B + secret 10B = 88bit). 단일 charter 의 6 단어와 한 단어 차이만.
- **영향:**
  - secretbank-charter crate 신설 (sharks + EFF wordlist 의존성).
  - vault 파일 포맷에 charter envelope 슬롯 추가.
  - 발급 UI 에 "단일 / Shamir 2-of-3" 토글 추가 (M23-C).

## 2026-04-30 — 출시 도메인: secretbank.app (사용자 보유)

- **결정:** 출시 도메인은 사용자가 이미 보유한 `secretbank.app` 사용.
- **이유:**
  - `Secretbank.dev` 는 다른 컨셉의 실 운영 사이트 (경쟁자 아님).
  - `Secretbank.app` 은 squatter (parking 페이지).
  - `secretbank.app` 은 레포명과 정확히 일치 + Google `.app` TLD (HTTPS 강제) + 이미 보유.
- **영향:**
  - 랜딩 페이지(`site/`) 배포 타겟 확정.
  - GitHub Releases 가 binary 의 source of truth.
  - VS Code / JetBrains marketplace, Homebrew, winget, Flathub 등 다층 채널 모두 `secretbank.app` 으로 안내.

## 2026-05-01 — GitHub repo 경로: `phoodul/secretbank` (org 미운영)

- **결정:** 출시 GitHub repo 는 사용자 개인 계정 `phoodul/secretbank`. `secretbank` org 는 만들지 않음 (현재 1인 운영, org 비용/오버헤드 없음).
- **이유:**
  - org 만들어도 owner 1명 + repo 1개라 실질 차이 없음.
  - 출시 직전 명시적 owner 결정 필요 (release.yml / homebrew tap / winget manifest / 자동 업데이트 endpoint 등에 박힘).
  - 트랙션 잡히면 `secretbank` org 로 transfer 가능 (GitHub 의 transfer 는 redirect 자동 유지).
- **영향:**
  - 모든 `https://github.com/secretbank/secretbank/...` URL 을 `https://github.com/phoodul/secretbank/...` 로 일괄 정정 (21 파일).
  - Tauri updater endpoint, homebrew tap (`phoodul/homebrew-secretbank`), CLA bot, CI badge 등 모두 갱신.
  - **보존:** `docs/project-decisions.md:472` 의 historical "GitHub Organization 이름은 secretbank" 결정은 그대로 — 본 항목이 이를 갱신함을 기록.
  - **별도 식별자:** vscode-extension `publisher: secretbank`, winget `PackageIdentifier: secretbank.secretbank`, snap `name: secretbank`, homebrew cask `secretbank` 는 GitHub 와 무관한 채널별 ID 라 그대로 유지.

## 2026-05-03 — 출시 가격 정책 재고: 무료 베타 + 일반 비밀번호 기능 추가

- **결정:** 출시 시점에는 **모든 기능 무료** (Pro $2/월 즉시 도입 안 함). 무료 베타 기간은 다음 조건들 충족 시까지:
  1. **사용자 본인 dogfooding 완료** — 일주일 이상 실사용, 핵심 기능 (vault / graph / blast radius / supply chain / charter recovery) 사용법 숙지
  2. **법적 자문 완료** — 약관 / 개인정보 처리방침 / 결제 처리 (Stripe) 의 PG 사 약관 검토
  3. **일반 비밀번호 (general password) 기능 추가** — 현재는 API key 중심. 일반 사용자에게 매력적이려면 1Password 류 기본 비밀번호 vault 도 필요
  4. **첫 100~500 사용자 피드백 누적** — 어떤 기능이 진짜 paid 가치인지 검증
- **이유:**
  - 만든 사람도 사용법을 정확히 모르는 상태에서 돈 받기 어려움. 본인 검증 필요.
  - 법적 리스크 — 결제 받기 시작하면 소비자 보호법 / 환불 정책 / VAT / GDPR / 데이터 처리 등 법적 노출 증가. 변호사 검토 전 risky.
  - 무료 베타 → 사용자 피드백 + 본인 dogfooding 으로 진짜 paid 가치 발견. 처음부터 가격 박으면 사용자가 안 쓰고 떠남.
  - 일반 비밀번호 기능 미구현 상태에서 1Password 와 정면 비교 불리. 차별화 (graph / supply chain / charter) 는 보너스 — 기본 vault 가 우선.
- **영향:**
  - **landing page**: "Pro $2 / 년 $15" 카드 제거 또는 "Coming soon" 표시. Free 만 강조. "All features free during beta" 메시지.
  - **README / CHANGELOG**: 가격 표기 점진 갱신 (당장은 landing 만, 나머지는 다음 release 때).
  - **project_vision.md (memory)**: "월 $2 / 년 $15 글로벌 SaaS" 비전은 유지 (장기 목표). 단, 무료 베타 단계 명시.
  - **새 마일스톤 후보**: M24 (또는 M16 재정의) — 일반 비밀번호 기능. 1Password 류 web/app 비밀번호 저장 + autofill + 브라우저 확장.
- **검토 시점:** 위 조건 4개 충족 시 가격 정책 재결정. 그때까지는 베타 = 무료.

## 2026-05-03 (오후) — GitHub Cowork (Claude AI 협업) 인프라 도입

- **결정:** autoevolvingapp 도구가 추가한 GitHub Cowork (Claude AI 자동 PR 리뷰 + @claude 멘션 + desktop 도메인 게이트) 인프라 채택. Anthropic 의 `claude-code-action@v1` 기반.
- **이유:**
  - 1인 maintainer + 외부 PR 시작 시점 — Claude AI 리뷰가 보조 reviewer 역할 (auto approve/block 없음, 코멘트만)
  - desktop 특화 게이트 (Tauri v2 IPC + capability) — 사용자가 실수로 capability 과대 권한 부여 시 잡아줌
  - 보안 review 별도 워크플로우 — public OSS 의 보안 hygiene
  - Fork PR 은 `safe-to-review` 라벨로 메인테이너 검증 후 트리거 (악성 코드 방지)
- **영향:**
  - 새 워크플로우 4개 + CODEOWNERS + CONTRIBUTING.md (commits a033da3, 112c916, 7d94f98, 71e8a4e)
  - 사용자 액션 필요 — `CLAUDE_CODE_OAUTH_TOKEN`, `ANTHROPIC_API_KEY` secrets + branch protection rule + `claude-review` / `safe-to-review` 라벨 생성
  - branch protection 의 Required status checks: Rust / Frontend / E2E smoke / EE Relay 4개 (CONTRIBUTING.md 가 강제)
  - AI 리뷰는 인간 reviewer 대체가 아닌 보조 — 자동 approve/block 금지 (claude-pr-review.yml prompt 에 명시)
- **비용**: 동일 repo PR 만 트리거되도록 라벨 정책으로 제한 — Anthropic API 비용 폭증 방지.
