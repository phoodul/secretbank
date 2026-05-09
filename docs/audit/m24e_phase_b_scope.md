# M24-E Phase B 외부 보안 audit scope

작성: 2026-05-09 (T-24-E-B9)
상태: scope 문서 — 사용자 액션 (업체 견적 / 발주 / Q5 옵션 결정) 대기

## 1. Audit 목적

Secretbank 의 브라우저 확장 (M24-E) **Phase B (NM Host + 페어링 + session token)** 의
보안 정확성을 외부 third-party 가 독립 검증한다. Phase C (autofill) / D (save) / E (generator)
/ G (차별화) 는 본 audit 범위 ❌ — Phase F 종합 audit 으로 통합.

## 2. Audit Scope

### 2.1 Code 영역

| 경로                                                                | 역할                                                                            |
| :------------------------------------------------------------------ | :------------------------------------------------------------------------------ |
| `src-tauri/crates/secretbank-nm-host/` (전체)                       | Native Messaging Host (stdio 4-byte header + 1MB 상한 + 페어링 + session token) |
| `src-tauri/crates/secretbank-app/src/commands/ext_pairing.rs`       | Tauri 측 페어링 dialog command + age vault priv 보관                            |
| `src-tauri/crates/secretbank-app/src/commands/extension_session.rs` | session token issue/verify + 회전 + Settings                                    |
| `extension/lib/nm-client.ts`                                        | TypeScript NM client (chrome.runtime.connectNative + reconnect)                 |
| `extension/lib/pairing.ts`                                          | extension 측 페어링 흐름 (PairingSession 클래스)                                |
| `extension/lib/crypto.ts`                                           | `@noble/curves` X25519 + `@noble/ciphers` ChaCha20-Poly1305 wrapper             |
| `extension/lib/storage.ts`                                          | chrome.storage.local typed wrapper (페어링 정보 영속)                           |
| `packages/shared/src/types/pairing.ts`                              | NMMessage discriminated union                                                   |
| `packages/shared/src/validation/pairing.ts`                         | NMMessage zod schemas                                                           |

### 2.2 위협 모델 (T1~T7 중 Phase B 관련만)

- **T1 NM channel 도청 / replay** — stdio 패킷 가로채기, 메시지 재전송
- **T2 content ↔ MAIN world postMessage 도청** — 메시지 중간자 (Phase C 와 일부 중첩, scope 제외 권고)
- **T6 MV3 service worker 일시정지 race condition** — Port 끊김 / 재연결
- **T7 Extension 권한 abuse** — 악성 업데이트 우회

**B-4 X25519 ECDH + ChaCha20-Poly1305 protocol 정확성**:

- KAT (Known Answer Tests, RFC 7748 §6.1)
- Cross-language vector (`packages/shared/src/test-vectors/x25519.json`) — Rust ↔ TypeScript 양쪽 동일 결과
- key 교환 forward secrecy (compromised key 가 과거 메시지 풀지 못함)
- nonce 충돌 위험 (XChaCha20 192-bit nonce 사용)

**B-7 HMAC-SHA256 session token 무결성**:

- constant-time HMAC 비교 (`subtle::ConstantTimeEq`) — timing attack 방어
- session_secret 32 byte CSPRNG 무결성
- TTL 만료 검증
- secret 회전 시 기존 token 즉시 invalidate

**B-2 NM Host installer 보안**:

- Win 레지스트리 권한 (HKCU 만, HKLM ❌ → UAC 우회 방지)
- macOS plist 권한 (~/Library, system-wide ❌)
- Linux config 권한 (~/.config, system-wide ❌)
- multi-extension key 분리 (chrome / firefox / edge 별 독립)

### 2.3 Out of Scope (Phase F 종합 audit 으로 통합)

- Phase C autofill (form 감지 + Shadow DOM + DOM Clickjacking)
- Phase D save dialog
- Phase E password generator (zxcvbn-ts + Diceware)
- Phase G 차별화 기능 (mini-graph / supply chain banner / blast radius / MCP push / RAILGUARD hint)
- 데스크톱 앱 자체 (M0~M23 = 별도 audit 시점)

## 3. 검증 항목

| ID  | 항목                                 | 검증 방법                                                               |
| :-- | :----------------------------------- | :---------------------------------------------------------------------- |
| V1  | RFC 7748 §6.1 X25519 KAT             | Rust + TS 양쪽 vector PASS 확인                                         |
| V2  | Cross-language vector                | `packages/shared/src/test-vectors/x25519.json` Rust + TS read 동일 결과 |
| V3  | Constant-time HMAC                   | `subtle::ConstantTimeEq` 사용 확인 + timing variance 측정               |
| V4  | age vault priv key 보관              | `device/extension/{ext_id}/priv` 경로 + age 암호화 확인                 |
| V5  | install/uninstall round-trip         | 3 OS (Win/macOS/Linux) 모두 round-trip + 권한 확인                      |
| V6  | multi-extension key 분리             | chrome + firefox + edge 동시 등록 시 priv key 분리                      |
| V7  | NM channel encryption (post-pairing) | init 이후 모든 message 가 ChaCha20-Poly1305 암호화                      |
| V8  | session token 회전                   | secret 회전 시 기존 token immediate invalidate                          |
| V9  | EOF / disconnect graceful            | port 끊김 시 graceful shutdown, 메모리 leak ❌                          |
| V10 | 메모리 priv key zeroize              | SecretBox / Zeroizing 사용 확인                                         |

## 4. 요구 사항

