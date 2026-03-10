import { describe, it, expect } from "vitest";
import { processHookEvent } from "../../../src/hooks/core/pipeline.js";
import { DEFAULT_CONFIG } from "../../../src/hooks/config/defaults.js";
import type { HooksConfig } from "../../../src/hooks/config/types.js";

function config(overrides: Partial<HooksConfig> = {}): HooksConfig {
  return { ...structuredClone(DEFAULT_CONFIG), ...overrides } as HooksConfig;
}

describe("earcon selection in pipeline", () => {
  describe("PostToolUse earcon mapping", () => {
    it("returns null for noise-level events (Read)", () => {
      const input = JSON.stringify({
        hook_event_name: "PostToolUse",
        tool_name: "Read",
        tool_input: { file_path: "/test.ts" },
        tool_response: { content: "x" },
      });
      const result = processHookEvent(input, config());
      expect(result.earcon).toBeNull();
    });

    it("returns 'test-pass' for passing tests", () => {
      const input = JSON.stringify({
        hook_event_name: "PostToolUse",
        tool_name: "Bash",
        tool_input: { command: "npm test" },
        tool_response: { exitCode: 0, stdout: "all tests passed" },
      });
      const result = processHookEvent(input, config());
      expect(result.earcon).toBe("test-pass");
    });

    it("returns 'test-fail' for failing tests", () => {
      const input = JSON.stringify({
        hook_event_name: "PostToolUse",
        tool_name: "Bash",
        tool_input: { command: "npm test" },
        tool_response: { exitCode: 1, stdout: "3 tests failed" },
      });
      const result = processHookEvent(input, config());
      expect(result.earcon).toBe("test-fail");
    });

    it("returns 'edit-complete' for notable Edit", () => {
      const input = JSON.stringify({
        hook_event_name: "PostToolUse",
        tool_name: "Edit",
        tool_input: { file_path: "/app.ts", old_string: "foo", new_string: "bar" },
        tool_response: {},
      });
      const result = processHookEvent(input, config());
      expect(result.earcon).toBe("edit-complete");
    });

    it("returns 'edit-complete' for Write", () => {
      const input = JSON.stringify({
        hook_event_name: "PostToolUse",
        tool_name: "Write",
        tool_input: { file_path: "/new.ts", content: "export {}" },
        tool_response: {},
      });
      const result = processHookEvent(input, config());
      expect(result.earcon).toBe("edit-complete");
    });

    it("returns 'error' for command failures", () => {
      const input = JSON.stringify({
        hook_event_name: "PostToolUse",
        tool_name: "Bash",
        tool_input: { command: "invalid-cmd" },
        tool_response: { exitCode: 127, stdout: "" },
      });
      const result = processHookEvent(input, config());
      expect(result.earcon).toBe("error");
    });

    it("returns null for routine Bash commands", () => {
      const input = JSON.stringify({
        hook_event_name: "PostToolUse",
        tool_name: "Bash",
        tool_input: { command: "git commit -m 'fix'" },
        tool_response: { exitCode: 0, stdout: "committed" },
      });
      const result = processHookEvent(input, config());
      expect(result.earcon).toBeNull();
    });
  });

  describe("non-PostToolUse earcon mapping", () => {
    it("Notification returns 'notification'", () => {
      const input = JSON.stringify({
        hook_event_name: "Notification",
        message: "Something happened",
      });
      const result = processHookEvent(input, config());
      expect(result.earcon).toBe("notification");
    });

    it("PermissionRequest returns 'permission'", () => {
      const input = JSON.stringify({
        hook_event_name: "PermissionRequest",
        tool_name: "Bash",
        tool_input: { command: "rm -rf /" },
      });
      const result = processHookEvent(input, config());
      expect(result.earcon).toBe("permission");
    });

    it("Stop returns 'done'", () => {
      const input = JSON.stringify({ hook_event_name: "Stop" });
      const result = processHookEvent(input, config());
      expect(result.earcon).toBe("done");
    });

    it("SubagentStart returns 'agent-start'", () => {
      const input = JSON.stringify({
        hook_event_name: "SubagentStart",
        subagent_type: "Explore",
      });
      const result = processHookEvent(input, config());
      expect(result.earcon).toBe("agent-start");
    });

    it("SubagentStop returns 'agent-stop'", () => {
      const input = JSON.stringify({
        hook_event_name: "SubagentStop",
        subagent_type: "Explore",
      });
      const result = processHookEvent(input, config());
      expect(result.earcon).toBe("agent-stop");
    });

    it("PostToolUseFailure returns 'error'", () => {
      const input = JSON.stringify({
        hook_event_name: "PostToolUseFailure",
        tool_name: "Bash",
        tool_input: {},
        error: "timeout",
      });
      const result = processHookEvent(input, config());
      expect(result.earcon).toBe("error");
    });

    it("TaskCompleted returns 'task-complete'", () => {
      const input = JSON.stringify({
        hook_event_name: "TaskCompleted",
        task_id: "1",
        task_subject: "Fix bug",
      });
      const result = processHookEvent(input, config());
      expect(result.earcon).toBe("task-complete");
    });
  });
});
