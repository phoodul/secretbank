# API Vault — Threat Model (STRIDE)

> 작성일: 2026-05-07 — Phase 3-A (신용카드) 진입 전 1회 작성
> 작성 근거: `docs/project-decisions.md` [2026-05-07] 보안 절대 우선 결정 D.6 항목
> 분석 모델: STRIDE (Spoofing / Tampering / Repudiation / Information Disclosure / DoS / Elevation of Privilege)
> 갱신 주기: vault format 변경 시, 외부 trust boundary 추가 시
> ⚠️ 출시 전 외부 보안 감사 1회 필수 (B.4 항목) — LLM 작성 위협 모델만 신뢰 ❌

---

## 0. 요약 (Executive Summary)

### 0.1 핵심 가정

- **데스크톱 앱 + 로컬 vault** 가 기본. 모든 secret 은 `age` 로 암호화되어 SQLite 또는 vault file 에 저장
- **Zero-Knowledge**: 외부 relay (Cloudflare Worker) 는 ciphertext 만 통과, 평문 secret 미접근
- **단일 사용자 vault** 가 v1 의 기본 가정. 팀/조직 vault 는 M19 별도
- **신뢰 부트스트랩**: 사용자가 master passphrase 를 직접 입력. 해당 passphrase 가 모든 다른 키의 deriving 출발점

### 0.2 현재 단계 = 가능성 검증 (1인 + LLM)

[2026-05-07] 보안 결정 A 항목 — 영구 1인 ❌. 사업성 생기면 보안 엔지니어 우선 채용. 본 문서는 1인 LLM 환경에서 작성된 한계가 있음 — **외부 감사로 검증 필수**.

### 0.3 STRIDE 핵심 발견

| 자산 | 가장 큰 위협 | 완화 상태 |
|:---|:---|:---|
| Master passphrase | I (메모리 dump / shoulder surfing / keylogger) | 부분 완화 (SecretBox + clipboard 30s clear) |
| Vault file | T (offline tampering by malware) | age MAC 검증으로 완화 |
| Audit log chain | R + T (hash chain 위조) | prev_hash 체인 + Charter 회복 시 시그너처 분리 |
| Credential data | I (frontend leak / IPC leak / log file leak) | B.1-3 평문 IPC 미통과 + tracing 마스킹 |
| Sync (M9) | I (relay compromise) + S (device spoofing) | XChaCha20-Poly1305 + device key |
| 외부 API key (HIBP / OSV) | T (TLS MITM) | 시스템 root CA + 향후 cert pinning 고려 |

### 0.4 출시 전 의무 사항 (B.2 재확인)

- Pentest + crypto review ($5~10k)
- Bug bounty (HackerOne, critical $500 ~)
- SOC 2 Type 1 준비
- Cargo audit / pnpm audit CI gate ✅ (이미 적용)
- 본 Threat Model 외부 검토 1회

---

## 1. 자산 식별 (Assets)

### A1. Master passphrase
- **민감도**: CRITICAL (모든 키 derive 의 출발점)
- **저장 위치**: 사용자 머릿속 + 옵션으로 OS keychain (Phase 1.5+ 결정)
- **처리 시간**: 입력 → KDF (argon2id) → vault key derivation → **즉시 zeroize**

### A2. Vault file (`vault.age`)
- **민감도**: CRITICAL (모든 credential 평문 포함)
- **저장 위치**: `~/Library/Application Support/api-vault/vault.age` (macOS) / 동등 OS 경로
- **암호화**: `age` (X25519 + ChaCha20-Poly1305)
- **백업**: 사용자 책임 (M9 sync 활성화 시 Cloudflare relay 에 ciphertext 만)

### A3. Vault Charter recovery key
- **민감도**: HIGH (Diceware 6-word + 4-digit verifier)
- **저장 위치**: 사용자가 PDF 출력 → 물리적 보관. 디지털 복사본 ❌ 권고
- **암호화**: Shamir 2-of-3 split 옵션

