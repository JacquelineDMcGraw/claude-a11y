import { describe, it, expect } from "vitest";
import { processHookEvent, parseHookEvent } from "../../../src/hooks/core/pipeline.js";
import { DEFAULT_CONFIG } from "../../../src/hooks/config/defaults.js";
import type { HooksConfig } from "../../../src/hooks/config/types.js";

function config(overrides: Partial<HooksConfig> = {}): HooksConfig {
  return { ...structuredClone(DEFAULT_CONFIG), ...overrides } as HooksConfig;
}

function getContext(result: { hookOutput: { hookSpecificOutput?: { additionalContext?: string } } }): string {
  return result.hookOutput.hookSpecificOutput?.additionalContext || "";
}

describe("Stop event handling", () => {
  it("produces Done TTS", () => {
    const input = JSON.stringify({
      hook_event_name: "Stop",
      stop_reason: "end_turn",
    });
    const result = processHookEvent(input, config());
    expect(result.ttsText).toBe("Done.");
    expect(getContext(result)).toContain("finished");
  });

  it("sets hookEventName to Stop", () => {
    const input = JSON.stringify({ hook_event_name: "Stop" });
    const result = processHookEvent(input, config());
    expect(result.hookOutput.hookSpecificOutput!.hookEventName).toBe("Stop");
  });
});

describe("SubagentStart event handling", () => {
  it("announces agent start", () => {
    const input = JSON.stringify({
      hook_event_name: "SubagentStart",
      subagent_type: "debugger",
      description: "investigating error",
    });
    const result = processHookEvent(input, config());
    expect(result.ttsText).toBe("Starting debugger agent.");
    expect(getContext(result)).toContain("debugger");
    expect(getContext(result)).toContain("investigating error");
  });

  it("handles missing subagent_type", () => {
    const input = JSON.stringify({ hook_event_name: "SubagentStart" });
    const result = processHookEvent(input, config());
    expect(result.ttsText).toBe("Starting unknown agent.");
  });

  it("sets hookEventName to SubagentStart", () => {
    const input = JSON.stringify({ hook_event_name: "SubagentStart", subagent_type: "explore" });
    const result = processHookEvent(input, config());
    expect(result.hookOutput.hookSpecificOutput!.hookEventName).toBe("SubagentStart");
  });
});

describe("SubagentStop event handling", () => {
  it("announces agent completion", () => {
    const input = JSON.stringify({
      hook_event_name: "SubagentStop",
      subagent_type: "debugger",
    });
    const result = processHookEvent(input, config());
    expect(result.ttsText).toBe("debugger agent done.");
    expect(getContext(result)).toContain("debugger agent done");
  });

  it("handles missing subagent_type", () => {
    const input = JSON.stringify({ hook_event_name: "SubagentStop" });
    const result = processHookEvent(input, config());
    expect(result.ttsText).toBe("unknown agent done.");
  });

  it("sets hookEventName to SubagentStop", () => {
    const input = JSON.stringify({ hook_event_name: "SubagentStop", subagent_type: "plan" });
    const result = processHookEvent(input, config());
    expect(result.hookOutput.hookSpecificOutput!.hookEventName).toBe("SubagentStop");
  });
});

describe("PostToolUseFailure event handling", () => {
  it("announces tool failure as important", () => {
    const input = JSON.stringify({
      hook_event_name: "PostToolUseFailure",
      tool_name: "Edit",
      tool_input: { file_path: "/foo.ts" },
      error: "old_string not found in file",
    });
    const result = processHookEvent(input, config());
    expect(result.ttsText).toBe("Important: Edit failed.");
    expect(getContext(result)).toContain("Edit failed");
    expect(getContext(result)).toContain("old_string not found");
  });

  it("handles missing error message", () => {
    const input = JSON.stringify({
      hook_event_name: "PostToolUseFailure",
      tool_name: "Bash",
      tool_input: {},
    });
    const result = processHookEvent(input, config());
    expect(result.ttsText).toBe("Important: Bash failed.");
  });

  it("truncates long error messages in contextText", () => {
    const input = JSON.stringify({
      hook_event_name: "PostToolUseFailure",
      tool_name: "Edit",
      tool_input: {},
      error: "A".repeat(500),
    });
    const result = processHookEvent(input, config());
    // Error truncated to 200 chars
    expect(getContext(result).length).toBeLessThan(300);
  });

  it("sets hookEventName to PostToolUseFailure", () => {
    const input = JSON.stringify({
      hook_event_name: "PostToolUseFailure",
      tool_name: "Write",
      tool_input: {},
      error: "permission denied",
    });
    const result = processHookEvent(input, config());
    expect(result.hookOutput.hookSpecificOutput!.hookEventName).toBe("PostToolUseFailure");
  });
});

