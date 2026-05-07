# Phase 2-2B Integrator Report — Watchtower 동등 풀체인 비밀번호 보안 검사

> 통합 일자: 2026-05-07
> Researcher 입력: `docs/research_phase2_2b_password_check.md` (668줄)
> 보안 결정: `docs/project-decisions.md` [2026-05-07] B.1 10항목 모두 적용
> 기존 코드 기준: `src-tauri/crates/api-vault-feeds/src/hibp.rs` + `feed_scheduler.rs` + `credential.rs`

---

## 0. 요약 (Executive Summary)

Phase 2-2B는 API Vault에 1Password Watchtower 동등 수준의 비밀번호 보안 검사 풀체인을 구축하는 마일스톤이다.

### 구현 범위 (5개 Sub-task)

| Sub-task | 제목 | 예상 commits |
|:---|:---|:---|
| 2-2B-1 | PwnedPasswordsClient (HIBP range lookup) | 2 |
| 2-2B-2 | 약한 비번 + 재사용 + 2FA 미설정 검출 엔진 | 2 |
| 2-2B-3 | SQLite `security_alerts` 테이블 + 스케줄러 통합 | 2 |
| 2-2B-4 | Tauri command + audit log + capability | 1 |
| 2-2B-5 | WatchtowerPage UI + BentoCard 배지 + i18n | 2 |

총 예상 커밋: **9개** (각 sub-task 1 Rust + 1 frontend/migration, 일부 통합). Researcher 예상 7~8과 근사.

### 검증 필요 항목 (보고서 §1 참조)

- zxcvbn 3.x의 `Score` 타입이 `PartialOrd` + `<=` 비교를 지원하는지 확인 필요 (Researcher 코드 스니펫 §5.4에서 `score() <= Score::Two` 사용 — docs.rs 직접 확인 권고)
- 2fa.directory v4 JSON 응답 스키마 (도메인 키 형식) 실제 샘플 파싱 검증 필요
- 나머지 API 시그니처(HIBP base URL, Add-Padding 행 수 범위)는 고신뢰 출처로 확인됨

### USER APPROVAL GATE 1

§4에 7개 결정 필요 항목 명시. 구현 전 사용자 승인 필수.

---

## 1. CRAAP 평가

Researcher가 인용한 17개 출처에 대한 CRAAP 5기준 평가. 총점 /25, 15점 미만은 LOW 신뢰도로 플래그.

