import { describe, it, expect } from "vitest";
import { taskFormatter } from "../../../src/hooks/formatters/task.js";
import fixture from "../fixtures/hook-inputs/task.json";

describe("taskFormatter", () => {
  it("formats a completed Task result", () => {
    const result = taskFormatter.format(fixture);
    expect(result.contextText).toContain("Explore agent");
    expect(result.contextText).toContain("Find draw functions");
    expect(result.contextText).toContain("Status: completed");
    expect(result.contextText).toContain("Found 5 draw functions");
    expect(result.ttsText).toContain("Launched Explore agent");
    expect(result.ttsText).toContain("completed");
  });

  it("handles missing subagent_type gracefully", () => {
    const result = taskFormatter.format({
      tool_name: "Task",
      tool_input: { prompt: "Do something" },
      tool_response: {},
    });
    expect(result.contextText).toContain("unknown agent");
    expect(result.ttsText).toContain("unknown agent");
  });

  it("uses prompt as fallback description", () => {
    const result = taskFormatter.format({
      tool_name: "Task",
      tool_input: {
        subagent_type: "Plan",
        prompt: "Design the authentication system architecture",
      },
      tool_response: { status: "completed" },
    });
    expect(result.contextText).toContain("Design the authentication system");
  });

  it("truncates long result previews", () => {
    const longResult = "x".repeat(300);
    const result = taskFormatter.format({
      tool_name: "Task",
      tool_input: { subagent_type: "general-purpose", description: "Test" },
      tool_response: { result: longResult },
    });
    expect(result.contextText.length).toBeLessThan(400);
  });

  it("handles empty response", () => {
    const result = taskFormatter.format({
      tool_name: "Task",
      tool_input: { subagent_type: "Explore", description: "Search" },
      tool_response: {},
    });
    expect(result.contextText).toContain("completed");
    expect(result.contextText).not.toContain("Summary:");
  });
});
