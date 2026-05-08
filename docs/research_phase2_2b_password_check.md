# Phase 2-2B 리서치: Watchtower 동등 풀체인 비밀번호 보안 검사

> 작성일: 2026-05-07  
> 목적: Secretbank M24 Phase 2-2B (HIBP Pwned Passwords + 약한 비번 + 재사용 + 2FA 검출) implementator 사양 작성 기초 자료

---

## 0. 요약

| 항목                   | 결론                                                                                               |
| ---------------------- | -------------------------------------------------------------------------------------------------- |
| HIBP Pwned Passwords   | k-anonymity prefix 5자 SHA-1, `Add-Padding: true` 필수, API 키 불필요, rate limit 없음             |
| Rust strength lib      | `zxcvbn` crate v3.1.1 — 점수 ≤ 2 = "약함" (Bitwarden 기준 확인)                                    |
| 1P Watchtower 카테고리 | Vulnerable(HIBP) / Compromised(사이트 침해) / Weak / Reused / Unsecured / 2FA Available / Expiring |
| BW Reports 카테고리    | Exposed / Reused / Weak / Unsecured / Inactive 2FA / Data Breach — 모두 Premium                    |
| 메모리 안전            | `SecretBox<String>` → SHA-1 prefix 추출 → 즉시 drop, 결과(count)만 보존                            |
| 2FA 데이터             | `https://api.2fa.directory/v4/totp.json` (MIT, 서명 파일 포함)                                     |
| IPC 패턴               | password 평문 IPC 미통과 — Rust side 에서 전체 처리, 결과만 반환                                   |

---

## 1. HIBP Pwned Passwords API v3

### 1.1 엔드포인트 스펙

**공식 문서**: `https://haveibeenpwned.com/API/v3` (섹션: Pwned Passwords)

```
GET https://api.pwnedpasswords.com/range/{prefix}
```

- `{prefix}` = SHA-1(password)의 **대문자 hex 상위 5자** (10비트 prefix → 2^20 = 1,048,576 가지 버킷)
- **인증 불필요** — API 키 없음 (breaches/pastes 엔드포인트와 다름)
- **Rate limit 없음** (공식 문서 명시: "no rate limit on the Pwned Passwords API")
- HTTPS TLS 1.2+ 필수
- `User-Agent` 헤더 — 문서상 "권장" 수준, 필수는 아님. 프로젝트 관례상 `secretbank/0.1.0` 사용

**정상 응답**: 항상 HTTP 200 (모든 1,048,576 prefix에 데이터 존재)

### 1.2 해시 모드

| 모드         | 쿼리          | suffix 길이                       | 용도                               |
| ------------ | ------------- | --------------------------------- | ---------------------------------- |
| SHA-1 (기본) | 파라미터 없음 | 35자 (총 40 - prefix 5)           | 표준, 인터넷 유출 비번 체크        |
| NTLM         | `?mode=ntlm`  | 27자 (NTLM hash = 32자, prefix 5) | Windows Active Directory 환경 전용 |

**Secretbank 권고**: SHA-1 모드만 구현. NTLM은 데스크톱 앱 비번 매니저 유스케이스에 불필요.

### 1.3 응답 형식

```
0018A45C4D1DEF81644B54AB7F969B88D65:1   ← suffix(35자):출현횟수
00D4F6E8FA6EECAD2A3AA415EEC418D38EC:2
011053FD0102E94D6AE2F8B83D76FAF94F6:1
...
```

- 한 줄 = `<35-char hex suffix>:<count>` (CRLF 또는 LF 둘 다 가능)
- padding 미적용 시 약 800라인 평균
- suffix는 **대문자 hex**

### 1.4 Add-Padding 헤더 (보안 best practice)

**Troy Hunt 블로그 (2020-03-04)**: `https://www.troyhunt.com/enhancing-pwned-passwords-privacy-with-padding/`  
**Cloudflare 블로그**: `https://blog.cloudflare.com/pwned-passwords-padding-ft-lava-lamps-and-workers/`

```http
GET https://api.pwnedpasswords.com/range/21BD1
Add-Padding: true
```

**동작**:

