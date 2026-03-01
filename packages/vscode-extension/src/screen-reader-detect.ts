/**
 * Screen reader detection utilities.
 *
 * Uses VS Code's editor.accessibilitySupport setting to detect whether
 * a screen reader is active. In "auto" mode, VS Code detects this via
 * platform accessibility APIs.
 */

import * as vscode from "vscode";

export function isScreenReaderActive(): boolean {
  const config = vscode.workspace.getConfiguration("editor");
  const support = config.get<string>("accessibilitySupport", "auto");

  // "on" = user explicitly enabled screen reader support
  // "off" = explicitly disabled
  // "auto" = VS Code auto-detects via platform APIs
  if (support === "on") return true;
  if (support === "off") return false;

  // In "auto" mode, we assume active on Desktop (VS Code handles detection)
  return true;
}

export function onScreenReaderStateChanged(
  callback: (active: boolean) => void
): vscode.Disposable {
  return vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration("editor.accessibilitySupport")) {
      callback(isScreenReaderActive());
    }
  });
}
