# Implementation Plan: VS Code/Cursor Extension + Monorepo Restructure

## Overview

Restructure claude-accessible into a monorepo with three packages:
1. **`@claude-accessible/core`** — shared speech formatting, sanitization, types
2. **`packages/cli`** — the existing `claude-sr` CLI tool
3. **`packages/vscode-extension`** — new VS Code/Cursor extension

The extension provides an accessible AI coding experience through:
- A `@accessible` chat participant with speech-formatted responses
- An "Accessible AI Output" panel (webview sidebar with ARIA live regions)
- An output channel for universal screen reader compatibility
- A markdown-it plugin for accessible markdown preview rendering
- Commands to format any selected text or clipboard for screen readers
- Auto-detection of screen reader + configurable verbosity levels

---

## Phase 1: Monorepo Restructure

### Step 1.1 — Create directory structure
```
packages/
  core/        (shared library)
  cli/         (existing claude-sr)
  vscode-extension/  (new)
```

### Step 1.2 — Move shared modules to `packages/core/src/`
- `speech-formatter.ts` (the remark AST transformer)
- `sanitizer.ts` (ANSI stripping)
- `announcer.ts` (tool activity formatting)
- `types.ts` (type definitions)
- `stream-parser.ts` (NDJSON parser)
- New: `verbosity.ts` (minimal/normal/detailed filtering)
- New: `index.ts` (barrel export)

### Step 1.3 — Move CLI modules to `packages/cli/src/`
- `index.ts`, `runner.ts`, `repl.ts`, `session.ts`
- Update imports from `./speech-formatter.js` → `@claude-accessible/core`
- Move `bin/`, test fixtures, integration tests

### Step 1.4 — Move tests alongside their packages
- Core tests → `packages/core/tests/`
- CLI tests → `packages/cli/tests/`

### Step 1.5 — Root workspace config
- Root `package.json` with `"workspaces": ["packages/*"]`
- Root `tsconfig.base.json` with shared compiler settings
- Each package extends the base tsconfig
- Verify all 149 existing tests still pass

---

## Phase 2: `packages/core` — Shared Library

### Step 2.1 — `packages/core/package.json`
```json
{
  "name": "@claude-accessible/core",
  "version": "1.0.0",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "dependencies": {
    "unified": "^11.0.5",
    "remark-parse": "^11.0.0",
    "remark-gfm": "^4.0.1"
  }
}
```

### Step 2.2 — `packages/core/src/index.ts` barrel export
```typescript
export { initFormatter, formatForSpeech } from './speech-formatter.js';
export { sanitize, createChunkSanitizer } from './sanitizer.js';
export { announceToolUse, announceResult, announceError } from './announcer.js';
export { createStreamParser, parseStreamLine } from './stream-parser.js';
export { createVerbosityFilter, type VerbosityLevel } from './verbosity.js';
export type { ParsedEvent, ContentBlock, StreamMessage, ... } from './types.js';
```

### Step 2.3 — New `verbosity.ts` module
Three levels that wrap `formatForSpeech()`:
- **minimal**: Only code block and heading announcements
- **normal**: Default — everything the current formatter produces
- **detailed**: Adds line counts for code blocks, character counts, richer descriptions

---

## Phase 3: VS Code Extension

### Step 3.1 — Extension scaffold
Create `packages/vscode-extension/` with:
- `package.json` (extension manifest with contributes)
- `tsconfig.json` (references `../core`)
- `esbuild.mjs` (bundles core + remark into single CJS file)
- `.vscodeignore`
- `src/extension.ts` (activation entry point)

### Step 3.2 — Feature: `@accessible` Chat Participant

**What it does:** A chat participant (`@accessible`) that users invoke in VS Code's chat panel. All AI responses are piped through `formatForSpeech()` before display.

**How it works:**
1. User types `@accessible explain this code` in chat
2. Handler selects a backend:
   - **Language Model API** (if Copilot/compatible extension available)
   - **Claude CLI subprocess** (if claude is installed, using stream-json)
   - **Auto** mode tries Language Model API first, falls back to CLI
3. Streams the raw AI response
4. Buffers text at paragraph boundaries (double newlines)
5. Formats each complete paragraph through `formatForSpeech()`
6. Writes formatted output to the `ChatResponseStream`
7. Mirrors to the output channel and webview panel

**Slash commands:**
- `/format` — Format selected text or clipboard for screen reader
- `/explain` — Explain code with structural annotations
- `/verbosity` — Change verbosity level on the fly

**Files:**
- `src/chat/participant.ts` — Handler registration and request routing
- `src/chat/claude-backend.ts` — Language Model API + CLI subprocess backends
- `src/chat/response-formatter.ts` — Paragraph buffering + core formatter pipe
- `src/chat/history.ts` — Chat history for multi-turn context

### Step 3.3 — Feature: Accessible Output Panel

**What it does:** A dedicated webview panel in the bottom panel area that shows all AI responses formatted as semantic HTML with full ARIA support.

**Key accessibility features:**
- `role="log"` container with `aria-live="polite"` for new responses
- Each response is an `<article>` with `role="article"` and heading navigation (h2 per response, h3 per section)
- Code blocks wrapped in `role="region"` with `aria-label="Python code block"`
- Screen-reader-only text for [Python]/[End Python] cues
- Respects `vscode-using-screen-reader` CSS class
- High contrast and reduced motion support
- Keyboard navigable (H to jump between responses)

**Files:**
- `src/panel/accessible-panel.ts` — WebviewViewProvider
- `src/panel/panel-html.ts` — HTML template with ARIA structure
- `src/panel/message-store.ts` — Stores formatted messages

### Step 3.4 — Feature: Output Channel

