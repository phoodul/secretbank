# Phase 3-A Integrator Report — 신용카드 (Credit Card) credential kind 추가

> 통합 일자: 2026-05-07
> Researcher 입력: `docs/ux_research_phase3.md` §1 (1P/BW 분석) + §6 Phase 3-A 권고
> 보안 입력: `docs/THREAT_MODEL.md` §4 (Phase 3-A 추가 위협)
> 결정 기반: `docs/project-decisions.md` [2026-05-07] B.1 (보안 절대 우선 10항목) + B.5 (Phase 3-A 보안 룰) + F.2 (UX Spec)
> 작성자: Integrator Agent (claude-sonnet-4-6)
> ⚠️ 본 보고서의 보안 권고는 LLM 작성 한계를 가짐 — 출시 전 외부 보안 감사 1회 필수 (B.4 항목 재확인)

---

## 0. 요약 (Executive Summary)

Phase 3-A 는 API Vault 에 신용카드(Credit Card) 를 새로운 `CredentialKind` 로 추가하는 작업이다. 현재 `CredentialKind` 는 `ApiKey` / `Password` 두 종류이며, Phase 3-A 를 통해 `CreditCard` 가 추가된다.

1Password 대비 핵심 격차를 메우는 작업으로, 실물 카드 시각화(3D flip) + BIN 자동 감지 + 필드별 마스킹 + 별도 reveal Tauri command 의 네 가지 핵심 차별화 요소가 구현 대상이다. Bitwarden 이 카드 마스킹 부재로 반복 지적을 받는 점을 감안하면, 보안 마스킹 기본 적용은 우리의 강점이 된다.

작업은 6개 sub-task 로 분할된다:
- **3-A-1**: Rust 모델 확장 + DB 마이그레이션 0012 (2~3 commits 예상)
- **3-A-2**: BIN 감지 + 카드 유틸 (frontend `src/lib/card-utils.ts`) (1 commit)
- **3-A-3**: `CreditCardVisual` 컴포넌트 (3D flip, Motion, prefers-reduced-motion) (2 commits)
- **3-A-4**: `CreditCardForm` 등록/편집 폼 + 입력 마스크 (2 commits)
- **3-A-5**: `CreditCardDetail` 상세 뷰 + `reveal_card_number` / `reveal_cvc` Tauri command (2~3 commits)
- **3-A-6**: BentoCard 통합 + i18n 4 로케일 + Vitest (2 commits)

총 예상 커밋: **11~13 commits**. 보안 critical 검증 필요 항목 5개 (USER APPROVAL GATE 2 §5 참조).

---

## 1. CRAAP 평가 (신용카드 관련 출처)

신용카드 구현 관련 6개 출처를 평가한다. 각 항목은 Currency(최신성) / Relevance(관련성) / Authority(권위성) / Accuracy(정확성) / Purpose(목적 편향성) 5점 만점 기준.

---

### 출처 1: `https://support.1password.com/item-categories/`
1Password 22종 카테고리 목록 및 설명

| 기준 | 점수 | 근거 |
|:---|:---|:---|
| Currency | 5 | 1Password 8 최신 버전 문서, 정기 갱신 |
| Relevance | 5 | Credit Card 카테고리 필드 구조 직접 명시 |
| Authority | 5 | 1Password 공식 지원 문서 |
| Accuracy | 4 | 필드 목록이 실제 앱과 일치 (PIN / 청구주소 포함 확인) |
| Purpose | 5 | 순수 기술 문서, 마케팅 의도 없음 |

**총점: 24/25 — HIGH 신뢰도**

신뢰 세부 사항: "Credit Card: Stores payment details including card numbers, verification codes, and expiry dates" 서술은 고수준 요약이며 필드 목록을 완전히 나열하지는 않으나, 실제 앱 관찰과 결합하면 충분히 신뢰 가능.

---

### 출처 2: `https://community.bitwarden.com/t/credit-card-default-fields-are-not-hidden-or-no-option-for-toggle/291`
Bitwarden 카드 마스킹 부재 지적 (커뮤니티)

| 기준 | 점수 | 근거 |
|:---|:---|:---|
| Currency | 3 | 이슈 #173, 정확한 날짜 불명. 2026.1.x 에서 부분 개선 중 |
| Relevance | 5 | 카드 번호 / CVC 마스킹 부재 — 우리 설계에서 차별화할 정확한 사례 |
| Authority | 3 | 커뮤니티 포럼 (비공식) |
| Accuracy | 4 | 복수 사용자 동일 지적. `community.bitwarden.com` 포럼 #173 cross-reference |
| Purpose | 4 | 기능 개선 요청, 경쟁사 공격 의도 없음 |

**총점: 19/25 — MEDIUM 신뢰도**

신뢰 세부 사항: 이슈 내용 자체는 신뢰할 수 있으나 최신 버전(2026.1.x) 에서 부분 개선 가능성 있으므로, 구현 시 "마스킹 기본 적용" 이 여전히 차별화 요소인지 검증 권고.

---

### 출처 3: `https://community.bitwarden.com/t/request-standardize-credit-card-number-format-across-viewing-and-editing/57741`
Bitwarden 카드 번호 포맷 요청 (커뮤니티)

| 기준 | 점수 | 근거 |
|:---|:---|:---|
| Currency | 3 | 날짜 불명 (커뮤니티 요청) |
| Relevance | 4 | 4자리 그룹핑 / Amex 4-6-5 패턴 구현의 필요성 간접 확인 |
| Authority | 3 | 커뮤니티 (비공식) |
| Accuracy | 3 | 단수 요청 스레드, cross-reference 미확인 |
| Purpose | 4 | 기능 개선 목적 |

**총점: 17/25 — MEDIUM 신뢰도**

신뢰 세부 사항: 4-4-4-4 그룹핑 / Amex 4-6-5 는 산업 표준이므로 이 출처에 의존하기보다 BIN 표 (ISO/IEC 7812) 에 근거해야 한다.

---

### 출처 4: `https://www.shadcn.io/components/finance/credit-card`
shadcn/ui 신용카드 컴포넌트 (flip 포함)

| 기준 | 점수 | 근거 |
|:---|:---|:---|
| Currency | 5 | shadcn/ui 공식 컴포넌트, 2025~2026 활발 유지보수 |
| Relevance | 5 | CSS perspective + rotateY flip 패턴, oklch 그레이디언트 직접 적용 가능 |
| Authority | 5 | shadcn/ui 공식 레지스트리 (우리 스택의 핵심) |
| Accuracy | 5 | 코드 직접 확인 가능 (copy-paste 방식) |
| Purpose | 5 | 순수 컴포넌트 제공, 광고 없음 |

**총점: 25/25 — HIGH 신뢰도**

신뢰 세부 사항: shadcn/ui 컴포넌트는 우리 스택(shadcn New York + Tailwind v4)과 정확히 정합. flip 애니메이션 베이스로 직접 채택 권고.

---

### 출처 5: `https://motion.dev/docs/react-transitions`
Motion 라이브러리 spring transition 문서

| 기준 | 점수 | 근거 |
|:---|:---|:---|
| Currency | 5 | motion.dev 공식 문서, 활발한 유지보수 |
| Relevance | 5 | 3D flip 애니메이션에 직접 사용. 프로젝트에 이미 채택된 라이브러리 |
| Authority | 5 | Framer Motion 제작팀 공식 문서 |
| Accuracy | 5 | 공식 문서 — API 정확도 최상 |
| Purpose | 5 | 순수 기술 문서 |

**총점: 25/25 — HIGH 신뢰도**

---

### 출처 6: `https://alexn.org/blog/2024/08/20/1password-vs-bitwarden/`
1P vs BW 상세 UX 비교 (개인 블로그)

| 기준 | 점수 | 근거 |
|:---|:---|:---|
| Currency | 4 | 2024년 8월, 비교적 최근 |
| Relevance | 4 | 카드 마스킹 / BIN 감지 UX 패턴 비교 관점 제공 |
| Authority | 2 | 개인 블로그, 작성자 배경 미확인 |
| Accuracy | 3 | 공식 문서 cross-reference 미확인. 주관적 평가 포함 |
| Purpose | 3 | 개인 의견 포함, 특정 제품 선호 가능성 |