- 응답 행 수를 **800~1000라인** 사이로 패딩 (랜덤 suffix + count=0)
- padding 행: `count = 0` → 클라이언트가 **반드시 필터링** (count > 0 행만 사용)
- 목적: TLS 트래픽 크기 분석으로 어느 prefix를 조회했는지 추론하는 공격 방지

**위협 모델**: HTTPS를 쓰더라도 패킷 크기 side-channel로 prefix 추측 가능 → padding이 이를 차단.

**충돌 확률**: 619 / (2^35 × 4) ≈ 4.44×10^-40 → 무시 가능.

**Secretbank 구현 지시**: `Add-Padding: true` 헤더 항상 포함.

### 1.5 k-anonymity 프로세스 (정확한 플로우)

```
password (plaintext, SecretBox 래핑)
    │
    ▼ SHA-1 compute (digest crate)
SHA-1 hash = 40자 hex 대문자
    │
    ├── prefix = hash[0..5]   ← 이것만 API 전송
    └── suffix = hash[5..40]  ← 로컬에서만 사용, 비교 후 즉시 drop
    │
    ▼ GET /range/{prefix} + Add-Padding: true
응답: 수백~천 개의 suffix:count 라인
    │
    ▼ suffix 목록에서 local suffix 검색 (ConstantTimeEq)
found → count 보존 (노출 횟수)
not found → count = 0 (안전)
    │
    ▼ plaintext password memory → zeroize (SecretBox drop)
```

### 1.6 라이선스 및 사용 조건

- Pwned Passwords 데이터는 **Creative Commons Attribution 4.0 International (CC-BY 4.0)** — 출처 표기 조건
- API 자체는 별도 라이선스 없음 (무료 사용)
- 합리적 사용 요청: 과도한 병렬 요청 자제

### 1.7 기존 코드와의 차이점

현재 `hibp.rs`의 `HibpClient`는 `breachedaccount` + `breaches` 엔드포인트 전용이며:

- base URL: `https://haveibeenpwned.com/api/v3` (API 키 필요)
- Pwned Passwords는 **별도 base URL**: `https://api.pwnedpasswords.com`
- API 키 불필요 → 별도 `PwnedPasswordsClient` 구조체 권장

---

## 2. zxcvbn-rs — Rust 비밀번호 강도 라이브러리

### 2.1 crate 정보

| 항목         | 값                                         |
| ------------ | ------------------------------------------ |
| crate 이름   | `zxcvbn`                                   |
| 최신 버전    | **3.1.1** (2024년 기준)                    |
| docs.rs      | `https://docs.rs/zxcvbn`                   |
| crates.io    | `https://crates.io/crates/zxcvbn`          |
| GitHub       | `https://github.com/shssoichiro/zxcvbn-rs` |
| 라이선스     | MIT                                        |
| Rust edition | 2021                                       |
| no_std       | 불가 (std 의존)                            |

### 2.2 API 시그니처

```rust
pub fn zxcvbn(password: &str, user_inputs: &[&str]) -> Entropy
```

- `password`: 평문 비밀번호 (`&str`)
- `user_inputs`: 사용자 관련 입력 (username, email 등) — 이런 정보가 비번에 들어있으면 감점
- 반환: `Entropy` 구조체

**v3.0.0 변경**: 이전 `Result<Entropy, ZxcvbnError>` → 현재 `Entropy` (에러 불가)

```rust
pub struct Entropy {
    // pub 필드 혹은 메서드
    pub fn score(&self) -> Score;          // Score enum (0-4)
    pub fn guesses(&self) -> u64;          // 추정 guess 횟수
    pub fn crack_times(&self) -> CrackTimes; // 크랙 시간 추정
    pub fn feedback(&self) -> Option<&Feedback>; // 사용자 피드백 (v3: Option)
    pub fn sequence(&self) -> &[Match];    // 패턴 매치 결과
}
```

### 2.3 Score 의미 및 임계값

| Score | 의미                  | Guess 범위 | Bitwarden 처리                 | 1Password 처리 |
| ----- | --------------------- | ---------- | ------------------------------ | -------------- |
| 0     | Too guessable / Risky | < 10^3     | Weak Report 포함               | Weak 경고      |
| 1     | Very guessable        | < 10^6     | Weak Report 포함               | Weak 경고      |
| **2** | Somewhat guessable    | < 10^8     | **Weak Report 포함** (≤2 기준) | Weak 경고      |
| 3     | Safely unguessable    | < 10^10    | 정상                           | 정상           |
| 4     | Very unguessable      | ≥ 10^10    | 정상                           | 강함           |

