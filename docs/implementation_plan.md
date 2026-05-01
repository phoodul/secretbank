# Implementation Plan — API Vault

> 작성자: Planner Agent (claude-opus-4-7)
> 작성일: 2026-04-22
> 참조: docs/architecture.md, docs/task.md, docs/research_raw.md, docs/integrator_report.md

이 문서는 각 마일스톤(M0~M13)을 실제로 실행할 때 **먼저 쓸 테스트, 구체적 라이브러리/버전, 리스크 대응 방법** 을 명시한다. implementator 에이전트가 태스크 단위로 열고 읽는다.

---

## 사전 준비 사항 (모든 마일스톤 공통)

### 환경 변수 / 비밀 목록

| 키                                               | 용도                             | 등록 위치                             | 최초 필요 마일스톤 |
| :----------------------------------------------- | :------------------------------- | :------------------------------------ | :----------------- |
| `NVD_API_KEY`                                    | NVD CVE API 2.0 레이트 리밋 확대 | age 볼트 파일 `settings/nvd_api_key`  | M4                 |
| `GITHUB_APP_ID`                                  | GitHub App 식별자                | Cloudflare Workers secret             | M5                 |
| `GITHUB_APP_PRIVATE_KEY`                         | GitHub App JWT 서명              | Cloudflare Workers secret             | M5                 |
| `PADDLE_WEBHOOK_SECRET`                          | Paddle HMAC 검증                 | Cloudflare Workers secret             | M10                |
| `REVENUECAT_WEBHOOK_SECRET`                      | RevenueCat HMAC 검증             | Cloudflare Workers secret             | M10                |
| `JWT_SIGNING_KEY`                                | 릴레이 세션 JWT ES256 private    | Cloudflare Workers secret             | M8                 |
| `MINISIGN_PRIVATE_KEY`                           | 앱 업데이트 서명                 | GitHub Actions secret                 | M13                |
| `MINISIGN_PASSWORD`                              | 위 private key 보호              | GitHub Actions secret                 | M13                |
| `APPLE_API_KEY_ID`                               | Fastlane 앱스토어 업로드         | GitHub Actions secret                 | M13                |
| `APPLE_API_ISSUER_ID`                            |                                  |                                       |                    |
| `APPLE_API_PRIVATE_KEY`                          |                                  |                                       |                    |
| `PLAY_SERVICE_ACCOUNT_JSON`                      | Fastlane Play 업로드             | GitHub Actions secret                 | M13                |
| `SIGNPATH_API_TOKEN` / `AZURE_TRUSTED_SIGNING_*` | Windows Authenticode             | GitHub Actions secret                 | M13                |
| `HIBP_API_KEY`                                   | HIBP v3                          | age 볼트 파일 `settings/hibp_api_key` | M4 Should          |

### 계정 / 서비스 등록 순서

| 순서 | 작업                                                                       | 비용           | 리드타임              |
| :--- | :------------------------------------------------------------------------- | :------------- | :-------------------- |
| M0   | GitHub repo (public for core, private for relay/EE), GitHub Actions 활성화 | $0             | 즉시                  |
| M0   | Cloudflare 계정 (무료)                                                     | $0             | 즉시                  |
| M5   | GitHub App 생성 (apivault)                                                 | $0             | 즉시                  |
| M8   | Cloudflare Pages 프로젝트 (relay subdomain)                                | $0             | 즉시                  |
| M9   | Cloudflare Workers Paid ($5/월)                                            | $5/mo          | 즉시 (실사용 시 전환) |
| M10  | Paddle 벤더 등록 + 승인                                                    | 5% + $0.50/tx  | 1~2주 심사            |
| M10  | RevenueCat 프로젝트 (무료 ~ $2.5K ARR)                                     | $0 초반        | 즉시                  |
| M10  | Apple Developer Program                                                    | $99/년         | 즉시                  |
| M10  | Google Play Console                                                        | $25 일회       | 즉시                  |
| M13  | 도메인 (api-vault.app 등)                                                   | ~$30/년        | 즉시                  |
| M13  | SignPath.io 또는 Azure Trusted Signing                                     | ~$15~50/월     | 심사 1~3일            |
| M13  | 변호사 법률 리뷰 (Privacy/ToS)                                             | $500~1500 일회 | 1~2주                 |

### 개발 환경 prerequisites

- Node.js 20.18+ (LTS)
- pnpm 9+ (현재 워크플로우 `pnpm` 사용)
- Rust stable (rustup install stable), 최소 1.77.2
- Tauri CLI v2 (`pnpm add -g @tauri-apps/cli@^2`)
- iOS 빌드: Xcode 15+, Apple Silicon 권장
- Android 빌드: Android Studio Koala+, NDK r25+
- Windows 서명: SignPath 또는 Azure code signing 구독
- DB 도구: `sqlx-cli` (`cargo install sqlx-cli --no-default-features --features sqlite`)

### TDD 공통 원칙

1. **Rust**: `cargo test --workspace` 성공을 커밋 전 필수 게이트로 삼는다. `#[tokio::test]`, `#[sqlx::test]` 활용. 공유 fixtures 는 `crates/*/tests/fixtures/`.
2. **TypeScript**: Vitest + @testing-library/react. `pnpm test --run` 게이트. 컴포넌트는 최소 렌더 + 한 상호작용 테스트.
3. **Contract tests (Rust trait)**: `VaultStorage`, `Connector` 같은 trait 은 `tests/contract_*.rs` 에 mock 기반으로 적어두고, 새 구현체가 나올 때마다 재실행.
4. **Workers**: Miniflare 로 로컬 테스트. `@cloudflare/vitest-pool-workers` 사용 권장.
5. **E2E**: Playwright 는 M12 이전에는 생략. M12 부터 웹 뷰어 E2E + Passkey virtual authenticator.

---

## M0. Foundation

### 개요

Tauri v2 + React 19 + shadcn/ui 부트스트랩은 완료 상태. 이 마일스톤은 **Rust 크레이트 분리, 의존성 추가, CI, 라이선스, UI primitive 확대, 라우팅 + i18n** 을 한꺼번에 정리하여 이후 모든 기능 개발의 토대를 놓는다.

### 태스크 그룹

T001 ~ T012 (12개 Must)

### 핵심 기술 결정

| 항목                | 선택                                              | 버전              | 근거                                             |
| :------------------ | :------------------------------------------------ | :---------------- | :----------------------------------------------- |
| Rust workspace 구조 | 9개 멀티 크레이트                                 | -                 | architecture.md 3.1, 책임 분리 + 빌드 시간 단축  |
| SQL                 | `sqlx`                                            | 0.8               | 컴파일 타임 쿼리 검증, `sqlite` + `migrate` 기능 |
| HTTP                | `reqwest`                                         | 0.12 (rustls-tls) | native-tls 회피 (크로스 플랫폼), TLS 검증 강제   |
| 시간                | `time`                                            | 0.3               | `chrono` 대비 DST 안전, serde 지원               |
| ULID                | `ulid`                                            | 1.1               | lexicographic 정렬 + UUID v7 유사                |
| 로깅                | `tracing` + `tracing-subscriber`                  | latest            | 구조화 로그, span 기반                           |
| Secrets             | `secrecy` + `zeroize`                             | latest            | 메모리 zeroize 자동                              |
| Errors              | `thiserror` (crate errors) + `anyhow` (app-level) | latest            | 관용 패턴                                        |
| 프론트 라우팅       | `react-router-dom`                                | 7                 | Data Router + file-less, 가장 안정               |
| i18n                | `react-i18next`                                   | 15+               | ux_research.md #12, Tauri 검증됨                 |
| Forms               | `react-hook-form` + `zod` + `@hookform/resolvers` | latest            | 접근성 + 타입 안전                               |

### TDD 전략

**T001~T002 (크레이트 분리):**

- 먼저 `crates/api-vault-core/tests/smoke.rs` — `#[test] fn crate_exists() { }` (빌드만 확인)
- `cargo build --workspace` 가 녹색이면 통과

**T013 준비 (SQLite):**

- `crates/api-vault-storage/tests/migration_test.rs`:

```rust
#[sqlx::test]
async fn migrations_apply_cleanly(pool: SqlitePool) {
    let tables: Vec<(String,)> = sqlx::query_as("SELECT name FROM sqlite_master WHERE type='table'")
        .fetch_all(&pool).await.unwrap();
    assert!(tables.iter().any(|t| t.0 == "credential"));
}
```

- 이 테스트는 M1 T013 구현 후 녹색이 된다.

**T008~T010 (UI primitives):**

- Vitest: `src/components/ui/badge.test.tsx` — variant 4개 렌더 snapshot.
- 라우팅: `src/App.test.tsx` — 각 route path 로 navigate 시 올바른 페이지 렌더 확인 (MemoryRouter 사용).

### 리스크 & 완화

| 리스크                                                                 | 대응                                                                                                             |
| :--------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------- |
| 워크스페이스 분리 후 `cargo tauri dev` 가 안 되는 경우 (bin 위치 변경) | `tauri.conf.json` 의 `beforeDevCommand` 와 `src-tauri/Cargo.toml` 의 bin path 조정. `api-vault-app` 이 기본 bin. |
| pnpm vs npm 혼재                                                       | lockfile `pnpm-lock.yaml` 단일 유지, `.npmrc` 에 `engine-strict=true`                                            |
| shadcn/ui CLI 와 현재 수동 구성 충돌                                   | `components.json` 기존 설정 존중, `pnpm dlx shadcn@latest add button --overwrite` 사용 시 주의                   |
| Windows 경로/라인엔딩                                                  | `.gitattributes` 에 `*.sh text eol=lf`, `*.ps1 text eol=crlf`                                                    |

