# Store Listing Copy

Ready-to-paste descriptions for each distribution channel.

---

## npm (npmjs.com)

The package.json `description` field is used automatically:

"Screen-reader-friendly formatting for AI chat responses. CLI wrapper for Claude Code and VS Code extension with ARIA landmarks, code block announcements, and structural annotations."

npm README: Uses the root README.md (symlinked or copied during publish).

---

## Chrome Web Store

### Extension name

Claude Accessible

### Short description (132 chars max)

Formats Claude AI chat responses for screen readers. Adds ARIA landmarks, code block labels, keyboard navigation, and live regions.

### Detailed description

Claude Accessible makes claude.ai usable with screen readers (NVDA, JAWS, VoiceOver, Orca).

Without this extension, screen readers announce code blocks as "backtick backtick backtick python print open paren hello close paren backtick backtick backtick." Tables are read as pipes and dashes. There are no landmarks to navigate between responses.

This extension transforms every AI response into accessible HTML:

- Code blocks get announcements: "[Python] print('hello') [End Python]" instead of raw backticks
- Tables are labeled with row and column counts, with proper header associations
- Headings, quotes, bullet points, and separators are announced with clear markers
- Every AI response is wrapped in an ARIA region with a label like "Response 1"
- A live region announces "Generating response..." and "Response complete." so you know when Claude is working
- Alt+Up and Alt+Down navigate between AI responses
- The input area gets a proper ARIA label and role

Toggle between the accessible format and the original output anytime using the popup button.

Built by a developer with Ehlers-Danlos Syndrome who uses screen readers. Open source under MIT license.

### Category

Accessibility

### Language

English

---

## VS Code Marketplace

### Extension name

Accessible AI Chat

### Display name

Accessible AI Chat

### Short description

Screen reader formatting for AI chat responses in VS Code and Cursor. ARIA landmarks, code block announcements, and structured output.

### Detailed description (Markdown, used as README on Marketplace)

Accessible AI Chat formats AI responses in VS Code and Cursor for screen readers.

When AI assistants respond with code blocks, tables, and markdown, screen readers get raw syntax: backticks, pipe characters, and pound signs with no indication of structure. This extension transforms that output into clear, navigable content.

What it does:

1. Formats code blocks: announces the language before and after each block
2. Structures tables: announces column count and labels headers
3. Marks headings, quotes, and separators with clear announcements
4. Adds ARIA landmarks to chat responses
5. Provides a CLI wrapper for Claude Code that strips ANSI codes and spinner animations
6. Announces generation status so you know when AI is responding
7. Three verbosity levels: minimal, default, verbose

Works with:
- VS Code Copilot Chat (via chat participant)
- Cursor AI chat (via workbench patching)
- Claude Code in terminal (via `claude-sr` CLI wrapper)
- NVDA, JAWS, VoiceOver, Orca

Install from the VS Code Marketplace or from the .vsix file in GitHub Releases.

### Category

Accessibility

### Tags

accessibility, screen-reader, a11y, blind, low-vision, nvda, jaws, voiceover, ai, copilot, claude

---

## GitHub Repository

### About description (shown in repo sidebar)

Screen reader formatting for AI chat responses. Chrome extension for claude.ai, VS Code extension, and CLI wrapper.

### Topics

accessibility, screen-reader, a11y, blind, low-vision, nvda, jaws, voiceover, chrome-extension, vscode-extension, cli, claude, ai, assistive-technology, aria
