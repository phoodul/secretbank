# Workflow Progress

## Last Checkpoint

- **Time:** 2026-04-25 (**세션 종료 — M3 검증 완료 + Y 경로 마무리, T056 직전**).
- **Phase:** Phase 3 — Implementation, **M4 Incident Feed 🔄 7/10 완료**. M3 수동 검증 및 follow-up 3건 전부 처리됨.
- **Commits:** 87개 누적. 이번 세션 신규 4개:
  - `85f347a` fix(app): 피드 스케줄러 spawn 을 tokio context 안으로 이동 (M3 검증 중 발견한 기동 panic hotfix)
  - `7d5f3f3` feat(graph): 노드 드래그 위치 영속화 + Reset layout 버튼 (C 옵션, +15 테스트)
  - `2708a6d` docs: M3 수동 검증 결과 + 2 hotfix/feature 커밋 기록
  - (+ 이번 세션 종료 시점에 프로젝트 의사결정 기록 추가 예정)
- **Tests:** Rust 188+개 유지 / Vitest **236개** (221 + 15 신규). 전부 통과. `pnpm typecheck` pre-existing 5 에러 지속 (GraphPage.test.tsx — 신규 에러 없음).
- **Blocker:** 없음.
- **Mode:** 세션 종료. 재개 시 일반 모드.
- **Next (재개 시):**
  1. **T056 Incidents 페이지 UI 진입** — 사전 탐색 완료:
     - 기존 `/incidents` 라우트는 `src/pages/IncidentsPage.tsx` placeholder (제목 + "empty" 메시지만).
     - Rust 측 4 Tauri 커맨드는 T055 (a1605e0) 에서 이미 완성: `incident_list(filter?)`, `incident_dismiss(id)`, `incident_matches_for_credential(cred_id)`, `incident_feed_refresh()`.
     - 도메인 모델 위치: `api-vault-core::{Incident, IncidentFilter, IncidentSeverity, IncidentSource, IncidentMatch, MatchReason}`.
     - `incidents:updated` 이벤트: **아직 Rust 측에서 emit 하지 않음** (T054 스케줄러가 emit 하도록 확장 필요 — T056 구현 시 병행).
  2. 구현 파일 (DoD):
     - `src/features/incidents/IncidentsPage.tsx` — 필터 탭 (All / Critical / Affecting my keys / Dismissed) + IncidentCard 리스트 + 빈/로딩/에러 상태
     - `src/features/incidents/IncidentCard.tsx` — severity bar + source 배지 + 영향 credential 칩 + View/Dismiss
     - `src/features/incidents/use-incidents.ts` — `invoke('incident_list')` + `listen('incidents:updated')`
     - `src/pages/IncidentsPage.tsx` → `@/features/incidents/IncidentsPage` re-export
     - 4 locales `incidents.*` i18n 키
     - Vitest — 10 mock incident 렌더 + 필터 동작
  3. 이후: T057 Credential Detail Incidents 섹션, T058 NVD API key Settings (Should).

## M3 수동 검증 결과 (2026-04-24 저녁)

| # | 항목 | 결과 |
|:--|:----|:----|
| ① | `/graph` 렌더 + 4 노드 색 | ✅ Issuer/Credential/Deployment 확인. Project 는 프로젝트 생성 전이라 육안 검증 defer. |
| ② | TB ↔ LR 방향 토글 + 핸들 회전 | ✅ 모두 정상 |
| ③ | Blast Radius (빨강 실선 + 주황 점선 + Esc 복원 + 비-Credential 무시) | ✅ 전부 통과. "주황 점선이 실선처럼 보인다" 는 시각 오해 (안쪽 카드 border + 바깥쪽 outline 2줄 겹침). 점선 자체는 정상 동작. |
| ④ | Settings "Allow dragging" 토글 | ✅ localStorage `apivault:graph:nodesDraggable` 영속 + 동작 반영 확인. |
| ⑤ | 모바일 MobileGraphList 분기 | 🕒 **M11 defer**. `useIsMobile` 이 OS 기반이라 Windows 에서 viewport 조작으로는 트리거 불가. Vitest 자동 테스트로는 커버됨. |

## 수동 검증 중 발견/처리한 이슈

### 1. 피드 스케줄러 기동 panic (🔥 hotfix)

**증상:** 앱 기동 시 `panic: there is no reactor running, must be called from the context of a Tokio 1.x runtime` — `feed_scheduler.rs:172` `JoinSet::spawn`.

**원인:** `tauri::Builder::setup` 콜백은 tokio 런타임 context 바깥에서 실행됨. `spawn_feed_scheduler` 가 동기적으로 `JoinSet::spawn` 을 호출할 때 tokio 핸들을 요구해서 panic.

**수정:** `spawn_feed_scheduler` 호출을 기존 `block_on(AppContext::new(...))` 패턴과 동일하게 `tauri::async_runtime::block_on` 안으로 이동. 커밋 `85f347a`.

**재발 방지 교훈:** Tauri `setup` 안에서 tokio 런타임 핸들을 요구하는 모든 동기 호출(`tokio::spawn`, `JoinSet::spawn`, `Handle::current`)은 반드시 `block_on(async {...})` 안에서 실행해야 함. 향후 다른 service 를 `setup` 에 추가할 때 같은 패턴 적용.

### 2. default direction 이 LR 로 보였다는 관찰 → 시각 해석 차이로 close

- 코드는 `useState<LayoutDirection>('TB')` 로 TB 시작 확정. 버튼 텍스트도 "Top to bottom" 으로 TB 일치.
- 사용자가 처음 "좌→우" 로 느꼈던 건 issuer 10종이 최상단 rank 에 옆으로 쭉 펼쳐져서 wide-and-short 로 보였기 때문. 실제 flow 는 TB.

### 3. 드래그 위치 영속화 승격 (C 옵션 구현, 커밋 `7d5f3f3`)

**배경:** 사용자가 "드래그해도 위치 저장 안 되면 드래그 기능의 목적이 없다" 고 정당하게 지적. 원래 스펙은 B(세션 내) 또는 A(no-op) 였으나 C(영구) 로 승격.

**구현:**
- `src/features/graph/use-graph-node-positions.ts` — localStorage key `apivault:graph:nodePositions`, `{nodeId: {x,y}}` 맵. `setPosition` / `clear` / `pruneStale` API. 손상된 JSON / 타입 불일치 방어.
- `adapter.toReactFlowElements(payload, direction, savedPositions?)` — 3번째 파라미터 추가. dagre 결과 위에 savedPositions 덮어씌움. 없는 노드는 dagre 기본 유지.
- `DependencyGraph` — `onNodeDragStop` 으로 position 저장, payload 변경 시 `pruneStale(currentIds)`, `hasSavedPositions && <Reset Layout>` 버튼 조건부 렌더.
- 4 locales 에 `graph.resetLayout` 키 (`Reset layout` / `레이아웃 초기화` / `レイアウトをリセット` / `重置布局`).
- Vitest 15 신규 (use-graph-node-positions 11 + adapter savedPositions 4).

**남은 검증:** 사용자가 live app 에서 (1) 노드 드래그 → 다른 페이지 이동 → /graph 복귀 시 위치 유지 (2) 앱 재시작 후 위치 유지 (3) "Reset layout" 버튼 클릭 시 auto-layout 복귀 수동 확인.

## M3 수동 검증 Queue 처리 현황

| # | 이슈 | 상태 |
|:--|:----|:-----|
| 1 | default direction LR 로 보임 | ✅ Close (시각 해석 차이, 코드 정상) |
| 2 | Project 초록색 노드 육안 확인 | 🕒 Defer (프로젝트 1개 생성 후 확인 가능, 기능 동작엔 영향 없음) |
| 3 | 노드 드래그 위치 영속화 UX | ✅ C 옵션 구현 완료 (커밋 `7d5f3f3`) |

## Project Vision 메모 저장 (2026-04-24)

사용자 비전 확정: **MVP 이상의 탁월함 지향, 월 $2 / 년 $15 글로벌 SaaS**. "필요 최소한 구현" 타협 금지. 경쟁 제품을 능가하는 완성도 목표. `~/.claude/projects/.../memory/project_vision.md` 에 저장.

## T055 구현 교훈 (M4 후속 영향)