### 검증 체크리스트 (사용자 수동 확인)

- [ ] `pnpm install` 성공
- [ ] `pnpm tauri dev` 로 기존 앱 그대로 실행
- [ ] `cargo test --workspace` 녹색
- [ ] `pnpm typecheck` 녹색
- [ ] `cargo clippy --workspace -- -D warnings` 녹색
- [ ] `/`, `/graph`, `/incidents`, `/audit`, `/settings` 5개 route 가 placeholder 페이지 렌더
- [ ] 언어 전환 (EN 기본) 동작

---

## M1. Local Vault Core

### 개요

Zero-Knowledge 로컬 볼트의 근본 레이어를 완성한다. **`age` crate 기반 AgeVaultStorage + OS Keyring + SQLite + VaultStorage trait + Argon2id/HKDF 키 파생 + 기본 Tauri 커맨드 + LockScreen UI**. 이후 모든 MVP 기능은 이 레이어 위에서 동작한다. (2026-04-22 결정에 따라 Stronghold 에서 `age` crate 로 교체됨 — `docs/project-decisions.md` 의 "볼트 암호화 엔진 교체" 섹션 참조.)

### 태스크 그룹

T013 ~ T024 (12개 Must)

### 핵심 기술 결정

| 항목                           | 선택                     | 버전   | 근거                                                                                                                                                                 |
| :----------------------------- | :----------------------- | :----- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 볼트 암호화 엔진               | `age` crate (RustCrypto) | 0.10+  | 2026-04-22 결정: Stronghold(libsodium-sys-stable AppLocker 이슈 + v3 deprecated 예정)에서 교체. age 는 표준 포맷(X25519 + ChaCha20-Poly1305), pure Rust, 모바일 호환 |
| OS Keyring                     | `keyring` crate          | 3      | research_raw.md §7 — hwchen/keyring-rs, 데스크톱 3플랫폼                                                                                                             |
| KDF                            | `argon2` crate           | 0.5    | OWASP 권장, age 에 전달할 symmetric key 파생용                                                                                                                       |
| HKDF                           | `hkdf` crate + `sha2`    | latest | 표준 — Argon2id 출력을 용도별 서브키(age-vault / crdt-root / value-root)로 분기                                                                                      |
| Digital Signature (device key) | `ed25519-dalek`          | 2      | research_raw.md §6, 가장 많은 사례                                                                                                                                   |
| X25519 (페어링, M9 선행)       | `x25519-dalek`           | 2      | age recipient 에도 동일 타입 재사용 가능                                                                                                                             |
| AEAD (값 채널)                 | `chacha20poly1305`       | 0.10   | IETF 준수, age 내부와 동일 계열                                                                                                                                      |

### age 볼트 초기화 패턴

```rust
// crates/api-vault-storage/src/age_vault/mod.rs (요지)
pub struct AgeVaultStorage {
    records: Option<RecordMap>,       // unlock 후 메모리에 상주 (secrecy::SecretBox)
    path: PathBuf,                    // <app_data_dir>/vault.age
    identity: Option<age::x25519::Identity>, // HKDF(info="age-vault") 로 파생
}

impl AgeVaultStorage {
    pub fn new(path: PathBuf) -> Self { ... }
}

#[async_trait::async_trait]
impl VaultStorage for AgeVaultStorage {
    async fn unlock(&mut self, password: SecretString) -> Result<(), VaultError> {
        // password + salt_enc → Argon2id → 32B enc_key
        // enc_key + HKDF(info="age-vault") → 32B seed → age::x25519::Identity
        let identity = derive_age_identity(&password, &self.salt_enc)?;
        let bytes = tokio::fs::read(&self.path).await?;
        let decryptor = age::Decryptor::new(&bytes[..])?;
        let mut reader = decryptor.decrypt(iter::once(&identity as &dyn age::Identity))?;
        let mut buf = Vec::new();
        reader.read_to_end(&mut buf)?;
        self.records = Some(RecordMap::from_bytes(&buf)?);
        self.identity = Some(identity);
        Ok(())
    }
    async fn put_secret(&mut self, path: &str, value: SecretBytes) -> Result<(), VaultError> {
        let map = self.records.as_mut().ok_or(VaultError::Locked)?;
        map.insert(path.into(), value);
        self.flush().await // age 재암호화 + atomic rename + .bak 백업
    }
    // ...
}
```

**주의:**

- X25519 recipient vs `age::scrypt::Recipient` 최종 선택은 T016 착수 시 확정 (`docs/project-decisions.md` M1 T016 착수 전 확인 항목 참조).
- Argon2id 는 앱 레벨 `kdf.rs` 에서 직접 호출. age 의 scrypt recipient 를 쓸 경우에도 salt 분리 원칙은 유지.
- 모든 민감 버퍼(`password`, `enc_key`, `identity seed`, `RecordMap`)는 `secrecy::SecretBox` 로 래핑하여 drop 시 zeroize.

### TDD 전략

**T014~T015 (trait + MockVaultStorage):**

- `crates/api-vault-storage/tests/vault_storage_contract.rs` — **모든 구현체가 통과해야 하는 계약 테스트**:

```rust
async fn contract_roundtrip<V: VaultStorage>(mut v: V, pw: &str) {
    v.unlock(SecretString::new(pw.into())).await.unwrap();
    v.put_secret("test/a", SecretBytes::from(vec![1,2,3])).await.unwrap();
    assert_eq!(v.get_secret("test/a").await.unwrap().expose_secret(), &[1,2,3]);
    v.lock().await.unwrap();
    assert!(v.get_secret("test/a").await.is_err()); // Locked
}
#[tokio::test]
async fn mock_passes_contract() { contract_roundtrip(MockVaultStorage::new("pw"), "pw").await; }
#[tokio::test]
async fn age_vault_passes_contract() { /* tempdir 에 vault.age 생성 */ }
```

**T017 (KDF):**

- `crates/api-vault-crypto/tests/kdf_test.rs` — Known-Answer Test 3개 (고정 salt + password → 고정 32바이트 기대값). `salt_auth != salt_enc` 일 때 결과 달라짐 검증.

**T021~T023 (Tauri commands):**

- Rust unit: `vault_init` → `vault_lock` → `vault_unlock` 라운드트립
- Vitest: LockScreen 에서 잘못된 패스프레이즈 입력 시 에러 메시지 렌더

### 테스트 데이터 전략

- Rust: `tempfile::TempDir` 로 테스트마다 새로운 `vault.age` 파일. SQLite 는 `sqlite::memory:`.
- 프론트: `invoke` mock 은 `@tauri-apps/api/mocks` (가능) 또는 vitest `vi.mock('@tauri-apps/api/core')`.
- 공통 fixtures: `tests/fixtures/sample_project/` 에 10개 고엔트로피 키가 든 `.env` 파일 (M2 T033 에서도 재사용).

### 리스크 & 완화

| 리스크                                                    | 대응                                                                                                                                      |
| :-------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------- |
| 볼트 파일 전체 재암호화 I/O 비용 (put 마다 flush)         | `tokio::sync::Mutex` 로 `AgeVaultStorage` 보호, batch flush / dirty flag 로 과도한 재암호화 방지. 크래시 대비 atomic rename + `.bak` 유지 |
| OS Keyring 이 Linux headless CI 에서 실패                 | CI 에서 `keyring` 관련 integration test 는 `#[cfg(not(target_os = "linux"))]`, unit test 만 남김. 앱에서는 폴백 세션 모드 안내            |
| Argon2id 64MiB 메모리 비용이 iOS/저사양 Android 에서 부담 | 모바일 전용 프리셋 `m=32MiB, t=4, p=1` 로 완화 (M11에서 검증)                                                                             |
| age recipient/포맷 선택 고정 부담                         | `VaultStorage` trait 로 격리되어 있으므로 X25519 ↔ scrypt 전환 시 파일 마이그레이션 유틸만 추가하면 됨. T016 착수 시 최종 결정            |
| age 모바일 동작 검증                                      | `age` 는 pure Rust 이므로 Stronghold 의 libsodium-sys 같은 네이티브 빌드 이슈 없음. M11 T105 에서 기기 라운드트립 최종 확인               |

### 검증 체크리스트

- [ ] 최초 실행 시 CreateVault 다이얼로그 → 패스프레이즈 2회 입력 → 성공 → Inventory (빈 상태)
- [ ] 앱 재시작 → LockScreen → 패스프레이즈 입력 → 해제
- [ ] 잘못된 패스프레이즈 3회 → 10초 쿨다운
- [ ] `~/.api-vault/vault.age` 파일 존재, 파일 자체는 읽을 수 없음 (age 암호문 바이너리)
- [ ] OS Keyring (Windows Credential Manager / macOS Keychain / Linux Secret Service) 에 `com.phoodul.apivault:master` 항목 존재

---

## M2. Inventory UI + 드롭 & 스캔

### 개요

MVP 의 "첫 5분" 가치를 결정하는 핵심 UX. **수동 등록 + 드롭&스캔 + Cmd+K + Settings + Auto-lock + Project/Usage 링크**.

### 태스크 그룹

T025 ~ T040 (14 Must + 2 Should)

### 핵심 기술 결정

| 항목                  | 선택                          | 근거                           |
| :-------------------- | :---------------------------- | :----------------------------- |
| Graph 렌더 라이브러리 | React Flow `@xyflow/react` 12 | research_raw.md §2             |
| Command Palette       | `cmdk` 1+                     | shadcn/ui 공식 통합            |
| Password strength     | `zxcvbn-ts`                   | `zxcvbn` 포크, 현대 TypeScript |
| Keyboard shortcuts    | `react-hotkeys-hook`          | 간결, Mac/Win 자동 분기        |
| Entropy calc          | custom                        | Shannon entropy 20 line        |
| File scanner          | `walkdir` + `ignore`          | `.gitignore` 존중, 표준        |

