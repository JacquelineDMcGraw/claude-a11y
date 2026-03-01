/**
 * Extension configuration management.
 */

import * as vscode from "vscode";
import type { VerbosityLevel } from "@claude-accessible/core";

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
  const config = vscode.workspace.getConfiguration("claude-accessible");
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

export function onConfigChanged(
  callback: (config: AccessibleAIConfig) => void
): vscode.Disposable {
  return vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration("claude-accessible")) {
      callback(getConfig());
    }
  });
}