**총점: 16/25 — MEDIUM 신뢰도**

신뢰 세부 사항: UX 비교의 맥락 이해에 유용하나, 구체적 구현 사양은 공식 문서(1Password support, shadcn) 에 근거해야 함.

---

### CRAAP 요약

| 출처 | 총점 | 신뢰도 | 비고 |
|:---|:---|:---|:---|
| 1Password 공식 카테고리 문서 | 24/25 | HIGH | 필드 구조 근거 |
| shadcn/ui credit-card 컴포넌트 | 25/25 | HIGH | flip 구현 베이스 |
| Motion 공식 문서 | 25/25 | HIGH | 애니메이션 사양 근거 |
| Bitwarden 커뮤니티 마스킹 이슈 | 19/25 | MEDIUM | 차별화 근거 (최신 버전 검증 권고) |
| Bitwarden 커뮤니티 포맷 요청 | 17/25 | MEDIUM | 참고 용도 (ISO 7812 우선) |
| 개인 블로그 UX 비교 | 16/25 | MEDIUM | 맥락 이해 용도만 |

**BIN prefix 표 정확성 추가 검증**: `ux_research_phase3.md` §1.1 에 명시된 BIN prefix 범위(Visa 4 / Mastercard 51-55 + 2221-2720 / Amex 34/37 / Discover 6011 + 622126-622925 + 64-65 / JCB 3528-3589 / Diners 36/38 + 300-305)는 ISO/IEC 7812-1 표준에 부합하나, **Discover 범위 `622126–622925` 와 연구 문서 `622126–622925`** 사이에 오탈자 가능성이 있다. Implementator 가 Wikipedia IIN Ranges 또는 Mastercard / Visa 공식 BIN 문서를 1회 교차 확인해야 한다 (→ R1 위험 참조).

**Amex 15자리 그룹핑 검증**: 4-6-5 그룹핑은 ISO 7813 기준 올바름. `•••• •••••• •5678` 형식이 맞다.

---

## 2. THREAT_MODEL §4 정합성 검증

`docs/THREAT_MODEL.md` §4 Phase 3-A 추가 위협 4개 항목이 sub-task 사양에 어떻게 반영되는지 검증한다.

| 위협 (THREAT_MODEL §4) | 위협 설명 | 완화책 | Phase 3-A 사양 반영 sub-task |
|:---|:---|:---|:---|
| **카드번호 부분 노출** | UI 마스킹 우회 시 16자리 노출 | `valueHint` 마지막 4자만 frontend 전달; full reveal 시 별도 Tauri command + audit log + 30초 자동 클리어 | **3-A-1** (Rust 모델 `last_4` 필드) + **3-A-5** (`reveal_card_number` command, 30s 클리어) |
| **BIN 자동 감지 시 노출** | BIN 6자리가 frontend 로 전송되면 추가 정보 노출 가능 | prefix 6자만 frontend 로 전송. brand 결정에는 prefix 1~2자로 충분하나, 표준 BIN은 6자리 사용 | **3-A-2** (card-utils.ts 의 `detectBrand()` — 입력은 raw cardNumber, 내부에서 prefix 6자 추출. DB 에는 brand enum만 저장) |
| **3D flip 애니메이션 중 평문 노출** | rotateY 진행 중 카드 앞/뒷면 모두 잠시 보임 | 마스킹 상태에서는 flip 금지. reveal 한 상태에서만 flip 허용 | **3-A-3** (`CreditCardVisual` — `flipped` prop 은 `cvcRevealed` 상태가 true 일 때만 활성화) |
| **screenshot 캡처** | 화면 녹화 / OS screenshot 으로 평문 카드번호 또는 CVC 캡처 | 향후 macOS `NSWindow secureView` / Windows DRM — **Phase 3-A 미구현, 잔여 위험 R2** | **3-A-6** placeholder 주석 추가 (R2) |

### 추가 확인 — §3.4 Information Disclosure 와 연계

| THREAT_MODEL §3.4 항목 | Phase 3-A 연계 완화 |
|:---|:---|
| `Phase 3-A CVC — reveal 후 자동 hide` | **3-A-5**: 30초 타이머 + `useEffect` cleanup on unmount |
| `Phase 3-A 카드번호 — full 16자리 frontend 전송` | **3-A-1 + 3-A-5**: `CredentialSummary` 에 `last_4` 만, reveal 시 별도 command |
| `TB2 IPC payload — 평문 통과 금지` | **3-A-1**: `CreditCardSummary` 에 card_number 평문 미포함. B.1-3 확인 |

---

## 3. B.1 + B.5 정합성 검증

`docs/project-decisions.md` [2026-05-07] B.1 10항목 및 B.5 Phase 3-A 추가 룰 5항목이 각 sub-task 에서 어떻게 충족되는지 명시한다.

### B.1 매 implementator 호출 적용 사항 (10항목)

| B.1 항목 | 내용 | Phase 3-A 반영 sub-task + 방법 |
|:---|:---|:---|
| **B.1-1** | 암호학 직접 구현 금지 — 검증된 라이브러리만 | 3-A-1: `age` vault encryption 변경 없음. 신용카드 secret 도 동일 age vault 통과 |
| **B.1-2** | 평문 메모리 시간 최소화 — `SecretBox` + `Zeroizing` | 3-A-1: `CreditCardSecret` 구조체에 `card_number: secrecy::Secret<String>`, `cvc: secrecy::Secret<String>`, `pin: Option<secrecy::Secret<String>>` |
| **B.1-3** | 평문 IPC 미통과 — `valueHint` 마지막 4자만 | 3-A-1: `CreditCardSummary.last_4` (마지막 4자), 3-A-5: reveal command 응답만 평문 |
| **B.1-4** | Input 신뢰 0 — fuzz-safe, malformed input 으로 panic 없음 | 3-A-1: 카드번호 파서에 길이 검증 (13~19자리), non-digit 제거 (replace). 3-A-4: Zod schema 검증 |
| **B.1-5** | Tauri capability deny-by-default | 3-A-5: `reveal_card_number` / `reveal_cvc` capability 등록 필수. `default.json` 에 추가 |
| **B.1-6** | 모든 secret 작업 audit log | 3-A-5: `reveal_card_number` / `reveal_cvc` 호출 시 audit log `action="card_number_revealed"` / `action="cvc_revealed"` 기록 |
| **B.1-7** | dependency 보안 검사 자동 | 3-A-4: `react-number-format` 또는 `imask` 채택 시 pnpm audit 확인. 신규 Rust crate 없음 (age 재사용) |
| **B.1-8** | secret scanning 자기 적용 | 기존 pre-commit hook 유지. 3-A-4 폼 구현 시 테스트 카드 번호 하드코딩 금지 (fixture 에 `4111111111111111` 류 사용 가능, 실 카드번호 절대 금지) |
| **B.1-9** | error message 누설 방지 | 3-A-5: reveal 실패 시 "카드 정보를 불러올 수 없습니다." (credential ID / vault path 미노출) |
| **B.1-10** | timing-safe 비교 (`subtle::ConstantTimeEq`) | 3-A-1: CVC 비교가 발생하는 경우(검증 로직) 에는 `ConstantTimeEq` 사용. Phase 3-A 에서는 CVC 비교 로직 없음 — 저장 전용이므로 해당 없음. 다만 미래 검증 로직 추가 시 주의 사항 문서화 |

### B.5 Phase 3-A 추가 보안 룰 (5항목)

| B.5 항목 | 내용 | 반영 sub-task + 구체 방법 |
|:---|:---|:---|
| **B.5-1** | 카드번호 + CVC = `SecretBox<String>` + `Zeroizing` 즉시 래핑 | 3-A-1: `CreditCardSecret { card_number: Secret<String>, cvc: Secret<String>, pin: Option<Secret<String>> }`. `expose_secret()` 은 vault save 직전 단일 블록에서만 |
| **B.5-2** | CVC reveal 30초 자동 클리어 | 3-A-5: `reveal_cvc` command 응답 후 frontend `useEffect` 에 30s 타이머. unmount 시 `clearTimeout` |
| **B.5-3** | 카드번호 마스킹 frontend `valueHint` 마지막 4자만 | 3-A-1: `CreditCardSummary.last_4: String` (DB 평문, 마지막 4자). `card_number` 평문은 `CreditCardSummary` 에 없음 |
| **B.5-4** | 별도 SQLite 테이블 (옵션 Y) — vault encryption 동일 (age) — vault unlock 시에만 디크립트 | 3-A-1: `credit_card_meta` 테이블 (brand / expiry_month / expiry_year / cardholder_name 평문 메타). 암호화 필드(card_number / cvc / pin)는 age vault에 `credentials/<id>/card_number` 경로로 저장 |
| **B.5-5** | BIN 감지 prefix 6자만, full hash 미사용 | 3-A-2: `detectBrand(cardNumber)` 는 `cardNumber.slice(0, 6)` 만 사용. DB 저장 없음. HIBP-style hash 전송 없음 (신용카드는 HIBP 적용 범위 외) |

