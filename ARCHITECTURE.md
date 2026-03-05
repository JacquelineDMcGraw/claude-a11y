# Architecture

## Overview

claude-a11y formats AI chat responses for screen readers. It transforms rendered markdown into structured, navigable output without changing visual appearance. Only the accessibility tree is modified.

The project is organized into two packages:

- **packages/browser** -- Self-contained IIFE (`chat-a11y.js`) for DOM transformation, plus the shared announcement phrasing (`phrasing.js`). Used by the Chrome extension and injected into VS Code/Cursor webviews.
- **packages/node** -- Node.js library and tools. Contains the speech formatter (remark AST), ANSI sanitizer, stream parser, CLI wrapper (claude-sr), VS Code extension source, and the Claude Code hooks integration (claude-a11y-hooks). Imports phrasing from the browser package at build time.

Both packages use the same announcement strings defined in `packages/browser/phrasing.js`, the single source of truth.

## Core transformation engine: chat-a11y.js

`packages/browser/chat-a11y.js` is a self-contained IIFE that runs in the main world of any page containing AI chat output. It is used by the Chrome extension, the Cursor workbench.html injection, and manual Claude Desktop console injection.

### MutationObserver pattern

A MutationObserver watches `document.documentElement` for `childList`, `subtree`, and `characterData` mutations. When new element nodes are added, they are processed immediately. When character data changes (streaming responses), a debounced full scan is scheduled at 150ms (with requestAnimationFrame batching) to avoid thrashing during rapid token delivery.

### Element transformation pipeline

Each element is tagged with `data-ca11y="1"` after transformation to prevent double-processing. The pipeline runs these transforms in order: code blocks (`role="region"`, `aria-label` announcing the language, `tabindex="0"` for keyboard focus), inline code (native semantics preserved, no ARIA overrides), headings (sr-only prefix spans), tables (`role="table"`, `aria-label`, `tabindex="0"`, column/row header detection via `scope` and `role`), blockquotes (`role="note"`), horizontal rules (`role="separator"`), images (fallback alt text), links (fallback text content), lists (`role="list"` on container, `role="listitem"` on children to preserve semantics when CSS strips them, plus item count announcements), and chat message containers (`role="region"` with `aria-label="AI response"`).

Screen-reader-only spans use the standard visually-hidden CSS pattern: 1px clipped box with `overflow: hidden` and `user-select: none` to prevent clipboard pollution when copying code. These are invisible to sighted users but read by assistive technology.

### TrustedTypes policy

Cursor enforces strict Content Security Policy with Trusted Types. The script creates a `claudeA11y` policy via `window.trustedTypes.createPolicy()` at initialization. If policy creation fails (non-TT environments), it falls back silently.

### ARIA live region

A visually-hidden `div` with `role="status"` and `aria-live="polite"` is appended to the body. The `announce()` function clears its text content, then sets new text after a 100ms delay so screen readers detect the change event.

### Debounced scanning with periodic rescans

The observer triggers a debounced `scanAll()` at 150ms (200ms without requestAnimationFrame). In addition, aggressive initial scans fire at 1s, 3s, 5s, and 10s after injection to catch first-render content. A self-disabling 30-second fallback interval handles lazy rendering in Cursor, where the MutationObserver may miss elements rendered outside the observed subtree. The fallback tracks idle cycles (scans that find no new elements) and disables itself after 20 consecutive idle cycles to avoid wasting resources on a settled page. Any new MutationObserver hit resets the idle counter.

### Selector strategy

Chat message containers are matched by a union of selectors (versioned via `SELECTOR_VERSION`) across apps:

- claude.ai / Claude Desktop: `[data-testid="chat-message-content"]`, `[data-testid="conversation-turn"]`, `.prose`
- Cursor: `[class*="agentTurn"]`, `[class*="chat-message"]`
- VS Code: `.interactive-result-editor-wrapper`, `.chat-tree-container`, `.rendered-markdown`, `.markdown-body`

Multi-site support is provided via a site adapter registry (`siteAdapters` array). Each adapter defines `messageSelectors`, `inputSelectors`, `stopSelectors`, and `titleSelectors` for its platform. Currently defined: claude (claude.ai), chatgpt (chatgpt.com, chat.openai.com), gemini (gemini.google.com), copilot (copilot.microsoft.com), and cursor (Cursor IDE webview). The claude adapter has the most complete and battle-tested selectors. Other adapters use best-effort selectors that may need updating when those sites change their DOM.