- **`IncidentFilter` SQL bind 패턴**: `Option<&str>` bind 시 sqlx 가 NULL 로 내보냄. SQL 은 `?1 IS NULL OR col = ?1` 패턴으로 각 필터 축이 None 이면 자동 skip. Rust 측 enum → `&'static str` 변환은 기존 `source_to_str`/`severity_to_str` 헬퍼 재사용.
- **Incident dismiss 는 match-level 로**: incident 테이블에 `dismissed_at` 컬럼 추가 대신 `incident_match.dismissed_at` 여러 row 를 batch update. 단일 사용자 desktop app 에서는 "모든 매치 dismiss = 사용자 관점 dismiss" 동일. 다중 사용자 (서버 sync) 확장 시 incident-level dismiss 별도 설계 필요.
- **"모든 match 가 dismissed 인 incident 제외" SQL**: `GROUP BY incident_id HAVING SUM(CASE WHEN dismissed_at IS NULL THEN 0 ELSE 1 END) = COUNT(*)` 서브쿼리 + `id NOT IN`. match 없는 incident 는 서브쿼리에 아예 포함 안 되므로 자연스럽게 list 에 포함 (global feed 목록 유지).
- **`FeedSchedulerHandle` 에 pool + config 저장 = trigger_once 재사용**: 기존 `spawn_feed_scheduler` 가 config 를 `move` 로 소비 → Clone derive 추가 후 복제본 보관. `poll_rss_once` / `poll_nvd_once` / `poll_ghsa_once` 는 이미 private file-local 이라 pub 전환 없이 handle 안에서 직접 호출.
- **Tauri command unit test 전략**: `State` 주입 의존으로 커맨드 함수 직접 테스트는 어려움. 대신 **에러 변환 + serde tag 형식** 만 커버 (3 tests). 실제 커맨드 동작은 T056 vitest + mock invoke 에서 e2e 검증.
- **storage crate 확장 동반**: T053~T054 때 "storage 수정 금지" 스코프였지만 T055 는 UI-facing 커맨드라 repo 확장 불가피. 순환 의존 없음 확인 (core → storage → app + feeds).
- **`Option<IncidentFilter>` 커맨드 파라미터**: 프런트가 filter 생략 시 `undefined` 로 보내도 `filter.unwrap_or_default()` 로 허용. default = 모든 축 None + `include_dismissed: false`.
- **T058 API key UI 연계 필요**: 현재 `FeedSchedulerConfig::default()` 의 `nvd_api_key`/`ghsa_token` 모두 None 이라 trigger_once 도 RSS 만 실행. T058 에서 settings 테이블에 key 저장 + `spawn_feed_scheduler` 재호출 (또는 handle.reconfigure) 패턴 필요. 현재는 Pending.

## T054 구현 교훈 (M4 후속 영향)

- **`CancellationToken` + `JoinSet::join_next()` 가 `JoinHandle::abort()` 보다 강건**: `abort()` 는 강제 중단으로 async drop 보장 없음. `CancellationToken` 은 태스크가 `tokio::select! { _ = cancel.cancelled() => break, ... }` 로 정상 종료 경로를 타게 함 → resource cleanup 보장. T023 clipboard 도 향후 이 패턴으로 전환 고려.
- **`MissedTickBehavior::Delay` 필수**: `tokio::time::interval` 기본 `Burst` 모드는 interval 작업이 길어지면 밀린 tick 이 한꺼번에 발화 — 실제 HTTP poll 에선 폭주. `Delay` 로 "이전 tick 끝난 후 새 interval 시작" 동작.
- **`IssuerRepo::new(&SqlitePool)` lifetime 참조**: storage 크레이트 repo 는 `&'a SqlitePool` 받음. `Arc<SqlitePool>` 에서 `&*pool` 로 deref 해서 전달. 스케줄러가 `Arc<SqlitePool>` 을 보관하고 호출 시점에 임시 `&` 재획득.
- **`source_id` UNIQUE 제약 미적용 → Err skip 방어**: `incident` 테이블에 `(source, source_id)` UNIQUE 없어 재폴링 시 중복 INSERT 에러 발생. `tracing::debug!` 후 skip 으로 처리. **Pending**: storage migration 으로 UNIQUE 추가 + `INSERT OR IGNORE` 전환 필요.
- **`Tauri on_window_event(Destroyed)` 타이밍 주의**: 마지막 윈도우 destroy 시점에 `spawn(async shutdown)` 비동기라 프로세스가 즉시 종료되면 cancel 이 전파되지 않을 수 있음. production 안정성은 `RunEvent::Exit` 전환 시 개선 — **Pending**.
- **스케줄러 integration 테스트 (fake clock) 생략**: `poll_rss_once` 가 DB + HTTP 의존성 있어 `tokio::time::pause()` + `advance()` 로 ticker trigger 검증하려면 mock pool + wiremock 복잡 조합 필요. 현재는 Breaker 단위 + normalize 단위 + spawn/shutdown 라운드트립까지만 커버. 전체 파이프라인은 T056/T057 UI 연동 시 e2e 테스트로 커버 예정.
- **`FeedSchedulerConfig` key-gate 설계**: `nvd_api_key: Option<String>`, `ghsa_token: Option<String>` 이 None 이면 해당 폴러 spawn 생략. 현재 `FeedSchedulerConfig::default()` = 전부 None → RSS 만 활성. T055 에서 Tauri 커맨드가 settings 조회로 채워 `spawn_feed_scheduler` 재구성 기능 추가 예정. T058 에서 NVD API key Settings UI.

## Pending Decisions (갱신)

- Gate 3 (배포 진행 승인)
- Gate 4 (git push 승인)
- **`pnpm typecheck` 5 에러 (pre-existing)** — GraphPage.test.tsx vi.fn generic 타입. M4 마무리 시 또는 별도 hotfix 커밋.
- **Storage migration 0002 — `incident (source, source_id)` UNIQUE** (T054 교훈). T056 이전 또는 T056 과 함께 처리.
- **Tauri shutdown `RunEvent::Exit` 전환** (T054 교훈). production 배포 전 (M13) 처리.

## T053 구현 교훈 (M4 후속 영향)

- **`IncidentMatch` 에 `confidence` 필드 없음**: api-vault-core 도메인 모델은 confidence 미보관. DoD 의 "confidence score < 0.3 제외" 는 매칭 엔진 **내부 상수** (`CONFIDENCE_THRESHOLD=0.3`, `CONFIDENCE_ISSUER_MATCH=1.0`, `CONFIDENCE_KEYWORD=0.6`) 로만 구현. 추후 UI 에 confidence 표시가 필요하면 api-vault-core 스키마 변경 + 0002 migration 필요 — 현재는 미결정.
- **`slug.len() >= 3` false positive 방지**: 짧은 slug (e.g. "ai") 가 무관한 텍스트에 빈발해 오매칭 유발. display_name 매칭은 길이 제한 없음 (display_name 자체가 유의미한 토큰).
- **대소문자 무시 단순 substring**: regex/word-boundary 의존 없이 `haystack.to_lowercase().contains(&needle.to_lowercase())`. UTF-8 byte slice 경계 존중하므로 한글 safe. 워드 바운더리가 필요해지면 `regex` workspace dep 추가 후 교체.
- **결정론적 정렬**: `HashMap` iteration 비결정 → `sort_by_key((reason discriminant, credential_id ULID string))` 로 픽스. 테스트 + UI 리스트 순서 안정화.
- **`api-vault-core` path dep 추가**: `api-vault-feeds` 가 이제 core 를 의존. 단방향 (core → feeds 없음). resolver="2" 기본 동작으로 즉시 컴파일. 향후 T054 `feed_scheduler` 가 api-vault-storage 도 추가로 의존 예정.
- **순수 함수 = 비동기 아님**: matcher 는 `#[test]` 동기 함수. tokio 불필요. 50ms 대기 없이 즉시 검증 가능 — TDD 루프 빠름.
- **slug 불일치 (RSS "gcp" vs Issuer "google") 는 T053 범위 외**: 현재 T053 은 `incident.issuer_id` 가 이미 올바르게 설정돼 있다고 가정하고 매칭만 수행. T054 스케줄러가 RSS entry 를 Incident 로 변환할 때 `canonical_source_slug("gcp") → "google"` 같은 매핑 헬퍼로 issuer_id 해결 필요.
- **T054 설계 미리보기 (DoD 해석)**:
  - feed 별 polling interval (NVD 2h, GHSA 24h, RSS 5min) — HIBP 는 on-demand 만 (스케줄러 대상 아님, T053 매칭은 지원).
  - Circuit Breaker 연속 3회 실패 → 1h backoff. `governor` 의 건강성 체크와 별개의 간단 카운터로 구현 권장.
  - 앱 시작 시 `tauri::Builder::setup` 에서 `tokio::spawn(scheduler_loop)` + shutdown 시 AbortHandle.
  - 4 DTO → Incident 정규화는 스케줄러의 `normalize_*` 함수 4개로 분리 (match_incident 전 준비).
  - `IncidentRepo.insert` + `matcher::match_incident(...)` + `IncidentRepo.insert_match(...)` 파이프라인.