**Bitwarden 공식 기준**: score ≤ 2 → "very weak" → Weak Passwords Report 포함  
(출처: Bitwarden Community Forum 공식 moderator 답변)

**Secretbank 권고 임계값**: `score <= Score::Two` (= zxcvbn 2 이하) + 추가로 길이 < 8자 강제 체크

### 2.4 zxcvbn이 인식하는 패턴

- 30,000개 공통 비밀번호 사전
- 미국 Census 성명 데이터
- Wikipedia/영화/TV 인기 단어
- 날짜 패턴 (2024-01-01, 20240101 등)
- 반복 패턴 (aaaa, 1111)
- 순서 패턴 (abcd, 1234)
- 키보드 패턴 (qwerty, zxcvbn 등)
- l33t speak (p4ssw0rd)

### 2.5 메모리 안전 고려 사항

`zxcvbn(password: &str, ...)` — `&str`을 받으므로 caller가 `SecretBox`에서 잠깐 expose 후 즉시 drop해야 함:

```rust
// 권장 패턴 (pseudo-code)
let secret_pw: SecretBox<String> = /* vault에서 복호화 */;
let score = {
    let plain = secret_pw.expose_secret(); // 스코프 내에서만 노출
    zxcvbn(plain, &[]).score()
    // plain 레퍼런스는 이 블록 끝에서 해제
};
// secret_pw가 drop되면 zeroize 실행
```

zxcvbn 내부적으로 `&str` 기반으로 처리하며 결과 `Entropy`는 score 등 숫자값만 포함 → plaintext 누수 없음.

### 2.6 성능 추정

- 공식 벤치마크 수치는 공개되지 않음
- Dropbox 원본 JS 라이브러리: 대부분 비밀번호 < 1ms
- Rust 포팅: JS 대비 10~50배 빠른 경향
- 추정: 일반 비밀번호 기준 **< 0.5ms per evaluation** (Tauri 데스크톱 환경)
- 1000개 비밀번호 배치 평가: 추정 < 100ms (UI block 없음)

### 2.7 대안 비교

| crate           | 특징                                           | 권고 여부 |
| --------------- | ---------------------------------------------- | --------- |
| `zxcvbn` v3.1.1 | Dropbox 원본 포팅, 가장 넓은 채택              | **채택**  |
| `passwords`     | 단순 규칙 기반 (길이·문자조합), 패턴 인식 없음 | 부적합    |
| `passdata`      | 존재하나 문서 부족, 유지보수 불명확            | 부적합    |
| 직접 구현       | 보안 절대 원칙 B.1 위반                        | 금지      |

---

## 3. 1Password Watchtower 분석

### 3.1 카테고리 전체 목록

공식 지원 문서: `https://support.1password.com/watchtower/`  
개인정보 문서: `https://support.1password.com/watchtower-privacy/`

| 카테고리                 | 탐지 방법                       | 데이터 소스                                          | 처리 위치                  |
| ------------------------ | ------------------------------- | ---------------------------------------------------- | -------------------------- |
| **Vulnerable Passwords** | password SHA-1 prefix → HIBP    | haveibeenpwned.com Pwned Passwords                   | 로컬 (prefix만 전송)       |
| **Compromised Websites** | 사이트 침해 후 비번 미변경 체크 | watchtower.1password.com 침해 DB                     | 로컬 (웹사이트 URL 미전송) |
| **Weak Passwords**       | 강도 추정 알고리즘              | 로컬 전용                                            | 완전 로컬                  |
| **Reused Passwords**     | vault 내 동일 비번 그룹화       | 로컬 전용                                            | 완전 로컬                  |
| **Unsecured Websites**   | URL이 `http://`로 시작하는지    | 로컬 전용                                            | 완전 로컬                  |
| **2FA Available**        | 사이트가 2FA 지원하는지         | watchtower.1password.com 2FA DB (TwoFactorAuth 기반) | 로컬 비교                  |
| **Expiring Items**       | 아이템 만료 날짜 필드           | 로컬 전용                                            | 완전 로컬                  |