A catch-all pass scans for bare `pre`, `table`, `blockquote`, and heading elements regardless of container. When no selectors match, a heuristic fallback activates and announces the degraded state via the ARIA live region.

### Input-side accessibility

`transformInputArea()` finds the chat input field, adds `aria-label="Message input"` if missing, and sets `aria-multiline="true"` for multi-line input fields. `observeGenerationStatus()` watches for the appearance/disappearance of stop buttons to announce "Generating response..." and "Response complete", and also sets `aria-busy="true"` on the active response container during generation so screen readers can defer reading until content is stable. `addResponseNavigation()` registers Alt+ArrowUp/Alt+ArrowDown keyboard shortcuts to jump between response regions, announcing the position and setting `aria-current="true"` on the focused response. `labelResponses()` adds sequential numbering to response regions. `readConversationTitle()` reads the conversation title and applies it as an `aria-label` on the main chat container.

## Chrome extension architecture

### Manifest V3 content script to main-world injection

The extension uses Manifest V3 (`manifest.json`). A content script (`content.js`) runs at `document_idle` on `claude.ai`. Because MV3 content scripts execute in an isolated world, the script fetches `chat-a11y.js` via `chrome.runtime.getURL()`, reads its source text, creates a `<script>` element with that source as `textContent`, appends it to `document.documentElement`, and removes it. This executes synchronously in the main world.

### web_accessible_resources pattern

`chat-a11y.js` is declared in the `web_accessible_resources` array, scoped to `*://claude.ai/*`. This allows the content script to fetch the file from the extension package using a `chrome-extension://` URL.

### Popup communication via chrome.runtime messaging

The popup (`popup.js`) sends messages to the background service worker (`background.js`) using `chrome.runtime.sendMessage`. Three message types are supported: `getStatus` queries the active tab URL to determine if the user is on claude.ai, `getStats` executes `window.__ca11yStats()` in the main world via `chrome.scripting.executeScript`, and `forceRescan` executes `window.__ca11yScan()` to trigger an immediate DOM transformation pass.

## VS Code / Cursor extension architecture

### Chat participant API

The extension registers an `@accessible` chat participant via `vscode.chat.createChatParticipant()`. When a user types `@accessible explain this code`, the handler selects a backend (Language Model API or Claude CLI subprocess), streams the response, buffers text at paragraph boundaries using `ParagraphBuffer`, formats each paragraph through `formatForSpeech()`, and writes it to the `ChatResponseStream`. The participant API is guarded: if `vscode.chat` is undefined (as in Cursor), registration is silently skipped.

### Cursor DOM injection via workbench.html patching

`packages/node/src/vscode/inject/patcher.ts` locates Cursor's `workbench.html` by searching known paths under `vscode.env.appRoot` (electron-sandbox, electron-browser, and desktop variants). The `install()` function copies `chat-a11y.js` alongside the HTML file, appends a `<script>` tag between `<!-- claude-a11y-start -->` and `<!-- claude-a11y-end -->` markers before `</html>`, adds the `claudeA11y` policy name to the Trusted Types CSP directive, and creates a backup of the original file. Uninstall restores from backup or strips the markers.

### esbuild bundling

The remark ecosystem (unified, remark-parse, remark-gfm) is ESM-only. The extension must produce a single CJS bundle for VS Code's Node.js runtime. `esbuild.mjs` bundles the extension entry point with `format: "cjs"`, `platform: "node"`, and `mainFields: ["module", "main"]` with `conditions: ["import", "node"]` to resolve ESM packages. Only `vscode` is external. The esbuild step also copies `chat-a11y.js` from the browser package into `media/` for the patcher.

## CLI architecture

### Subprocess spawning with environment variable sanitization

`packages/node/src/cli/runner.ts` spawns the `claude` binary as a child process. The environment is copied from `process.env` with three overrides: `NO_COLOR=1`, `FORCE_COLOR=0`, and `TERM=dumb`. These suppress ANSI color output at the source. stdio is set to `["pipe", "pipe", "pipe"]` for full stream control.

### Stream parser for Claude's streaming JSON format

`createStreamParser()` in `packages/node/src/core/stream-parser.ts` implements line-buffered NDJSON parsing. Each line from `claude -p --output-format stream-json --verbose` is parsed into typed events: `init` (session ID), `text`/`text_delta` (response content), `tool_use` (tool activity), `tool_result`, and `result` (cost, turns, errors). The parser handles chunks that split across line boundaries by maintaining an internal line buffer.