### A4. Audit log chain
- **민감도**: MEDIUM (행위 메타데이터, 평문 secret ❌)
- **저장 위치**: SQLite `audit_log` 테이블
- **무결성**: prev_hash chain (M6 구현)

### A5. Credential data (login + secret)
- **민감도**: CRITICAL (vault unlock 시 in-memory)
- **처리 시간**: vault unlock → 사용 직전까지 SecretBox → 사용 후 zeroize
- **DB 저장**: 항상 ciphertext (vault encryption 통과)

### A6. Sync key (E2EE)
- **민감도**: HIGH (device 별 X25519 keypair)
- **저장 위치**: OS keychain (각 device)
- **활성화**: M9 sync 활성화 시에만

### A7. 외부 사용자 API key (vault 에 저장된)
- **민감도**: 사용자 정의 (Stripe / GitHub / AWS 등 — 사용자가 입력한 secret)
- **처리**: A5 와 동일

### A8. Phase 3-A 신규 — 신용카드 데이터
- **민감도**: CRITICAL (PCI-DSS 적용 가능, 단 vault 안에서만 처리이므로 PCI scope 외)
- **필드**: card_number / CVC / PIN — 모두 SecretBox
- **메타**: brand / expiry / cardholder_name — 평문 가능 (PCI 비-secret)
- **CVC**: reveal 시 30초 자동 클리어 (사용자 결정 [2026-05-07] B.5)
- **카드번호 마스킹**: frontend 에서 `valueHint` 마지막 4자만 노출

---

## 2. 신뢰 경계 (Trust Boundaries)

```
┌─────────────────────────────────────────────────────────────┐
│ 사용자 (Human)                                              │
│   keystroke → frontend                                      │
│   passphrase 입력 → vault unlock                            │
└──────────┬──────────────────────────────────────────────────┘
           │ TB1: User ↔ Frontend (Tauri WebView)
┌──────────▼──────────────────────────────────────────────────┐
│ Frontend (React + TypeScript, Tauri WebView)                │
│   - i18n / shadcn / Bento card / WatchtowerPage             │
│   - localStorage (HIBP opt-in toggle)                       │
│   - clipboard 30s auto-clear                                │
└──────────┬──────────────────────────────────────────────────┘
           │ TB2: Frontend ↔ Tauri IPC (struct serialize)
┌──────────▼──────────────────────────────────────────────────┐
│ Rust backend (api-vault-app)                                │
│   - VaultStorage (age) / KDF (argon2id) / SecretBox         │
│   - SecurityCheckEngine / AuditChain / FeedScheduler        │
└────┬───────────────────┬──────────────────────┬─────────────┘
     │ TB3a: Backend     │ TB3b: Backend        │ TB3c: Backend
     │   ↔ SQLite        │   ↔ 외부 API         │   ↔ Cloudflare
     │   (vault.db)      │   (TLS)              │   relay (M9)
┌────▼─────┐    ┌────────▼──────────┐    ┌──────▼──────┐
│ SQLite   │    │ HIBP / 2fa.dir /  │    │ Cloudflare  │
│ (local)  │    │ OSV / RSS / GH    │    │ Worker      │
└──────────┘    └───────────────────┘    └─────────────┘
```

**경계 분류**:
- **TB1**: User ↔ Frontend — keystroke / clipboard / shoulder surfing 영역
- **TB2**: Frontend ↔ Tauri IPC — IPC payload 검증, 평문 secret 통과 ❌
- **TB3a**: Backend ↔ SQLite — file system access (offline malware 가능)
- **TB3b**: Backend ↔ 외부 API — TLS 1.2+ + 시스템 root CA
- **TB3c**: Backend ↔ Cloudflare relay — Zero-Knowledge (ciphertext 만 통과)

---

## 3. STRIDE 분석 (자산 + 경계별)

