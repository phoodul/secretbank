#!/bin/bash
# Hook: session-checkpoint.sh
# Event: Stop
# Purpose: Auto-save session state when Claude finishes responding.
#          This ensures progress is recorded even if the terminal is closed unexpectedly.
#          On next session, /resume-project reads this file to restore context.

STATE_DIR="$CLAUDE_PROJECT_DIR/.claude/state"
STATE_FILE="$STATE_DIR/last_session.json"
PROGRESS_FILE="$CLAUDE_PROJECT_DIR/docs/progress.md"

mkdir -p "$STATE_DIR"

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
LOCAL_TIME=$(date +"%Y-%m-%d %H:%M:%S")

# --- Gather current project state ---

# Git status summary
GIT_BRANCH=$(git -C "$CLAUDE_PROJECT_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
GIT_HASH=$(git -C "$CLAUDE_PROJECT_DIR" rev-parse --short HEAD 2>/dev/null || echo "unknown")
GIT_DIRTY=$(git -C "$CLAUDE_PROJECT_DIR" status --porcelain 2>/dev/null | wc -l | tr -d ' ')

# Check which docs exist (indicates workflow phase)
HAS_RESEARCH="false"
HAS_INTEGRATOR="false"
HAS_PLAN="false"
HAS_TASK="false"
HAS_TEST_REPORT="false"

[ -f "$CLAUDE_PROJECT_DIR/docs/research_raw.md" ] && HAS_RESEARCH="true"
[ -f "$CLAUDE_PROJECT_DIR/docs/integrator_report.md" ] && HAS_INTEGRATOR="true"
[ -f "$CLAUDE_PROJECT_DIR/docs/implementation_plan.md" ] && HAS_PLAN="true"
[ -f "$CLAUDE_PROJECT_DIR/docs/task.md" ] && HAS_TASK="true"
[ -f "$CLAUDE_PROJECT_DIR/docs/test_report.md" ] && HAS_TEST_REPORT="true"

# Count completed tasks from task.md if it exists
TASKS_TOTAL=0
TASKS_DONE=0
if [ -f "$CLAUDE_PROJECT_DIR/docs/task.md" ]; then
  TASKS_TOTAL=$(grep -c "^## Task" "$CLAUDE_PROJECT_DIR/docs/task.md" 2>/dev/null || echo "0")
  TASKS_DONE=$(grep -c "\[x\]\|완료\|DONE\|completed" "$CLAUDE_PROJECT_DIR/docs/task.md" 2>/dev/null || echo "0")
fi

# Read loop counter state
AGENT_CALLS=0
CIRCUIT_STATE="CLOSED"
if [ -f "$STATE_DIR/loop_count.json" ]; then
  AGENT_CALLS=$(jq -r '.total_calls // 0' "$STATE_DIR/loop_count.json" 2>/dev/null || echo "0")
  CIRCUIT_STATE=$(jq -r '.circuit_state // "CLOSED"' "$STATE_DIR/loop_count.json" 2>/dev/null || echo "CLOSED")
fi

# Check night mode
NIGHT_MODE="false"
[ -f "$STATE_DIR/night_mode" ] && NIGHT_MODE="true"

# Detect current phase
CURRENT_PHASE="unknown"
if [ "$HAS_TEST_REPORT" = "true" ]; then
  CURRENT_PHASE="phase4_testing"
elif [ "$HAS_TASK" = "true" ] && [ "$TASKS_DONE" -gt 0 ]; then
  CURRENT_PHASE="phase3_implementation"
elif [ "$HAS_PLAN" = "true" ]; then
  CURRENT_PHASE="phase2_planning_done"
elif [ "$HAS_INTEGRATOR" = "true" ]; then
  CURRENT_PHASE="phase2_integration_done"
elif [ "$HAS_RESEARCH" = "true" ]; then
  CURRENT_PHASE="phase1_research_done"
else
  CURRENT_PHASE="phase0_not_started"
fi

# --- Write state file ---

jq -n \
  --arg ts "$TIMESTAMP" \
  --arg lt "$LOCAL_TIME" \
  --arg branch "$GIT_BRANCH" \
  --arg hash "$GIT_HASH" \
  --argjson dirty "$GIT_DIRTY" \
  --arg phase "$CURRENT_PHASE" \
  --argjson tasks_total "$TASKS_TOTAL" \
  --argjson tasks_done "$TASKS_DONE" \
  --argjson agent_calls "$AGENT_CALLS" \
  --arg circuit "$CIRCUIT_STATE" \
  --argjson night "$NIGHT_MODE" \
  --argjson has_research "$HAS_RESEARCH" \
  --argjson has_integrator "$HAS_INTEGRATOR" \
  --argjson has_plan "$HAS_PLAN" \
  --argjson has_task "$HAS_TASK" \
  --argjson has_test_report "$HAS_TEST_REPORT" \
  '{
    last_saved: $ts,
    local_time: $lt,
    git: { branch: $branch, commit: $hash, uncommitted_files: $dirty },
    workflow: {
      current_phase: $phase,
      tasks: { total: $tasks_total, completed: $tasks_done },
      agent_calls_this_session: $agent_calls,
      circuit_breaker: $circuit,
      night_mode: $night
    },
    docs_present: {
      research_raw: $has_research,
      integrator_report: $has_integrator,
      implementation_plan: $has_plan,
      task_md: $has_task,
      test_report: $has_test_report
    }
  }' > "$STATE_FILE"

exit 0
