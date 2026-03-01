/**
 * Process spawning and lifecycle management for the Claude CLI subprocess.
 *
 * Spawns `claude` as a child process with sanitized environment variables,
 * streams output through the parser and sanitizer, and handles signals.
 */

import { spawn, type ChildProcess } from "node:child_process";
import {
  createStreamParser,
  createChunkSanitizer,
  sanitize,
  announceToolUse,
  announceResult,
  announceError,
  writeAnnouncement,
  formatForSpeech,
} from "@claude-accessible/core";
import type { ParsedEvent, ParsedResultEvent } from "@claude-accessible/core";

export interface RunResult {
  sessionId: string | null;
  cost: number;
  turns: number;
  exitCode: number;
  isError: boolean;
  errors: string[];
}

/**
 * Check if the `claude` CLI is available on PATH.
 */
export function checkClaudeInstalled(): boolean {
  const { execFileSync } = require("node:child_process") as typeof import("node:child_process");
  const claudePath = process.env.CLAUDE_PATH ?? "claude";
  try {
    execFileSync(claudePath, ["--version"], {
      stdio: "pipe",
      timeout: 10000,
      env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the claude CLI version string.
 */
export function getClaudeVersion(): string {
  const { execFileSync } = require("node:child_process") as typeof import("node:child_process");
  const claudePath = process.env.CLAUDE_PATH ?? "claude";
  try {
    const output = execFileSync(claudePath, ["--version"], {
      stdio: "pipe",
      timeout: 10000,
      env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
    });
    return sanitize(output.toString("utf-8")).trim();
  } catch {
    return "unknown";
  }
}

/**
 * Spawn the claude CLI with the given arguments.
 * Sets environment variables to suppress color/ANSI at the source.
 */
function spawnClaude(args: string[]): ChildProcess {
  const claudePath = process.env.CLAUDE_PATH ?? "claude";

  const env: Record<string, string> = {};
  for (const [key, val] of Object.entries(process.env)) {
    if (val !== undefined) env[key] = val;
  }
  env.NO_COLOR = "1";
  env.FORCE_COLOR = "0";
  env.TERM = "dumb";

  return spawn(claudePath, args, {
    env,
    stdio: ["pipe", "pipe", "pipe"],
    cwd: process.cwd(),
  });
}

/**
 * Run claude in one-shot mode with plain text output.
 * Sanitizes all output and writes directly to stdout/stderr.
 * Returns the exit code.
 */
export async function runOneShot(args: string[]): Promise<number> {
  const fullArgs = [...args];

  // If no --output-format specified, default to text for one-shot
  if (!fullArgs.includes("--output-format")) {
    fullArgs.push("--output-format", "text");
  }

  const child = spawnClaude(fullArgs);
  const stdoutSanitizer = createChunkSanitizer();
  const stderrSanitizer = createChunkSanitizer();

  // Close stdin so claude knows no more input is coming
  child.stdin?.end();

  // Handle Ctrl+C
  const sigintHandler = () => {
    child.kill("SIGINT");
    setTimeout(() => {
      if (!child.killed) child.kill("SIGTERM");
    }, 2000);
  };
  process.on("SIGINT", sigintHandler);

  // Buffer stdout so we can apply speech formatting on the complete text
  const stdoutChunks: string[] = [];

  return new Promise<number>((resolve) => {
    child.stdout?.on("data", (chunk: Buffer) => {
      const clean = stdoutSanitizer.push(chunk.toString("utf-8"));
      if (clean) stdoutChunks.push(clean);
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      const clean = stderrSanitizer.push(chunk.toString("utf-8"));
      if (clean) process.stderr.write(clean);
    });

    child.on("close", (code) => {
      process.removeListener("SIGINT", sigintHandler);

      // Flush remaining buffers
      const stdoutFlush = stdoutSanitizer.flush();
      if (stdoutFlush) stdoutChunks.push(stdoutFlush);

      const stderrFlush = stderrSanitizer.flush();
      if (stderrFlush) process.stderr.write(stderrFlush);

      // Apply speech formatting to the complete sanitized output
      const fullText = stdoutChunks.join("");
      const speechText = formatForSpeech(fullText);
      if (speechText) {
        // Ensure output ends with a newline so the shell prompt starts clean
        const out = speechText.endsWith("\n") ? speechText : speechText + "\n";
        process.stdout.write(out);
      }

      resolve(code ?? 1);
    });

    child.on("error", (err) => {
      process.removeListener("SIGINT", sigintHandler);
      process.stderr.write(`[Error] Failed to spawn claude: ${err.message}\n`);
      resolve(1);
    });
  });
}

/**
 * Run claude with stream-json output, parse the stream, announce tools,
 * and write sanitized text to stdout. Used by the REPL for each turn.
 */
export async function runStreaming(args: string[]): Promise<RunResult> {
  const fullArgs = [...args];

  // Ensure stream-json output format
  const fmtIdx = fullArgs.indexOf("--output-format");
  if (fmtIdx !== -1) {
    fullArgs[fmtIdx + 1] = "stream-json";
  } else {
    fullArgs.push("--output-format", "stream-json");
  }

  // Ensure verbose for structured output
  if (!fullArgs.includes("--verbose")) {
    fullArgs.push("--verbose");
  }

  const child = spawnClaude(fullArgs);

  // Close stdin so claude knows no more input is coming
  child.stdin?.end();

  const streamParser = createStreamParser();
  const textSanitizer = createChunkSanitizer();
  const stderrSanitizer = createChunkSanitizer();
  const suppressAnnouncements = process.env.CLAUDE_SR_ANNOUNCE === "0";

  let sessionId: string | null = null;
  let cost = 0;
  let turns = 0;
  let isError = false;
  let errors: string[] = [];
  let cancelled = false;

  // Buffer text chunks so we can apply speech formatting on the complete response
  const textChunks: string[] = [];

  function processEvent(event: ParsedEvent): void {
    switch (event.type) {
      case "init":
        sessionId = event.sessionId;
        break;

      case "text":
      case "text_delta": {
        const clean = textSanitizer.push(event.text);
        if (clean) textChunks.push(clean);
        break;
      }

      case "tool_use":
        if (!suppressAnnouncements) {
          writeAnnouncement(announceToolUse(event));
        }
        break;

      case "tool_result":
        // Tool results are internal — don't print to stdout
        break;

      case "result": {
        const resultEvent = event as ParsedResultEvent;
        sessionId = resultEvent.sessionId || sessionId;
        cost = resultEvent.cost;
        turns = resultEvent.turns;
        isError = resultEvent.isError;
        errors = resultEvent.errors;
        break;
      }
    }
  }

  // Handle Ctrl+C
  const sigintHandler = () => {
    cancelled = true;
    child.kill("SIGINT");
    setTimeout(() => {
      if (!child.killed) child.kill("SIGTERM");
    }, 2000);
  };
  process.on("SIGINT", sigintHandler);

  return new Promise<RunResult>((resolve) => {
    child.stdout?.on("data", (chunk: Buffer) => {
      const events = streamParser.feed(chunk.toString("utf-8"));
      for (const event of events) {
        processEvent(event);
      }
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      const clean = stderrSanitizer.push(chunk.toString("utf-8"));
      if (clean) process.stderr.write(clean);
    });

    child.on("close", (code) => {
      process.removeListener("SIGINT", sigintHandler);

      // Flush remaining parser data
      const remaining = streamParser.flush();
      for (const event of remaining) {
        processEvent(event);
      }

      // Flush text sanitizer into our buffer
      const textFlush = textSanitizer.flush();
      if (textFlush) textChunks.push(textFlush);

      // Apply speech formatting to the complete buffered response
      const fullText = textChunks.join("");
      const speechText = formatForSpeech(fullText);
      if (speechText) process.stdout.write(speechText);

      // Flush stderr sanitizer
      const stderrFlush = stderrSanitizer.flush();
      if (stderrFlush) process.stderr.write(stderrFlush);

      // Ensure stdout ends with newline
      process.stdout.write("\n");

      if (cancelled) {
        process.stderr.write("[Cancelled]\n");
      }

      resolve({
        sessionId,
        cost,
        turns,
        exitCode: code ?? 1,
        isError: isError || (code !== 0 && code !== null),
        errors,
      });
    });

    child.on("error", (err) => {
      process.removeListener("SIGINT", sigintHandler);
      process.stderr.write(`[Error] Failed to spawn claude: ${err.message}\n`);
      resolve({
        sessionId,
        cost,
        turns,
        exitCode: 1,
        isError: true,
        errors: [err.message],
      });
    });
  });
}
