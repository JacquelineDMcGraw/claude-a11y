# Changelog

## 1.0.0 (2026-03-02)

Initial release.

### Browser extension (packages/browser)

- DOM transformation of Claude AI chat responses for screen readers
- ARIA landmarks on every response: region roles, aria-labels, live regions
- Code block announcements: language announced before and after each block
- Table formatting: row and column counts announced, header labeling
- Markdown structure: headings, quotes, separators, bullet points announced clearly
- Keyboard navigation between AI responses with Alt+Up and Alt+Down
- Generation status announcements: "Generating response..." and "Response complete."
- Input area labeling with ARIA role and label
- Selector health checks with automatic fallback when claude.ai DOM changes
- Raw/Accessible toggle in popup to switch between original and formatted output
- Anonymous usage telemetry export for test reports

### Node library and CLI (packages/node)

- Core library: AST-based Markdown to speech-formatted text using unified and remark
- Stream parser for NDJSON events from Claude Code subprocess
- ANSI sanitizer: strips escape codes, spinner frames, cursor repositioning
- Announcer: queues and deduplicates screen reader announcements
- Three verbosity presets: minimal, default, verbose
- CLI wrapper (`claude-sr` / `claude-accessible`): runs Claude Code with screen reader formatting
- Heartbeat messages during long responses ("Still working...")
- VS Code extension: chat participant, response formatting, Cursor workbench patching
- Screen reader detection for auto-configuration
