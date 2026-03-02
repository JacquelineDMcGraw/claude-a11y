# Architecture

## Overview

claude-a11y makes AI chat interfaces accessible to screen readers. It transforms rendered markdown into structured, navigable output without changing visual appearance. Only the accessibility tree is modified.

The project uses three injection vectors to cover the surfaces where developers interact with AI:

- Browser extension (Chrome, Edge, Brave) -- DOM transformation on claude.ai via MutationObserver
- Editor extension (VS Code, Cursor) -- chat participant API, webview panel, and workbench.html DOM injection
- CLI wrapper (claude-sr) -- subprocess spawning with remark AST-to-speech rendering

All three share a core library (`@claude-accessible/core`) that provides ANSI sanitization, markdown-to-speech formatting, stream parsing, and tool activity announcements.

## Core transformation engine: chat-a11y.js

`packages/chrome-extension/chat-a11y.js` is a self-contained IIFE that runs in the main world of any page containing AI chat output. It is used by the Chrome extension, the Cursor workbench.html injection, and manual Claude Desktop console injection.

### MutationObserver pattern

A MutationObserver watches `document.documentElement` for `childList`, `subtree`, and `characterData` mutations. When new element nodes are added, they are processed immediately. When character data changes (streaming responses), a debounced full scan is scheduled at 300ms to avoid thrashing during rapid token delivery.

### Element transformation pipeline

Each element is tagged with `data-ca11y="1"` after transformation to prevent double-processing. The pipeline runs these transforms in order: code blocks (pre elements get `role="region"` and `aria-label`), inline code, headings (sr-only prefix spans), tables (`role="table"` with column headers), blockquotes (`role="note"`), horizontal rules (`role="separator"`), images (fallback alt text), links (fallback text content), and lists (item count announcements).

Screen-reader-only spans use the standard visually-hidden CSS pattern: 1px clipped box with `overflow: hidden`. These are invisible to sighted users but read by assistive technology.

### TrustedTypes policy

Cursor enforces strict Content Security Policy with Trusted Types. The script creates a `claudeAccessible` policy via `window.trustedTypes.createPolicy()` at initialization. If policy creation fails (non-TT environments), it falls back silently.

### ARIA live region

A visually-hidden `div` with `role="status"` and `aria-live="polite"` is appended to the body. The `announce()` function clears its text content, then sets new text after a 100ms delay so screen readers detect the change event.

### Debounced scanning with periodic rescans

The observer triggers a debounced `scanAll()` at 300ms. In addition, aggressive initial scans fire at 1s, 3s, 5s, and 10s after injection to catch first-render content. A 15-second interval handles lazy rendering in Cursor, where the MutationObserver may miss elements rendered outside the observed subtree.

### Selector strategy

Chat message containers are matched by a union of selectors across apps:

- claude.ai / Claude Desktop: `[data-testid="chat-message-content"]`, `[class*="font-claude"]`, `.prose`, `[data-testid="conversation-turn"]`
- Cursor: `[class*="agentTurn"]`, `[class*="markdown"]`, `[class*="chat-response"]`, `[class*="assistantMessage"]`
- VS Code: `.interactive-result-editor-wrapper`, `.chat-tree-container`, `.rendered-markdown`

A catch-all pass scans for bare `pre`, `table`, `blockquote`, and heading elements regardless of container.

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

### WebviewViewProvider with ARIA-annotated HTML

`AccessiblePanelProvider` implements `vscode.WebviewViewProvider`. It renders a full chat interface as semantic HTML: a `main` element with `role="log"` and `aria-live="polite"` contains `article` elements for each message. Code blocks are wrapped in `role="region"` divs with `aria-label`. The HTML includes a labeled textarea for input, an announcer div with `aria-live="assertive"`, and screen-reader-only navigation hints. CSP headers include the webview's `cspSource` and a nonce for inline styles.

### Cursor DOM injection via workbench.html patching

`packages/vscode-extension/src/inject/patcher.ts` locates Cursor's `workbench.html` by searching known paths under `vscode.env.appRoot` (electron-sandbox, electron-browser, and desktop variants). The `install()` function copies `chat-a11y.js` alongside the HTML file, appends a `<script>` tag between `<!-- claude-accessible-start -->` and `<!-- claude-accessible-end -->` markers before `</html>`, adds the `claudeAccessible` policy name to the Trusted Types CSP directive, and creates a backup of the original file. Uninstall restores from backup or strips the markers.