### 드롭&스캔 알고리즘

```rust
// crates/api-vault-connectors/src/env_scanner/mod.rs (요지)
pub fn scan_path(root: &Path, presets: &[IssuerPreset]) -> Vec<DetectedKey> {
    let walker = ignore::WalkBuilder::new(root)
        .add_custom_ignore_filename(".gitignore")
        .build();
    walker
        .filter_map(Result::ok)
        .filter(|e| is_candidate_file(e.path()))
        .flat_map(|e| scan_file(e.path(), presets))
        .collect()
}

fn is_candidate_file(path: &Path) -> bool {
    matches!(path.file_name().and_then(OsStr::to_str),
        Some(".env" | ".env.local" | ".env.production" | ".env.development"))
        || path.extension().map_or(false, |e| e == "json" || e == "toml" || e == "yml" || e == "yaml")
}

fn scan_file(path: &Path, presets: &[IssuerPreset]) -> Vec<DetectedKey> {
    // .env: KEY=value parse
    // other: regex high-entropy strings
    // for each candidate:
    //   entropy = shannon(value) ; if entropy < 3.5 → skip
    //   issuer = match preset regex ; confidence = 1.0 if regex else 0.5
    //   collect DetectedKey
}
```

### TDD 전략

**T033 (env scanner):**

- `tests/fixtures/sample_project/` 트리 구축:
  ```
  .env                    (5개 키: OpenAI sk-proj-..., Stripe sk_live_..., random abc123, ...)
  .env.local              (2개)
  packages/web/.env       (3개)
  .git/config             (ignored)
  node_modules/foo/.env   (ignored via .gitignore)
  ```
- `#[test] fn scan_detects_all_10_keys_ignoring_git_and_node_modules()`
- 매칭: 최소 4개 preset 매치 (OpenAI, Stripe, GitHub `ghp_`, AWS `AKIA`) — false positive 0

**T040 (security score):**

- `crates/api-vault-core/tests/security_score_test.rs` — 8개 시나리오:
  - 만료 7일 이내 → `danger`
  - 90일+ 미교체 → `warn`
  - prod+dev 동일 값 → `warn` (값 해시 비교로 감지)
  - scope 비어있음 → `info`
  - 모두 safe → `safe`

**UI 단위:**

- `CredentialCard.test.tsx` — `{ name, issuer, env }` props → 3단계 색상 dot 렌더 검증.
- `CreateCredentialDialog.test.tsx` — validation 실패 5종, 성공 시 invoke 호출 인자 확인.

### 리스크 & 완화

| 리스크                                         | 대응                                                                              |
| :--------------------------------------------- | :-------------------------------------------------------------------------------- |
| 드롭된 폴더가 너무 커 스캔 hang                | 파일 수 10k 초과 시 background job + progress event 스트리밍. 사용자 cancel 버튼. |
| 긴 `.env` 줄이 OOM 유발                        | 한 줄 512KB 제한 + `read_line_bounded`                                            |
| 엔트로피 임계값이 false positive/negative 조정 | 임계값 설정 노출 (Settings > Advanced > Entropy threshold), 기본 3.5              |
| Cmd+K 단축키가 input 안에서 충돌               | `isInputElement(target)` 체크로 guard                                             |
| zxcvbn 번들 크기 (~800KB)                      | dynamic import (`import('zxcvbn-ts')`) 로 CreateVault 시에만 로드                 |

### 검증 체크리스트

- [ ] 수동 등록 → Inventory 에 카드 즉시 표시
- [ ] `Cmd+K` (Mac) / `Ctrl+K` (Win) → Command Palette 열림, "Create credential" 액션 동작
- [ ] 프로젝트 폴더 드롭 → 감지된 키 5~10개 리뷰 화면 → Import N keys
- [ ] Credential 카드 클릭 → Detail Sheet → "Copy value" → 30초 progress → 클립보드 클리어
- [ ] 10분 무활동 → 자동 잠금 (Settings 기본값)
- [ ] 테마 토글 다크 ↔ 라이트

---

## M3. Dependency Graph & Blast Radius

### 개요

프로젝트의 핵심 차별점. **React Flow + dagre + 커스텀 노드 + Blast Radius 계산/하이라이트**.

### 태스크 그룹

T041 ~ T048 (7 Must + 1 Should)

### 핵심 기술 결정

| 항목           | 선택               | 근거                                       |
| :------------- | :----------------- | :----------------------------------------- |
| 그래프 구조    | `petgraph` 0.6     | Rust 생태 표준                             |
| 레이아웃       | `@dagrejs/dagre` 1 | ux_research.md §5.1, 계층형 DAG 최적       |
| 그래프 렌더    | `@xyflow/react` 12 | research_raw.md §2, `React.memo` 패턴 내장 |
| 성능 threshold | 500노드 60fps      | Integrator Report — MVP 범위               |

### Blast Radius 알고리즘 (BFS with depth)

```rust
pub fn blast_radius(g: &DependencyGraph, cred: Ulid) -> BlastRadius {
    let start = g.node_index_of(NodeRef::Credential(cred))
        .expect("credential not in graph");
    let mut primary = Vec::new();
    let mut secondary = Vec::new();
    let mut tertiary = Vec::new();
    let mut bfs = Bfs::new(&g.graph, start);
    // hack: track depth via visited set + layers
    let mut current_layer = HashSet::from([start]);
    let mut depth = 0;
    while !current_layer.is_empty() && depth < 4 {
        let mut next_layer = HashSet::new();
        for &n in &current_layer {
            for nb in g.graph.neighbors(n) {
                if !current_layer.contains(&nb) { next_layer.insert(nb); }
            }
        }
        for &n in &next_layer {
            match depth {
                0 => primary.push(g.graph[n].clone()),
                1 => secondary.push(g.graph[n].clone()),
                _ => tertiary.push(g.graph[n].clone()),
            }
        }
        current_layer = next_layer;
        depth += 1;
    }
    BlastRadius { primary, secondary, tertiary }
}
```

### TDD 전략

**T041 (graph build):**

- Fixture repo with 2 issuers, 3 credentials, 2 projects, 4 deployments, 5 usages → `build_from_repo` → 14 nodes, 14 edges 정확.

**T042 (blast radius):**

- Linear chain Issuer → Credential A → Usage → Project → Deployment1, Deployment2
  - `blast_radius(A)` primary = [Usage], secondary = [Project], tertiary = [Deployment1, Deployment2]

**T046 (UI highlight):**

- `DependencyGraph.test.tsx` — 10 mock nodes 렌더 → CredentialNode 클릭 시 `invoke('blast_radius_for_credential')` 호출 → 응답에 따라 노드 data-status 속성 검증.

### 성능 벤치마크

```rust
// crates/api-vault-core/benches/graph_bench.rs (criterion)
fn bench_blast_radius_500(c: &mut Criterion) {
    let g = fixture_with_n_nodes(500);
    c.bench_function("blast_radius 500 nodes", |b| {
        b.iter(|| black_box(blast_radius(&g, test_cred_id())))
    });
}
// 목표: < 1ms
```

### 리스크 & 완화

| 리스크                           | 대응                                                                         |
| :------------------------------- | :--------------------------------------------------------------------------- |
| 500 노드에서 dagre 레이아웃 지연 | 레이아웃 계산을 web worker 또는 Tauri 백엔드에서 1회 수행 후 position 캐시   |
| React Flow 렌더 시 불필요 리렌더 | 모든 노드 `React.memo`, `nodeTypes` 는 컴포넌트 밖 const 로 선언 (공식 권장) |
| 노드 수 >1000 시 프레임 드롭     | Settings 에 "Simplified graph mode" 옵션 (label 숨김, edge 수 제한)          |
| 모바일 그래프 사용성 저하        | T048 — 모바일 전용 리스트 뷰로 대체                                          |

### 검증 체크리스트

- [ ] `/graph` 진입 시 모든 노드 자동 레이아웃
- [ ] CredentialNode 클릭 → 연관 Project/Deployment 노드 빨강/주황 outline + 나머지 dim
- [ ] Esc → 선택 해제
- [ ] "수평/수직" 레이아웃 토글 동작
- [ ] 데스크톱 500 노드 fixture 로드 시 60fps 유지
- [ ] 모바일에서는 리스트 뷰로 자동 전환

---

## M4. Incident Feed

### 개요

**NVD + GHSA + SaaS RSS + (옵션) HIBP** 를 주기적으로 수집하고, 로컬 인벤토리와 자동 매칭하여 알림.

### 태스크 그룹

T049 ~ T058 (8 Must + 2 Should)

### 핵심 기술 결정

| 항목            | 선택                                   | 근거                    |
| :-------------- | :------------------------------------- | :---------------------- |
| Rate limiting   | `governor` 0.6                         | 토큰 버킷, 검증된 crate |
| RSS 파싱        | `feed-rs` 2                            | Atom/RSS/JSON Feed 통합 |
| Circuit Breaker | `failsafe` 1                           | 또는 간단한 수동 구현   |
| 스케줄러        | `tokio::time::interval` + spawn        | 별도 crate 불필요       |
| HTTP 재시도     | `reqwest-retry` + `reqwest-middleware` | exponential backoff     |

### 폴링 아키텍처

```
┌──────────────────────────────────────────────┐
│  FeedScheduler (api-vault-app/services)      │
│   ├── NvdPoller (every 2h)                   │
│   ├── GhsaPoller (every 24h)                 │
│   ├── RssPoller x10 (every 5min)             │
│   └── HibpOnDemand (user trigger only)       │
└────────────────┬─────────────────────────────┘
                 │
                 ▼
     ┌─────────────────────────┐
     │ IncidentIngestion        │
     │  ├── deduplicate (source_id) │
     │  ├── store in SQLite     │
     │  └── match against credentials │
     └───────────┬──────────────┘
                 │
                 ▼
     emit("incidents:updated", summary)
```