## T052 구현 교훈 (M4 후속 영향)

- **HIBP 404 = "breach 없음" 정상**: 다른 feed 클라이언트(T049/T050)와 달리 404 를 에러로 처리하면 안 됨. `Ok(Vec::new())` 로 변환. T053 매칭 엔진은 "안전한 이메일" 조회 응답을 같은 경로로 처리 가능.
- **Email URL 인코딩은 수동**: path segment 는 reqwest `.query()` 가 자동 처리하지 않음. `urlencoding::encode(email)` 로 `+ → %2B`, `@ → %40` 수동 변환 후 `format!("{}/breachedaccount/{}", base, encoded)`. workspace 에 `urlencoding = "2"` 신규 추가.
- **Rate limit 전략**: Core 1 티어 10 RPM 을 최소 공통분모로 하드코딩. 상위 티어 API key 도 보수적으로 이 제한에 묶임. 티어 분기가 필요해지면 `HibpClient::new_with_rate(api_key, rpm)` 추가 예정.
- **PascalCase serde**: 전 필드 대문자 시작. `#[serde(rename_all = "PascalCase")]` 를 struct 레벨 1회 선언으로 21개 필드 매핑 완성.
- **`BreachDate` 는 `String` 유지**: `"2013-10-04"` 날짜-only 포맷. `OffsetDateTime` 으로 바꾸면 시간 00:00:00Z 채워져 의미 왜곡. `String` 으로 두고 UI/DB 레이어에서 `time::Date::parse` 로 해석.
- **Defensive `Option` 확장**: 리서치에서 non-nullable 로 표기된 `LogoPath`/`IsStealerLog` 도 Optional 로 선언. HIBP 는 과거에도 필드를 사후 추가한 이력이 있어 구버전 breach 레코드에 누락 가능.
- **User-Agent + hibp-api-key 둘 다 필수**: UA 누락 → 403, api-key 누락 → 401. reqwest Client builder 에서 UA 전역 설정 + 매 요청 hibp-api-key 헤더 부착.
- **429 `retry-after` 헤더 대기초 정수**: T049 NVD, T050 GHSA 와 동일한 재시도 힌트 포맷 (초 정수). `HibpError::RateLimited { retry_after: Duration }` 공통 패턴 유지.

## T051 구현 교훈 (M4 후속 영향)

- **chrono ↔ time 변환 헬퍼 필수**: feed-rs 2.x 는 `chrono::DateTime<Utc>` 를 public API 로 노출. 프로젝트 표준은 `time::OffsetDateTime`. unix timestamp (초 + nanoseconds) 경유 변환 헬퍼 `chrono_to_time(dt) -> Option<OffsetDateTime>` 로 나노초 정밀도까지 보존. workspace deps 에 `chrono = { default-features = false, features = ["std"] }` 추가 필요.
- **`ParseFeedError` `Send + Sync + Error`**: feed-rs 에러는 thiserror `#[from]` 직접 사용 가능. String 변환 불필요 → 에러 체인 보존.
- **실 URL 정정 10건 중 3건**: Anthropic `status.anthropic.com` → `status.claude.com` (302), Stripe `status.stripe.com/history.rss` 404 → `www.stripestatus.com/history.rss`, Paddle `status.paddle.com` → `paddlestatus.com` (301). **status.<brand>.com 관행 의존 금지** — 새 공급자 추가 시 매번 실 접속 확인.
- **GCP Atom-only / AWS RSS-only**: 공급자별 포맷 차이 존재. `FeedFormat::Rss | Atom` enum 으로 정보 기록 (feed-rs 는 자동 감지하므로 동작엔 불필요, 문서용).
- **동시성 제어는 Semaphore(4) + join_all**: 10개 소스 동시 GET 은 저희 머신/상대 서버 모두 과도. `tokio::sync::Semaphore::new(4)` + `futures::future::join_all` 로 한 번에 최대 4개만 실행. governor 는 각 소스당 호출 빈도가 낮아 불필요.
- **실패는 swallow 후 warn**: `fetch_all` 은 10개 중 1-2 소스 실패해도 나머지를 반환. `tracing::warn!(slug, url, error)` 만 남기고 엔트리는 비워 계속 진행. T053 매칭 엔진이 부분 데이터로 동작 가능하게 유지. 에러 디테일은 `fetch_one` 로 단일 호출 시에만 반환.
- **fixture 전략**: 실 공급자 응답 캡처는 변동성 크므로 **표준 RSS 2.0/Atom 1.0 최소 샘플** 10개를 수동 작성 (슬러그만 다르게, 2 entry씩, 각 < 2KB). 테스트는 파싱 성공 + entry 수 + 필드 매핑만 검증. 실제 공급자 응답 호환성은 통합 테스트 아닌 프로덕션 모니터링으로.
- **`reqwest::Client::clone()` 는 커넥션 풀 공유**: 내부에 `Arc` 가 있어 각 async task 에 `http.clone()` 전달 가능. 10 concurrent 호출 시 커넥션 reuse.
- **Atom `<published>` 선택적**: GCP 처럼 일부 entry 는 `published` 없이 `updated` 만. `Entry.published` 도 `Option<chrono::DateTime>` — 매핑에서 둘 다 `Option<OffsetDateTime>` 로 유지.

## T050 구현 교훈 (M4 후속 영향)

- **GHSA 페이지네이션은 커서 기반 + Link 헤더 full URL 재사용**: 과거 GitHub REST 는 `?page=N` 숫자였지만 `/advisories` 는 `after=<base64>` 불투명 커서. 직접 커서 값을 파싱·재구성하지 말고 **Link 헤더의 next URL 을 그대로 다음 요청에 사용**하는 게 공식 권장 방식. 구현은 로컬 `parse_next_link` 헬퍼로 단위 테스트 3건 별도 커버.
- **`modified` 파라미터 GitHub search 구문**: `?modified=>2026-01-01T00:00:00Z` 형태. `>` 가 reqwest `.query()` 에 의해 percent-encode 자동 처리. `sort=updated&direction=asc` 고정으로 증분 안정성 확보.
- **`references` 스키마 모호성 방어**: research 문서는 `Vec<String>` 이라 하지만 실제 응답이 `[{url: String}]` 로 바뀔 여지가 있어, `serde_json::Value` 로 받아 양쪽을 모두 처리하는 deserializer 를 둠. API 스키마 변경 시 무음 적응.
- **`cvss` 필드 제거(2025-04-01)**: 현재 스키마는 `cvss_severities: { cvss_v3, cvss_v4 }`. 모든 필드 Optional. `cvss_v3_score: Option<f32>`, `cvss_v3_vector: Option<String>` 형태로 DTO 평탄화.
- **`cwes` 배열 구조**: `[{cwe_id, name}]` — 단순 문자열 배열 아님. `cwe_ids: Vec<String>` 으로 평탄화하면서 `cwe_id` 필드만 추출.
- **User-Agent 필수**: GitHub API 는 UA 없으면 403. `reqwest::Client::builder().user_agent("api-vault/0.1.0").build()` 로 클라이언트 수준 설정. 각 요청에서 따로 붙일 필요 없음.
- **Bearer 토큰 + API Version 헤더**: `Authorization: Bearer <token>` + `Accept: application/vnd.github+json` + `X-GitHub-Api-Version: 2022-11-28`. 2026-03-10 버전도 있으나 현재 필요한 추가 필드 없어 보수적으로 2022-11-28 유지.
- **Rate limiter 단위**: PAT 5000/h → `Quota::with_period(720ms).allow_burst(10)` (NvdClient 의 `with_period` 스타일과 일관). `Quota::per_hour(5000)` 도 가능하지만 NvdClient 와 패턴 통일.
- **wiremock 2-페이지 체인**: 첫 mock 이 `{mock_server.uri()}/page2` 를 Link 헤더에 넣고, 두 번째 mock 이 `path("/page2")` 를 매칭. `query_param_is_missing` 보다 path 분기가 결정론적.

