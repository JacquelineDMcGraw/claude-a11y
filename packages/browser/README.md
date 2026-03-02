# Claude A11y -- Chrome Extension

Chrome extension that adds screen reader accessibility to claude.ai. Transforms rendered markdown in chat responses into semantic, ARIA-annotated markup without changing the visual appearance.

## What it does

Claude.ai renders AI responses as styled HTML, but screen readers often miss structural cues like code block boundaries, heading levels, and table layouts. This extension intercepts rendered chat messages and adds:

- Code blocks: `aria-label` announcing the language (no `role="region"` — avoids landmark pollution). Screen-reader-only markers like "[Python]" and "[End Python]" bracket the code.
- Headings: sr-only "[Heading]" or "[Subheading]" prefix injected before the text.
- Tables: row/column count announced before the table. Header cells get `role="columnheader"` and `scope="col"`. "[End Table]" marks the boundary.
- Lists: item count and type ("bulleted" or "numbered") announced before each list.
- Blockquotes: `role="note"` with a "[Quote]" prefix.
- Inline code: `role="text"` with the code content as `aria-label`.
- Images: ensures `alt` text exists (defaults to "Image").
- Links: empty links get their URL as visible text.
- Horizontal rules: `role="separator"` with an `aria-label`.
- Chat messages: each AI response container gets `role="region"` with `aria-label="AI response"` (the only landmark added per response).

An ARIA live region (`aria-live="polite"`) is created for streaming announcements.

## How it works

1. content.js runs as a content script on claude.ai at `document_idle`.
2. It fetches chat-a11y.js from the extension bundle and injects it into the page's main world (not the extension's isolated world) by creating a temporary script element.
3. chat-a11y.js sets up a MutationObserver on `document.documentElement` watching for `childList`, `subtree`, and `characterData` changes.
4. When new DOM nodes appear (a new message streams in), the observer runs transformation functions on the added elements.
5. A debounced full-page scan runs after mutations settle (300ms). A self-disabling 30-second fallback rescan catches lazily rendered content and shuts itself off after 20 idle cycles.

All transforms are idempotent. Each processed element gets a `data-ca11y="1"` attribute to prevent double processing.

## Installation

### Developer mode (current)

1. Clone this repository.
2. Open `chrome://extensions` in Chrome.
3. Enable "Developer mode" (toggle in the top right).
4. Click "Load unpacked" and select the `packages/browser` directory.
5. Navigate to claude.ai. The extension activates automatically.

### Chrome Web Store (planned)

Not yet published. A Web Store listing is planned for a future release.

## Permissions

The extension requests two permissions:

- activeTab: Allows the extension to read the URL of the active tab so the popup can determine if you are on claude.ai. Does not grant access to other tabs.
- scripting: Required by background.js to execute `__ca11yScan()` and `__ca11yStats()` in the page's main world when the popup requests a force rescan or stats update.

The extension also uses local storage (chrome.storage.local) to track anonymous session stats for feedback export. No data is sent anywhere -- it stays on your machine until you choose to export it via the popup.

## Debugging

Open the browser console on claude.ai and run:

- `__ca11yStats()` -- Returns an object with `transformCount` (number of elements processed), `hasTrustedTypes`, `hasLiveRegion`, `observerActive`, `fallbackActive` (whether the periodic rescan is still running), and `selectorHealthWarning` (true if no chat containers were found after 10 seconds).
- `__ca11yScan()` -- Triggers an immediate full-page scan. Useful if content was missed.

The extension popup (click the toolbar icon) shows the same stats and provides a "Force Rescan" button.

Console messages from the extension are prefixed with `[claude-a11y]`.

## File overview

- manifest.json -- Manifest V3 configuration. Targets `*://claude.ai/*`.
- content.js -- Content script. Fetches and injects chat-a11y.js into the main world.
- chat-a11y.js -- Core transformation logic. MutationObserver, ARIA transforms, debug globals.
- background.js -- Service worker. Relays messages between popup and content script.
- popup.html / popup.js -- Extension popup UI. Shows status, stats, and rescan button.

## License

MIT
