#!/bin/bash
set -e
FILE_PATH=$(jq -r '.tool_input.file_path // empty' < /dev/stdin)
[ -z "$FILE_PATH" ] && exit 0
[ ! -f "$FILE_PATH" ] && exit 0

# Rust files
if echo "$FILE_PATH" | grep -qE '\.rs$'; then
  rustfmt "$FILE_PATH" 2>/dev/null || true
fi

# Frontend files (TS/JS/CSS)
if echo "$FILE_PATH" | grep -qE '\.(ts|tsx|js|jsx|css|json)$'; then
  if [ -f "node_modules/.bin/prettier" ]; then
    npx prettier --write "$FILE_PATH" 2>/dev/null || true
  fi
fi

exit 0