### 3.2 "Vulnerable" vs "Compromised" 구분

이 구분은 Secretbank 구현에서도 그대로 채용할 수 있음:

| 용어                    | 정확한 의미                                                      | 심각도                         |
| ----------------------- | ---------------------------------------------------------------- | ------------------------------ |
| **Vulnerable Password** | 이 비번 자체가 HIBP DB에 있음 (어느 사이트에서 쓰든 위험)        | 높음 — 비번 변경 필수          |
| **Compromised Website** | 해당 사이트가 침해를 당했고, 사용자가 그 이후 비번을 바꾸지 않음 | 높음 — 사이트별 비번 변경 필수 |

두 항목은 독립적: 침해당한 사이트에 안전한 비번을 쓰면 Compromised만 뜨고, HIBP에 있는 비번을 비침해 사이트에 쓰면 Vulnerable만 뜸.

### 3.3 UI 위치 및 네비게이션

1Password 앱 기준:

- 사이드바에 **"Watchtower"** 전용 섹션 (최상위 네비게이션 아이템)
- 클릭 시 대시보드 뷰: 카테고리별 아이템 수 카드 나열
- 각 카드에 "Show items" → 해당 카테고리 아이템 목록
- **Watchtower Score** (0~1000 추정): 위험 항목을 해소할수록 상승 (알고리즘 비공개)

### 3.4 사용자 dismiss 가능 여부

- **2FA Available**: "Ignore" 옵션 있음 (해당 사이트에서 2FA 설정 의사 없을 때)
- **Vulnerable Passwords**: opt-out 가능 (1Password 설정에서 해제)
- **나머지**: 공식 문서에 dismiss 언급 없음 — 실제로 해결해야만 해소

### 3.5 Privacy 아키텍처

```
Reused / Weak / Unsecured / Expiring  →  완전 로컬 (외부 요청 없음)
Vulnerable Passwords                  →  prefix 5자만 HIBP 전송
Compromised Websites / 2FA Available  →  watchtower.1password.com에서 전체 DB 다운로드 → 로컬 비교
                                         (개별 URL/비번은 전송하지 않음)
```

---

## 4. Bitwarden Vault Health Reports

### 4.1 6종 리포트 상세

공식 문서: `https://bitwarden.com/help/reports/`

| 리포트                 | 기술 방법                                            | 프리미엄 필요 |
| ---------------------- | ---------------------------------------------------- | ------------- |
| **Exposed Passwords**  | SHA-1 prefix 5자 → HIBP Pwned Passwords k-anonymity  | Premium       |
| **Reused Passwords**   | 동일 비번 vault 내 중복 탐색 (로컬)                  | Premium       |
| **Weak Passwords**     | zxcvbn 알고리즘, score ≤ 2 = weak                    | Premium       |
| **Unsecured Websites** | URI scheme `http://` 체크 (로컬)                     | Premium       |
| **Inactive 2FA**       | vault URI → 2fa.directory 데이터셋 교차 검증         | Premium       |
| **Data Breach**        | HIBP `/breachedaccount/{email}` (이메일 해시 prefix) | **Free**      |

### 4.2 Exposed Passwords 기술 구현

Bitwarden 공식 설명:

> "hashing passwords and sending only the first five digits of the hash to a trusted service, then performs locally compared full hash matching to preserve privacy"

- 해시 함수: SHA-1 (HIBP 표준)
- prefix 길이: 5자
- 비교: 로컬
- 호출 패턴: **on-demand** (사용자가 리포트 버튼 클릭 시) — 스케줄 아님

### 4.3 Weak Password Report — zxcvbn 임계값 확인

Bitwarden Community Forum 공식 moderator 답변:

> "Bitwarden uses the zxcvbn strength tester, and considers a score of 2/4 or lower to be 'very weak', which makes it appear in the Weak Passwords Report."

따라서 임계값: **score ∈ {0, 1, 2}** → Weak Report 포함  
zxcvbn v3 Score enum: `Score::Zero`, `Score::One`, `Score::Two` → 모두 포함

### 4.4 Inactive 2FA Report