### NVD 증분 쿼리 디자인

```rust
// Store last polled timestamp in settings
let last = settings.get("nvd.last_mod_end").unwrap_or_else(|| Utc::now() - Duration::days(7));
let url = format!(
    "https://services.nvd.nist.gov/rest/json/cves/2.0?lastModStartDate={}&lastModEndDate={}",
    last.to_rfc3339(),
    Utc::now().to_rfc3339()
);
// response.vulnerabilities → Vec<Incident>
settings.set("nvd.last_mod_end", Utc::now().to_rfc3339());
```

### TDD 전략

**T049~T051 (feed clients):**

- `wiremock` 으로 각 외부 API 모의:

```rust
#[tokio::test]
async fn nvd_fetch_handles_429_with_retry() {
    let server = MockServer::start().await;
    Mock::given(method("GET")).and(path("/rest/json/cves/2.0"))
        .respond_with(ResponseTemplate::new(429).insert_header("Retry-After", "1"))
        .up_to_n_times(1).mount(&server).await;
    Mock::given(method("GET")).respond_with(ResponseTemplate::new(200).set_body_json(sample_nvd_response()))
        .mount(&server).await;
    let client = NvdClient::with_base_url(&server.uri());
    let result = client.fetch_incremental(Utc::now() - Duration::hours(1), None).await.unwrap();
    assert_eq!(result.len(), 1);
}
```

**T053 (matcher):**

- Parameterized test: 10 fixture incidents × 5 credentials = 50 매트릭스, 예상 매치 수 assertion.

**T054 (scheduler):**

- `tokio::time::pause()` + `advance()` 로 fake clock. NVD 2h interval 이 2번 트리거되는지 검증.

### 리스크 & 완화

| 리스크                                                       | 대응                                                                                      |
| :----------------------------------------------------------- | :---------------------------------------------------------------------------------------- |
| NVD 레이트 리밋 429                                          | Retry-After 헤더 존중 + exponential backoff, 키 없을 때 request=50/30s 내로 governor 설정 |
| RSS 서버 다운 시 앱 영향                                     | Circuit Breaker: 연속 3회 실패 → 1h backoff, 앱에 "Feed source unavailable" 배지만 표시   |
| false positive 매칭 (예: "Git" 공급자가 모든 issuer 와 매치) | issuer.slug 우선 매칭 + keyword match 는 display_name 전체 문자열 일치만                  |
| 폴링 중 앱 종료                                              | `CancellationToken` 으로 graceful shutdown, partial write 방지                            |
| SaaS 상태 RSS URL 변경                                       | 프리셋 업데이트는 앱 버전 포함 (Phase 2: 원격 feed manifest)                              |

### 검증 체크리스트

- [ ] 앱 시작 후 60초 내 RSS 10개 모두 폴링 완료
- [ ] `/incidents` 에 실제 최근 incident 10~50개 표시
- [ ] Credential Detail 에 매칭된 incident 노출
- [ ] 인터넷 차단 → "Offline" 배지, 앱 동작 유지
- [ ] Settings 에서 NVD API 키 저장 후 재폴링 시 레이트 리밋 확대 적용

---

## M5. GitHub Connector + RAILGUARD

### 개요

**GitHub App 기반 Secret Scanning 읽기** + **바이브 코더 핵심 차별점 RAILGUARD** (Gate 1 Q5=B, Q8=A).

### 태스크 그룹

T059 ~ T068 (10 Must)

### 핵심 기술 결정

| 항목                | 선택                                | 근거                             |
| :------------------ | :---------------------------------- | :------------------------------- |
| GitHub App          | fine-grained, installation token    | research_raw.md §4               |
| JWT 생성            | `jsonwebtoken` (TypeScript: `jose`) | 표준                             |
| Octokit             | `octocrab` 0.40+ (Rust)             | 비동기, 풍부                     |
| GitHub webhook 검증 | `hmac` + `sha2`                     | X-Hub-Signature-256              |
| 템플릿 엔진         | `minijinja` 2                       | Rust, Jinja2 호환, 작은 바이너리 |

### GitHub App 권한 요청 (runbook step)

```yaml
# docs/runbooks/github-app-registration.md
Permissions:
  Repository:
    contents: read          # .env 스캔용
    secret_scanning_alerts: read
    actions: read            # Actions Secrets 목록
    actions: write           # Pro 전용, 자동 rotation
  Organization:
    secret_scanning_alerts: read
Webhooks: off (Phase 2에서 활성화)
```

### RAILGUARD 템플릿 예시

```jinja
# templates/cursorrules.tpl
{# Context: {{ project_name }}, {{ issuers | join(", ") }} #}
# API Vault — Security Guardrails for AI Coding Assistants
# Auto-generated, do not edit manually. Regenerate via API Vault.

- Never hardcode API keys, secrets, or tokens in any file.
- Always reference secrets via environment variables (e.g. process.env.OPENAI_API_KEY).
- If you see a high-entropy string that looks like a key, stop and ask the user.
- This project uses the following API providers: {{ issuers | join(", ") }}
  {%- for issuer in issuers %}
  - {{ issuer }}: prefix `{{ issuer_prefix(issuer) }}`
  {%- endfor %}
- Add new secrets to .env.local (git-ignored) and update API Vault, not to source code.
- Rotate any leaked secret immediately using API Vault's Kill Switch.
```

### TDD 전략

**T062 (secret scanning):**

```rust
#[tokio::test]
async fn list_secret_scanning_alerts_paginates() {
    let server = MockServer::start().await;
    // First page returns Link: <...page=2>; rel="next"
    Mock::given(method("GET")).and(path("/repos/org/repo/secret-scanning/alerts"))
        .respond_with(ResponseTemplate::new(200)
            .set_body_json(page1_fixture())
            .insert_header("Link", format!("<{}/repos/org/repo/secret-scanning/alerts?page=2>; rel=\"next\"", server.uri())))
        .up_to_n_times(1).mount(&server).await;
    // Second page
    Mock::given(method("GET")).and(query_param("page", "2"))
        .respond_with(ResponseTemplate::new(200).set_body_json(page2_fixture()))
        .mount(&server).await;

    let result = github.list_keys(&auth_with_base_url(&server.uri())).await.unwrap();
    assert_eq!(result.len(), 6); // 3 + 3
}
```

**T065 (templates):**

- 각 템플릿 × 2 fixture context = 8 snapshot files in `crates/api-vault-railguard/tests/snapshots/`.
- `insta` crate 로 snapshot diff.

**T067 (UI):**

- Vitest: Preview → diff 렌더 → 체크박스 변경 → Apply 시 invoke 호출 인자 확인.

### 리스크 & 완화

| 리스크                                        | 대응                                                                                                           |
| :-------------------------------------------- | :------------------------------------------------------------------------------------------------------------- |
| GitHub App private key 유출 위험              | 릴레이 서버에만 보관, 클라이언트 바이너리 포함 금지. installation token 교환만 릴레이 경유                     |
| Installation token 1시간 만료                 | 55분에 자동 refresh (5분 여유), KV 캐시                                                                        |
| Actions Secrets 쓰기 fine-grained 권한 불확실 | T063 구현 전 실제 test org 에서 `actions:write` fine-grained permission 허용 여부 확인 (docs/runbooks 에 기록) |
| RAILGUARD 덮어쓰기로 사용자 수동 수정분 손실  | 항상 `.bak-<timestamp>` 백업 + "기존 파일에 append 하기" 옵션 제공                                             |
| Cursor/Windsurf 스펙 변화                     | 템플릿에 버전 코멘트, 앱 업데이트 시 마이그레이션                                                              |

### 검증 체크리스트

- [ ] "Connect GitHub" → 브라우저 → installation 후 deep link 콜백 수신 → 저장소 목록 표시
- [ ] 저장소 선택 → "Scan" → Secret Scanning alerts 로드 → Inventory 와 매칭
- [ ] Free 사용자로 Pro 쓰기 기능 호출 시 Upgrade 다이얼로그
- [ ] 드롭&스캔 완료 후 배너 "Add AI guardrail rules" 표시 → Preview → Apply → 4개 파일 생성
- [ ] 기존 `.cursorrules` 가 있으면 `.cursorrules.bak-<ts>` 생성 후 덮어쓰기

---

## M6. Audit Log

### 개요

**ed25519 Hash Chain + 모든 mutating command 에 훅 삽입**. 변조 방지 + 사용자 신뢰.

### 태스크 그룹

T069 ~ T074 (6 Must)

### 핵심 기술 결정

| 항목               | 선택                      | 근거                     |
| :----------------- | :------------------------ | :----------------------- |
| 서명               | `ed25519-dalek` 2         | research_raw.md §6       |
| Hash               | `sha2` crate SHA-256      | 표준                     |
| 직렬화 (canonical) | `serde_json` + 정렬된 key | Merkle 트리 전환 시 유리 |

### Chain append 코드

```rust
pub fn append(
    repo: &AuditRepo,
    input: AuditInput,
    signing_key: &SigningKey,
    prev: Option<&AuditLog>,
) -> Result<AuditLog> {
    let prev_hash = prev.map(|p| p.entry_hash).unwrap_or([0u8; 32]);
    let seq = prev.map(|p| p.seq + 1).unwrap_or(0);
    let serialized = canonical_json(&AuditLogForHashing {
        id: &input.id,
        seq,
        device_id: &input.device_id,
        actor: &input.actor,
        action: &input.action,
        subject_kind: &input.subject_kind,
        subject_id: &input.subject_id,
        payload_json: &input.payload_json,
        prev_hash,
        created_at: input.created_at,
    })?;
    let entry_hash: [u8; 32] = Sha256::digest(&serialized).into();
    let signature = signing_key.sign(&entry_hash);
    let entry = AuditLog { /* fields */, prev_hash, entry_hash, signature: signature.to_bytes().to_vec() };
    repo.insert(&entry)?;
    Ok(entry)
}
```

