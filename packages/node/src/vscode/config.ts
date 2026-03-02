/**
 * Extension configuration management.
 *
 * Translates VS Code settings into format options so the core
 * library, VS Code extension, and Chrome extension all use the same
 * announcement phrasing system.
 */

import * as vscode from "vscode";
import type { VerbosityLevel } from "../core/index.js";

export interface AccessibleAIConfig {
  enabled: boolean;
  autoActivate: boolean;
  verbosity: VerbosityLevel;
  announceToolUse: boolean;
  announceMode: "notification" | "output" | "both";
  codeBlockAnnouncement: "language" | "language-and-lines" | "minimal";
  outputToChannel: boolean;
  backend: "language-model-api" | "claude-cli" | "auto";
  claudeCliPath: string;
}

export function getConfig(): AccessibleAIConfig {
  const config = vscode.workspace.getConfiguration("claude-a11y");
  return {
    enabled: config.get("enabled", true),
    autoActivate: config.get("autoActivate", true),
    verbosity: config.get<VerbosityLevel>("verbosity", "normal"),
    announceToolUse: config.get("announceToolUse", true),
    announceMode: config.get("announceMode", "output"),
    codeBlockAnnouncement: config.get("codeBlockAnnouncement", "language"),
    outputToChannel: config.get("outputToChannel", true),
    backend: config.get("backend", "auto"),
    claudeCliPath: config.get("claudeCliPath", ""),
  };
}

/**
 * Translate VS Code settings into format options for the core library.
 */
export function getSpeechFormatOptions(): Record<string, string> {
  const config = getConfig();
  const opts: Record<string, string> = {};

  switch (config.codeBlockAnnouncement) {
    case "minimal":
      opts.codeBlockStart = "[Code]";
      opts.codeBlockEnd = "[End Code]";
      opts.codeBlockDefault = "Code";
      break;
    case "language-and-lines":
      opts.codeBlockStart = "[{lang}]";
      opts.codeBlockEnd = "[End {lang}]";
      break;
    case "language":
    default:
      break;
  }

  return opts;
}

export function onConfigChanged(
  callback: (config: AccessibleAIConfig) => void
): vscode.Disposable {
  return vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration("claude-a11y")) {
      callback(getConfig());
    }
  });
}