- **Independent third-party** — Secretbank / phoodul.com / Anthropic 와 무관
- **SOC 2 또는 동등 인증** — Trail of Bits / Cure53 / Doyensec / Radically Open Security 등
- **영문 또는 한글 보고서** (한글 우선)
- **공개 가능 보고서** (요약본 공개 가능, 상세본 보안 패치 후 공개)
- **재테스트 1회** 포함 (initial findings → fix → re-test)

## 5. 예상 비용 / 일정

- **단독 audit (Phase B 만)**: $15K~$30K, 2~4주 (계약 후)
- **종합 audit (Phase B+C+D+E+G+F-1)**: $40K~$80K, 4~6주 — Phase F 진입 시점

## 6. 업체 후보

| 업체                        | 위치     | 강점                                                           | 예상 비용 | 비고                             |
| :-------------------------- | :------- | :------------------------------------------------------------- | :-------- | :------------------------------- |
| **Trail of Bits**           | 미국     | 암호 + Rust 전문, 1Password / Signal audit 경력                | $25K~$40K | 톱 티어, 일정 4~8주 후 시작 가능 |
| **Cure53**                  | 독일     | Browser extension audit 다수 (Mozilla / Bitwarden / KeePassXC) | $20K~$35K | EU 기반, 영문/독일어             |
| **Doyensec**                | 미국     | AI 보안 + 브라우저 보안 (1Password 8 audit 보고서 공개)        | $20K~$30K | OSS 친화                         |
| **Radically Open Security** | 네덜란드 | OSS 친화, 비용 ↓                                               | $15K~$25K | non-profit foundation 형태       |

## 7. Q5 Fallback 결정 (사용자 결정)

**옵션 A — 단독 audit (권고)**:

- Phase B 완료 직후 (현재 시점)
- 페어링 흐름 단독 audit → 발견 사항 fix → Phase G 진입
- **장점**: 출시 직전 critical finding 위험 ↓, audit 결과를 Phase G 설계에 반영
- **단점**: 비용 $15K~$30K + 일정 2~4주 추가

**옵션 C — 종합 audit (단축)**:

- Phase F-1 (Chrome+Firefox 출시) 직전 종합 audit
- Phase B+C+D+E+G 모두 한 번에
- **장점**: 비용 단축 (단독 + 종합 → 종합 만), 일정 단축
- **단점**: 출시 직전 critical finding 시 출시 지연 위험 + Phase G 설계에 audit 결과 반영 불가

**Secretbank 권고**: **옵션 A**. 페어링은 Zero-Knowledge 핵심이라 Phase B 완료 시점에 audit 으로 최종 검증 권고. 비용 $15K~$30K 는 출시 후 critical CVE 비용 (평판 + 사용자 신뢰) 보다 훨씬 ↓.

## 8. 사용자 액션 (다음 단계)

1. **1~2 업체 견적 요청** (이메일 템플릿: 9. 부록):
   - Trail of Bits, Cure53, Doyensec, Radically Open Security 중 2~3 곳
   - 본 scope 문서 첨부 + GitHub repo 접근 권한 (또는 archived snapshot)

2. **옵션 A vs C 결정** (1주 내):
   - 옵션 A: 견적 비교 → 1 업체 선정 → contract 서명 → kickoff
   - 옵션 C: 본 sub-task 닫기, Phase F 의 audit 사양에 페어링 + Phase B 영역 추가

3. **옵션 A 시 후속 작업**:
   - audit kickoff (1주)
   - audit 진행 (2~4주)
   - 발견 사항 별 hotfix sub-task 추가
   - re-test (1주)
   - 보고서 공개 (Q&A, summary 공개)

## 9. 부록 — 견적 요청 이메일 템플릿

```
Subject: Security audit request — Secretbank Browser Extension Phase B (NM + Pairing)

Dear [Audit Firm],

We are requesting a security audit for the Phase B (Native Messaging + pairing protocol +
session token) of Secretbank, an open-core (AGPL-3.0) password / API key manager built with
Tauri v2.

**Scope**:
- Native Messaging Host (Rust + tokio): stdio 4-byte length header + 1MB cap + ctrl-c handler
- Pairing protocol: X25519 ECDH + ChaCha20-Poly1305 (RFC 7748 + RFC 7539), KeePassXC-Browser-inspired (3-key → 2-key simplified)
- Session token: HMAC-SHA256, 4-hour TTL, constant-time verify
- 3 OS installer (Windows registry / macOS plist / Linux config)
- TypeScript NM client (chrome.runtime.connectNative + reconnect)

**Out of scope**:
- Form auto-detect / autofill (Phase C)
- Save dialog (Phase D)
- Password generator (Phase E)
- Differentiation features (Phase G)
- Desktop app core (M0~M23 — separate audit)

**Code**:
- GitHub: https://github.com/phoodul/secretbank
- License: AGPL-3.0-or-later (extension + nm-host) + Secretbank EE v1.0 (relay)
- Threat model: docs/THREAT_MODEL.md
- Architecture: docs/architecture.md (chapter 10 = M24-E)

**Deliverables expected**:
- Initial findings report (HIGH / MEDIUM / LOW severity)
- Fix verification re-test (1 round included)
- Public summary (Secretbank publishes after fixes deployed)

**Timeline**:
- Kickoff: TBD (within 1 month of contract)
- Duration: 2~4 weeks
- Re-test: 1 week after fixes

**Budget range**: $15K~$30K (negotiable based on scope detail).

Please send a detailed quote and proposed timeline. Preference for English or Korean reports.

Best regards,
[사용자 이름]
phoodul@gmail.com
Secretbank
```

## 10. 본 sub-task 클로즈 조건

- 옵션 A 시: contract 서명 시점 → 본 sub-task ✅ → audit 진행 sub-task 별도 신설
- 옵션 C 시: Phase F audit scope 갱신 시점 → 본 sub-task ✅ (deferred to Phase F)