### TDD 전략

**T069 (chain logic):**

```rust
#[test]
fn chain_integrity_after_tamper() {
    let mut repo = InMemoryAuditRepo::new();
    let key = SigningKey::from_bytes(&[1u8; 32]);
    let mut prev = None;
    for i in 0..10 {
        let entry = append(&mut repo, test_input(i), &key, prev.as_ref()).unwrap();
        prev = Some(entry);
    }
    assert_eq!(verify(repo.all(), &key.verifying_key()).valid_count, 10);

    // Tamper with entry 5's payload
    repo.tamper(5, |e| e.payload_json = "tampered".into());
    let verification = verify(repo.all(), &key.verifying_key());
    assert_eq!(verification.first_invalid_seq, Some(5));
}
```

**T071 (audit hook in mutating commands):**

- `credential_create` 호출 후 `audit_log` row 존재 확인.
- credential_create 가 중간에 실패하면 audit 도 insert 되지 않음 (transaction rollback).

### 리스크 & 완화

| 리스크                                          | 대응                                                                                     |
| :---------------------------------------------- | :--------------------------------------------------------------------------------------- |
| O(n) 검증 비용이 수만 entry 에서 지연           | UI 에서 progress bar + 백그라운드 async 검증; Phase 2 Merkle 전환                        |
| device key 유실 시 체인 검증 불가               | age 볼트 마스터 패스프레이즈와 함께 복구되므로 사용자 패스프레이즈 분실 외 시나리오 없음 |
| 멀티 디바이스 체인 병합 복잡성                  | 디바이스별 서브체인으로 처리, 표시 시 시간순 merge. 크로스 체인 링크는 Phase 2           |
| 감사 로그가 SQLite 파일 직접 편집으로 변조 가능 | 체인 검증이 항상 변조 감지. UI 에서 명시적 경고                                          |

### 검증 체크리스트

- [ ] credential 생성/수정/삭제 후 `/audit` 에 엔트리 표시
- [ ] "Verify chain" 버튼 → 녹색 배너 "All N entries valid"
- [ ] SQLite 파일 직접 수정(수동) → Verify chain → 빨간 배너 + 오염 seq 표시
- [ ] Credential Detail 에 해당 키 관련 audit 10개 표시

---

## M7. Kill Switch

### 개요

**2단계 확인 UI + revoke + bulk revoke** (Gate 1 Q1=C — revoke 무료, 자동 배포 Pro).

### 태스크 그룹

T075 ~ T078 (4 Must)

### 핵심 기술 결정

| 항목      | 선택                                          | 근거                               |
| :-------- | :-------------------------------------------- | :--------------------------------- |
| 확인 토큰 | `uuid::Uuid::new_v4().to_string()`            | 단순                               |
| 토큰 저장 | Rust in-memory `DashMap<String, ExpiryToken>` | 5분 TTL, 프로세스 생존 범위로 충분 |
| Biometric | `@tauri-apps/plugin-biometric`                | M11 통합                           |

### 2단계 플로우

```
1. 사용자: Credential Detail → [Revoke] 버튼
2. UI: Dialog 열림 + "Type '{cred_name}' to confirm" input
3. 사용자: 이름 타이핑 → 일치 시 [Continue] 활성
4. UI: invoke('kill_switch_request_confirm', { cred_id })
5. 백엔드: random token 생성 → DashMap 저장 (5min TTL) → 반환
6. UI: 토큰 수신 + 두번째 step "I understand, revoke now"
7. 사용자: 클릭 → invoke('kill_switch_revoke', { cred_id, token })
8. 백엔드: token 검증 → credential.status='revoked' + audit append
9. UI: 성공 toast + Detail 뷰 revoked 상태로 갱신
```

### TDD 전략

```rust
#[tokio::test]
async fn revoke_without_token_is_rejected() {
    let app = test_app().await;
    let err = app.command::<()>("kill_switch_revoke", json!({"credential_id": "01H...", "confirmation_token": "fake"}))
        .await.unwrap_err();
    assert_eq!(err.code, "INVALID_CONFIRMATION_TOKEN");
}

#[tokio::test]
async fn revoke_full_flow_updates_status_and_audit() {
    let app = test_app().await;
    let cred = app.create_credential("test").await;
    let ConfirmationToken { token } = app.command("kill_switch_request_confirm", json!({"credential_id": cred.id})).await.unwrap();
    app.command::<()>("kill_switch_revoke", json!({"credential_id": cred.id, "confirmation_token": token})).await.unwrap();
    let fetched = app.command::<Credential>("credential_get", json!({"id": cred.id})).await.unwrap();
    assert_eq!(fetched.status, CredentialStatus::Revoked);
    let audit = app.command::<Vec<AuditEntry>>("audit_list", json!({"limit": 10, "offset": 0})).await.unwrap();
    assert!(audit.iter().any(|e| e.action == "credential.revoke" && e.subject_id == cred.id));
}
```

**UI (Vitest):**

- 이름 미일치 시 버튼 disabled
- 취소 버튼 → 모달 닫힘 + 토큰 서버 cleanup 확인 (invoke 추적)

### 리스크 & 완화

| 리스크                                                        | 대응                                                                               |
| :------------------------------------------------------------ | :--------------------------------------------------------------------------------- |
| 사용자가 잘못 revoke → 되돌리기 불가                          | audit log 에서 복구 이력 — Phase 2 "Undo revoke within 7 days" 옵션                |
| Bulk revoke 중 일부 실패 → 불일치                             | 트랜잭션 단위 처리, 실패 시 지금까지 성공 분은 유지 + 사용자에게 성공/실패 수 표시 |
| 자동 배포(rotation)는 Pro — 사용자가 무료 tier 에서 이후 조치 | revoke 완료 후 "Upgrade for automatic rotation" banner 노출                        |

### 검증 체크리스트

- [ ] 이름 미일치 입력 → Continue 버튼 disabled
- [ ] 전체 플로우 통과 시 toast + Inventory 에 strikethrough + "Revoked" 배지
- [ ] Graph 뷰에서 해당 노드 빨강 outline
- [ ] Audit 에 `credential.revoke` 엔트리 추가
- [ ] Issuer bulk revoke 버튼 동작 (5개 credential 일괄 처리)

---

## M8. Auth (Passkey + OAuth)

### 개요

**Cloudflare Workers 릴레이 스캐폴드 + WebAuthn + OAuth** (Gate 1 Q3=A 크로스 플랫폼 구독 선행 조건).

### 태스크 그룹

T079 ~ T086 (8 Must)

### 핵심 기술 결정

| 항목               | 선택                         | 근거                          |
| :----------------- | :--------------------------- | :---------------------------- |
| Workers 프레임워크 | Hono 4                       | TypeScript first, 가볍고 빠름 |
| ORM                | Drizzle 0.36+                | D1 공식 지원, 타입 안전       |
| WebAuthn server    | `@simplewebauthn/server` 10+ | 사실상 표준                   |
| WebAuthn client    | `@simplewebauthn/browser`    | 위와 쌍                       |
| JWT                | `jose` 5                     | Workers 호환, ES256           |
| OAuth              | `arctic` 또는 직접 구현      | GitHub/Google 표준            |
| Rate limit         | KV sliding window 직접 구현  | 외부 lib 불필요               |

### Workers 설정 초기화

```bash
# Separate repo or monorepo sub-dir; planner's choice: monorepo subdir
mkdir apps/relay && cd apps/relay
pnpm create hono@latest
# Add @cloudflare/workers-types, drizzle-orm, drizzle-kit, @simplewebauthn/server, jose, zod
wrangler d1 create api-vault-relay-dev
wrangler kv:namespace create KV
# wrangler.toml 에 binding 추가
```

### 릴레이 라우트 예시

```typescript
// apps/relay/src/index.ts
import { Hono } from "hono";
import { cors } from "hono/cors";
import auth from "./routes/auth";
import sync from "./routes/sync";
import pair from "./routes/pair";
import billing from "./routes/billing";
import me from "./routes/me";

const app = new Hono<{ Bindings: Env }>();
app.use("*", cors({ origin: ["tauri://localhost", "https://app.api-vault.app"] }));
app.get("/health", (c) => c.text("ok"));
app.route("/auth", auth);
app.route("/sync", sync);
app.route("/pair", pair);
app.route("/billing", billing);
app.route("/me", me);
export default app;
```

### TDD 전략

**Miniflare 기반:**

```typescript
// apps/relay/tests/auth.test.ts
import { describe, it, expect } from "vitest";
import { SELF } from "cloudflare:test";

describe("passkey register", () => {
  it("issues challenge and stores it in KV", async () => {
    const resp = await SELF.fetch("https://relay.local/auth/passkey/register/start", {
      method: "POST",
      body: JSON.stringify({ email: "t@e.st" }),
    });
    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body).toHaveProperty("challenge");
    expect(body).toHaveProperty("userId");
  });
});
```

**T085 (salt 분리):**

```rust
#[test]
fn auth_hash_and_enc_key_differ_with_different_salts() {
    let pw = SecretString::new("correcthorsebatterystaple".into());
    let salt_a = [1u8; 16];
    let salt_e = [2u8; 16];
    let auth_hash = derive_auth_hash(&pw, &salt_a);
    let enc_key = derive_enc_key(&pw, &salt_e);
    assert_ne!(auth_hash, enc_key.expose_secret());
}
```