**What it does:** A "Accessible AI Output" output channel that receives all formatted responses as plain text. Screen readers can read output channels natively — this is the most reliable accessibility path.

**Files:**
- `src/output/output-channel.ts` — Channel creation and message routing
- `src/output/clipboard-format.ts` — "Paste and Format" clipboard integration

### Step 3.5 — Feature: Inline Accessibility

**What it does:** Enhances inline editor experiences for screen reader users.

- **Hover tooltips** with speech-formatted content when screen reader is active
- **Status bar item** showing accessibility state + verbosity level
- **Code action** "Format for Screen Reader" on selected text

**Files:**
- `src/inline/hover-provider.ts`
- `src/inline/status-bar.ts`
- `src/inline/code-action.ts`

### Step 3.6 — Feature: Markdown-it Plugin

**What it does:** Extends VS Code's built-in markdown rendering (preview, chat, hover) with screen-reader-friendly annotations.

- Code fences get `role="region"` + `aria-label` + sr-only [Python]/[End Python] text
- Headings get sr-only [Heading]/[Subheading] prefixes
- Tables get structural ARIA roles

**Files:**
- `src/markdown/markdown-plugin.ts` — markdown-it renderer overrides
- Registered via `"markdown.markdownItPlugins": true` in extension manifest

### Step 3.7 — Feature: Settings & Screen Reader Detection

**Settings** (`claude-accessible.*`):
- `enabled` (boolean) — master toggle
- `autoActivate` (boolean) — auto-enable when screen reader detected
- `verbosity` (minimal/normal/detailed) — how much annotation
- `announceToolUse` (boolean) — announce when AI uses tools
- `announceMode` (notification/output/both) — where announcements go
- `codeBlockAnnouncement` (language/language-and-lines/minimal) — code block style
- `outputToChannel` (boolean) — mirror to output channel
- `backend` (language-model-api/claude-cli/auto) — AI backend selection
- `claudeCliPath` (string) — custom path to claude binary

**Screen reader detection:**
- Reads `editor.accessibilitySupport` setting (on/off/auto)
- Listens for changes to activate/deactivate features

**Files:**
- `src/config.ts`
- `src/screen-reader-detect.ts`

### Step 3.8 — Feature: Keybindings

- `Cmd+Shift+Alt+F` — Format selection for screen reader
- `Cmd+Shift+Alt+R` — Read last AI response
- `Cmd+Shift+Alt+A` — Show accessible panel

### Step 3.9 — Commands

| Command | Title |
|---|---|
| `claude-accessible.formatSelection` | Format Selection for Screen Reader |
| `claude-accessible.formatClipboard` | Format Clipboard for Screen Reader |
| `claude-accessible.showPanel` | Show Accessible AI Panel |
| `claude-accessible.clearPanel` | Clear Accessible AI Panel |
| `claude-accessible.toggleAutoFormat` | Toggle Auto-Format |
| `claude-accessible.readLastResponse` | Read Last AI Response |
| `claude-accessible.setVerbosity` | Set Verbosity Level |

---

## Phase 4: Build System

### Extension bundling (`esbuild.mjs`)
- Bundles `@claude-accessible/core` + all remark dependencies into single CJS file
- esbuild handles ESM→CJS conversion for remark ecosystem
- Only `vscode` module is external (provided at runtime)
- Production mode: minified, no sourcemaps
- Dev mode: watch + sourcemaps

### Build order
1. `packages/core` (tsc → dist/)
2. `packages/cli` (tsc → dist/)
3. `packages/vscode-extension` (esbuild → dist/extension.js)

---

## Phase 5: Testing

### Core tests (existing 149 → packages/core + packages/cli)
- Speech formatter: 41 tests
- Sanitizer: 51 tests
- Stream parser: 21 tests
- Announcer: 25 tests
- Integration: 11 tests

### New extension tests
- Chat participant handler (mocked vscode API)
- Response formatter pipeline
- Panel HTML accessibility validation (ARIA attributes, heading hierarchy)
- Verbosity filter levels
- Screen reader detection logic
- Config management
- markdown-it plugin output

### CI matrix
- Core + CLI: Linux/macOS/Windows × Node 18/20/22
- Extension: Linux + Node 20 (build + unit tests)
- Extension packaging: Build .vsix artifact

---

## Phase 6: Distribution

1. **VS Code Marketplace** — publish under `jackies-jawn` publisher
2. **Open VSX Registry** — same .vsix, enables Cursor discovery
3. **Direct .vsix download** — for offline/restricted environments
4. **npm** — CLI continues as `claude-accessible`, core as `@claude-accessible/core`

---

## Cursor Compatibility Notes

- Cursor is a VS Code fork — standard extensions work
- Chat participant API may not be available in Cursor (it has its own chat)
- Extension degrades gracefully: if `vscode.chat` unavailable, skips participant registration
- Output channel, commands, markdown-it plugin, and webview panel all work regardless
- Publish to Open VSX for Cursor Extensions panel discovery

---

## Implementation Order

1. Monorepo restructure (Phase 1) — ~30 min
2. Core package setup with verbosity module (Phase 2) — ~15 min
3. Extension scaffold + activation + config (Phase 3.1, 3.7) — ~20 min
4. Output channel (Phase 3.4) — ~10 min (simplest, most reliable)
5. Chat participant + backends (Phase 3.2) — ~45 min (core feature)
6. Accessible panel webview (Phase 3.3) — ~30 min
7. markdown-it plugin (Phase 3.6) — ~15 min
8. Inline features (Phase 3.5) — ~15 min
9. Commands + keybindings (Phase 3.8, 3.9) — ~10 min
10. Build system + packaging (Phase 4) — ~15 min
11. Tests (Phase 5) — ~30 min
12. Verify everything, commit — ~10 min
