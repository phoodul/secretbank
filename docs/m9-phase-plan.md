# M9 Sync Infrastructure — Phase Plan

> 작성: 2026-04-28 Night mode 3, T084/I3/Playwright 인프라 직후
> 범위: T087 ~ T096 (10 태스크)
> 동기: M9 는 SecSync/Yjs/y-indexeddb 라이브러리 통합, Rust 측 enc_key 라이프사이클
> 변경, 릴레이 엔드포인트, X25519 디바이스 페어링까지 7개 결합 영역에 걸친 작업.
> 한 commit 으로 처리하면 회귀 위험과 리뷰 부담이 너무 크므로, T083 처럼 7-phase 로 나눈다.

---

## Phase A — Yjs 스캐폴드 + 더미 SyncProvider (회귀 안전)

**해당 태스크**: T087 의 일부 (Yjs · y-indexeddb 까지만, SecSync 제외)

**왜 먼저인가**: 라이브러리 설치 + Provider 컨텍스트 + 빈 Y.Doc 구성은 외부 의존성 (릴레이/auth) 없이 검증 가능. 프런트 회귀가 깨지지 않는지부터 확인.

**스코프**:
- `yjs` 와 `y-indexeddb` 만 dep 추가 (SecSync 는 Phase C 에서)
- `src/features/sync/SyncProvider.tsx` — `Y.Doc` 생성, IndexedDB persistence
- `src/features/sync/use-sync.ts` — `useSync(): { doc, observer }` 훅
- Vitest:
  - `Y.Doc` 인스턴스화 + Y.Map set/get
  - SyncProvider mount/unmount 시 listener 누수 없음
- App.tsx 에 SyncProvider 마운트는 **하지 않음** (지금은 dead path)

**금지 사항**:
- SecSync 임포트 금지 — 라이브러리 API 가 enc_key 가 있어야 동작
- 릴레이 호출 금지

**완료 기준**: Vitest +3 정도, typecheck/lint 그린, e2e smoke 영향 없음.

---

## Phase B — AuthSession 의 enc_key 라이프사이클 (Rust 측)

**해당 태스크**: T084 의 deferred 항목 + T088 의 일부

**왜 두 번째인가**: SecSync 가 구동하려면 enc_key 가 메모리에 있어야 한다. 현재 AuthSession 은 access/refresh token 만 보관하고 enc_key 는 어디에도 없음. T085 의 `derive_session_keys` 헬퍼는 존재하지만 verify 흐름에서 호출되지 않는 dead 함수.

**스코프**:
- `AuthSession` 구조체에 `enc_key: SecretBox<[u8; 32]>` 필드 추가 (Debug 안 derive — 마스킹)
- 새 Tauri 커맨드 `auth_derive_session_keys(passphrase: SecretString)`:
  - 호출 시점: WebAuthn / OAuth verify 직후, 별도 단계로 (UX 분리)
  - 메모리의 PasskeyChallenge.salts (verify 직전 캐시) 와 passphrase 로 derive_session_keys 호출
  - 결과 `enc_key` 를 `auth_session.enc_key` 에 저장
  - `auth_hash` 는 별도 채널 (T091 같은 곳) 로 활용
- 새 Tauri 커맨드 `sync_get_root_key()`:
  - `derive_subkey(enc_key, "crdt-root")` 결과 32바이트 base64url 반환
  - 세션 비활성 / enc_key 없음 시 에러
- AuthSession 영속 (vault) 에서 enc_key 는 **저장 안 함** — 매번 unlock + derive 단계에서만 메모리에 적재 (vault unlock 후 hydrate 흐름과 별개)
- 회귀 ≥ 6 (enc_key 결정론, 다른 passphrase → 다른 키, 세션 없을 때 거부, root_key 결정론)

**리스크**:
- AuthSession 직렬화 (services/session.rs save/load) 에서 enc_key 를 제외해야 — 실수로 디스크에 쓰면 zero-knowledge 깨짐
- `secrecy::SecretBox` 와 `serde` 의 상호작용 — derive(Serialize) 자동 적용되지 않도록 주의
- vault.unlock 직후 hydrate 가 enc_key 를 메모리에 채워야 하지만, hydrate 시점에 passphrase 가 없음 → 사용자가 sign-in 플로우 재진입할 때까지 enc_key 는 None. UI 가 이걸 인식해 "sync inactive" 표시.

---

## Phase C — SecSync 클라이언트 통합

