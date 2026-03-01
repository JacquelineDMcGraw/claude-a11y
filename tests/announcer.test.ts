import { describe, it, expect } from "vitest";
import { announceToolUse, announceResult, announceError } from "../src/announcer.js";
import type { ParsedToolUseEvent, ParsedResultEvent } from "../src/types.js";

describe("announceToolUse()", () => {
  it("announces Read tool", () => {
    const event: ParsedToolUseEvent = {
      type: "tool_use",
      id: "tu_1",
      name: "Read",
      input: { file_path: "src/main.ts" },
    };
    expect(announceToolUse(event)).toBe("[Tool] Reading file: src/main.ts");
  });

  it("announces Write tool", () => {
    const event: ParsedToolUseEvent = {
      type: "tool_use",
      id: "tu_2",
      name: "Write",
      input: { file_path: "dist/output.js" },
    };
    expect(announceToolUse(event)).toBe("[Tool] Writing file: dist/output.js");
  });

  it("announces Edit tool", () => {
    const event: ParsedToolUseEvent = {
      type: "tool_use",
      id: "tu_3",
      name: "Edit",
      input: { file_path: "src/utils.ts" },
    };
    expect(announceToolUse(event)).toBe("[Tool] Editing file: src/utils.ts");
  });

  it("announces Bash tool with short command", () => {
    const event: ParsedToolUseEvent = {
      type: "tool_use",
      id: "tu_4",
      name: "Bash",
      input: { command: "npm test" },
    };
    expect(announceToolUse(event)).toBe("[Tool] Running command: npm test");
  });

  it("truncates long Bash commands", () => {
    const longCmd = "find . -name '*.ts' -exec grep -l 'import' {} + | sort | head -20 | xargs wc -l | sort -rn | head -10 && echo done";
    const event: ParsedToolUseEvent = {
      type: "tool_use",
      id: "tu_5",
      name: "Bash",
      input: { command: longCmd },
    };
    const result = announceToolUse(event);
    expect(result).toContain("[Tool] Running command:");
    expect(result).toContain("...");
    expect(result.length).toBeLessThan(150);
  });

  it("does not truncate commands under 100 chars", () => {
    const cmd =
      "find . -name '*.ts' -exec grep -l 'import' {} + | sort | head -20";
    const event: ParsedToolUseEvent = {
      type: "tool_use",
      id: "tu_6",
      name: "Bash",
      input: { command: cmd },
    };
    const result = announceToolUse(event);
    expect(result).not.toContain("...");
    expect(result).toContain(cmd);
  });

  it("announces Grep tool", () => {
    const event: ParsedToolUseEvent = {
      type: "tool_use",
      id: "tu_7",
      name: "Grep",
      input: { pattern: "TODO", path: "src/" },
    };
    expect(announceToolUse(event)).toBe('[Tool] Searching: "TODO" in src/');
  });

  it("announces Grep with default path", () => {
    const event: ParsedToolUseEvent = {
      type: "tool_use",
      id: "tu_8",
      name: "Grep",
      input: { pattern: "error" },
    };
    expect(announceToolUse(event)).toBe('[Tool] Searching: "error" in project');
  });

  it("announces Glob tool", () => {
    const event: ParsedToolUseEvent = {
      type: "tool_use",
      id: "tu_9",
      name: "Glob",
      input: { pattern: "**/*.test.ts" },
    };
    expect(announceToolUse(event)).toBe("[Tool] Finding files: **/*.test.ts");
  });

  it("announces Task/Agent tool with description", () => {
    const event: ParsedToolUseEvent = {
      type: "tool_use",
      id: "tu_10",
      name: "Task",
      input: { description: "run tests", prompt: "Run all tests" },
    };
    expect(announceToolUse(event)).toBe("[Tool] Starting subagent: run tests");
  });

  it("announces Task/Agent tool with prompt fallback", () => {
    const event: ParsedToolUseEvent = {
      type: "tool_use",
      id: "tu_11",
      name: "Task",
      input: { prompt: "Search the codebase for authentication patterns" },
    };
    expect(announceToolUse(event)).toBe(
      "[Tool] Starting subagent: Search the codebase for authentication patterns"
    );
  });

  it("announces WebFetch tool", () => {
    const event: ParsedToolUseEvent = {
      type: "tool_use",
      id: "tu_12",
      name: "WebFetch",
      input: { url: "https://example.com" },
    };
    expect(announceToolUse(event)).toBe(
      "[Tool] Fetching URL: https://example.com"
    );
  });

  it("announces WebSearch tool", () => {
    const event: ParsedToolUseEvent = {
      type: "tool_use",
      id: "tu_13",
      name: "WebSearch",
      input: { query: "react hooks tutorial" },
    };
    expect(announceToolUse(event)).toBe(
      "[Tool] Web search: react hooks tutorial"
    );
  });

  it("announces unknown/MCP tools", () => {
    const event: ParsedToolUseEvent = {
      type: "tool_use",
      id: "tu_14",
      name: "mcp__slack__post_message",
      input: {},
    };
    expect(announceToolUse(event)).toBe(
      "[Tool] Using mcp__slack__post_message"
    );
  });

  it("announces TodoRead tool", () => {
    const event: ParsedToolUseEvent = {
      type: "tool_use",
      id: "tu_15",
      name: "TodoRead",
      input: {},
    };
    expect(announceToolUse(event)).toBe("[Tool] Reading todo list");
  });

  it("announces TodoWrite tool", () => {
    const event: ParsedToolUseEvent = {
      type: "tool_use",
      id: "tu_16",
      name: "TodoWrite",
      input: { todos: [] },
    };
    expect(announceToolUse(event)).toBe("[Tool] Updating todo list");
  });

  it("announces NotebookEdit tool", () => {
    const event: ParsedToolUseEvent = {
      type: "tool_use",
      id: "tu_17",
      name: "NotebookEdit",
      input: { notebook_path: "analysis.ipynb" },
    };
    expect(announceToolUse(event)).toBe(
      "[Tool] Editing notebook: analysis.ipynb"
    );
  });

  it("handles Bash with missing command", () => {
    const event: ParsedToolUseEvent = {
      type: "tool_use",
      id: "tu_18",
      name: "Bash",
      input: {},
    };
    expect(announceToolUse(event)).toBe("[Tool] Running command");
  });
});


