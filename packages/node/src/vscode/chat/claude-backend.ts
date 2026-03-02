/**
 * AI backends for the @accessible chat participant.
 *
 * Two backends:
 * 1. Language Model API — uses VS Code's built-in LM API (Copilot, etc.)
 * 2. Claude CLI — spawns `claude -p` as a subprocess
 *
 * Auto mode tries Language Model API first, falls back to CLI.
 */

import * as vscode from "vscode";
import { spawn } from "node:child_process";
import {
  createStreamParser,
  createChunkSanitizer,
  announceToolUse,
} from "../../core/index.js";
import type { ParsedEvent } from "../../core/index.js";
import { getConfig } from "../config.js";
import { writeToolAnnouncement } from "../output/output-channel.js";

export interface AIBackend {
  readonly name: string;
  readonly available: boolean;
  sendRequest(
    prompt: string,
    token: vscode.CancellationToken
  ): AsyncIterable<string>;
}

// ---------------------------------------------------------------------------
// Backend 1: VS Code Language Model API
// ---------------------------------------------------------------------------

export class LanguageModelBackend implements AIBackend {
  readonly name = "Language Model API";

  get available(): boolean {
    return typeof vscode.lm !== "undefined" && typeof vscode.lm.selectChatModels === "function";
  }

  async *sendRequest(
    prompt: string,
    token: vscode.CancellationToken
  ): AsyncIterable<string> {
    // Try to find a model — prefer Claude, accept anything
    let models = await vscode.lm.selectChatModels({ family: "claude-3.5-sonnet" });
    if (models.length === 0) {
      models = await vscode.lm.selectChatModels({});
    }
    if (models.length === 0) {
      throw new Error(
        "No language models available. Install GitHub Copilot or another LM extension."
      );
    }

    const model = models[0]!;
    const messages = [vscode.LanguageModelChatMessage.User(prompt)];

    const response = await model.sendRequest(messages, {}, token);

    for await (const fragment of response.text) {
      yield fragment;
    }
  }
}

// ---------------------------------------------------------------------------
// Backend 2: Claude CLI subprocess
// ---------------------------------------------------------------------------

export class ClaudeCliBackend implements AIBackend {
  readonly name = "Claude CLI";

  get available(): boolean {
    const config = getConfig();
    const claudePath = config.claudeCliPath || "claude";
    try {
      const result = spawn(claudePath, ["--version"], {
        stdio: "pipe",
        timeout: 5000,
      });
      result.kill();
      return true;
    } catch {
      return false;
    }
  }

  async *sendRequest(
    prompt: string,
    token: vscode.CancellationToken
  ): AsyncIterable<string> {
    const config = getConfig();
    const claudePath = config.claudeCliPath || "claude";

    const child = spawn(
      claudePath,
      ["-p", prompt, "--output-format", "stream-json", "--verbose"],
      {
        env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0", TERM: "dumb" },
        stdio: ["pipe", "pipe", "pipe"],
      }
    );

    // Close stdin immediately
    child.stdin?.end();

    // Handle cancellation
    token.onCancellationRequested(() => {
      child.kill("SIGINT");
    });

    const parser = createStreamParser();
    const sanitizer = createChunkSanitizer();

    // Process stdout as stream-json
    if (child.stdout) {
      for await (const chunk of child.stdout) {
        const raw = chunk.toString("utf-8");
        const events = parser.feed(raw);

        for (const event of events) {
          if (event.type === "text" || event.type === "text_delta") {
            const clean = sanitizer.push(event.text);
            if (clean) yield clean;
          }
          if (event.type === "tool_use" && config.announceToolUse) {
            writeToolAnnouncement(announceToolUse(event));
          }
        }
      }
    }

    // Flush sanitizer
    const remaining = sanitizer.flush();
    if (remaining) yield remaining;

    // Wait for process to exit
    await new Promise<void>((resolve) => {
      child.on("close", () => resolve());
    });
  }
}

// ---------------------------------------------------------------------------
// Backend selection
// ---------------------------------------------------------------------------

export function selectBackend(): AIBackend {
  const config = getConfig();

  const lmBackend = new LanguageModelBackend();
  const cliBackend = new ClaudeCliBackend();

  switch (config.backend) {
    case "language-model-api":
      return lmBackend;
    case "claude-cli":
      return cliBackend;
    case "auto":
    default:
      // Prefer Language Model API, fall back to CLI
      if (lmBackend.available) return lmBackend;
      return cliBackend;
  }
}
