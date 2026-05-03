#!/bin/bash
set -e
FILE_PATH=$(jq -r '.tool_input.file_path // empty')
[ -z "$FILE_PATH" ] && exit 0

DENY_PATTERNS=(".env" "secrets/" "credentials" ".key$" ".pem$" "tauri.conf.json")
for p in "${DENY_PATTERNS[@]}"; do
  if echo "$FILE_PATH" | grep -qi "$p"; then
    jq -n --arg r "Protected: $FILE_PATH" '{ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "ask", permissionDecisionReason: $r } }'
    exit 0
  fi
done

exit 0
