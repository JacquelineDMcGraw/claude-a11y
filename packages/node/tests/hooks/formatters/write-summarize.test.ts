import { describe, it, expect, afterEach } from "vitest";
import { writeFormatter } from "../../../src/hooks/formatters/write.js";
import { setSummarizeOptions } from "../../../src/hooks/formatters/summarize-options.js";
import type { PostToolUseInput } from "../../../src/hooks/formatters/types.js";

function makeWriteInput(filePath: string, content: string): PostToolUseInput {
  return {
    tool_name: "Write",
    tool_input: { file_path: filePath, content },
    tool_response: {},
  };
}

describe("write formatter with summarization", () => {
  afterEach(() => {
    setSummarizeOptions({ enabled: false, maxDeclarations: 20, maxTtsNames: 3 });
  });

  it("shows named declarations when enabled — TypeScript", () => {
    setSummarizeOptions({ enabled: true, maxDeclarations: 20, maxTtsNames: 3 });
    const content = `export function parseConfig(): Config {
  return {};
}

export type AppConfig = {
  name: string;
};

export const DEFAULT_VALUES = {};`;
    const result = writeFormatter.format(makeWriteInput("/src/utils.ts", content));
    expect(result.contextText).toContain("Defines:");
    expect(result.contextText).toContain("function parseConfig");
    expect(result.contextText).toContain("type AppConfig");
    expect(result.contextText).toContain("const DEFAULT_VALUES");
    expect(result.ttsText).toContain("Defines");
    expect(result.ttsText).toContain("parseConfig");
  });

  it("falls back when summarization is disabled", () => {
    setSummarizeOptions({ enabled: false, maxDeclarations: 20, maxTtsNames: 3 });
    const content = `export function hello(): void {}`;
    const result = writeFormatter.format(makeWriteInput("/src/app.ts", content));
    expect(result.contextText).not.toContain("Defines:");
    expect(result.contextText).toContain("Wrote /src/app.ts");
    expect(result.contextText).toContain("1 line");
  });

  it("no declarations for JSON/YAML — no regression", () => {
    setSummarizeOptions({ enabled: true, maxDeclarations: 20, maxTtsNames: 3 });
    const content = `{"name": "test", "version": "1.0.0"}`;
    const result = writeFormatter.format(makeWriteInput("/package.json", content));
    // JSON won't match TS/JS declaration patterns
    expect(result.contextText).toContain("Wrote /package.json");
    expect(result.contextText).toContain("[JSON]");
    expect(result.contextText).not.toContain("Defines:");
  });

  it("truncates TTS at maxTtsNames", () => {
    setSummarizeOptions({ enabled: true, maxDeclarations: 20, maxTtsNames: 2 });
    const content = `export function a(): void {}
export function b(): void {}
export function c(): void {}`;
    const result = writeFormatter.format(makeWriteInput("/src/fns.ts", content));
    expect(result.ttsText).toContain("a");
    expect(result.ttsText).toContain("b");
    expect(result.ttsText).toContain("+1 more");
  });

  it("preserves file type suffix", () => {
    setSummarizeOptions({ enabled: true, maxDeclarations: 20, maxTtsNames: 3 });
    const content = `def main():\n    pass`;
    const result = writeFormatter.format(makeWriteInput("/src/main.py", content));
    expect(result.contextText).toContain("[Python]");
  });
});
