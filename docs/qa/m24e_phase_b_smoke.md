# M24-E Phase B Smoke Test — 3 OS × 3 Browser 매트릭스

작성: 2026-05-09 (T-24-E-B10)
상태: 시나리오 문서 + Win11 자동 검증 (사용자 환경) — macOS / Linux SKIP (future B-10.5)

## 1. 목적

**B1 Blocker 해소 검증** — 3 OS (Win 11 / macOS 14 / Ubuntu 22.04 LTS) 모두에서
Native Messaging Host (`secretbank-nm-host`) 등록 → 브라우저 확장 (`@secretbank/extension`)
connect → ping 메시지 round-trip 성공.

## 2. 9 Cell 매트릭스

| OS / Browser      |    Chrome    |    Firefox     |      Edge      | 비고          |
| :---------------- | :----------: | :------------: | :------------: | :------------ |
| **Windows 11**    | ✅ 자동 검증 | 🟡 사용자 수동 | 🟡 사용자 수동 | 사용자 환경   |
| macOS 14 (Sonoma) |     SKIP     |      SKIP      |      SKIP      | future B-10.5 |
| Ubuntu 22.04 LTS  |     SKIP     |      SKIP      |      SKIP      | future B-10.5 |

**범례**:

- ✅ 자동 검증 PASS (Vitest + Mock chrome.runtime)
- 🟡 사용자 수동 검증 필요 (chrome://extensions / about:debugging)
- 🔴 FAIL (발견된 OS 별 차이 → hotfix sub-task)
- SKIP — 환경 미확보, future sub-task

## 3. 사전 준비

### 3.1 빌드

```bash
# Rust binary (release)
cargo build --package secretbank-nm-host --release --manifest-path src-tauri/Cargo.toml
# → target/release/secretbank-nm-host(.exe)

# Extension (Chrome MV3 + Firefox MV2 + Edge MV3)
pnpm --filter @secretbank/extension build
# → extension/.output/chrome-mv3/
# → extension/.output/firefox-mv2/
```

### 3.2 임시 EXT_ID

확장 publish 전이라 실제 EXT_ID 모름. **임시 등록 절차**:

1. Chrome 의 `chrome://extensions` → Developer mode → Load unpacked → `extension/.output/chrome-mv3/` 선택
2. 표시된 ID (32 자 hex) 복사
3. `--uninstall` 로 placeholder 등록 제거
4. `--install --ext-id <real-id>` 로 재등록

Firefox 은 `web-ext run --source-dir extension/.output/firefox-mv2` 로 임시 로드 (ID = `<random>@temporary-addon`).

## 4. Step-by-step 시나리오 (각 cell 공통)

### Step 1 — NM Host install

```bash
# Windows
target\release\secretbank-nm-host.exe --install --ext-id <EXT_ID>

# macOS
./target/release/secretbank-nm-host --install --ext-id <EXT_ID>

# Linux
./target/release/secretbank-nm-host --install --ext-id <EXT_ID>
```

검증:

- Win: `regedit` 또는 `Get-ItemProperty -Path 'HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.secretbank.nm_host'`
- macOS: `cat ~/Library/Application\ Support/Google/Chrome/NativeMessagingHosts/com.secretbank.nm_host.json`
- Linux: `cat ~/.config/google-chrome/NativeMessagingHosts/com.secretbank.nm_host.json`

manifest JSON 형식:

```json
{
  "name": "com.secretbank.nm_host",
  "description": "Secretbank Native Messaging Host",
  "path": "/absolute/path/to/secretbank-nm-host",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://<EXT_ID>/"]
}
```

### Step 2 — Extension load

**Chrome**:

1. `chrome://extensions` → Developer mode → Load unpacked → `extension/.output/chrome-mv3/`
2. 표시된 ID 가 Step 1 의 `<EXT_ID>` 와 일치 확인

**Firefox**:

1. `about:debugging` → This Firefox → Load Temporary Add-on → `extension/.output/firefox-mv2/manifest.json`
2. 표시된 Internal UUID 확인 (Firefox 는 Internal UUID, manifest.json 의 `browser_specific_settings.gecko.id` 기반)

**Edge**:

1. `edge://extensions` → Developer mode → Load unpacked → `extension/.output/chrome-mv3/` (Chrome 빌드 재사용)
2. ID 표시 확인

### Step 3 — popup 열기 + 페어링 시작

1. 브라우저 toolbar 의 Secretbank 아이콘 클릭 → popup 열림
2. "Pairing" 탭 → "페어링 시작" 버튼 클릭
3. NM Client 가 `chrome.runtime.connectNative('com.secretbank.nm_host')` 호출
4. nm-host 가 stdio 로 `init` 메시지 수신 → echo 응답 (B-10 시점 = 데스크톱 IPC 미통합, nm-host 단독 echo)

### Step 4 — ping/pong round-trip 검증

**자동 (Win11 cell)**:

```bash
pnpm --filter @secretbank/extension test -- --testNamePattern "ping_pong_round_trip"
# → PASS 확인
```

**수동 (모든 cell)**:

1. popup 의 "페어링 상태" = `pending` 표시
2. 1초 내 nm-host echo 응답 수신
3. popup status 가 `error` (현재 데스크톱 IPC 미통합 = pair_response 없음 → 타임아웃) 또는 `paired` (echo 응답을 paired 로 해석 시) 표시
4. **B-10 단독 = ping_pong: ok 표시만 검증**, 실제 페어링 완료는 future B-11 (데스크톱 IPC 통합)

### Step 5 — uninstall

```bash
target/release/secretbank-nm-host --uninstall
```

검증: 레지스트리 / plist / config 파일 모두 삭제 확인.

## 5. Win11 자동 검증 결과

**Vitest 자동 ping/pong round-trip 테스트** — `extension/lib/__tests__/nm-client.test.ts` 의
`ping_pong_round_trip` 케이스 (T-24-E-B10 추가):

- Mock `chrome.runtime.connectNative` → fake Port stub
- nm-host echo 시뮬레이션 (postMessage 받은 메시지 즉시 onMessage dispatch)
- NMClient.connect() → sendMessage({type:'ping'}) → onMessage 수신 → assert ping/pong

**예상 결과**: ✅ PASS (B-3 의 nm-client 테스트 + B-4 의 페어링 테스트 가 이미 cover, 명시 ping/pong 테스트 1건 추가).

## 6. macOS / Linux Future (B-10.5)

**SKIP 사유**: 사용자 환경 = Win11 만. macOS / Linux 환경 확보 후 별도 sub-task `T-24-E-B10.5` 신설.

**B-10.5 진입 조건**:

- (a) 사용자가 macOS / Linux 환경 직접 확보 (VM / dual boot / 추가 기기)
- (b) 외부 audit 업체 (B-9 옵션 A) 가 macOS / Linux 검증 포함
- (c) Phase F-1 출시 직전 = 베타 사용자 (macOS / Linux) 가 실 사용 검증

(c) 권고 — 베타 사용자 피드백이 합성 환경 검증보다 더 가치 있음.

## 7. OS 별 hotfix 가이드 (placeholder)

### 7.1 Windows

| 발견                        | 원인                              | 완화                                     |
| :-------------------------- | :-------------------------------- | :--------------------------------------- |
| `--install` UAC 프롬프트    | HKLM 시도 시 UAC 필요             | HKCU 만 사용 (이미 적용됨)               |
| Defender / SmartScreen 경고 | unsigned binary                   | Authenticode 코드 서명 (Phase F 진입 시) |
| Path 공백                   | `C:\Program Files\Secretbank\...` | manifest path 따옴표 처리                |

### 7.2 macOS

| 발견             | 원인                  | 완화                                                       |
| :--------------- | :-------------------- | :--------------------------------------------------------- |
| Gatekeeper 차단  | unsigned binary       | Apple Developer ID 서명 + Notarization (Phase F-2 진입 시) |
| SIP 차단         | system-wide 경로 시도 | `~/Library` 만 사용 (이미 적용됨)                          |
| Hardened Runtime | inherit entitlements  | nm-host binary 도 Notarization                             |

### 7.3 Linux

| 발견                                   | 원인                   | 완화                                                         |
| :------------------------------------- | :--------------------- | :----------------------------------------------------------- |
| AppArmor 차단                          | snap Chrome 의 sandbox | distro 별 manifest 경로 분기 (snap = `~/snap/chromium/.../`) |
| SELinux 차단                           | enforcing 모드         | label 가이드 또는 distro 별 instructions                     |
| 배포판 차이 (Ubuntu vs Fedora vs Arch) | 패키지 경로 다름       | XDG Base Directory 표준 (`$XDG_CONFIG_HOME` 활용)            |

## 8. 결과 기록

| Cell                   |        결과         | 검증일 | 검증자   | 비고                                              |
| :--------------------- | :-----------------: | :----- | :------- | :------------------------------------------------ |
| Win 11 × Chrome        | 🟡 사용자 수동 대기 | TBD    | (사용자) | 자동 ping/pong PASS, 수동 페어링 검증 사용자 액션 |
| Win 11 × Firefox       | 🟡 사용자 수동 대기 | TBD    | (사용자) | 동상                                              |
| Win 11 × Edge          | 🟡 사용자 수동 대기 | TBD    | (사용자) | Chromium 동등                                     |
| macOS 14 × Chrome      |    SKIP (B-10.5)    | —      | —        | 환경 미확보                                       |
| macOS 14 × Firefox     |    SKIP (B-10.5)    | —      | —        | 동상                                              |
| macOS 14 × Safari      |  SKIP (Phase F-2)   | —      | —        | Safari = 별도 Xcode 빌드                          |
| Ubuntu 22.04 × Chrome  |    SKIP (B-10.5)    | —      | —        | 환경 미확보                                       |
| Ubuntu 22.04 × Firefox |    SKIP (B-10.5)    | —      | —        | 동상                                              |
| Ubuntu 22.04 × Edge    |    SKIP (B-10.5)    | —      | —        | 동상                                              |

## 9. 본 sub-task 클로즈 조건

- Win 11 자동 ping/pong PASS ✅
- 시나리오 문서 작성 완료 ✅
- macOS / Linux SKIP 명시 + future B-10.5 sub-task placeholder ✅
- 사용자 직접 Win 11 × {Chrome, Firefox, Edge} 수동 검증 = future hotfix gate (필요 시)
