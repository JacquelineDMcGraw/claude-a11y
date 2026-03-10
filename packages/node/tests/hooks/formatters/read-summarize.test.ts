import { describe, it, expect, afterEach } from "vitest";
import { readFormatter } from "../../../src/hooks/formatters/read.js";
import { setSummarizeOptions } from "../../../src/hooks/formatters/summarize-options.js";
import type { PostToolUseInput } from "../../../src/hooks/formatters/types.js";

function makeReadInput(filePath: string, content: string): PostToolUseInput {
  return {
    tool_name: "Read",
    tool_input: { file_path: filePath },
    tool_response: { content },
  };
}

describe("read formatter with summarization", () => {
  afterEach(() => {
    setSummarizeOptions({ enabled: false, maxDeclarations: 20, maxTtsNames: 3 });
  });

  it("shows named declarations in contextText when enabled — TypeScript", () => {
    setSummarizeOptions({ enabled: true, maxDeclarations: 20, maxTtsNames: 3 });
    const content = `export function getGuideColor(tradition: string): string {
  return "#fff";
}

export interface ThemeConfig {
  primary: string;
}

export class App {
}`;
    const result = readFormatter.format(makeReadInput("/src/app.ts", content));
    expect(result.contextText).toContain("function getGuideColor(tradition: string): string");
    expect(result.contextText).toContain("interface ThemeConfig");
    expect(result.contextText).toContain("class App");
    expect(result.contextText).toContain("[TypeScript]");
  });

  it("shows named declarations in contextText when enabled — Python", () => {
    setSummarizeOptions({ enabled: true, maxDeclarations: 20, maxTtsNames: 3 });
    const content = `class Animal:
    pass

def process(data: str) -> bool:
    return True`;
    const result = readFormatter.format(makeReadInput("/src/models.py", content));
    expect(result.contextText).toContain("class Animal");
    expect(result.contextText).toContain("function process");
  });

  it("falls back to counts when summarization is disabled", () => {
    setSummarizeOptions({ enabled: false, maxDeclarations: 20, maxTtsNames: 3 });
    const content = `export function hello(): void {}
export function world(): void {}`;
    const result = readFormatter.format(makeReadInput("/src/app.ts", content));
    expect(result.contextText).toContain("2 functions");
    expect(result.contextText).not.toContain("Contains: export function hello");
  });

  it("falls back to counts when no declarations found", () => {
    setSummarizeOptions({ enabled: true, maxDeclarations: 20, maxTtsNames: 3 });
    const content = `// just a comment
console.log(42);`;
    const result = readFormatter.format(makeReadInput("/src/app.ts", content));
    expect(result.contextText).not.toContain("Defines:");
  });

  it("includes top N names in TTS", () => {
    setSummarizeOptions({ enabled: true, maxDeclarations: 20, maxTtsNames: 2 });
    const content = `export function alpha(): void {}
export function beta(): void {}
export function gamma(): void {}`;
    const result = readFormatter.format(makeReadInput("/src/app.ts", content));
    expect(result.ttsText).toContain("alpha");
    expect(result.ttsText).toContain("beta");
    expect(result.ttsText).toContain("+1 more");
  });

  it("truncates declarations at maxDeclarations", () => {
    setSummarizeOptions({ enabled: true, maxDeclarations: 2, maxTtsNames: 3 });
    const content = `export function a(): void {}
export function b(): void {}
export function c(): void {}
export function d(): void {}`;
    const result = readFormatter.format(makeReadInput("/src/app.ts", content));
    expect(result.contextText).toContain("function a");
    expect(result.contextText).toContain("function b");
    expect(result.contextText).toContain("+2 more");
  });

  it("handles empty file without crash", () => {
    setSummarizeOptions({ enabled: true, maxDeclarations: 20, maxTtsNames: 3 });
    const result = readFormatter.format(makeReadInput("/src/empty.ts", ""));
    expect(result.contextText).toContain("Read /src/empty.ts");
    expect(result.contextText).toContain("0 lines");
  });

  it("preserves line count in output", () => {
    setSummarizeOptions({ enabled: true, maxDeclarations: 20, maxTtsNames: 3 });
    const content = `export function main(): void {
  console.log("hello");
}`;
    const result = readFormatter.format(makeReadInput("/src/main.ts", content));
    expect(result.contextText).toMatch(/\(\d+ lines?\)/);
    expect(result.ttsText).toMatch(/\d+ lines?\./);
  });
});