### 3.1 Spoofing (S)

| 위치 | 위협 시나리오 | 완화책 | 잔여 위험 |
|:---|:---|:---|:---|
| TB1 | Phishing app 가 API Vault UI 위장 → 사용자 passphrase 탈취 | OS app 서명 (codesign / Authenticode), 공식 배포 채널 권장 | HIGH (앱 위장 일반적). 사용자 교육 필요 |
| TB2 | 악성 frontend script 가 Tauri command 위장 호출 | Tauri capability `windows: ["main"]` 제한, IPC schema 검증 | LOW |
| TB3b | DNS spoofing → 가짜 HIBP 서버로 prefix 전송 | TLS + 시스템 root CA 검증 | MEDIUM (cert pinning 향후 고려) |
| TB3c | 가짜 Cloudflare relay → device spoof | XChaCha20-Poly1305 + device key + relay URL 하드코딩 | LOW |
| 신용카드 (Phase 3-A) | 가짜 카드 등록 form (browser autofill 미사용 시 N/A) | Phase 3-A 는 vault 내부만 — autofill 없음 | LOW |

### 3.2 Tampering (T)

| 위치 | 위협 시나리오 | 완화책 | 잔여 위험 |
|:---|:---|:---|:---|
| A2 vault.age | offline malware 가 vault file 변조 | age MAC 검증 — unlock 실패 시 복호화 거부 | LOW |
| A4 audit chain | malware 가 audit log row 삭제 / 수정 | prev_hash chain 검증, 사용자 unlock 시 audit_verify | MEDIUM (chain 시작점부터 위조 시 검출 어려움 — Charter 시그너처로 보강) |
| TB3b 외부 API 응답 | HIBP / 2fa.directory 응답 변조 (TLS MITM) | TLS + 시스템 root CA, B.1-4 fuzz-safe parser | MEDIUM (정부 수준 MITM 가능, cert pinning 향후) |
| TB3a SQLite | malware 가 vault.db 직접 변조 | age 암호화로 평문 미저장 → 변조해도 unlock 실패 | LOW |
| Phase 3-A 신용카드 | malware 가 BIN prefix 또는 expiry 변조 (vault 안 ciphertext) | A2 와 동일 — age MAC 검증 | LOW |

### 3.3 Repudiation (R)

| 위치 | 위협 시나리오 | 완화책 | 잔여 위험 |
|:---|:---|:---|:---|
| A4 audit | 사용자가 "내가 이 작업 안 함" 부인 | prev_hash chain + (M9 활성화 시) device key 시그너처 | MEDIUM (단일 device 단일 사용자 시 외부 증인 없음) |
| Vault Charter recovery | 사용자가 회복 작업 부인 | Charter cooldown sidecar + audit log + email/이름 알림 (M25 placeholder) | MEDIUM |
| 신용카드 reveal | 사용자가 "내 CVC 본 적 없음" 부인 | reveal 작업 audit log 기록 (모든 secret reveal 은 audit) | LOW |

### 3.4 Information Disclosure (I) — **가장 큰 위협 군**

