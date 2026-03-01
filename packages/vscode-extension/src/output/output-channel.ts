/**
 * Accessible AI output channel.
 *
 * Output channels are natively accessible to screen readers — they're
 * plain text panels that screen readers can read sequentially. This is
 * the most reliable accessibility path: no ARIA, no webview, just text.
 */

import * as vscode from "vscode";
import { formatForSpeech, createVerbosityFilter } from "@claude-accessible/core";
import type { VerbosityLevel } from "@claude-accessible/core";
import { getConfig } from "../config.js";

let outputChannel: vscode.OutputChannel | null = null;
let lastResponse = "";

export function getOutputChannel(): vscode.OutputChannel {
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel("Accessible AI");
  }
  return outputChannel;
}

/**
 * Write a formatted AI response to the output channel.
 */
export function writeResponse(rawMarkdown: string): void {
  const config = getConfig();
  if (!config.outputToChannel) return;

  const channel = getOutputChannel();
  const filter = createVerbosityFilter(config.verbosity);
  const formatted = filter.format(rawMarkdown);

  channel.appendLine("---");
  channel.appendLine(formatted);
  channel.appendLine("");

  lastResponse = formatted;
}

/**
 * Write a tool activity announcement to the output channel.
 */
export function writeToolAnnouncement(text: string): void {
  const config = getConfig();
  if (!config.announceToolUse) return;

  const channel = getOutputChannel();

  if (config.announceMode === "output" || config.announceMode === "both") {
    channel.appendLine(text);
  }
  if (config.announceMode === "notification" || config.announceMode === "both") {
    vscode.window.showInformationMessage(text);
  }
}

/**
 * Get the last formatted response (for "Read Last Response" command).
 */
export function getLastResponse(): string {
  return lastResponse;
}

/**
 * Format arbitrary text for speech and write to the output channel.
 */
export function formatAndWrite(text: string): void {
  const channel = getOutputChannel();
  const formatted = formatForSpeech(text);
  channel.appendLine(formatted);
  channel.show(true); // true = preserve focus
  lastResponse = formatted;
}

export function registerOutputChannel(
  context: vscode.ExtensionContext
): vscode.OutputChannel {
  const channel = getOutputChannel();
  context.subscriptions.push(channel);
  return channel;
}
