import { describe, it, expect, beforeAll } from "vitest";
import { initFormatter } from "@claude-accessible/core";
import { ParagraphBuffer } from "../src/chat/response-formatter.js";

beforeAll(async () => {
  await initFormatter();
});

describe("ParagraphBuffer", () => {
  it("buffers until a paragraph boundary", () => {
    const buffer = new ParagraphBuffer("normal");

    // No double newline yet — nothing emitted
    const r1 = buffer.append("Hello ");
    expect(r1).toEqual([]);

    const r2 = buffer.append("world.");
    expect(r2).toEqual([]);

    // Double newline triggers paragraph drain
    const r3 = buffer.append("\n\nNext paragraph");
    expect(r3.length).toBe(1);
    expect(r3[0]).toBe("Hello world.");
  });

  it("flushes remaining content", () => {
    const buffer = new ParagraphBuffer("normal");
    buffer.append("Last chunk");
    const flushed = buffer.flush();
    expect(flushed).toBe("Last chunk");
  });

  it("formats markdown through speech formatter", () => {
    const buffer = new ParagraphBuffer("normal");

    // First append contains a paragraph boundary — heading is drained immediately
    const first = buffer.append("# Heading\n\nBody text");
    expect(first.length).toBe(1);
    expect(first[0]).toContain("[Heading]");

    // Second append triggers drain of "Body text"
    const second = buffer.append("\n\n");
    expect(second.length).toBe(1);
    expect(second[0]).toContain("Body text");
  });

  it("does not split inside code fences", () => {
    const buffer = new ParagraphBuffer("normal");

    // Code block with double newlines inside — should NOT split
    const r = buffer.append("```python\nprint('a')\n\nprint('b')\n```");
    // Nothing should be emitted because the code fence isn't closed in a paragraph boundary
    expect(r).toEqual([]);

    // Flush gets the whole block
    const flushed = buffer.flush();
    expect(flushed).toContain("[Python]");
    expect(flushed).toContain("[End Python]");
  });

  it("handles empty flush", () => {
    const buffer = new ParagraphBuffer("normal");
    expect(buffer.flush()).toBe("");
  });

  it("respects verbosity levels", () => {
    const minimal = new ParagraphBuffer("minimal");
    minimal.append("[Quote] some text");
    const result = minimal.flush();
    // Minimal strips [Quote] prefix
    expect(result).not.toMatch(/^\[Quote\]/);
  });
});