---

## 4. Sub-task 분할

6개 sub-task 로 분할. Backend → Frontend 순서 준수. 각 sub-task 는 독립 커밋 가능 단위.

---

### 4.1 Phase 3-A-1: `CredentialKind::CreditCard` + DB 마이그레이션 0012 + Rust 모델

**목표**: 신용카드 kind 를 Rust 타입 시스템과 DB 스키마에 추가. Frontend 는 이 단계에서 `last_4` + `brand` 메타만 받을 수 있게 됨.

**대상 파일**:
- `src-tauri/crates/api-vault-core/src/models/credential.rs` — `CredentialKind::CreditCard` 추가
- `src-tauri/crates/api-vault-core/src/models/credit_card.rs` (신규) — `CreditCardMeta`, `CreditCardSummary`, `CreditCardSecret`, `CreditCardInput` 구조체
- `src-tauri/crates/api-vault-storage/migrations/0012_credit_card.sql` (신규)
- `src-tauri/crates/api-vault-storage/src/sqlite/repositories/credit_card.rs` (신규)
- `src-tauri/crates/api-vault-storage/src/sqlite/repositories/mod.rs` — 모듈 등록

**DB 스키마 (0012_credit_card.sql)**:

```sql
-- Migration 0012: Credit Card kind support
-- credit_card_meta: 신용카드 평문 메타데이터 (브랜드 / 만료 / 소유자명)
-- 암호화 필드 (card_number / cvc / pin) 는 age vault 에 별도 경로로 저장
-- credential.kind = 'credit_card' 인 행과 1:1 관계

CREATE TABLE IF NOT EXISTS credit_card_meta (
    credential_id   TEXT PRIMARY KEY NOT NULL,
    brand           TEXT NOT NULL DEFAULT 'unknown',
    -- 'visa' | 'mastercard' | 'amex' | 'discover' | 'jcb' | 'diners' | 'unknown'
    expiry_month    INTEGER NOT NULL,   -- 1-12
    expiry_year     INTEGER NOT NULL,   -- 4자리 (예: 2028)
    cardholder_name TEXT,               -- 선택 (평문, 마스킹 불필요)
    billing_address TEXT,               -- 선택 (평문 JSON 또는 단순 문자열)
    last_4          TEXT NOT NULL,      -- 카드번호 마지막 4자 (평문 표시용)
    created_at      TEXT NOT NULL,      -- ISO8601
    updated_at      TEXT NOT NULL,      -- ISO8601
    FOREIGN KEY (credential_id) REFERENCES credential(id) ON DELETE CASCADE
);

-- kind 필터 인덱스는 0006 migration 에 이미 존재 (idx_credential_kind)
```

**Rust 구조체 설계**:

```rust
// src-tauri/crates/api-vault-core/src/models/credit_card.rs

/// 신용카드 브랜드 enum
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum CardBrand {
    Visa,
    Mastercard,
    Amex,
    Discover,
    Jcb,
    Diners,
    #[default]
    Unknown,
}

/// credit_card_meta 테이블 평문 메타데이터
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CreditCardMeta {
    pub credential_id: CredentialId,
    pub brand: CardBrand,
    pub expiry_month: u8,        // 1-12
    pub expiry_year: u16,        // 4자리
    pub cardholder_name: Option<String>,
    pub billing_address: Option<String>,
    pub last_4: String,          // 평문, IPC 통과 가능
}

/// Frontend 에 전달하는 요약 (평문 secret 없음 — B.1-3 준수)
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CreditCardSummary {
    pub credential_id: CredentialId,
    pub brand: CardBrand,
    pub expiry_month: u8,
    pub expiry_year: u16,
    pub cardholder_name: Option<String>,
    pub last_4: String,
    // card_number 평문 없음. cvc 없음. pin 없음.
}

/// Vault 저장/로드 시 사용하는 암호화 대상 구조체
/// secrecy::Secret<String> 은 Drop 시 자동 zeroize
pub struct CreditCardSecret {
    pub card_number: secrecy::Secret<String>,
    pub cvc: secrecy::Secret<String>,
    pub pin: Option<secrecy::Secret<String>>,
}

/// 등록 입력 (frontend → backend)
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CreditCardInput {
    pub issuer_id: IssuerId,
    pub name: String,
    pub brand: CardBrand,
    pub expiry_month: u8,
    pub expiry_year: u16,
    pub cardholder_name: Option<String>,
    pub billing_address: Option<String>,
    pub last_4: String,
    // 암호화 대상: frontend 에서 받아 즉시 SecretBox 래핑 후 vault 저장
    pub card_number_plain: String,
    pub cvc_plain: String,
    pub pin_plain: Option<String>,
}
```

**의존성**: 기존 `secrecy` crate (이미 Cargo.toml 에 포함 여부 확인 필요 — 없으면 추가)

**테스트 (Rust)**:
- `credit_card_meta` CRUD (insert / get / update / delete cascade)
- `last_4` 추출 로직 (16자리 → 마지막 4자, 15자리 Amex → 마지막 4자)
- `CreditCardSecret` drop 후 메모리 zeroize (zeroize crate 기능 테스트)

**DoD (완료 기준)**:
- `cargo test` 통과
- `cargo clippy -- -D warnings` 0 경고
- `CredentialKind::CreditCard` serde 직렬화 `"credit_card"` 확인
- 0012 migration 적용 후 기존 0011 데이터 영향 없음 확인

**F.2 Spec 적용**: 이 sub-task 는 backend 전용이므로 F.2 UX 항목 해당 없음.

**Security 적용**: B.5-1 (SecretBox), B.5-3 (last_4 만), B.5-4 (별도 테이블 + age vault)

**THREAT_MODEL 완화**: 카드번호 부분 노출 — `CreditCardSummary` 에 `last_4` 만 포함.

---

### 4.2 Phase 3-A-2: BIN 감지 + 카드 유틸 (`src/lib/card-utils.ts`)

**목표**: Frontend 전용 카드 유틸리티 모듈 구축. BIN prefix → brand 감지, 카드사별 oklch 그레이디언트 정의, 번호 포맷팅(4-4-4-4 / 4-6-5).

**대상 파일**:
- `src/lib/card-utils.ts` (신규)
- `src/lib/card-utils.test.ts` (신규 — Vitest)

**함수 설계**:

```typescript
// src/lib/card-utils.ts

export type CardBrand =
  | "visa"
  | "mastercard"
  | "amex"
  | "discover"
  | "jcb"
  | "diners"
  | "unknown";

/**
 * BIN prefix 6자로 카드 브랜드 감지.
 * B.5-5: prefix 6자만 사용. 전체 번호 전달해도 내부에서 slice(0,6) 만 참조.
 */
export function detectBrand(cardNumber: string): CardBrand;

/**
 * 카드사별 oklch 그레이디언트 토큰.
 * 하드코딩 hex 금지 (F.2-1). oklch() 함수로 CSS custom property 로 정의.
 */
export function getBrandGradient(brand: CardBrand): {
  from: string; // oklch(...)
  to: string;   // oklch(...)
};

/**
 * 원시 숫자 → 그룹핑 포맷 (공백 구분).
 * Amex: "4-6-5" → "1234 567890 12345"
 * 기타: "4-4-4-4" → "1234 5678 9012 3456"
 */
export function formatCardNumber(raw: string, brand: CardBrand): string;

/**
 * 표시용 마스킹 (마지막 4자리만 노출).
 * Amex: "•••• •••••• •2345"
 * 기타: "•••• •••• •••• 1234"
 */
export function maskCardNumber(last4: string, brand: CardBrand): string;
```