### 리스크 & 완화

| 리스크                                   | 대응                                                                                                                                                                    |
| :--------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Passkey 가 Tauri WebView 에서 동작 안 함 | iOS/Android 에서는 네이티브 `LAContext` / `BiometricPrompt` 사용 — T083 에서 플랫폼 분기. 데스크톱 Tauri WebView 는 WebAuthn 지원 확인 후 결정 (WebView2 / WebKit 지원) |
| OAuth redirect URI 등록                  | deep link `apivault://auth/callback` 은 GitHub/Google OAuth 에 등록 (HTTPS 아닌 커스텀 스킴). 대안: 웹 redirect → QR 재인증                                             |
| Workers CORS 문제                        | Tauri WebView origin 은 `tauri://localhost` 또는 `https://tauri.localhost`, 둘 다 CORS 허용                                                                             |
| 세션 JWT 탈취                            | 짧은 수명(1h) + refresh token (age 볼트 파일 `auth/refresh_token` 레코드에 저장) + device binding (JWT 에 device_id 포함)                                               |
| salt 유실 시 enc_key 재파생 불가         | `/me` 응답에 항상 salt 포함, 서버가 잃어버려도 D1 백업에서 복구                                                                                                         |

### 검증 체크리스트

- [ ] `wrangler dev` 로 로컬 릴레이 기동 + `curl /health` 200
- [ ] Passkey 등록 → D1 `passkeys` 테이블 row 추가
- [ ] 동일 디바이스에서 Passkey 로 재로그인 성공
- [ ] GitHub OAuth → callback → 세션 JWT 수신 → `/me` 로 사용자 정보 조회
- [ ] 새 디바이스에서 로그인 시 salt 수신 + 로컬 master passphrase 입력 → enc_key 파생 → sync 준비

---

## M9. Sync Infrastructure

### 개요

**Yjs + SecSync + Cloudflare Workers 릴레이 + Device pairing + 값 전용 채널**. Pro 구독의 실질적 가치.

### 태스크 그룹

T087 ~ T096 (10 Must)

### 핵심 기술 결정

| 항목                 | 선택                                             | 근거                                |
| :------------------- | :----------------------------------------------- | :---------------------------------- |
| CRDT                 | Yjs 13                                           | research_raw.md §10 (프로덕션 검증) |
| E2EE                 | SecSync (GitHub nikgraf)                         | Yjs 공식 통합                       |
| Persistence          | `y-indexeddb`                                    | 오프라인                            |
| Binary serialization | MessagePack? — Yjs 내장 binary format 사용       | CRDT 공식                           |
| AEAD (값 채널)       | `chacha20poly1305` (Rust), `@noble/ciphers` (TS) | 둘 다 XChaCha20-Poly1305 지원       |
| X25519               | `x25519-dalek` (Rust), `@noble/curves` (TS)      |                                     |
| QR                   | `qrcode` (Rust), `qrcode.react` (UI)             |                                     |

### SyncProvider 핵심 설계

```tsx
// src/features/sync/SyncProvider.tsx (요지)
const YDocContext = createContext<Y.Doc | null>(null);
export function SyncProvider({ children }: Props) {
  const [doc, setDoc] = useState<Y.Doc | null>(null);
  const { rootKey } = useRootKey(); // from Tauri backend
  const { entitlement } = useEntitlement();

  useEffect(() => {
    const d = new Y.Doc();
    const persistence = new IndexeddbPersistence("api-vault-root", d);
    let secsync: SecSyncClient | null = null;
    if (rootKey && entitlement.plan === "pro") {
      secsync = new SecSyncClient({
        doc: d,
        websocketEndpoint: "wss://relay.api-vault.app/sync/ws",
        key: rootKey,
        documentId: userId,
      });
    }
    setDoc(d);
    return () => {
      secsync?.close();
      persistence.destroy();
      d.destroy();
    };
  }, [rootKey, entitlement.plan]);

  if (!doc) return null;
  return <YDocContext.Provider value={doc}>{children}</YDocContext.Provider>;
}
```

### Bidirectional mapping (SQLite ↔ Y.Map)

```ts
// src/features/sync/mapping.ts
export function registerCredentialsMapping(doc: Y.Doc) {
  const credentialsMap = doc.getMap<Y.Map<unknown>>("credentials");
  let suppressEcho = false;

  // Local → CRDT
  listen("db:credential-upserted", (ev: Credential) => {
    if (suppressEcho) return;
    const entry = credentialsMap.get(ev.id) ?? new Y.Map();
    for (const [k, v] of Object.entries(ev)) {
      if (k === "vault_ref") continue; // device-local only
      entry.set(k, v);
    }
    credentialsMap.set(ev.id, entry);
  });

  // CRDT → Local
  credentialsMap.observeDeep((events) => {
    suppressEcho = true;
    try {
      for (const ev of events) {
        /* invoke('credential_update', ...) per change */
      }
    } finally {
      suppressEcho = false;
    }
  });
}
```

### TDD 전략

**T089 (mapping):**

```ts
it("local credential create pushes into Y.Map", async () => {
  const doc = new Y.Doc();
  registerCredentialsMapping(doc);
  dispatch("db:credential-upserted", fixtureCredential("c1"));
  expect(doc.getMap("credentials").get("c1")?.get("name")).toBe("Test Key");
});
it("Y.Map remote change does not re-emit to local", async () => {
  /* echo suppression */
});
```

**T090 (sync endpoint):**

```ts
it("upload and download roundtrip with encryption", async () => {
  const jwt = issueTestJwt({ user_id: "u1" });
  const cipher = randomBytes(128);
  const nonce = randomBytes(24);
  await SELF.fetch("/sync/snapshot", {
    method: "POST",
    headers: { authorization: `Bearer ${jwt}` },
    body: JSON.stringify({
      doc_id: "root",
      version: 1,
      ciphertext: b64(cipher),
      nonce: b64(nonce),
    }),
  });
  const resp = await SELF.fetch("/sync/deltas?since=0", {
    headers: { authorization: `Bearer ${jwt}` },
  });
  const body = await resp.json();
  expect(body[0].ciphertext).toBe(b64(cipher));
});
```

**T092 (pairing):** 두 `MockVaultStorage` 인스턴스가 서로의 X25519 퍼블릭 키를 교환하고 ECDH 로 공유 비밀을 도출 → 전송된 `enc_key` 복호화 → 동일 값 검증.

### 리스크 & 완화

| 리스크                                                | 대응                                                                                                                                                 |
| :---------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------- |
| SecSync 라이브러리 안정성 불확실                      | SecSync 포크/버전 고정, fallback 으로 직접 AES-GCM over WebSocket 구현 준비 (Phase 2)                                                                |
| Yjs 바이너리가 D1 5GB 한계 초과                       | 스냅샷 주기적 압축(Y.Doc → `encodeStateAsUpdate` 후 이전 델타 삭제). 사용자당 ~1MB 가정. 5GB ÷ 1MB = 5K 사용자 — 그 전에 Workers Paid 전환 + D1 확장 |
| 충돌 시 중요 필드(`status`) 로직 오류                 | T095 커스텀 해결 — `revoked` > `active` 강제 규칙 + 유닛 테스트 10 시나리오                                                                          |
| Pairing QR 에서 PIN 노출                              | QR 에는 X25519 pubkey + user_id 만, PIN 은 오프라인 구두 전달 (out-of-band 검증)                                                                     |
| IndexedDB persistence 실패 (브라우저 private 모드 등) | fallback to memory-only + UI 경고 "Offline sync not available"                                                                                       |
| 데스크톱/모바일 동시 쓰기 rate 폭주                   | SecSync 내장 debounce (100ms) + Workers 단 rate limit 100 req/min per user                                                                           |

### 검증 체크리스트

- [ ] 두 디바이스 페어링: QR 생성 → 다른 디바이스에서 스캔 + PIN 입력 → 성공 → 같은 credential 목록 표시
- [ ] 디바이스 A 에서 credential 추가 → 3초 내 디바이스 B 에 동기화
- [ ] 인터넷 끊김 → A 에서 수정 → 복귀 → B 에 반영
- [ ] Free 사용자가 3번째 디바이스 페어링 시도 시 Upgrade 유도
- [ ] Cloudflare Workers 로그: 모든 payload 가 ciphertext + nonce (평문 API key 없음)
- [ ] D1 `encrypted_docs` 테이블 row 조회 → binary blob, 사람이 읽을 수 없음

---

## M10. Payments

### 개요

**Paddle MoR + RevenueCat + webhook + 엔타이틀먼트 UI**.

### 태스크 그룹

T097 ~ T103 (7 Must)

### 핵심 기술 결정

| 항목             | 선택                                  | 근거               |
| :--------------- | :------------------------------------ | :----------------- |
| Web/Desktop 결제 | Paddle Classic/Billing (Billing 권장) | MoR, VAT 자동      |
| 모바일 IAP       | RevenueCat                            | 크로스 플랫폼 통합 |
| Webhook HMAC     | `crypto.subtle` (Workers)             | 표준               |
| Paddle JS        | Paddle.js v2 overlay                  | 공식               |

### 엔타이틀먼트 검증 로직

```typescript
// apps/relay/src/routes/me.ts
app.get("/", async (c) => {
  const user = await requireAuth(c);
  const row = await c.env.DB.prepare(
    "SELECT plan, plan_source, plan_expires_at FROM users WHERE id=?",
  )
    .bind(user.id)
    .first();
  const now = Date.now();
  const isActive = row.plan === "pro" && (row.plan_expires_at == null || row.plan_expires_at > now);
  // grace period: 24h past expiry
  const inGrace =
    row.plan === "pro" && row.plan_expires_at && row.plan_expires_at > now - 86400_000;
  return c.json({
    plan: isActive ? "pro" : "free",
    plan_source: row.plan_source,
    plan_expires_at: row.plan_expires_at,
    grace: !isActive && inGrace,
  });
});
```

