# API Vault — 사용자 매뉴얼 (한국어)

> "API 키를 단순히 보관하지 않고, **누가·어디서·어떻게** 쓰는지까지 알려주는
> 의존성 그래프 인식 시크릿 매니저."

이 문서는 데스크톱 앱·CLI·MCP 서버·VS Code 확장의 실제 사용 절차를 다룬다.
목차는 사용 빈도 높은 순으로 정렬했다.

---

## 목차

1. [설치와 첫 실행](#1-설치와-첫-실행)
2. [데스크톱 앱 — 자격증명 관리](#2-데스크톱-앱--자격증명-관리)
3. [데스크톱 앱 — 의존성 그래프 / Blast Radius](#3-데스크톱-앱--의존성-그래프--blast-radius)
4. [데스크톱 앱 — Incident Feed (NVD/GHSA)](#4-데스크톱-앱--incident-feed-nvdghsa)
5. [데스크톱 앱 — Kill Switch (긴급 폐기)](#5-데스크톱-앱--kill-switch-긴급-폐기)
6. [데스크톱 앱 — RAILGUARD (AI 에디터 보호)](#6-데스크톱-앱--railguard-ai-에디터-보호)
7. [데스크톱 앱 — Supply chain 스캔](#7-데스크톱-앱--supply-chain-스캔)
8. [데스크톱 앱 — 멀티 디바이스 동기화](#8-데스크톱-앱--멀티-디바이스-동기화)
9. [CLI — `apivault` 명령](#9-cli--apivault-명령)
10. [MCP 서버 — Claude / Cursor / Copilot Chat 연결](#10-mcp-서버--claude--cursor--copilot-chat-연결)
11. [VS Code 확장](#11-vs-code-확장)
12. [백업과 복구](#12-백업과-복구)
13. [자주 묻는 질문 (FAQ)](#13-자주-묻는-질문-faq)

---

## 1. 설치와 첫 실행

### 1.1 시스템 요구사항

- Windows 10 이상 (x64) / macOS 12 이상 (Apple Silicon · Intel) / Linux (Ubuntu 22+ glibc 2.35+).
- 디스크 100MB / RAM 200MB.
- 인터넷은 **선택**. 동기화·Incident Feed·OSV 스캔만 인터넷이 필요하다.
  로컬 볼트 자체는 오프라인 동작.

### 1.2 설치

| 플랫폼  | 설치 방법                                                      |
| :------ | :------------------------------------------------------------- |
| Windows | `api-vault_x64-setup.exe` 또는 `winget install api-vault`      |
| macOS   | `api-vault_universal.dmg` 또는 `brew install --cask api-vault` |
| Linux   | `.deb` / `.AppImage` / `.rpm` 또는 `snap install api-vault`    |

설치파일은 GitHub Releases (https://github.com/phoodul/api-vault/releases) 에서.

### 1.3 첫 실행 — 마스터 패스프레이즈 설정

1. 앱 첫 실행 시 "**Create vault**" 화면.
2. 마스터 패스프레이즈 입력 (16자 이상 권장 — 단어 4~6개).
3. Vault Charter 모드 선택 (권장: **단일 Charter**). **볼트 생성** 클릭 시
   인쇄 가능한 charter 가 표시된다 — Diceware 6 단어 + 4 자리 검증자.
   **인쇄하거나 종이에 적어 오프라인에 보관**. 클립보드 복사 금지. Charter 는
   한 번만 표시된다.
4. "저장 완료" 확인 시 빈 볼트가 생성된다. (Shamir 2-of-3 모드와 복구 절차는
   §12.3 참고.)

> ⚠️ 마스터 패스프레이즈와 Vault Charter 를 둘 다 잃으면 데이터를 **복구할 수
> 없다**. Zero-Knowledge 설계상 우리도 도와줄 수 없다.

### 1.4 잠금 / 잠금 해제

- 5분 idle 자동 잠금 (설정에서 변경 가능).
- 트레이 / 메뉴바 아이콘 우클릭 → **Lock vault** 즉시 잠금.
- 패스프레이즈 입력 → 잠금 해제. 5회 실패 시 1분 cooldown.

---

## 2. 데스크톱 앱 — 자격증명 관리

### 2.1 자격증명 생성

1. 좌측 사이드바 **Credentials** → **+ New** 버튼.
2. 필수 입력:
   - **Issuer** — `OpenAI`, `Stripe`, `AWS` 등 발급처. Quick-Pick 자동완성.
   - **Name** — `prod-billing-key` 처럼 사람이 알아보는 이름.
   - **Value** — 키/토큰. 입력 즉시 마스킹.
3. 선택 입력:
   - **Environment** — `dev` / `staging` / `prod` 라벨.
   - **Expires at** — 만료일. 7일 전 자동 알림.
   - **Scopes / Notes** — 자유 텍스트.
4. **Save** → 로컬 SQLite 에 암호문으로 저장. 평문은 RAM 에서 즉시 zeroize.

### 2.2 자격증명 보기 / 복사

- 목록에서 항목 클릭 → 우측 패널에 메타데이터.
- **Reveal** 버튼 → 패스프레이즈 재확인 후 30초 동안 평문 표시.
- **Copy** 버튼 → 클립보드 복사. 30초 후 자동 클리어 (설정에서 변경).
- **History** 탭 → 과거 rotate 이력 (최대 5세대 유지).

### 2.3 검색과 필터

- Cmd/Ctrl + K → 글로벌 명령 팔레트.
  - `> issuer:openai env:prod` 처럼 필터 결합.
- 좌측 상단 검색창은 fuzzy match.

### 2.4 Rotate (키 교체)

1. 자격증명 우측 ⋮ → **Rotate**.
2. 새 값 붙여넣기 → 이전 값은 history 에 자동 보관.
3. **Verify with provider** 옵션 켜면 issuer 의 헬스체크 엔드포인트로 즉시 확인 (Pro 필요).

---

## 3. 데스크톱 앱 — 의존성 그래프 / Blast Radius

### 3.1 그래프 보기

좌측 **Graph** → 의존성 그래프 풀 화면.

```
Issuer ─▶ Credential ─▶ Usage (코드 위치) ─▶ Project ─▶ Deployment ─▶ URL
```

- 노드 더블클릭 → 상세 패널.
- 상단 검색창에 노드 이름 입력 → 자동 포커스 + 인접 노드 하이라이트.
- 색상은 risk 점수 (녹 = 안전, 적 = high) — **신호이지 절대값 아님**.

### 3.2 Usage 등록 (코드 위치 매핑)

자격증명을 어디서 쓰는지 알려줘야 그래프가 의미 있다.

**자동 (권장)** — Drop-zone 스캐너:

1. 사이드바 **Scan** → 프로젝트 폴더를 드래그.
2. `.env*` / `process.env.X` / `os.getenv("X")` / `Bun.env.X` 등을 정규식 + AST 로 탐지.
3. 발견된 사용처가 표시되며, 매칭되는 자격증명을 선택해 **Link**.

**수동** — 자격증명 상세 → **Add usage** → 파일 경로 + 라인 번호.

### 3.3 Blast Radius 시뮬레이션

1. 자격증명 상세 → **Blast Radius**.
2. "이 키를 폐기하면" 깨지는 노드들이 빨강으로 미리보기 표시.
3. **Apply** 누르기 전까지는 **시뮬레이션만** — 실제 변경 없음.
4. 영향 범위가 명확하면 그대로 **Revoke** 진행.

---

## 4. 데스크톱 앱 — Incident Feed (NVD/GHSA)

### 4.1 동작

- 백그라운드에서 NVD / GHSA / 주요 issuer RSS 를 폴링.
- 자격증명의 `issuer` slug 와 매칭 → **Incidents** 탭에 자동 분류.
- 매칭은 **로컬에서만** — 어떤 키가 있는지 서버는 모른다.

### 4.2 화면

좌측 **Incidents** 탭:

- **Affecting you** — 현재 볼트의 자격증명에 영향 있는 사건.
- **All** — 폴링한 전체 사건.

각 사건 카드:

- 헤드라인 + 발행일 + 출처 링크.
- **Affected credentials** — 이 사건에 매칭된 본인의 자격증명 N개.
- **Action** — `Rotate`, `Snooze`, `Mark resolved`.

### 4.3 알림

- 매칭 발생 시 OS 네이티브 토스트 (Tauri notification plugin).
- 주말/야간 disturb 모드 (설정).

---

## 5. 데스크톱 앱 — Kill Switch (긴급 폐기)

### 5.1 언제 쓰나

- 노트북 분실, GitHub 푸시 사고, 동료 노출.
- 단일 키 / 전체 issuer / 전체 prod env 단위 즉시 폐기.

### 5.2 절차

1. 자격증명 상세 → **Kill** (붉은 버튼).
2. 확인 다이얼로그: 영향 범위 (Blast Radius) + 패스프레이즈 재입력.
3. 폐기 후 audit log 에 자동 기록 + Incident Feed 에 self-incident 로 추가.

### 5.3 Auto-revoke (베타 무료, Pro 도입 전까지 모두 사용 가능)

API 가 `revoke` 엔드포인트를 제공하는 issuer (Stripe, GitHub PAT 등) 는 폐기와 동시에 외부 API 호출까지 자동. **현재 v0.1.0-pre8 무료 베타 기간 동안 모든 사용자에게 열려있다** (§14 FAQ).

---

## 6. 데스크톱 앱 — RAILGUARD (AI 에디터 보호)

AI 에디터 (Cursor / Copilot / Claude Code) 가 실수로 키를 학습데이터·로그·외부로 내보내는 사고를 막는다.

### 6.1 원리

1. 볼트의 자격증명 패턴을 분석 → 정규식 룰셋 자동 생성.
2. 룰셋을 `.cursorrules` / `CLAUDE.md` / `.github/copilot-instructions.md` 형식으로 export.
3. 프로젝트 루트에 저장하면 AI 에디터가 키 입력 / 출력을 차단·마스킹한다.

### 6.2 사용

1. 좌측 **RAILGUARD** → **Generate**.
2. 대상 에디터 선택 (다중 가능).
3. 프로젝트 폴더 선택 → 룰셋 파일 생성.
4. **Verify** 버튼: 생성된 파일이 실제로 AI 에디터에 의해 적용되는지 sample 시나리오로 검증.

### 6.3 자동 갱신

- 새 자격증명 추가 시 RAILGUARD 룰셋도 자동 갱신 옵션 (설정).
- 갱신은 diff 형태 — 사용자가 검토 후 적용.

---

## 7. 데스크톱 앱 — Supply chain 스캔

이 부분이 1Password / Doppler / Infisical 과의 결정적 차별점이다.

### 7.1 무엇을 보는가

프로젝트의 의존성 패키지 (npm / Cargo / PyPI) 가 **secret-leak 이력**이 있는지 OSV.dev 데이터베이스로 조회. lockfile 까지 읽어 정확한 버전으로 매칭.

### 7.2 스캔 실행

1. **Scan** → **Add project** → 프로젝트 루트 폴더 선택.
2. **Run scan** 클릭.
3. 결과:
   - 매니페스트 발견 수 / 의존성 수 / 매칭된 advisory 수.
   - secret-leak / supply-chain / crypto-weak 카테고리별 분류.
   - 각 advisory 클릭 → OSV / GHSA 원본 링크.

### 7.3 그래프 통합

스캔 결과는 자동으로 그래프에 반영:

- `Project` 노드 → `Package` 노드 (위험도 색상) → 영향받는 `Credential`.
- 즉, "이 npm 패키지가 secret leak history 가 있다 → 이 프로젝트가 그걸 쓴다 → 이 키가 위험하다" 의 cross-domain blast radius.

### 7.4 지원 매니페스트

| Ecosystem         | 매니페스트     | Lockfile (정확한 버전 해석)           |
| :---------------- | :------------- | :------------------------------------ |
| npm / pnpm / yarn | `package.json` | `package-lock.json`, `pnpm-lock.yaml` |
| Cargo (Rust)      | `Cargo.toml`   | `Cargo.lock`                          |

PyPI / GoMod / Maven 은 매니페스트만 (정확한 버전 해석은 후속).

---

## 8. 데스크톱 앱 — 멀티 디바이스 동기화

> **베타 상태**: 현재 모든 사용자에게 무료 (Pro 도입 전 — §14 FAQ 참조). 두 번째 기기에서 같은 볼트를 읽고 쓴다.

### 8.1 페어링

**기기 1 (호스트)** — 설정 → **Sync** → **Pair new device** → 6자리 PIN 표시 (60초 유효).

**기기 2 (조이너)**:

1. 신규 설치 후 첫 화면에서 **Pair with another device** 선택.
2. 호스트 기기의 PIN 입력.
3. 자동으로 X25519 ECDH 채널 수립 → 마스터 패스프레이즈 / 키 자료 안전 전송.
4. 패스프레이즈를 다시 입력할 필요 없다.

### 8.2 Zero-Knowledge 보장

- 릴레이 서버는 ciphertext 만 저장. 평문 / 마스터 키 / 의존성 그래프 노드명 모두 클라이언트에서 암호화.
- AAD (additional authenticated data) 로 `user:<userId>:cred:<credId>` 바인딩 → 다른 사용자 데이터로 swap 공격 방어.

### 8.3 충돌 해결

- Yjs CRDT 가 자동 머지 (마지막 쓰기 우선이 아닌 의도 보존).
- 충돌 발생 시 Sync 탭에 표시 → 수동 검토 가능.

---

## 9. CLI — `apivault` 명령

데스크톱 GUI 없이 터미널에서.

### 9.1 설치

데스크톱 앱 설치 시 자동 PATH 등록. 또는:

```sh
brew install api-vault           # macOS
winget install api-vault         # Windows
cargo install api-vault-cli      # 모든 플랫폼
```

### 9.2 명령

```sh
apivault list [--issuer <slug>] [--env dev|staging|prod]
# 자격증명 목록 (값 미표시).

apivault reveal <id-or-name>
# 패스프레이즈 prompt → 값을 stdout 로. 30초 후 종료.

apivault run <id-or-name> -- <command>
# 자격증명을 환경변수로 주입 후 명령 실행.
# 예: apivault run prod-stripe -- npm run deploy
```

### 9.3 환경변수 주입 (`run`)

`apivault run` 은 자식 프로세스의 환경변수에 자격증명 값만 넣는다. `apivault.json` 설정으로 변수명 매핑:

```json
{
  "credentials": [
    { "id": "prod-stripe", "env": "STRIPE_SECRET_KEY" },
    { "id": "prod-openai", "env": "OPENAI_API_KEY" }
  ]
}
```

```sh
apivault run --config apivault.json -- node server.js
```

### 9.4 보안 노트

- 평문은 자식 프로세스의 메모리에만. CLI 종료 시 zeroize.
- `--print` 같은 stdout 표출 옵션은 의도적으로 없다.
- shell history 노출 우려: `apivault reveal` 결과를 절대 echo 하지 말고 직접 사용.

---

## 10. MCP 서버 — Claude / Cursor / Copilot Chat 연결

[Model Context Protocol](https://modelcontextprotocol.io) 으로 AI 어시스턴트가 볼트와 직접 대화한다.

### 10.1 서버 시작

```sh
apivault mcp serve              # stdio 모드 (Claude Desktop / Cursor)
apivault mcp serve --port 3737  # SSE 모드 (Copilot Chat 등)
```

### 10.2 노출 도구

| 도구                         | 설명                                     |
| :--------------------------- | :--------------------------------------- |
| `list_credentials`           | 자격증명 메타데이터 (값 제외)            |
| `reveal_credential`          | 사용자 confirm 후 값 반환                |
| `check_railguard_status`     | 현재 프로젝트의 RAILGUARD 룰셋 활성 여부 |
| `suggest_railguard_template` | 에디터별 룰셋 초안 생성                  |
| `check_supply_chain_risk`    | 현재 프로젝트의 supply chain 위험        |

### 10.3 Claude Desktop 연결

`~/.claude/mcp.json`:

```json
{
  "mcpServers": {
    "api-vault": {
      "command": "apivault",
      "args": ["mcp", "serve"]
    }
  }
}
```

재시작 후 채팅에서 `@api-vault list openai` 같은 식으로 호출.

### 10.4 Cursor 연결

설정 → MCP → JSON 추가 (위와 동일).

### 10.5 권한 모델

- `reveal_credential` 은 **항상** 사용자 OS 다이얼로그 confirm. AI 가 우회 불가.
- 모든 호출은 audit log 에 기록.

---

## 11. VS Code 확장

### 11.1 설치

- VS Code Marketplace 에서 "API Vault" 검색.
- 또는 Open VSX 에서 동일.

### 11.2 명령 (Command Palette)

- `API Vault: List credentials` — Quick Pick 으로 보기.
- `API Vault: Reveal credential` — 패스프레이즈 prompt 후 클립보드 복사.
- `API Vault: Scan workspace for supply-chain risk` — 현재 워크스페이스 스캔.

### 11.3 Language Model 도구 (1.96+)

Copilot Chat / Claude / Cursor — VS Code LM 도구를 지원하는 모든 채팅 호스트가 자동 인식.

- `#apivault` — 자격증명 목록.
- `#supplyrisk` — supply chain 스캔.

### 11.4 에디터 표면

- **Status bar** — 방패 아이콘 → 클릭 시 자격증명 목록.
- **Hover** — `package.json` / `Cargo.toml` 의 의존성 라인에 커서 → 마지막 스캔의 advisory 툴팁.
- **Code lens** — 위험한 의존성 라인 위에 "🔑 N advisor(ies)" 인라인 표시. 클릭 시 Problems 패널.
- **Problems panel** — 소스 `api-vault` 로 진단 표시.

### 11.5 설정

```json
{
  "apivault.cliPath": "apivault",
  "apivault.scanOnStartup": false
}
```

---

## 12. 백업과 복구

### 12.1 백업

- 설정 → **Export encrypted backup** → `.apivault-backup` 파일.
- 파일은 마스터 패스프레이즈로 암호화 — 클라우드에 둬도 안전.
- 권장 빈도: 주 1회 + 마스터 패스프레이즈 변경 직후.

### 12.2 복구 (다른 기기 또는 재설치)

1. 신규 설치 후 첫 화면에서 **Restore from backup**.
2. 백업 파일 + 마스터 패스프레이즈 입력.
3. 복원 완료. 그래프 / Usage / RAILGUARD 룰셋 모두 그대로.

### 12.3 마스터 패스프레이즈 분실 — Vault Charter

볼트 생성 시 **Vault Charter** 를 발급할 수 있다. 패스프레이즈를 잊었을 때 vault
를 복구할 유일한 수단이다. 릴레이 서버는 도와줄 수 없다 — 모든 데이터가 종단 간
암호화되어 이 기기에만 풀 수 있기 때문.

두 가지 모드 (볼트 생성 시 선택, 복구 시점에 변경 가능):

- **단일 Charter** (권장). Diceware 6 단어 + 4 자리 검증자. 한 장짜리 문서.
  오프라인에 보관.

  ```
  TUNDRA HARBOR FLINT MOTH OPAL CASCADE - 7042
  ```

  검증자 4 자리는 단어 한 개 typo 시 즉시 감지한다 — 복구가 안 되는 charter 를
  들고 있는 상태로 시간이 흐르는 일이 없다.

- **Shamir 2-of-3** (고급). 3 장의 문서 중 어느 **2 장**이든 charter 를 복원.
  가족 · 변호사 · 금고 등으로 분산 보관 → 한 장 분실해도 vault 는 살아남고,
  한 장 도난당해도 secret 정보는 0 비트 노출 (정보 이론적 보안).

복구 절차:

1. 잠금 화면에서 **Forgot your passphrase?** 클릭.
2. 사용한 모드 선택 (단일 / Shamir).
3. Charter (또는 share 2 장 이상) + 새 패스프레이즈 입력.
4. vault 가 새 패스프레이즈로 재발급된다. 옛 charter 는 무효화되고, 새 charter
   를 옵션으로 함께 발급한다 (권장 — 옛 종이가 노출됐을 수 있으므로).

선택 옵션: **7일 쿨다운** (Settings → Security). recovery 후 7일간 새 패스프레이즈로도
unlock 거부. "노트북 + Charter 동시 도난" 시나리오 대비. 진짜 사용자가 vault 파일을
원격 삭제할 시간을 번다.

Charter 도 함께 잃었다면 데이터는 복구 불가능. Zero-Knowledge 설계의 trade-off.

---

## 13. 문제 해결 (Troubleshooting)

### 13.1 Windows — "Windows 가 PC 를 보호했습니다" SmartScreen 경고

**증상:** 첫 실행 시 "Microsoft Defender SmartScreen 이 인식되지 않은 앱의
시작을 차단했습니다."

**원인:** v0.1.x 는 Windows OV/EV 코드 서명 인증서가 없어 unsigned 입니다
(인증서는 출시 후 도입 예정). 충분한 사용자가 설치할 때까지 SmartScreen 이
unsigned binary 를 차단합니다.

**해결 (사용자):** **추가 정보** 클릭 → **실행** 버튼. 볼트 자체는 영향 없음 — 동일한 binary 가 GitHub Actions 에서 공개 AGPL 소스로부터 빌드됨.

**해결 (우리):** OV 인증서 도입 후 신규 설치에는 경고가 사라집니다.

### 13.2 macOS — "앱이 손상되어 열 수 없습니다"

**증상:** macOS 가 앱을 손상되었다고 차단.

**원인:** Gatekeeper 가 미인증 개발자의 un-notarized 앱 차단. v0.1.x 는
Tauri 업데이트 서명 키만 있고 Apple Developer notarization 은 아직 없음.

**해결:**

```sh
xattr -cr "/Applications/API Vault.app"
```

다운로드 시 Gatekeeper 가 부착한 quarantine 속성 제거. 그 다음 더블클릭 정상 동작.

또는 **시스템 설정 → 보안 및 개인정보 보호** 에서 첫 실패 후 **그래도 열기** 클릭.

### 13.3 Linux — `error while loading shared libraries: libwebkit2gtk-4.1.so.0`

**증상:** Ubuntu/Debian 에서 라이브러리 누락 에러로 실행 실패.

**원인:** Tauri v2 는 WebKit2GTK 4.1 필요 (일부 배포판의 GTK 4.0 default 보다 신버전).

**해결 (Debian/Ubuntu):**

```sh
sudo apt-get install -y libwebkit2gtk-4.1-0 libayatana-appindicator3-1
```

**해결 (Fedora/RHEL):**

```sh
sudo dnf install -y webkit2gtk4.1 libappindicator-gtk3
```

### 13.4 패스프레이즈는 맞는데 "Vault is locked" 그대로

**가능한 원인:**

1. **Cooldown 활성화** (Charter recovery 후 기본 7일). Settings →
   Security → "Charter recovery cooldown" 에서 상태 확인. 해결: 대기 또는
   **Clear cooldown** (audit 됨).
2. **다른 vault 파일.** 기본 위치:
   - Linux: `~/.local/share/api-vault/vault.age`
   - macOS: `~/Library/Application Support/api-vault/vault.age`
   - Windows: `%APPDATA%\api-vault\vault.age`
     머신 이전 시 이 파일을 복사 안 했다면 빈 새 vault 임.
3. **Caps Lock 또는 다른 키보드 레이아웃.** 진부하지만 1순위 원인.

### 13.5 Auto-updater 가 새 버전 못 찾음

**증상:** 새 GitHub Release 가 있는데도 "최신 버전입니다."

**진단:**

- **Settings → Updates** 의 마지막 체크 시각 확인.
- `github.com` 네트워크 도달 여부 (updater 가
  `releases/latest/download/latest.json` 호출).
- pre-release 태그 (`v0.1.0-pre1`) 는 **의도적으로** stable 채널에서 skip.

**Hard refresh:**

1. 앱 종료.
2. updater 캐시 삭제:
   - macOS: `~/Library/Caches/api-vault/updater/`
   - Linux: `~/.cache/api-vault/updater/`
   - Windows: `%LOCALAPPDATA%\api-vault\Cache\updater\`
3. 재실행.

### 13.6 CLI — `apivault: command not found`

CLI binary 는 데스크톱 앱과 함께 설치됨. PATH 에 추가 필요:

| OS               | 경로                                                  |
| :--------------- | :---------------------------------------------------- |
| macOS            | `/Applications/API Vault.app/Contents/MacOS/apivault` |
| Linux (deb/rpm)  | `/usr/bin/apivault`                                   |
| Linux (AppImage) | 압축 해제 후 `usr/bin/apivault`                       |
| Windows          | `%LOCALAPPDATA%\Programs\api-vault\apivault.exe`      |

PATH 의 디렉토리에 심볼릭 링크 만들기:

```sh
# macOS
sudo ln -s "/Applications/API Vault.app/Contents/MacOS/apivault" /usr/local/bin/apivault

# Linux
sudo ln -s /usr/bin/apivault /usr/local/bin/apivault

# Windows (관리자 PowerShell)
New-Item -ItemType SymbolicLink -Path "C:\Windows\apivault.exe" `
  -Target "$env:LOCALAPPDATA\Programs\api-vault\apivault.exe"
```

### 13.7 MCP 서버가 Claude Desktop / Cursor 에 안 뜸

**설정 확인:**

- Claude Desktop: `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) 또는 `%APPDATA%\Claude\claude_desktop_config.json` (Windows). 본 가이드 10.3 절에 정확한 JSON.
- Cursor: `~/.cursor/mcp.json`.

**흔한 함정:**

- Windows 의 백슬래시는 JSON 에서 **이중 escape** 필요: `"C:\\Users\\you\\..."`.
- Claude Desktop 은 **완전히 종료** 해야 config 재로드: 트레이 아이콘 → Quit → 재실행.
- vault 가 **unlocked 상태** 여야 host 가 `reveal_credential` 호출 가능 — MCP 서버는 라이브 데스크톱 세션 조회. lock = 빈 결과.

### 13.8 Charter recovery 거부 — "Charter does not unlock this vault"

Charter 는 **내용** (6 단어) + **검증자** (옆에 인쇄된 4 자리 숫자) 둘 다 검증.
한 단어의 한 글자 typo 도 SHA-256 체크에서 실패하여 복호화 시도 전 거부.

단계:

1. **6 단어** 를 인쇄본과 정확히 대조. EFF 대형 워드리스트 — 흔한 짧은 영어 단어.
2. **4 자리 검증자** (`0000`~`9999`) 정확히 확인.
3. Shamir 2-of-3: 3 개 중 **임의의 2 개** 만 필요. 셋 다 있으면 다른 페어 조합 시도 — 한 share 에 typo, 다른 둘은 깨끗할 수 있음.

단어가 정확한데도 실패한다면 vault 파일 자체가 교체됐을 가능성 (예: OS 재설치로 데이터 디렉토리 덮어쓰기). 이 경우 Charter 는 다른 vault 의 것이라 복구 불가.

---

## 14. 자주 묻는 질문 (FAQ)

**Q. 1Password / Bitwarden 와 무엇이 다른가요?**
A. 그들은 "자격증명 보관소"입니다. 우리는 보관 + **의존성 그래프** + **블래스트 반경 시뮬레이션** + **Supply chain 스캔** + **RAILGUARD** 까지 한 화면에. 키가 어떤 코드·배포·URL 에 쓰이고, 폐기 시 무엇이 깨지는지 한눈에 보입니다.

**Q. 무료로 어디까지 쓰나요?**
A. **현재 베타 기간 동안 모든 기능 무료** — 멀티 디바이스 E2EE 동기화, auto-revoke, 자동 rotation 까지 포함. Pro 도입은 다음 4 조건 충족 후: (1) 우리도 1주 이상 직접 써보고 워크플로우 익히기, (2) 변호사 검토 (약관 / 개인정보 / 결제), (3) **일반 비밀번호 vault 기능 추가 (M24)**, (4) 첫 100~500 사용자 피드백. 그때까지 **$0 / 카드 등록 불필요 / 로컬 vault 는 계정 없이 사용**.

**Q. 향후 추가될 기능은?**
A. 로드맵 (확정 일자 없음):

- **일반 비밀번호 vault** (1Password 류) — M24, 설계 진행 중
- Auto-revoke (Stripe / GitHub / AWS API 키)
- Provider 별 자동 rotation hook
- 브라우저 확장 (Chrome / Firefox / Safari)
- 팀 / org / 공유 vault (RBAC + SSO)
- 모바일 앱 (iOS / Android — Tauri Mobile)

**Q. Pro 가격은 언제 시작?**
A. 확정 일자 없습니다. 트리거는 위 4 조건. 시행 30일 전 사전 공지. 기존 데이터는 영향 없음 — 로컬 vault 는 영구 AGPL-3.0 무료.

**Q. 회사가 망하면 데이터는?**
A. 로컬 SQLite 에 그대로 남습니다. CLI 와 데스크톱 앱은 AGPL 이니 여러분이 직접 빌드해 계속 쓸 수 있습니다.

**Q. 동기화 서버가 우리 키를 볼 수 있나요?**
A. 못 봅니다. 클라이언트가 ChaCha20-Poly1305 로 암호화한 ciphertext 만 릴레이됩니다. 서버 코드는 [`/ee/`](../ee/) 에 공개되어 있어 검증 가능합니다.

**Q. 기여하고 싶어요.**
A. https://github.com/phoodul/api-vault — issue / PR 환영. CLA 서명 후 머지.

**Q. 보안 취약점을 발견했어요.**
A. security@api-vault.app 으로 PGP 암호화 메일. 90일 책임 공개.

---

마지막 갱신: 2026-05-03 — v0.1.0-pre8 첫 valid prerelease + 무료 베타 가격 정책 결정 + M24 (일반 비밀번호) 마일스톤 신설.
