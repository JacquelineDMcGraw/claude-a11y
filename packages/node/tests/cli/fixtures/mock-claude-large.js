#!/usr/bin/env node
// Mock claude binary with large output

const args = process.argv.slice(2);

// Handle --version flag
if (args.includes("--version")) {
  process.stdout.write("mock-claude 1.0.0\n");
  process.exit(0);
}

process.stdout.write('{"type":"system","subtype":"init","session_id":"large-session-001"}\n');

// Generate 200 text events
for (let i = 1; i <= 200; i++) {
  process.stdout.write(`{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Line ${i} of output with \\u001b[32msome color\\u001b[0m and text.\\n"}]}}\n`);
}

process.stdout.write('{"type":"result","subtype":"success","session_id":"large-session-001","total_cost_usd":0.0500,"num_turns":1,"is_error":false}\n');
