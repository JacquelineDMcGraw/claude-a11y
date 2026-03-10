import { describe, it, expect } from "vitest";
import { processToolUse, processHookEvent, parseHookEvent } from "../../../src/hooks/core/pipeline.js";
import { DEFAULT_CONFIG } from "../../../src/hooks/config/defaults.js";
import type { HooksConfig } from "../../../src/hooks/config/types.js";

function config(overrides: Partial<HooksConfig> = {}): HooksConfig {
  return { ...structuredClone(DEFAULT_CONFIG), ...overrides } as HooksConfig;
}

/** Helper to extract additionalContext from hookSpecificOutput */
function getContext(result: { hookOutput: { hookSpecificOutput?: { additionalContext?: string } } }): string {
  return result.hookOutput.hookSpecificOutput?.additionalContext || "";
}

describe("processToolUse (backward compat)", () => {
  it("processes valid Bash input", () => {
    const input = JSON.stringify({
      tool_name: "Bash",
      tool_input: { command: "echo hello" },
      tool_response: { exitCode: 0, stdout: "hello\n" },
    });
    const result = processToolUse(input, config());
    // echo is noise → contextText shortened but present, ttsText silenced
    expect(getContext(result)).toContain("echo hello");
    expect(result.ttsText).toBeNull(); // noise-level → silenced
  });

  it("processes valid Edit input", () => {
    const input = JSON.stringify({
      tool_name: "Edit",
      tool_input: { file_path: "/foo.ts", old_string: "a", new_string: "b" },
      tool_response: {},
    });
    const result = processToolUse(input, config());
    expect(getContext(result)).toContain("foo.ts");
  });

  it("handles malformed JSON gracefully", () => {
    const result = processToolUse("not json at all", config());
    expect(getContext(result)).toContain("Unknown");
    expect(result.ttsText).toBeDefined();
  });

  it("handles empty string input", () => {
    const result = processToolUse("", config());
    expect(getContext(result)).toBeDefined();
  });

  it("handles JSON that is not an object", () => {
    const result = processToolUse('"just a string"', config());
    expect(getContext(result)).toContain("Unknown");
  });

  it("handles JSON array input", () => {
    const result = processToolUse("[1, 2, 3]", config());
    expect(getContext(result)).toContain("Unknown");
  });

  it("handles missing tool_name", () => {
    const result = processToolUse(
      JSON.stringify({ tool_input: {}, tool_response: {} }),
      config(),
    );
    expect(getContext(result)).toContain("Unknown");
  });

  it("handles missing tool_input and tool_response", () => {
    const result = processToolUse(
      JSON.stringify({ tool_name: "Bash" }),
      config(),
    );
    expect(getContext(result)).toBeDefined();
  });

  it("respects minimal verbosity", () => {
    const input = JSON.stringify({
      tool_name: "Bash",
      tool_input: { command: "ls" },
      tool_response: { exitCode: 0, stdout: "a\nb\n" },
    });
    const result = processToolUse(input, config({ verbosity: "minimal" }));
    // minimal only includes ttsText
    expect(getContext(result)).not.toContain("Exit code");
  });

  it("respects full verbosity", () => {
    const input = JSON.stringify({
      tool_name: "Bash",
      tool_input: { command: "ls" },
      tool_response: { exitCode: 0, stdout: "a\nb\n" },
    });
    const result = processToolUse(input, config({ verbosity: "full" }));
    expect(getContext(result)).toContain("---");
  });

  it("falls back for unknown tool names", () => {
    const input = JSON.stringify({
      tool_name: "FutureTool",
      tool_input: { some: "data" },
      tool_response: { result: "ok" },
    });
    const result = processToolUse(input, config());
    expect(getContext(result)).toContain("FutureTool");
    expect(result.ttsText).toContain("completed");
  });
});

describe("processHookEvent", () => {
  it("wraps output in hookSpecificOutput", () => {
    const input = JSON.stringify({
      tool_name: "Bash",
      tool_input: { command: "ls" },
      tool_response: { exitCode: 0, stdout: "" },
    });
    const result = processHookEvent(input, config());
    expect(result.hookOutput.hookSpecificOutput).toBeDefined();
    expect(result.hookOutput.hookSpecificOutput!.hookEventName).toBe("PostToolUse");
  });

  it("routes PostToolUse events", () => {
    const input = JSON.stringify({
      hook_event_name: "PostToolUse",
      tool_name: "Read",
      tool_input: { file_path: "/test.ts" },
      tool_response: { content: "line1\nline2\n" },
    });
    const result = processHookEvent(input, config());
    expect(result.hookOutput.hookSpecificOutput!.hookEventName).toBe("PostToolUse");
    expect(getContext(result)).toContain("test.ts");
  });

  it("routes Notification events", () => {
    const input = JSON.stringify({
      hook_event_name: "Notification",
      message: "Session is idle",
      notification_type: "idle_prompt",
    });
    const result = processHookEvent(input, config());
    expect(result.hookOutput.hookSpecificOutput!.hookEventName).toBe("Notification");
    expect(getContext(result)).toContain("Session idle");
    expect(getContext(result)).toContain("Session is idle");
  });

  it("routes PermissionRequest events", () => {
    const input = JSON.stringify({
      hook_event_name: "PermissionRequest",
      tool_name: "Bash",
      tool_input: { command: "rm -rf /tmp/test" },
    });
    const result = processHookEvent(input, config());
    expect(result.hookOutput.hookSpecificOutput!.hookEventName).toBe("PermissionRequest");
    expect(getContext(result)).toContain("Permission");
    expect(getContext(result)).toContain("rm -rf /tmp/test");
  });

  it("handles unknown event types gracefully", () => {
    const input = JSON.stringify({
      hook_event_name: "FutureEvent",
      some_data: "test",
    });
    const result = processHookEvent(input, config());
    expect(result.hookOutput.hookSpecificOutput).toBeDefined();
  });

  it("defaults to PostToolUse when hook_event_name is missing", () => {
    const input = JSON.stringify({
      tool_name: "Bash",
      tool_input: { command: "echo hi" },
      tool_response: { exitCode: 0, stdout: "hi\n" },
    });
    const result = processHookEvent(input, config());
    expect(result.hookOutput.hookSpecificOutput!.hookEventName).toBe("PostToolUse");
  });
});