describe("announceResult()", () => {
  it("announces success with turns and cost", () => {
    const event: ParsedResultEvent = {
      type: "result",
      sessionId: "s1",
      cost: 0.0037,
      turns: 2,
      isError: false,
      errors: [],
    };
    expect(announceResult(event)).toBe(
      "[Done] Response complete. (2 turns, $0.0037 cost)"
    );
  });

  it("announces success with single turn", () => {
    const event: ParsedResultEvent = {
      type: "result",
      sessionId: "s1",
      cost: 0.001,
      turns: 1,
      isError: false,
      errors: [],
    };
    expect(announceResult(event)).toBe(
      "[Done] Response complete. (1 turn, $0.0010 cost)"
    );
  });

  it("announces success with zero cost", () => {
    const event: ParsedResultEvent = {
      type: "result",
      sessionId: "s1",
      cost: 0,
      turns: 3,
      isError: false,
      errors: [],
    };
    expect(announceResult(event)).toBe(
      "[Done] Response complete. (3 turns)"
    );
  });

  it("announces success with zero turns and zero cost", () => {
    const event: ParsedResultEvent = {
      type: "result",
      sessionId: "s1",
      cost: 0,
      turns: 0,
      isError: false,
      errors: [],
    };
    expect(announceResult(event)).toBe("[Done] Response complete.");
  });
});


describe("announceError()", () => {
  it("announces errors", () => {
    const event: ParsedResultEvent = {
      type: "result",
      sessionId: "s1",
      cost: 0.01,
      turns: 5,
      isError: true,
      errors: ["Max turns reached"],
    };
    expect(announceError(event)).toBe("[Error] Max turns reached");
  });

  it("announces multiple errors joined", () => {
    const event: ParsedResultEvent = {
      type: "result",
      sessionId: "s1",
      cost: 0,
      turns: 0,
      isError: true,
      errors: ["Auth failed", "Token expired"],
    };
    expect(announceError(event)).toBe("[Error] Auth failed; Token expired");
  });

  it("announces generic error when no error messages", () => {
    const event: ParsedResultEvent = {
      type: "result",
      sessionId: "s1",
      cost: 0,
      turns: 0,
      isError: true,
      errors: [],
    };
    expect(announceError(event)).toBe("[Error] Claude returned an error.");
  });
});
