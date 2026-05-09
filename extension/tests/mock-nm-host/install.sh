#!/bin/bash
# @file install.sh
# @license AGPL-3.0-or-later
#
# Mock NM Host 설치 스크립트 — Linux / macOS.
# 테스트/CI 전용. 프로덕션 배포 미포함.
#
# 용도: F-3/F-4 E2E 테스트 실행 전 NM host manifest 등록.
#
# 사용법:
#   EXT_ID="chrome-extension-id-here" bash install.sh
#   bash install.sh  # EXT_ID 기본값: placeholder_ext_id
#
# 환경 변수:
#   EXT_ID     — 브라우저 확장 ID (chrome-extension://<ID>/)
#   HOST_NAME  — NM host 이름 (기본: com.secretbank.nm_host)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOST_JS="$SCRIPT_DIR/index.js"
EXT_ID="${EXT_ID:-placeholder_ext_id}"
HOST_NAME="${HOST_NAME:-com.secretbank.nm_host}"
MANIFEST_NAME="${HOST_NAME}.json"

# index.js 실행 권한 부여
chmod +x "$HOST_JS"

# NM manifest JSON 생성
generate_manifest() {
  local path="$1"
  local ext_id="$2"
  cat <<EOF
{
  "name": "${HOST_NAME}",
  "description": "Secretbank Mock Native Messaging Host (test-only)",
  "path": "${path}",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://${ext_id}/"
  ]
}
EOF
}

# Firefox 용 manifest (allowed_extensions)
generate_firefox_manifest() {
  local path="$1"
  local ext_id="$2"
  cat <<EOF
{
  "name": "${HOST_NAME}",
  "description": "Secretbank Mock Native Messaging Host (test-only)",
  "path": "${path}",
  "type": "stdio",
  "allowed_extensions": [
    "${ext_id}@secretbank.app"
  ]
}
EOF
}

install_for_browser() {
  local browser="$1"
  local manifest_dir="$2"
  local manifest_content="$3"

  mkdir -p "$manifest_dir"
  echo "$manifest_content" > "$manifest_dir/$MANIFEST_NAME"
  echo "[install] ${browser}: $manifest_dir/$MANIFEST_NAME 등록 완료"
}

OS="$(uname -s)"

case "$OS" in
  Linux)
    # Chrome
    CHROME_DIR="$HOME/.config/google-chrome/NativeMessagingHosts"
    install_for_browser "Chrome" "$CHROME_DIR" "$(generate_manifest "$HOST_JS" "$EXT_ID")"

    # Chromium
    CHROMIUM_DIR="$HOME/.config/chromium/NativeMessagingHosts"
    install_for_browser "Chromium" "$CHROMIUM_DIR" "$(generate_manifest "$HOST_JS" "$EXT_ID")"

    # Edge (Linux)
    EDGE_DIR="$HOME/.config/microsoft-edge/NativeMessagingHosts"
    install_for_browser "Edge" "$EDGE_DIR" "$(generate_manifest "$HOST_JS" "$EXT_ID")"

    # Firefox
    FIREFOX_DIR="$HOME/.mozilla/native-messaging-hosts"
    install_for_browser "Firefox" "$FIREFOX_DIR" "$(generate_firefox_manifest "$HOST_JS" "$EXT_ID")"
    ;;

  Darwin)
    # Chrome (macOS)
    CHROME_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
    install_for_browser "Chrome" "$CHROME_DIR" "$(generate_manifest "$HOST_JS" "$EXT_ID")"

    # Chromium (macOS)
    CHROMIUM_DIR="$HOME/Library/Application Support/Chromium/NativeMessagingHosts"
    install_for_browser "Chromium" "$CHROMIUM_DIR" "$(generate_manifest "$HOST_JS" "$EXT_ID")"

    # Edge (macOS)
    EDGE_DIR="$HOME/Library/Application Support/Microsoft Edge/NativeMessagingHosts"
    install_for_browser "Edge" "$EDGE_DIR" "$(generate_manifest "$HOST_JS" "$EXT_ID")"

    # Firefox (macOS)
    FIREFOX_DIR="$HOME/Library/Application Support/Mozilla/NativeMessagingHosts"
    install_for_browser "Firefox" "$FIREFOX_DIR" "$(generate_firefox_manifest "$HOST_JS" "$EXT_ID")"
    ;;

  *)
    echo "[install] 지원하지 않는 OS: $OS — Windows 는 install.ps1 을 사용하세요." >&2
    exit 1
    ;;
esac

echo ""
echo "[install] Mock NM Host 등록 완료."
echo "  Host:    $HOST_NAME"
echo "  Script:  $HOST_JS"
echo "  Ext ID:  $EXT_ID"
echo ""
echo "제거하려면: bash uninstall.sh"
