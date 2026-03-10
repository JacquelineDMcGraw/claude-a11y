import { describe, it, expect } from "vitest";
import { fallbackFormatter } from "../../../src/hooks/formatters/fallback.js";

describe("fallbackFormatter", () => {
  it("formats unknown tool", () => {
    const input = {
      tool_name: "SomeNewTool",
      tool_input: {},
      tool_response: {},
    };
    const result = fallbackFormatter.format(input);
    expect(result.contextText).toContain("SomeNewTool");
    expect(result.ttsText).toContain("SomeNewTool");
    expect(result.ttsText).toContain("completed");
  });

  it("handles missing tool_name", () => {
    const input = {
      tool_name: "",
      tool_input: {},
      tool_response: {},
    };
    const result = fallbackFormatter.format(input);
    expect(result.contextText).toContain("Unknown tool");
  });
});
