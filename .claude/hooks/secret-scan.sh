#!/bin/bash
# Hook: secret-scan.sh
# Event: PostToolUse (Write, Edit)
# Purpose: Detect hardcoded secrets in written/edited files

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')

# Only check Write and Edit
if [[ "$TOOL_NAME" != "Write" && "$TOOL_NAME" != "Edit" ]]; then
  exit 0
fi

# Get the file path
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.path // empty')

if [[ -z "$FILE_PATH" || ! -f "$FILE_PATH" ]]; then
  exit 0
fi

# Skip non-code files
case "$FILE_PATH" in
  *.md|*.txt|*.json|*.yaml|*.yml|*.toml|*.lock|*.svg|*.png|*.jpg|*.gif)
    exit 0
    ;;
esac

# --- Secret Patterns (from truffleHog/detect-secrets/gitleaks) ---

PATTERNS=(
  # Cloud providers
  '(A3T[A-Z0-9]|AKIA|AGPA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}'
  'amzn\.mws\.[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
  'AIza[0-9A-Za-z\-_]{35}'
  'ya29\.[0-9A-Za-z\-_]+'

  # Version control
  'ghp_[A-Za-z0-9_]{36,}'
  'gho_[A-Za-z0-9_]{36,}'
  'ghu_[A-Za-z0-9_]{36,}'
  'ghs_[A-Za-z0-9_]{36,}'
  'glpat-[0-9a-zA-Z\-_]{20}'

  # Payment/SaaS
  'sk_live_[0-9a-zA-Z]{24}'
  'rk_live_[0-9a-zA-Z]{24}'
  'SK[0-9a-fA-F]{32}'
  'sq0atp-[0-9A-Za-z\-_]{22}'
  'key-[0-9a-zA-Z]{32}'

  # Messaging
  'xox[pboa]-[0-9]{10,}-[0-9]{10,}'
  'https://hooks\.slack\.com/services/T[a-zA-Z0-9_]{8}/B[a-zA-Z0-9_]{8}/[a-zA-Z0-9_]{24}'

  # Crypto keys
  '-----BEGIN ((EC|PGP|DSA|RSA|OPENSSH) )?PRIVATE KEY( BLOCK)?-----'

  # Generic secrets in assignments
  '["\x27](sk-[a-zA-Z0-9]{20,})["\x27]'
  'password\s*[=:]\s*["\x27][^"\x27]{8,}["\x27]'
  'secret\s*[=:]\s*["\x27][^"\x27]{8,}["\x27]'
  'api[_-]?key\s*[=:]\s*["\x27][0-9a-zA-Z]{16,}["\x27]'

  # Connection strings with credentials
  '(jdbc|mongodb|mysql|postgresql|redis)://[^/\s:@]+:[^/\s:@]+@'
)

FOUND=""
for PATTERN in "${PATTERNS[@]}"; do
  MATCH=$(grep -nEi "$PATTERN" "$FILE_PATH" 2>/dev/null | head -3)
  if [[ -n "$MATCH" ]]; then
    FOUND="${FOUND}\n${MATCH}"
  fi
done

if [[ -n "$FOUND" ]]; then
  ESCAPED=$(echo -e "$FOUND" | head -5 | sed 's/"/\\"/g' | tr '\n' ' ')
  echo "{\"hookSpecificOutput\":{\"hookEventName\":\"PostToolUse\",\"decision\":\"warn\",\"message\":\"시크릿 하드코딩 감지: ${ESCAPED}. 환경 변수로 이동하세요. security-reviewer 에이전트 실행을 권장합니다.\"}}" | jq .
  exit 0
fi

exit 0
