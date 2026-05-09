#!/bin/bash
# @file uninstall.sh
# @license AGPL-3.0-or-later
#
# Mock NM Host 제거 스크립트 — Linux / macOS.
# install.sh 로 등록한 manifest 파일을 제거한다.

set -e

HOST_NAME="${HOST_NAME:-com.secretbank.nm_host}"
MANIFEST_NAME="${HOST_NAME}.json"

remove_manifest() {
  local browser="$1"
  local manifest_path="$2"
  if [ -f "$manifest_path" ]; then
    rm -f "$manifest_path"
    echo "[uninstall] ${browser}: $manifest_path 제거 완료"
  else
    echo "[uninstall] ${browser}: $manifest_path 없음 (skip)"
  fi
}

OS="$(uname -s)"

case "$OS" in
  Linux)
    remove_manifest "Chrome"   "$HOME/.config/google-chrome/NativeMessagingHosts/$MANIFEST_NAME"
    remove_manifest "Chromium" "$HOME/.config/chromium/NativeMessagingHosts/$MANIFEST_NAME"
    remove_manifest "Edge"     "$HOME/.config/microsoft-edge/NativeMessagingHosts/$MANIFEST_NAME"
    remove_manifest "Firefox"  "$HOME/.mozilla/native-messaging-hosts/$MANIFEST_NAME"
    ;;
  Darwin)
    remove_manifest "Chrome"   "$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts/$MANIFEST_NAME"
    remove_manifest "Chromium" "$HOME/Library/Application Support/Chromium/NativeMessagingHosts/$MANIFEST_NAME"
    remove_manifest "Edge"     "$HOME/Library/Application Support/Microsoft Edge/NativeMessagingHosts/$MANIFEST_NAME"
    remove_manifest "Firefox"  "$HOME/Library/Application Support/Mozilla/NativeMessagingHosts/$MANIFEST_NAME"
    ;;
  *)
    echo "[uninstall] 지원하지 않는 OS: $OS" >&2
    exit 1
    ;;
esac

echo "[uninstall] 완료."