## T049 구현 교훈 (M4 후속 영향)

- **wiremock path 매칭**: `MockServer::start().await` 의 `mock_server.uri()` 는 `http://127.0.0.1:{port}` root URI. base_url 로 그대로 쓰면 HTTP 경로가 `/` 가 되어 `path("/")` 매칭 필수. `path("")` 실패.
- **serde camelCase + 미사용 필드 `_` prefix 함정**: `#[serde(rename_all = "camelCase")]` 적용 시 필드명 앞 `_` 를 붙이면 `_resultsPerPage` 로 변환을 시도해 deserialize 실패. 해결: 안 쓰는 필드는 구조체에서 **완전 제거** (serde(default) 덕에 JSON 키 있어도 무시).
- **NVD timestamp 파싱**: NVD 응답 `2026-04-01T12:00:00.000` 은 오프셋 없음. `OffsetDateTime::parse` 직접 실패 → `PrimitiveDateTime::parse` 후 `.assume_utc()` 가 정석. 밀리초 없는 포맷 fallback 도 추가.
- **governor burst 초기화 동작**: `Quota::with_period(6s).allow_burst(5)` 는 초기 토큰이 `burst=5` 미리 채워진 상태로 시작 → 첫 5 요청은 즉시 통과. 2페이지 페이지네이션 테스트 실시간 대기 없이 통과.
- **task.md DoD 수치 정정됨**: task.md 원문의 "50/100 req/30s" 는 구 정보. 2026 공식값 **5/50 req/30s** 로 정정. NVD API 정책은 2026-04-15 breaking change (`cvssMetricV31` Optional, `vulnStatus: "Not Scheduled"` 추가) 도 반영 — `base_severity: Option<String>` / `base_score: Option<f32>`.
- **NvdClient 는 struct + method 시그니처**: DoD 의 free function `fetch_incremental(since, api_key)` 는 rate limiter 재생성 문제로 폐기. `NvdClient::new(api_key)` 에서 limiter 를 한 번 만들고 재사용하는 구조가 필수. T050/T052 도 동일 패턴 (`GhsaClient`, `HibpClient`) 권장.
- **120일 상한 pre-check**: NVD API 가 120일 초과 범위에 에러 반환. `fetch_incremental` 는 HTTP 호출 전 `(now - since).whole_days() > 120` 체크 후 `NvdError::RangeTooLarge { days }` 즉시 반환 — 네트워크 왕복 낭비 방지.

## M2 진행 상황 (16/16 ✅ 완료)

### 완료 ✅

- T025 Inventory 페이지 목록 뷰 + 필터 바 (커밋 `ab69319`)
- T028 Issuer 프리셋 10종 시드 + issuer_list/get 커맨드 (커밋 `539347f`)
- T026 Credential 등록 다이얼로그 (커밋 `a7e1d58`)
- T027 Credential 상세 Drawer (Sheet + 클립보드 30s + 삭제, 커밋 `4cbf8c0`)
- T029 Cmd+K Command Palette (10 actions, localStorage recent, 커밋 `67dd892`)
- T030 Settings 페이지 + settings_get/set + auto_lock_minutes 저장 (커밋 `96337a5`)
- T031 Auto-lock idle 타이머 (use-idle-lock + AutoLockGuard, 커밋 `34e8a90`)
- T032 드롭 존 + /onboarding/scan placeholder (Tauri v2 onDragDropEvent, 커밋 `6f121ee`)
- T033 env_scanner (엔트로피 3.5 + issuer regex 10 + .env/generic 파서, 커밋 `8e7c7a2`)
- T034 env_scan_folder Tauri 커맨드 (spawn_blocking + scan:progress 이벤트, 커밋 `eeab911`)
- T035 드롭&스캔 결과 검토 UI + project/usage Tauri 커맨드 (A안 풀 스코프, 커밋 `6f31d56`)
- **i18n follow-up** 중국어(zh-간체) 로케일 추가 + Settings 언어 셀렉터 확장 (커밋 `1168210`)
- **T036** Welcome 3단계 온보딩 + RequireOnboarding 가드 + `onboarding.done` 플래그 (커밋 `e22c452`)
- **T037** Project CRUD 페이지 + 연결된 credential 뷰 + project_update/delete + usage_list_for_project (커밋 `bf67527`)
- **T038** Deployment CRUD (ProjectDetail 내부 섹션) + DeploymentPatch + deployment_* 커맨드 4개 (커밋 `3072909`)
- **T039** Usage 링크 UI (Credential ↔ Project 수동 연결) + usage_delete 커맨드 + 프론트 Usage 타입 Rust 일치 정정 (커밋 `cff6bf8`)
- **T040** Inventory 보안 점수 + SecurityDot (3단계 safe/warn/danger + 7 factor) + Rust security_score 유닛 테스트 9 + score 를 CredentialSummary/CredentialFull 응답에 주입 (커밋 `11281cd`)

### 진행 순서 결정 (2026-04-23, 수정)

사용자 방침: **CRUD UI 핵심부터, 드롭&스캔 블록(T032~T035)은 M2 후반으로.** T026 이 Issuer combobox 에 프리셋을 쓰므로 T028 을 T026 앞으로 당김.

- 1순위: T025 ✅ → **T028 ✅** → **T026 ✅** → **T027 ✅** (1순위 블록 완주)
- 2순위: **T029 ✅** → **T030 ✅** → **T031 ✅** (2순위 블록 완주)
- 3순위(드롭&스캔): **T032 ✅** → **T033 ✅** → **T034 ✅** → **T035 ✅** (3순위 블록 완주)
- 마무리: T036 온보딩 / T037 Project / T038 Deployment / T039 Usage / T040 보안 점수

### T025 구현 교훈 (M2 후속에 영향)

- **React 19 대응 eslint-plugin-react-hooks `set-state-in-effect` 규칙 활성화됨**. `useEffect` 안에서 동기 `setState` 호출 시 warn. 해결책: 단일 상태 객체를 union (`{phase:"loading"} | {phase:"ok", data} | {phase:"error", message}`) 로 묶어 관리. `use-inventory.ts` 패턴 참고.
- **Radix Select jsdom 호환성**: `hasPointerCapture`/`setPointerCapture`/`releasePointerCapture`/`scrollIntoView` 폴리필을 `src/test-setup.ts` 에 추가해야 Vitest 에서 Select 가 열림. T026 Dialog/DropdownMenu 테스트에서도 이미 적용돼 있어 재사용 가능.
- **Radix Select 접근성**: SelectTrigger 에 `aria-label` 명시해야 `getByRole("combobox", {name})` 로 찾힘. 선택된 값 텍스트만으로는 accessible name 이 되지 않음.
- **Issuer 이름 표시는 임시로 `issuer_id.slice(0,8)` 축약형**. T028 프리셋 라이브러리가 준비되면 전면 교체 — `CredentialCard` 의 `IssuerBadge` 부분에 TODO 있음.
- **`CredentialSummary` 에 `last_rotated_at` 없음** (서버 응답 누락). 카드에 라벨만 두고 값 `"—"` 로 표시. 추후 서버 DTO 확장 시 채움.

## M1 완료 (12/12)

### 완료 ✅

- T013 SQLite 초기 스키마 + 마이그레이션 (커밋 `df43b55`)
- T014 VaultStorage trait 정의 (커밋 `09b1079`)
- T015 MockVaultStorage + contract tests (커밋 `09b1079`)
- T016 AgeVaultStorage (age 0.11 + 옵션 α, 커밋 `c8b2c1e`)
- T017 KDF (Argon2id + HKDF, 커밋 `2ac1674`)
- T018 OS Keyring 래퍼 (커밋 `2ac1674`)
- T019 SQLite 레포지터리 9개 (커밋 `57959f7`)
- T020 도메인 모델 31 struct + 12 enum + 9 ULID id (커밋 `57959f7`)
- T021 Vault Tauri 커맨드 (init/unlock/lock/status, 커밋 `9d6841c`)
- T022 Credential Tauri 커맨드 (CRUD + reveal, 커밋 `9d6841c`)
- T024 Lock Screen + Create Vault Dialog (zxcvbn 강도 미터, 커밋 `7946476`)
- T023 클립보드 자동 만료 30초 (취소 토큰 + countdown 이벤트, 커밋 `71d37bc`)

