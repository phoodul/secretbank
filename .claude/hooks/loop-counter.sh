#!/bin/bash
# Hook: loop-counter.sh
# Event: PreToolUse (Agent)
# Purpose: Track agent invocations and prevent infinite loops via circuit breaker

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')

if [[ "$TOOL_NAME" != "Agent" ]]; then
  exit 0
fi

# Extract agent description to identify which agent is being called
AGENT_DESC=$(echo "$INPUT" | jq -r '.tool_input.description // "unknown"')
AGENT_TYPE=$(echo "$INPUT" | jq -r '.tool_input.subagent_type // "general"')

STATE_DIR="$CLAUDE_PROJECT_DIR/.claude/state"
STATE_FILE="$STATE_DIR/loop_count.json"

# Initialize state directory and file
mkdir -p "$STATE_DIR"
if [[ ! -f "$STATE_FILE" ]]; then
  echo '{"agents":{},"circuit_state":"CLOSED","total_calls":0,"action_hashes":[]}' > "$STATE_FILE"
fi

STATE=$(cat "$STATE_FILE")
TOTAL=$(echo "$STATE" | jq -r '.total_calls // 0')
CIRCUIT=$(echo "$STATE" | jq -r '.circuit_state // "CLOSED"')

# --- Circuit Breaker Logic ---

# OPEN state: deny all agent calls
if [[ "$CIRCUIT" == "OPEN" ]]; then
  # Check cooldown (30 seconds)
  OPEN_TIME=$(echo "$STATE" | jq -r '.open_since // 0')
  CURRENT_TIME=$(date +%s)
  ELAPSED=$(( CURRENT_TIME - OPEN_TIME ))

  if [[ $ELAPSED -lt 30 ]]; then
    echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"서킷 브레이커 OPEN 상태. 무한 루프가 감지되어 에이전트 호출이 차단됨. Informer로 사용자에게 보고 필요."}}' | jq .
    exit 0
  else
    # Move to HALF_OPEN
    STATE=$(echo "$STATE" | jq '.circuit_state = "HALF_OPEN"')
  fi
fi

# HALF_OPEN: allow one call, then decide
if [[ "$CIRCUIT" == "HALF_OPEN" ]]; then
  STATE=$(echo "$STATE" | jq '.circuit_state = "CLOSED" | .consecutive_failures = 0')
fi

# --- Limit Checks ---

# Total agent call limit (50 per session)
if [[ $TOTAL -ge 50 ]]; then
  echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"세션 전체 에이전트 호출 상한(50회)에 도달. Informer로 사용자에게 보고 필요."}}' | jq .
  exit 0
fi

# Per-agent limits
AGENT_KEY=$(echo "$AGENT_TYPE" | tr -d '"')
AGENT_COUNT=$(echo "$STATE" | jq -r ".agents[\"$AGENT_KEY\"].count // 0")

# Agent-specific limits
MAX_COUNT=20
case "$AGENT_KEY" in
  problem-solver) MAX_COUNT=15 ;;
  tester) MAX_COUNT=10 ;;
  researcher) MAX_COUNT=10 ;;
  commiter) MAX_COUNT=30 ;;
esac

if [[ $AGENT_COUNT -ge $MAX_COUNT ]]; then
  echo "{\"hookSpecificOutput\":{\"hookEventName\":\"PreToolUse\",\"permissionDecision\":\"deny\",\"permissionDecisionReason\":\"${AGENT_KEY} 에이전트 호출 상한(${MAX_COUNT}회)에 도달.\"}}" | jq .
  exit 0
fi

# --- Loop Pattern Detection ---
# Check if last 6 action hashes show a 3-action repeating pattern
ACTION_HASH=$(echo "$AGENT_KEY:$AGENT_DESC" | md5sum | cut -c1-8)
HASHES=$(echo "$STATE" | jq -r '.action_hashes // []')
HASHES=$(echo "$HASHES" | jq --arg h "$ACTION_HASH" '. + [$h] | .[-6:]')

HASH_COUNT=$(echo "$HASHES" | jq 'length')
if [[ $HASH_COUNT -ge 6 ]]; then
  H0=$(echo "$HASHES" | jq -r '.[0]')
  H1=$(echo "$HASHES" | jq -r '.[1]')
  H2=$(echo "$HASHES" | jq -r '.[2]')
  H3=$(echo "$HASHES" | jq -r '.[3]')
  H4=$(echo "$HASHES" | jq -r '.[4]')
  H5=$(echo "$HASHES" | jq -r '.[5]')

  if [[ "$H0" == "$H3" && "$H1" == "$H4" && "$H2" == "$H5" ]]; then
    CURRENT_TIME=$(date +%s)
    STATE=$(echo "$STATE" | jq --argjson t "$CURRENT_TIME" '.circuit_state = "OPEN" | .open_since = $t')
    echo "$STATE" > "$STATE_FILE"
    echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"3-액션 반복 루프 패턴 감지. 서킷 브레이커 OPEN."}}' | jq .
    exit 0
  fi
fi

# --- Update State ---
NEW_TOTAL=$((TOTAL + 1))
NEW_COUNT=$((AGENT_COUNT + 1))

STATE=$(echo "$STATE" | jq \
  --arg key "$AGENT_KEY" \
  --argjson count "$NEW_COUNT" \
  --argjson total "$NEW_TOTAL" \
  ".agents[\$key].count = \$count | .total_calls = \$total | .action_hashes = $HASHES")

echo "$STATE" > "$STATE_FILE"

exit 0
