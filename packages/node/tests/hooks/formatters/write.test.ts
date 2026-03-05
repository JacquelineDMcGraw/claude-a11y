import { describe, it, expect } from "vitest";
import { writeFormatter } from "../../../src/hooks/formatters/write.js";
import fixture from "../fixtures/hook-inputs/write.json";

describe("writeFormatter", () => {
  it("formats file write with type detection", () => {
    const result = writeFormatter.format(fixture);
    expect(result.contextText).toContain("/src/new-file.ts");
    expect(result.contextText).toContain("3 lines");
    expect(result.contextText).toContain("[TypeScript]");
    expect(result.ttsText).toContain("new-file.ts");
  });

  it("handles empty content", () => {
    const input = {
      tool_name: "Write",
      tool_input: { file_path: "/empty.txt", content: "" },
      tool_response: {},
    };
    const result = writeFormatter.format(input);
    expect(result.contextText).toContain("0 lines");
  });

  it("detects JSON file type", () => {
    const result = writeFormatter.format({
      tool_name: "Write",
      tool_input: { file_path: "/config.json", content: '{"key": "value"}' },
      tool_response: {},
    });
    expect(result.contextText).toContain("[JSON]");
  });

  it("detects Python file type", () => {
    const result = writeFormatter.format({
      tool_name: "Write",
      tool_input: { file_path: "/script.py", content: "print('hello')" },
      tool_response: {},
    });
    expect(result.contextText).toContain("[Python]");
  });

  it("handles unknown file type", () => {
    const result = writeFormatter.format({
      tool_name: "Write",
      tool_input: { file_path: "/data.xyz", content: "data" },
      tool_response: {},
    });
    expect(result.contextText).not.toContain("[");
  });
});