**해당 태스크**: T087 의 SecSync 부분 + T088 의 KDF 주입

**왜 세 번째인가**: enc_key 가 메모리에 있어야 SecSync.init 가 동작. Phase B 가 끝나면 sync_get_root_key 로 안전하게 가져올 수 있음.

**스코프**:
- `secsync` dep 추가
- SyncProvider 가 `sync_get_root_key()` 결과로 SecSync init
- enc_key 부재 시 SecSync init skip (offline-only mode 처럼 동작)
- SecSync 의 transport layer 는 stub (Phase E 에서 릴레이 endpoint 와 연결)
- Vitest — SecSync mock 으로 init/teardown 회귀

---

## Phase D — Y.Map ↔ SQLite 양방향 매퍼

**해당 태스크**: T089

**왜 네 번째인가**: SecSync 가 init 된 후, Y.Doc 변경이 SQLite 에 propagate / SQLite 변경이 Y.Doc 에 propagate 되는 양방향 채널 필요. origin tag 로 무한 루프 방지.

**스코프**:
- `src/features/sync/mapping.ts` — credential / issuer / project / deployment / usage / settings 6 엔티티
- 각 엔티티별 `toYMap` / `fromYMap` + observe handler
- Tauri emit `db:changed` 이벤트 (Rust 측 mutating 커맨드 후 발화)
- `vault_ref` 같은 device-local 필드는 CRDT 에서 제외
- Vitest — Y.Map 변경 → ipc invoke 로 upsert / db emit → Y.Map update / 같은 origin 루프 안 함

**리스크**: 현재 전체 데이터 모델이 device-local SQLite 기준. 일부 필드 (예: `created_at` / `updated_at`) 는 device-local 이지 sync 대상이 아닐 수도 → 결정 필요.

---

## Phase E — 릴레이 `/sync` 엔드포인트

**해당 태스크**: T090

**스코프**:
- `api-vault-relay/src/routes/sync.ts`
- `POST /sync/snapshot` — `{ doc_id, version, ciphertext_b64, nonce_b64 }`
- `GET /sync/deltas?since=<clock>` 
- D1 schema: `encrypted_docs` 테이블 (M8 D1 schema 확장 마이그레이션 0003_sync.sql)
- Rate limit: user 당 100req/min (KV sliding window)
- JWT 필수 (T086 의 verifyAccessToken)
- Vitest (Miniflare): upload + download 라운드트립

---

## Phase F — Value Sync 채널

**해당 태스크**: T091

**왜 별도 채널인가**: CRDT 는 metadata 동기화에만 적합. Credential 의 실제 secret value 는 별도 AEAD 암호화 + value-only 채널로 처리.

**스코프**:
- D1 schema: `encrypted_secret_values` 테이블 (마이그레이션 0004_sync_values.sql)
- 릴레이 `POST /sync/values` / `GET /sync/values?since=...`
- 클라이언트 `services/value_sync.rs` — value 변경 시 `value_root_key` (derive_subkey "value-root") 로 AEAD 후 업로드, 수신 시 복호화 후 age vault 에 저장
- Rust + Miniflare 라운드트립 회귀

---

## Phase G — Device Pairing + UI + Conflict + Offline + Entitlement

**해당 태스크**: T092 / T093 / T094 / T095 / T096

**왜 묶었나**: 이 5개는 백엔드 / 인프라가 다 되어 있으면 비교적 격리된 UI/UX 작업. 한 phase 로 묶어 closed loop 완성.

**스코프**:
- T092: X25519 페어링 — `apivault://pair?pk=...&pin=...&user=...` deep-link, KV 5분 TTL 채널, ECDH+HKDF, 관련 Rust crypto
- T093: SyncSection — 디바이스 목록, "Add device" 다이얼로그, "Sign out"
- T094: Free 2대 / Pro 무제한 entitlement 게이트 (server-side 검증)
- T095: conflict resolver (last-write-wins on value channel, CRDT 기본 + revoked > active 정책)
- T096: y-indexeddb persistence + online/offline 배지

---

## Phase 진입 체크리스트

| Phase | 진입 전 만족 조건 | 신규 dep | 회귀 회수 (target) |
|:--|:--|:--|:--|
| A | T084 ✅ + Playwright E2E ✅ | yjs, y-indexeddb | +3 |
| B | Phase A 완료 | (none) | +6 |
| C | Phase B 완료 + sync_get_root_key 동작 확인 | secsync | +4 |
| D | Phase C 완료 + SQLite 모델 정리 | (none) | +12 (엔티티 6 × 양방향 2) |
| E | Phase D 완료 | (relay 측) hono routes | +5 (Miniflare) |
| F | Phase E 완료 | (none) | +5 |
| G | Phase F 완료 | qrcode (devicepair UI) | +10 |