- 데이터 소스: `2fa.directory` (구 `twofactorauth.org`)
- API: `https://api.2fa.directory/v4/totp.json` (TOTP 지원 사이트 목록)
- vault 아이템 URI → 도메인 추출 → 2fa.directory 목록과 교차 검증
- TOTP 키(`otp://`)가 이미 vault에 저장된 경우 → report 제외
- **실시간 API 호출 vs 번들 데이터** — Bitwarden은 실시간 호출, 1Password는 사전 다운로드

### 4.5 Free vs Premium 경계

- Data Breach (이메일 침해 체크) = **Free** — HIBP는 이메일 endpoint에 API 키 필요하므로 Bitwarden이 서버 측에서 처리
- 나머지 5종 = **Premium** — 로컬 처리이지만 기능 제한으로 잠금

**Secretbank 전략 권고**: 모든 검사를 로컬 처리(이미 vault는 로컬) + HIBP Pwned Passwords(API 키 불필요)는 무료로 제공 가능. 이메일 breachedaccount는 이미 별도 HIBP API 키 필요 (기존 구현).

---

## 5. Secretbank 통합 권고

### 5.1 아키텍처 전체 흐름

```
[Frontend]                    [Rust Backend]
  │                                │
  │  invoke("run_security_check")  │
  ├──────────────────────────────►│
  │                                │ 1. vault에서 credential 목록 로드
  │                                │ 2. 각 credential.password → SecretBox 래핑
  │                                │ 3. PwnedPasswordsClient.check(pw) [async]
  │                                │    - SHA-1 → prefix 5자 추출 → drop
  │                                │    - GET /range/{prefix}?Add-Padding=true... 아니 헤더
  │                                │    - suffix 로컬 비교 → count만 보존
  │                                │ 4. zxcvbn(pw) → score → drop pw
  │                                │ 5. 재사용 검출: SHA-256 in-memory hashmap
  │                                │ 6. 2FA 미설정: 2fa.directory 교차
  │                                │ 7. SecureCheckResult 집계
  │◄──────────────────────────────│
  │  Vec<SecurityAlert> (직렬화)  │
  │  (평문 비번 포함 안 됨)       │
```

### 5.2 메모리 안전 패턴

**절대 원칙**: plaintext password는 IPC를 절대 통과하지 않음. Rust side에서 전체 처리.

```rust
// PwnedPasswordsClient::check 내부 (권장 패턴)
use secrecy::{ExposeSecret, SecretBox};
use sha1::{Digest, Sha1};
use subtle::ConstantTimeEq;
use zeroize::Zeroize;

pub async fn check_password(
    &self,
    password: &SecretBox<String>,
) -> Result<u64, PwnedError> {
    // 1. SHA-1 계산 — plaintext 노출 최소화
    let (prefix, suffix_bytes) = {
        let plain = password.expose_secret();
        let mut hasher = Sha1::new();
        hasher.update(plain.as_bytes());
        let hash = hasher.finalize(); // [u8; 20]

        // hex 변환 (대문자)
        let hex: String = hash.iter()
            .map(|b| format!("{:02X}", b))
            .collect();

        // prefix = 처음 5자, suffix = 나머지 35자
        let prefix = hex[0..5].to_string();
        let suffix = hex[5..].to_string();
        (prefix, suffix)
        // plain은 이 블록 끝에서 해제 (SecretBox는 유지)
    };

    // 2. API 호출 (prefix만 전송)
    let response = self.http
        .get(format!("{}/range/{}", PWNED_BASE_URL, prefix))
        .header("Add-Padding", "true")
        .header("User-Agent", "secretbank/0.1.0")
        .send()
        .await?
        .text()
        .await?;

    // 3. suffix 비교 (timing-safe)
    let suffix_upper = suffix_bytes.to_uppercase();
    for line in response.lines() {
        let parts: Vec<&str> = line.splitn(2, ':').collect();
        if parts.len() == 2 {
            let count: u64 = parts[1].trim().parse().unwrap_or(0);
            if count == 0 { continue; } // padding 행 스킵

            // subtle::ConstantTimeEq 사용 (timing attack 방지)
            if parts[0].as_bytes().ct_eq(suffix_upper.as_bytes()).into() {
                return Ok(count); // 노출 횟수 반환
            }
        }
    }

    Ok(0) // 미발견 = 안전
}
```