describe("parseHookEvent", () => {
  it("parses PostToolUse event", () => {
    const event = parseHookEvent(JSON.stringify({
      hook_event_name: "PostToolUse",
      tool_name: "Read",
      tool_input: { file_path: "/a.ts" },
      tool_response: { content: "x" },
      session_id: "abc",
      tool_use_id: "tu1",
    }));
    expect(event.hook_event_name).toBe("PostToolUse");
    if (event.hook_event_name === "PostToolUse") {
      expect(event.tool_name).toBe("Read");
      expect(event.tool_use_id).toBe("tu1");
    }
  });

  it("parses Notification event", () => {
    const event = parseHookEvent(JSON.stringify({
      hook_event_name: "Notification",
      message: "hello",
      title: "Title",
      notification_type: "info",
    }));
    expect(event.hook_event_name).toBe("Notification");
    if (event.hook_event_name === "Notification") {
      expect(event.message).toBe("hello");
      expect(event.title).toBe("Title");
      expect(event.notification_type).toBe("info");
    }
  });

  it("parses PermissionRequest event", () => {
    const event = parseHookEvent(JSON.stringify({
      hook_event_name: "PermissionRequest",
      tool_name: "Bash",
      tool_input: { command: "ls" },
    }));
    expect(event.hook_event_name).toBe("PermissionRequest");
    if (event.hook_event_name === "PermissionRequest") {
      expect(event.tool_name).toBe("Bash");
    }
  });

  it("defaults to PostToolUse for missing hook_event_name", () => {
    const event = parseHookEvent(JSON.stringify({
      tool_name: "Bash",
      tool_input: {},
      tool_response: {},
    }));
    expect(event.hook_event_name).toBe("PostToolUse");
  });

  it("returns fallback for malformed input", () => {
    const event = parseHookEvent("not json");
    expect(event.hook_event_name).toBe("PostToolUse");
    if (event.hook_event_name === "PostToolUse") {
      expect(event.tool_name).toBe("Unknown");
    }
  });

  it("returns fallback for array input", () => {
    const event = parseHookEvent("[1,2]");
    expect(event.hook_event_name).toBe("PostToolUse");
  });
});

describe("Notification handling", () => {
  it("formats notification with type label", () => {
    const input = JSON.stringify({
      hook_event_name: "Notification",
      message: "Please approve",
      notification_type: "permission_prompt",
      title: "Tool Access",
    });
    const result = processHookEvent(input, config());
    expect(getContext(result)).toContain("Permission required");
    expect(getContext(result)).toContain("Tool Access");
    expect(result.ttsText).toContain("Permission required");
  });

  it("formats notification without type", () => {
    const input = JSON.stringify({
      hook_event_name: "Notification",
      message: "Something happened",
    });
    const result = processHookEvent(input, config());
    expect(getContext(result)).toContain("Notification");
    expect(getContext(result)).toContain("Something happened");
  });

  it("formats idle notification", () => {
    const input = JSON.stringify({
      hook_event_name: "Notification",
      message: "No activity for 5 minutes",
      notification_type: "idle_prompt",
    });
    const result = processHookEvent(input, config());
    expect(getContext(result)).toContain("Session idle");
  });
});

