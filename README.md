# claude-a11y

Screen reader formatting for AI chat responses.

## Why I built this

I have Ehlers-Danlos Syndrome, dyscalculia, and ADHD. I can architect systems and reason about abstractions, but raw syntax -- nested brackets, semicolons, strings of letters mixed with numbers, formatting noise -- has always been a wall in regards to comprehension. AI coding tools bridged that gap for me and let me turn what I understood into working software with less struggle than I previously had. The difference between users of these AI tools is not just their allotted tokens, it is the allocated spoons it takes to use them.

EDS also causes vision problems with extended screen time. I already needed output I could process without straining through dense visual formatting. Then I tried using Claude Code with a screen reader.

Spinning animations read as streams of meaningless characters. ANSI color codes garbled the output. Code blocks were announced as "backtick backtick backtick python" with no indication of structure. A user with low vision trying to use Claude Code would be getting a broken experience.

claude-a11y formats AI chat responses for screen readers. It strips decorative output, structures responses for assistive technology, and presents code in a way that actually communicates what the code is. It started from my own needs -- vision fatigue, syntax processing, cleaner output -- but the harder problem was screen readers. The result is useful for anyone: blind and low-vision developers, people with cognitive processing differences, or anyone who prefers to read without fighting through formatting.

Note: This project focuses on making AI responses readable and navigable. It does not solve every aspect of the full chat workflow -- input fields, settings panels, and some sidebar navigation on claude.ai are not yet addressed. What it does address, it addresses well.

Other developers have been asking for these fixes too. The issues filed at https://github.com/anthropics/claude-code/issues/11002 (requesting a screen reader mode for NVDA and JAWS) and https://github.com/anthropics/claude-code/issues/15509 (requesting a no-ANSI flag for screen reader compatibility) describe the same problems this project addresses. This tool exists because those problems have not been solved upstream yet.

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

claude-a11y transforms AI chat output into screen-reader-friendly markup. It works at three layers: in the browser, in the editor, and in the terminal. The only visible addition is a small toggle button (near-transparent until hovered or focused) that lets users switch between accessible and raw output. Everything else is invisible to sighted users -- only the accessibility tree changes. Screen reader users hear structured, navigable output.

## Packages

This is a monorepo with two packages:

- **packages/browser** -- Browser extension for claude.ai and DOM injection script for VS Code/Cursor. Runs a MutationObserver that transforms rendered markdown in-place, adding ARIA roles, landmarks, screen-reader-only announcements, keyboard navigation between responses (Alt+Up/Down), and generation status announcements. Also includes the shared announcement phrasing used by both packages. Works with Chrome, Edge, and Brave.

- **packages/node** -- Everything that runs in Node.js. Contains the markdown-to-speech formatter, ANSI sanitizer, stream parser, CLI wrapper (claude-sr), and VS Code extension source. The CLI strips ANSI and spinner artifacts, streams responses incrementally with heartbeat status in interactive mode, and supports a --raw flag to bypass formatting. The VS Code extension provides an @accessible chat participant, an output channel, configurable verbosity, and keyboard shortcuts.

## Quick start

### Chrome extension

Clone the repository, open chrome://extensions, enable Developer mode, and load the packages/browser directory as an unpacked extension. Navigate to any supported site: claude.ai, chatgpt.com, gemini.google.com, or copilot.microsoft.com.

### VS Code / Cursor extension

```
cd packages/node
npm run compile
```

Install the resulting .vsix file through the Extensions view, or run it in the Extension Development Host with F5.

### CLI

```
git clone https://github.com/JacquelineDMcGraw/claude-a11y.git
cd claude-a11y
npm install
npm run build
npm link -w packages/node
claude-sr "explain this project"
```

Requires Node.js 20 or later and Claude Code CLI installed.

Use --raw to bypass speech formatting and get sanitized plaintext output:

```
claude-sr --raw "explain this function"
```

## How it works

The browser and editor extensions use the same approach:

1. A MutationObserver watches the DOM for new or changed chat messages.
2. When a message appears, the extension walks its rendered HTML elements: code blocks, headings, tables, blockquotes, inline code, and links.
3. For each element, it adds ARIA attributes in-place. Code blocks get an `aria-label` like "Python code block." Tables get `role="table"` with proper column headers. Headings get screen-reader-only prefix spans. Each AI response container is marked as a `role="region"` landmark so screen reader users can jump between responses.
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
- Works on claude.ai, chatgpt.com, gemini.google.com, and copilot.microsoft.com
- Note: claude.ai has the most complete selector coverage. Other sites use best-effort DOM selectors that may need updating as those sites change. If transforms stop working on a site, file an issue or submit a PR with updated selectors -- the site adapter pattern makes this straightforward.

### VS Code / Cursor extension
- VS Code 1.93 or later
- Cursor
- Compatible with NVDA, JAWS, VoiceOver, and Orca

### CLI
- Any terminal on macOS, Windows, or Linux
- Any screen reader: VoiceOver, NVDA, JAWS, Orca
- Requires Node.js 20 or later

## Claude Desktop

Claude Desktop's Electron build has security fuses that block every standard injection method. The only path that works is launching with `CLAUDE_DEV_TOOLS=detach` and pasting chat-a11y.js into the DevTools console. This is a per-session workaround, not a real solution. See ARCHITECTURE.md for the full technical analysis of what Anthropic would need to change to support proper accessibility in the desktop app.

This setup process is not accessible with a screen reader. That is a known contradiction. The launch-claude-a11y.js helper in the VS Code extension package attempts to automate it with AppleScript on macOS, but that requires granting Accessibility permissions to the terminal, which is itself a multi-step System Settings navigation. If you have a sighted person available to help with the initial setup, the accessibility layer works for the rest of the session.

## Contributing

See CONTRIBUTING.md for setup instructions, testing expectations, and how to submit changes.

If you use a screen reader, feedback on announcement phrasing, verbosity, and navigation experience is especially valuable. File an issue or open a pull request.

## License

MIT. See the LICENSE file for details.

## Author

Jacqueline McGraw -- https://github.com/JacquelineDMcGraw