**주의사항**:

- `subtle::ConstantTimeEq`는 길이가 다르면 short-circuit — 길이 35자로 동일하므로 문제 없음
- `password` 자체는 `SecretBox<String>`으로 caller가 관리 — drop 시 zeroize 자동
- response body(평문 hash 목록)는 민감정보 아님 — 일반 String으로 처리 가능

### 5.3 재사용 검출 패턴

```rust
use std::collections::HashMap;
use sha2::{Digest, Sha256};

fn detect_reused(credentials: &[Credential]) -> Vec<ReuseGroup> {
    // SHA-256 fingerprint → [credential_id] 매핑
    let mut map: HashMap<[u8; 32], Vec<Uuid>> = HashMap::new();

    for cred in credentials {
        if let Some(pw) = &cred.password {
            let plain = pw.expose_secret();
            let mut h = Sha256::new();
            h.update(plain.as_bytes());
            let hash: [u8; 32] = h.finalize().into();
            // plain 즉시 해제 (노출 최소화)
            map.entry(hash).or_default().push(cred.id);
        }
    }

    map.into_iter()
        .filter(|(_, ids)| ids.len() >= 2)
        .map(|(_, ids)| ReuseGroup { credential_ids: ids })
        .collect()
}
```

- SHA-256 fingerprint는 로컬 in-memory에만 존재, 외부 전송 없음
- 매핑 완료 후 HashMap 자체를 zeroize 필요 여부: [u8; 32]는 공개 hash이므로 엄밀히 필수는 아니나, 민감한 파생 데이터이므로 scope 제한 권장

### 5.4 약한 비밀번호 검출 기준

```rust
use zxcvbn::zxcvbn;

fn is_weak(password: &SecretBox<String>, user_inputs: &[&str]) -> bool {
    let plain = password.expose_secret();

    // 기준 1: zxcvbn score ≤ 2 (Bitwarden/1Password 동등)
    let entropy = zxcvbn(plain, user_inputs);
    if entropy.score() <= zxcvbn::Score::Two {
        return true;
    }

    // 기준 2: 길이 < 8자 (추가 안전망)
    if plain.len() < 8 {
        return true;
    }

    false
    // plain 해제됨 (SecretBox는 유지)
}
```

### 5.5 2FA 미설정 검출

```rust
const TOTP_DATA_URL: &str = "https://api.2fa.directory/v4/totp.json";

// 캐시 TTL: 24시간 (feed_scheduler 패턴 재사용)
// 로컬 SQLite에 도메인 목록 저장
// credential.url 도메인 추출 → 2FA 지원 여부 확인
// credential에 TOTP 키가 이미 있으면 → 체크 제외

fn check_2fa_missing(cred: &Credential, totp_supported_domains: &HashSet<String>) -> bool {
    let domain = extract_domain(&cred.url)?;
    let supports_2fa = totp_supported_domains.contains(&domain);
    let has_totp = cred.totp_uri.is_some();

    supports_2fa && !has_totp
}
```

**2fa.directory API v4 상세**:

- URL: `https://api.2fa.directory/v4/totp.json`
- 서명: `https://api.2fa.directory/v4/totp.json.sig` (PGP)
- 라이선스: MIT (출처 표기 필요)
- 응답 형식: JSON (도메인 → 상세 정보 매핑)
- 갱신 주기: 24h 캐시 권장

### 5.6 SecurityCheckResult 구조체 설계

```rust
#[derive(Debug, Clone, serde::Serialize)]
pub struct SecurityCheckResult {
    pub credential_id: Uuid,
    pub alerts: Vec<SecurityAlert>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub enum SecurityAlert {
    /// HIBP Pwned Passwords에서 발견된 노출 횟수
    CompromisedPassword { exposure_count: u64 },

    /// zxcvbn score ≤ 2 또는 길이 < 8
    WeakPassword { score: u8, reason: String },

    /// 동일 비번을 사용하는 다른 credential ID 목록
    ReusedPassword { also_used_by: Vec<Uuid> },

    /// 2FA 지원 사이트인데 TOTP 미설정
    MissingTwoFactor { domain: String },

    /// HTTP URL (미암호화)
    UnsecuredWebsite { url: String },
}

// IPC 전송: 평문 비번 없음, credential_id + alert 종류만
```

