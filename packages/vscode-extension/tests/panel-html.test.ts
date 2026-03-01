import { describe, it, expect } from "vitest";
import { generatePanelHtml, type PanelMessage } from "../src/panel/panel-html.js";

describe("generatePanelHtml()", () => {
  const nonce = "testnonce123";

  it("generates valid ARIA structure for empty state", () => {
    const html = generatePanelHtml([], nonce);
    expect(html).toContain('role="log"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('aria-label="AI Response History"');
    expect(html).toContain("No AI responses yet");
  });

  it("generates articles with proper roles for messages", () => {
    const messages: PanelMessage[] = [
      {
        id: "1",
        formattedText: "Hello world",
        timestamp: Date.now(),
      },
    ];
    const html = generatePanelHtml(messages, nonce);
    expect(html).toContain('role="article"');
    expect(html).toContain('aria-label="Response 1"');
    expect(html).toContain("<h2");
    expect(html).toContain("Response 1");
  });

  it("uses heading hierarchy (h2 for responses)", () => {
    const messages: PanelMessage[] = [
      { id: "1", formattedText: "[Heading] Title", timestamp: Date.now() },
    ];
    const html = generatePanelHtml(messages, nonce);
    // h2 for the response, h3 for heading content within
    expect(html).toContain("<h2");
    expect(html).toContain("<h3");
  });

  it("renders code blocks with ARIA regions", () => {
    const messages: PanelMessage[] = [
      {
        id: "1",
        formattedText: "[Python]\nprint('hi')\n[End Python]",
        timestamp: Date.now(),
      },
    ];
    const html = generatePanelHtml(messages, nonce);
    expect(html).toContain('role="region"');
    expect(html).toContain('aria-label="Python code block"');
    expect(html).toContain("Python code:");
    expect(html).toContain("End of Python code.");
  });

  it("includes sr-only navigation help", () => {
    const html = generatePanelHtml([], nonce);
    expect(html).toContain('role="note"');
    expect(html).toContain("heading navigation");
  });

  it("includes ARIA live announcer region", () => {
    const html = generatePanelHtml([], nonce);
    expect(html).toContain('id="announcer"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('role="status"');
  });

  it("includes high contrast CSS support", () => {
    const html = generatePanelHtml([], nonce);
    expect(html).toContain("vscode-high-contrast");
    expect(html).toContain("contrastBorder");
  });

  it("includes reduced motion CSS support", () => {
    const html = generatePanelHtml([], nonce);
    expect(html).toContain("vscode-reduce-motion");
    expect(html).toContain("animation: none");
  });

  it("escapes HTML in message content", () => {
    const messages: PanelMessage[] = [
      {
        id: "1",
        formattedText: "<script>alert('xss')</script>",
        timestamp: Date.now(),
      },
    ];
    const html = generatePanelHtml(messages, nonce);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("uses Content Security Policy with nonce", () => {
    const html = generatePanelHtml([], nonce);
    expect(html).toContain(`nonce-${nonce}`);
  });
});
