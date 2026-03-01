/**
 * "Format for Screen Reader" code action.
 *
 * When users select text and right-click, they see a "Format Selection
 * for Screen Reader" option that converts the selected markdown to
 * speech-friendly text and shows it in the output channel.
 */

import * as vscode from "vscode";
import { formatForSpeech } from "@claude-accessible/core";
import { formatAndWrite } from "../output/output-channel.js";

export class FormatForSpeechAction implements vscode.CodeActionProvider {
  static readonly providedCodeActionKinds = [
    vscode.CodeActionKind.QuickFix,
  ];

  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    _context: vscode.CodeActionContext,
    _token: vscode.CancellationToken
  ): vscode.CodeAction[] {
    if (range.isEmpty) return [];

    const action = new vscode.CodeAction(
      "Format for Screen Reader",
      vscode.CodeActionKind.QuickFix
    );
    action.command = {
      command: "claude-accessible.formatSelection",
      title: "Format Selection for Screen Reader",
    };

    return [action];
  }
}

export function registerCodeAction(
  context: vscode.ExtensionContext
): void {
  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(
      { scheme: "*" },
      new FormatForSpeechAction(),
      { providedCodeActionKinds: FormatForSpeechAction.providedCodeActionKinds }
    )
  );
}
