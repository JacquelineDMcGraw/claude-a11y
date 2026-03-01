/**
 * Accessible AI webview panel.
 *
 * A WebviewViewProvider that renders AI responses as semantic HTML
 * with ARIA live regions, heading navigation, and proper structure
 * for screen reader users.
 */

import * as vscode from "vscode";
import { generatePanelHtml, type PanelMessage } from "./panel-html.js";
import { randomUUID } from "node:crypto";

class AccessiblePanelProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "claude-accessible.accessibleView";

  private view?: vscode.WebviewView;
  private messages: PanelMessage[] = [];

  constructor(private readonly extensionUri: vscode.Uri) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: false, // No JS needed — pure semantic HTML
    };

    this.updateHtml();
  }

  /**
   * Add a new formatted response to the panel.
   */
  addMessage(formattedText: string): void {
    this.messages.push({
      id: randomUUID(),
      formattedText,
      timestamp: Date.now(),
    });

    this.updateHtml();
  }

  /**
   * Clear all messages from the panel.
   */
  clear(): void {
    this.messages = [];
    this.updateHtml();
  }

  private updateHtml(): void {
    if (!this.view) return;

    // Generate a nonce for CSP
    const nonce = randomUUID().replace(/-/g, "");
    this.view.webview.html = generatePanelHtml(this.messages, nonce);
  }
}

let panelProvider: AccessiblePanelProvider | null = null;

export function getPanelProvider(): AccessiblePanelProvider | null {
  return panelProvider;
}

export function registerAccessiblePanel(
  context: vscode.ExtensionContext
): void {
  panelProvider = new AccessiblePanelProvider(context.extensionUri);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      AccessiblePanelProvider.viewType,
      panelProvider,
      { webviewOptions: { retainContextWhenHidden: true } }
    )
  );
}
