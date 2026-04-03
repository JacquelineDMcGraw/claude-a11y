import { describe, it, expect } from "vitest";
import { grepFormatter } from "../../../src/hooks/formatters/grep.js";
import fixture from "../fixtures/hook-inputs/grep.json";

describe("grepFormatter", () => {
  it("formats grep results", () => {
    const result = grepFormatter.format(fixture);
    expect(result.contextText).toContain("TODO");
    expect(result.contextText).toContain("2 matches");
    expect(result.contextText).toContain("2 files");
    expect(result.ttsText).toContain("2 matches");
    expect(result.ttsText).toContain("2 files");
  });

  it("handles no matches", () => {
    const input = {
      tool_name: "Grep",
      tool_input: { pattern: "NONEXIST" },
      tool_response: { output: "" },
    };
    const result = grepFormatter.format(input);
    expect(result.ttsText).toContain("No matches");
  });

  it("shows top files with match counts", () => {
    const result = grepFormatter.format({
      tool_name: "Grep",
      tool_input: { pattern: "import" },
      tool_response: {
        output: [
          "src/a.ts:1:import foo",
          "src/a.ts:2:import bar",
          "src/a.ts:3:import baz",
          "src/b.ts:1:import x",
          "src/c.ts:1:import y",
        ].join("\n"),
      },
    });
    expect(result.contextText).toContain("Top files:");
    expect(result.contextText).toContain("a.ts (3)");
    expect(result.contextText).toContain("5 matches");
    expect(result.contextText).toContain("3 files");
  });

  it("shows first match preview", () => {
    const result = grepFormatter.format(fixture);
    expect(result.contextText).toContain("First:");
    expect(result.contextText).toContain("src/index.ts:5:// TODO: fix this");
  });

  describe("TTS humanization", () => {
    it("strips regex metacharacters from TTS", () => {
      const result = grepFormatter.format({
        tool_name: "Grep",
        tool_input: { pattern: "\\bfunction\\s+\\w+" },
        tool_response: { output: "foo.ts:10:function bar()" },
      });
      expect(result.ttsText).toContain("function");
      expect(result.ttsText).not.toContain("\\b");
      expect(result.ttsText).not.toContain("\\s");
      expect(result.ttsText).not.toContain("\\w");
    });

    it("keeps plain text patterns unchanged in TTS", () => {
      const result = grepFormatter.format({
        tool_name: "Grep",
        tool_input: { pattern: "TODO" },
        tool_response: { output: "a.ts:1:TODO fix" },
      });
      expect(result.ttsText).toContain("TODO");
    });

    it("keeps raw pattern in contextText for precision", () => {
      const result = grepFormatter.format({
        tool_name: "Grep",
        tool_input: { pattern: "\\bfunction\\s+\\w+" },
        tool_response: { output: "foo.ts:10:function bar()" },
      });
      expect(result.contextText).toContain("\\bfunction\\s+\\w+");
    });
  });
});
