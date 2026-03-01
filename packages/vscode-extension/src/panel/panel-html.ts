/**
 * HTML template generation for the accessible webview panel.
 *
 * Generates semantic HTML with full ARIA support. Screen readers can
 * navigate responses via heading levels (H for next heading in NVDA/JAWS).
 */

export interface PanelMessage {
  id: string;
  formattedText: string;
  timestamp: number;
}

/**
 * Generate the base HTML for the webview panel.
 */
export function generatePanelHtml(
  messages: PanelMessage[],
  nonce: string
): string {
  const messageHtml = messages.map(renderMessage).join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}';">
  <style nonce="${nonce}">
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-panel-background, var(--vscode-editor-background));
      padding: 8px 16px;
      margin: 0;
      line-height: 1.5;
    }

    .message {
      margin-bottom: 16px;
      padding: 8px 12px;
      border-left: 3px solid var(--vscode-textLink-foreground, #007acc);
      background: var(--vscode-editor-background);
    }

    /* High contrast mode */
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

    /* Reduced motion */
    body.vscode-reduce-motion * {
      animation: none !important;
      transition: none !important;
    }

    #empty-state {
      color: var(--vscode-descriptionForeground);
      text-align: center;
      padding: 32px 16px;
    }
  </style>
</head>
<body>
  <div id="nav-help" class="sr-only" role="note">
    Accessible AI Output panel. Use heading navigation to move between responses.
    Level 2 headings mark each response. Level 3 headings mark sections within responses.
  </div>

  <main id="messages" role="log" aria-label="AI Response History" aria-live="polite">
    ${
      messages.length === 0
        ? '<div id="empty-state"><p>No AI responses yet. Use @accessible in the chat panel or run a command.</p></div>'
        : messageHtml
    }
  </main>

  <div id="announcer" aria-live="polite" aria-atomic="true" class="sr-only" role="status"></div>
</body>
</html>`;
}

function renderMessage(message: PanelMessage, index: number): string {
  const time = new Date(message.timestamp).toLocaleTimeString();
  const num = index + 1;

  // Convert the speech-formatted text into semantic HTML
  const contentHtml = speechTextToHtml(message.formattedText);

  return `
    <article class="message" role="article" aria-label="Response ${num}">
      <h2 class="sr-only">Response ${num}, received at ${time}</h2>
      <div class="message-content">${contentHtml}</div>
      <div class="timestamp" aria-hidden="true">${time}</div>
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