| # | 출처 | C | R | A | A | P | 총점 | 신뢰도 | 비고 |
|:---|:---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---|
| 1 | haveibeenpwned.com/API/v3 (공식 문서) | 5 | 5 | 5 | 5 | 5 | 25 | HIGH | Troy Hunt 직접 관리, 상시 업데이트 |
| 2 | troyhunt.com/.../padding/ | 5 | 5 | 5 | 5 | 4 | 24 | HIGH | 저자 본인 블로그, Add-Padding 헤더 원저자 |
| 3 | blog.cloudflare.com/pwned-passwords-padding-... | 5 | 5 | 5 | 5 | 4 | 24 | HIGH | Cloudflare 공식, 패딩 구현 공동 발표 |
| 4 | docs.rs/zxcvbn/latest/zxcvbn/ | 5 | 5 | 5 | 5 | 5 | 25 | HIGH | 자동 생성 공식 API 문서 |
| 5 | crates.io/crates/zxcvbn | 5 | 4 | 5 | 5 | 5 | 24 | HIGH | 공식 레지스트리 — 버전/다운로드 사실 확인 |
| 6 | github.com/shssoichiro/zxcvbn-rs | 5 | 5 | 4 | 5 | 5 | 24 | HIGH | 소스 및 CHANGELOG 직접 확인 가능 |
| 7 | support.1password.com/watchtower/ | 5 | 5 | 5 | 4 | 4 | 23 | HIGH | 1Password 공식 지원 문서 |
| 8 | support.1password.com/watchtower-privacy/ | 5 | 5 | 5 | 4 | 4 | 23 | HIGH | Privacy 아키텍처 공식 설명 |
| 9 | bitwarden.com/help/reports/ | 5 | 5 | 5 | 5 | 4 | 24 | HIGH | Bitwarden 공식 문서 |
| 10 | community.bitwarden.com/.../94620 (moderator) | 4 | 5 | 3 | 3 | 4 | 19 | MEDIUM | 커뮤니티 moderator 답변. 공식 소스는 아님. zxcvbn score ≤ 2 기준은 별도 소스(PR #11252)로 교차 검증됨 |
| 11 | 2fa.directory/api/ | 5 | 4 | 4 | 4 | 5 | 22 | HIGH | 2fa.directory 공식 API 문서 |
| 12 | github.com/2factorauth/twofactorauth | 5 | 4 | 4 | 5 | 5 | 23 | HIGH | 소스 저장소, 라이선스 직접 확인 가능 |
| 13 | docs.rs/secrecy/.../SecretBox.html | 5 | 5 | 5 | 5 | 5 | 25 | HIGH | 공식 API 문서 |
| 14 | docs.rs/subtle/.../ConstantTimeEq.html | 5 | 5 | 5 | 5 | 5 | 25 | HIGH | 공식 API 문서 |
| 15 | github.com/orgs/tauri-apps/discussions/10852 | 4 | 4 | 4 | 3 | 4 | 19 | MEDIUM | Tauri maintainer 참여 discussion. 비공식 채널이나 핵심 메인테이너 답변 |
| 16 | github.com/bitwarden/clients/pull/11252 | 5 | 5 | 5 | 5 | 5 | 25 | HIGH | Bitwarden 공식 소스 PR — zxcvbn score ≤ 2 임계값 코드 레벨 검증 |
| 17 | deepwiki.com/bitwarden/clients/8.2-... | 3 | 3 | 2 | 2 | 3 | 13 | LOW | 비공식 wiki, 원저자 불명. 인용 시 PR #11252 원본으로 대체 권고 |

### 종합 신뢰도 요약

- HIGH (15점 초과): 14개 출처
- MEDIUM (15~18): 2개 출처 (moderator 답변, maintainer discussion) — 교차 검증으로 보완됨
- LOW (15 미만): 1개 (deepwiki.com) — **implementator는 이 출처 인용 금지, PR #11252 직접 참조**

### Researcher 보고 검증 필요 항목

아래 항목은 Researcher가 제시한 코드 스니펫 또는 수치에 대해 implementator가 직접 확인해야 한다.

**[검증 1] HIBP Add-Padding 응답 행 수 범위**

Researcher §1.4: "응답 행 수를 800~1000라인 사이로 패딩." 이 수치는 Troy Hunt 블로그 및 Cloudflare 블로그(HIGH 신뢰도)에서 설명된 내용과 일치한다. 다만 "800~1000" 정확한 상한은 API 서버 구현에 따라 변동 가능성 있음. 클라이언트는 행 수에 의존하지 않고 `count == 0` 필터링만 하면 충분 — 수치 의존 구현 금지.

**[검증 2] zxcvbn Score enum의 PartialOrd 지원**

Researcher §5.4 코드: `entropy.score() <= zxcvbn::Score::Two`. Rust에서 `<=` 비교는 `PartialOrd` 구현이 필요하다. `zxcvbn` 3.x의 `Score` 타입이 실제로 `PartialOrd`를 derive하는지 docs.rs에서 직접 확인 필요. 만약 미구현 시 `matches!(score, Score::Zero | Score::One | Score::Two)` 또는 `u8::from(score) <= 2` 형태로 대체해야 한다. **implementator 시작 전 필수 확인.**

**[검증 3] zxcvbn v3.0.0 API 변경 — 에러 없는 반환**

Researcher §2.2: "v3.0.0 변경: 이전 `Result<Entropy, ZxcvbnError>` → 현재 `Entropy`." 이 변경은 CHANGELOG 확인이 필요하다. `crates.io`에서 3.1.1이 최신임은 확인(HIGH 신뢰)되나, 구체적 API 변경 시점은 implementator가 `Cargo.lock` 기준으로 `docs.rs/zxcvbn/3.1.1/` 직접 확인.

**[검증 4] 2fa.directory v4 JSON 스키마**

Researcher §5.5: 도메인 → 상세 정보 매핑 JSON이라고 설명하나 정확한 키 형식이 미제시. implementator는 `https://api.2fa.directory/v4/totp.json`에 실제 요청 후 JSON 구조 확인 후 파싱 코드 작성. (MIT 라이선스는 GitHub 소스에서 HIGH 신뢰도로 확인됨.)

**[검증 5] deepwiki.com 출처 (LOW 신뢰) 미사용 권고**

Researcher가 출처 표에 포함한 deepwiki.com 항목은 비공식 wiki로 신뢰도 LOW. 해당 내용이 필요한 경우 반드시 `github.com/bitwarden/clients/pull/11252` 원본 PR을 참조.

---

## 2. 보안 결정 B.1 정합성 검증

`docs/project-decisions.md` [2026-05-07] B.1 10개 항목과 Researcher 권고의 정합성을 검증한다.

| # | B.1 항목 | Researcher 권고 내용 | 정합 여부 | 보강 필요 사항 |
|:---|:---|:---|:---:|:---|
| 1 | 암호학 직접 구현 금지 | sha1(RustCrypto)/zxcvbn/secrecy 검증 라이브러리 사용 권고 | ✅ | - |
| 2 | 평문 메모리 시간 최소화 | `SecretBox<String>` 즉시 래핑, SHA-1 prefix 추출 후 블록 종료, `drop` 시 zeroize | ✅ | drop 시점 명시적 주석 필수 (`// plain released here`) |
| 3 | 평문 IPC 미통과 | Rust side 전체 처리, `Vec<SecurityAlert>` (count/score/UUID만) 반환 | ✅ | `SecurityAlert` 직렬화 전 평문 필드 포함 여부 최종 검토 |
| 4 | Input 신뢰 0 — fuzz-safe 파서 | HIBP 응답 line 파싱: `splitn(2, ':')` + `parse().unwrap_or(0)` | ⚠️ | `unwrap_or(0)` 은 panic-safe이나, suffix가 비정상 길이(35자 아님)인 padding 행에 대한 ConstantTimeEq 길이 미일치 동작 명시 필요. 길이 검증 guard 추가 권고 |
| 5 | 공격 표면 최소화 — deny-by-default | Tauri capability 언급 없음 | ⚠️ | `run_security_check` / `list_security_alerts` 명시적 capability 항목 추가. deny-by-default 원칙 준수 |
| 6 | 모든 secret 작업 audit log | 언급 없음 | ⚠️ | `run_security_check` 호출 시 audit entry 기록 필수 (M6 체인 패턴 준용, 기존 `audit.rs` 참조) |
| 7 | dependency 보안 검사 자동 | sha1/zxcvbn/subtle 신규 추가 명시 | ✅ | CI에서 `cargo audit` gate 추가 확인 (기존 Dependabot 정책 유지) |
| 8 | secret scanning 자기 적용 | 코드 변경 없음 — 기존 GitHub Secret Protection + pre-commit hook 유지 | - | 해당 없음 (신규 시크릿 코드 추가 없음) |
| 9 | error message 누설 방지 | "어느 비번이 pwn 되었는지 사용자 본인만" 원칙 제시 | ⚠️ | 에러 메시지에 credential ID 또는 URL 노출 금지 명시 필요. `SecurityAlert`의 `UnsecuredWebsite { url }` 필드는 평문 URL이나 해당 credential 소유자에게만 표시 — 멀티유저 환경 시 추가 검토 필요 |
| 10 | timing-safe 비교 (`subtle::ConstantTimeEq`) | suffix 비교에 `ConstantTimeEq` 적용, `==` 금지 | ✅ | suffix 길이 35자 동일 보장 후 비교하는 guard 코드 포함 권고 |

### 보강 요약 (implementator 필수 반영)

1. **B.1-4 보강**: HIBP 응답 파싱 시 suffix 길이 != 35자인 행은 `continue` (skip). padding 행 중 비정상 형식 방어.
2. **B.1-5 보강**: `tauri-plugin-http`를 통한 HIBP/2fa.directory 외부 요청은 `network:allow-fetch` 또는 동등 capability를 명시적으로 추가. `run_security_check` command capability 목록에 등재.
3. **B.1-6 보강**: `run_security_check` Tauri command 내부에서 `AuditRepo::insert`로 `action = "security_check_run"`, `subject_kind = "vault"` 형태 로그 기록. 결과 카운트(alerts 몇 개)는 payload에 포함해도 무방하나 어느 credential이 취약한지는 payload에 포함 금지 (사용자 본인 vault이므로 credential_id는 포함 가능 — 단, 팀 vault 도입 시 재검토).
4. **B.1-9 보강**: `PwnedError` / `SecurityCheckError` 변환 시 내부 원인 메시지 (e.g., `reqwest` 에러)를 그대로 IPC 반환 금지. 범용 에러 메시지 ("Network error", "Check failed") 반환.

---

## 3. Sub-task 분할 (5개)

### 3.1 Phase 2-2B-1: PwnedPasswordsClient

**ID**: 2-2B-1
**제목**: HIBP Pwned Passwords range lookup 클라이언트 신규 구현
**목표**: `api.pwnedpasswords.com/range/{prefix}` endpoint를 k-anonymity 방식으로 호출하는 `PwnedPasswordsClient` 구조체를 `api-vault-feeds` crate에 추가한다. 기존 `HibpClient` (breaches/breachedaccount 전용)와 완전히 분리.

#### 변경 파일

| 파일 | 작업 | 비고 |
|:---|:---|:---|
| `src-tauri/crates/api-vault-feeds/src/pwned_passwords.rs` | 신규 생성 | `PwnedPasswordsClient`, `PwnedError` |
| `src-tauri/crates/api-vault-feeds/src/lib.rs` | 수정 | `pub mod pwned_passwords;` 추가 + re-export |
| `src-tauri/crates/api-vault-feeds/Cargo.toml` | 수정 | 신규 의존성 추가 |

#### 신규 의존성 (api-vault-feeds/Cargo.toml)

```toml
sha1 = { version = "0.10", features = ["oid"] }   # RustCrypto — HIBP prefix 전용
subtle = "2.6"                                      # timing-safe 비교
```

이미 workspace에 존재하므로 추가 불필요한 항목: `reqwest`, `secrecy`, `zeroize`.

`governor`(rate limiter)는 Pwned Passwords API가 공식적으로 rate limit 없음을 명시(`haveibeenpwned.com/API/v3` 문서)하므로 **미사용**. 단, 사용자 vault에 credential이 다수인 경우 throttle이 필요하면 내부 `tokio::time::sleep` 기반 간단 delay를 사용 (§4 GATE 1-5 참조).

#### 구현 사양

```
PwnedPasswordsClient::new() -> Self
PwnedPasswordsClient::with_base_url(base_url, http) -> Self   // 테스트 오버라이드
PwnedPasswordsClient::check_password(pw: &SecretBox<String>) -> Result<u64, PwnedError>
```

- `check_password` 내부 플로우 (Researcher §1.5 기반):
  1. `SecretBox::expose_secret()` 블록 안에서 SHA-1 계산 → 40자 대문자 hex
  2. `prefix = hex[0..5]`, `suffix = hex[5..]` (35자) — 블록 종료 시 노출 해제
  3. `GET https://api.pwnedpasswords.com/range/{prefix}` + `Add-Padding: true` 헤더 + `User-Agent: api-vault/0.1.0`
  4. 응답 각 행: 길이 != 38자(`35자 suffix + ':' + 최소 1자 count`)인 행 → skip (B.1-4 보강)
  5. `count.parse::<u64>().unwrap_or(0)` — 0이면 padding 행 → skip
  6. suffix 비교: `parts[0].len() == 35`인 경우에만 `subtle::ConstantTimeEq` 적용
  7. 발견 시 `count` 반환, 미발견 시 `0` 반환

- 에러 타입 `PwnedError`:
  - `Http(reqwest::Error)`
  - `InvalidResponse(String)` — 응답이 완전히 파싱 불가인 경우
  - **에러 메시지에 URL, credential 정보 미포함** (B.1-9)

#### 테스트 (Rust unit)

wiremock을 사용 (`hibp.rs` 기존 패턴 그대로 적용):

| 테스트 ID | 시나리오 | 검증 포인트 |
|:---|:---|:---|
| T1 | 발견된 suffix → count 반환 | suffix match 정확성 |
| T2 | 미발견 → 0 반환 | clean 비번 처리 |
| T3 | padding 행(count=0) → skip | padding 필터링 |
| T4 | Add-Padding 헤더 전송 확인 | wiremock header matcher |
| T5 | prefix 5자 대문자 hex 전송 확인 | path matcher |
| T6 | 응답에 비정상 행 포함 시 panic 없음 | fuzz-safe 파서 |
| T7 | 500 에러 → Err(Http) | 에러 전파 |

#### Definition of Done

1. `cargo test -p api-vault-feeds` 전체 PASS (기존 hibp.rs 테스트 포함)
2. `cargo clippy -p api-vault-feeds -- -D warnings` 0 warning
3. `check_password` 호출 후 `SecretBox` 외부에서 plaintext 접근 불가 (lifetime 컴파일 보장)
4. wiremock 기반 7개 단위 테스트 PASS
5. `Add-Padding: true` 헤더가 모든 요청에 포함됨을 T4로 검증
6. 기존 `HibpClient` API 변경 없음 (기존 18개 테스트 유지)

#### Security Spec 적용 (B.1)

- B.1-1: sha1 crate (RustCrypto) 사용, 직접 SHA-1 구현 금지
- B.1-2: `expose_secret()` 호출 → SHA-1 블록 → 즉시 블록 종료 (`// plaintext released`)
- B.1-3: `check_password`가 반환하는 값은 `u64` (count) — 평문 미포함
- B.1-4: 비정상 행 skip guard
- B.1-10: `subtle::ConstantTimeEq` suffix 비교

#### F.2 Spec 적용

해당 sub-task는 Rust 전용 — F.2 (frontend) 적용 없음.

---

### 3.2 Phase 2-2B-2: 약한 비번 + 재사용 + 2FA 미설정 검출 엔진

**ID**: 2-2B-2
**제목**: 로컬 전용 보안 검사 엔진 (`security_check.rs`) 신규 구현
**목표**: 외부 API 없이 로컬에서 수행하는 3종 검사 (약한 비번 zxcvbn, 재사용 SHA-256, 2FA 미설정)를 하나의 모듈로 구현한다.

#### 변경 파일

| 파일 | 작업 | 비고 |
|:---|:---|:---|
| `src-tauri/crates/api-vault-feeds/src/security_check.rs` | 신규 생성 | 3종 검사 + `SecurityCheckResult` + `SecurityAlert` |
| `src-tauri/crates/api-vault-feeds/src/twofa_directory.rs` | 신규 생성 | 2fa.directory v4 클라이언트 + 캐시 |
| `src-tauri/crates/api-vault-feeds/src/lib.rs` | 수정 | 2개 모듈 추가 + re-export |
| `src-tauri/crates/api-vault-feeds/Cargo.toml` | 수정 | zxcvbn 추가 |

#### 신규 의존성

```toml
zxcvbn = "3.1"
```

#### 주요 타입 설계

```rust
// SecurityAlert — IPC 직렬화 안전 (평문 비번 필드 없음)
#[derive(Debug, Clone, serde::Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum SecurityAlert {
    CompromisedPassword { exposure_count: u64 },
    WeakPassword { score: u8, length: usize },
    ReusedPassword { also_used_by: Vec<String> },  // credential_id strings
    MissingTwoFactor { domain: String },
    UnsecuredWebsite { url: String },
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct SecurityCheckResult {
    pub credential_id: String,
    pub alerts: Vec<SecurityAlert>,
}
```

#### 약한 비번 검출 사양

- 기준 1: zxcvbn `score ≤ 2` (Bitwarden/1Password 동등, PR #11252 기준)
- 기준 2: 길이 < 8자 (추가 안전망)
- `user_inputs`: credential의 `username`, `name`, issuer의 `slug`를 배열로 전달 (컨텍스트 의존 비번 감지 강화)
- **검증 필요**: `Score` PartialOrd 지원 여부 (§1 [검증 2] 참조) — 미지원 시 `matches!` 매크로로 대체

#### 재사용 검출 사양

- `credentials: &[Credential]` 전체를 SHA-256 fingerprint hashmap으로 그룹화
- 동일 fingerprint를 가진 credential이 2개 이상 → `ReusedPassword` alert
- hashmap은 함수 종료 시 scope-drop으로 해제 (heap 잔존 최소화)
- `kind == CredentialKind::ApiKey`인 경우: 재사용 검출 포함 (API 키도 중복이면 위험)

#### 2FA 미설정 검출 사양

- `TwoFaDirectoryClient`: `https://api.2fa.directory/v4/totp.json` 요청 → JSON 파싱 → `HashSet<String>` (도메인 목록) 반환
- TTL 캐시: 24시간 (`std::time::Instant` 기반 in-memory cache, 또는 SQLite 저장 — §3.3에서 결정)
- `credential.url`에서 호스트 추출 (`url` crate, 기존 workspace 의존성)
- 서브도메인 safe 매칭: `app.github.com` → `github.com` 으로 정규화
- `credential`에 `totp_uri` 또는 `secondary_value_ref` (TOTP용)가 있으면 검사 제외
- **주의**: `Credential` 모델에 `totp_uri` 필드가 현재 없음 — §4 GATE 1 참조

#### 테스트 (Rust unit)

| 테스트 ID | 시나리오 | 검증 포인트 |
|:---|:---|:---|
| T1 | score 0 비번 → WeakPassword | zxcvbn 경계값 |
| T2 | score 2 비번 → WeakPassword | 경계값 |
| T3 | score 3 비번 → 알림 없음 | 정상 케이스 |
| T4 | 길이 7자, score 3 → WeakPassword | 길이 기준 |
| T5 | 동일 비번 2개 → ReusedPassword | 재사용 검출 |
| T6 | 동일 비번 3개 → also_used_by 2개 | 그룹화 정확성 |
| T7 | 도메인이 2fa 목록에 있고 totp 없음 → MissingTwoFactor | 2FA 검출 |
| T8 | HTTP URL credential → UnsecuredWebsite | scheme 검사 |
| T9 | expose_secret 스코프 외 평문 접근 불가 (컴파일 테스트) | 메모리 안전 |

#### Definition of Done

1. `cargo test -p api-vault-feeds` PASS (신규 9개 + 기존 유지)
2. zxcvbn 임계값 확인: docs.rs/zxcvbn/3.1.1 직접 확인 후 코드 주석에 기록
3. `SecurityAlert` 직렬화 결과에 평문 비번 필드 없음 확인 (serde 출력 검토)
4. 재사용 hashmap이 함수 반환 전에 drop됨을 주석으로 명시
5. 2fa.directory JSON 실제 파싱 성공 (통합 테스트 또는 main에서 수동 확인)
6. `cargo clippy -- -D warnings` 0 warning

#### Security Spec 적용 (B.1)

- B.1-1: zxcvbn crate 사용, 자체 강도 알고리즘 구현 금지
- B.1-2: zxcvbn 호출 시 `expose_secret()` 블록 최소화
- B.1-4: 2fa.directory JSON 파싱 — `serde_json` fuzz-safe. unknown field `deny_unknown_fields` 대신 `default` 사용 (미래 스키마 변경 대비)
- B.1-10: 재사용 비교는 hash 기반 (`==` on `[u8; 32]`) — SHA-256 fingerprint 비교이므로 timing-safe 별도 불필요 (공개 hash)

---

### 3.3 Phase 2-2B-3: SQLite security_alerts 테이블 + scheduler 통합

**ID**: 2-2B-3
**제목**: `security_alerts` 마이그레이션 + Repo + 스케줄러 24h 통합
**목표**: 보안 검사 결과를 SQLite에 저장하고 24시간 주기 스케줄러로 자동 갱신. 2fa.directory 캐시도 동일 DB에 저장.

#### 변경 파일

| 파일 | 작업 | 비고 |
|:---|:---|:---|
| `src-tauri/crates/api-vault-storage/src/sqlite/migrations/XXXX_security_alerts.sql` | 신규 생성 | 마이그레이션 (번호는 현재 최신 +1) |
| `src-tauri/crates/api-vault-storage/src/sqlite/repositories/security_alert.rs` | 신규 생성 | `SecurityAlertRepo` |
| `src-tauri/crates/api-vault-storage/src/sqlite/repositories/mod.rs` | 수정 | 추가 |
| `src-tauri/crates/api-vault-app/src/services/feed_scheduler.rs` | 수정 | `spawn_security_check_poller` 추가 |

#### 마이그레이션 스키마 설계

```sql
-- security_alerts 테이블
CREATE TABLE IF NOT EXISTS security_alerts (
    id          TEXT PRIMARY KEY NOT NULL,          -- UUID
    credential_id TEXT NOT NULL,                    -- FK → credentials(id)
    alert_kind  TEXT NOT NULL,                      -- "compromised_password" | "weak_password" | ...
    alert_meta  TEXT NOT NULL DEFAULT '{}',         -- JSON 메타 (exposure_count, score 등 — 평문 비번 없음)
    dismissed_at TEXT,                              -- ISO8601, NULL = 활성
    checked_at  TEXT NOT NULL,                      -- ISO8601 — 마지막 검사 시각
    FOREIGN KEY (credential_id) REFERENCES credentials(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_security_alerts_credential_id
    ON security_alerts(credential_id);

CREATE INDEX IF NOT EXISTS idx_security_alerts_kind
    ON security_alerts(alert_kind);

-- 2fa.directory 캐시 테이블
CREATE TABLE IF NOT EXISTS twofa_directory_cache (
    domain      TEXT PRIMARY KEY NOT NULL,
    cached_at   TEXT NOT NULL               -- ISO8601
);
```

**설계 근거**:
- `alert_meta`는 JSON 메타데이터 (count, score 등) — 평문 비번 미포함
- `dismissed_at` NULL = 활성 알림, NOT NULL = 사용자가 dismiss
- `twofa_directory_cache`는 `security_alerts`와 별도 테이블로 캐시 TTL 독립 관리

#### SecurityAlertRepo 인터페이스

```
SecurityAlertRepo::upsert(alerts: &[SecurityCheckResult]) -> Result<()>
SecurityAlertRepo::list(credential_id: Option<&str>) -> Result<Vec<StoredAlert>>
SecurityAlertRepo::dismiss(alert_id: &str) -> Result<()>
SecurityAlertRepo::delete_by_credential(credential_id: &str) -> Result<()>
```

#### 스케줄러 통합 (`feed_scheduler.rs`)

기존 `spawn_feed_scheduler` 패턴 재사용:

```
spawn_security_check_poller(
    pool: Arc<SqlitePool>,
    vault: Arc<VaultStore>,
    http: reqwest::Client,
    cancel: CancellationToken,
    config: SecurityCheckConfig,
)
```

- 24h 주기 (`tokio::time::interval`)
- `SecurityCheckConfig::enabled` — `false`이면 즉시 반환 (opt-in gate)
- vault unlock 상태 확인 후 실행 (잠긴 상태에서 평문 접근 불가)
- HIBP 호출 순서: credential별 순차 처리 (`tokio::time::sleep(Duration::from_millis(100))` inter-request delay — §4 GATE 1-5 참조)
- 오류 발생 시 해당 credential skip (전체 중단 아님), tracing::warn 기록

#### Definition of Done

1. 마이그레이션 적용 후 `security_alerts` 테이블 생성 확인
2. `SecurityAlertRepo::upsert` → `list` 왕복 단위 테스트 PASS
3. `dismiss` 후 `list` 결과에서 해당 alert가 `dismissed_at` 채워진 채로 반환
4. 스케줄러가 `enabled = false` 시 HIBP 호출 없음 확인
5. credential 삭제 시 CASCADE로 alert 자동 삭제 확인
6. `cargo test -p api-vault-storage` PASS

#### Security Spec 적용 (B.1)

- B.1-2: vault unlock 상태 확인 — 잠긴 vault에서 스케줄러가 실행되더라도 평문 접근 없음
- B.1-3: `alert_meta` JSON에 평문 비번 저장 금지 (INSERT 직전 검증 함수)
- B.1-6: 스케줄러 자동 실행은 audit log 기록 선택적 (대량 로그 방지) — 사용자 수동 실행만 audit 필수

---

### 3.4 Phase 2-2B-4: Tauri command + audit log + capability

**ID**: 2-2B-4
**제목**: `run_security_check` / `list_security_alerts` Tauri command + audit 통합 + capability 추가
**목표**: Frontend가 호출하는 Tauri command 2종을 구현하고, 수동 실행 시 audit log를 기록하며, Tauri capability 파일에 명시적으로 등재한다.

#### 변경 파일

| 파일 | 작업 | 비고 |
|:---|:---|:---|
| `src-tauri/crates/api-vault-app/src/commands/security.rs` | 신규 생성 | 2개 command |
| `src-tauri/crates/api-vault-app/src/commands/mod.rs` | 수정 | `pub mod security;` 추가 |
| `src-tauri/src-tauri/capabilities/default.json` | 수정 | command capability 추가 |

#### command 사양

**`run_security_check`**

```
입력: RunSecurityCheckInput { force: bool }
출력: RunSecurityCheckOutput { alerts_count: u32, last_checked_at: i64 }
```

- vault 잠금 상태 확인 → 잠긴 경우 `Err("vault_locked")`
- `force = false`이고 24h 이내 검사 기록 있으면 캐시 반환
- HIBP opt-in 설정 확인 → 비활성이면 HIBP 호출 스킵, 나머지 로컬 검사만 수행
- 검사 완료 후 `AuditRepo::insert(action = "security_check_run", subject_kind = "vault", payload = { alerts_count })` — (B.1-6)
- 에러 메시지: 범용 문자열만 ("Security check failed") — 내부 에러 원인 미포함 (B.1-9)

**`list_security_alerts`**

```
입력: ListSecurityAlertsInput { credential_id: Option<String>, include_dismissed: bool }
출력: Vec<SecurityAlertDto>
```

```rust
#[derive(serde::Serialize)]
pub struct SecurityAlertDto {
    pub id: String,
    pub credential_id: String,
    pub alert_kind: String,
    pub alert_meta: serde_json::Value,   // exposure_count / score 등
    pub dismissed_at: Option<i64>,
    pub checked_at: i64,
}
```

**평문 비번 필드 없음** (B.1-3 검증).

#### capability 추가

```json
// src-tauri/capabilities/default.json
{
  "permissions": [
    "security:run_security_check",
    "security:list_security_alerts",
    "http:allow-fetch-send"   // HIBP + 2fa.directory 외부 요청
  ]
}
```

기존 capability 파일 구조에 맞게 삽입. 불필요한 권한은 추가하지 않음 (B.1-5).

#### audit log 통합

기존 `src-tauri/crates/api-vault-app/src/commands/audit.rs` 패턴 준용:
- `AuditEntry` 구조체와 동일한 `actor = "local-user"`, 체인 prev_hash 연결
- `security_check_run` action string — `audit.rs`에 상수 추가

#### Definition of Done

1. `pnpm tauri dev` 환경에서 `invoke("run_security_check", { force: true })` 호출 성공
2. `invoke("list_security_alerts", {})` 호출 후 DTO 배열 반환 확인
3. `run_security_check` 호출 후 audit log에 항목 기록 확인 (`audit_list` command로 조회)
4. vault 잠금 상태에서 `run_security_check` 호출 시 적절한 에러 반환
5. capability 미등록 command 호출 시 Tauri가 차단 확인
6. `pnpm typecheck` PASS (Frontend TS 타입 정합성)

#### Security Spec 적용 (B.1)

- B.1-3: command 반환 DTO에 평문 비번 없음 (컴파일 + 런타임 검토)
- B.1-5: capability deny-by-default — `default.json`에 명시된 항목만 허용
- B.1-6: 수동 실행 audit 필수
- B.1-9: 에러 메시지 범용화

---

### 3.5 Phase 2-2B-5: WatchtowerPage UI + BentoCard 배지 + i18n

**ID**: 2-2B-5
**제목**: Watchtower 페이지 신규 구현 + 기존 BentoCard 배지 통합 + 4 로케일 i18n
**목표**: 사용자가 보안 검사 결과를 한눈에 파악하고 조치할 수 있는 전용 페이지를 구현한다.

#### 변경 파일

| 파일 | 작업 | 비고 |
|:---|:---|:---|
| `src/features/security/WatchtowerPage.tsx` | 신규 생성 | 메인 페이지 컴포넌트 |
| `src/features/security/SecurityAlertCard.tsx` | 신규 생성 | 개별 alert 카드 |
| `src/features/security/SecurityBadge.tsx` | 신규 생성 | BentoCard용 최고 우선순위 배지 |
| `src/features/security/__tests__/WatchtowerPage.test.tsx` | 신규 생성 | Vitest |
| `src/locales/{en,ko,zh,ja}/security.json` | 신규 생성 | i18n 4 로케일 |
| `src/components/nav/Sidebar.tsx` (또는 동등 파일) | 수정 | Watchtower 네비게이션 항목 추가 |
| `src/features/inventory/BentoCard.tsx` (또는 동등 파일) | 수정 | `SecurityBadge` 통합 |

#### 페이지 레이아웃

```
WatchtowerPage
├── Header: "Security" (shadcn Heading)
│   └── [Run Check] 버튼 (수동 실행, invoke run_security_check)
│   └── "Last checked: {date}" 또는 "Never" 텍스트
├── Summary Cards (shadcn Card 격자)
│   ├── Compromised Passwords: {count} → destructive 색상
│   ├── Weak Passwords: {count} → warning 색상
│   ├── Reused Passwords: {count} → warning 색상
│   ├── 2FA Not Set Up: {count} → secondary 색상
│   └── Unsecured Websites: {count} → muted 색상
└── Alert List (카테고리별 또는 전체)
    └── SecurityAlertCard × n
        ├── Credential 이름 + Issuer 로고
        ├── Alert 종류 배지
        ├── 메타 정보 (노출 횟수 / score / 재사용 개수)
        ├── [Fix] / [Dismiss] 버튼
        └── 링크: credential 상세 페이지
```

#### BentoCard 배지 우선순위 (Researcher §5.7 기반)

```
CompromisedPassword (destructive) >
WeakPassword (outline + orange) >
ReusedPassword (outline + orange) >
MissingTwoFactor (secondary) >
UnsecuredWebsite (outline muted)
```

`SecurityBadge` 컴포넌트는 `credential_id`를 prop으로 받아 `list_security_alerts` 결과에서 최고 우선순위 1개만 표시. 상세 페이지에서 전체 목록 표시.

#### 빈 상태 (Empty State) — F.2 Spec

- 검사 이력 없음: "Your passwords haven't been checked yet." + [Run Security Check] CTA 버튼
- 검사 완료 + 알림 없음: 초록색 체크 아이콘 + "All clear! No security issues found." 친절한 문구
- HIBP opt-in 비활성: 안내 배너 "Enable HIBP check in Settings > Privacy for full protection."

#### 로딩 상태 — F.2 Spec

- `run_security_check` 진행 중: 프로그레스 바 또는 스피너 + "Checking passwords..." 문구
- Skeleton 카드: 알림 목록 자리에 shadcn Skeleton 컴포넌트 사용 (배치 완료 전)
- 마이크로 인터랙션: [Run Check] 버튼 → 로딩 상태 전환 200ms 이내 (B.1-2와 무관, UX 속도)

#### 에러 상태 — F.2 Spec

- vault 잠금: "Unlock your vault to run security checks." + 잠금 해제 버튼
- 네트워크 에러: "Couldn't connect to HIBP. Local checks completed." (로컬 결과는 표시)
- 명확한 에러 메시지 + 다음 액션 제시 (F.2 요건)

#### 키보드 접근성 — F.2 Spec

- [Run Check] 버튼: `Tab` 포커스 가능, `Enter` / `Space` 실행
- SecurityAlertCard: `Tab` 순회, [Fix] / [Dismiss] 버튼 포커스 링
- Radix UI 기반 shadcn 컴포넌트 사용 시 ARIA 자동 처리

#### i18n 키 목록 (4 로케일: en / ko / zh / ja)

| 키 | en 기본값 |
|:---|:---|
| `security.title` | Security |
| `security.run_check` | Run Security Check |
| `security.running` | Checking... |
| `security.last_checked` | Last checked: {{date}} |
| `security.never_checked` | Never |
| `security.all_clear` | All clear! No security issues found. |
| `security.no_history` | Your passwords haven't been checked yet. |
| `security.compromised_count` | {{count}} compromised |
| `security.weak_count` | {{count}} weak |
| `security.reused_count` | {{count}} reused |
| `security.twofa_count` | {{count}} without 2FA |
| `security.unsecured_count` | {{count}} unsecured |
| `security.alert.fix` | Fix |
| `security.alert.dismiss` | Dismiss |
| `security.alert.dismissed` | Dismissed |
| `security.opt_in_banner` | Enable HIBP check in Settings > Privacy for full protection. |
| `security.enable_hibp` | Enable HIBP Check |
| `security.vault_locked` | Unlock your vault to run security checks. |
| `security.network_error` | Couldn't connect to HIBP. Local checks completed. |

총 18+ 키, 4 로케일 × 18 = 72개 이상 번역 항목.

#### Vitest 테스트

| 테스트 ID | 시나리오 |
|:---|:---|
| T1 | 검사 이력 없음 → 빈 상태 CTA 렌더링 |
| T2 | 알림 있음 → SecurityAlertCard 렌더링 |
| T3 | [Run Check] 클릭 → `invoke` 호출 |
| T4 | 로딩 중 → 스피너 + 버튼 비활성화 |
| T5 | All clear → 초록 상태 메시지 |
| T6 | HIBP 비활성 → opt-in 배너 표시 |
| T7 | vault 잠금 에러 → 잠금 해제 안내 |

#### Definition of Done

1. `pnpm vitest run src/features/security` 7개 테스트 PASS
2. `pnpm typecheck` PASS
3. `pnpm lint` 0 error
4. 4 로케일 JSON 파일 완성 + i18n 키 누락 없음
5. Lighthouse 접근성 점수 90+ (또는 axe-core 검사 오류 0)
6. prefers-reduced-motion 적용: 애니메이션 있으면 `motion-safe:` Tailwind 클래스 사용
7. 키보드 Tab 순회 완전히 작동 (수동 검증 또는 Playwright 스크린샷)
8. shadcn 디자인 토큰만 사용 (hex 하드코딩 없음, Tailwind `text-destructive` 등 변수 기반)

#### F.2 Spec 적용 체크리스트

| F.2 항목 | 적용 방법 |
|:---|:---|
| 디자인 토큰만 | `text-destructive`, `text-warning`, `border-muted` 등 CSS var 사용 |
| prefers-reduced-motion | `motion-safe:animate-*` 클래스만 사용 |
| 마이크로 인터랙션 200ms | [Run Check] 버튼 상태 전환 `transition-all duration-150` |
| 빈 상태 친절한 안내 + CTA | Empty state 컴포넌트 2종 (미검사 / all clear) |
| 스켈레톤 | `<Skeleton />` (shadcn) 로딩 중 사용 |
| 명확한 에러 + 다음 액션 | 에러 배너 + 버튼 (잠금 해제 / 재시도) |
| 키보드 fully accessible | Radix UI 기반 shadcn 컴포넌트 + 포커스 링 |
| i18n 4 로케일 | en / ko / zh / ja security.json |

---

## 4. USER APPROVAL GATE 1 — 결정 필요 항목

아래 7개 항목은 implementator 호출 전 사용자 승인이 필요하다. 미승인 항목은 implementator가 임의로 결정하지 않고 보고 대기.

### GATE 1-1: HIBP 호출 opt-in 기본값

**배경**: Researcher §5.8 — GDPR/CCPA 컴플라이언스 및 투명성을 위해 default 비활성 권고.

**선택지**:
- **A (Researcher 권고)**: 기본값 비활성. 첫 실행 시 안내 배너로 활성화 유도. Settings > Privacy에서 토글.
- **B**: 기본값 활성. 명시적으로 k-anonymity 설명하는 온보딩 다이얼로그 1회 표시 후 진행.

**권고**: A안 (보수적). 비밀번호 매니저에서 외부 요청 발생 여부는 사용자가 명시적으로 인지해야 신뢰 확보에 유리.

**결정 필요**: 기본값 활성/비활성 선택.

---

### GATE 1-2: WatchtowerPage 사이드바 배치

**배경**: Researcher §5.7 — 옵션 A (신규 WatchtowerPage, 사이드바 전용 섹션) 권고.

**선택지**:
- **A (Researcher 권고)**: 사이드바에 "Security" 또는 "Watchtower" 신규 최상위 섹션. Inventory 아래 / Incidents 위.
- **B**: 기존 Incidents 페이지 하위 탭으로 통합. 사이드바 항목 수 유지.
- **C**: Settings > Security 하위 탭. 덜 가시적.

**권고**: A안. 1Password와 동일 패턴으로 직관성 높음. Incidents(외부 피드)와 로컬 비번 검사는 목적이 다르므로 혼합 금지.

**결정 필요**: 사이드바 배치 위치 선택.

---

### GATE 1-3: 스케줄 자동 실행 vs 온디맨드만

**배경**: Bitwarden은 온디맨드(사용자 버튼 클릭)만. 1Password는 Watchtower 자동 갱신(주기 불명). Researcher §B — 24h 스케줄러 권고.

**선택지**:
- **A**: 24h 자동 스케줄 + 수동 [Run Check] 버튼 병행.
- **B**: 온디맨드만 (Bitwarden 방식). 배터리/네트워크 영향 없음.
- **C**: vault unlock 시 자동 실행 (1Password 유사).

**트레이드오프**:
- A: 최신 상태 유지, 백그라운드 HIBP 호출 발생 (opt-in 상태여야 함)
- B: 사용자 인지 필요, 오래된 결과 가능
- C: 잦은 HIBP 호출 (unlock 빈도에 따라)

**결정 필요**: A / B / C 선택.

---

### GATE 1-4: Vulnerable / Compromised 별도 처리 vs 통합

**배경**: Researcher §3.2 — 1Password는 Vulnerable(비번 자체가 HIBP에 있음)과 Compromised(사이트 침해 후 미변경)를 별도 카테고리로 구분.

API Vault 현재 상황: HIBP `breachedaccount` (이메일 기반, 사이트 침해 검사)는 기존 `HibpClient`로 이미 구현됨. Phase 2-2B는 `PwnedPasswordsClient` (비번 자체 노출)를 추가.

**선택지**:
- **A**: 별도 카테고리 — "Compromised Password" (HIBP range) + 기존 incident 피드(이메일 breachedaccount) 연동.
- **B**: 통합 — `SecurityAlert.CompromisedPassword`에 두 원인 모두 포함.

**권고**: A안. 1Password 동등 목표에 부합, 사용자 혼란 감소.

**결정 필요**: 카테고리 분리 여부 + 기존 incident 피드와의 연동 방식.

---

### GATE 1-5: run_security_check 동시성 / Throttle 정책

**배경**: vault에 credential 1000개 시 HIBP 호출 1000 round-trip. HIBP 공식 "no rate limit" 명시이나 과도한 병렬 요청은 서비스 에티켓 위반 가능.

**선택지**:
- **A**: 순차 처리 + inter-request delay 100ms (1000개 = 약 100초). 안전하나 느림.
- **B**: 동시 N개 제한 (concurrency = 10) + `tokio::task::JoinSet`. 1000개 = 약 10초.
- **C**: 순차 처리 + delay 없음. 가장 빠르나 에티켓 논란 가능.

**권고**: B안 (concurrency = 10). HIBP가 rate limit 없다고 명시하나 동시 10개 정도가 합리적 에티켓. 빈 vault(0~50개)는 사실상 즉시 완료.

**결정 필요**: 동시성 전략 + delay 값.

---

### GATE 1-6: audit log 기록 범위

**배경**: B.1-6 — 모든 secret 작업 audit log. 그러나 24h 자동 스케줄러가 매일 기록하면 audit 체인이 과도하게 커질 수 있음.

**선택지**:
- **A**: 수동 실행만 audit log 기록. 자동 스케줄 실행은 tracing 로그만.
- **B**: 자동 실행도 audit log 기록 (매 24h마다 체인 항목 추가).
- **C**: 수동 + 자동 모두 기록하되, 자동 실행은 요약만 (alerts_count만, credential_id 없이).

**권고**: A안. audit log는 사용자 의도적 작업 기록이 목적. 백그라운드 자동화는 tracing으로 충분.

**결정 필요**: audit 기록 범위 선택.

---

### GATE 1-7: security_alerts 테이블 alert_meta 평문 저장 범위

**배경**: `alert_meta` JSON에 `exposure_count` (u64) 또는 `score` (u8) 저장. 이 값은 평문 비번이 아닌 메타데이터이나, credential이 취약하다는 사실 자체가 민감 정보일 수 있음.

**선택지**:
- **A (현재 권고)**: `alert_meta` 평문 JSON 저장. `exposure_count`, `score`, `domain` 저장 OK. credential ID와 연결되므로 vault 암호화 영역 밖.
- **B**: `alert_meta`도 vault 암호화 적용 (age). 구현 복잡도 증가, 조회 시 vault unlock 필수.

**권고**: A안. `exposure_count` / `score`는 메타데이터로 평문 비번이 아님. 단, 향후 팀 vault 도입 시 권한 제어 필요 (지금은 로컬 단일 사용자 전제).

**결정 필요**: 저장 방식 선택 + 향후 팀 vault 시 재검토 시점.

---

## 5. 위험 요소 및 완화 (Risks)

### R1: zxcvbn Score PartialOrd 미구현 — HIGH

**위험**: Researcher 코드 `score() <= Score::Two` 컴파일 실패 가능.
**완화**: implementator 시작 전 `docs.rs/zxcvbn/3.1.1/zxcvbn/enum.Score.html` 직접 확인. 미구현 시 `matches!` 매크로로 대체 — 동등 기능, 컴파일 보장.
**영향 범위**: 2-2B-2 단독.

### R2: 2fa.directory JSON 스키마 변경 — MEDIUM

**위험**: 2fa.directory v4 JSON 구조가 문서와 다를 경우 파싱 실패.
**완화**: `serde_json::Value`로 먼저 파싱 후 도메인 추출. unknown field를 무시하는 관대한 파싱. 실패 시 `MissingTwoFactor` 검사 스킵 (HIBP / weak / reused는 독립 실행).
**영향 범위**: 2-2B-2 부분.

### R3: HIBP 서비스 장애 — LOW (발생 빈도), HIGH (사용자 경험)

**위험**: HIBP API 일시 다운 시 `run_security_check` 부분 실패.
**완화**: HIBP 실패 시 로컬 검사(weak/reused/2FA/unsecured) 결과만 반환. UI에서 "Local checks completed. HIBP unavailable." 명확히 표시 (§3.5 에러 상태).
**영향 범위**: 2-2B-4, 2-2B-5.

### R4: Credential 모델 `totp_uri` 필드 부재 — MEDIUM

**위험**: `Credential` 모델에 현재 `totp_uri` 필드 없음 (credential.rs 확인). 2FA 미설정 검출 시 "이미 TOTP 있는 credential" 판별 불가.
**완화**: 단기 — `secondary_value_ref`가 TOTP 용도인지 `name` / `label` 기반으로 추론. 장기 — credential 모델에 `totp_uri: Option<String>` 필드 추가 (별도 마이그레이션). Phase 2-2B-2 구현 시 이 문제를 명시하고 fallback 로직 구현.
**영향 범위**: 2-2B-2, 추가 migration 필요 가능.

### R5: 대규모 vault에서 스케줄러 성능 — LOW

**위험**: credential 1000개 × HIBP 순차 호출 = 약 100초 (delay 100ms 기준).
**완화**: GATE 1-5 결정에 따라 동시성 N=10 적용 시 약 10초로 단축. vault unlock 상태에서만 실행 + 백그라운드 tokio task — UI 블로킹 없음.
**영향 범위**: 2-2B-3.

### R6: audit log 체인 무결성 — LOW

**위험**: `run_security_check` audit entry가 체인에 삽입 시 기존 체인 무결성 영향 가능.
**완화**: 기존 `audit.rs` 패턴 (`prev_hash` 연결) 그대로 준용. 신규 action string만 추가.
**영향 범위**: 2-2B-4.

---

## 6. 통합 검증 (Integration Check)

### 기존 hibp.rs 와의 충돌 여부

- `HibpClient`: base URL `https://haveibeenpwned.com/api/v3`, API 키 필수, `breaches`/`breachedaccount` 전용
- `PwnedPasswordsClient` (신규): base URL `https://api.pwnedpasswords.com`, API 키 불필요, `range/{prefix}` 전용
- **충돌 없음**: 완전히 별도 struct, 별도 base URL, 별도 인증 방식. `lib.rs`에 `pub mod pwned_passwords;` 추가만 하면 됨.
- `governor` rate limiter: `HibpClient`는 10 RPM limiter 내장. `PwnedPasswordsClient`는 rate limit 없으므로 governor 미사용 (GATE 1-5의 동시성 제어는 별도 메커니즘).

### feed_scheduler.rs 패턴 재사용

기존 `spawn_feed_scheduler`의 `tokio::task::JoinSet` + `CancellationToken` 패턴을 `spawn_security_check_poller`에 그대로 적용. 기존 스케줄러와는 별도 task로 실행 — 상호 간섭 없음. `FeedSchedulerConfig`에 `security_check_enabled: bool` 필드 추가 또는 별도 `SecurityCheckConfig` 신규.

### audit log chain 확장

기존 `src-tauri/crates/api-vault-app/src/commands/audit.rs`의 `AuditEntry` 구조체 + `audit_list` command 그대로 사용. `action` string에 `"security_check_run"` 추가. chain 자체는 변경 없음 (prev_hash 연결 로직 재사용).

### M24 다른 sub-task 와의 충돌

- Phase 2-3-a의 `ImportSessionStore`: 완전히 독립된 모듈 (`commands/import.rs`) — 충돌 없음.
- Phase 3-A (신용카드): `CredentialKind::CreditCard` 추가 예정이나 Phase 2-2B 완료 후 진입이므로 충돌 없음. 단, `security_check.rs`에서 `CredentialKind` 분기 시 `CreditCard` 케이스 추가는 Phase 3-A에서 처리.
- `Credential` 모델의 `totp_uri` 필드 부재 (R4): Phase 2-2B-2에서 fallback 로직 + 별도 마이그레이션 검토.

### Implementator 호출 순서 권고

```
2-2B-1 (PwnedPasswordsClient)
    ↓
2-2B-2 (security_check.rs — 로컬 3종 + SecurityAlert 타입 정의)
    ↓
2-2B-3 (SQLite migration + Repo + scheduler)
    ↓
2-2B-4 (Tauri command + audit)
    ↓
2-2B-5 (WatchtowerPage UI)
```

각 sub-task는 순서 의존성이 있으므로 병렬 실행 금지. 단, 2-2B-1과 2-2B-2의 로컬 3종 검사(weak/reused/2FA)는 타입 설계 후 독립 구현 가능.

### 출처 신뢰도 최종 요약

구현에 직접 사용하는 출처별 신뢰도:

| 사용 목적 | 출처 | 신뢰도 |
|:---|:---|:---|
| HIBP base URL 확인 | haveibeenpwned.com/API/v3 | HIGH |
| Add-Padding 헤더 | troyhunt.com 블로그 + Cloudflare | HIGH |
| zxcvbn API 시그니처 | docs.rs/zxcvbn | HIGH |
| zxcvbn score ≤ 2 임계값 | bitwarden/clients PR #11252 | HIGH |
| 2fa.directory API | 2fa.directory/api/ + GitHub | HIGH |
| SecretBox / ConstantTimeEq | docs.rs 공식 문서 | HIGH |
| Bitwarden zxcvbn moderator 확인 | community.bitwarden.com | MEDIUM (PR로 교차 확인) |
| deepwiki.com | - | LOW — 미사용 권고 |

---

*본 보고서는 `docs/research_phase2_2b_password_check.md` (Researcher 입력)과 `docs/project-decisions.md` (보안 결정 B.1)을 기반으로 작성되었습니다.*
*Researcher 코드 스니펫은 참조 패턴으로 사용하며, implementator는 §1 [검증 1~5] 항목을 직접 확인 후 적용해야 합니다.*
*보안 critical 영역이므로 의심스러운 부분은 보수적으로 처리하고, LLM만 믿지 않고 외부 보안 감사 출시 전 1회 필수 (project-decisions.md B.4 항목).*
