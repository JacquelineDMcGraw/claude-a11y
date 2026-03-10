import { describe, it, expect } from "vitest";
import { bashFormatter } from "../../../src/hooks/formatters/bash.js";
import successFixture from "../fixtures/hook-inputs/bash-success.json";
import failureFixture from "../fixtures/hook-inputs/bash-failure.json";

describe("bashFormatter", () => {
  it("formats successful command", () => {
    const result = bashFormatter.format(successFixture);
    expect(result.contextText).toContain("ls -la");
    expect(result.contextText).toContain("Exit code: 0");
    expect(result.ttsText).toContain("success");
    expect(result.ttsText).toContain("ls -la");
  });

  it("formats failed command", () => {
    const result = bashFormatter.format(failureFixture);
    expect(result.contextText).toContain("Exit code: 1");
    expect(result.ttsText).toContain("exit code 1");
  });

  it("truncates long commands in ttsText", () => {
    const input = {
      tool_name: "Bash",
      tool_input: { command: "a".repeat(200) },
      tool_response: { exitCode: 0, stdout: "" },
    };
    const result = bashFormatter.format(input);
    expect(result.ttsText.length).toBeLessThan(200);
    expect(result.ttsText).toContain("...");
  });

  it("handles missing command gracefully", () => {
    const input = {
      tool_name: "Bash",
      tool_input: {},
      tool_response: { exitCode: 0, stdout: "" },
    };
    const result = bashFormatter.format(input);
    expect(result.contextText).toContain("Ran:");
  });
});
