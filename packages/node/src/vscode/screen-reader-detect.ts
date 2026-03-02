/**
 * Screen reader detection utilities.
 *
 * Checks multiple signals to detect screen reader presence:
 * 1. VS Code's editor.accessibilitySupport setting (primary)
 * 2. Environment variables set by common screen readers
 * 3. Platform-specific heuristics
 *
 * In "auto" mode, combines VS Code's native detection with env-var
 * checks for NVDA, JAWS, VoiceOver hints, and Orca.
 */

import * as vscode from "vscode";

const SCREEN_READER_ENV_VARS = [
  "NVDA_LOG",
  "NVDA",
  "JAWS_TRACE",
  "JAWS_HOME",
  "ORCA_VERSION",
  "GTK_MODULES",           // Orca sets this to "gail:atk-bridge"
  "ACCESSIBILITY_ENABLED",
  "QT_ACCESSIBILITY",
  "QT_LINUX_ACCESSIBILITY_ALWAYS_ON",
];

function hasScreenReaderEnvHints(): boolean {
  for (const envVar of SCREEN_READER_ENV_VARS) {
    const val = process.env[envVar];
    if (val !== undefined && val !== "" && val !== "0") {
      return true;
    }
  }

  // Orca typically adds "gail:atk-bridge" to GTK_MODULES
  const gtkModules = process.env["GTK_MODULES"] ?? "";
  if (gtkModules.includes("atk-bridge")) {
    return true;
  }

  return false;
}

export function getDetectedScreenReader(): string | null {
  if (process.env["JAWS_TRACE"] || process.env["JAWS_HOME"]) return "JAWS";
  if (process.env["NVDA_LOG"] || process.env["NVDA"]) return "NVDA";
  if (process.env["ORCA_VERSION"]) return "Orca";
  const gtkModules = process.env["GTK_MODULES"] ?? "";
  if (gtkModules.includes("atk-bridge")) return "Orca";
  return null;
}

export function isScreenReaderActive(): boolean {
  const config = vscode.workspace.getConfiguration("editor");
  const support = config.get<string>("accessibilitySupport", "auto");

  if (support === "on") return true;
  if (support === "off") return false;

  // In "auto" mode, only activate if we have concrete evidence
  // a screen reader is running. Returning true by default would
  // rewrite all AI output for sighted users who never asked for it.
  return hasScreenReaderEnvHints();
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