### esbuild bundling

The remark ecosystem (unified, remark-parse, remark-gfm) is ESM-only. The extension must produce a single CJS bundle for VS Code's Node.js runtime. `esbuild.mjs` bundles the extension entry point with `format: "cjs"`, `platform: "node"`, and `mainFields: ["module", "main"]` with `conditions: ["import", "node"]` to resolve ESM packages. Only `vscode` is external.

## CLI architecture

### Subprocess spawning with environment variable sanitization

`packages/cli/src/runner.ts` spawns the `claude` binary as a child process. The environment is copied from `process.env` with three overrides: `NO_COLOR=1`, `FORCE_COLOR=0`, and `TERM=dumb`. These suppress ANSI color output at the source. stdio is set to `["pipe", "pipe", "pipe"]` for full stream control.

### Stream parser for Claude's streaming JSON format

`createStreamParser()` in `@claude-accessible/core` implements line-buffered NDJSON parsing. Each line from `claude -p --output-format stream-json --verbose` is parsed into typed events: `init` (session ID), `text`/`text_delta` (response content), `tool_use` (tool activity), `tool_result`, and `result` (cost, turns, errors). The parser handles chunks that split across line boundaries by maintaining an internal line buffer.

### remark AST to speech text pipeline

`initFormatter()` dynamically imports unified, remark-parse, and remark-gfm, then caches the processor. `formatForSpeech()` parses markdown into an mdast AST and walks it with `renderNode()`. Each node type maps to a speech-friendly representation: code fences become `[Python]` / `[End Python]`, headings become `[Heading] text`, list items become `Bullet: text` or numbered prefixes, tables become `[Table, N columns]` with labeled rows, and inline formatting (bold, italic) is silently stripped to its text content.

### REPL with readline over stderr

`packages/cli/src/repl.ts` creates a `readline.Interface` with `output: process.stderr`. This keeps the prompt, tool announcements, and thinking indicators on stderr while stdout contains only Claude's sanitized response text. Piping `claude-sr "question" > output.txt` captures a clean response. The REPL maintains session state (session ID, accumulated cost, turn count) and passes `--resume` on subsequent turns.

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

The core library (`packages/core/src/`) exports five modules through a barrel `index.ts`:

- `sanitizer.ts`: ANSI escape code stripping. No dependencies. Exports `sanitize()` for complete strings and `createChunkSanitizer()` for streaming chunks with partial-sequence buffering.
- `speech-formatter.ts`: Markdown-to-speech rendering. Depends on unified, remark-parse, and remark-gfm (dynamically imported). Exports `initFormatter()` and `formatForSpeech()`.
- `announcer.ts`: Tool activity formatting. Depends on `types.ts`. Exports `announceToolUse()`, `announceResult()`, `announceError()`, and `writeAnnouncement()`.
- `stream-parser.ts`: NDJSON line parser. Depends on `types.ts`. Exports `parseStreamLine()` and `createStreamParser()`.
- `verbosity.ts`: Verbosity filtering. Depends on `speech-formatter.ts`. Wraps `formatForSpeech()` with three levels: minimal (code blocks and headings only), normal (full output), and detailed (adds line counts and table dimensions).

### sanitizer to speech-formatter to announcer pipeline

In the CLI, data flows through these modules in sequence. Raw subprocess output passes through `createChunkSanitizer()` to strip ANSI codes while handling sequences split across chunk boundaries. The sanitized text is then passed to `formatForSpeech()` to convert markdown into speech-friendly plain text. Tool activity events are separately routed through `announceToolUse()` and written to stderr via `writeAnnouncement()`.

### stream-parser for JSON streaming mode

`createStreamParser()` accepts raw `Buffer` or `string` chunks from the subprocess stdout. It maintains an internal line buffer, splits on newlines, and passes each complete line to `parseStreamLine()`. The line parser attempts `JSON.parse()` on each line and maps the `type` field to typed event objects. Malformed lines emit a warning to stderr and are skipped. The `flush()` method processes any remaining buffered data when the stream ends.