### 부수 수정

- `fix(tauri): tauri-plugins feature 에 updater/biometric dep 추가` (커밋 `42b7769`) — 재부팅 후 풀 빌드에서 드러난 E0433 해결
- `chore(docs): prettier 포맷 일괄 적용` (커밋 `781d547`) — 코드 펜스 주변 공백 정리
- `fix(tauri): generate_context! 를 root crate 로 이동` (커밋 `eaece03`) — **플러그인 ACL 구조 문제 해결** (workspace 에서 tauri-build 는 root 에서 실행되어 gen/schemas 를 root OUT_DIR 에 emit 하는데, generate_context! 를 subcrate 에서 호출하면 매니페스트를 찾지 못해 모든 플러그인 IPC 가 `Plugin not found` 로 차단됨. 커스텀 커맨드는 core:default 로 우회되어 이전까지 드러나지 않았음.)
- `chore(dev): M1 수동 검증용 DevTools IPC 보조 설정` (커밋 `987b857`) — `withGlobalTauri`, `window.__dev = {invoke, listen, Database}`, `sql:allow-execute` 추가

### M1 수동 통합 검증 결과 (2026-04-22)

**시나리오 전 흐름 통과:**

1. CreateVault: zxcvbn 강도 미터 표시 → 12자 이상 강한 비번 → `vault.age` + `vault.db` 파일 생성 확인
2. Lock/Unlock: 3회 연속 오답 → 10초 쿨다운 카운트다운 표시, 쿨다운 해제 후 정상 언락
3. Credential CRUD: `credential_create` → SQLite 메타 + age 볼트 값 분리 저장 → `credential_list` 메타만 반환 (`value` 필드 없음) → `credential_reveal` 원본 plaintext 반환
4. Clipboard 30초 만료: `credential_copy_to_clipboard` → 시스템 클립보드에 즉시 복사 + `clipboard:countdown` 이벤트 30→0 로 1초마다 발생 → 30초 후 클립보드 비워짐 확인

**검증 중 발견한 설계 교훈:**

- `IssuerId` 는 `#[serde(transparent)]` 로 감싼 `ulid::Ulid` newtype 이라 Crockford Base32 (`I`, `L`, `O`, `U` 제외) 를 엄격 검증. SQLite TEXT 컬럼은 무검증이라 레이어 간 ULID validation 이 다름 → **프론트는 직접 ULID 문자열을 구성하지 말고 Tauri 커맨드가 서버에서 생성한 값을 전달받는 구조로 가야 함**.
- Tauri v2 `sql:default` 는 read-only (`allow-close + allow-load + allow-select`). INSERT/UPDATE 는 `sql:allow-execute` 명시 opt-in 필요.
- **M2 T026 `issuer_create` 커맨드 구현 시** 서버에서 `IssuerId::new()` 로 생성해 반환하는 패턴 유지 (이미 `IssuerInput` 에 id 필드 없음 — 올바른 설계).

## 다음 세션 Next Actions

1. **M1 통합 검증 (수동)** — `pnpm tauri dev` 로 실제 앱을 띄우고 CreateVault → Unlock → credential create → reveal → copy_to_clipboard (30초 자동 만료 확인) → lock 흐름 검증. 사용자 직접 테스트 권장.

2. **M2 Inventory UI + 드롭&스캔 진입 (T025~T040):**
   - T025 Inventory 페이지 목록 뷰
   - T026 Credential 등록 다이얼로그 (수동)
   - T027~T033 드롭&스캔 (파일시스템 스캐너, 엔트로피/정규식 기반 secret detection, UsageGraph 추출)
   - T034~T040 Inventory 편집/삭제/일괄 처리

## SAC/AppLocker/Defender 정책 기록

`docs/project-decisions.md` 의 "개발 환경 정책" 섹션 A/A-2/A-3 참조:

- A: Defender 실시간 보호 `target/` 예외 (적용됨)
- A-2: 개발자 PC SAC Off (**적용됨**)
- A-3: 배포 시 SignPath OSS Authenticode 서명 (M13 예정)

## Completed

- [x] Tauri v2 scaffold (commit 8f4c893)
- [x] `user_research/` 자료 검토 (initial_idea.md + ChatGPT/Gemini Deep Research)
- [x] ChatGPT vs Gemini Deep Research 플랫폼 관점 비교 분석 (사용자 요청)
- [x] 프로젝트 방향 대전환 — Q1~Q5 확정
  - Q1: 바이브 코더 페르소나 추가
  - Q2: 풀스택 (데스크톱 + 모바일 + 웹)
  - Q3: Freemium + $2/월 Pro
  - Q4: Open Core (AGPL-3.0 또는 MPL 2.0 검토)
  - Q5: 1인 개발 지속
- [x] `docs/project-decisions.md` 전면 갱신 (8개 결정 섹션)
- [x] **Phase 1 Research 완료**
  - `docs/research_raw.md` — 14개 주제, 48개 출처
  - `docs/ux_research.md` — 디자인 시스템 Option A/B/C 제시, 잠정 추천 Option A("Security Minimal")
- [x] **Phase 2 Integration 완료**
  - `docs/integrator_report.md` — CRAAP 평가 (🟢12 / 🟡4 / 🔴1), MoSCoW 분류, 8개 오픈 질문
- [x] **Gate 1 통과** — 사용자가 8개 질문 전부 답변 (Q1=C, Q2=A, Q3=A, Q4=A, Q5=B, Q6=B, Q7=A, Q8=A)
  - **Q2=A가 integrator 권장(B)과 반대** → 모바일·웹·E2EE 동기화가 MVP Must로 승격 → MVP 범위 대폭 확장
- [x] **Gate 1.5 통과** — Option A (Security Minimal) 확정 + Option C 하이브리드 보완 (Cmd+K, 조밀 Graph 뷰)
- [x] **Phase 2.5 완료** — ui-prototype 스킬 실행
  - 패키지: tailwindcss@4.2.4, @tailwindcss/vite, clsx, tailwind-merge, cva, tw-animate-css, lucide-react, motion, @radix-ui/react-slot, Inter/JetBrains Mono variable fonts
  - 파일: `src/styles/globals.css` (Tailwind v4 + @theme + oklch 라이트/다크 토큰), `src/lib/utils.ts` (cn), `src/components/ui/button.tsx`, `src/components/theme/theme-provider.tsx` (+ useTheme), `components.json`
  - 구성 업데이트: `vite.config.ts` (@tailwindcss/vite + @ alias), `tsconfig.json` (paths), `index.html` (title), `src/main.tsx` (ThemeProvider), `src/App.tsx` (재작성), `src/App.css` 삭제
  - CLAUDE.md 에 UI/UX Architecture 섹션 추가
  - TypeScript 타입체크 통과
- [x] **Phase 2.6 — Planning 완료**
  - `docs/architecture.md` — 9개 섹션(시스템 개요, 데이터 모델, 모듈 경계, 보안, 플랫폼 매트릭스, 외부 의존성, 배포, 관측성, 오픈 이슈). ASCII 아키텍처 다이어그램 + Mermaid ER 다이어그램 포함.
  - `docs/task.md` — **118개 태스크** (Must 82 / Should 21 / Could 15) × **14개 마일스톤** (M0 Foundation ~ M13 Release). 각 태스크마다 ID/Priority/Depends on/Goal/DoD/Files Touched/Tests 명시. Open Issues 7개.
  - `docs/implementation_plan.md` — 마일스톤별 개요/태스크 그룹/핵심 기술 결정/TDD 전략/리스크 완화/검증 체크리스트. 사전 준비(ENV/계정), 전체 롤백 계획, 1인 운영 원칙 재확인 섹션.

