# UX Research — API Vault

> 작성자: UX Research Agent (claude-sonnet-4-6)
> 수집일: 2026-04-22
> 기반 자료: user_research/initial_idea.md, user_research/gemini_deep_research_apivault.md, docs/research_raw.md + 신규 웹 서치 20회 이상

---

## 1. 요약 (핵심 발견 TL;DR)

API Vault는 **"전문 개발자(Power User)"** 와 **"바이브 코더(Vibe Coder)"** 라는 두 페르소나가 같은 앱을 써야 하는 구조적 UX 난점을 안고 있다. 조사 결과 도출한 핵심 발견 5가지:

1. **디자인 시스템 현황**: 2025~2026년 기준 shadcn/ui + Radix UI + Tailwind v4 조합이 Tauri 데스크톱 React 앱의 사실상 표준으로 자리잡았다. GitHub에 `tauri-ui` (agmmnn) 보일러플레이트가 이미 존재하며 shadcn/ui 기반 Tauri 개발이 검증됐다 [#1, #2].

2. **두 페르소나 공존 전략**: Progressive Disclosure가 핵심 패턴이다. 복잡한 기능(Graph, Blast Radius, Kill Switch)을 "숨기는" 것이 아니라 **단계별로 드러내는** 방식으로 바이브 코더에게는 단순한 진입구를 주고, 전문 개발자에게는 전체 기능을 허용한다.

3. **보안 도구의 톤 문제**: 보안 경고가 사용자를 겁주면 역효과(잘못된 우회행동 유발)가 발생한다. Firefox UX 리서치에서 확인된 이 패턴은 Grammarly/Cursor의 인라인 제안 방식("경고"가 아닌 "다음 단계 제안")으로 해결된다 [#16].

4. **그래프 레이아웃**: React Flow + dagre(계층 구조)가 API 키 의존성 그래프에 최적이다. ELK는 더 강력하나 복잡도가 높다. 1000노드 범위에서 `React.memo` + viewport culling으로 실용적인 성능 확보 가능 [#17].

5. **멀티 플랫폼 공통성**: 데스크톱(Tauri) + 모바일(Tauri 또는 별도 PWA) + 웹 대시보드를 단일 디자인 토큰(Tailwind v4 `@theme` CSS variables)으로 묶으면 플랫폼별 네이티브 감성을 유지하면서 일관성을 확보할 수 있다 [#7].

**잠정 추천**: Option A (shadcn/ui 기반 "보안 미니멀") — 이유는 섹션 7-8 참조.

---

## 2. 2025~2026 UI/UX 트렌드 (보안·개발자 도구 맥락)

### 2.1 다크 모드가 기본값으로 정착

2025~2026년 기준으로 새로 출시되는 SaaS 제품의 45%가 다크 모드를 기본값으로 제공한다 [#3]. 특히 개발자 도구, 보안 대시보드, 생산성 도구는 "다크 퍼스트" 설계가 표준이다. 모바일 사용자의 80% 이상이 다크 모드를 상시 활성화한다. 2026년 기준 전문 디자인팀은 **다크 테마를 먼저 설계한 후 라이트 테마로 파생**하는 워크플로우를 채택한다.

API Vault 함의: 다크 테마 우선 설계. 라이트 모드는 접근성 대안으로 제공(특히 웹 대시보드).

### 2.2 "Linear 미학"의 확산

Linear(프로젝트 관리 도구)가 시작한 디자인 트렌드가 개발자 도구 전반에 확산됐다 [#4]. 특징:

- 최소한의 색상(단색 계열 + 희소한 강조색)
- `Cmd+K` Command Palette로 대표되는 **키보드 퍼스트** 인터랙션
- 여백 중심의 타이포그래피, 조밀하지만 읽기 편한 밀도
- 마이크로 애니메이션(전환, hover 피드백)은 있지만 과하지 않음

이 패턴은 Linear, Vercel, Raycast, Supabase, Railway, Infisical 등 개발자 타깃 제품에서 공통으로 관찰된다.

### 2.3 보안 도구의 신뢰 시그널 디자인

2025년 사이버보안 UX 연구들이 공통으로 지적하는 패턴 [#15, #16]:

- **자물쇠/방패 아이콘 남용은 역효과**: 사용자 피로감을 유발하고 신뢰 신호로 인식되지 않는다.
- **색상·타이포그래피로 신뢰 표현**: 일관된 컬러 시스템(예: Red = 위험, Amber = 주의, Emerald = 안전)이 아이콘보다 신뢰도 높다.
- **경고는 "다음 행동"을 함께 제시**: "키가 90일 이상 미교체"가 아니라 "지금 교체하기" CTA와 함께 표시.
- **두려움 대신 행동 유도**: Mozilla Firefox UX 연구에서 확인된 패턴 — 겁주는 경고문은 사용자가 우회/무시하는 행동을 유발한다.

### 2.4 AI 인터페이스 패턴의 주류화

2026년 기준 Notion AI, GitHub Copilot 등이 "기존 UI와 AI 인터랙션의 공존"을 정상화했다 [#3]. 개발자 도구에서 인라인 제안, 예측적 입력 필드, 동적 레이아웃이 일반화됐다. API Vault의 RAILGUARD 기능(AI 룰 파일 자동 생성)은 이 트렌드와 완벽하게 맞닿는다.

### 2.5 "Atomic Personalization" 부상

2026년 대시보드는 사용자 행동 기반으로 인터페이스가 물리적으로 재배열되는 방향으로 진화 중이다 [#3]. API Vault에서 적용 가능한 형태: 전문 개발자가 Graph를 자주 쓰면 Graph를 첫 화면으로, 바이브 코더가 Incidents를 자주 보면 Incidents를 우선 표시하는 적응형 홈 화면.

---

## 3. 멀티 디바이스 UX 일관성

### 3.1 1Password 8+/Bitwarden 멀티 플랫폼 전략 분석

비교 조사 결과 [#5, #6]:

| 항목        | 1Password 8+                          | Bitwarden                 | API Vault 적용 가이드                |
| :---------- | :------------------------------------ | :------------------------ | :----------------------------------- |
| 디자인 언어 | 풍부한 색상, 아이콘 강조, 둥근 모서리 | 기능 중심, 다소 밋밋      | Linear 미학으로 차별화               |
| 데스크톱    | 풀 기능, 카테고리 사이드바, 태그 필터 | 풀 기능, 유사 구조        | Graph 편집, 코드 스캔, Rotation 실행 |
| 모바일      | 빠른 조회 + 바이오메트릭 + 자동완성   | 유사                      | 빠른 조회 + Kill Switch + 알림 수신  |
| 웹          | 읽기 중심, 공유 볼트, 관리 대시보드   | 유사                      | 팀 뷰어(Phase 2), 감사 로그          |
| 공통 토큰   | 독점 디자인 시스템                    | 오픈소스 Angular 컴포넌트 | Tailwind v4 @theme                   |

### 3.2 플랫폼별 역할 분담 권장

**데스크톱 (Tauri v2, 풀 기능)**

- Graph 뷰: 노드 드래그, 레이아웃 변경, 블라스트 반경 시뮬레이션
- Inventory: 키 등록, 스캐너 실행, 태그 관리
- Rotate: 회전 파이프라인 실행, 진행 상태 보드
- Kill Switch: 이슈어 단위 일괄 revoke (2단계 확인)
- Cmd+K Command Palette: 모든 기능 키보드 접근

**모바일 (Tauri v2 모바일 또는 PWA)**

- 홈 화면: "위험 신호 요약 카드" (현재 경고 개수, 만료 임박 키 개수)
- 긴급 Kill Switch: 바이오메트릭 인증 후 단 1~2탭
- 알림 수신: Incident Feed 매칭 알림
- 그래프: 읽기 전용 요약 카드 (간이 리스트 뷰, 인터랙티브 그래프는 데스크톱 전용)
- 빠른 복사: 특정 키 값 조회 + 30초 클립보드 만료

**웹 대시보드 (Phase 2)**

- 팀 공유 볼트 뷰어 (읽기 중심)
- 관리자 감사 로그 열람
- 초대 링크, RBAC 설정

### 3.3 공통 디자인 토큰 전략

Tailwind v4의 `@theme` 블록을 이용해 CSS variables로 토큰 정의:

```css
@theme {
  /* 시맨틱 색상 토큰 */
  --color-vault-bg: #0a0a0b;
  --color-vault-surface: #111113;
  --color-vault-border: #1f1f23;
  --color-vault-text: #ededed;
  --color-vault-muted: #888;
  --color-vault-accent: #7c3aed; /* 핵심 액션 */
  --color-vault-danger: #ef4444; /* Kill Switch, 경고 */
  --color-vault-warning: #f59e0b; /* 만료 임박, 주의 */
  --color-vault-success: #10b981; /* 안전, 검증 완료 */
}
```

이 토큰은 Tauri 데스크톱, 모바일 WebView, 웹 대시보드 모두에서 동일하게 참조된다. 플랫폼별 네이티브 감성은 `border-radius`, `shadow`, `font-size` 토큰을 플랫폼별로 오버라이드하여 구현한다.

---

## 4. 바이브 코더 페르소나 UX 가이드

### 4.1 Progressive Disclosure 패턴

바이브 코더에게 API Vault의 복잡도를 숨기는 것이 아니라, 단계별로 드러내는 전략이 핵심이다 [#8, #9].

**3단계 Progressive Disclosure 구조:**

| 단계            | 표시 내용                                             | 타깃        |
| :-------------- | :---------------------------------------------------- | :---------- |
| 1단계 (기본 뷰) | 키 목록 카드, 상태 뱃지 (안전/주의/위험), 빠른 복사   | 바이브 코더 |
| 2단계 (확장 뷰) | 만료일, 사용처 프로젝트, 마지막 교체일                | 일반 사용자 |
| 3단계 (고급 뷰) | Graph, Blast Radius, Rotation 파이프라인, Kill Switch | 전문 개발자 |

**구현 패턴:**

- 기본 화면: Inventory의 카드 그리드 (간단, 깔끔)
- "자세히 보기" 토글로 2단계 확장
- 사이드바 "Graph 보기" 버튼으로 3단계 전환
- 첫 실행 온보딩: 3단계를 순서대로 짧게 소개 (스킵 가능)

### 4.2 온보딩 자동화: "드롭 & 스캔"

바이브 코더의 핵심 고통점은 "내 API 키가 어디에 있는지 모른다"는 것이다. 해결책:

1. **프로젝트 폴더 드래그 앤 드롭** → Tauri 파일 시스템 API로 `.env`, `.env.local`, `.env.production`, `config/*.json` 자동 스캔
2. **자동 인벤토리 구축**: 발견된 키 패턴(고엔트로피 문자열, `OPENAI_API_KEY=sk-...` 형태)을 자동 감지
3. **"이것들이 맞나요?" 검토 화면**: 감지된 키 목록을 사용자에게 보여주고 확인/수정
4. **자동 매칭**: 키 접두사(예: `sk-`, `ghp_`, `pk_live_`)로 공급자를 자동 추론하여 Issuer와 연결

이 플로우는 **Figma의 "Import" 워크플로우**와 유사하게 설계해야 한다 — 복잡한 설정 없이 파일을 던지면 앱이 알아서 처리한다.

### 4.3 RAILGUARD 시각화: 두렵지 않은 보안 가드레일

gemini_deep_research_apivault.md 섹션 4.1의 RAILGUARD 개념을 바이브 코더 UX로 구현하는 방법:

**Cursor/Grammarly 인라인 제안 모델** 적용:

- 키가 `.cursorrules` 없이 감지되면 → 빨간 경고 팝업이 아니라 **파란색 인라인 제안 배너**: "이 프로젝트에 API Vault 룰 파일을 추가하면 Cursor가 키를 하드코딩하지 않도록 도와드려요. [1초 추가]"
- 키 만료 임박 → 달력 아이콘 + 노란 배지 (자물쇠/경고 삼각형 아님): "OpenAI 키가 15일 후 만료됩니다. [지금 교체]"
- Incident 감지 → "Stripe에서 보안 공지가 발표됐어요. 내 Stripe 키 [2개]가 영향을 받을 수 있습니다. [확인하기]"

**톤 가이드라인:**

- 경고문에서 "위험", "즉시", "!!!" 사용 금지
- 대신 "확인해 보세요", "업데이트 가능해요", "관리하기" 사용
- 에러 상태도 "무엇을 하면 해결되는지"를 항상 함께 표시

### 4.4 보안 점수 시각화

기술적인 "보안 점수" 개념을 바이브 코더에게 친숙하게 만드는 방법:

- 숫자 점수(예: 72/100) 대신 **색상 기반 상태 인디케이터** (초록/노랑/빨강)
- Tooltip에서만 점수 세부 내역 노출 (기본은 단순 색상)
- "무엇이 점수를 낮추는지" + "어떻게 올리는지" 버튼 세트

---

## 5. 그래프 시각화 UI 패턴

### 5.1 레이아웃 알고리즘 선택

API Vault의 의존성 그래프(Issuer → Credential → Project → Deployment → URL)는 계층 구조가 명확하다. 조사 결과 [#17, #18]:

| 알고리즘        | 특징                                    | API Vault 적합성             |
| :-------------- | :-------------------------------------- | :--------------------------- |
| **dagre**       | 계층적 DAG 레이아웃, 빠름, 설정 간단    | **MVP: 최우선 권장**         |
| **ELK (elkjs)** | 가장 강력한 레이아웃 엔진, 비동기, 복잡 | 1000+ 노드 도달 시 전환 고려 |
| **d3-force**    | 유기적 포스 레이아웃, 계층성 없음       | API 의존성 표현에 부적합     |

dagre를 MVP에 채택하고, 사용자에게 "수평 계층 / 수직 계층" 두 가지 레이아웃 전환 버튼을 제공하는 것이 권장 구현이다.

### 5.2 Blast Radius 시각화 패턴

선행 사례(Sentry Traces, Datadog Service Map, Maltego)에서 학습한 패턴 [#19]:

**포커스 + 블러 패턴:**

- 특정 키(Credential 노드) 클릭 시 → 해당 노드와 모든 하위 노드(Project → Deployment → URL)를 하이라이트
- 연결되지 않은 노드는 opacity 30%로 블러 처리
- Blast Radius 범위를 색상 링으로 표시: 직접 연결 = 빨강, 2차 연결 = 주황, 3차 = 노랑

**React Flow 구현 패턴:**

```tsx
// 노드 상태 관리
type NodeStatus = "normal" | "highlighted" | "blast-primary" | "blast-secondary" | "dimmed";

// 커스텀 노드 타입별 스타일 분기
const nodeStyles: Record<NodeStatus, React.CSSProperties> = {
  normal: { opacity: 1 },
  highlighted: { outline: "2px solid var(--color-vault-accent)" },
  "blast-primary": { outline: "2px solid var(--color-vault-danger)" },
  "blast-secondary": { outline: "1px solid var(--color-vault-warning)" },
  dimmed: { opacity: 0.3 },
};
```

### 5.3 노드 디자인 원칙

각 노드 타입을 시각적으로 구별:

| 노드 타입           | 형태                | 색상                                              | 아이콘                          |
| :------------------ | :------------------ | :------------------------------------------------ | :------------------------------ |
| Issuer (공급자)     | 사각형, 둥근 모서리 | 보라색 계열                                       | 공급자 로고 or Phosphor `Globe` |
| Credential (API 키) | 사각형, 경계선 강조 | 상태에 따라 (안전=초록, 만료임박=노랑, 위험=빨강) | `Key`                           |
| Project (프로젝트)  | 사각형, 배경 없음   | 파란색 계열                                       | `FolderOpen`                    |
| Deployment (배포)   | 사각형, 점선 테두리 | 회색 계열                                         | `Globe` or 플랫폼 로고          |

### 5.4 모바일 그래프 처리

인터랙티브 그래프는 모바일에서 사용성이 낮다 (터치 줌/팬의 복잡성). 권장 전략:

- **모바일 기본 뷰**: Credential 중심의 **리스트 카드 뷰** (그래프 아님)
- **"영향받는 프로젝트 보기"**: 해당 키의 연결 프로젝트를 계층형 리스트로 표시
- **미니 그래프**: 3~5개 노드만 있는 단순화된 인라인 그래프 (탭하면 확장)
- **전체 그래프 → 데스크톱에서 열기** 버튼: 딥링크로 데스크톱 앱으로 이동

### 5.5 성능 최적화 전략 (100~1000 노드)

React Flow 공식 권장 최적화 [#18]:

- 모든 커스텀 노드 컴포넌트에 `React.memo` 적용
- 엣지/노드 상태 업데이트는 Zustand 셀렉터로 분리
- 줌 아웃 시 라벨 숨김 처리 (zoom < 0.5이면 노드 텍스트 hidden)
- 미니맵(MiniMap 컴포넌트) 필수 제공 — 대규모 그래프 탐색의 핵심
- 초기 로드 시 dagre 레이아웃 한 번만 계산, 이후 사용자 드래그로만 재배치

---

## 6. 접근성 & 국제화 권장

### 6.1 WCAG 2.2 AA 체크리스트 (핵심 항목)

WCAG 2.2 AA는 API Vault의 최소 목표다 [#10, #11]:

**새로 추가된 AA 기준 (2.2에서 신설):**

| 기준                      | 번호         | API Vault 적용                                                      |
| :------------------------ | :----------- | :------------------------------------------------------------------ |
| Focus Not Obscured        | 2.4.11       | 드롭다운/다이얼로그가 포커스 요소를 가리지 않아야 함                |
| Focus Appearance          | 2.4.12 (AAA) | 포커스 링 최소 2px, 최소 3:1 색상 대비 (AA는 2.4.11)                |
| Dragging Movements        | 2.5.7        | 그래프 노드 드래그에 키보드 대안 필수                               |
| Target Size (Minimum)     | 2.5.8        | 클릭 타겟 최소 24×24px                                              |
| Accessible Authentication | 3.3.8        | 인증에 인지 테스트(퍼즐 등) 불가; 바이오메트릭/비밀번호 매니저 지원 |

**기존 AA 핵심 항목:**

- 색상 대비: 텍스트 4.5:1 (일반), 3:1 (큰 텍스트/UI)
- 키보드 내비게이션: 모든 기능 키보드로 접근 가능
- `prefers-reduced-motion`: 모든 전환 애니메이션에 미디어 쿼리 적용
- 스크린리더: ARIA role/label 일관성 (Radix UI 기반이면 대부분 자동 처리)

**그래프 접근성 특수 고려:**

- React Flow 그래프에 `aria-label="API 의존성 그래프"` 적용
- 키보드로 노드 탐색 가능하도록 (Tab으로 이동, Enter로 선택, Space로 확장)
- 시각적 Blast Radius 강조에 색상 외 패턴(점선, 두께)도 함께 사용 (색맹 대응)

### 6.2 i18n 초기 범위 권장

5000만 글로벌 사용자 목표를 고려한 단계적 국제화 전략 [#12]:

**Phase 1 (MVP):** 영어만. 코드에서 하드코딩 없이 `react-i18next` 키 구조로 작성만 해둠.

**Phase 2 (OSS 공개 직후):**
| 언어 | 이유 |
|:--|:--|
| 영어 (기본) | 글로벌 개발자 기준 언어 |
| 한국어 | 개발자(제작자 국가) + 바이브 코딩 활성 커뮤니티 |
| 일본어 | 아시아 개발자 도구 시장 2위 |
| 중국어 간체 | 시장 규모 |
| 포르투갈어 (브라질) | 라틴 아메리카 최대 바이브 코더 커뮤니티 |

**Phase 3 (Pro 구독 성장 시):** 스페인어, 독일어, 프랑스어

**RTL 대응:** Phase 2에서 제외(아랍어/히브리어). CSS `direction: rtl` 지원은 Tailwind에서 `dir="rtl"` 클래스 속성으로 처리 가능하나, 초기 유지보수 비용 대비 효과가 낮으므로 Phase 3 이후 재검토.

**권장 라이브러리:** `react-i18next` (22.2kB, 가장 큰 생태계, Tauri 앱에서 검증됨) [#12].

---

## 7. 디자인 시스템 후보

### Option A: "Security Minimal" — 보안 미니멀

**한 줄 톤**: Linear/Vercel/Infisical의 압축된 미학 + 보안 도구 신뢰감. 전문 개발자가 첫눈에 익숙하고 바이브 코더가 겁먹지 않는 균형.

#### 컴포넌트 라이브러리

- **shadcn/ui** (Radix UI 기반, copy-paste 방식) [#1, #2]
- 실제 Tauri 보일러플레이트 존재: `agmmnn/tauri-ui` (GitHub 1,500+ stars)
- 업데이트 방식: `shadcn@latest add` CLI로 컴포넌트별 독립 갱신
- Radix UI 원시(primitive) 위에 Tailwind 스타일링 → 접근성 자동 처리

#### 디자인 토큰 시스템

- Tailwind CSS v4 `@theme` CSS variables [#7]
- Radix Colors (30가지 색상 팔레트, 라이트/다크 자동 쌍 제공) [#14]
- 시맨틱 토큰 레이어: `--color-vault-accent`, `--color-vault-danger` 등 3단계 계층

#### 아이콘 세트

- **Lucide Icons** (1,450+ 아이콘, MIT, shadcn/ui 공식 권장 [#13])
- 단색 stroke 기반 → 다크/라이트 모드 모두 자연스럽게 적용
- 보조: 공급자 로고는 `simple-icons` (Stripe, OpenAI, GitHub 등 브랜드 아이콘)

#### 타이포그래피

- 본문: **Inter** (Variable Font, 가장 넓은 개발자 생태계 채택)
- 코드/API 키 표시: **JetBrains Mono** (0과 O 구별 최강, 보안 도구 적합)
- 조합 근거: Inter의 기하학적 합리성과 JetBrains Mono가 자연스럽게 짝을 이룬다는 디자인 커뮤니티 컨센서스 [#20]

#### 모션 라이브러리

- **Motion (구 Framer Motion)** — React용 공식 패키지는 `motion/react` [#21]
- 사용 범위: 페이지 전환, 사이드 패널 슬라이드, 카드 등장 (32kB gzip)
- `prefers-reduced-motion` 시스템 설정 자동 감지 후 애니메이션 비활성화
- 그래프 노드 전환: Motion의 `layout` 애니메이션으로 재배치 시 부드러운 이동

#### 그래프 노드 스타일

- React Flow `@xyflow/react` + dagre (MVP 레이아웃)
- 커스텀 노드: shadcn/ui `Card` 컴포넌트 기반으로 통일
- 상태 색상: Radix Colors의 `crimson`(위험), `amber`(주의), `green`(안전)

#### 바이브 코더 vs 전문 개발자 톤 조절

- **공통 컴포넌트, 다른 진입점**: 동일 컴포넌트에 `variant="compact"` (전문가) vs `variant="guided"` (바이브 코더) 분기
- **Progressive Disclosure**: 섹션 4.1 구조 그대로 적용
- **온보딩 레이어**: 바이브 코더용 드래그 앤 드롭 스캔 + 상태 카드를 기본으로, 전문가는 즉시 Graph 뷰로

#### 1인 유지보수 비용

- 업데이트 방식: 컴포넌트를 소유하므로 breaking change 없음 (장점)
- 단점: 새 컴포넌트 추가 시 직접 복사해야 함
- 커뮤니티: shadcn/ui GitHub 80,000+ stars, 매우 활발

#### 모바일·웹·데스크톱 공통성

- Tauri WebView, 모바일 WebView, 웹 브라우저 모두 동일 Tailwind/Radix 기반 작동
- CSS variables 기반 토큰은 플랫폼 무관

#### 패키지 목록

```
npm install @radix-ui/react-* lucide-react motion
npx shadcn@latest init
npx shadcn@latest add button card input dialog dropdown-menu ...
```

#### 레퍼런스 앱

- Infisical (shadcn/ui + Tailwind 기반 보안 대시보드)
- cal.com (오픈소스, shadcn/ui 대규모 사용 사례)
- `agmmnn/tauri-ui` 스타터 템플릿

#### 트레이드오프

- 장점: Tauri 보일러플레이트 검증됨, 접근성 자동, 디자인 품질 즉시 높음, 커스터마이징 자유도 최고
- 단점: 복잡한 데이터 테이블 구현 시 TanStack Table 별도 연동 필요, 컴포넌트 업데이트 수동

---

### Option B: "Warm Professional" — 따뜻한 프로슈머

**한 줄 톤**: 1Password 8+/Arc/Bitwarden Passwordless의 접근 가능한 미학. 보안을 무겁지 않게 느끼게 하는 따뜻한 색감, 두꺼운 여백, 둥근 모서리로 바이브 코더 친화성 극대화.

#### 컴포넌트 라이브러리

- **Mantine v7** (배터리 포함, 대시보드에 최적화) [#25]
- 내장: `useFocusTrap`, `useNotifications`, `useForm`, DataTable
- 번들: ~200kB (shadcn/ui보다 크지만 기능이 더 많음)
- Tauri 통합: React 환경이므로 완전 호환 (공식 Tauri 템플릿은 없으나 커뮤니티 예제 있음)

#### 디자인 토큰 시스템

- Mantine 자체 테마 시스템 (`createTheme()`)
- CSS variables 내보내기 지원 (`MantineProvider` > `cssVariablesResolver`)
- 멀티 디바이스 공유는 CSS variables로 가능하지만 Tailwind v4와 통합은 별도 작업 필요

#### 아이콘 세트

- **Phosphor Icons** (9,000+ 아이콘, 6가지 두께 변형) [#13]
- 두께 변형(regular/bold/duotone)이 "따뜻한 프로슈머" 톤을 잘 표현
- 바이브 코더에게는 `duotone` 스타일, 전문 개발자 뷰는 `regular` 스타일

#### 타이포그래피

- 본문: **Inter** (가독성 표준)
- UI 레이블: **Inter** (폰트 통일로 조화)
- 코드/키 표시: **IBM Plex Mono** (더 부드럽고 기업 친화적, 라틴아메리카 사용자에게 친숙)

#### 모션 라이브러리

- **Motion (구 Framer Motion)** 동일 사용
- Mantine 자체 transition API (`Transition` 컴포넌트) 활용으로 일관성 유지
- 더 많은 마이크로 인터랙션 (hover lift, 확장 애니메이션)

#### 그래프 노드 스타일

- React Flow 커스텀 노드를 Mantine `Paper` (elevation 기반) 컴포넌트로 구현
- 둥근 모서리 (`radius="md"`), 그림자 (`shadow="sm"`)로 "카드 느낌"
- 바이브 코더가 친숙해 할 UI 문법

#### 바이브 코더 vs 전문 개발자 톤 조절

- 바이브 코더용: 큰 아이콘, 명확한 CTA 버튼, 설명 문구 항상 표시
- 전문 개발자용: 밀도 높은 정보, 키보드 단축키 힌트 표시
- 두 모드 전환 버튼("Simple / Advanced View") 설정 화면에 배치

#### 1인 유지보수 비용

- 업데이트: npm 패키지 업데이트 (`npm update @mantine/*`) — 자동
- 단점: breaking change 가능성, Mantine 팀 결정에 의존
- 커뮤니티: GitHub 27,000+ stars, 활발하나 shadcn보다 작음

#### 모바일·웹·데스크톱 공통성

- Mantine은 반응형 설계 내장, 모바일 WebView에서도 작동
- CSS variables 추출 후 공유 가능

#### 패키지 목록

```
npm install @mantine/core @mantine/hooks @mantine/charts @mantine/notifications @phosphor-icons/react motion
```

#### 레퍼런스 앱

- Mantine 공식 대시보드 템플릿
- 다수의 SaaS 어드민 패널에서 사용

#### 트레이드오프

- 장점: 배터리 포함(알림, 폼 검증, 테이블 즉시 사용), 바이브 코더에게 친숙한 둥근 미학, 빠른 초기 개발 속도
- 단점: Tauri 공식 보일러플레이트 없음, 번들 크기 큼, 커스터마이징 자유도가 shadcn/ui보다 낮음, API Vault의 "보안 신뢰 톤"을 표현하기 약간 어려울 수 있음

---

### Option C: "Power Condensed" — 압축된 파워

**한 줄 톤**: Raycast/Maltego의 키보드 우선, 정보 조밀, 터미널 미학. 전문 개발자 페르소나 극대화. 바이브 코더는 명시적 "Simple Mode"로 분리.

#### 컴포넌트 라이브러리

- **Ark UI** (Chakra UI 팀의 헤드리스 컴포넌트, 45+ 컴포넌트) + 직접 스타일링 [#22]
- 또는: **Radix UI primitives** + 완전 자체 스타일링
- 스타일: Tailwind CSS v4 + `cva` (class-variance-authority)
- 특징: 최소한의 의존성, 완전한 디자인 통제권

#### 디자인 토큰 시스템

- Tailwind v4 `@theme` 완전 커스텀
- 다크 테마 전용 (라이트 테마는 선택적 제공)
- 조밀한 간격 (`--spacing-*` 토큰을 기본값보다 75% 수준으로 설정)

#### 아이콘 세트

- **Tabler Icons** (5,900+ 아이콘, 대시보드 특화, 가장 조밀한 스타일) [#13]
- 스트로크 기반, 조밀한 UI에 최적화
- 또는 **Lucide Icons** (Tabler보다 적지만 더 가벼움)

#### 타이포그래피

- 본문/UI: **Geist** (Vercel 디자인 팀 제작, 터미널 미학) or **Inter**
- 코드/API 키/모든 시크릿 값 표시: **JetBrains Mono** (가장 강한 코드 가독성)
- 바이브 코더 모드에서는 Geist Sans로 전환 (더 부드러운 느낌)

#### 모션 라이브러리

- **Motion One** (3.8kB, WAAPI 기반) [#21] — 최소 번들
- 또는 CSS-only transition (성능 최우선)
- 이유: 파워 유저는 애니메이션보다 속도를 선호. 모션을 최소화.

#### 그래프 노드 스타일

- React Flow 커스텀 노드: 패딩 최소화, 정보 밀도 높음
- 배경: 진한 다크(#0a0a0b), 노드 배경: #1a1a1e
- 텍스트: 모노스페이스 폰트 사용 (JetBrains Mono로 키 값 일부 표시)

#### 바이브 코더 vs 전문 개발자 톤 조절

- **두 가지 명확히 분리된 모드**: "Pro Mode" (기본) / "Simple Mode" (온보딩 스위치)
- Simple Mode: 기능 제한 + 큰 버튼 + 설명 문구
- Pro Mode: 조밀한 정보, 키보드 단축키, Command Palette 중심

#### 1인 유지보수 비용

- 업데이트: 헤드리스 라이브러리는 breaking change 드묾
- 단점: 초기 구현 비용이 가장 높음 (모든 스타일을 직접 작성)
- 커뮤니티: Ark UI GitHub 4,000 stars (성장 중), Radix UI 더 성숙

#### 모바일·웹·데스크톱 공통성

- 조밀한 UI가 모바일에서는 불편할 수 있음 — 모바일은 Simple Mode 기본 강제
- CSS variables 공유 구조는 동일

#### 패키지 목록

```
npm install @ark-ui/react @tabler/icons-react motion class-variance-authority
# 또는
npm install @radix-ui/react-* @tabler/icons-react
```

#### 레퍼런스 앱

- Raycast (macOS 앱, 조밀한 Command Palette 중심)
- Maltego (보안 그래프 분석 도구)
- Linear (개발자 프로젝트 관리)

#### 트레이드오프

- 장점: 전문 개발자 최고의 경험, 최소 번들, 디자인 완전 통제
- 단점: 초기 구현 비용 가장 높음, 바이브 코더 경험 별도 설계 필요, Ark UI 커뮤니티 규모 작음, 1인 유지보수 부담 가장 큼

---

## 8. 최종 비교표 & 잠정 추천

### 8.1 비교표

| 기준                | Option A (Security Minimal)   | Option B (Warm Professional) | Option C (Power Condensed) |
| :------------------ | :---------------------------- | :--------------------------- | :------------------------- |
| 전문 개발자 경험    | 높음                          | 중간                         | 최고                       |
| 바이브 코더 접근성  | 높음 (Progressive Disclosure) | 최고                         | 낮음 (별도 모드 필요)      |
| 초기 개발 속도      | 빠름                          | 가장 빠름                    | 느림                       |
| Tauri 검증          | 검증됨 (boilerplate 존재)     | 커뮤니티 수준                | 없음                       |
| 번들 크기           | 작음 (copy-paste)             | 큼 (Mantine ~200kB)          | 가장 작음                  |
| 1인 유지보수 비용   | 낮음-중간                     | 낮음                         | 높음                       |
| 접근성 (A11y)       | 자동 (Radix 기반)             | 자동 (Mantine 내장)          | 수동 (직접 구현 필요)      |
| 디자인 일관성       | 높음                          | 높음                         | 구현 의존                  |
| 커뮤니티 규모       | 80,000+ stars                 | 27,000+ stars                | 4,000+ stars (Ark UI)      |
| "보안 신뢰 톤" 표현 | 우수                          | 보통                         | 우수                       |
| 모바일 적합성       | 높음                          | 높음                         | 중간 (조밀함 문제)         |

### 8.2 잠정 추천: Option A (Security Minimal)

**추천 근거:**

1. **Tauri + shadcn/ui 조합 검증됨**: `agmmnn/tauri-ui` 보일러플레이트가 이미 존재하고 검증됐다. 1인 개발자가 처음부터 설계하는 시간을 절약한다.

2. **두 페르소나 동시 만족의 최적 균형**: shadcn/ui는 "보안 도구"의 신뢰감 있는 미학(깔끔, 정밀)을 제공하면서, Progressive Disclosure 패턴을 통해 바이브 코더에게도 접근 가능하다. Mantine처럼 너무 "친근"하지 않고, Ark UI처럼 너무 어렵지 않은 중간점.

3. **1인 운영 최적**: 컴포넌트를 소유하므로 라이브러리 breaking change 걱정 없음. 커뮤니티가 가장 크므로 문제 해결 리소스 풍부.

4. **Radix Colors + Tailwind v4 시너지**: Radix Colors의 자동 다크/라이트 팔레트와 Tailwind v4의 CSS variables가 결합되면, 멀티 플랫폼(데스크톱/모바일/웹) 토큰 공유가 가장 매끄럽다.

5. **접근성 자동 처리**: Radix UI primitives 기반이므로 WCAG 2.2 AA의 키보드 내비게이션, ARIA 속성이 대부분 자동 처리된다. 1인 개발자가 접근성에 별도 시간을 투자할 필요가 최소화된다.

**Option B 대신 A를 선택하는 이유**: API Vault는 "보안 도구"이므로 Mantine의 "따뜻한 프로슈머" 톤이 자칫 신뢰도를 약화시킬 수 있다. 또한 번들 크기가 Tauri 데스크톱에서는 덜 중요하지만 웹 대시보드와 모바일 WebView에서는 부담이 된다.

**Option C 대신 A를 선택하는 이유**: 1인 개발자가 초기 구현 비용을 최소화해야 한다. Option C는 모든 스타일을 직접 작성해야 하므로 MVP 속도가 느리다. 바이브 코더 경험을 별도로 설계하는 이중 비용도 발생한다.

### 8.3 혼합 전략 (Option A 채택 시 보완)

Option A를 기반으로 Option C의 장점을 선택적으로 채용:

- **Cmd+K Command Palette**: `cmdk` 라이브러리 (shadcn/ui와 통합 가이드 공식 제공) — 전문 개발자용 키보드 퍼스트 필수 기능
- **조밀한 Graph 뷰**: Graph 화면만큼은 Option C의 "파워 컨덴스드" 미학 적용 (노드 패딩 축소, 더 많은 정보 표시)
- **Simple Mode 토글**: 바이브 코더를 위한 "Guided Mode" 스위치 (첫 실행 시 기본 활성화, 이후 전환 가능)

---

## 9. 출처

| #   | URL                                                                                                                                               | 요약                                             | 수집일     | 신뢰도 |
| :-- | :------------------------------------------------------------------------------------------------------------------------------------------------ | :----------------------------------------------- | :--------- | :----- |
| #1  | https://github.com/agmmnn/tauri-ui                                                                                                                | Tauri + shadcn/ui 공식 스타터 보일러플레이트     | 2026-04-22 | HIGH   |
| #2  | https://www.untitledui.com/blog/react-component-libraries                                                                                         | React UI 컴포넌트 라이브러리 2026 비교           | 2026-04-22 | HIGH   |
| #3  | https://midrocket.com/en/guides/ui-design-trends-2026/                                                                                            | UI/UX 트렌드 2026 전체 가이드                    | 2026-04-22 | MEDIUM |
| #4  | https://blog.logrocket.com/ux-design/linear-design/                                                                                               | Linear 디자인 트렌드 분석                        | 2026-04-22 | HIGH   |
| #5  | https://cyberinsider.com/password-manager/comparison/1password-vs-bitwarden/                                                                      | 1Password vs Bitwarden 2026 비교                 | 2026-04-22 | MEDIUM |
| #6  | https://www.techtimes.com/articles/314988/20260311/best-password-manager-apps-2026-1password-vs-bitwarden-vs-dashlane-cross-platform-security.htm | 비밀번호 관리자 크로스 플랫폼 비교               | 2026-04-22 | MEDIUM |
| #7  | https://tailwindcss.com/blog/tailwindcss-v4                                                                                                       | Tailwind CSS v4 공식 릴리즈 노트                 | 2026-04-22 | HIGH   |
| #8  | https://blog.logrocket.com/ux-design/progressive-disclosure-ux-types-use-cases/                                                                   | Progressive Disclosure UX 패턴                   | 2026-04-22 | HIGH   |
| #9  | https://lollypop.design/blog/2025/may/progressive-disclosure/                                                                                     | SaaS UX에서의 Progressive Disclosure             | 2026-04-22 | MEDIUM |
| #10 | https://www.w3.org/TR/WCAG22/                                                                                                                     | WCAG 2.2 공식 명세                               | 2026-04-22 | HIGH   |
| #11 | https://www.levelaccess.com/blog/wcag-2-2-aa-summary-and-checklist-for-website-owners/                                                            | WCAG 2.2 AA 체크리스트 2026                      | 2026-04-22 | HIGH   |
| #12 | https://intlpull.com/blog/react-i18next-internationalization-guide-2026                                                                           | react-i18next 완전 가이드 2026                   | 2026-04-22 | MEDIUM |
| #13 | https://www.shadcndesign.com/blog/5-best-icon-libraries-for-shadcn-ui                                                                             | shadcn/ui 최적 아이콘 라이브러리 5종 비교        | 2026-04-22 | MEDIUM |
| #14 | https://www.radix-ui.com/colors                                                                                                                   | Radix Colors 공식 문서                           | 2026-04-22 | HIGH   |
| #15 | https://www.designmonks.co/blog/how-ux-design-can-improve-cybersecurity                                                                           | UX 디자인과 사이버보안 신뢰 구축                 | 2026-04-22 | MEDIUM |
| #16 | https://blog.mozilla.org/ux/2019/03/designing-better-security-warnings/                                                                           | Mozilla Firefox UX: 보안 경고 디자인             | 2026-04-22 | HIGH   |
| #17 | https://reactflow.dev/examples/layout/dagre                                                                                                       | React Flow dagre 레이아웃 공식 예제              | 2026-04-22 | HIGH   |
| #18 | https://reactflow.dev/learn/advanced-use/performance                                                                                              | React Flow 성능 최적화 공식 문서                 | 2026-04-22 | HIGH   |
| #19 | https://cambridge-intelligence.com/graph-visualization-ux-how-to-avoid-wrecking-your-graph-visualization/                                         | 그래프 시각화 UX 베스트 프랙티스                 | 2026-04-22 | HIGH   |
| #20 | https://x.com/guerriero_se/status/1796544885962711507                                                                                             | Geist Mono / IBM Plex Mono / JetBrains Mono 비교 | 2026-04-22 | MEDIUM |
| #21 | https://motion.dev/blog/should-i-use-framer-motion-or-motion-one                                                                                  | Motion One vs Framer Motion 공식 비교            | 2026-04-22 | HIGH   |
| #22 | https://github.com/chakra-ui/ark                                                                                                                  | Ark UI 헤드리스 컴포넌트 GitHub                  | 2026-04-22 | HIGH   |
| #23 | https://makersden.io/blog/react-ui-libs-2025-comparing-shadcn-radix-mantine-mui-chakra                                                            | React UI 라이브러리 심층 비교 2025               | 2026-04-22 | HIGH   |
| #24 | https://dev.to/devforgedev/why-i-chose-mantine-over-shadcnui-for-every-dashboard-project-5fd0                                                     | Mantine vs shadcn/ui 대시보드 프로젝트 비교      | 2026-04-22 | MEDIUM |
| #25 | https://saasindie.com/blog/mantine-vs-shadcn-ui-comparison                                                                                        | Mantine vs shadcn/ui 2026 완전 비교              | 2026-04-22 | MEDIUM |
| #26 | https://reactflow.dev/examples/layout/elkjs                                                                                                       | React Flow ELK 레이아웃 공식 예제                | 2026-04-22 | HIGH   |

---

_이 문서는 user_research/initial_idea.md, user_research/gemini_deep_research_apivault.md, docs/research_raw.md를 Tier 1 출처로 참조하였으며, 신규 웹 서치 결과를 추가 보완하였다._
