# claude-a11y

Screen reader accessibility for AI chat interfaces.

## The problem

AI chat interfaces are unusable with screen readers. The issues are specific and pervasive:

- Code blocks render as triple backticks. A screen reader announces "backtick backtick backtick python print open paren quote hello quote close paren backtick backtick backtick" instead of telling the user they are looking at a Python code block.
- Markdown formatting is read literally. Bold text becomes "star star important star star." Headings become "hash hash Section Title." Links become "bracket text bracket paren URL paren."
- Chat responses lack ARIA landmarks. There is no way to navigate between messages, code blocks, or sections using screen reader shortcuts.
- Streaming responses break live regions. Content arrives in fragments that overwhelm or confuse screen reader buffers.
- Terminal output is worse. ANSI escape codes, spinner animations, and cursor repositioning from TUI frameworks cause screen readers to freeze, repeat content, or lose their place entirely.
- Tables built from pipes and dashes are announced character by character instead of as structured data.

These are not edge cases. They are the default experience for blind and low-vision developers using AI coding tools.

## What this project does

claude-a11y transforms AI chat output into screen-reader-friendly markup. It works at three layers: in the browser, in the editor, and in the terminal. No visual changes are made. Sighted users see the same interface. Screen reader users hear structured, navigable output.

## Packages

This is a monorepo with four packages:

- **packages/chrome-extension** -- Browser extension for claude.ai. Runs a MutationObserver that transforms rendered markdown in-place, adding ARIA roles, landmarks, and screen-reader-only announcements. Works with Chrome, Edge, and Brave.

- **packages/vscode-extension** -- Extension for VS Code and Cursor. Transforms AI chat responses from Copilot, Claude, and other chat participants into speech-friendly output. Provides a dedicated accessible output panel, configurable verbosity levels, and keyboard shortcuts for common actions.

- **packages/cli** -- Terminal wrapper for Claude Code. Strips ANSI escape codes and spinner artifacts, parses markdown responses into an AST, and renders them as clean speech-friendly text. Works with any terminal and any screen reader.

- **packages/core** -- Shared library. Contains the markdown-to-speech formatter, ANSI sanitizer, and announcement utilities used by the other packages.

## Quick start

### Chrome extension

Clone the repository, open chrome://extensions, enable Developer mode, and load the packages/chrome-extension directory as an unpacked extension. Navigate to claude.ai.

### VS Code / Cursor extension

```
cd packages/vscode-extension
npm run compile
```

Install the resulting .vsix file through the Extensions view, or run it in the Extension Development Host with F5.

### CLI

```
npm install -g claude-accessible
claude-sr "explain this project"
```

Requires Node.js 18 or later and Claude Code CLI installed.

### Core library

```
npm install @claude-accessible/core
```

Import `speechFormat` to transform markdown strings into screen-reader-friendly plain text in your own tools.

## How it works

The browser and editor extensions use the same approach:

1. A MutationObserver watches the DOM for new or changed chat messages.
2. When a message appears, the extension walks its rendered HTML elements: code blocks, headings, tables, blockquotes, inline code, and links.
3. For each element, it adds ARIA attributes in-place. Code blocks get `role="region"` and an `aria-label` like "Python code block." Tables get `role="table"` with proper column headers. Headings get screen-reader-only prefix spans.
4. Screen-reader-only spans are inserted before and after structural elements to announce boundaries. These spans use the standard visually-hidden CSS pattern (1px clipped box) so they are invisible to sighted users but read by assistive technology.
5. An ARIA live region announces activity like "Response complete" without interrupting the current reading position.

The CLI takes a different path. It spawns Claude Code in headless mode with `NO_COLOR=1` and `TERM=dumb` to suppress visual formatting, then parses the markdown response into an abstract syntax tree using remark. It walks the AST and renders each node as plain text with structural cues: "[Python]" before a code block, "[End Python]" after it, "Heading:" before a heading, "Bullet:" before list items.

Nothing changes visually. The DOM looks the same. Only the accessibility tree is different.

## What screen readers hear

Without claude-a11y, a screen reader announces a Python code block as:

"backtick backtick backtick python def hello colon print open paren quote hi quote close paren backtick backtick backtick"

With claude-a11y, the same block is announced as:

"Python code block. def hello colon print open paren quote hi quote close paren. End Python."

Without claude-a11y, a markdown heading is announced as:

"hash hash Installation"

With claude-a11y:

"Heading. Installation."

Without claude-a11y, a markdown link is announced as:

"bracket documentation bracket open paren https colon slash slash docs dot example dot com close paren"

With claude-a11y:

"documentation, link: docs.example.com"

Without claude-a11y, a table built from pipes is announced as a stream of pipe characters and dashes. With claude-a11y, it is announced as:

"Table: 3 rows, 2 columns. Column header: Name. Column header: Role. Row 1: Name: Alice. Role: Engineer."

## Supported platforms

### Chrome extension
- Chrome, Edge, Brave, and other Chromium-based browsers
- Works on claude.ai

### VS Code / Cursor extension
- VS Code 1.93 or later
- Cursor
- Compatible with NVDA, JAWS, VoiceOver, and Orca

### CLI
- Any terminal on macOS, Windows, or Linux
- Any screen reader: VoiceOver, NVDA, JAWS, Orca
- Requires Node.js 18 or later

## Contributing

```
git clone https://github.com/JacquelineDMcGraw/claude-a11y.git
cd claude-a11y
npm install
npm run build
npm test
```

If you use a screen reader, feedback on the announcement phrasing, verbosity, and navigation experience is especially valuable. File an issue or open a pull request.

See the repository wiki for the manual screen reader testing protocol.

## License

MIT. See the LICENSE file for details.

## Author

Jacqueline McGraw -- https://github.com/JacquelineDMcGraw