- [x] **Gate 2 통과** — 플랜 승인 + Open Issues 7건 결정
  - Q1 리포 구조: **A (분리 레포)** — api-vault (public AGPL) + api-vault-relay (private EE)
  - Q2 GitHub Org: **`api-vault`**
  - Q3 Free tier 디바이스: **2대** (planner 제안 수락)
  - Q4 도메인: M12/M13 직전 확보 (후보: apivault.app → api-vault.dev → keyvault.dev)
  - Q5 계정/결제: 각 마일스톤 직전 JIT (Cloudflare=M9, Paddle=M10-2w, RevenueCat=M10, Apple=M11, Google=M11, GitHub App=M5)
  - Q6 Windows 서명: **SignPath OSS** (무료, AGPL 자격)
  - Q7 법률 리뷰: **iubenda/Termly로 시작**, 성장 후 변호사 전환

- [x] **Phase 3 실행 모드 확정** — Auto edits (파일 편집·커밋 자동, git push·배포·외부 결제만 승인 필요)
- [x] **T001 + T002 완료** — Cargo 워크스페이스 분리 스캐폴드 + workspace.dependencies 설정 (`cargo build --workspace`, `cargo test --workspace` 모두 통과)
- [x] **T003 완료** — Tauri v2 플러그인 9종 활성화 (`cargo build --workspace` exit 0, `cargo test` exit 0, `cargo clippy -D warnings` exit 0, `tsc --noEmit` exit 0). Stronghold 플러그인은 AppLocker 이슈로 제외됐고, 이후 2026-04-22 볼트 암호화 엔진을 `age` crate로 교체하는 결정에 따라 완전히 제거됨 (project-decisions.md 참조). JS 패키지는 정상 설치.
- [x] **T004 완료** — LICENSE (AGPL-3.0, 34,523 bytes, curl 다운로드) + LICENSE_FAQ.md (5-Q&A, EE 경계 설명)
- [x] **T005 완료** — .github/CLA.md + .github/workflows/cla.yml (contributor-assistant@v2) + .github/pull_request_template.md
- [x] **T006 완료** — src-tauri/rustfmt.toml, eslint.config.js (flat config), .prettierrc, .prettierignore, package.json scripts 5종 추가, .github/workflows/ci.yml (rust + frontend job)
- [x] **T007 완료** — README.md 전면 재작성 (About/Features/Stack/Platforms/Getting Started/Dev Commands/License/Contributing/한국어 요약)

## Completed (continued)

- [x] **T008 완료** — globals.css vault 시맨틱 토큰 4종 + badge.tsx (cva, 8 variants)
- [x] **T009 완료** — shadcn/ui primitive 12종 설치 + Toaster 마운트
- [x] **T010 완료** — react-router-dom@7 + AppShell/Sidebar/BottomNav + 5개 placeholder 페이지 + BrowserRouter 라우팅
- [x] **T011 완료** — i18next + react-i18next + LanguageDetector, en/ko/ja 번역 파일, SettingsPage 언어 선택 UI
- [x] **T012 완료** — docs/dev-setup.md (Prerequisites/First-time Setup/Daily Dev/Testing/Folder Layout/Troubleshooting/한국어 요약)

**M0 전체 완료.**

- [x] **T001 구조 재조정 (긴급 수정)** — `pnpm tauri dev` 복구. `src-tauri/Cargo.toml`에 `[package]`+`[[bin]]` 복원, `src-tauri/src/main.rs`(shim) + `src-tauri/build.rs`(tauri_build) 신규 생성, `api-vault-app`을 lib-only로 전환, `tauri.conf.json`에 `plugins.updater` 추가. 6개 검증 모두 통과.

## In Progress

- [x] T025 Inventory 페이지 목록 뷰 + 필터 바 — 커밋 `ab69319`
- [x] T028 Issuer 프리셋 10종 시드 + issuer_list/get — 커밋 `539347f`
- [x] T026 Credential 등록 다이얼로그 — 커밋 `a7e1d58`
- [x] T027 Credential 상세 Drawer (Sheet) — 커밋 `4cbf8c0`
- [x] T029 Cmd+K Command Palette — 커밋 `67dd892`
- [x] T030 Settings 페이지 + settings_get/set — 커밋 `96337a5`
- [x] T031 Auto-lock idle 타이머 — 커밋 `34e8a90`
- [x] T032 드롭 존 + 라우트 placeholder — 커밋 `6f121ee`
- [x] T033 env_scanner (엔트로피 + issuer regex + .env/generic 파서) — 커밋 `8e7c7a2`
- [x] T034 env_scan_folder Tauri 커맨드 — 커밋 `eeab911`
- [x] T035 결과 검토 UI (DetectedKeysReview) + project/usage 커맨드 — 커밋 `6f31d56`
- [x] i18n 중국어(zh-간체) 로케일 추가 — 커밋 `1168210`
- [x] T036 Welcome 3단계 온보딩 + RequireOnboarding 가드 — 커밋 `e22c452`
- [x] T037 Project CRUD 페이지 + 연결된 credential 뷰 — 커밋 `bf67527`
- [x] T038 Deployment CRUD (ProjectDetail 내부 섹션) — 커밋 `3072909`
- [x] T039 Usage 링크 UI — 커밋 `cff6bf8`
- [x] T040 Inventory 보안 점수 + SecurityDot — 커밋 `11281cd`
- ✅ **M2 완료 (16/16)** — 다음은 M3 Dependency Graph & Blast Radius (T041~T048)

## Pending Decisions

- Gate 3 (배포 진행 승인)
- Gate 4 (git push 승인)
- **`pnpm typecheck` 5 에러 (pre-existing, T049 무관)** — `src/features/graph/__tests__/GraphPage.test.tsx` 13/15/74/120/133 줄. `vi.fn<[], void>()` 구식 generic + `vi.mocked(...).mockReturnValue("desktop" as never)` 패턴이 vitest 현행 타입에서 never 추론. T049 진입 직전 stash 검증으로 pre-existing 확인 (M3 커밋 `ebb9855` 시점에도 재현). M4 중에 별도 fix (`vi.fn<() => void>()` 또는 mock 타입 수정) 커밋으로 처리. 진행에는 영향 없음 (vitest 런타임은 정상 통과).
- **Custom issuer 생성 UX 연기 (T026 범위 외)** — T026 Issuer combobox 는 프리셋 10종만 선택 가능. DoD 의 "+ Custom" 옵션은 구현하지 않고 **별도 issuer 관리 UI 또는 T037 Project 관리 맥락**에서 처리 예정. 근거: 바이브 코더 페르소나는 주류 SaaS 가 대부분이라 프리셋으로 90%+ 커버, Custom UX 는 Issuer 메타(docs/issue/status URL) 입력 부담이 커 별도 전용 플로우가 낫다. M2 후반 또는 M5 GitHub Connector 작업 중 재검토.
- **T034 per-file progress streaming / 10k 파일 상한 follow-up** — 현재 `env_scan_folder` 는 `scan:progress` 이벤트를 Started/Done 2회만 emit. 진행률 표시는 T035 UI 에서 spinner 로 처리 가능하나, 초대형 프로젝트(>10k 파일) 에서 UX 저하 가능. `scan_path` 를 iterator 기반으로 재구조화해 per-file 카운터 emit 하도록 확장은 별도 태스크. M2 후 또는 M3 에 배치.

## Key Shifts from Initial Plan

| 항목   | 이전             | 현재                            |
| :----- | :--------------- | :------------------------------ |
| 플랫폼 | 데스크톱 전용    | 풀스택 (Desktop + Mobile + Web) |
| 기간   | 3주 MVP          | 고정 기간 없음, "가치 기준" MVP |
| 동기화 | Phase 2          | Phase 0 필수 (E2EE + CRDT)      |
| 타겟   | 개발자           | 개발자 + 바이브 코더            |
| 수익   | $49 단발 + $6/월 | Freemium + $2/월 Pro            |
| OSS    | 미정             | Open Core (AGPL-3.0 + EE 독점)  |

## T035 구현 교훈 (M2 후속 영향)

