# claude-accessible

Screen reader formatting for AI chat responses.

Transforms Markdown output from AI assistants into text that screen readers can announce clearly. Code blocks, tables, headings, and formatting markers are replaced with structured announcements.

## Install

As a CLI wrapper for Claude Code:

```
npm install -g claude-accessible
claude-sr
```

As a library:

```
npm install claude-accessible
```

As a VS Code/Cursor extension: install "Accessible AI Chat" from the VS Code Marketplace, or download the .vsix from GitHub Releases.

## What it does

Without formatting, a screen reader announces a Python code block as "backtick backtick backtick python print open paren hello close paren backtick backtick backtick."

With claude-accessible, it becomes "[Python] print hello [End Python]."

Specific transformations:

1. Code blocks: language announced before and after the block
2. Tables: column count and headers announced, rows labeled
3. Headings, subheadings, quotes: announced with clear markers
4. Bullet points: "Bullet:" prefix instead of asterisk or dash
5. Separators: "[Separator]" instead of three dashes
6. Strikethrough: "[Strikethrough]" and "[End Strikethrough]" markers
7. Images: alt text announced, or "[Image]" if none

## CLI usage

Run Claude Code with screen reader formatting:

```
claude-sr
```

The wrapper spawns Claude Code as a subprocess, strips ANSI escape codes and spinner animations, formats Markdown responses, and sends clean text to stdout. It announces "Still working..." during long responses so you know the process has not frozen.

## Library usage

In TypeScript or JavaScript:

```typescript
import { formatForSpeech, sanitize } from "claude-accessible";

const raw = "## Hello\n\n```python\nprint('hi')\n```";
const accessible = formatForSpeech(raw);
// "[Subheading] Hello\n[Python]\nprint('hi')\n[End Python]"

const ansiGarbage = "\x1b[32mgreen text\x1b[0m";
const clean = sanitize(ansiGarbage);
// "green text"
```

## VS Code extension

When installed in VS Code or Cursor:

- The `@accessible` chat participant formats responses from Copilot Chat
- Screen reader detection auto-enables formatting
- Three verbosity levels: minimal, default, verbose
- Cursor workbench patching injects accessibility into the Cursor chat panel

## Verbosity levels

- Minimal: code block markers only, no heading or table annotations
- Default: all structural markers
- Verbose: full detail including image descriptions and row counts

## Links

- Source: https://github.com/JacquelineDMcGraw/claude-a11y
- Issues: https://github.com/JacquelineDMcGraw/claude-a11y/issues
- Chrome extension: https://github.com/JacquelineDMcGraw/claude-a11y/tree/main/packages/browser

## License

MIT
