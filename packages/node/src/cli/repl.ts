/**
 * Conversational REPL loop for multi-turn Claude sessions.
 *
 * Uses readline for input, spawns claude -p for each turn, and maintains
 * session context via --resume. All output is sanitized for screen readers.
 *
 * Key design decisions:
 * - readline prompt goes to stderr (not stdout) so piping captures only responses
 * - stdout is exclusively for Claude's sanitized response text
 * - stderr is for prompts, tool announcements, thinking indicators, errors
 */

import * as readline from "node:readline";
import { runStreaming, getClaudeVersion } from "./runner.js";
import {
  createSessionState,
  updateSessionId,
  updateFromResult,
  resetSession,
  type SessionState,
} from "./session.js";
import { announceResult, announceError, writeAnnouncement } from "../core/index.js";
import type { ParsedResultEvent } from "../core/index.js";

// package.json version — injected at build time or read dynamically
function getOwnVersion(): string {
  try {
    const pkgPath = require.resolve("../package.json");
    const pkg = require(pkgPath) as { version: string };
    return pkg.version;
  } catch {
    return "unknown";
  }
}

const HELP_TEXT = `
Claude Code (Screen Reader Mode) — REPL Commands

  /help          Show this help
  /new           Start new session
  /session       Show current session ID
  /cost          Show accumulated cost
  /version       Show version info
  /compact       Compact conversation context
  /clear         Clear screen
  /exit          Exit (also: /quit, Ctrl+D)

Type any message and press Enter to send it to Claude.
All other /commands are passed through to Claude.
`.trimStart();

/**
 * Handle a REPL command. Returns true if the REPL should continue,
 * false if it should exit.
 */
async function handleCommand(
  input: string,
  state: SessionState,
  baseArgs: string[]
): Promise<boolean> {
  const cmd = input.split(/\s+/)[0]!.toLowerCase();

  switch (cmd) {
    case "/exit":
    case "/quit":
      return false;

    case "/help":
      process.stderr.write(HELP_TEXT);
      return true;

    case "/new":
      resetSession(state);
      process.stderr.write("Started new session.\n");
      return true;

    case "/session":
      if (state.sessionId) {
        process.stderr.write(`Session ID: ${state.sessionId}\n`);
      } else {
        process.stderr.write("No active session.\n");
      }
      return true;

    case "/cost":
      process.stderr.write(
        `Total cost: $${state.totalCost.toFixed(4)} across ${state.totalTurns} turn${state.totalTurns !== 1 ? "s" : ""}\n`
      );
      return true;

    case "/version": {
      const ownVersion = getOwnVersion();
      const claudeVersion = getClaudeVersion();
      process.stderr.write(`claude-accessible v${ownVersion}\n`);
      process.stderr.write(`Claude Code: ${claudeVersion}\n`);
      return true;
    }

    case "/clear":
      // Emit enough newlines to push content off screen
      // Screen readers handle this fine — they just see new blank lines
      process.stderr.write("\n".repeat(50));
      return true;

    case "/compact": {
      // Pass /compact through to Claude as a message
      await runTurn("/compact", state, baseArgs);
      return true;
    }

    default:
      // Unknown slash command — pass through to Claude verbatim
      await runTurn(input, state, baseArgs);
      return true;
  }
}

/**
 * Execute a single turn: spawn claude, stream output, update session.
 */
async function runTurn(
  message: string,
  state: SessionState,
  baseArgs: string[]
): Promise<void> {
  const args = [...baseArgs];

  // Add session management
  if (state.sessionId) {
    args.push("--resume", state.sessionId);
  }

  // Add the prompt
  args.push("-p", message);

  // Show thinking indicator
  process.stderr.write("Thinking...\n");

  // Run and stream
  const result = await runStreaming(args);

  // Update session state
  if (result.sessionId) {
    updateSessionId(state, result.sessionId);
  }
  updateFromResult(state, result.cost, result.turns);

  // Announce completion
  const resultEvent: ParsedResultEvent = {
    type: "result",
    sessionId: result.sessionId ?? "",
    cost: result.cost,
    turns: result.turns,
    isError: result.isError,
    errors: result.errors,
  };

  if (result.isError) {
    writeAnnouncement(announceError(resultEvent));
  } else {
    writeAnnouncement(announceResult(resultEvent));
  }
}

/**
 * Start the conversational REPL.
 */
export async function startRepl(
  baseArgs: string[],
  initialSessionId?: string
): Promise<void> {
  const state = createSessionState(initialSessionId);
  const prompt = process.env.CLAUDE_SR_PROMPT ?? "> ";

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stderr, // Prompt goes to stderr so stdout stays clean
    prompt,
    terminal: process.stdin.isTTY ?? false,
  });

  // Welcome message
  process.stderr.write("Claude Code (Screen Reader Mode)\n");
  process.stderr.write(
    "Type a message and press Enter. Type /help for commands, /exit to quit.\n\n"
  );

  rl.prompt();

  // Handle each line of input
  rl.on("line", async (line: string) => {
    const input = line.trim();

    if (!input) {
      rl.prompt();
      return;
    }

    // Handle REPL commands
    if (input.startsWith("/")) {
      const shouldContinue = await handleCommand(input, state, baseArgs);
      if (!shouldContinue) {
        rl.close();
        return;
      }
      process.stderr.write("\n");
      rl.prompt();
      return;
    }

    // Regular message — send to Claude
    await runTurn(input, state, baseArgs);
    process.stderr.write("\n");
    rl.prompt();
  });

  // Handle Ctrl+D (EOF)
  rl.on("close", () => {
    process.stderr.write("Goodbye.\n");
    process.exit(0);
  });

  // Handle SIGINT (Ctrl+C) in the REPL itself
  rl.on("SIGINT", () => {
    // If we're at the prompt, just show a new prompt
    process.stderr.write("\n");
    rl.prompt();
  });
}
