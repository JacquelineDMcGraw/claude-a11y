/**
 * CLI entry point for claude-accessible (claude-sr).
 *
 * Parses command-line arguments and routes to either one-shot mode or
 * the conversational REPL.
 */

import { parseArgs } from "node:util";
import { checkClaudeInstalled, runOneShot, setPassthroughMode, setQuietMode } from "./runner.js";
import { startRepl } from "./repl.js";
import { sanitize, initFormatter } from "../core/index.js";

const VERSION = (() => {
  try {
    return (require("../package.json") as { version: string }).version;
  } catch {
    return "1.1.0";
  }
})();

const HELP_TEXT = `claude-sr — Screen-reader-friendly interface to Claude Code

USAGE
  claude-sr                          Start conversational REPL
  claude-sr "your prompt"            One-shot query (like claude -p)
  claude-sr --raw "your prompt"      One-shot without speech formatting
  claude-sr -c                       Continue most recent conversation
  claude-sr -r <session-id>          Resume specific session

SCREEN READER FEATURES
  * No spinners, animations, or line rewriting
  * No ANSI color codes or formatting
  * Plain, linear, append-only text output
  * Tool activity announced as plain text
  * Fully compatible with NVDA, JAWS, VoiceOver, and Orca

REPL COMMANDS
  /help          Show this help
  /new           Start new session
  /session       Show current session ID
  /cost          Show accumulated cost
  /version       Show version info
  /compact       Compact conversation context
  /clear         Clear screen
  /exit          Exit (also: /quit, Ctrl+D)

CLAUDE-SR FLAGS
  --raw                              Disable speech formatting (sanitized passthrough)
  --quiet                            Suppress heartbeat and status messages on stderr


FLAGS (passed through to claude)
  -m, --model <model>                Set model (sonnet, opus, haiku, or full name)
  -c, --continue                     Continue most recent conversation
  -r, --resume <id>                  Resume specific session
  --allowedTools <tools>             Tools to allow without prompting
  --disallowedTools <tools>          Tools to disallow
  --permission-mode <mode>           Permission mode (plan, acceptEdits, etc.)
  --system-prompt <text>             Replace system prompt
  --append-system-prompt <text>      Append to system prompt
  --mcp-config <path>                Load MCP servers from JSON
  --max-turns <n>                    Limit agentic turns
  --verbose                          Enable verbose output
  --add-dir <paths>                  Add working directories
  --agents <json>                    Define custom subagents
  --tools <list>                     Specify available tools
  --dangerously-skip-permissions     Skip all permission prompts
  --fallback-model <model>           Fallback model when primary overloaded
  --json-schema <schema>             Get structured JSON output

  All other claude flags are passed through automatically.

ENVIRONMENT
  CLAUDE_SR_PROMPT       Custom prompt character (default: "> ")
  CLAUDE_SR_ANNOUNCE     Set to "0" to suppress tool announcements

EXAMPLES
  claude-sr                              Interactive coding session
  claude-sr "explain this project"       Quick question
  claude-sr -c "now add tests"           Continue last conversation
  echo "fix lint errors" | claude-sr     Piped input
  claude-sr --model opus "review PR"     Use specific model

REQUIREMENTS
  Claude Code CLI must be installed and authenticated.
  Install: https://docs.anthropic.com/en/docs/claude-code/overview

ABOUT
  GitHub: https://github.com/JacquelineDMcGraw/claude-a11y
  License: MIT
`;

// --- Argument Parsing ---

interface ParsedArgs {
  // claude-sr specific
  help: boolean;
  version: boolean;
  raw: boolean;
  quiet: boolean;
  prompt: string | null;

  // Session management
  continueSession: boolean;
  resumeId: string | null;

  // Passthrough args to build for claude
  passthroughArgs: string[];
}

