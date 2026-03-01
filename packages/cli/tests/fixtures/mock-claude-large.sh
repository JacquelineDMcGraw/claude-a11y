#!/bin/bash
# Mock claude binary with large output

# Handle --version flag
for arg in "$@"; do
  if [ "$arg" = "--version" ]; then
    echo "mock-claude 1.0.0"
    exit 0
  fi
done

echo '{"type":"system","subtype":"init","session_id":"large-session-001"}'

# Generate 200 text events
for i in $(seq 1 200); do
  echo "{\"type\":\"assistant\",\"message\":{\"role\":\"assistant\",\"content\":[{\"type\":\"text\",\"text\":\"Line $i of output with \\u001b[32msome color\\u001b[0m and text.\\n\"}]}}"
done

echo '{"type":"result","subtype":"success","session_id":"large-session-001","total_cost_usd":0.0500,"num_turns":1,"is_error":false}'