### 5.7 UI 위치 권고

**옵션 비교**:

| 옵션                   | 장점                                    | 단점                                                |
| ---------------------- | --------------------------------------- | --------------------------------------------------- |
| A: 신규 WatchtowerPage | 1Password/Bitwarden과 동일 패턴, 직관적 | 네비게이션 depth 추가                               |
| B: IncidentsPage 통합  | 기존 인프라 재사용                      | Incidents(외부 피드)와 로컬 검사를 혼합 → 개념 혼란 |
| C: Sidebar 새 카테고리 | 가시성 높음                             | 사이드바 항목 증가                                  |

**권고: 옵션 A (신규 WatchtowerPage)**

1Password와 동일하게 사이드바에 "Security" 또는 "Watchtower" 전용 섹션 추가.  
인시던트 피드(외부 침해 뉴스)와 로컬 비번 검사는 목적이 다르므로 분리.

**BentoCard 배지 우선순위** (하나의 credential에 여러 alert 시):

```
CompromisedPassword (빨강/destructive) >
WeakPassword (주황/warning) >
ReusedPassword (주황/warning) >
MissingTwoFactor (노랑/secondary) >
UnsecuredWebsite (회색/muted)
```

shadcn/ui 배지 variant 매핑:

- `CompromisedPassword` → `<Badge variant="destructive">`
- `WeakPassword` / `ReusedPassword` → `<Badge variant="outline" className="border-orange-500 text-orange-500">`
- `MissingTwoFactor` → `<Badge variant="secondary">`
- `UnsecuredWebsite` → `<Badge variant="outline">`

BentoCard 아이템 카드에는 **최고 우선순위 배지 1개만** 표시. 상세 페이지에서 전체 목록 표시.

### 5.8 Settings 토글 — HIBP 호출 opt-in

**k-anonymity임에도 opt-in이 필요한 이유**:

- prefix 5자만 전송하지만 사용자에게 "외부 요청이 발생함"을 명시적으로 알려야 함
- GDPR/CCPA 컴플라이언스: 데이터 전송 동의 요건

```
Settings > Privacy & Security
  ☑ Check passwords against Have I Been Pwned
  (Only the first 5 characters of a SHA-1 hash are sent.
   Your actual password never leaves this device.)
```

기본값: **비활성** (처음 실행 시 안내 배너로 활성화 유도)

---

## 6. 신규 crate 의존성 목록

`secretbank-feeds/Cargo.toml` 또는 신규 `secretbank-security` crate에 추가:

```toml
# HIBP Pwned Passwords SHA-1
sha1 = { version = "0.10", features = ["oid"] }  # RustCrypto hashes

# Password strength
zxcvbn = "3.1"

# Timing-safe comparison (이미 subtle 포함 여부 확인 필요)
subtle = "2.6"

# 재사용 fingerprint용 (이미 sha2 = "0.10" workspace에 있음)
# sha2 = { workspace = true }  ← 이미 존재
```

**기존 workspace 의존성 재사용 가능**:

- `secrecy = "0.10"` — 이미 있음 (`secretbank-crypto`)
- `zeroize = "1"` — 이미 있음
- `sha2 = "0.10"` — 이미 있음 (재사용 fingerprint에 사용)
- `reqwest` — 이미 있음
- `governor` — 이미 있음 (HIBP rate limiter는 불필요하나 재사용 가능)

**새로 추가 필요**:

- `sha1 = "0.10"` — SHA-1 (HIBP 전용; sha2와 별개)
- `zxcvbn = "3.1"`
- `subtle = "2.6"` — timing-safe 비교 (기존 코드에 없으면)

---

## 출처 표

