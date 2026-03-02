/**
 * Status bar item showing accessibility state.
 */

import * as vscode from "vscode";
import { getConfig } from "../config.js";

let statusItem: vscode.StatusBarItem | null = null;

export function registerStatusBar(context: vscode.ExtensionContext): void {
  statusItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );

  updateStatusBar();
  statusItem.show();

  context.subscriptions.push(statusItem);
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("claude-accessible")) {
        updateStatusBar();
      }
    })
  );
}

function updateStatusBar(): void {
  if (!statusItem) return;

  const config = getConfig();

  if (config.enabled) {
    statusItem.text = `$(accessibility) A11y: ${capitalize(config.verbosity)}`;
    statusItem.tooltip = `Accessible AI formatting active (${config.verbosity} verbosity). Click to change.`;
  } else {
    statusItem.text = "$(accessibility) A11y: Off";
    statusItem.tooltip = "Accessible AI formatting is disabled. Click to enable.";
  }

  statusItem.command = "claude-accessible.setVerbosity";
  statusItem.accessibilityInformation = {
    label: config.enabled
      ? `Accessible AI formatting is enabled at ${config.verbosity} verbosity`
      : "Accessible AI formatting is disabled",
    role: "status",
  };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
