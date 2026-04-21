#!/bin/bash
set -e
INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
[ -z "$FILE_PATH" ] && exit 0
[ ! -f "$FILE_PATH" ] && exit 0

# Only check UI-related files
case "$FILE_PATH" in
  *.tsx|*.jsx|*.vue|*.svelte|*.html|*.dart|*.css|*.scss) ;;
  *) exit 0 ;;
esac

WARNINGS=""

# 1. Hardcoded color detection (hex colors outside design tokens)
if grep -Pn '#[0-9a-fA-F]{3,8}(?![-\w])' "$FILE_PATH" 2>/dev/null | grep -v '// ux-ok' | grep -v 'tailwind' | grep -v '@theme' | grep -v 'design-token' | head -3 | grep -q .; then
  WARNINGS="${WARNINGS}[UX] Hardcoded color detected — use design tokens instead. "
fi

# 2. Missing alt on img tags
if grep -Pn '<img\b(?![^>]*\balt\b)' "$FILE_PATH" 2>/dev/null | head -1 | grep -q .; then
  WARNINGS="${WARNINGS}[A11Y] <img> without alt attribute. "
fi

# 3. Missing aria-label on interactive elements without text content
if grep -Pn '<(button|a)\b[^>]*>\s*<(svg|icon|img)' "$FILE_PATH" 2>/dev/null | grep -v 'aria-label' | head -1 | grep -q .; then
  WARNINGS="${WARNINGS}[A11Y] Interactive element with icon-only content missing aria-label. "
fi

# 4. Hardcoded px values for font-size (should use scale)
if grep -Pn 'font-size:\s*\d+px' "$FILE_PATH" 2>/dev/null | grep -v '// ux-ok' | head -1 | grep -q .; then
  WARNINGS="${WARNINGS}[UX] Hardcoded font-size px — use typography scale. "
fi

# Output warnings as non-blocking info (allow, but show message)
if [ -n "$WARNINGS" ]; then
  echo "$WARNINGS" >&2
fi

exit 0
