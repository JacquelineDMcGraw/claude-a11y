# Changelog

## 1.1.0 (2026-03-02)

### Browser extension (packages/browser)

- Multi-site support: works on claude.ai, ChatGPT, Gemini, and Microsoft Copilot via site adapter pattern
- Internationalization: announcement strings available in English, Spanish, Portuguese, German, French, and Japanese
- Global accessibility toggle replaces per-response toggles, reducing keyboard tab stops
- MutationObserver debouncing with requestAnimationFrame for better streaming performance
- ESLint integration for static analysis
- axe-core automated WCAG compliance tests
- ARIA snapshot tests for programmatic screen reader output verification
- Manual screen reader validation page (packages/browser/tests/sr-validation.html)
- Systematic ARIA hardening: code blocks, tables, and lists now have proper roles, labels, and keyboard focus
- Tables: aria-label, tabindex=0, row vs column header detection
- Lists: role=list and role=listitem to preserve semantics in Safari
- Inline code: removed non-standard role=text that caused double-announcement
- Input area: aria-multiline=true for multi-line chat input
- Response containers: aria-busy during generation, aria-current during keyboard navigation

### Node library and CLI (packages/node)

- Quiet mode flag (--quiet) suppresses heartbeat and status announcements
- Removed dead code: unused srVerboseMode, print option, orphaned parts array in announcer
- Slim npm publishing via prepack/postpack lifecycle scripts (35 KB npm package vs 315 KB vsix)

### CI/CD

- Fixed diff step to work on Windows (git diff --no-index)
- Added browser ESLint step to CI pipeline

---

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
- Three verbosity presets: minimal, normal, detailed
- CLI wrapper (`claude-sr` / `claude-a11y`): runs Claude Code with screen reader formatting
- Heartbeat messages during long responses in interactive REPL mode ("Still working...")
- VS Code extension: chat participant, response formatting, Cursor workbench patching
- Screen reader detection for auto-configuration