**BIN prefix 표 (하드코딩, DB 조회 없음)**:

| Brand | Prefix 규칙 |
|:---|:---|
| Visa | `4` (첫 자리) |
| Mastercard | `51`~`55` 또는 `2221`~`2720` |
| Amex | `34` 또는 `37` |
| Discover | `6011`, `622126`~`622925`, `64`~`65` |
| JCB | `3528`~`3589` |
| Diners | `36`, `38`, `300`~`305` |

⚠️ Implementator 는 Discover BIN 범위 `622126–622925` 를 Wikipedia IIN Ranges 또는 Discover 공식 문서와 1회 교차 확인해야 한다 (R1 참조).

**oklch 그레이디언트 토큰**:

```typescript
const BRAND_GRADIENTS: Record<CardBrand, { from: string; to: string }> = {
  visa:       { from: "oklch(0.35 0.12 270)", to: "oklch(0.55 0.18 250)" },
  mastercard: { from: "oklch(0.45 0.22 25)",  to: "oklch(0.35 0.18 350)" },
  amex:       { from: "oklch(0.45 0.15 160)", to: "oklch(0.35 0.12 180)" },
  discover:   { from: "oklch(0.55 0.18 60)",  to: "oklch(0.45 0.22 45)"  },
  jcb:        { from: "oklch(0.40 0.18 250)", to: "oklch(0.35 0.15 150)" },
  diners:     { from: "oklch(0.45 0.08 220)", to: "oklch(0.35 0.05 220)" },
  unknown:    { from: "oklch(0.40 0.02 0)",   to: "oklch(0.30 0.02 0)"   },
};
```

**의존성**: 신규 npm 패키지 없음 (순수 TypeScript 유틸).

**테스트 (Vitest)**:
- `detectBrand("4111111111111111")` → `"visa"`
- `detectBrand("5500005555555559")` → `"mastercard"`
- `detectBrand("378282246310005")` → `"amex"` (15자리)
- `detectBrand("6011111111111117")` → `"discover"`
- `formatCardNumber("378282246310005", "amex")` → `"3782 822463 10005"` (4-6-5)
- `maskCardNumber("1005", "amex")` → `"•••• •••••• •1005"`
- `formatCardNumber("4111111111111111", "visa")` → `"4111 1111 1111 1111"` (4-4-4-4)

**DoD**: `pnpm typecheck` 0, `vitest` 모든 케이스 PASS.

**F.2 Spec**: 유틸 모듈이므로 UX 직접 해당 없음. 다만 oklch 토큰은 F.2-1 (디자인 토큰만) 준수.

**Security 적용**: B.5-5 (prefix 6자만 사용, DB 저장 없음).

**THREAT_MODEL 완화**: BIN 자동 감지 시 노출 — `detectBrand()` 내부에서 prefix 6자만 참조, 전체 카드번호 외부 전송 없음.

---

### 4.3 Phase 3-A-3: `CreditCardVisual` 컴포넌트 (3D flip 애니메이션)

**목표**: 실물 카드 형태 시각화 컴포넌트. 앞면(번호 마스킹 + 이름 + 만료 + 카드사 로고) + 뒷면(CVC 마스킹). Motion 라이브러리 3D flip. **마스킹 상태에서 flip 금지** (THREAT_MODEL §4 완화).

**대상 파일**:
- `src/components/ui/credit-card-visual.tsx` (신규)
- `src/components/ui/credit-card-visual.test.tsx` (신규 — Vitest/RTL)

**Props 설계**:

```typescript
export interface CreditCardVisualProps {
  // 표시 데이터 (평문 secret 없음 — B.1-3)
  last4: string;                // 항상 표시 (마스킹에서 마지막 4자)
  brand: CardBrand;
  cardholderName?: string;
  expiryMonth: number;
  expiryYear: number;
  // reveal 상태 (parent 에서 제어)
  cvcRevealed: boolean;         // true 일 때만 flip 허용
  revealedCvc?: string;         // cvcRevealed=true 일 때만 전달
  revealedCardNumber?: string;  // full 번호 reveal 상태 (optional)
  // 상호작용
  onFlipRequest?: () => void;   // CVC 영역 클릭 시 parent 에 reveal 요청
  className?: string;
}
```

**핵심 구현 규칙**:

1. **마스킹 상태 flip 금지**: `flipped` 상태 전환은 `cvcRevealed === true` 일 때만 허용. `cvcRevealed === false` 상태에서 카드 클릭 시 flip 없이 `onFlipRequest()` 호출 → parent 가 reveal 절차 진행.

2. **Motion 3D flip 구현**:
   ```typescript
   // prefers-reduced-motion 존중 (F.2-2, CLAUDE.md globals.css 이미 적용)
   const reducedMotion = window.matchMedia(
     "(prefers-reduced-motion: reduce)"
   ).matches;

   <motion.div
     animate={{ rotateY: (cvcRevealed && flipped) ? 180 : 0 }}
     transition={
       reducedMotion
         ? { duration: 0 }
         : { type: "spring", stiffness: 300, damping: 30, duration: 0.4 }
     }
     style={{ transformStyle: "preserve-3d" }}
   />
   ```

3. **앞면 구성**:
   - 카드사 로고 (Lucide 또는 브랜드별 SVG 인라인 — shadcn credit-card 컴포넌트 참조)
   - 칩 아이콘 (Lucide `Cpu` 또는 CSS 직접)
   - 번호: `revealedCardNumber` 있으면 `formatCardNumber(raw, brand)`, 없으면 `maskCardNumber(last4, brand)`
   - 이름: `cardholderName ?? "CARD HOLDER"`
   - 만료: `MM / YY` 형식

4. **뒷면 구성**:
   - 마그네틱 스트라이프 (CSS `div` + dark background)
   - CVC 영역: `cvcRevealed` 이면 `revealedCvc`, 아니면 `•••`
   - 서명 스트립 (선택)

5. **backface-visibility**: 앞면 / 뒷면 div 모두 `backface-visibility: hidden` (CSS) → flip 중 반대면 미노출.

**의존성**: `motion` (이미 프로젝트 채택), shadcn credit-card 컴포넌트 참조.

**테스트 (Vitest + RTL)**:
- `cvcRevealed=false` 상태에서 카드 클릭 시 flip 없음 확인
- `cvcRevealed=true` 상태에서 카드 클릭 시 `flipped` 상태 전환 확인
- `revealedCardNumber` 미전달 시 마스킹 표시 확인
- `prefers-reduced-motion` 활성 시 transition duration=0 확인

**DoD**: RTL 테스트 PASS, `pnpm typecheck` 0, Tailwind v4 디자인 토큰만 사용 확인.

**F.2 Spec 적용**:
- F.2-1: oklch 토큰 사용, hex 하드코딩 없음
- F.2-2: prefers-reduced-motion 즉시 처리
- F.2-3: flip 200ms 이내 시각 피드백 (spring 즉각 반응)
- F.2-7: 키보드로 카드 flip 가능 (Enter 키 지원)

**Security 적용**: B.5-1 (revealedCvc / revealedCardNumber 는 parent 에서만 관리, 이 컴포넌트는 표시만), B.5-2 (타이머는 parent 에서 관리).

**THREAT_MODEL 완화**: 3D flip 중 평문 노출 — 마스킹 상태에서 flip 물리적으로 불가.

---

### 4.4 Phase 3-A-4: `CreditCardForm` (등록/편집 폼)

**목표**: 신용카드 등록 및 편집 폼. 자연 순서 입력 (번호 → 만료 → CVC → 이름 → PIN → 청구주소). BIN 입력 시 실시간 브랜드 감지 → 카드 미리보기 즉시 갱신.

**대상 파일**:
- `src/features/inventory/CreditCardForm.tsx` (신규)
- `src/features/inventory/CreateCredentialDialog.tsx` — `kind = "credit_card"` 분기 추가

**폼 필드 순서 (자연 순서 — 1P §1.1 참조)**:

| 순서 | 필드명 | 타입 | 필수 여부 | 마스킹 |
|:---|:---|:---|:---|:---|
| 1 | 카드 번호 (Card Number) | 숫자 입력 + 그룹핑 마스크 | 필수 | 입력 시 실시간 표시, 저장 후 마스킹 |
| 2 | 만료 월 (MM) | Select 1-12 | 필수 | 없음 |
| 3 | 만료 연도 (YY/YYYY) | Select (현재 + 20년) | 필수 | 없음 |
| 4 | CVC | 숫자 입력 3자리 (Amex: 4자리) | 필수 | 입력 시 `•` 마스킹 |
| 5 | 카드 소유자 이름 | Text | 선택 | 없음 |
| 6 | PIN | 숫자 입력 4-6자리 | 선택 (USER GATE 참조) | 입력 시 `•` 마스킹 |
| 7 | 청구 주소 | Text (단순 문자열) | 선택 (USER GATE 참조) | 없음 |

**입력 마스크 라이브러리 결정**:

USER GATE 항목이지만, 사양에서 권고안을 제시한다:

- **권고: `react-number-format`** (IMask 대비 React 친화적, TypeScript 지원 완전, 번들 크기 ~14KB gzip)
- IMask 도 가능 (더 풍부한 마스킹 패턴), 번들 크기 ~18KB gzip
- shadcn/ui `Input` 위에 wrapping 형태로 적용

구체적으로 `NumericFormat` 또는 `PatternFormat` 사용:
```tsx
// 카드 번호 입력 (4-4-4-4, Amex 감지 전 기본)
<PatternFormat
  format={brand === "amex" ? "#### ###### #####" : "#### #### #### ####"}
  mask="•"
  customInput={Input}
  onValueChange={({ value }) => {
    setBrand(detectBrand(value));
    form.setValue("card_number_plain", value);
  }}
/>
```

**BIN 실시간 감지 UX**:
- 카드번호 첫 1자 입력 → Visa `4` 감지 → 카드 미리보기 배경 즉시 파란 그레이디언트
- 6자 이상 → 정확한 brand 확정 → 그레이디언트 + 로고 완성
- 200ms 이내 시각 피드백 (F.2-3)

**Zod 검증 스키마**:

```typescript
const creditCardSchema = z.object({
  card_number_plain: z
    .string()
    .min(13, "카드 번호가 너무 짧습니다")
    .max(19, "카드 번호가 너무 깁니다")
    .regex(/^\d+$/, "숫자만 입력하세요"),
  expiry_month: z.number().int().min(1).max(12),
  expiry_year: z.number().int().min(new Date().getFullYear()),
  cvc_plain: z
    .string()
    .min(3, "CVC 는 최소 3자리")
    .max(4, "CVC 는 최대 4자리 (Amex)")
    .regex(/^\d+$/, "숫자만 입력하세요"),
  cardholder_name: z.string().max(100).optional(),
  pin_plain: z
    .string()
    .min(4)
    .max(6)
    .regex(/^\d+$/)
    .optional(),
  billing_address: z.string().max(500).optional(),
});
```

**의존성**: `react-number-format` (USER GATE 3 결정 후 확정)

**테스트**:
- Zod schema validation (유효 카드 번호 / 만료 월 범위 / CVC 길이)
- BIN 감지 → brand state 변경 → 그레이디언트 CSS 클래스 변경

**DoD**: `pnpm typecheck` 0, `vitest` PASS, Zod validation 에러 메시지 i18n 4 로케일 키 추가 확인.

**F.2 Spec 적용**:
- F.2-4: 필드 에러 메시지 — "숫자만 입력하세요" 등 구체적 안내 (단순 "잘못된 입력" 금지)
- F.2-6: 인라인 폼 에러 (필드 아래, `FormMessage`)
- F.2-7: 탭 순서 자연 순서 보장 (번호 → MM → YY → CVC → 이름 → PIN → 주소 → [저장])
- F.2-8: i18n 4 로케일 (en / ko / ja / zh) 폼 레이블 + 에러 메시지

**Security 적용**: B.1-4 (Zod input validation), B.5-1 (submit 시 `card_number_plain` → Rust 에서 즉시 `Secret<String>` 래핑), B.1-9 (저장 실패 에러 메시지 범용화).

---

### 4.5 Phase 3-A-5: `CreditCardDetail` + `reveal_card_number` / `reveal_cvc` Tauri Commands

**목표**: 신용카드 상세 뷰. Reveal 전용 Tauri command 2개 (`reveal_card_number`, `reveal_cvc`). 각 reveal 에 audit log + 30초 자동 클리어.

**대상 파일**:
- `src/features/inventory/CreditCardDetail.tsx` (신규)
- `src-tauri/src/commands/credit_card.rs` (신규)
- `src-tauri/src/commands/mod.rs` — 모듈 등록
- `src-tauri/tauri.conf.json` 또는 `capabilities/default.json` — capability 등록

**Tauri Commands 설계**:

```rust
// src-tauri/src/commands/credit_card.rs

/// 카드 번호 reveal — B.1-5 capability 등록 필수, B.1-6 audit log 필수
#[tauri::command]
pub async fn reveal_card_number(
    state: tauri::State<'_, AppState>,
    credential_id: String,
) -> Result<String, String> {
    // 1. vault unlock 확인
    // 2. age vault 에서 card_number 복호화 (SecretBox)
    // 3. audit log: action = "card_number_revealed", credential_id = ...
    // 4. expose_secret() 한 번만 호출하여 String 반환
    // 5. 반환 후 SecretBox drop → zeroize
    // B.1-9: 에러 시 "카드 정보를 불러올 수 없습니다." 반환 (credential_id 미포함)
}

/// CVC reveal — B.1-5 capability 등록 필수, B.1-6 audit log 필수
#[tauri::command]
pub async fn reveal_cvc(
    state: tauri::State<'_, AppState>,
    credential_id: String,
) -> Result<String, String> {
    // reveal_card_number 와 동일 패턴, vault 경로 다름
    // action = "cvc_revealed"
}
```

**Frontend 30초 자동 클리어 패턴 (BentoCard.tsx 기존 패턴 재사용)**:

```tsx
const REVEAL_TIMEOUT_MS = 30_000; // B.5-2 CVC 30초 자동 클리어

const [revealedCvc, setRevealedCvc] = useState<string | null>(null);
const cvcTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

const handleRevealCvc = useCallback(async () => {
  if (revealedCvc !== null) {
    if (cvcTimerRef.current) clearTimeout(cvcTimerRef.current);
    setRevealedCvc(null);
    return;
  }
  try {
    const value = await invoke<string>("reveal_cvc", {
      credentialId: credential.credential_id,
    });
    setRevealedCvc(value);
    cvcTimerRef.current = setTimeout(() => {
      setRevealedCvc(null);
      cvcTimerRef.current = null;
    }, REVEAL_TIMEOUT_MS);
  } catch {
    toast.error(t("creditCard.revealFailed")); // B.1-9
  }
}, [revealedCvc, credential.credential_id, t]);

// 30초 타이머 unmount 정리
useEffect(() => {
  return () => {
    if (cvcTimerRef.current) clearTimeout(cvcTimerRef.current);
    if (cardNumTimerRef.current) clearTimeout(cardNumTimerRef.current);
  };
}, []);
```

**`CreditCardDetail` 레이아웃**:

```
┌────────────────────────────────────────────────────┐
│ CreditCardVisual (클릭 시 CVC reveal → flip)        │
│ (마스킹 상태가 기본. reveal 버튼 클릭 후 flip 가능) │
└────────────────────────────────────────────────────┘
┌────────────────────────────────────────────────────┐
│ 카드 번호    •••• •••• •••• 1234  [복사] [보기]    │
│ 만료         03 / 2028                              │
│ CVC          •••                  [복사] [보기]    │
│ 소유자       HONG GILDONG                           │
│ PIN          ••••                 [복사] [보기]    │  ← USER GATE 결정 후
│ 청구 주소   서울시 ...                              │  ← USER GATE 결정 후
└────────────────────────────────────────────────────┘
```

- [보기] 버튼: Lucide `Eye` / `EyeOff` 아이콘 (F.2-3 200ms 이내 피드백)
- [복사] 버튼: `invoke("credential_copy_to_clipboard", ...)` 기존 패턴 재사용. 성공 시 체크마크 + 토스트

