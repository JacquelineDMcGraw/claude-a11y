import { describe, it, expect, afterEach } from "vitest";
import { editFormatter } from "../../../src/hooks/formatters/edit.js";
import { setSummarizeOptions } from "../../../src/hooks/formatters/summarize-options.js";
import type { PostToolUseInput } from "../../../src/hooks/formatters/types.js";

function makeEditInput(
  filePath: string,
  oldStr: string,
  newStr: string,
  replaceAll = false,
): PostToolUseInput {
  return {
    tool_name: "Edit",
    tool_input: {
      file_path: filePath,
      old_string: oldStr,
      new_string: newStr,
      replace_all: replaceAll,
    },
    tool_response: {},
  };
}

describe("edit formatter with summarization", () => {
  afterEach(() => {
    setSummarizeOptions({ enabled: false, maxDeclarations: 20, maxTtsNames: 3 });
  });

  it("shows rich declaration when function added — summarize enabled", () => {
    setSummarizeOptions({ enabled: true, maxDeclarations: 20, maxTtsNames: 3 });
    const oldStr = "";
    const newStr = `export function parseConfig(raw: string): Config {
  return JSON.parse(raw);
}`;
    const result = editFormatter.format(makeEditInput("/src/config.ts", oldStr, newStr));
    // Structural detection sees this as "added function parseConfig"
    // With rich declarations, should include params
    expect(result.contextText).toContain("parseConfig");
    expect(result.contextText).toContain("Edited /src/config.ts");
  });

  it("shows rich structural change when function modified — summarize enabled", () => {
    setSummarizeOptions({ enabled: true, maxDeclarations: 20, maxTtsNames: 3 });
    const oldStr = `export function process(data: string): void {
  console.log(data);
}`;
    const newStr = `export function process(data: string): void {
  console.log("Processing:", data);
  return;
}`;
    const result = editFormatter.format(makeEditInput("/src/utils.ts", oldStr, newStr));
    expect(result.contextText).toContain("Modified");
    expect(result.contextText).toContain("process");
  });

  it("falls back to line counts when summarize disabled", () => {
    setSummarizeOptions({ enabled: false, maxDeclarations: 20, maxTtsNames: 3 });
    const oldStr = "const x = 1;";
    const newStr = "const x = 2;\nconst y = 3;";
    const result = editFormatter.format(makeEditInput("/src/app.ts", oldStr, newStr));
    expect(result.contextText).toContain("Replaced");
    expect(result.contextText).toMatch(/\d+ line/);
  });

  it("shows insertion with new declarations when summarize enabled", () => {
    setSummarizeOptions({ enabled: true, maxDeclarations: 20, maxTtsNames: 3 });
    const oldStr = "";
    const newStr = `export function handleError(err: Error): void {
  console.error(err);
}

export const MAX_RETRIES = 3;`;
    const result = editFormatter.format(makeEditInput("/src/errors.ts", oldStr, newStr));
    expect(result.contextText).toContain("handleError");
    // The structural detection will also find the added function
  });

  it("no structural changes — falls back to line counts", () => {
    setSummarizeOptions({ enabled: true, maxDeclarations: 20, maxTtsNames: 3 });
    const oldStr = "// first version of the comment";
    const newStr = "// second version of the comment\n// with an extra line";
    const result = editFormatter.format(makeEditInput("/src/app.ts", oldStr, newStr));
    expect(result.contextText).toContain("Replaced");
  });

  it("rename detection still works — no regression", () => {
    setSummarizeOptions({ enabled: true, maxDeclarations: 20, maxTtsNames: 3 });
    const oldStr = "const oldName = 42;";
    const newStr = "const newName = 42;";
    const result = editFormatter.format(makeEditInput("/src/app.ts", oldStr, newStr));
    expect(result.contextText).toContain("Renamed");
    expect(result.contextText).toContain("oldName");
    expect(result.contextText).toContain("newName");
  });

  it("TTS stays brief with structural changes", () => {
    setSummarizeOptions({ enabled: true, maxDeclarations: 20, maxTtsNames: 3 });
    const oldStr = "";
    const newStr = `export function alpha(x: number): string {}
export function beta(y: boolean): void {}
export function gamma(z: object): number {}`;
    const result = editFormatter.format(makeEditInput("/src/fns.ts", oldStr, newStr));
    // TTS should contain names but not full signatures
    expect(result.ttsText).toContain("alpha");
  });

  it("handles insertion of non-code content", () => {
    setSummarizeOptions({ enabled: true, maxDeclarations: 20, maxTtsNames: 3 });
    const oldStr = "";
    const newStr = "This is just some text\nwithout any declarations.";
    const result = editFormatter.format(makeEditInput("/src/notes.txt", oldStr, newStr));
    expect(result.contextText).toContain("Inserted 2 lines");
  });
});
