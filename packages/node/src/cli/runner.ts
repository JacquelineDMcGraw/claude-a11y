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
} from "../core/index.js";
import type { ParsedEvent, ParsedResultEvent } from "../core/index.js";

let passthroughMode = false;

export function setPassthroughMode(enabled: boolean): void {
  passthroughMode = enabled;
}

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
  const cmd = claudePath.endsWith(".js") ? process.execPath : claudePath;
  const args = claudePath.endsWith(".js") ? [claudePath, "--version"] : ["--version"];
  try {
    execFileSync(cmd, args, {
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
  const cmd = claudePath.endsWith(".js") ? process.execPath : claudePath;
  const args = claudePath.endsWith(".js") ? [claudePath, "--version"] : ["--version"];
  try {
    const output = execFileSync(cmd, args, {
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
 * Supports .js CLAUDE_PATH for cross-platform testing.
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

  // When CLAUDE_PATH points to a .js file, spawn it via node for Windows compat
  const cmd = claudePath.endsWith(".js") ? process.execPath : claudePath;
  const spawnArgs = claudePath.endsWith(".js") ? [claudePath, ...args] : args;

  return spawn(cmd, spawnArgs, {
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

  const stdoutChunks: string[] = [];

  return new Promise<number>((resolve) => {
    child.stdout?.on("data", (chunk: Buffer) => {
      const clean = stdoutSanitizer.push(chunk.toString("utf-8"));
      if (clean) {
        if (passthroughMode) {
          process.stdout.write(clean);
        } else {
          stdoutChunks.push(clean);
        }
      }
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      const clean = stderrSanitizer.push(chunk.toString("utf-8"));
      if (clean) process.stderr.write(clean);
    });

    child.on("close", (code) => {
      process.removeListener("SIGINT", sigintHandler);

      const stdoutFlush = stdoutSanitizer.flush();
      if (stdoutFlush) {
        if (passthroughMode) {
          process.stdout.write(stdoutFlush);
        } else {
          stdoutChunks.push(stdoutFlush);
        }
      }

      const stderrFlush = stderrSanitizer.flush();
      if (stderrFlush) process.stderr.write(stderrFlush);

      if (!passthroughMode) {
        const fullText = stdoutChunks.join("");
        const speechText = formatForSpeech(fullText);
        if (speechText) {
          const out = speechText.endsWith("\n") ? speechText : speechText + "\n";
          process.stdout.write(out);
        }
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
  let receivedFirstText = false;

  // Heartbeat: write "[still responding...]" to stderr every 8s of no output
  const HEARTBEAT_MS = 8000;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  function resetHeartbeat(): void {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(() => {
      process.stderr.write("[still responding...]\n");
    }, HEARTBEAT_MS);
  }

  function stopHeartbeat(): void {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  }

  let paragraphBuffer = "";

  function emitParagraphs(text: string): void {
    if (!receivedFirstText) {
      receivedFirstText = true;
      process.stderr.write("Response:\n");
    }
    resetHeartbeat();

    paragraphBuffer += text;
    const parts = paragraphBuffer.split(/\n\n/);
    if (parts.length <= 1) return;

    const incomplete = parts.pop()!;
    const fenceCount = (paragraphBuffer.match(/```/g) || []).length;
    if (fenceCount % 2 !== 0) return;

    for (const para of parts) {
      if (para.trim()) {
        const formatted = passthroughMode ? para : formatForSpeech(para);
        process.stdout.write(formatted + "\n\n");
      }
    }
    paragraphBuffer = incomplete;
  }

  function processEvent(event: ParsedEvent): void {
    switch (event.type) {
      case "init":
        sessionId = event.sessionId;
        break;

      case "text":
      case "text_delta": {
        const clean = textSanitizer.push(event.text);
        if (clean) emitParagraphs(clean);
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
    // Start heartbeat after spawn succeeds (inside the promise, not before)
    process.stderr.write("Responding...\n");
    resetHeartbeat();

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
      stopHeartbeat();

      const remaining = streamParser.flush();
      for (const event of remaining) {
        processEvent(event);
      }

      // Flush remaining text into paragraph buffer
      const textFlush = textSanitizer.flush();
      if (textFlush) emitParagraphs(textFlush);

      // Flush any remaining paragraph content
      if (paragraphBuffer.trim()) {
        const formatted = passthroughMode ? paragraphBuffer : formatForSpeech(paragraphBuffer);
        process.stdout.write(formatted);
      }

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
      stopHeartbeat();
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