function parseCliArgs(argv: string[]): ParsedArgs {
  // Use Node's parseArgs with strict: false to allow unknown flags through
  let values: Record<string, unknown>;
  let positionals: string[];

  try {
    const result = parseArgs({
      args: argv.slice(2), // skip node and script path
      options: {
        // claude-sr specific
        help: { type: "boolean", short: "h", default: false },
        version: { type: "boolean", short: "v", default: false },
        raw: { type: "boolean", default: false },
        quiet: { type: "boolean", default: false },

        // Session management
        continue: { type: "boolean", short: "c", default: false },
        resume: { type: "string", short: "r" },

        // Passthrough string flags
        model: { type: "string", short: "m" },
        allowedTools: { type: "string" },
        disallowedTools: { type: "string" },
        "permission-mode": { type: "string" },
        "system-prompt": { type: "string" },
        "system-prompt-file": { type: "string" },
        "append-system-prompt": { type: "string" },
        "mcp-config": { type: "string" },
        "max-turns": { type: "string" },
        "add-dir": { type: "string" },
        agents: { type: "string" },
        tools: { type: "string" },
        "fallback-model": { type: "string" },
        "setting-sources": { type: "string" },
        settings: { type: "string" },
        "json-schema": { type: "string" },

        // Passthrough boolean flags
        verbose: { type: "boolean", default: false },
        "dangerously-skip-permissions": { type: "boolean", default: false },
        debug: { type: "boolean", default: false },
      },
      allowPositionals: true,
      strict: false,
    });
    values = result.values as Record<string, unknown>;
    positionals = result.positionals;
  } catch {
    // If parsing fails, fall back to manual extraction
    values = {};
    positionals = [];
    const args = argv.slice(2);
    for (let i = 0; i < args.length; i++) {
      const arg = args[i]!;
      if (arg === "-h" || arg === "--help") values.help = true;
      else if (arg === "-v" || arg === "--version") values.version = true;
      else if (!arg.startsWith("-")) positionals.push(arg);
    }
  }

  // Build passthrough args for claude
  const passthroughArgs: string[] = [];

  // String flags
  const stringFlags: Array<[string, string | undefined]> = [
    ["--model", values.model as string | undefined],
    ["--allowedTools", values.allowedTools as string | undefined],
    ["--disallowedTools", values.disallowedTools as string | undefined],
    ["--permission-mode", values["permission-mode"] as string | undefined],
    ["--system-prompt", values["system-prompt"] as string | undefined],
    ["--system-prompt-file", values["system-prompt-file"] as string | undefined],
    ["--append-system-prompt", values["append-system-prompt"] as string | undefined],
    ["--mcp-config", values["mcp-config"] as string | undefined],
    ["--max-turns", values["max-turns"] as string | undefined],
    ["--add-dir", values["add-dir"] as string | undefined],
    ["--agents", values.agents as string | undefined],
    ["--tools", values.tools as string | undefined],
    ["--fallback-model", values["fallback-model"] as string | undefined],
    ["--setting-sources", values["setting-sources"] as string | undefined],
    ["--settings", values.settings as string | undefined],
    ["--json-schema", values["json-schema"] as string | undefined],
  ];

  for (const [flag, value] of stringFlags) {
    if (value !== undefined) {
      passthroughArgs.push(flag, value);
    }
  }

  // Boolean flags
  if (values.verbose) passthroughArgs.push("--verbose");
  if (values["dangerously-skip-permissions"]) passthroughArgs.push("--dangerously-skip-permissions");
  if (values.debug) passthroughArgs.push("--debug");

  // Determine prompt: either from positionals or -p flag usage
  let prompt: string | null = null;
  if (positionals.length > 0) {
    prompt = positionals.join(" ");
  }

  return {
    help: values.help as boolean ?? false,
    version: values.version as boolean ?? false,
    raw: values.raw as boolean ?? false,
    quiet: values.quiet as boolean ?? false,
    prompt,
    continueSession: values.continue as boolean ?? false,
    resumeId: values.resume as string | undefined ?? null,
    passthroughArgs,
  };
}

// --- Main ---

async function main(): Promise<void> {
  const args = parseCliArgs(process.argv);

  // Initialize the speech formatter if not already loaded synchronously (bundled builds)
  await initFormatter();

  // Handle --help
  if (args.help) {
    process.stdout.write(HELP_TEXT);
    process.exit(0);
  }

  // Handle --version
  if (args.version) {
    process.stdout.write(`claude-accessible v${VERSION}\n`);
    process.exit(0);
  }

  // Check claude is installed
  if (!checkClaudeInstalled()) {
    process.stderr.write(
      "[Error] Claude Code CLI not found.\n" +
      "\n" +
      "claude-accessible requires the Claude Code CLI to be installed and authenticated.\n" +
      "Install it from: https://docs.anthropic.com/en/docs/claude-code/overview\n" +
      "\n" +
      "After installing, run: claude login\n"
    );
    process.exit(1);
  }

  if (args.raw) {
    setPassthroughMode(true);
  }
  if (args.quiet) {
    setQuietMode(true);
  }

  // Determine mode: one-shot or REPL
  const isOneShot = args.prompt !== null || !process.stdin.isTTY;

  if (isOneShot) {
    // One-shot mode
    const claudeArgs = [...args.passthroughArgs];

    // Add session flags
    if (args.continueSession) claudeArgs.push("--continue");
    if (args.resumeId) claudeArgs.push("--resume", args.resumeId);

    // Add prompt
    if (args.prompt) {
      claudeArgs.push("-p", args.prompt);
    } else {
      // Reading from piped stdin — collect all input first
      const chunks: Buffer[] = [];
      for await (const chunk of process.stdin) {
        chunks.push(chunk as Buffer);
      }
      const input = sanitize(Buffer.concat(chunks).toString("utf-8")).trim();
      if (!input) {
        process.stderr.write("[Error] No input provided.\n");
        process.exit(1);
      }
      claudeArgs.push("-p", input);
    }

    const exitCode = await runOneShot(claudeArgs);
    process.exitCode = exitCode;
  } else {
    // REPL mode
    const baseArgs = [...args.passthroughArgs];

    await startRepl(baseArgs, args.resumeId ?? undefined);
  }
}

// Run
main().catch((err: Error) => {
  process.stderr.write(`[Error] ${err.message}\n`);
  process.exit(1);
});