describe("TaskCompleted event handling", () => {
  it("announces task completion with subject", () => {
    const input = JSON.stringify({
      hook_event_name: "TaskCompleted",
      task_id: "3",
      task_subject: "Fix auth bug",
    });
    const result = processHookEvent(input, config());
    expect(result.ttsText).toBe("Task done: Fix auth bug.");
    expect(getContext(result)).toContain("Fix auth bug");
  });

  it("falls back to task ID when no subject", () => {
    const input = JSON.stringify({
      hook_event_name: "TaskCompleted",
      task_id: "7",
    });
    const result = processHookEvent(input, config());
    expect(result.ttsText).toBe("Task done: Task 7.");
  });

  it("handles missing both id and subject", () => {
    const input = JSON.stringify({
      hook_event_name: "TaskCompleted",
    });
    const result = processHookEvent(input, config());
    expect(result.ttsText).toContain("Task done");
  });

  it("sets hookEventName to TaskCompleted", () => {
    const input = JSON.stringify({ hook_event_name: "TaskCompleted", task_subject: "test" });
    const result = processHookEvent(input, config());
    expect(result.hookOutput.hookSpecificOutput!.hookEventName).toBe("TaskCompleted");
  });
});

describe("parseHookEvent new event types", () => {
  it("parses Stop event", () => {
    const event = parseHookEvent(JSON.stringify({
      hook_event_name: "Stop",
      stop_reason: "end_turn",
      session_id: "s1",
    }));
    expect(event.hook_event_name).toBe("Stop");
    if (event.hook_event_name === "Stop") {
      expect(event.stop_reason).toBe("end_turn");
    }
  });

  it("parses SubagentStart event", () => {
    const event = parseHookEvent(JSON.stringify({
      hook_event_name: "SubagentStart",
      subagent_type: "explore",
      description: "searching codebase",
    }));
    expect(event.hook_event_name).toBe("SubagentStart");
    if (event.hook_event_name === "SubagentStart") {
      expect(event.subagent_type).toBe("explore");
      expect(event.description).toBe("searching codebase");
    }
  });

  it("parses SubagentStop event", () => {
    const event = parseHookEvent(JSON.stringify({
      hook_event_name: "SubagentStop",
      subagent_type: "debugger",
    }));
    expect(event.hook_event_name).toBe("SubagentStop");
    if (event.hook_event_name === "SubagentStop") {
      expect(event.subagent_type).toBe("debugger");
    }
  });

  it("parses PostToolUseFailure event", () => {
    const event = parseHookEvent(JSON.stringify({
      hook_event_name: "PostToolUseFailure",
      tool_name: "Edit",
      tool_input: { file_path: "/foo.ts" },
      error: "not found",
    }));
    expect(event.hook_event_name).toBe("PostToolUseFailure");
    if (event.hook_event_name === "PostToolUseFailure") {
      expect(event.tool_name).toBe("Edit");
      expect(event.error).toBe("not found");
    }
  });

  it("parses TaskCompleted event", () => {
    const event = parseHookEvent(JSON.stringify({
      hook_event_name: "TaskCompleted",
      task_id: "5",
      task_subject: "Implement feature",
    }));
    expect(event.hook_event_name).toBe("TaskCompleted");
    if (event.hook_event_name === "TaskCompleted") {
      expect(event.task_id).toBe("5");
      expect(event.task_subject).toBe("Implement feature");
    }
  });
});

describe("significance integration in PostToolUse", () => {
  it("silences Read TTS when significance enabled", () => {
    const input = JSON.stringify({
      hook_event_name: "PostToolUse",
      tool_name: "Read",
      tool_input: { file_path: "/test.ts" },
      tool_response: { content: "line1\nline2\n" },
    });
    const result = processHookEvent(input, config());
    // Read is noise → ttsText silenced
    expect(result.ttsText).toBeNull();
  });

  it("silences Glob TTS when significance enabled", () => {
    const input = JSON.stringify({
      hook_event_name: "PostToolUse",
      tool_name: "Glob",
      tool_input: { pattern: "**/*.ts" },
      tool_response: { files: ["a.ts", "b.ts"] },
    });
    const result = processHookEvent(input, config());
    expect(result.ttsText).toBeNull();
  });

  it("keeps Edit TTS when significance enabled", () => {
    const input = JSON.stringify({
      hook_event_name: "PostToolUse",
      tool_name: "Edit",
      tool_input: { file_path: "/foo.ts", old_string: "foo", new_string: "bar" },
      tool_response: {},
    });
    const result = processHookEvent(input, config());
    // Edit with real change is notable → TTS kept
    expect(result.ttsText).toBeTruthy();
  });

  it("respects significance overrides", () => {
    const cfg = config();
    cfg.significance = { enabled: true, overrides: { Read: "important" } };
    const input = JSON.stringify({
      hook_event_name: "PostToolUse",
      tool_name: "Read",
      tool_input: { file_path: "/test.ts" },
      tool_response: { content: "x" },
    });
    const result = processHookEvent(input, cfg);
    // Override promotes Read to important → TTS prefixed
    expect(result.ttsText).toContain("Important:");
  });

  it("disables significance when config says so", () => {
    const cfg = config();
    cfg.significance = { enabled: false, overrides: {} };
    const input = JSON.stringify({
      hook_event_name: "PostToolUse",
      tool_name: "Read",
      tool_input: { file_path: "/test.ts" },
      tool_response: { content: "line1\nline2\n" },
    });
    const result = processHookEvent(input, cfg);
    // Significance disabled → TTS preserved as-is
    expect(result.ttsText).toBeTruthy();
  });
});
