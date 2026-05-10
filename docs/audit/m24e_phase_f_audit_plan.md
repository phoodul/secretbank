# M24-E Phase F 종합 보안 audit 계획

작성: 2026-05-10 (T-24-E-F8)
**Status: 옵션 C 채택 (B-9 결정 [2026-05-10] 따름)**

> **DECISION [2026-05-10]**: Cure53 Phase B 단독 audit ($15k~$30k) 자가 부담 ❌ →
> Phase F 종합 audit 으로 통합. ARR 0 단계 자가 부담 비합리.
> NLNet NGI Zero PET (Radically Open Security 무료 audit) = Phase F 직전 8~12개월 전 신청.
> 상세 결정 근거: `docs/project-decisions.md` [2026-05-10] 항목.
> Phase B scope 보존 문서: `docs/audit/m24e_phase_b_scope.md`

---

## 1. Audit 목적

M24-E (브라우저 확장) 전체 Phase (A~G) 의 보안 정확성을 외부 third-party 가 독립 검증한다.
Phase F 스토어 제출 (F-1~F-7) 직전에 종합 audit 1회로 모든 Phase 를 커버한다.

본 문서는 **F-8 sub-task 의 사전 계획 (placeholder)** 이다.
실제 audit 결과 수령 후 발견 사항 별로 sub-task 가 분해되어 별도 commit 으로 패치된다.

---

## 2. Phase F 종합 Audit Scope

Phase B scope 문서 (`m24e_phase_b_scope.md`) 의 내용을 포함하며, 아래 Phase 를 추가합니다.

| Phase | 내용                                                                   | 핵심 위협                                            |
| :---- | :--------------------------------------------------------------------- | :--------------------------------------------------- |
| **B** | NM Host + 페어링 + session token                                       | T1 도청/replay, T6 SW race, T7 권한 abuse            |
| **C** | autofill + Shadow DOM + clickjack 방어                                 | T2 postMessage 도청, T4 phishing, T5 clickjacking    |
| **D** | save dialog + nm-host TCP IPC                                          | T3 credential leak, D1 form submit hook              |
| **E** | generator + recipe inheritance + Site Logo                             | E-crypto zxcvbn / Diceware 무작위성, logo fetch SSRF |
| **G** | mini-graph + supply chain banner + blast radius + MCP push + RAILGUARD | G-supply chain data integrity, MCP push injection    |

> 데스크톱 앱 자체 (M0~M23) 는 별도 audit 시점 — 본 scope 제외.

---

## 3. Audit 자가 부담 임계점 (B-9 결정 그대로)

| 단계         | 사용자        | ARR (연 $20)   | audit 가능성                                |
| :----------- | :------------ | :------------- | :------------------------------------------ |
| 현재 (pre11) | 0~10          | ~$0            | ❌                                          |
| 베타 종료    | 100~500       | ~$2k~$10k      | ❌ — 운영비 미달                            |
| **임계점**   | **1000~2000** | **~$20k~$40k** | **✅ Cure53 Phase B 단독 ($15k~$30k) 가능** |
| 성숙기       | 5000+         | ~$100k+        | ✅ Trail of Bits 종합 + bug bounty          |

---

## 4. 1000 paid 도달 전 신뢰 구축 (단기 대안)

`docs/project-decisions.md` [2026-05-10] 의 4가지 방법 그대로:

### 4-1. OSS 공개 자체가 audit 신호

AGPL-3.0 셀링 포인트 — 1P/Bitwarden 과 차별점.
KeePassXC/Bitwarden 도 자가 부담 audit 전 수년간 이 방법으로 사용자를 모았습니다.

### 4-2. 무료 audit 펀딩 채널

| 채널                            | 비용                                          | 비고                                                                                      |
| :------------------------------ | :-------------------------------------------- | :---------------------------------------------------------------------------------------- |
| **NLNet NGI Zero PET** ⭐       | €5k~€50k + Radically Open Security audit 무료 | 사이클 6~12개월. **Phase F 직전 신청 = 정식 v1.0 시점에 결과**. Secretbank 가 정확히 타깃 |
| OTF Red Team Lab                | $0                                            | Cure53 / iSEC Partners 직접 audit                                                         |
| Sovereign Tech Fund (EU/DE OSS) | $0                                            | OSS 인프라 지원                                                                           |
| GitHub Security Lab CodeQL      | $0                                            | 정적 분석 + 자문                                                                          |
| Mozilla MOSS/SOS                | $0~$10k                                       | Mozilla 생태계 프로젝트                                                                   |

### 4-3. 자기 검증 강화

외부 audit 의 70~80% 효과:

- **KAT** (Known Answer Tests): RFC 7748 X25519 / RFC 7539 ChaCha20-Poly1305
- **`cargo-fuzz`**: nm-host 메시지 파서 + form-detector 입력
- **MIRI**: unsafe-free 확인 (UB 탐지)
- **`rustsec audit`** + **`cargo deny`**: 의존성 CVE 차단
- **CodeQL / Semgrep**: TypeScript autofill + postMessage 정적 분석
- **`packages/shared/src/test-vectors/x25519.json`**: Rust ↔ TypeScript 크로스 벡터

### 4-4. Responsible disclosure 채널

- HackerOne / Bugcrowd 채널만 운영 (bounty 없이, 비용 0)
- 1000 사용자 시점부터 소액 bounty ($50~$500) 시작

---

## 5. 권장 audit 로드맵

```
지금 ~ M24-E 정식 v1.0:
  → 자기 검증 강화 (KAT + cargo-fuzz + CodeQL/Semgrep)
  → THREAT_MODEL.md 풀공개 + SECURITY.md responsible disclosure 채널
  → Phase F 직전 (F-1~F-7 제출 시작 8~12개월 전): NLNet NGI Zero PET 신청

v1.0 ~ 1000 paid:
  → NLNet audit 결과 수령 → 사용자 신뢰 자료 활용
  → HackerOne 채널 운영 (bounty ❌ → 발견 사항 감사 신속 대응)

1000+ paid (ARR $20k+):
  → Cure53 Phase B 단독 audit 자가 부담 ($15k~$30k)
  → bug bounty 본격 시작 ($50~$500)

5000+ paid (ARR $100k+):
  → Trail of Bits 종합 audit
  → bug bounty 확대
```

**NLNet NGI Zero PET 신청 시점 가이드**:

- 신청 마감: 매년 1월, 4월, 10월 (분기 cycle)
- Phase F-1~F-2/F-7 심사 통과 + dogfooding 1주 + 사용자 피드백 수집 후 첫 해당 마감에 신청
- 신청서 작성 예상 시간: 1~2주 (상세 기술 명세 + threat model 첨부)
- URL: https://nlnet.nl/NGI0/

---

## 6. F-8 실행 계획 (audit 결과 수령 후 분해)

audit 결과 수령 시 아래 절차로 sub-task 를 분해합니다.

```
F-8 결과 수령
├── HIGH severity → 출시 전 모두 해소 (블로커)
│   └── 각 finding → 별도 fix commit (F-8-H1, F-8-H2, ...)
├── MEDIUM severity → 별도 마일스톤 후속 가능
│   └── 각 finding → 별도 fix commit 또는 다음 마일스톤으로 이관
└── LOW / INFO → 결과 문서에 기록 후 우선순위에 따라 처리
```

결과 요약 문서: `docs/audit/m24e_final_report.md` (audit 결과 수령 후 작성)

---

## 7. Phase F 검증 게이트 (본 문서 연동)

Phase F 출시 게이트 (`docs/task_m24e.md` "Phase F 검증 게이트") 중 F-8 관련:

- [ ] 외부 audit 결과 HIGH severity 모두 해소 (또는 NLNet audit 신청 완료 + 자기 검증 강화로 대체)
- [ ] `docs/audit/m24e_final_report.md` 작성 (audit 결과 수령 후) 또는 NLNet 신청 확인서 첨부
- [ ] THREAT_MODEL.md 공개 버전 업데이트

---

## 8. 업체 후보 (종합 audit 시점용)

Phase B scope 문서 (`m24e_phase_b_scope.md`) 의 업체 후보 그대로 유효.
종합 audit 시 예상 비용은 Phase B 단독 대비 2~3배:

| 업체                        | 위치     | 강점                                               | 예상 비용 (종합)            |
| :-------------------------- | :------- | :------------------------------------------------- | :-------------------------- |
| **Trail of Bits**           | 미국     | Rust + 암호 + 브라우저 확장 전문                   | $40k~$80k                   |
| **Cure53**                  | 독일     | Browser extension audit 다수 (Mozilla / Bitwarden) | $35k~$60k                   |
| **Doyensec**                | 미국     | 브라우저 보안 + AI 보안                            | $35k~$55k                   |
| **Radically Open Security** | 네덜란드 | OSS 친화 + NLNet 파트너, 비용 ↓                    | $25k~$40k (또는 NLNet 무료) |

> **NLNet NGI Zero PET 경로**: Radically Open Security 가 NLNet 파트너로 무료 audit 제공.
> 이 경로가 1000 paid 도달 전 가장 현실적인 외부 audit 방법입니다.

---

## 9. 관련 문서

- [m24e_phase_b_scope.md](./m24e_phase_b_scope.md) — Phase B 상세 scope (종합 audit 에 포함됨)
- [docs/project-decisions.md](../project-decisions.md) — B-9 결정 [2026-05-10]
- [docs/release/m24e_store_matrix.md](../release/m24e_store_matrix.md) — 4 스토어 비교
- [docs/release/m24e_safari_submission.md](../release/m24e_safari_submission.md) — F-6 Safari (보류)