### remark AST to speech text pipeline

When bundled via esbuild, the remark processor is created synchronously at module load (`buildProcessor()`). For unbundled use (tests, direct Node.js), `initFormatter()` falls back to dynamic import. `formatForSpeech()` parses markdown into an mdast AST and walks it with `renderNode()`. Each node type maps to a speech-friendly representation: code fences become `[Python]` / `[End Python]`, headings become `[Heading] text`, list items become `Bullet: text` or numbered prefixes, tables become `[Table, N columns]` with labeled rows, and inline formatting (bold, italic) is silently stripped to its text content.

### REPL with readline over stderr

`packages/node/src/cli/repl.ts` creates a `readline.Interface` with `output: process.stderr`. This keeps the prompt, tool announcements, and thinking indicators on stderr while stdout contains only Claude's sanitized response text. Piping `claude-sr "question" > output.txt` captures a clean response. The REPL maintains session state (session ID, accumulated cost, turn count) and passes `--resume` on subsequent turns.

## Claude Desktop app: security analysis

Claude Desktop is an Electron application. Its binary includes Electron fuses -- compile-time flags embedded in the framework binary that control security-relevant behaviors. The following analysis is based on reading the fuse state from the Electron Framework binary at `/Applications/Claude.app/Contents/Frameworks/Electron Framework.framework/Versions/A/Electron Framework`.

### Fuse configuration

The fuses are read by locating the sentinel string `dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX` in the binary and parsing the subsequent bytes. The observed state:

- RunAsNode: DISABLED. The ELECTRON_RUN_AS_NODE environment variable is ignored. The app binary cannot be repurposed as a plain Node.js runtime.
- EnableCookieEncryption: ENABLED. Cookie storage is encrypted.
- EnableNodeOptionsEnvironmentVariable: DISABLED. The NODE_OPTIONS environment variable is ignored. Preload scripts and inspector flags cannot be injected via environment.
- EnableNodeCliInspectArguments: DISABLED. The --inspect, --inspect-brk, and --remote-debugging-port flags are ignored. Chrome DevTools Protocol cannot be activated from the command line.
- EnableEmbeddedAsarIntegrityValidation: ENABLED. The app.asar archive is verified against an integrity hash at load time. Modifying the archive contents causes the app to fail validation.
- OnlyLoadAppFromAsar: ENABLED. The app must load from the asar archive, not from a loose directory.
- LoadBrowserProcessSpecificV8Snapshot: Status varies by build.
- GrantFileProtocolExtraPrivileges: Status varies by build.

### What was tested

The following injection methods were attempted:

- Modifying app.asar to include a preload script: blocked by EnableEmbeddedAsarIntegrityValidation.
- Launching with --remote-debugging-port to enable CDP: blocked by EnableNodeCliInspectArguments.
- Launching with --inspect or --inspect-brk: blocked by the same fuse.
- Setting NODE_OPTIONS to inject --require preload: blocked by EnableNodeOptionsEnvironmentVariable.
- Setting ELECTRON_RUN_AS_NODE=1: blocked by RunAsNode fuse.
- Setting ELECTRON_EXTRA_LAUNCH_ARGS: not processed by the app.

### What works

Setting the environment variable `CLAUDE_DEV_TOOLS=detach` before launching the app opens an inline Chromium DevTools window attached to the renderer process. From the DevTools console, JavaScript can be executed in the page context. Pasting chat-a11y.js into the console and pressing Enter activates the accessibility layer for the current session.

On macOS, if the terminal has Accessibility permissions in System Settings, AppleScript can automate the paste-and-execute workflow by focusing the DevTools window, simulating Cmd+V, and pressing Enter. This is implemented in `launch-claude-a11y.js`.

### Extension points that would enable proper accessibility support

The current architecture requires manual DevTools console injection per session. The following extension points, if provided by the application, would enable persistent accessibility support:

1. A content script or userscript directory that loads JavaScript files into the claude.ai webview at startup, similar to Tampermonkey or Chrome's content script model.
2. An extension loading mechanism, either by enabling the --load-extension fuse or by loading extensions from the user data directory, allowing a Chrome extension to run inside the Electron webview.
3. Built-in accessibility support that ships chat-a11y.js or equivalent ARIA transforms as part of the application, eliminating the need for external injection entirely.
4. Enabling the remote debugging fuse (EnableNodeCliInspectArguments) to allow CDP-based injection via --remote-debugging-port, which would let external tools connect and inject scripts programmatically.

