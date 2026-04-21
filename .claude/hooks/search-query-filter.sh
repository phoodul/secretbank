#!/bin/bash
# Hook: search-query-filter.sh
# Event: PreToolUse (WebSearch, WebFetch)
# Purpose: Prevent project secrets and PII from leaking via search queries

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')

# Only check WebSearch and WebFetch
if [[ "$TOOL_NAME" != "WebSearch" && "$TOOL_NAME" != "WebFetch" ]]; then
  exit 0
fi

# Extract the search query or URL
QUERY=$(echo "$INPUT" | jq -r '.tool_input.query // .tool_input.url // empty')

if [[ -z "$QUERY" ]]; then
  exit 0
fi

# --- Pattern Definitions ---

# API keys and tokens
API_KEY_PATTERNS='(sk-[a-zA-Z0-9]{20,}|sk-proj-[a-zA-Z0-9]{20,}|AIza[0-9A-Za-z\-_]{35}|ghp_[A-Za-z0-9_]{36,}|glpat-[0-9a-zA-Z\-_]{20}|AKIA[A-Z0-9]{16}|xox[pboa]-[0-9]{10,}|sk_live_[0-9a-zA-Z]{24}|rk_live_[0-9a-zA-Z]{24}|ya29\.[0-9A-Za-z\-_]+)'

# Internal network addresses
INTERNAL_PATTERNS='(192\.168\.[0-9]+\.[0-9]+|10\.[0-9]+\.[0-9]+\.[0-9]+|172\.(1[6-9]|2[0-9]|3[01])\.[0-9]+\.[0-9]+|localhost:[0-9]+|127\.0\.0\.1|\.internal\.|\.local\.)'

# PII patterns (email, phone)
PII_PATTERNS='([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})'

# Private keys
PRIVATE_KEY_PATTERN='-----BEGIN.*(PRIVATE|RSA|EC|DSA).*KEY'

# --- Detection ---

# Check for API keys (DENY)
if echo "$QUERY" | grep -qEi "$API_KEY_PATTERNS"; then
  echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"검색 쿼리에 API 키/토큰이 포함되어 있습니다. 시크릿을 제거하고 다시 시도하세요."}}' | jq .
  exit 0
fi

# Check for private keys (DENY)
if echo "$QUERY" | grep -qEi "$PRIVATE_KEY_PATTERN"; then
  echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"검색 쿼리에 프라이빗 키가 포함되어 있습니다."}}' | jq .
  exit 0
fi

# Check for internal network (DENY)
if echo "$QUERY" | grep -qEi "$INTERNAL_PATTERNS"; then
  echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"검색 쿼리에 내부 네트워크 주소가 포함되어 있습니다. 내부 IP/도메인 유출 위험."}}' | jq .
  exit 0
fi

# Check for PII (ASK)
if echo "$QUERY" | grep -qEi "$PII_PATTERNS"; then
  echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"검색 쿼리에 이메일 주소가 포함되어 있습니다. 개인정보 유출 가능성을 확인하세요."}}' | jq .
  exit 0
fi

# All clear
exit 0
