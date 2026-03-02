#!/usr/bin/env node
// Mock claude binary with extreme ANSI escape codes

const args = process.argv.slice(2);

// Handle --version flag
if (args.includes("--version")) {
  process.stdout.write("mock-claude 1.0.0\n");
  process.exit(0);
}

process.stdout.write('{"type":"system","subtype":"init","session_id":"ansi-session-001"}\n');

// Message with many different ANSI types embedded in JSON \u escapes
process.stdout.write('{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"\\u001b[1;38;2;255;100;0mTrue color bold\\u001b[0m \\u001b[38;5;208m256-color\\u001b[0m \\u001b[2;3mDim italic\\u001b[22;23m normal text"}]}}\n');

// Spinner-like output with carriage returns
process.stdout.write('{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Working...\\rDone!"}]}}\n');

// Tool use
process.stdout.write('{"type":"assistant","message":{"role":"assistant","content":[{"type":"tool_use","name":"Bash","id":"tu_02","input":{"command":"echo hello"}}]}}\n');
process.stdout.write('{"type":"assistant","message":{"role":"assistant","content":[{"type":"tool_result","tool_use_id":"tu_02","content":[{"type":"text","text":"hello"}]}]}}\n');

// Final text with emoji and ANSI
process.stdout.write('{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"\\u001b[32m\\u2705 All done!\\u001b[0m Here is the \\u001b[1mresult\\u001b[0m."}]}}\n');

process.stdout.write('{"type":"result","subtype":"success","session_id":"ansi-session-001","total_cost_usd":0.0121,"num_turns":3,"is_error":false}\n');