Any of these would allow screen reader users to have accessible chat output without per-session manual intervention.

## Shared core library

### Module dependency graph

The core library (`packages/node/src/core/`) exports five modules through a barrel `index.ts`:

- `sanitizer.ts`: ANSI escape code stripping. No dependencies. Exports `sanitize()` for complete strings and `createChunkSanitizer()` for streaming chunks with partial-sequence buffering.
- `speech-formatter.ts`: Markdown-to-speech rendering. Depends on unified, remark-parse, and remark-gfm (dynamically imported). Exports `initFormatter()` and `formatForSpeech()`.
- `announcer.ts`: Tool activity formatting. Depends on `types.ts`. Exports `announceToolUse()`, `announceResult()`, `announceError()`, and `writeAnnouncement()`.
- `stream-parser.ts`: NDJSON line parser. Depends on `types.ts`. Exports `parseStreamLine()` and `createStreamParser()`.
- `verbosity.ts`: Verbosity filtering. Depends on `speech-formatter.ts`. Wraps `formatForSpeech()` with three levels: minimal (code blocks and headings only), normal (full output), and detailed (adds line counts and table dimensions).

### sanitizer to speech-formatter to announcer pipeline

In the CLI, data flows through these modules in sequence. Raw subprocess output passes through `createChunkSanitizer()` to strip ANSI codes while handling sequences split across chunk boundaries. The sanitized text is then passed to `formatForSpeech()` to convert markdown into speech-friendly plain text. Tool activity events are separately routed through `announceToolUse()` and written to stderr via `writeAnnouncement()`.

### stream-parser for JSON streaming mode

`createStreamParser()` accepts raw `Buffer` or `string` chunks from the subprocess stdout. It maintains an internal line buffer, splits on newlines, and passes each complete line to `parseStreamLine()`. The line parser attempts `JSON.parse()` on each line and maps the `type` field to typed event objects. Malformed lines emit a warning to stderr and are skipped. The `flush()` method processes any remaining buffered data when the stream ends.

## Claude Code hooks system (claude-a11y-hooks)

The hooks module (`packages/node/src/hooks/`) integrates with Claude Code's hooks system to intercept tool output and reformat it into screen-reader-friendly summaries. This is complementary to the CLI wrapper: the CLI replaces the terminal UI entirely, while hooks work alongside Claude Code's native interface by transforming the tool output that Claude Code pipes through its hook system.

Based on claude-sonar (MIT) by @vylasaven.

### Hook event flow

Claude Code invokes `claude-a11y-hooks format` for each hook event, passing event JSON via stdin. The pipeline processes the event as follows:

1. `readStdin()` reads the input (5 second timeout, 5 MB limit)
2. `loadConfig()` loads user config from `~/.config/claude-a11y/hooks/config.json`, merging with defaults
3. `processHookEvent()` parses the event and dispatches to the appropriate handler based on `hook_event_name`
4. For PostToolUse events: the tool output is formatted, classified for significance, sequenced, and optionally accumulated into a digest
5. `buildHookOutput()` constructs the JSON response based on verbosity level
6. stdout receives the JSON response (always, immediately, before any audio)
7. Earcon sounds fire (fire-and-forget, non-blocking)
8. TTS speaks the summary (fire-and-forget, non-blocking)
9. History is recorded for later browsing

### Formatter registry

Each supported tool has a dedicated formatter registered at startup. Formatters receive the tool input and response objects and return a `FormattedOutput` with `contextText` (for the hook JSON response), `ttsText` (for spoken output), and an optional `earcon` ID. Bash commands are further dispatched to recognizers that detect specific patterns (git status, git diff, npm test, npm install).

### Significance classification

Every event is classified as noise (file reads, glob searches), routine (completed commands, web operations), notable (code edits, package installs, failed commands), or important (test failures). Noise-level events are suppressed from TTS and earcons. Users can override classifications per tool via config.

### Code summarization

When code summarization is enabled, the Read, Write, and Edit formatters extract declarations (functions, classes, interfaces, imports) from file content using language-specific regex patterns. Instead of announcing raw code, the formatter announces "3 functions, 1 class, 2 imports" or lists declaration names.

### Configuration

All settings are stored in `~/.config/claude-a11y/hooks/config.json` following XDG conventions. State data (history, digests, progress, sequence counters) is stored in `~/.local/state/claude-a11y/hooks/`. Config supports dotted key paths (`tts.enabled`, `earcon.volume`, `significance.overrides.Read`) and guards against prototype pollution.