**capability 등록** (`capabilities/default.json` 또는 분리 파일):
```json
{
  "permissions": [
    "core:default",
    "credit-card:reveal-card-number",
    "credit-card:reveal-cvc"
  ]
}
```

**의존성**: 기존 `credential_reveal` Tauri command 패턴 재사용. audit log chain (M6 이미 구현).

**테스트 (Rust)**:
- `reveal_card_number` vault unlock 없이 호출 시 에러 반환 확인
- audit log row 생성 확인 (`action = "card_number_revealed"`)
- `reveal_cvc` 동일

**테스트 (Vitest/RTL)**:
- 30초 후 CVC 자동 클리어 확인 (fake timers)
- unmount 시 타이머 정리 확인

**DoD**: cargo test PASS, clippy 0, typecheck 0, audit log row 확인, capability 등록 확인.

**F.2 Spec 적용**: F.2-3 (reveal 버튼 200ms 피드백), F.2-5 (reveal 로딩 시 버튼 비활성화 + 스피너), F.2-7 (Tab + Enter 로 reveal / copy 가능).

**Security 적용**: B.1-2 (SecretBox + zeroize on drop), B.1-3 (IPC 응답에 평문 단 1회, 30초 후 클리어), B.1-5 (capability), B.1-6 (audit log), B.1-9 (에러 메시지 범용화), B.5-2 (30초 자동 클리어).

**THREAT_MODEL 완화**: 카드번호 부분 노출 (별도 command + audit + 30s 클리어), CVC reveal 30초 클리어.

---

### 4.6 Phase 3-A-6: BentoCard 통합 + i18n 4 로케일 + Vitest

**목표**: 기존 `BentoCard.tsx` 에 `credit_card` kind 분기 추가. Bento 그리드에서 신용카드 카드사별 그레이디언트 배경 + last_4 + 카드사 로고 표시. i18n 4 로케일 키 완성. 전체 통합 Vitest 추가.

**대상 파일**:
- `src/features/inventory/BentoCard.tsx` — `credit_card` kind 분기 추가
- `src/features/inventory/types.ts` — `CredentialSummary` 에 credit_card 메타 필드 추가
- `src/locales/en/common.json`, `ko/common.json`, `ja/common.json`, `zh/common.json` — credit_card 키 추가
- `src/features/inventory/BentoCard.test.tsx` (신규 또는 기존 업데이트)

**BentoCard credit_card 분기 설계**:

기존 BentoCard 는 `kind = "api_key" | "password"` 를 분기 처리. `credit_card` 추가:

```tsx
// 기존 BentoCard 상단 분기 (M24 Phase 1 type-agnostic 설계 유지)
if (credential.kind === "credit_card") {
  return <CreditCardBentoCard credential={credential} securityAlerts={securityAlerts} />;
}
// 기존 ApiKey / Password 렌더링 유지
```

`CreditCardBentoCard` 는 BentoCard 와 동일한 카드 컨테이너(`Card`, `CardContent`) 사용 — M24 Phase 1 type-agnostic Bento 설계 정합.

**BentoCard credit_card 표시 내용**:

```
┌─────────────────────────────────────────────────────────┐
│ [카드사 로고 아이콘]  이름 (credential.name)     ⋮ 메뉴 │
│                                                         │
│ ████████████████████████████████ ← 카드사별 oklch 배경  │
│                                                         │
│  •••• •••• •••• 1234   MM/YY                            │
│  [카드사 배지]                                           │
└─────────────────────────────────────────────────────────┘
```

- 배경: `getBrandGradient(brand)` → inline style `background: linear-gradient(135deg, from, to)`
- 카드사 배지: `<Badge variant="outline">{brand.toUpperCase()}</Badge>`
- 카드번호: `maskCardNumber(last_4, brand)` (마지막 4자만 노출 — B.5-3)
- hover 시 scale(1.01) + shadow 증가 (F.2-3, 기존 BentoCard hover 패턴 동일)

**types.ts 확장**:

```typescript
// CredentialSummary 에 credit_card 전용 필드 추가 (optional)
export interface CredentialSummary {
  // 기존 필드...
  // credit_card 전용 (kind="credit_card" 일 때만 non-null)
  card_brand?: CardBrand;
  card_last_4?: string;
  card_expiry_month?: number;
  card_expiry_year?: number;
  card_cardholder_name?: string;
}
```

**i18n 키 추가 목록**:

```json
{
  "creditCard": {
    "number": "카드 번호",
    "expiry": "만료일",
    "cvc": "보안 코드 (CVC)",
    "cardholder": "카드 소유자",
    "pin": "PIN",
    "billingAddress": "청구 주소",
    "revealFailed": "카드 정보를 불러올 수 없습니다.",
    "copyFailed": "복사에 실패했습니다.",
    "brand": {
      "visa": "Visa",
      "mastercard": "Mastercard",
      "amex": "American Express",
      "discover": "Discover",
      "jcb": "JCB",
      "diners": "Diners Club",
      "unknown": "알 수 없음"
    },
    "addCard": "카드 추가",
    "emptyState": {
      "title": "저장된 카드가 없습니다",
      "description": "신용카드 또는 체크카드를 안전하게 저장하고 언제든 접근하세요.",
      "cta": "카드 추가"
    }
  }
}
```

**empty state (F.2-4 적용)**: `credit_card` 카테고리 필터 선택 시 카드가 없으면 `CreditCard` Lucide 아이콘 + i18n 빈 상태 메시지 + [카드 추가] CTA 버튼.

**의존성**: `CreditCardBentoCard` 컴포넌트는 3-A-2~3 의존.

**테스트 (Vitest/RTL)**:
- `credit_card` kind CredentialSummary 전달 시 `CreditCardBentoCard` 렌더링 확인
- 기존 `api_key` / `password` kind 렌더링 회귀 없음 확인
- 빈 상태 렌더링 확인

**DoD**: `vitest` PASS, `pnpm typecheck` 0, `pnpm lint` 0, i18n 4 로케일 키 누락 없음 확인.

**F.2 Spec 적용**: F.2-4 (빈 상태 CTA), F.2-8 (i18n 4 로케일 완성).

**Security 적용**: B.5-3 (last_4 만 표시, full number 없음).

---

## 5. USER APPROVAL GATE 2 — 결정 필요 항목

아래 7개 항목은 implementator 호출 전 사용자 결정이 필요하다. 각 항목에 권고안과 근거를 함께 제시한다.

---

### GATE 2-1: DB 스키마 옵션 — 별도 테이블 vs JSON meta 컬럼

**선택지 A (별도 `credit_card_meta` 테이블)**
- 장점: 타입 안전성, 컬럼별 인덱스, 쿼리 명확
- 단점: 조인 필요, migration 복잡성 약간 증가
- 이 보고서 §4.1 에서 권고하는 방식

**선택지 B (기존 `credential` 테이블 + JSON meta 컬럼)**
- 장점: 마이그레이션 간단 (컬럼 1개 추가)
- 단점: JSON 파싱 필요, 컬럼별 인덱스 불가, 타입 안전성 낮음

**권고: 선택지 A (별도 테이블)**. 이유: Phase 3-B (secure_note), Phase 3-C (passkey) 도 각자 전용 테이블 패턴을 사용할 것이므로 일관성 유지. JSON 컬럼은 향후 스키마 진화 시 마이그레이션이 더 복잡.

---

### GATE 2-2: 카드번호 reveal 정책 — 카드번호도 30초인가?

**현재 결정 (B.5-2)**: CVC reveal = 30초 자동 클리어. 카드번호는 명시되지 않음.

**선택지 A**: 카드번호도 30초 자동 클리어 (CVC 와 동일, 보수적)
- 장점: 일관된 보안 정책, 긴 번호 입력 필요 없음 (복사 용도만)
- 단점: 번호를 직접 보면서 타이핑해야 할 때 불편 (예: 오프라인 상점 결제)

**선택지 B**: 카드번호 = 60초 (2배), CVC = 30초 (더 민감)
- 근거: 카드번호는 16자리라 짧은 시간 내 기억 어려움. CVC 3자리는 30초면 충분.

**선택지 C**: 사용자 설정 (30초 / 60초 / 수동 닫기)
- 단점: 설정 항목 추가 복잡성 (Phase 3-A 는 간단하게)

