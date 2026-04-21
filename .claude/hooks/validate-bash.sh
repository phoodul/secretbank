#!/bin/bash
set -e
COMMAND=$(jq -r '.tool_input.command // empty' < /dev/stdin)

if echo "$COMMAND" | grep -qE '^(rm -rf /|rm -rf \*|dd |mkfs)'; then
  jq -n '{ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: "Destructive command blocked" } }'
  exit 0
fi

if echo "$COMMAND" | grep -qE 'git push.*(--force|-f)'; then
  jq -n '{ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "ask", permissionDecisionReason: "Force push detected" } }'
  exit 0
fi

exit 0
