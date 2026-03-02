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
import { initFormatter, formatForSpeech } from "../core/index.js";
import { getConfig, onConfigChanged } from "./config.js";
import {
  isScreenReaderActive,
  onScreenReaderStateChanged,
} from "./screen-reader-detect.js";
import { registerChatParticipant, getLastChatResponse } from "./chat/participant.js";
import {
  registerOutputChannel,
  formatAndWrite,
  getLastResponse,
  getOutputChannel,
} from "./output/output-channel.js";
import { registerStatusBar } from "./inline/status-bar.js";
import { registerCodeAction } from "./inline/code-action.js";
import { extendMarkdownIt } from "./markdown/markdown-plugin.js";
import { install as installInjection, uninstall as uninstallInjection, isInstalled as isInjectionInstalled } from "./inject/patcher.js";

export async function activate(
  context: vscode.ExtensionContext
): Promise<{ extendMarkdownIt: typeof extendMarkdownIt }> {
  // 1. Ensure remark parser is initialized (no-op if bundled via esbuild)
  await initFormatter();

  // 2. Read initial config
  const config = getConfig();

  // 3. Register output channel (always — it's the most reliable a11y path)
  registerOutputChannel(context);

  // 4. Register chat participant (guards internally if API unavailable)
  registerChatParticipant(context);

  // 5. Register status bar
  registerStatusBar(context);

  // 6. Register code action provider
  registerCodeAction(context);

  // 7. Register commands
  registerCommands(context);

  // 8. Listen for screen reader state changes
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

  // 9. Listen for config changes
  context.subscriptions.push(
    onConfigChanged((newConfig) => {
      getOutputChannel().appendLine(
        `[Info] Settings updated: verbosity=${newConfig.verbosity}, ` +
          `announceTools=${newConfig.announceToolUse}, ` +
          `backend=${newConfig.backend}`
      );
    })
  );

  // 10. Welcome message
  if (config.enabled) {
    getOutputChannel().appendLine(
      "Accessible AI is active. " +
        `Verbosity: ${config.verbosity}. ` +
        "Use @accessible in chat or Cmd+Shift+Alt+R to read the last response."
    );
  }

  // 11. Return markdown-it plugin for markdown preview integration
  return { extendMarkdownIt };
}

function registerCommands(context: vscode.ExtensionContext): void {
  // Format Selection for Screen Reader
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "claude-a11y.formatSelection",
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
      "claude-a11y.formatClipboard",
      async () => {
        const text = await vscode.env.clipboard.readText();
        if (!text.trim()) {
          vscode.window.showInformationMessage(
            "Copy a chat response first, then run this command."
          );
          return;
        }
        formatAndWrite(text);
        vscode.window.showInformationMessage(
          "Formatted. Switch to the Accessible AI output panel to read it."
        );
      }
    )
  );

  // Format Chat Response — reads clipboard and opens accessible version in a new tab
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "claude-a11y.formatChatResponse",
      async () => {
        const text = await vscode.env.clipboard.readText();
        if (!text.trim()) {
          vscode.window.showInformationMessage(
            "Copy a chat response first (Cmd+A then Cmd+C in the chat), then press Cmd+Shift+Alt+F."
          );
          return;
        }

        await formatAndWrite(text);
      }
    )
  );

  // Toggle Auto-Format
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "claude-a11y.toggleAutoFormat",
      async () => {
        const config = vscode.workspace.getConfiguration("claude-a11y");
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
      "claude-a11y.readLastResponse",
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
      "claude-a11y.setVerbosity",
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
          const config = vscode.workspace.getConfiguration("claude-a11y");
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

  // -----------------------------------------------------------------------
  // Chat Accessibility Injection — patches Cursor/VS Code renderer
  // -----------------------------------------------------------------------

  // Enable: inject into workbench.html
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "claude-a11y.enableChatInjection",
      async () => {
        if (isInjectionInstalled()) {
          vscode.window.showInformationMessage(
            "Chat accessibility is already installed. Restart Cursor if it's not active."
          );
          return;
        }

        const ok = await installInjection(context);
        if (ok) {
          const action = await vscode.window.showInformationMessage(
            "Chat accessibility installed. Restart Cursor to activate it.",
            "Restart Now"
          );
          if (action === "Restart Now") {
            vscode.commands.executeCommand("workbench.action.reloadWindow");
          }
        }
      }
    )
  );

  // Disable: remove injection
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "claude-a11y.disableChatInjection",
      async () => {
        const ok = await uninstallInjection();
        if (ok) {
          const action = await vscode.window.showInformationMessage(
            "Chat accessibility removed. Restart Cursor to take effect.",
            "Restart Now"
          );
          if (action === "Restart Now") {
            vscode.commands.executeCommand("workbench.action.reloadWindow");
          }
        }
      }
    )
  );

  // Auto-prompt to install on first activation if not already installed
  if (!isInjectionInstalled()) {
    const prompted = context.globalState.get<boolean>("ca11y-prompted", false);
    if (!prompted) {
      context.globalState.update("ca11y-prompted", true);
      vscode.window
        .showInformationMessage(
          "Accessible AI can inject into Cursor's chat to make all responses screen-reader friendly. Enable now?",
          "Enable",
          "Not Now"
        )
        .then((choice) => {
          if (choice === "Enable") {
            vscode.commands.executeCommand(
              "claude-a11y.enableChatInjection"
            );
          }
        });
    }
  }
}

export function deactivate(): void {
  // Cleanup handled by disposables registered in context.subscriptions
}
