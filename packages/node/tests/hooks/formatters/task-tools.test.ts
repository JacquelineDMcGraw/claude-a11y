import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  taskCreateFormatter,
  taskUpdateFormatter,
  taskListFormatter,
  taskGetFormatter,
} from "../../../src/hooks/formatters/task-tools.js";
import type { PostToolUseInput } from "../../../src/hooks/formatters/types.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hooks-task-fmt-test-"));
  process.env["XDG_STATE_HOME"] = tmpDir;
});

afterEach(() => {
  delete process.env["XDG_STATE_HOME"];
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("taskCreateFormatter", () => {
  it("formats task creation with subject", () => {
    const input: PostToolUseInput = {
      tool_name: "TaskCreate",
      tool_input: { subject: "Fix auth bug", description: "The login page..." },
      tool_response: { taskId: "3", subject: "Fix auth bug", status: "pending" },
      session_id: "test-session",
    };
    const result = taskCreateFormatter.format(input);
    expect(result.contextText).toContain("Created task #3");
    expect(result.contextText).toContain("Fix auth bug");
    expect(result.ttsText).toBe("New task: Fix auth bug.");
  });

  it("handles missing subject", () => {
    const input: PostToolUseInput = {
      tool_name: "TaskCreate",
      tool_input: {},
      tool_response: { taskId: "1" },
    };
    const result = taskCreateFormatter.format(input);
    expect(result.ttsText).toBe("New task created.");
  });
});

describe("taskUpdateFormatter", () => {
  it("formats status change", () => {
    const input: PostToolUseInput = {
      tool_name: "TaskUpdate",
      tool_input: { taskId: "3", status: "completed" },
      tool_response: { subject: "Fix auth bug", status: "completed" },
      session_id: "test-session",
    };
    const result = taskUpdateFormatter.format(input);
    expect(result.ttsText).toContain("Task 3");
    expect(result.ttsText).toContain("completed");
  });

  it("handles update without status change", () => {
    const input: PostToolUseInput = {
      tool_name: "TaskUpdate",
      tool_input: { taskId: "5" },
      tool_response: {},
    };
    const result = taskUpdateFormatter.format(input);
    expect(result.ttsText).toContain("Task 5 updated");
  });

  it("formats in_progress status", () => {
    const input: PostToolUseInput = {
      tool_name: "TaskUpdate",
      tool_input: { taskId: "2", status: "in_progress" },
      tool_response: { subject: "Write tests", status: "in_progress" },
      session_id: "test-session",
    };
    const result = taskUpdateFormatter.format(input);
    expect(result.ttsText).toContain("in_progress");
  });
});

describe("taskListFormatter", () => {
  it("formats task list count", () => {
    const input: PostToolUseInput = {
      tool_name: "TaskList",
      tool_input: {},
      tool_response: {
        tasks: [
          { id: "1", subject: "Task 1", status: "pending" },
          { id: "2", subject: "Task 2", status: "completed" },
        ],
      },
      session_id: "test-session",
    };
    const result = taskListFormatter.format(input);
    expect(result.contextText).toContain("Listed 2 tasks");
    expect(result.ttsText).toBe(""); // noise
  });

  it("handles empty task list", () => {
    const input: PostToolUseInput = {
      tool_name: "TaskList",
      tool_input: {},
      tool_response: { tasks: [] },
    };
    const result = taskListFormatter.format(input);
    expect(result.contextText).toContain("Listed 0 tasks");
  });

  it("handles singular task", () => {
    const input: PostToolUseInput = {
      tool_name: "TaskList",
      tool_input: {},
      tool_response: { tasks: [{ id: "1", subject: "X" }] },
    };
    const result = taskListFormatter.format(input);
    expect(result.contextText).toContain("Listed 1 task");
    expect(result.contextText).not.toContain("tasks");
  });
});

describe("taskGetFormatter", () => {
  it("formats task get with subject", () => {
    const input: PostToolUseInput = {
      tool_name: "TaskGet",
      tool_input: { taskId: "5" },
      tool_response: { subject: "Deploy to prod", status: "pending" },
    };
    const result = taskGetFormatter.format(input);
    expect(result.contextText).toContain("Got task 5");
    expect(result.contextText).toContain("Deploy to prod");
    expect(result.ttsText).toBe(""); // noise
  });

  it("handles missing subject", () => {
    const input: PostToolUseInput = {
      tool_name: "TaskGet",
      tool_input: { taskId: "3" },
      tool_response: {},
    };
    const result = taskGetFormatter.format(input);
    expect(result.contextText).toContain("Got task 3");
  });
});
