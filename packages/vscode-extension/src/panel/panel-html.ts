/**
 * HTML template generation for the accessible chat panel.
 *
 * A full chat interface with an input box and formatted responses.
 * Screen readers navigate via heading levels (H for next heading in NVDA/JAWS).
 * The input box and responses use proper ARIA live regions.
 */

export interface PanelMessage {
  id: string;
  formattedText: string;
  timestamp: number;
  role: "user" | "assistant";
}

/**
 * Generate the full chat HTML for the webview panel.
 * @param cspSource - From webview.cspSource; required for Trusted Types compatibility in Cursor.
 * @param scriptUri - URI to panel.js; external script avoids TrustedScript/Function constructor errors.
 */
export function generatePanelHtml(
  messages: PanelMessage[],
  nonce: string,
  cspSource: string,
  scriptUri: string
): string {
  const messageHtml = messages.map(renderMessage).join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}' ${cspSource}; script-src 'nonce-${nonce}' ${cspSource}; trusted-types default panel-html;">
  <style nonce="${nonce}">
    * { box-sizing: border-box; }

    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-panel-background, var(--vscode-editor-background));
      padding: 0;
      margin: 0;
      line-height: 1.5;
      display: flex;
      flex-direction: column;
      height: 100vh;
    }

    #messages {
      flex: 1;
      overflow-y: auto;
      padding: 8px 16px;
    }

    .message {
      margin-bottom: 16px;
      padding: 8px 12px;
      border-left: 3px solid var(--vscode-textLink-foreground, #007acc);
      background: var(--vscode-editor-background);
    }

    .message.user-message {
      border-left-color: var(--vscode-terminal-ansiGreen, #4ec9b0);
      background: transparent;
    }

    body.vscode-high-contrast .message {
      border: 2px solid var(--vscode-contrastBorder);
    }

    .message-content {
      white-space: pre-wrap;
      word-wrap: break-word;
    }

    .code-block {
      background: var(--vscode-textCodeBlock-background, #1e1e1e);
      padding: 8px 12px;
      margin: 8px 0;
      border-radius: 3px;
      font-family: var(--vscode-editor-font-family);
      font-size: var(--vscode-editor-font-size);
    }

    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }

    .timestamp {
      color: var(--vscode-descriptionForeground);
      font-size: 0.85em;
    }

    #input-area {
      padding: 8px 16px;
      border-top: 1px solid var(--vscode-panel-border, var(--vscode-widget-border, #444));
      background: var(--vscode-editor-background);
    }

    #input-area label {
      display: block;
      margin-bottom: 4px;
      font-weight: bold;
    }

    #prompt-input {
      width: 100%;
      min-height: 60px;
      max-height: 200px;
      padding: 8px;
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-input-foreground);
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border, #444);
      border-radius: 3px;
      resize: vertical;
    }

    #prompt-input:focus {
      outline: 2px solid var(--vscode-focusBorder);
      outline-offset: -1px;
    }

    #send-btn {
      margin-top: 4px;
      padding: 6px 16px;
      font-size: var(--vscode-font-size);
      color: var(--vscode-button-foreground);
      background: var(--vscode-button-background);
      border: none;
      border-radius: 3px;
      cursor: pointer;
    }

    #send-btn:hover {
      background: var(--vscode-button-hoverBackground);
    }

    #send-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    #status {
      margin-top: 4px;
      font-size: 0.85em;
      color: var(--vscode-descriptionForeground);
    }

    #empty-state {
      color: var(--vscode-descriptionForeground);
      text-align: center;
      padding: 32px 16px;
    }

    body.vscode-reduce-motion * {
      animation: none !important;
      transition: none !important;
    }
  </style>
</head>
<body>
  <div id="nav-help" class="sr-only" role="note">
    Accessible AI Chat. Type your question in the text area at the bottom and press Enter or click Send.
    Responses are formatted for screen readers with structural announcements for code, headings, and lists.
  </div>

  <main id="messages" role="log" aria-label="Chat messages" aria-live="polite">
    ${
      messages.length === 0
        ? '<div id="empty-state"><p>Type a message below to chat with Claude. All responses are formatted for screen readers.</p></div>'
        : messageHtml
    }
  </main>

  <div id="input-area" role="form" aria-label="Send a message">
    <label for="prompt-input">Ask Claude:</label>
    <textarea
      id="prompt-input"
      placeholder="Type your question here..."
      aria-describedby="input-help"
      rows="3"
    ></textarea>
    <span id="input-help" class="sr-only">Press Enter to send, Shift+Enter for a new line.</span>
    <div style="display: flex; align-items: center; gap: 8px;">
      <button id="send-btn" type="button">Send</button>
      <span id="status" role="status" aria-live="polite"></span>
    </div>
  </div>

  <div id="announcer" aria-live="assertive" aria-atomic="true" class="sr-only" role="status"></div>

  <script src="${scriptUri}"></script>
</body>
</html>`;
}

function renderMessage(message: PanelMessage, index: number): string {
  const time = new Date(message.timestamp).toLocaleTimeString();
  const num = index + 1;

  if (message.role === "user") {
    return `
    <article class="message user-message" role="article" aria-label="Your message ${num}">
      <h2 class="sr-only">You, at ${time}</h2>
      <div class="message-content">${escapeHtml(message.formattedText)}</div>
    </article>`;
  }

  // Assistant message — convert speech-formatted text into semantic HTML
  const contentHtml = speechTextToHtml(message.formattedText);

  return `
    <article class="message" role="article" aria-label="Claude's response ${num}">
      <h2 class="sr-only">Claude, at ${time}</h2>
      <div class="message-content">${contentHtml}</div>
    </article>`;
}

/**
 * Convert speech-formatted text into semantic HTML.
 * Maps our [Python]/[End Python] markers to proper ARIA-annotated elements.
 */
function speechTextToHtml(text: string): string {
  const lines = text.split("\n");
  const html: string[] = [];
  let inCode = false;
  let codeLang = "";

  for (const line of lines) {
    // Code block start: [Python], [Bash], [Code], etc.
    const codeStart = line.match(
      /^\[(Python|Javascript|Typescript|Bash|Code|Json|Css|Html|Rust|Go|Java|Ruby|Shell|Sql|[A-Z][a-z]+)\]$/
    );
    if (codeStart && !inCode) {
      inCode = true;
      codeLang = codeStart[1]!;
      html.push(
        `<div class="code-block" role="region" aria-label="${codeLang} code block">`,
        `<span class="sr-only">${codeLang} code:</span>`,
        "<pre><code>"
      );
      continue;
    }

    // Code block end: [End Python], etc.
    const codeEnd = line.match(/^\[End [A-Z].*\]$/);
    if (codeEnd && inCode) {
      inCode = false;
      html.push("</code></pre>");
      html.push(`<span class="sr-only">End of ${codeLang} code.</span>`);
      html.push("</div>");
      codeLang = "";
      continue;
    }

    // Inside code block — escape HTML and preserve formatting
    if (inCode) {
      html.push(escapeHtml(line));
      continue;
    }

    // Heading markers
    const heading = line.match(/^\[(Heading|Subheading)\]\s*(.+)$/);
    if (heading) {
      const tag = heading[1] === "Heading" ? "h3" : "h4";
      html.push(`<${tag}>${escapeHtml(heading[2]!)}</${tag}>`);
      continue;
    }

    // Separator
    if (line === "[Separator]") {
      html.push('<hr role="separator">');
      continue;
    }

    // Regular text
    if (line.trim()) {
      html.push(`<p>${escapeHtml(line)}</p>`);
    }
  }

  return html.join("\n");
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
