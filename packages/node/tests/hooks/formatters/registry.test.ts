import { describe, it, expect, beforeEach } from "vitest";
import {
  registerFormatter,
  getFormatter,
  formatToolUse,
  clearFormatters,
  registerBuiltinFormatters,
} from "../../../src/hooks/formatters/index.js";
import type { Formatter } from "../../../src/hooks/formatters/types.js";

describe("formatter registry", () => {
  beforeEach(() => {
    clearFormatters();
  });

  it("registers and retrieves a formatter", () => {
    const f: Formatter = {
      id: "test",
      toolNames: ["TestTool"],
      format: () => ({ contextText: "ctx", ttsText: "tts" }),
    };
    registerFormatter(f);
    expect(getFormatter("TestTool")).toBe(f);
  });

  it("throws on conflict", () => {
    const f1: Formatter = {
      id: "first",
      toolNames: ["Clash"],
      format: () => ({ contextText: "", ttsText: "" }),
    };
    const f2: Formatter = {
      id: "second",
      toolNames: ["Clash"],
      format: () => ({ contextText: "", ttsText: "" }),
    };
    registerFormatter(f1);
    expect(() => registerFormatter(f2)).toThrow("Formatter conflict");
    expect(() => registerFormatter(f2)).toThrow("first");
  });

  it("returns undefined for unregistered tool", () => {
    expect(getFormatter("NothingRegistered")).toBeUndefined();
  });

  it("uses fallback for unknown tools in formatToolUse", () => {
    const result = formatToolUse({
      tool_name: "UnknownTool",
      tool_input: {},
      tool_response: {},
    });
    expect(result.contextText).toContain("UnknownTool");
  });

  it("catches formatter errors and falls back", () => {
    const buggy: Formatter = {
      id: "buggy",
      toolNames: ["BuggyTool"],
      format: () => {
        throw new Error("oops");
      },
    };
    registerFormatter(buggy);
    const result = formatToolUse({
      tool_name: "BuggyTool",
      tool_input: {},
      tool_response: {},
    });
    expect(result.contextText).toContain("BuggyTool");
    expect(result.ttsText).toContain("completed");
  });

  it("registerBuiltinFormatters registers all tools", () => {
    registerBuiltinFormatters();
    expect(getFormatter("Bash")).toBeDefined();
    expect(getFormatter("Edit")).toBeDefined();
    expect(getFormatter("Write")).toBeDefined();
    expect(getFormatter("Read")).toBeDefined();
    expect(getFormatter("Grep")).toBeDefined();
    expect(getFormatter("Glob")).toBeDefined();
    expect(getFormatter("WebFetch")).toBeDefined();
    expect(getFormatter("WebSearch")).toBeDefined();
    expect(getFormatter("Task")).toBeDefined();
  });
});
