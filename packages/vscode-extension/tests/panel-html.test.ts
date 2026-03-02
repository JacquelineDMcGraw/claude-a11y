import { describe, it, expect } from "vitest";
import { generatePanelHtml, type PanelMessage } from "../src/panel/panel-html.js";

describe("generatePanelHtml()", () => {
  const nonce = "testnonce123";
  const cspSource = "https://test.vscode-cdn.net";
  const scriptUri = "https://test.vscode-cdn.net/panel.js";

  it("generates valid ARIA structure for empty state", () => {
    const html = generatePanelHtml([], nonce, cspSource, scriptUri);
    expect(html).toContain('role="log"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('aria-label="Chat messages"');
    expect(html).toContain("Type a message below to chat with Claude");
  });

  it("generates articles with proper roles for messages", () => {
    const messages: PanelMessage[] = [
      {
        id: "1",
        role: "assistant",
        formattedText: "Hello world",
        timestamp: Date.now(),
      },
    ];
    const html = generatePanelHtml(messages, nonce, cspSource, scriptUri);
    expect(html).toContain('role="article"');
    expect(html).toContain("aria-label=\"Claude's response 1\"");
    expect(html).toContain("<h2");
  });

  it("uses heading hierarchy (h2 for responses)", () => {
    const messages: PanelMessage[] = [
      { id: "1", role: "assistant", formattedText: "[Heading] Title", timestamp: Date.now() },
    ];
    const html = generatePanelHtml(messages, nonce, cspSource, scriptUri);
    // h2 for the response, h3 for heading content within
    expect(html).toContain("<h2");
    expect(html).toContain("<h3");
  });

  it("renders code blocks with ARIA regions", () => {
    const messages: PanelMessage[] = [
      {
        id: "1",
        role: "assistant",
        formattedText: "[Python]\nprint('hi')\n[End Python]",
        timestamp: Date.now(),
      },
    ];
    const html = generatePanelHtml(messages, nonce, cspSource, scriptUri);
    expect(html).toContain('role="region"');
    expect(html).toContain('aria-label="Python code block"');
    expect(html).toContain("Python code:");
    expect(html).toContain("End of Python code.");
  });

  it("includes sr-only navigation help", () => {
    const html = generatePanelHtml([], nonce, cspSource, scriptUri);
    expect(html).toContain('role="note"');
    expect(html).toContain("Accessible AI Chat");
  });

  it("includes ARIA live announcer region", () => {
    const html = generatePanelHtml([], nonce, cspSource, scriptUri);
    expect(html).toContain('id="announcer"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('role="status"');
  });

  it("includes high contrast CSS support", () => {
    const html = generatePanelHtml([], nonce, cspSource, scriptUri);
    expect(html).toContain("vscode-high-contrast");
    expect(html).toContain("contrastBorder");
  });

  it("includes reduced motion CSS support", () => {
    const html = generatePanelHtml([], nonce, cspSource, scriptUri);
    expect(html).toContain("vscode-reduce-motion");
    expect(html).toContain("animation: none");
  });

  it("escapes HTML in message content", () => {
    const messages: PanelMessage[] = [
      {
        id: "1",
        role: "assistant",
        formattedText: "<script>alert('xss')</script>",
        timestamp: Date.now(),
      },
    ];
    const html = generatePanelHtml(messages, nonce, cspSource, scriptUri);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("uses Content Security Policy with nonce", () => {
    const html = generatePanelHtml([], nonce, cspSource, scriptUri);
    expect(html).toContain(`nonce-${nonce}`);
  });
});
