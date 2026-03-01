/**
 * Accessible AI — VS Code extension entry point.
 *
 * Makes AI chat responses accessible to screen readers by transforming
 * markdown into speech-friendly output with structural announcements.
 *
 * Features:
 * - @accessible chat participant with speech-formatted responses
 * - Accessible AI output panel (webview with ARIA)
 * - Output channel for universal screen reader compatibility
 * - markdown-it plugin for accessible markdown preview
 * - Commands to format selected text for screen readers
 * - Auto-detection of screen reader + configurable verbosity
 */

import * as vscode from "vscode";
import { initFormatter, formatForSpeech } from "@claude-accessible/core";
import { getConfig, onConfigChanged } from "./config.js";
import {
  isScreenReaderActive,
  onScreenReaderStateChanged,
} from "./screen-reader-detect.js";
import { registerChatParticipant, getLastChatResponse } from "./chat/participant.js";
import { registerAccessiblePanel, getPanelProvider } from "./panel/accessible-panel.js";
import {
  registerOutputChannel,
  formatAndWrite,
  getLastResponse,
  getOutputChannel,
} from "./output/output-channel.js";
import { registerStatusBar } from "./inline/status-bar.js";
import { registerCodeAction } from "./inline/code-action.js";
import { extendMarkdownIt } from "./markdown/markdown-plugin.js";

export async function activate(
  context: vscode.ExtensionContext
): Promise<{ extendMarkdownIt: typeof extendMarkdownIt }> {
  // 1. Initialize the remark-based speech formatter
  await initFormatter();

  // 2. Read initial config
  const config = getConfig();

  // 3. Register output channel (always — it's the most reliable a11y path)
  registerOutputChannel(context);

  // 4. Register chat participant (guards internally if API unavailable)
  registerChatParticipant(context);

  // 5. Register accessible webview panel
  registerAccessiblePanel(context);

  // 6. Register status bar
  registerStatusBar(context);

  // 7. Register code action provider
  registerCodeAction(context);

  // 8. Register commands
  registerCommands(context);

  // 9. Listen for screen reader state changes
  context.subscriptions.push(
    onScreenReaderStateChanged((active) => {
      if (active && config.autoActivate) {
        vscode.window.showInformationMessage(
          "Screen reader detected. Accessible AI formatting is now active."
        );
        getOutputChannel().appendLine(
          "[Info] Screen reader detected. All AI responses will be formatted for speech."
        );
      }
    })
  );

  // 10. Listen for config changes
  context.subscriptions.push(
    onConfigChanged((newConfig) => {
      getOutputChannel().appendLine(
        `[Info] Settings updated: verbosity=${newConfig.verbosity}, ` +
          `announceTools=${newConfig.announceToolUse}, ` +
          `backend=${newConfig.backend}`
      );
    })
  );

  // 11. Welcome message
  if (config.enabled) {
    getOutputChannel().appendLine(
      "Accessible AI is active. " +
        `Verbosity: ${config.verbosity}. ` +
        "Use @accessible in the chat panel or Cmd+Shift+Alt+A to open the panel."
    );
  }

  // 12. Return markdown-it plugin for markdown preview integration
  return { extendMarkdownIt };
}

function registerCommands(context: vscode.ExtensionContext): void {
  // Format Selection for Screen Reader
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "claude-accessible.formatSelection",
      () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.selection.isEmpty) {
          vscode.window.showInformationMessage(
            "Select text first, then run Format Selection for Screen Reader."
          );
          return;
        }
        const text = editor.document.getText(editor.selection);
        formatAndWrite(text);
      }
    )
  );

  // Format Clipboard for Screen Reader
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "claude-accessible.formatClipboard",
      async () => {
        const text = await vscode.env.clipboard.readText();
        if (!text.trim()) {
          vscode.window.showInformationMessage("Clipboard is empty.");
          return;
        }
        formatAndWrite(text);
      }
    )
  );

  // Show Accessible AI Panel
  context.subscriptions.push(
    vscode.commands.registerCommand("claude-accessible.showPanel", () => {
      vscode.commands.executeCommand(
        "claude-accessible.accessibleView.focus"
      );
    })
  );

  // Clear Accessible AI Panel
  context.subscriptions.push(
    vscode.commands.registerCommand("claude-accessible.clearPanel", () => {
      const panel = getPanelProvider();
      if (panel) {
        panel.clear();
        vscode.window.showInformationMessage("Accessible AI panel cleared.");
      }
    })
  );

  // Toggle Auto-Format
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "claude-accessible.toggleAutoFormat",
      async () => {
        const config = vscode.workspace.getConfiguration("claude-accessible");
        const current = config.get("enabled", true);
        await config.update(
          "enabled",
          !current,
          vscode.ConfigurationTarget.Global
        );
        vscode.window.showInformationMessage(
          `Accessible AI formatting ${!current ? "enabled" : "disabled"}.`
        );
      }
    )
  );

  // Read Last AI Response
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "claude-accessible.readLastResponse",
      () => {
        const response = getLastResponse() || getLastChatResponse();
        if (!response) {
          vscode.window.showInformationMessage("No AI response to read.");
          return;
        }
        const channel = getOutputChannel();
        channel.appendLine("--- Last Response ---");
        channel.appendLine(response);
        channel.show(true); // preserve focus
      }
    )
  );

  // Set Verbosity Level
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "claude-accessible.setVerbosity",
      async () => {
        const items: vscode.QuickPickItem[] = [
          {
            label: "Minimal",
            description: "Code blocks and headings only",
            detail: "Strips lists, links, quotes, tables annotations",
          },
          {
            label: "Normal",
            description: "Default — code, headings, lists, links, tables",
            detail: "Recommended for most users",
          },
          {
            label: "Detailed",
            description: "Everything plus line counts and table dimensions",
            detail: "Maximum information for complex responses",
          },
        ];

        const picked = await vscode.window.showQuickPick(items, {
          placeHolder: "Select verbosity level for speech formatting",
        });

        if (picked) {
          const level = picked.label.toLowerCase();
          const config = vscode.workspace.getConfiguration("claude-accessible");
          await config.update(
            "verbosity",
            level,
            vscode.ConfigurationTarget.Global
          );
          vscode.window.showInformationMessage(
            `Verbosity set to ${picked.label}.`
          );
        }
      }
    )
  );
}

export function deactivate(): void {
  // Cleanup handled by disposables registered in context.subscriptions
}
