import { describe, it, expect } from "vitest";
import { globFormatter } from "../../../src/hooks/formatters/glob.js";
import fixture from "../fixtures/hook-inputs/glob.json";

describe("globFormatter", () => {
  it("formats glob results with file names", () => {
    const result = globFormatter.format(fixture);
    expect(result.contextText).toContain("**/*.ts");
    expect(result.contextText).toContain("3 files");
    expect(result.contextText).toContain("index.ts");
    expect(result.contextText).toContain("utils.ts");
    expect(result.contextText).toContain("types.ts");
    expect(result.ttsText).toContain("3 files");
  });

  it("limits displayed file names to 5", () => {
    const result = globFormatter.format({
      tool_name: "Glob",
      tool_input: { pattern: "**/*.js" },
      tool_response: {
        output: "a.js\nb.js\nc.js\nd.js\ne.js\nf.js\ng.js",
      },
    });
    expect(result.contextText).toContain("7 files");
    expect(result.contextText).toContain("+2 more");
  });

  it("handles empty results", () => {
    const result = globFormatter.format({
      tool_name: "Glob",
      tool_input: { pattern: "**/*.xyz" },
      tool_response: { output: "" },
    });
    expect(result.contextText).toContain("0 files");
  });

  it("handles files array response", () => {
    const result = globFormatter.format({
      tool_name: "Glob",
      tool_input: { pattern: "*.md" },
      tool_response: { files: ["README.md", "CHANGELOG.md"] },
    });
    expect(result.contextText).toContain("2 files");
    expect(result.contextText).toContain("README.md");
  });

  describe("TTS humanization", () => {
    it("humanizes .ts extension to TypeScript files", () => {
      const result = globFormatter.format({
        tool_name: "Glob",
        tool_input: { pattern: "**/*.ts" },
        tool_response: { files: ["a.ts"] },
      });
      expect(result.ttsText).toContain("TypeScript files");
      expect(result.ttsText).not.toContain("**/*.ts");
    });

    it("humanizes brace patterns like {ts,tsx}", () => {
      const result = globFormatter.format({
        tool_name: "Glob",
        tool_input: { pattern: "src/**/*.{ts,tsx}" },
        tool_response: { files: ["a.ts", "b.tsx"] },
      });
      expect(result.ttsText).toContain("TypeScript");
      expect(result.ttsText).toContain("TypeScript React");
    });

    it("falls back to quoted pattern for unrecognized globs", () => {
      const result = globFormatter.format({
        tool_name: "Glob",
        tool_input: { pattern: "**/node_modules/**" },
        tool_response: { files: [] },
      });
      expect(result.ttsText).toContain('"**/node_modules/**"');
    });

    it("keeps raw pattern in contextText for precision", () => {
      const result = globFormatter.format({
        tool_name: "Glob",
        tool_input: { pattern: "**/*.ts" },
        tool_response: { files: ["a.ts"] },
      });
      expect(result.contextText).toContain("**/*.ts");
    });
  });
});