- **드롭&스캔 값 본체는 저장하지 않음.** 스캐너가 `value_hint` 마지막 4자만 반환하므로 일괄 import 시 credential 의 secret 본체로 `"scanned:unknown"` 플레이스홀더를 저장. 사용자가 credential detail 에서 reveal 하면 placeholder 가 노출된다. **Follow-up 필요**: 스캔 결과에서 재스캔으로 실제 값을 채우는 "secure import" 경로(파일 위치/라인 번호로 Rust 측에서 재파싱해 age 볼트에 직접 주입). M2 종료 전 또는 M3 초반에 배치.
- **`credential_list` 의 `CredentialSummary` 에 `hash_hint` 추가됨** (중복 감지용). 기존 호출자 영향 없음 (field는 선택이며 CredentialCard/CredentialList 는 참조 안 함). fixtures.ts 10개, CredentialCard.test 의 makeCredential 만 보완.
- **entropy-only 감지 항목은 import 불가** — `issuer_slug` 가 `None` 이면 issuer FK 를 결정할 수 없어 기본 체크 해제 + 선택해도 skip. UI 는 체크박스는 disabled 아니지만 Import 집계에서 제외됨.
- **프론트 `Usage` 타입이 Rust 와 불일치** (legacy fields: `url`, `env_var_name`, `scanner_version`) — T035 에서는 건드리지 않고 DetectedKeysReview 는 `where_kind: "env_var"`, `where_value` 로 rust 커맨드에 전달. 추후 T037/T038 에서 frontend `Usage` 타입을 정리해야 함.

## T040 구현 교훈 (M3 이후 영향)

- **Rust 에서 authoritative 계산 → 응답에 주입**: 프런트에서 TS 로 같은 로직을 중복 구현하는 대신 `CredentialRepo::list` 가 `row_to_credential(r)` 로 full cred 를 조립한 뒤 `score_credential(&cred)` 을 호출해 `CredentialSummary.score` 에 포함. `credential_get` 도 `CredentialFull.score` 로 동일 계산. 프런트는 단순 렌더러. Single source of truth 유지.
- **`score_at(cred, now)` 분리**: `score(cred)` 는 `OffsetDateTime::now_utc()` 를 쓰고, 테스트용 `score_at(cred, now)` 는 time 주입. 9개 유닛 테스트가 결정적 base time (`1_700_000_000` epoch + day offset) 기준으로 검증.
- **Revoked/Compromised 는 단락**: status 가 `Revoked` 또는 `Compromised` 일 때는 나머지 factor 평가 건너뛰고 즉시 `total=0, level=Danger, factors=[해당 코드]` 반환. 이후 factor 와 혼합하지 않음 — "폐기된 키"에 "만료 임박" 메시지 덧붙이는 건 혼란스러움.
- **FactorCode enum + i18n 키 매핑**: Rust 측 `#[serde(rename_all = "snake_case")]` 덕에 JSON 이 `"expired"` / `"expiring_soon"` 등 snake_case. 프런트는 `inventory.factor.{code}` 를 자동 매핑해 i18n 번역. 새 factor 추가 시 Rust enum + 4개 언어 키만 추가하면 UI 코드 수정 불필요.
- **`bg-vault-success/warning/danger` 시맨틱 토큰 활용**: T008 에서 추가한 토큰이 T040 에서 첫 실제 소비처. 다크 모드 자동 대응. 별도 hex 하드코딩 없음.
- **shadcn Tooltip provider 는 컴포넌트 내부에 배치**: SecurityDot 자체가 TooltipProvider 를 감싸서 어디에 삽입돼도 독립 동작. CredentialCard 는 SecurityDot 을 단순 import 만 하면 됨.
- **기존 fixtures 전면 업데이트 필요**: CredentialSummary/CredentialFull 에 required `score` 필드를 추가하면 프런트 테스트 파일 3곳(fixtures/CredentialCard.test/ProjectsPage.test/DetectedKeysReview.test) 의 모든 mock 에 `score` 를 채워야 함. `MOCK_SAFE_SCORE` 상수 export 로 간결화. 이런 "Required 필드 추가" 리팩터링은 다음에도 빈번할 것이므로 패턴 숙지.
- **Score 는 서버 fresh**: 만료 판정이 시점 의존. `credential_list` 가 호출될 때마다 다시 계산되므로 DB 에 저장하지 않음. 클라이언트 캐시에 오래 머물 경우 stale 가능 — 현재 refresh 주기(사용자 상호작용 + 드롭&스캔 후) 에서는 문제 없음. 추후 폴링이 필요하면 interval fetch 추가.

## M2 종료 요약

- **16/16 태스크 완료** (Must 13 + Should 3). 누적 56 커밋.
- **핵심 구조**: Inventory 목록 + 필터 + Card 그리드 + Cmd+K + Settings + Auto-lock + 드롭&스캔(3단계) + Welcome 온보딩 + Project CRUD + Deployment CRUD + Usage 링크 + Security Score.
- **테스트**: Rust 95+개 (security_score 9 신규 포함) + Vitest 140개 (UsageSection 4 + SecurityDot 4 포함). 전부 통과.
- **Backend 커맨드 총계**: vault 4 + credential 6 + issuer 2 + project 5 + deployment 4 + usage 4 + settings 2 + scanner 1 = **28 Tauri 커맨드**.
- **Follow-up 큐** (M3 이후 처리):
  1. 드롭&스캔 secure import 경로 (T035 교훈) — scan 결과를 실제 값으로 재파싱해 age 볼트에 주입.
  2. Deployment 삭제 시 usage.deployment_id cascade 처리 (T038 교훈).
  3. BottomNav 6탭 UX 재검토 (Audit 을 Settings 내부로 이동?).
  4. Score factor 확장: usages 없음 factor 를 CredentialFull 전용으로 추가.

## M3 진행 상황 (8/8 ✅ 완료)

### 완료 ✅

- **T041** `api-vault-core` 그래프 모델 (petgraph DiGraph) — 커밋 `5256f71`
- **T042** Blast Radius BFS (primary/secondary/tertiary depth buckets) — 커밋 `533485c`
- **T043** Tauri 커맨드 `graph_fetch` + `blast_radius_for_credential` — 커밋 `67cee48`
- **T044** React Flow + dagre 레이아웃 (`/graph` 페이지, TB/LR 토글, MiniMap/Controls/Background) — 커밋 `b118c99`
- **T045** 커스텀 노드 4종 (Issuer/Credential/Project/Deployment, React.memo, dagre handles) — 커밋 `07ff733`
- **T046** Blast Radius 하이라이트 — 커밋 `4abe502`
- **T047** Graph performance optimization — 커밋 `1477c0f`
- **T048** Mobile graph alternate view (MobileGraphList + useIsMobile + GraphPage 분기) — 커밋 `ebb9855`

### T047 구현 교훈 (M3 후속 영향)

- **`useViewport` mock 필수**: jsdom 환경에서 `useViewport` 도 `useReactFlow` 처럼 mock 에 명시해야 함. `DependencyGraph.blastRadius.test.tsx` 와 `GraphPage.test.tsx` 양쪽에 `useViewport: () => ({ zoom: 1, x: 0, y: 0 })` 추가.
- **compact mode 구현 위치**: `useViewport()` 는 `ReactFlowProvider` 내부에서만 동작하므로 `InnerGraph` 에 위치. zoom 변화마다 `computedNodes` useMemo 재계산되나, 실제 노드 컴포넌트는 `areNodePropsEqual` 로 compact 필드 변화 시에만 재렌더.
- **`nodesDraggable` localStorage**: Rust settings 테이블 변경 없이 프론트엔드만으로 처리. `apivault:graph:nodesDraggable` 키로 저장. 기본값 `false` (60fps 우선).

### T044/T045 구현 교훈 (M3 후속 영향)

- **feature 폴더 전환**: `src/pages/GraphPage.tsx` 는 `@/features/graph/GraphPage` re-export 만 남김. 실제 로직/컴포넌트는 `src/features/graph/` 아래로 이동 → inventory 패턴과 일치.
- **Handle 은 방향에 따라 top/bottom ↔ left/right**: `GraphNodeData.direction` 을 adapter 가 실어보내 각 노드가 자기 위치 결정. DependencyGraph 의 direction state 만 바꾸면 자동 재레이아웃 + 핸들 회전.
- **Issuer 는 source 만 / Deployment 는 target 만**: 루트/리프 노드 구분은 핸들 선언에 반영. Credential/Project 는 양쪽.
- **`nodeTypes` 는 모듈 스코프 상수**: JSX 인라인 시 React Flow 매 프레임 재렌더 경고. `node-types.ts` 싱글 소스로 고정.
- **adapter type 변환**: `type: 'default'` → `type: node.kind` 로 바뀌면서 React Flow 가 자동으로 `nodeTypes` 맵에서 컴포넌트 선택.
- **`vault-accent` / `vault-muted` 토큰 부재**: spec 의 "accent/muted" 언급은 globals.css 에 없는 토큰이라 `vault-info/warning/success + muted` 조합으로 대체. deployment 만 neutral `bg-muted`. T046 에서 dim 처리할 때도 동일 `muted` 활용.
- **`@xyflow/react` 테스트**: jsdom 에서 `Handle` 이 provider context 요구 → `vi.mock('@xyflow/react', ...)` 로 Handle/MiniMap/Controls/Background 를 `() => null` 대체. 실제 앱에선 `ReactFlowProvider` 로 감싸 정상 동작.
- **시각 검증은 수동**: `pnpm tauri dev` 로 사용자가 `/graph` 확인 필요. 현재 자동 테스트는 렌더 성공 + 클래스 존재만 검증.

