/**
 * @accessible chat participant.
 *
 * A first-class chat participant that provides speech-formatted AI responses.
 * Users type "@accessible explain this code" in the VS Code chat panel.
 *
 * All responses are piped through the remark-based speech formatter before
 * being displayed, so screen readers hear structural cues instead of
 * raw markdown syntax.
 */

import * as vscode from "vscode";
import { formatForSpeech, createVerbosityFilter } from "../../core/index.js";
import type { VerbosityLevel } from "../../core/index.js";
import { selectBackend } from "./claude-backend.js";
import { ParagraphBuffer } from "./response-formatter.js";
import { getConfig } from "../config.js";
import {
  writeResponse,
  getOutputChannel,
} from "../output/output-channel.js";

interface AccessibleChatResult extends vscode.ChatResult {
  metadata: {
    responseText: string;
  };
}

let lastResponseText = "";

export function getLastChatResponse(): string {
  return lastResponseText;
}

async function handleRequest(
  request: vscode.ChatRequest,
  context: vscode.ChatContext,
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken
): Promise<AccessibleChatResult> {
  const config = getConfig();

  // Handle slash commands
  if (request.command === "format") {
    return handleFormatCommand(request, stream);
  }
  if (request.command === "verbosity") {
    return handleVerbosityCommand(request, stream);
  }

  // Select backend and send request
  const backend = selectBackend();
  stream.progress(`Using ${backend.name}...`);

  const buffer = new ParagraphBuffer(config.verbosity);
  const fullChunks: string[] = [];

  try {
    for await (const chunk of backend.sendRequest(request.prompt, token)) {
      fullChunks.push(chunk);

      // Emit completed paragraphs as they become available
      const ready = buffer.append(chunk);
      for (const formatted of ready) {
        stream.markdown(formatted + "\n\n");
      }
    }

    // Flush remaining buffered content
    const remaining = buffer.flush();
    if (remaining) {
      stream.markdown(remaining);
    }
  } catch (err) {
    if (token.isCancellationRequested) {
      stream.markdown("*Request cancelled.*");
    } else {
      const message = err instanceof Error ? err.message : String(err);
      stream.markdown(`[Error] ${message}`);
    }
  }

  // Store full response for "Read Last Response" command
  const rawText = fullChunks.join("");
  const filter = createVerbosityFilter(config.verbosity);
  lastResponseText = filter.format(rawText);

  // Mirror to output channel
  if (config.outputToChannel) {
    writeResponse(rawText);
  }

  return {
    metadata: { responseText: lastResponseText },
  };
}

async function handleFormatCommand(
  request: vscode.ChatRequest,
  stream: vscode.ChatResponseStream
): Promise<AccessibleChatResult> {
  const text = request.prompt.trim();
  if (!text) {
    stream.markdown(
      "Paste or type markdown text after `/format` to convert it for screen readers."
    );
    return { metadata: { responseText: "" } };
  }

  const formatted = formatForSpeech(text);
  stream.markdown(formatted);
  lastResponseText = formatted;

  return { metadata: { responseText: formatted } };
}

async function handleVerbosityCommand(
  request: vscode.ChatRequest,
  stream: vscode.ChatResponseStream
): Promise<AccessibleChatResult> {
  const level = request.prompt.trim().toLowerCase();

  if (level === "minimal" || level === "normal" || level === "detailed") {
    const config = vscode.workspace.getConfiguration("claude-a11y");
    await config.update("verbosity", level, vscode.ConfigurationTarget.Global);
    stream.markdown(`Verbosity set to **${level}**.`);
  } else {
    stream.markdown(
      "Set verbosity with: `/verbosity minimal`, `/verbosity normal`, or `/verbosity detailed`.\n\n" +
        "- **minimal**: Code blocks and headings only\n" +
        "- **normal**: Default — code, headings, lists, links, tables\n" +
        "- **detailed**: Everything plus line counts and table dimensions"
    );
  }

  return { metadata: { responseText: "" } };
}

export function registerChatParticipant(
  context: vscode.ExtensionContext
): void {
  // Guard: chat API may not be available (e.g., in Cursor)
  if (!vscode.chat || !vscode.chat.createChatParticipant) {
    return;
  }

  const participant = vscode.chat.createChatParticipant(
    "claude-a11y.accessible",
    handleRequest
  );

  participant.iconPath = new vscode.ThemeIcon("accessibility");

  // Provide follow-up suggestions
  participant.followupProvider = {
    provideFollowups(
      result: AccessibleChatResult,
      _context: vscode.ChatContext,
      _token: vscode.CancellationToken
    ) {
      const followups: vscode.ChatFollowup[] = [];

      if (result.metadata.responseText) {
        followups.push({
          prompt: "explain the code in the previous response in more detail",
          label: "Explain more",
          command: "explain",
        });
      }

      return followups;
    },
  };

  context.subscriptions.push(participant);
}
