#!/bin/bash
# Mock claude binary that simulates an error

# Handle --version flag
for arg in "$@"; do
  if [ "$arg" = "--version" ]; then
    echo "mock-claude 1.0.0"
    exit 0
  fi
done

echo '{"type":"system","subtype":"init","session_id":"err-session-001"}' >&1
printf '\x1b[31mError: Authentication failed. Please run claude login.\x1b[0m\n' >&2
echo '{"type":"result","subtype":"error","session_id":"err-session-001","total_cost_usd":0,"num_turns":0,"is_error":true,"errors":["Authentication failed"]}' >&1
exit 1