### TDD 전략

**T099 (Paddle webhook):**

```ts
it("subscription.created sets user plan=pro", async () => {
  await seedUser("u1");
  const body = paddleFixture("subscription.created", { custom_data: { user_id: "u1" } });
  const sig = hmacSign(body, env.PADDLE_WEBHOOK_SECRET);
  const resp = await SELF.fetch("/billing/paddle/webhook", {
    method: "POST",
    headers: { "paddle-signature": sig },
    body,
  });
  expect(resp.status).toBe(200);
  const user = await env.DB.prepare("SELECT plan FROM users WHERE id='u1'").first();
  expect(user.plan).toBe("pro");
});
it("replays are idempotent (same event_id)", async () => {
  /* ... */
});
```

**T101 (billing_status caching):**

- Rust: mock 릴레이 서버 → 첫 호출 시 네트워크, 5분 내 재호출 시 캐시 hit (mock 호출 1회만 확인)

### 리스크 & 완화

| 리스크                               | 대응                                                                                                       |
| :----------------------------------- | :--------------------------------------------------------------------------------------------------------- |
| Paddle 벤더 승인 지연 (1~2주)        | M10 진입 전에 미리 신청 (M5~M6 쯤). 승인 전에는 모든 Pro 기능을 dev mode 에서 entitlement mock 으로 테스트 |
| webhook 누락 → 상태 불일치           | RevenueCat + Paddle customer portal API 로 주기적 reconciliation (Phase 2)                                 |
| 유저가 Paddle → Apple IAP 중복 결제  | RevenueCat 이 `entitlement` 레벨에서 하나만 활성화, 사용자에게 환불 안내                                   |
| iOS 가이드라인 위반 (외부 결제 유도) | iOS 앱에서는 Paddle 링크 표시 금지, RevenueCat IAP 만 노출                                                 |
| Grace period 악용                    | 만료 24h 후에는 엄격하게 free 로 전환, 동기화 중단 경고                                                    |

### 검증 체크리스트

- [ ] Paddle 샌드박스에서 $2 구독 → webhook 수신 → `/me` 에 plan=pro
- [ ] App 재실행 → UpgradeDialog 사라짐, Pro 기능 활성화
- [ ] RevenueCat test SKU 로 iOS/Android 구매 → 동일 효과
- [ ] 구독 취소 → 만료일 지나면 Grace 24h → 이후 Free 전환
- [ ] Paddle customer portal 에서 구독 관리 가능

---

## M11. Mobile Port

### 개요

**Tauri iOS/Android 빌드 + age 볼트 파일 모바일 검증 + Biometric + 하단 네비 + 푸시 알림 (옵션)**. (이전 계획의 "Stronghold 모바일 검증"은 2026-04-22 교체 결정에 따라 age 기반 검증으로 대체됨.)

### 태스크 그룹

T104 ~ T109 (5 Must + 1 Should)

### 핵심 기술 결정

| 항목         | 선택                                                | 근거               |
| :----------- | :-------------------------------------------------- | :----------------- |
| Mobile shell | Tauri v2 mobile                                     | Gate 1 Q2=A 결정   |
| Biometric    | `@tauri-apps/plugin-biometric`                      | 공식               |
| Push         | `@tauri-apps/plugin-notification` + 릴레이 FCM/APNs | 공식               |
| IAP plugin   | `tauri-plugin-revenuecat` (직접 구현)               | 현재 커뮤니티 없음 |
| Deep link    | `@tauri-apps/plugin-deep-link`                      | 공식               |

### Tauri Mobile 프로젝트 초기화 (runbook step)

```bash
# Prerequisites: Apple Developer team id, Android SDK/NDK
pnpm tauri ios init
# Opens src-tauri/gen/apple/api-vault.xcodeproj
# Xcode: Signing & Capabilities → team, provisioning profile

pnpm tauri android init
# Generates src-tauri/gen/android/ (Gradle project)
# local.properties sdk.dir, NDK 버전 확인
```

### age 볼트 모바일 PoC 절차 (T105)

1. iPhone 실기기 연결 → `pnpm tauri ios dev --host <mac-lan-ip>`
2. 앱 실행 → CreateVault → put/get/lock/unlock 5회 시나리오
3. `/var/mobile/Containers/.../Documents/vault.age` 파일 존재 + 크기 > 0 확인 (age 암호문은 `age-encryption.org/v1` 헤더로 시작)
4. 앱 재시작 → 기존 볼트 재오픈
5. Android 동일 절차 (`/data/data/com.phoodul.apivault/files/vault.age`)

**실패 시 대안:** `age` 자체는 pure Rust 이므로 근본 호환성 이슈 가능성은 낮으나, 만약 파일 I/O 권한 경계(iOS 샌드박스 / Android scoped storage) 에 막히면 Tauri path API + `DocumentFile` 플러그인 조합으로 경로 전략만 조정 (구현 변경 없음).

### TDD 전략

**T106 (biometric):**

- Mock `plugin-biometric` → status `Authenticated` | `Failed` | `Unavailable` 3 시나리오 분기 UI.
- 실기기 테스트는 manual.

**T107 (bottom nav):**

```tsx
it("renders BottomNav only on mobile platform", () => {
  vi.mocked(getPlatform).mockReturnValue("mobile");
  render(
    <AppShell>
      <div />
    </AppShell>,
  );
  expect(screen.getByTestId("bottom-nav")).toBeInTheDocument();
});
```

### 리스크 & 완화

| 리스크                                           | 대응                                                                                                          |
| :----------------------------------------------- | :------------------------------------------------------------------------------------------------------------ |
| age 볼트 모바일 동작 실패                        | age 자체는 pure Rust 라 근본 호환성 문제 가능성 낮음. 파일 경로/권한 이슈 시 Tauri path API 로 경로 전략 조정 |
| iOS 앱스토어 심사 거부                           | 미리 Guideline 2.1 (앱 완성도), 4.0 (디자인), 5.1.1 (데이터 수집) 체크리스트 리뷰                             |
| Android 파일 시스템 제한으로 드롭&스캔 동작 불가 | Mobile 에서는 기능 숨김 + "Use desktop app to scan" 안내                                                      |
| Xcode 빌드 시간 길음 (5~10분)                    | `CARGO_TARGET_DIR` 공유, `[profile.dev] incremental = true`, clean 최소화                                     |
| Android NDK 버전 호환성                          | `android { ndkVersion "25.2.9519653" }` 고정, GitHub Actions matrix 에도 동일                                 |
| Apple Developer 심사 비용/시간                   | M10 이전 early submit (dev/internal track)                                                                    |

### 검증 체크리스트

- [ ] iOS 시뮬레이터: Create vault → credential 등록 → 재시작 후 unlock 성공
- [ ] iOS 실기기: Face ID unlock 동작
- [ ] Android 에뮬레이터: 동일 시나리오
- [ ] 하단 네비게이션 4탭 전환
- [ ] 데스크톱에서 sync → 모바일 수신 확인
- [ ] TestFlight / Play Internal Track 배포 성공

---

## M12. Web Read-Only Viewer

### 개요

**Vite 공용 번들 분리 + 릴레이 직접 호출 + WebAuthn 웹 + Cloudflare Pages 배포**. 협업 링크의 기초.

### 태스크 그룹

T110 ~ T113 (4 Must)

### 핵심 기술 결정

| 항목       | 선택                               | 근거                                         |
| :--------- | :--------------------------------- | :------------------------------------------- |
| 웹 빌드    | `VITE_BUILD_TARGET=web` 환경변수   | integrator_report.md §2.12                   |
| 호스팅     | Cloudflare Pages                   | 릴레이와 같은 Cloudflare 계정, scale-to-zero |
| Passkey 웹 | `@simplewebauthn/browser`          | 서버와 동일 vendor                           |
| E2E        | Playwright + virtual authenticator | WebAuthn 테스트                              |

### `isTauri()` 가드 패턴

```ts
// src/lib/tauri.ts
export const isTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export async function invokeIfTauri<T>(cmd: string, args?: unknown): Promise<T | null> {
  if (!isTauri()) return null;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}
```

### 데이터 소스 추상화

```ts
// src/lib/data-source.ts
export interface DataSource {
  listCredentials(): Promise<CredentialSummary[]>;
  getCredential(id: string): Promise<CredentialFull>;
  // ... read-only in web
}

export function getDataSource(): DataSource {
  return isTauri() ? new TauriDataSource() : new WebDataSource();
}
```

WebDataSource 는 릴레이 `/sync/deltas` 로 받은 CRDT 를 SecSync 복호화 → Y.Map → 쿼리.

### TDD 전략

**T110 (build):**

- `pnpm build:web` 성공, `dist-web/` 에 결과물
- `dist-web/` 내 번들 크기 목표 < 500KB gzipped (초과 시 code-split)

**T111 (readonly):**

```ts
it("WebDataSource throws on mutating calls", async () => {
  const ds = new WebDataSource();
  await expect(
    ds.createCredential({
      /* ... */
    }),
  ).rejects.toThrow("Read-only in web viewer");
});
```

**T112 (E2E Passkey):**

```ts
// playwright.config.ts
test("passkey login works with virtual authenticator", async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto("https://app.local/auth/sign-in");
  // Chrome DevTools Protocol: add virtual authenticator
  const client = await ctx.newCDPSession(page);
  await client.send("WebAuthn.enable");
  await client.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
    },
  });
  await page.click("text=Sign in with Passkey");
  await expect(page).toHaveURL(/\/dashboard/);
});
```