**총 예상**: M9 전체로 +45 회귀, dep 4개 (yjs / y-indexeddb / secsync / qrcode), 마이그레이션 2개 (relay D1 0003, 0004).

---

## Open Issues — ✅ Resolved (2026-04-28)

전체 4건이 사용자 결정 완료. 자세한 사항은 `docs/project-decisions.md` 의 [2026-04-28] 항목 참조.

| # | Issue | 결정 | 영향 phase |
|:--|:--|:--|:--|
| 1 | Free 디바이스 수 | **종류 무관 2대** (데스크탑+폰 / 데스크탑 2 / 폰 2 모두 OK) | G (T094 entitlement) |
| 2 | Passphrase 재프롬프트 정책 | **Auto-derive on unlock** — `vault_unlock` 시점에 vault decrypt + `derive_session_keys` 동시 호출, passphrase 즉시 zeroize, `enc_key` 메모리 유지. `vault.derive_external_keys(salt_auth, salt_enc)` 메서드 추가 (passphrase 외부 노출 없음) | **B (즉시)** |
| 3 | SQLite sync 화이트리스트 | **명시 화이트리스트** (credential / issuer / project / deployment / usage / settings.shared.*) — 나머지 device-local | D |
| 4 | secsync 라이브러리 채택 | **잠정 채택** — Phase C 진입 시 5개 stable 체크리스트로 1차 검증, ≥ 3 fail 시 fallback D (Yjs + 자체 transport) | C |

### 추가 결정 — Phased Market Expansion

MVP (M0~M13) 는 API 특화로 출시, **v1.1 (M18 신설) 에서 General Secrets** (일반 비번 + Watchtower-like) 도입, **v1.2 (M19/M20) 에서 자동입력**. 자세한 사항은 `docs/project-decisions.md` E 섹션.

**Architectural seeds — MVP 시점에 미리 깔아둘 것 (v1.1 확장 비용 ↓)**:
1. `credential.kind` enum 확장 가능 (`api_key`/`oauth_token` 외에 `login`/`totp`/... 추가 가능한 string)
2. `issuer` → "Site" 명명 일반화 검토 (T028 issuer 시드 확장으로 흡수)
3. HIBP password breach client prep — 기존 T052 HIBP client 와 같은 패턴, v1.1 에서 매처 (T053) 그대로 재사용
4. zxcvbn weak password detector — 이미 T024 LockScreen 에 있음, 비번 등록 흐름에 동일 미터 적용만

위 4개는 본 Phase Plan 의 phase 들과 직교 (M9 Sync 일정 영향 없음). 별도 ad-hoc 커밋으로 처리.

---

## 다음 세션 entry

Phase B 부터 진입. 핵심 작업:

1. **VaultStorage trait 확장**: `derive_external_keys(salt_auth: &[u8], salt_enc: &[u8]) -> Result<DerivedSessionKeys, _>` 메서드 — vault 가 자체 보관한 passphrase 로 derive_session_keys 호출, passphrase 외부 노출 없음
2. **AuthSession 구조체 확장**: `enc_key: Option<SecretBox<[u8;32]>>` (Debug skip + **Serialize skip — vault file 영속 금지**), `salt_auth: Option<String>` + `salt_enc: Option<String>` (영속 — base64url)
3. **verify 커맨드 4개 수정**: register/assert × start/verify 가 받은 salts 를 AuthSession 에 저장, verify 성공 시 vault.derive_external_keys 자동 호출 → enc_key 메모리에
4. **`hydrate_session_from_vault` 수정**: 영속된 AuthSession 의 salts 로 vault.derive_external_keys 자동 호출 → enc_key 메모리 적재
5. **`vault_lock` 수정**: auth_session.enc_key zeroize
6. **신규 Tauri 커맨드 `sync_get_root_key()`**: `derive_subkey(enc_key, "crdt-root")` → 32바이트 base64url 반환. enc_key 없으면 NoSession 에러
7. **회귀 ≥ 6**: derive 결정론 / 다른 salt → 다른 키 / Serialize skip 검증 / hydrate 자동 적재 / vault_lock zeroize / sync_get_root_key happy path / NoSession 에러