**권고: 선택지 A (카드번호도 30초)**. 이유: 보안 절대 우선 원칙 (B 항목). 복사 버튼으로 충분. 사용자 설정은 Phase 4 이후 추가 가능.

**USER DECISION REQUIRED** — 보수적(A) 또는 차별화(B) 선택.

---

### GATE 2-3: BIN 표 출처 — 하드코딩 vs npm 라이브러리

**선택지 A: 하드코딩 (이 보고서 권고)**
- `src/lib/card-utils.ts` 에 BIN prefix 규칙 직접 구현
- 의존성 0개 추가. 번들 영향 없음.
- 단점: 신규 카드사 추가 시 수동 업데이트 필요

**선택지 B: npm `card-validator` (Braintree 제작)**
- GitHub stars ~2.5k, Braintree(PayPal) 가 유지보수
- BIN 감지 + Luhn 검증 포함
- 번들 크기 ~7KB gzip
- 단점: 외부 의존성 추가, pnpm audit 대상 증가

**선택지 C: npm `creditcardutils`**
- 경량, BIN 감지 특화
- 유지보수 상태 불명확 (확인 필요)

**권고: 선택지 A (하드코딩)**. 이유: (1) 의존성 최소화 원칙, (2) BIN 표는 정적 데이터이므로 신규 카드사 추가 빈도 낮음, (3) Luhn 검증은 Phase 3-A 범위 밖 (저장 전용, 결제 처리 없음).

**USER DECISION REQUIRED** — 단순성(A) 또는 검증 기능 포함(B) 선택.

---

### GATE 2-4: 3D flip 정책 — 마스킹 상태에서 flip 완전 금지 vs UX

**현재 결정 (THREAT_MODEL §4)**: 마스킹 상태에서 flip 금지.

**선택지 A: 마스킹 상태 flip 완전 금지 (보수적 — 이 보고서 권고)**
- 마스킹 상태에서 카드 클릭 → flip 없이 reveal 요청 다이얼로그 표시
- 보안: THREAT_MODEL §4 완화책 완전 이행
- UX 약점: "왜 안 뒤집어지지?" 라는 사용자 혼란 가능

**선택지 B: 마스킹 상태에서도 flip 허용, 뒷면에 `•••` 만 표시**
- UX: 자연스러운 flip 인터랙션 (1Password 패턴에 가까움)
- 보안 위험: THREAT_MODEL §4 에서 "rotateY 진행 중 카드 앞/뒷면 모두 잠시 보임" — 단, 뒷면에 `•••` 만 있으면 평문 노출 없음
- 보안 평가: 마스킹 상태에서 flip 해도 **평문이 없으면 실제 위협 낮음**. THREAT_MODEL §4 의 위협은 "reveal 상태에서 flip" 을 상정함.

**USER DECISION REQUIRED** — 보수적(A) vs UX 자연스러움(B). 보안팀 외부 검토 전까지 A 권고.

---

### GATE 2-5: 청구 주소 (Billing Address) — Phase 3-A 포함 vs 미룸

**선택지 A: Phase 3-A 포함 (선택 필드)**
- 1Password 와 기능 동등
- 구현: 단순 텍스트 필드 1개 (구조화된 주소 DB 불필요)
- 예상 추가 작업: ~30분 (폼 필드 추가 + i18n)

**선택지 B: Phase 4 (Identity 카테고리) 로 미룸**
- Phase 3-A 범위 최소화
- Identity 카드 타입 추가 시 통합 설계 가능

**권고: 선택지 A (선택 필드로 포함)**. 이유: 단순 텍스트 1개 필드이므로 추가 비용 낮음. 1P 동등 수준 체크리스트에 청구주소가 포함됨.

---

### GATE 2-6: PIN 필드 — Phase 3-A 포함 vs 미룸

**선택지 A: Phase 3-A 포함 (선택 필드)**
- 1Password 신용카드 항목에 PIN 포함
- 구현: 마스킹 입력 + SecretBox 저장
- 예상 추가 작업: ~1시간 (Rust 모델 + vault 저장 경로 + form 필드 + reveal command)

**선택지 B: Phase 3-B 와 Phase 4 사이로 미룸**
- Phase 3-A 범위 최소화. PIN 은 SecureNote 의 secret custom field 로 임시 대체 가능.
- 실 사용 빈도 낮음 (카드 PIN 을 앱에 저장하는 사용자 소수)

**권고: 선택지 B (미룸)**. 이유: PIN 은 사용 빈도 낮음 + 추가 secret 저장 경로 설계 필요. Phase 3-A 는 카드번호 + CVC 의 핵심 플로우에 집중.

**USER DECISION REQUIRED** — 범위 축소(B, 권고) vs 완전 구현(A).

---

### GATE 2-7: 3D flip 미사용 옵션 — 단순 fade vs flip

**선택지 A: 3D flip (이 보고서 권고)**
- 1Password 와 시각적 동등 수준
- Motion 라이브러리 이미 채택
- prefers-reduced-motion 에서 즉시 전환 (duration=0)

**선택지 B: 단순 fade 전환 (CVC 필드 포커스 시 CVC 영역 blur→선명)**
- 구현 단순, 3D CSS 지원 여부 무관
- UX 차별화 약함

**선택지 C: flip 없이 뒷면 인라인 표시 (Bitwarden 스타일)**
- 가장 단순하나 시각적으로 평범

**권고: 선택지 A (3D flip)**. 이유: 시장 출시 시 1P 동등 수준을 목표로 하며, 3D flip 은 신용카드 UX 의 핵심 차별화 요소 (UX 연구 §1.1 확인). 기술적 위험 낮음 (Motion + shadcn credit-card 컴포넌트 레퍼런스 존재).

---

## 6. 위험 요소 (Risks)

| ID | 위험 | 영향 | 발생 가능성 | 완화 |
|:---|:---|:---|:---|:---|
| **R1** | BIN 표 정확성 오류 (Discover 범위 오탈자 가능) | MEDIUM — 브랜드 감지 오류 → 잘못된 그레이디언트 | LOW | Implementator 가 Wikipedia IIN Ranges 또는 Discover 공식 BIN 문서 1회 교차 확인. 오류 발견 시 `card-utils.ts` 수정 |
| **R2** | screenshot 캡처 미차단 | MEDIUM — reveal 상태 화면 캡처 가능 | MEDIUM | Phase 3-A 미구현. 잔여 위험 placeholder 주석 추가. 장기: macOS `NSWindow secureContentView` / Windows DRM (Phase 3-A 이후) |
| **R3** | DB 스키마 변경 시 기존 credential 영향 | LOW — 별도 테이블이므로 기존 row 영향 없음 | LOW | 0012 migration 은 신규 테이블만 생성. `credential` 테이블 ALTER ❌. 기존 0011 데이터 회귀 테스트 |
| **R4** | `react-number-format` vs `IMask` 의존성 미결정 | LOW — 번들 크기 / API 차이 | LOW | GATE 2-3 결정 후 implementator 선택. 어느 쪽이든 Zod validation 은 동일 |
| **R5** | 3D flip CSS 브라우저 호환성 | LOW — Tauri WebView 는 Chromium 기반, transform-style: preserve-3d 완전 지원 | LOW | Tauri WebView (Chromium/WebKit) 에서 테스트 확인 |
| **R6** | `secrecy` crate 미포함 시 Cargo.toml 추가 필요 | LOW | LOW | Implementator 가 `src-tauri/Cargo.toml` 확인 후 없으면 추가 (`secrecy = "0.8"`) |
| **R7** | CVC reveal 30초 타이머가 창 이동 시 초기화 | MEDIUM — 사용자가 다른 창으로 이동 후 돌아오면 CVC 클리어 | LOW | `document.visibilitychange` 이벤트에서 추가 클리어 고려 (선택 사항) |

---

## 7. 통합 검증 (Integration Check)

### 7.1 기존 CredentialKind 와 호환성

`CredentialKind` 에 `CreditCard` variant 추가는 기존 `ApiKey` / `Password` 렌더링에 영향을 주지 않는다:
- Rust: `match kind { ApiKey => ..., Password => ..., CreditCard => ... }` — exhaustive match 강제로 컴파일 타임 검증
- Frontend: `BentoCard.tsx` 분기 추가 (`credit_card` → `CreditCardBentoCard`, 기존 두 종류 unchanged)
- DB: 기존 `credential` 테이블 row 는 `kind = 'api_key'` 또는 `kind = 'password'` 유지