### T043 구현 교훈 (M3 후속 영향)

- **`GraphEdgeKind` 는 `api-vault-core::EdgeKind` 의 직렬화 미러**: 와이어 포맷 snake_case (`"used_by"`, `"deployed_as"`, `"issues"`) 를 커맨드 레이어에서 "고정". 코어가 향후 enum 이름 리팩토링해도 프론트 계약 안깨짐. `NodeKind` 도 동일 패턴.
- **`list_all()` 추가된 3 repo**: `CredentialRepo`, `UsageRepo`, `DeploymentRepo` — 기존 `list(filter)` / `list_for_project` / `list_for_credential` 로는 그래프 전체 로드 불가. 다른 전체 스캔 기능(T047 뷰포트 컬링 이전의 초기 로드, 향후 Audit 전체 내보내기 등)에서도 재사용 가능.
- **`load_graph(state)` 공유 헬퍼**: `graph_fetch` 와 `blast_radius_for_credential` 모두 동일 데이터 로드 필요 → 같은 모듈 private async fn 으로 추출. T046 UI 클릭 시 `blast_radius_for_credential` 호출할 때마다 5개 테이블 리스트를 다시 조회 — 현 규모 (10s~100s of rows) 에서는 문제 없지만 M3 성능 이슈 나오면 상태(캐시) 전환 검토.
- **`Deployment.url` 은 non-Optional**: `deployment_label()` 이 "url @ env" 단순 조립. 빈 문자열/누락 분기 불필요.
- **`meta_json: serde_json::Value`**: 노드 타입별 추가 속성을 스키마리스로 실어 보냄 — 프론트 에서 `node.data.meta_json.env` 처럼 접근. 향후 새 메타 필드 추가 시 Rust 만 바꾸면 됨 (프론트 타입 정의 선택적 확장).

### T042 구현 교훈 (M3 후속 영향)

- **방향성 확정**: `Direction::Outgoing` 만 따름. Credential → Project → Deployment 로 *아래로* 전파. Issuer 는 상위 노드라 결과에 포함 안 됨. T046 UI 하이라이트 시 "이 키를 잃으면 영향받는 것들" 의 직관과 일치.
- **`BlastRadius { primary, secondary, tertiary }` 3-버킷 구조 유지**: 현재 모델에서는 tertiary 가 거의 빈 값이지만, 향후 URL/Service/Region 등 하위 노드 확장 여지를 위해 API 수축하지 않음.
- **미존재 credential → 빈 값 (panic/Option 없음)**: T043 Tauri 커맨드가 `BlastRadius` 를 직렬화해 프론트로 보낼 때 `null` 이나 에러 분기 없이 빈 배열 3개로 통일 가능.
- **결정론적 정렬**: `(discriminant, ULID string)` 기준. 같은 입력에 대해 항상 같은 출력 → React Flow 렌더 순서, 스냅샷 테스트, diff 친화적.
- **`graph.rs` 불변**: 접근자 `node_index(NodeRef) -> Option<NodeIndex>` + `as_inner()` 만으로 BFS 구현 충분. T041 이 깔아둔 API 가 충분히 만족. 추가 확장 불필요.

### T041 구현 교훈 (M3 후속 영향)

- **`build(issuers, credentials, usages, projects, deployments)` 로 확정** (spec 의 `build_from_repo(&Repos)` 는 버림). 이유: `api-vault-core` 가 `api-vault-storage` 에 역의존하면 계층 뒤집힘. T043 Tauri 커맨드 계층이 repos 에서 데이터를 뽑아 슬라이스로 넘긴다.
- **`NodeRef` 는 도메인 newtype ID 를 감쌈** (`IssuerId` 등), raw `Ulid` 아님. `Copy + Eq + Hash + Serialize + Deserialize + Debug` 모두 만족해 petgraph node weight + T043 직렬화에 모두 재사용 가능.
- **엣지 의미 확정**: `Issues` (Issuer→Credential, `Credential.issuer_id`), `UsedBy` (Credential→Project, `Usage` 경유 + 중복 제거), `DeployedAs` (Project→Deployment, `Deployment.project_id`).
- **UsedBy 중복 제거**: 동일 (credential, project) 쌍의 Usage 가 여러 개여도 엣지 1개. T046 블래스트 반경 시각화에서 중복 하이라이트 방지.
- **도메인 모델 확인 결과**: `Credential.issuer_id`, `Usage.project_id`, `Deployment.project_id` 모두 non-Optional → 방어적 스킵 불필요. `Usage.deployment_id` 만 `Option` 이지만 현재 그래프 엣지 구성에는 안 쓰임 (DeployedAs 는 Deployment 측에서 도출).
- **내부 `HashMap<NodeRef, NodeIndex>` 인덱스**: O(1) 노드 조회. T042 BFS 에서 `graph.node_index(NodeRef::Credential(id))` 로 시작점 잡을 때 활용.

## Next Action (M4 — T049)

- **M3 완료**. 다음은 M4 Incident Feed (T049~T058).
- **T049** — NVD/GitHub Advisory 피드 파서 구현 예정.
- DoD:
  - `src/features/graph/use-blast-radius-selection.ts` — 클릭 이벤트로 `invoke<BlastRadius>('blast_radius_for_credential', { id })` 호출. 로딩/에러/결과 상태 관리.
  - 결과에 따라 각 노드에 `data-status="primary|secondary|tertiary|dimmed"` 적용 (또는 `data.status` 로 React Flow data 에 주입).
  - CSS: outline 색상 (primary=vault-danger, secondary=vault-warning, tertiary=muted-foreground) + opacity (dimmed=0.35).
  - 색맹 대응: outline style 변형 (primary=solid 3px, secondary=dashed 2px, tertiary=dotted 1px) 으로 색 의존 축소.
  - Esc 키로 선택 해제.
  - Credential 노드 이외 (Issuer/Project/Deployment) 클릭 시 선택 해제하거나 무시.
- 구현 스케치:
  1. `BlastRadius` TS 타입 `src/features/graph/types.ts` 에 추가 — Rust `BlastRadius { primary, secondary, tertiary }` 미러.
  2. `use-blast-radius-selection.ts` — `{ selectedId: string | null, status: {[nodeId]: "primary"|"secondary"|"tertiary"|"dimmed"} | null, select(id), clear() }` 반환.
  3. `DependencyGraph.tsx` 에서 `onNodeClick` 핸들러 연결 + Esc keydown 리스너 + 선택된 상태를 `nodes` 의 `data.status` 에 주입 (useMemo 로 재계산).
  4. 각 노드 컴포넌트 (`IssuerNode/CredentialNode/ProjectNode/DeploymentNode`) 에서 `data.status` 읽어 Card className 에 조건부 스타일 추가.
  5. i18n 키 `graph.blast.loading/error/none` 추가 (필요 시).
- 선행 확인:
  - Rust 측 `blast_radius_for_credential` 은 T043 에서 이미 구현됨 (`CredentialId` 받아 `BlastRadius` 반환).
  - Credential 노드 한정 클릭 로직: `node.data.kind === 'credential'` 체크.
  - React Flow v12 `onNodeClick` 시그니처: `(event, node) => void`.
- 테스트 (Vitest):
  - `use-blast-radius-selection` 훅 단독 테스트: `invoke` mock → 상태 변화 검증.
  - 노드 컴포넌트 `data.status='dimmed'` 시 opacity 클래스 존재 확인.
  - Esc 키 → clear 호출 확인.