describe("PermissionRequest handling", () => {
  it("formats Edit permission request", () => {
    const input = JSON.stringify({
      hook_event_name: "PermissionRequest",
      tool_name: "Edit",
      tool_input: { file_path: "/src/app.ts", old_string: "a\nb", new_string: "c\nd\ne" },
    });
    const result = processHookEvent(input, config());
    expect(getContext(result)).toContain("Permission");
    expect(getContext(result)).toContain("app.ts");
    expect(getContext(result)).toContain("Y to allow");
  });

  it("formats Bash permission request", () => {
    const input = JSON.stringify({
      hook_event_name: "PermissionRequest",
      tool_name: "Bash",
      tool_input: { command: "npm install lodash" },
    });
    const result = processHookEvent(input, config());
    expect(getContext(result)).toContain("npm install lodash");
  });

  it("auto-approves via permission rules", () => {
    const cfg = config();
    cfg.permissions.rules = [{ tool: "Read", action: "allow" }];
    const input = JSON.stringify({
      hook_event_name: "PermissionRequest",
      tool_name: "Read",
      tool_input: { file_path: "/any/file.ts" },
    });
    const result = processHookEvent(input, cfg);
    expect(result.hookOutput.hookSpecificOutput!.decision).toBeDefined();
    expect(result.hookOutput.hookSpecificOutput!.decision!.behavior).toBe("allow");
    expect(getContext(result)).toContain("Auto-approved");
  });

  it("auto-denies via pattern match", () => {
    const cfg = config();
    cfg.permissions.rules = [{ tool: "Bash", pattern: "rm -rf", action: "deny" }];
    const input = JSON.stringify({
      hook_event_name: "PermissionRequest",
      tool_name: "Bash",
      tool_input: { command: "rm -rf /important" },
    });
    const result = processHookEvent(input, cfg);
    expect(result.hookOutput.hookSpecificOutput!.decision!.behavior).toBe("deny");
    expect(getContext(result)).toContain("Auto-denied");
  });

  it("falls through when no rule matches", () => {
    const cfg = config();
    cfg.permissions.rules = [{ tool: "Read", action: "allow" }];
    const input = JSON.stringify({
      hook_event_name: "PermissionRequest",
      tool_name: "Bash",
      tool_input: { command: "ls" },
    });
    const result = processHookEvent(input, cfg);
    expect(result.hookOutput.hookSpecificOutput!.decision).toBeUndefined();
    expect(getContext(result)).toContain("Y to allow");
  });

  it("matches pattern against file_path for Edit", () => {
    const cfg = config();
    cfg.permissions.rules = [{ tool: "Edit", pattern: "secret", action: "deny" }];
    const input = JSON.stringify({
      hook_event_name: "PermissionRequest",
      tool_name: "Edit",
      tool_input: { file_path: "/path/to/secret.env", old_string: "a", new_string: "b" },
    });
    const result = processHookEvent(input, cfg);
    expect(result.hookOutput.hookSpecificOutput!.decision!.behavior).toBe("deny");
  });

  it("does not match non-matching pattern", () => {
    const cfg = config();
    cfg.permissions.rules = [{ tool: "Bash", pattern: "deploy", action: "deny" }];
    const input = JSON.stringify({
      hook_event_name: "PermissionRequest",
      tool_name: "Bash",
      tool_input: { command: "echo hello" },
    });
    const result = processHookEvent(input, cfg);
    expect(result.hookOutput.hookSpecificOutput!.decision).toBeUndefined();
  });
});

describe("Per-tool silencing", () => {
  it("silences a silenced tool", () => {
    const cfg = config();
    cfg.silence = { enabled: true, tools: { Read: true } };
    const input = JSON.stringify({
      tool_name: "Read",
      tool_input: { file_path: "/test.ts" },
      tool_response: { content: "x" },
    });
    const result = processHookEvent(input, cfg);
    expect(result.ttsText).toBeNull();
    // hookSpecificOutput still exists but additionalContext should be empty/undefined
    expect(result.hookOutput.hookSpecificOutput?.additionalContext).toBeUndefined();
  });

  it("does not silence non-silenced tools", () => {
    const cfg = config();
    cfg.silence = { enabled: true, tools: { Read: true } };
    cfg.significance = { enabled: false, overrides: {} }; // disable significance to test silencing in isolation
    const input = JSON.stringify({
      tool_name: "Bash",
      tool_input: { command: "ls" },
      tool_response: { exitCode: 0, stdout: "a\n" },
    });
    const result = processHookEvent(input, cfg);
    expect(result.ttsText).toBeTruthy();
  });

  it("master toggle disables all silencing", () => {
    const cfg = config();
    cfg.silence = { enabled: false, tools: { Read: true } };
    cfg.significance = { enabled: false, overrides: {} }; // disable significance to test silencing in isolation
    const input = JSON.stringify({
      tool_name: "Read",
      tool_input: { file_path: "/test.ts" },
      tool_response: { content: "line1\nline2\n" },
    });
    const result = processHookEvent(input, cfg);
    expect(result.ttsText).toBeTruthy();
  });

  it("never silences PermissionRequest", () => {
    const cfg = config();
    cfg.silence = { enabled: true, tools: { Bash: true } };
    const input = JSON.stringify({
      hook_event_name: "PermissionRequest",
      tool_name: "Bash",
      tool_input: { command: "dangerous" },
    });
    const result = processHookEvent(input, cfg);
    expect(getContext(result)).toContain("Permission");
  });

  it("never silences Notification", () => {
    const cfg = config();
    cfg.silence = { enabled: true, tools: {} };
    const input = JSON.stringify({
      hook_event_name: "Notification",
      message: "Important notice",
    });
    const result = processHookEvent(input, cfg);
    expect(getContext(result)).toContain("Important notice");
  });
});
