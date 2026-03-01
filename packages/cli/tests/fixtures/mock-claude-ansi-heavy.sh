#!/bin/bash
# Mock claude binary with extreme ANSI escape codes

# Handle --version flag
for arg in "$@"; do
  if [ "$arg" = "--version" ]; then
    echo "mock-claude 1.0.0"
    exit 0
  fi
done

echo '{"type":"system","subtype":"init","session_id":"ansi-session-001"}'

# Message with many different ANSI types embedded in JSON \u escapes
echo '{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"\u001b[1;38;2;255;100;0mTrue color bold\u001b[0m \u001b[38;5;208m256-color\u001b[0m \u001b[2;3mDim italic\u001b[22;23m normal text"}]}}'

# Spinner-like output with carriage returns
echo '{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Working...\rDone!"}]}}'

# Tool use
echo '{"type":"assistant","message":{"role":"assistant","content":[{"type":"tool_use","name":"Bash","id":"tu_02","input":{"command":"echo hello"}}]}}'
echo '{"type":"assistant","message":{"role":"assistant","content":[{"type":"tool_result","tool_use_id":"tu_02","content":[{"type":"text","text":"hello"}]}]}}'

# Final text with emoji and ANSI
echo '{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"\u001b[32m\u2705 All done!\u001b[0m Here is the \u001b[1mresult\u001b[0m."}]}}'

echo '{"type":"result","subtype":"success","session_id":"ansi-session-001","total_cost_usd":0.0121,"num_turns":3,"is_error":false}'
