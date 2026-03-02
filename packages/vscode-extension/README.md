# Accessible AI -- VS Code / Cursor Extension

VS Code and Cursor extension that makes AI chat responses accessible to screen readers. Provides an `@accessible` chat participant, an accessible output panel, DOM injection for Cursor's chat renderer, and commands for formatting any text into speech-friendly output.

## Features

### Chat participant: @accessible

Type `@accessible` in the VS Code chat panel to get AI responses pre-formatted for screen readers. Code blocks are announced with language markers, tables are linearized with labeled cells, and markdown syntax is replaced with structural cues.

Slash commands within the participant:

- `/format` -- Format text or clipboard content for screen reader output.
- `/explain` -- Explain code with accessible structural annotations.
- `/verbosity` -- Set output detail level: minimal, normal, or detailed.

### Accessible output panel

A dedicated webview panel (Accessible AI Output) displays formatted responses with proper ARIA markup. Open it with the "Show Accessible AI Panel" command or the keyboard shortcut.

### DOM injection for Cursor

Cursor's built-in chat renderer does not expose ARIA attributes on AI responses. This extension can patch Cursor's `workbench.html` to inject `chat-a11y.js`, which adds screen-reader-friendly markup to all chat messages in real time via MutationObserver.

Enable or disable injection:

- Command: "Enable Chat Accessibility (patches Cursor renderer)"
- Command: "Disable Chat Accessibility (restore Cursor renderer)"

On first activation, the extension prompts you to enable injection. A Cursor restart is required after enabling or disabling. The install script (`install-injection.sh`) can also be run manually with `sudo bash install-injection.sh`.

### Claude Desktop injection

Claude Desktop's Electron build has security fuses that block programmatic injection:

- EnableEmbeddedAsarIntegrityValidation is ON (cannot modify app.asar).
- EnableNodeCliInspectArguments is OFF (cannot use --inspect or --remote-debugging-port).
- EnableNodeOptionsEnvironmentVariable is OFF (cannot use NODE_OPTIONS).
- RunAsNode is OFF (cannot use ELECTRON_RUN_AS_NODE).

The only injection path is through the DevTools console:

1. Quit Claude Desktop.
2. Launch with DevTools: `CLAUDE_DEV_TOOLS=detach /Applications/Claude.app/Contents/MacOS/Claude`
3. Run `node launch-claude-a11y.js` for automated injection (macOS, requires Accessibility permission for your terminal), or run `node patch-claude-app.js copy` to copy chat-a11y.js to clipboard, then paste it into the DevTools console.

Run `node patch-claude-app.js status` to see the current fuse state and available injection methods.

### Verbosity levels

Three levels control how much structural annotation appears in formatted output:

- Minimal: Code block markers and headings only. List bullets, table annotations, links, and quotes are simplified.
- Normal (default): Code blocks, headings, lists, links, tables, quotes, and separators are all annotated.
- Detailed: Adds line counts to code blocks, row counts to tables, and richer descriptions.

Set the level through the "Set Verbosity Level" command or `claude-accessible.verbosity` in settings.

## Commands and keyboard shortcuts

- Format Selection for Screen Reader: Ctrl+Shift+Alt+F (Cmd+Shift+Alt+F on macOS). Requires an active text selection.
- Read Last AI Response: Ctrl+Shift+Alt+R (Cmd+Shift+Alt+R on macOS).
- Show Accessible AI Panel: Ctrl+Shift+Alt+A (Cmd+Shift+Alt+A on macOS).
- Format Clipboard for Screen Reader: No default binding. Available in the command palette.
- Clear Accessible AI Panel: No default binding.
- Toggle Auto-Format for Screen Reader: No default binding.
- Set Verbosity Level: No default binding.
- Enable / Disable Chat Accessibility: No default binding.

## Installation

### Build from source

1. From the repository root, install dependencies: `npm install`
2. Build: `cd packages/vscode-extension && npm run compile`
3. Package: `npx @vscode/vsce package` (produces a `.vsix` file)
4. In VS Code or Cursor: Extensions view, click the "..." menu, choose "Install from VSIX", and select the `.vsix` file.

### Requirements

- VS Code 1.93.0 or later, or a compatible fork (Cursor).
- For the `@accessible` chat participant: VS Code Language Model API (provided by GitHub Copilot or a compatible extension), or Claude Code CLI installed and on PATH.

## Configuration

All settings are under the `claude-accessible` namespace:

- `enabled` (boolean, default true): Enable accessible formatting.
- `autoActivate` (boolean, default true): Activate automatically when a screen reader is detected.
- `verbosity` (string, default "normal"): minimal, normal, or detailed.
- `announceToolUse` (boolean, default true): Announce when AI uses tools.
- `announceMode` (string, default "output"): notification, output, or both.
- `codeBlockAnnouncement` (string, default "language"): language, language-and-lines, or minimal.
- `outputToChannel` (boolean, default true): Mirror responses to the output channel.
- `backend` (string, default "auto"): language-model-api, claude-cli, or auto.
- `claudeCliPath` (string, default ""): Path to the Claude Code CLI binary.

## License

MIT