| 위치 | 위협 시나리오 | 완화책 | 잔여 위험 |
|:---|:---|:---|:---|
| TB1 keystroke | Keylogger / shoulder surfing | passphrase 입력 시 마스킹, OS-level 보안 (사용자 책임) | HIGH (keylogger 차단 불가) |
| TB1 clipboard | clipboard 모니터링 / browser extension 권한 남용 | 30초 자동 클리어, 사용자 알림 | MEDIUM |
| TB1 screenshot | screen recorder / OS screenshot | reveal 시 OS-level prevent screenshot (Windows DRM 영역, macOS NSWindow secureView) — 미구현 | HIGH (향후 Phase 3-A 구현 시 고려) |
| TB2 IPC payload | Tauri IPC 통과 secret 노출 | **B.1-3** — `SecurityAlertView` / `CredentialFull` 구조에 평문 미포함, `valueHint` 마지막 4자만 | LOW |
| Memory dump | malware 가 process memory dump | SecretBox + Zeroize on drop, expose_secret 단일 블록 | MEDIUM (Rust drop 보장 + zeroize, 그러나 OS swap 가능) |
| Log file | tracing 로그에 평문 secret leak | `#[derive(Debug)]` 에 SecretBox 자동 마스킹, B.1-9 에러 메시지 범용화 | MEDIUM (향후 정기 grep 검증) |
| Audit DB | audit_meta 에 평문 credential ID 저장 | GATE 1-6 — security_check_run audit 은 요약만, credential_id 미포함 | LOW |
| 외부 API request | HIBP 에 비번 평문 전송 | k-anonymity range lookup (prefix 5자만) + Add-Padding | LOW |
| Sync (M9) | Cloudflare relay 가 평문 secret 보임 | E2EE — XChaCha20-Poly1305, relay 는 ciphertext blob 만 | LOW |
| Phase 3-A CVC | reveal 후 자동 hide 되지 않으면 화면 잔존 | **30초 자동 클리어** ([2026-05-07] B.5) | LOW |
| Phase 3-A 카드번호 | full 16자리가 frontend 에 전송 | `valueHint` 마지막 4자만 + Tauri command reveal_card_number 별도 | LOW (구현 시 확인) |

### 3.5 Denial of Service (D)

| 위치 | 위협 시나리오 | 완화책 | 잔여 위험 |
|:---|:---|:---|:---|
| KDF brute force | 공격자가 vault file 획득 후 offline brute force | argon2id m=65536 t=3 p=1 (또는 동등) — GPU/ASIC 비용 증가 | MEDIUM (slow KDF 가 향후 vault format v3 에서 강화) |
| HIBP 서비스 다운 | 사용자가 검사 못 함 | R3 처리 — `hibp_failed: true` summary 필드, 로컬 검사는 정상 진행 | LOW |
| 대규모 vault (10k+ credential) | Watchtower 검사 30+ 초 | concurrency 10 + tokio JoinSet (GATE 1-5), 백그라운드 실행 | LOW |
| Cloudflare relay 다운 | sync 일시 중단 | 로컬 vault 단독 작동, sync 재시도 backoff | LOW |
| Sync conflict storm | 다른 device 가 빈번 update | Yjs CRDT 자동 merge | LOW |

### 3.6 Elevation of Privilege (E)

| 위치 | 위협 시나리오 | 완화책 | 잔여 위험 |
|:---|:---|:---|:---|
| Tauri capability | 미등록 plugin 권한 사용 | capability deny-by-default, `default.json` 명시적 등재 | LOW |
| Filesystem access | 임의 file read/write | `fs:allow-remove` 등 최소 권한 | LOW |
| Network fetch | 임의 URL 요청 | `http:default` 가 모든 URL 허용 — 필요 시 `tauri-plugin-http` allow-list 추가 고려 | MEDIUM (HIBP / 2fa.directory / OSV / RSS / GH 외 도메인 차단 미적용) |
| Rust unsafe | unsafe 블록으로 메모리 접근 | "Never use `unsafe` Rust without justification" (CLAUDE.md) — 코드베이스에 unsafe ❌ | LOW |
| Privilege escalation via dependency | 의존 crate 의 RCE 취약점 | Dependabot + cargo audit CI gate | MEDIUM (zero-day 노출 가능) |

---

## 4. Phase 3-A (신용카드) 추가 위협

신용카드는 PCI-DSS 영역 secret 이지만, API Vault 가 결제 처리 ❌ → vault 안에서만 저장. PCI scope 적용 안 됨 (PCI-DSS Self-Assessment Questionnaire P2PE 또는 SAQ A 영역 외).

### 4.1 추가 위협

