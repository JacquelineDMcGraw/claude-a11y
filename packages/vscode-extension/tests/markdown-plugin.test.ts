import { describe, it, expect } from "vitest";
import { extendMarkdownIt } from "../src/markdown/markdown-plugin.js";

// Minimal mock of markdown-it for testing our plugin
function createMockMd() {
  const rules: Record<string, Function> = {};
  return {
    renderer: {
      rules: new Proxy(rules, {
        get(target, prop) {
          return target[prop as string];
        },
        set(target, prop, value) {
          target[prop as string] = value;
          return true;
        },
      }),
    },
  };
}

function mockSelf() {
  return {
    renderToken(_tokens: any[], _idx: number, _options: any) {
      return "<hr>";
    },
  };
}

describe("extendMarkdownIt()", () => {
  it("overrides the fence renderer", () => {
    const md = createMockMd();
    extendMarkdownIt(md as any);
    expect(md.renderer.rules.fence).toBeDefined();
  });

  it("wraps code fences with ARIA region", () => {
    const md = createMockMd();
    extendMarkdownIt(md as any);

    const tokens = [
      { type: "fence", tag: "code", info: "python", content: "print('hi')", nesting: 0, markup: "```", children: null },
    ];

    const result = md.renderer.rules.fence!(tokens, 0, {}, {}, mockSelf());
    expect(result).toContain('role="region"');
    expect(result).toContain('aria-label="Python code block"');
    expect(result).toContain("[Python]");
    expect(result).toContain("[End Python]");
  });

  it("overrides heading_open renderer", () => {
    const md = createMockMd();
    extendMarkdownIt(md as any);
    expect(md.renderer.rules.heading_open).toBeDefined();
  });

  it("adds [Heading] sr-only prefix to h1-h2", () => {
    const md = createMockMd();
    const original = (_t: any, _i: any, _o: any, _e: any, self: any) =>
      self.renderToken(_t, _i, _o);

    md.renderer.rules.heading_open = original;
    extendMarkdownIt(md as any);

    const tokens = [
      { type: "heading_open", tag: "h2", info: "", content: "", nesting: 1, markup: "##", children: null },
    ];

    const result = md.renderer.rules.heading_open!(tokens, 0, {}, {}, {
      renderToken: () => "<h2>",
    });
    expect(result).toContain("[Heading]");
  });

  it("adds [Subheading] sr-only prefix to h3+", () => {
    const md = createMockMd();
    extendMarkdownIt(md as any);

    const tokens = [
      { type: "heading_open", tag: "h3", info: "", content: "", nesting: 1, markup: "###", children: null },
    ];

    const result = md.renderer.rules.heading_open!(tokens, 0, {}, {}, {
      renderToken: () => "<h3>",
    });
    expect(result).toContain("[Subheading]");
  });

  it("overrides hr renderer with [Separator]", () => {
    const md = createMockMd();
    extendMarkdownIt(md as any);
    expect(md.renderer.rules.hr).toBeDefined();

    const tokens = [
      { type: "hr", tag: "hr", info: "", content: "", nesting: 0, markup: "---", children: null },
    ];

    const result = md.renderer.rules.hr!(tokens, 0, {}, {}, mockSelf());
    expect(result).toContain("[Separator]");
  });
});
