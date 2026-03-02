#!/usr/bin/env node
// Mock claude binary for one-shot text output mode

const args = process.argv.slice(2);

// Handle --version flag
if (args.includes("--version")) {
  process.stdout.write("mock-claude 1.0.0\n");
  process.exit(0);
}

process.stdout.write("\x1b[1mHello\x1b[0m from Claude!\n");
process.stdout.write("This is \x1b[32mgreen text\x1b[0m and \x1b[31mred text\x1b[0m.\n");
process.stdout.write("Plain text line.\n");