⚠️ **주의**: `CredentialFilter` 에 `kind: Option<CredentialKind>` 가 있으므로 `CreditCard` 추가 시 `list_credentials` Tauri command 에서 자동으로 필터 가능. 추가 변경 불필요.

### 7.2 BentoCard `securityAlerts` prop 과 통합

기존 BentoCard 는 `securityAlerts?: SecurityAlertView[]` prop 을 받아 최고 우선순위 배지 표시 (Phase 2-2B-5 에서 추가). `CreditCardBentoCard` 도 동일 prop 수신 + `SecurityBadge` 컴포넌트 동일하게 적용.

Phase 2-2B Watchtower 의 `security_alerts` 는 현재 `alert_kind` 가 `"compromised_password" | "weak_password" | "reused_password" | "missing_two_factor" | "unsecured_website"` 5종이다. 신용카드 credential 에 대한 Watchtower 경고는 Phase 3-A 범위 밖 (향후 "expired_card" 등 추가 가능, Phase 4 이후).

### 7.3 Vault Encryption 변경 여부

**변경 없음**. 신용카드의 `card_number` / `cvc` / `pin` 도 기존 `age` vault 동일 경로 방식으로 저장 (`credentials/<credential_id>/card_number`, `credentials/<credential_id>/cvc`). vault format v2 변경 ❌.

### 7.4 M24 다른 sub-task 와 충돌 가능성

| 충돌 대상 | 충돌 영역 | 해결 방법 |
|:---|:---|:---|
| Phase 2-2B Watchtower | `security_alerts` 테이블에 `credit_card` kind credential 포함 가능. Watchtower 가 카드 credential 도 검사하는지 명확화 필요 | Phase 3-A 에서 Watchtower 검사 범위 = password kind 만으로 제한 (0011 migration 변경 없음). 추후 확장 |
| Phase 2-3-a CSV import | CSV import 가 `credit_card` kind 를 지원하는지 | Phase 2-3-a 범위 밖. CSV import 는 기존 api_key / password 만 대상 |
| `CreateCredentialDialog.tsx` | 기존 kind 토글 (`api_key` / `password`) 에 `credit_card` 추가 | 3-A-4 에서 Dialog 에 credit_card 분기 추가. 기존 흐름 영향 없음 |

### 7.5 Implementator 호출 순서 권고

```
3-A-1 (Rust 모델 + DB)
  ↓
3-A-2 (Frontend 유틸, 독립)
  ↓
3-A-3 (CreditCardVisual, 3-A-2 의존)
  ↓
3-A-4 (CreditCardForm, 3-A-2 + 3-A-3 의존)
  ↓
3-A-5 (CreditCardDetail + Tauri commands, 3-A-1 + 3-A-3 의존)
  ↓
3-A-6 (BentoCard 통합 + i18n, 3-A-1 ~ 3-A-5 모두 의존)
```

3-A-1 과 3-A-2 는 병렬 가능 (Rust backend / frontend 독립). 나머지는 순서 준수.

---

## 8. 미해결 모순 / 사용자 판단 필요 항목

### 모순 1: 1Password CVC 30초 vs "타임아웃 없이 수동 숨김"

`ux_research_phase3.md` §1.1 CVC 처리 항목:
> "눈" 아이콘 클릭 → 일시 표시 (**타임아웃 없이 수동 숨김**)
> 복사 클릭 → 클립보드에 저장 후 일부 플랫폼에서 **30–45초 후 자동 클리어** (OS 클립보드 정책 의존)

즉, 1Password 는 reveal 자체에는 타임아웃 없고, 클립보드에만 30~45초 클리어를 적용한다.

반면 `docs/project-decisions.md` [2026-05-07] B.5-2:
> "CVC reveal **30초 자동 클리어**"

**모순**: 1Password 는 reveal 은 수동 숨김, 클립보드만 자동 클리어. 우리 결정은 reveal 자체도 30초 자동 클리어.

**판정**: 우리 결정(B.5-2)이 더 보수적. `project-decisions.md` 의 B.5-2 는 사용자가 직접 확정한 사항이므로 이 보고서는 30초 자동 클리어를 유지한다.

**근거**: "보안 절대 우선" — 1P 패턴보다 엄격한 정책은 사용자 경험 다소 불편할 수 있으나, 보안 우위. 클립보드도 별도 30초 클리어 적용 권고 (GATE 2-2 와 연계).

**이 항목은 사용자 판단으로 이미 확정됨. 변경 불필요.**

---

### 모순 2: 3D flip "마스킹 상태 flip 금지" vs "실제 1P 는 flip 허용"

THREAT_MODEL §4:
> "사용자가 reveal 한 상태에서만 flip. 마스킹 상태에서는 flip 안 함"

연구 문서 §1.4:
> "CVC 필드 포커스 시 카드 3D flip"

1Password 는 마스킹 상태에서도 flip 애니메이션을 제공하되 뒷면에 `•••` 를 표시한다.

THREAT_MODEL §4 의 위협 시나리오: "rotateY 진행 중 카드 앞/뒷면 모두 잠시 보임" — 단, 마스킹 상태에서 flip 해도 뒷면은 `•••` 이므로 평문 노출 없음.

**판정**: THREAT_MODEL §4 의 완화책은 "reveal 상태에서만 flip" 이지만, 마스킹 상태에서도 뒷면이 `•••` 이면 실제 위협 낮음. 그러나 사용자 결정(THREAT_MODEL 을 Phase 3-A 진입 전 작성하기로 결정)에 따라 THREAT_MODEL §4 완화책을 준수하는 것이 맞다.

**USER DECISION REQUIRED** (→ GATE 2-4 와 동일). 구현 전 최종 확인 필요.

---

### 모순 3: `CredentialSummary` 에 credit_card 메타 추가 방식

기존 `CredentialSummary` 는 `api_key` 와 `password` 공통 구조. `credit_card` 추가 시:
- 방식 A: `CredentialSummary` 에 optional 필드 추가 (`card_brand?`, `card_last_4?` 등)
- 방식 B: Rust enum 으로 kind별 variant (`CredentialSummary::CreditCard(...)`)

**판정**: 기존 코드가 방식 A (optional 필드) 를 사용하고 있고(`url`, `username`, `has_secondary` 등), 방식 B 는 기존 API 전면 변경 필요. **방식 A 채택 (기존 패턴 정합)**.

**이 항목은 모순이 아닌 설계 결정 — 방식 A 로 해결.**

---

## 9. 참고 자료 (신뢰도순)

| 신뢰도 | 출처 | 용도 |
|:---|:---|:---|
| HIGH (25/25) | `https://www.shadcn.io/components/finance/credit-card` | flip 컴포넌트 베이스 |
| HIGH (25/25) | `https://motion.dev/docs/react-transitions` | 3D flip spring transition 사양 |
| HIGH (24/25) | `https://support.1password.com/item-categories/` | 신용카드 필드 구조 |
| HIGH | `docs/THREAT_MODEL.md` §4 | Phase 3-A 보안 위협 완화 근거 |
| HIGH | `docs/project-decisions.md` [2026-05-07] B.1 + B.5 | 보안 룰 10 + 5항목 |
| HIGH | `docs/ux_research_phase3.md` §1 + §6 | 1P/BW UX 분석 + Phase 3-A 권고 |
| MEDIUM (19/25) | `community.bitwarden.com` #291 | 마스킹 차별화 근거 |
| MEDIUM (17/25) | `community.bitwarden.com` #57741 | 포맷팅 필요성 배경 |
| MEDIUM | ISO/IEC 7812-1 (BIN 표 원천) | BIN prefix 교차 검증 (Implementator 확인 필요) |
| MEDIUM (16/25) | `alexn.org/blog/2024/08/20/1password-vs-bitwarden/` | UX 맥락 이해 용도 |

---

*본 보고서는 LLM(claude-sonnet-4-6)이 작성한 통합 분석이다. 보안 critical 결정(B.4 항목)은 출시 전 외부 보안 감사로 검증 필수. "LLM 만 믿고 출시 ❌".*
