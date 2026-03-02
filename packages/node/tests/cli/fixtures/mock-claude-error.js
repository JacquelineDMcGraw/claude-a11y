#!/usr/bin/env node
// Mock claude binary that simulates an error

const args = process.argv.slice(2);

// Handle --version flag
if (args.includes("--version")) {
  process.stdout.write("mock-claude 1.0.0\n");
  process.exit(0);
}

process.stdout.write('{"type":"system","subtype":"init","session_id":"err-session-001"}\n');
process.stderr.write("\x1b[31mError: Authentication failed. Please run claude login.\x1b[0m\n");
process.stdout.write('{"type":"result","subtype":"error","session_id":"err-session-001","total_cost_usd":0,"num_turns":0,"is_error":true,"errors":["Authentication failed"]}\n');
process.exit(1);