| 위협 | 시나리오 | 완화책 |
|:---|:---|:---|
| BIN prefix 노출 (HIBP-style) | 미사용 — 신용카드 자체는 HIBP range lookup 적용 X | N/A |
| 카드번호 부분 노출 | UI 마스킹 우회 시 16자리 노출 | `valueHint` (마지막 4자) 만 frontend 전달, full 카드번호 reveal 시 별도 Tauri command + audit log + 30초 자동 클리어 |
| BIN 자동 감지 시 노출 | BIN 6자리만 사용 (Visa = 4 / Master = 51-55 / Amex = 34/37) | prefix 6자만 frontend 로 전송 가능. 단 brand 결정만이라면 prefix 1~2자로 충분 |
| 3D flip 애니메이션 중 평문 노출 | rotateY 진행 중 카드 앞/뒷면 모두 잠시 보임 | 사용자가 reveal 한 상태에서만 flip. 마스킹 상태에서는 flip 안 함 |

### 4.2 Phase 3-A 사양에 반영할 룰

- 카드번호 + CVC = `SecretBox<String>` + `Zeroizing` 자동 zeroize on drop
- vault unlock 후에만 평문 디크립트 (다른 credential 과 동일)
- frontend 는 `last_4` + `brand` 메타만 받음 (default)
- Reveal 별도 Tauri command — `reveal_card_number(credential_id)` / `reveal_cvc(credential_id)` — 각각 30초 자동 클리어 타이머 + audit log
- BIN 감지는 prefix 6자만 (Visa 등 알려진 BIN range 매칭) — DB 조회 ❌, 하드코딩 BIN 표

---

## 5. 잔여 위험 (Residual Risks) 우선순위

| 우선순위 | 위험 | 완화 (현재) | 추가 완화 (장기) |
|:---|:---|:---|:---|
| 1 | TB1 keylogger / shoulder surfing | 사용자 교육, 마스킹 | OS-level 가상 키보드 (m22 placeholder) |
| 2 | TB1 screenshot 캡처 | 미적용 | macOS NSWindow secureView / Windows DRM 영역 (Phase 3-A 신용카드 시 적용 검토) |
| 3 | A4 audit chain 단일 device 부인 | prev_hash chain | M9 활성화 시 device 시그너처 |
| 4 | TB3b cert pinning 미적용 | 시스템 root CA | reqwest cert pinning (향후) |
| 5 | E network fetch allow-list 미적용 | `http:default` | URL allow-list (HIBP / 2fa.directory / OSV / RSS / GH 만) |
| 6 | E Memory dump (OS swap) | SecretBox + Zeroize | mlock 또는 hardware security module (Tauri 미지원) |
| 7 | I dependency RCE | Dependabot / cargo audit | 강화된 supply chain 검증 |

---

## 6. 외부 감사 권고 (B.4 LLM 한계)

본 위협 모델은 **Claude Opus 4.7 (LLM) 작성**. cryptography 미세 실수 가능. 출시 전:

1. **Pentest** — 외부 보안 회사 ($5~10k)
2. **Crypto review** — vault format v2 + Charter codec + future v3
3. **Threat model peer review** — 1Password / Bitwarden 출신 또는 same-domain 전문가
4. **Bug bounty (HackerOne)** — critical $500 / high $200 / med $50 (B.2 명시)
5. **SOC 2 Type 1** — Drata / Vanta 자동화

**LLM 만 믿고 출시 ❌**.

---

## 7. 변경 이력

| 일자 | 변경 | 사유 |
|:---|:---|:---|
| 2026-05-07 | 초기 작성 | Phase 3-A 진입 전 1회 의무 작성 ([2026-05-07] B.1 결정 D.6) |

---

*본 문서는 STRIDE 모델 기반 1차 위협 분석. 출시 전 외부 감사 결과로 갱신 필수.*
*완화책 미적용 (잔여 HIGH) 항목은 Phase 3-A 사양 수립 시 우선 검토.*
