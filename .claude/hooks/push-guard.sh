#!/bin/bash
# Hook: push-guard.sh
# Event: PreToolUse (Bash)
# Purpose: Require user approval for all git push, deny force push

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')

if [[ "$TOOL_NAME" != "Bash" ]]; then
  exit 0
fi

COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

if [[ -z "$COMMAND" ]]; then
  exit 0
fi

# Check for git push --force (DENY always)
if echo "$COMMAND" | grep -qEi 'git\s+push\s+.*(-f|--force)'; then
  echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"git push --force는 금지되어 있습니다. 데이터 손실 위험."}}' | jq .
  exit 0
fi

# Check for git push (ASK always)
if echo "$COMMAND" | grep -qEi 'git\s+push'; then
  # Check night mode
  NIGHT_MODE_FILE="$CLAUDE_PROJECT_DIR/.claude/state/night_mode"
  if [[ -f "$NIGHT_MODE_FILE" ]]; then
    echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Night mode에서는 git push가 차단됩니다. 사용자 복귀 후 처리하세요."}}' | jq .
    exit 0
  fi

  echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"git push를 실행하려고 합니다. 승인하시겠습니까?"}}' | jq .
  exit 0
fi

# Check for deploy commands (ASK)
if echo "$COMMAND" | grep -qEi '(vercel\s+--prod|firebase\s+deploy|fly\s+deploy|docker\s+push|npm\s+publish|pip\s+upload|cargo\s+publish|pnpm\s+publish)'; then
  echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"배포 명령을 실행하려고 합니다. 승인하시겠습니까?"}}' | jq .
  exit 0
fi

exit 0