### 리스크 & 완화

| 리스크                              | 대응                                                                                      |
| :---------------------------------- | :---------------------------------------------------------------------------------------- |
| 번들에 Tauri-only 코드 포함 시 에러 | vite `define: { '__TAURI__': JSON.stringify(false) }` + `isTauri()` 가드 + dynamic import |
| WebAuthn Safari / Firefox 동작 차이 | iOS Safari 16+ 필수 안내, Firefox 은 플랫폼 authenticator 제한 — fallback: OAuth          |
| 릴레이 CORS 설정 누락               | `cors({ origin: ['https://app.api-vault.app', 'https://*.api-vault.app'] })`                |
| IndexedDB 에 enc_key 저장 위험      | 저장 금지 — 세션당 password 재입력 필수 (또는 WebAuthn PRF — Phase 2)                     |

### 검증 체크리스트

- [ ] https://app.api-vault.app 접속 → SignIn 페이지
- [ ] Passkey 로그인 → Inventory 읽기 전용 목록
- [ ] Credential 클릭 → Detail (값 표시는 "Reveal" 버튼으로 서버 복호화 불가 — 로컬 enc_key 필요)
- [ ] 수정/삭제 버튼 disabled + tooltip "Use desktop app"
- [ ] Graph 뷰어 동작 (읽기)

---

## M13. i18n + Updater + Release

### 개요

**i18n 번역 + minisign 서명 + GitHub Actions 릴리스 매트릭스 + Fastlane 스토어 제출 + 법률/마케팅**.

### 태스크 그룹

T114 ~ T118 (5 Must + 1 Should)

### 핵심 기술 결정

| 항목                 | 선택                                   | 근거                                       |
| :------------------- | :------------------------------------- | :----------------------------------------- |
| 업데이터             | `tauri-plugin-updater`                 | 공식                                       |
| 서명                 | minisign                               | Tauri updater 공식 지원                    |
| Windows Authenticode | SignPath.io 또는 Azure Trusted Signing | OV 인증서 비쌈 → SignPath OSS program 활용 |
| macOS notary         | `notarytool` (Xcode 15+)               |                                            |
| iOS/Android 배포     | Fastlane 2.220+                        | 업계 표준                                  |
| 마케팅               | Astro 5                                | 정적, SEO, 경량                            |
| 법률 문서            | 템플릿 + 변호사 리뷰                   | TermsFeed / iubenda 템플릿                 |

### GitHub Actions 릴리스 YAML 골격

```yaml
# .github/workflows/release.yml
name: Release
on:
  push:
    tags: ["v*"]
jobs:
  build:
    strategy:
      fail-fast: false
      matrix:
        include:
          - platform: "macos-latest"
            args: "--target aarch64-apple-darwin"
          - platform: "macos-latest"
            args: "--target x86_64-apple-darwin"
          - platform: "ubuntu-22.04"
            args: ""
          - platform: "windows-latest"
            args: ""
    runs-on: ${{ matrix.platform }}
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: "pnpm" }
      - uses: dtolnay/rust-toolchain@stable
      - if: matrix.platform == 'ubuntu-22.04'
        run: |
          sudo apt update
          sudo apt install -y libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf
      - run: pnpm install
      - uses: tauri-apps/tauri-action@v0
        env:
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.MINISIGN_PRIVATE_KEY }}
          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.MINISIGN_PASSWORD }}
          APPLE_CERTIFICATE: ${{ secrets.APPLE_CERTIFICATE }}
          APPLE_CERTIFICATE_PASSWORD: ${{ secrets.APPLE_CERT_PASSWORD }}
          APPLE_ID: ${{ secrets.APPLE_ID }}
          APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
          APPLE_PASSWORD: ${{ secrets.APPLE_APP_PASSWORD }}
        with:
          tagName: ${{ github.ref_name }}
          releaseName: "API Vault ${{ github.ref_name }}"
          releaseBody: "See CHANGELOG.md"
          args: ${{ matrix.args }}
```

### Fastlane iOS lane 예시

```ruby
# fastlane/Fastfile
lane :ios_testflight do
  match(type: 'appstore', app_identifier: 'com.phoodul.apivault')
  sh("pnpm tauri ios build")
  pilot(
    ipa: '../src-tauri/gen/apple/build/arm64/api-vault.ipa',
    skip_waiting_for_build_processing: false
  )
end
```

### 리스크 & 완화

| 리스크                                          | 대응                                                                                                                                       |
| :---------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------- |
| Windows SmartScreen 경고 (Authenticode 없을 때) | SignPath.io 오픈소스 프로그램 신청 또는 EV 인증서 ($200~400/년)                                                                            |
| macOS Notarization 실패                         | 먼저 `hdiutil`/`stapler` 수동 테스트, Entitlements 플래그 확인 (Hardened Runtime, App Sandbox off for desktop)                             |
| minisign key rotation 필요                      | public key 는 `tauri.conf.json` 에 하드코딩 — rotate 시 이전 버전 사용자는 새 버전으로 마이그레이션 불가 → 앱 내 manual download 안내 필요 |
| App Store 심사 거부                             | 5.1.1 (data collection) 명시: 볼트 내용 미전송, OAuth email 만 — Privacy Label 적절히 설정                                                 |
| Play Store 데이터 안전 섹션                     | 암호화 키/로그인 정보를 "수집되지만 기기 외 공유하지 않음 (E2EE)" 라고 정확히 기재                                                         |
| 변호사 리뷰 지연                                | 템플릿 기반 초안으로 먼저 publish → 리뷰 후 patch release                                                                                  |

### 검증 체크리스트

- [ ] 테스트 태그 `v0.1.0-rc.1` push → GitHub Release 에 6개 산출물 + 6개 `.sig` 업로드
- [ ] 데스크톱 앱에서 "Check for updates" → `v0.1.0-rc.1` 감지 → 설치 → 버전 표시 갱신
- [ ] minisign 서명이 깨진 가짜 업데이트 → 거부 + 에러 메시지
- [ ] TestFlight / Play Internal Track 에 자동 업로드
- [ ] https://api-vault.app 랜딩 페이지 200 OK
- [ ] Privacy Policy / Terms 페이지 접근 가능
- [ ] Settings > Language 에서 ko/ja 전환 시 UI 번역

---

## 전체 롤백 계획

| 범위                        | 롤백 전략                                                                                                                                        |
| :-------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------- |
| 앱 바이너리                 | GitHub Releases 에서 이전 버전 다시 설치 가능, Tauri updater `beta` → `stable` 채널 전환                                                         |
| D1 스키마                   | Drizzle migration 은 idempotent, rollback 스크립트 `0001_init.down.sql` 함께 관리. 단, 데이터 손실 위험 — 운영 전 수동 백업 `wrangler d1 export` |
| 릴레이 코드                 | Cloudflare Workers 는 즉시 rollback 가능 (`wrangler rollback`)                                                                                   |
| 앱 설정 / 마이그레이션 실패 | 로컬 SQLite 는 앱 시작 시 `migrations/` 순차 실행 — 실패 시 앱이 safe mode 로 진입 ("마이그레이션 실패, 지원 문의")                              |
| age 볼트 파일 손상          | `~/.api-vault/vault.age.bak-<timestamp>` 항상 유지 (저장/마이그레이션 전 자동 백업, AgeVaultStorage 의 atomic rename 직전 단계)                  |
| CRDT 상태 불일치            | 최악의 경우 로컬 `api-vault-root` IndexedDB 지우고 서버 스냅샷 다시 다운로드                                                                     |
| 잘못된 릴리스 배포          | GitHub Release "draft" 플래그로 먼저 공개 전 검증, 문제 시 delete release                                                                        |

---

## 1인 운영 원칙 재확인

매 마일스톤 설계 시 다음 질문을 체크:

1. **새 서비스 추가?** → Cloudflare Workers + D1 + KV 이내에서 해결 가능한가? 외부 SaaS 추가는 RevenueCat, Paddle, Sentry, GitHub App 만.
2. **온콜 부담?** → scale-to-zero, webhook retry, graceful degradation 있는가?
3. **AI 보조 코딩 가능?** → 태스크가 충분히 작고 명확한가? (본 문서 목표 8시간 이내)
4. **복제 가능성?** → OSS 클론이 쉽게 만들 수 없는 해자(moat)는 무엇인가? → E2EE sync 인프라, Incident Feed 품질, RAILGUARD 템플릿 품질.
5. **사용자 지원 최소화?** → 명확한 에러 메시지 + Settings > Support 링크 (이메일).

---

## Open Issues 요약 (Gate 2 사용자 확인 필요)

1. **Free tier 디바이스 수** — 1대 (decisions 준수) vs 2대 (planner 제안)
2. **도메인 확보** — api-vault.app 가용성
3. **계정 등록 타이밍** — Apple/Google/Paddle/Cloudflare Paid 언제 결제할지
4. **Windows 서명 방식** — SignPath OSS 신청 vs EV 인증서 구매
5. **변호사 리뷰 예산** — Privacy/ToS 검토 $500~1500
6. **GitHub Organization 이름** — `apivault` 또는 다른 이름
7. **모노레포 vs 분리 레포** — `api-vault-relay` 를 같은 repo 서브디렉터리로 둘지, 별도 private repo 로 둘지 (planner 는 별도 private repo 를 권고 — EE 라이선스 분리 명확)
8. **age 볼트 모바일 동작 검증** — 2026-04-22 Stronghold → age 교체로 근본 호환성 리스크는 해소됐으나, 파일 I/O 경계 검증을 위해 M11 T105 에서 실기기 PoC 유지

---

_문서 끝._