| URL                                                                              | 신뢰도                      | 주제                             | 날짜          |
| -------------------------------------------------------------------------------- | --------------------------- | -------------------------------- | ------------- |
| `https://haveibeenpwned.com/API/v3`                                              | HIGH (공식 문서)            | HIBP API 전체 스펙               | 상시 업데이트 |
| `https://www.troyhunt.com/enhancing-pwned-passwords-privacy-with-padding/`       | HIGH (저자 직접)            | Add-Padding 헤더 스펙            | 2020-03       |
| `https://blog.cloudflare.com/pwned-passwords-padding-ft-lava-lamps-and-workers/` | HIGH (Cloudflare 공식)      | Padding 구현 및 보안 분석        | 2020          |
| `https://docs.rs/zxcvbn/latest/zxcvbn/`                                          | HIGH (공식 docs.rs)         | zxcvbn API 시그니처              | 2024          |
| `https://crates.io/crates/zxcvbn`                                                | HIGH (공식 레지스트리)      | 버전, 다운로드 현황              | 2024          |
| `https://github.com/shssoichiro/zxcvbn-rs`                                       | HIGH (소스)                 | CHANGELOG, 유지보수 상태         | 2024          |
| `https://support.1password.com/watchtower/`                                      | HIGH (공식 지원 문서)       | Watchtower 카테고리 전체         | 2024          |
| `https://support.1password.com/watchtower-privacy/`                              | HIGH (공식 지원 문서)       | Privacy 아키텍처, 로컬 처리 여부 | 2024          |
| `https://bitwarden.com/help/reports/`                                            | HIGH (공식 문서)            | 6종 리포트 상세 스펙             | 2024          |
| `https://community.bitwarden.com/t/how-does-weak-password-report-work/94620`     | MEDIUM (커뮤니티 moderator) | zxcvbn score ≤ 2 임계값 확인     | 2023          |
| `https://2fa.directory/api/`                                                     | HIGH (공식 API 문서)        | 2fa.directory v4 엔드포인트      | 2024          |
| `https://github.com/2factorauth/twofactorauth`                                   | HIGH (공식 소스)            | 라이선스, 데이터 형식            | 2024          |
| `https://docs.rs/secrecy/latest/secrecy/struct.SecretBox.html`                   | HIGH (공식 docs.rs)         | SecretBox API                    | 2024          |
| `https://docs.rs/subtle/latest/subtle/trait.ConstantTimeEq.html`                 | HIGH (공식 docs.rs)         | ConstantTimeEq 사용법            | 2024          |
| `https://github.com/orgs/tauri-apps/discussions/10852`                           | MEDIUM (Tauri maintainer)   | Tauri 민감 데이터 메모리 처리    | 2024          |
| `https://github.com/bitwarden/clients/pull/11252`                                | HIGH (소스 PR)              | Bitwarden weak password 체크     | 2024          |
| `https://deepwiki.com/bitwarden/clients/8.2-password-health-reports`             | MEDIUM (wiki)               | Bitwarden 구현 구조              | 2024          |

---

## 부록: 기존 코드와의 통합 지점

### A. `secretbank-feeds` 크레이트 확장 권고

현재 `hibp.rs`는 `HibpClient` (breaches + breachedaccount 전용).  
신규로 `pwned_passwords.rs` 파일 추가:

```
src-tauri/crates/secretbank-feeds/src/
  hibp.rs               ← 기존 (breachedaccount, breaches)
  pwned_passwords.rs    ← 신규 (range lookup, SHA-1 prefix)
  security_check.rs     ← 신규 (weak, reused, 2FA, orchestration)
```

또는 별도 `secretbank-security` crate 분리 (의존성이 커질 경우).

### B. `feed_scheduler.rs` 패턴 재사용

24시간 주기 `PwnedPasswordsPoller` 추가:

- 볼트 전체 credential을 순차적으로 Pwned Passwords 체크
- 결과를 SQLite `security_alerts` 테이블에 저장
- 최초 실행 시 + 24h마다 갱신

### C. `MatchReason` 확장

`src-tauri/crates/secretbank-core/src/services/matcher.rs` 의 `MatchReason` enum에:

```rust
CompromisedPassword { exposure_count: u64 },
WeakPassword { score: u8 },
ReusedPassword,
MissingTwoFactor,
```

추가 고려 (또는 별도 `SecurityAlertReason` enum으로 분리).

---

_이 문서는 implementator 가 Phase 2-2B 사양을 작성하는 데 필요한 모든 기초 자료를 포함합니다._  
_보안 결정 B.1 (암호학 직접 구현 금지, 평문 메모리 시간 최소화, 평문 IPC 미통과, timing-safe 비교 필수)을 준수하는 구현 패턴만 제시하였습니다._
