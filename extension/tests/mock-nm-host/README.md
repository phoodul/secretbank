# Mock Native Messaging Host

테스트/CI 전용 Node.js NM Host stub. Tauri 앱 없이 단독 E2E 실행을 위한 backend stub.

## 개요

Secretbank 브라우저 확장의 F-3/F-4 E2E 테스트(Playwright Chromium / Mozilla web-ext)에서
실제 Rust `secretbank-nm-host` 대신 사용하는 경량 Node.js 프로세스.

- stdin/stdout 4-byte LE header + UTF-8 JSON (B-1 Rust nm-host 와 동일 프로토콜)
- 실제 secret/credential 처리 없음 — fixture 데이터만 반환
- Node.js built-in 의존성만 사용 (외부 npm 패키지 없음)

## 지원 메시지 타입

| 요청 type                     | 응답 type                              | 비고                                          |
| :---------------------------- | :------------------------------------- | :-------------------------------------------- |
| `ping`                        | `pong`                                 | 연결 확인                                     |
| `init` / `pairing_request`    | `paired`                               | mock 공개키 포함                              |
| `get_credential_list`         | `get_credential_list_response`         | 3개 fixture credential                        |
| `credential_list_by_domain`   | `credential_list_by_domain_response`   | domain 매칭 시 1개                            |
| `credential_create`           | `credential_save_response`             | `{ ok: true, credential_id: "fixture-uuid" }` |
| `credential_update`           | `credential_save_response`             | `{ ok: true }`                                |
| `graph_for_credential`        | `graph_for_credential_response`        | 3개 project_nodes                             |
| `incident_check_for_host`     | `incident_check_for_host_response`     | `github.com` 트리거 시 1건                    |
| `blast_radius_for_host`       | `blast_radius_for_host_response`       | `github.com` 트리거 시 3건                    |
| `mcp_context_push`            | `{ ok: true }`                         | ack-only                                      |
| `ext_settings_get_mcp_opt_in` | `ext_settings_get_mcp_opt_in_response` | 기본 `enabled: false`                         |
| `get_recipe_for_domain`       | `get_recipe_for_domain_response`       | `github.com` preset 포함                      |
| `upsert_recipe_for_domain`    | `upsert_recipe_for_domain_response`    | `{ ok: true }`                                |
| 알 수 없는 type               | `{ type: "error", ... }`               |                                               |

## 설치 (F-3/F-4 E2E 실행 전)

### Linux / macOS

```bash
# 기본 EXT_ID (placeholder) 로 등록
bash extension/tests/mock-nm-host/install.sh

# 특정 확장 ID 지정
EXT_ID="abcdefghijklmnopqrstuvwxyz123456" bash extension/tests/mock-nm-host/install.sh
```

등록되는 경로:

| 브라우저 | Linux                                            | macOS                                                                |
| :------- | :----------------------------------------------- | :------------------------------------------------------------------- |
| Chrome   | `~/.config/google-chrome/NativeMessagingHosts/`  | `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/`  |
| Chromium | `~/.config/chromium/NativeMessagingHosts/`       | `~/Library/Application Support/Chromium/NativeMessagingHosts/`       |
| Edge     | `~/.config/microsoft-edge/NativeMessagingHosts/` | `~/Library/Application Support/Microsoft Edge/NativeMessagingHosts/` |
| Firefox  | `~/.mozilla/native-messaging-hosts/`             | `~/Library/Application Support/Mozilla/NativeMessagingHosts/`        |

### Windows

```powershell
# PowerShell (관리자 권한 불필요)
$env:EXT_ID = "abcdefghijklmnopqrstuvwxyz123456"
.\extension\tests\mock-nm-host\install.ps1
```

HKCU 레지스트리에 Chrome / Chromium / Edge 키 등록. Firefox Windows 는 추후 지원.

## 제거

```bash
# Linux / macOS
bash extension/tests/mock-nm-host/uninstall.sh

# Windows
.\extension\tests\mock-nm-host\uninstall.ps1
```

## fixture 데이터 override

### 환경 변수로 fixture 파일 경로 지정

```bash
SB_MOCK_FIXTURE_PATH=/path/to/my-fixtures.json node extension/tests/mock-nm-host/index.js
```

### fixture 파일 형식 (JSON)

`extension/tests/mock-nm-host/fixtures.json` 에 배치하거나 `SB_MOCK_FIXTURE_PATH` 로 지정:

```json
{
  "credentials": [
    { "credential_id": "my-id", "issuer": "MyIssuer", "domain": "example.com", "username": "user" }
  ],
  "domain_match": { "domain": "example.com", "credential_id": "my-id" },
  "pairing": { "desktop_pub": "<base64>", "device_id": "dev-id" },
  "graph": {
    "center_id": "my-id",
    "center_label": "MyIssuer",
    "project_nodes": [],
    "edges": [],
    "hidden_count": 0
  },
  "incident": { "trigger_host": "example.com", "matches": [] },
  "blast_radius": {
    "trigger_host": "example.com",
    "credential_id": "my-id",
    "affected": [],
    "total": 0,
    "hidden_count": 0
  },
  "recipe": { "domain": "example.com", "found": false, "recipe": null, "source": "preset" },
  "mcp_opt_in": { "enabled": false }
}
```

### 테스트별 opt-in override

`mcp_opt_in.enabled` 를 `true` 로 설정한 fixture 파일을 `SB_MOCK_FIXTURE_PATH` 로 지정하면
해당 테스트에서 MCP opt-in ON 상태를 시뮬레이션할 수 있다.

## 수동 직접 실행 (디버깅)

```bash
node extension/tests/mock-nm-host/index.js
```

4-byte LE header + JSON body 를 stdin 으로 보내면 응답을 stdout 으로 받는다.
디버그 로그는 stderr 로 출력된다.

**Python으로 수동 테스트 예시:**

```python
import struct, json, subprocess, sys

proc = subprocess.Popen(
    ["node", "extension/tests/mock-nm-host/index.js"],
    stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=sys.stderr
)

def send(msg):
    body = json.dumps(msg).encode()
    proc.stdin.write(struct.pack("<I", len(body)) + body)
    proc.stdin.flush()
    length = struct.unpack("<I", proc.stdout.read(4))[0]
    return json.loads(proc.stdout.read(length))

print(send({"type": "ping"}))
# → {"type": "pong"}

print(send({"type": "get_credential_list", "session_token": "tok"}))
# → {"type": "get_credential_list_response", "ok": True, "items": [...]}

proc.stdin.close()
proc.wait()
```

## 단위 테스트 실행

```bash
pnpm --filter @secretbank/extension test
# 또는
cd extension && pnpm test
```

`extension/tests/mock-nm-host/__tests__/index.test.js` 포함.

## F-3/F-4 연동

- **F-3 (Playwright Chromium E2E)**: `install.sh` 실행 후 Playwright 가 Chromium 을 `--load-extension` 으로 실행. NM host 가 mock으로 실행되어 실제 Tauri 앱 없이 E2E 진행.
- **F-4 (Firefox web-ext E2E)**: Firefox 용 manifest 도 `install.sh` 가 함께 등록하므로 `web-ext run` 에서 바로 사용 가능.

## 주의사항

- stdout 오염 금지: `console.log`, `process.stdout.write(text)` 절대 사용 금지. 모든 디버그 출력은 stderr.
- 이 stub 은 실제 암호화/인증 없음. E2E 테스트 한정.
- Rust `secretbank-nm-host` 와 100% 메시지 타입 호환 유지 — fixture mismatch 시 E2E 실패로 즉시 알 수 있음.
