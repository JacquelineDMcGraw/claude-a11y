#!/bin/bash
# Mock claude binary for testing claude-accessible
# Outputs stream-json format with ANSI codes that should be stripped

# Handle --version flag
for arg in "$@"; do
  if [ "$arg" = "--version" ]; then
    echo "mock-claude 1.0.0"
    exit 0
  fi
done

echo '{"type":"system","subtype":"init","session_id":"test-session-abc123"}'
echo '{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"\u001b[1mHello\u001b[0m from \u001b[32mClaude\u001b[0m! I can see your project."}]}}'
echo '{"type":"assistant","message":{"role":"assistant","content":[{"type":"tool_use","name":"Read","id":"tu_01","input":{"file_path":"src/main.ts"}}]}}'
echo '{"type":"assistant","message":{"role":"assistant","content":[{"type":"tool_result","tool_use_id":"tu_01","content":[{"type":"text","text":"const app = express();"}]}]}}'
echo '{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"I found the main entry point. The code looks \u001b[1;33mgood\u001b[0m."}]}}'
echo '{"type":"result","subtype":"success","session_id":"test-session-abc123","total_cost_usd":0.0037,"num_turns":2,"is_error":false}'
