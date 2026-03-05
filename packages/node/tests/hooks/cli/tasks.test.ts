import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { saveTaskSnapshot } from "../../../src/hooks/core/task-tracker.js";
import { tasksCommandNonInteractive } from "../../../src/hooks/cli/commands/tasks.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hooks-tasks-cli-test-"));
  process.env["XDG_STATE_HOME"] = tmpDir;
});

afterEach(() => {
  delete process.env["XDG_STATE_HOME"];
  fs.rmSync(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("tasksCommandNonInteractive", () => {
  it("prints message when no tasks exist", () => {
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logs.push(args.join(" "));
    });

    tasksCommandNonInteractive();
    expect(logs.some(l => l.includes("No tasks found"))).toBe(true);
  });

  it("lists tasks from snapshot", () => {
    saveTaskSnapshot("test-session", [
      { id: "1", subject: "Fix auth bug", status: "pending" },
      { id: "2", subject: "Add tests", status: "in_progress" },
      { id: "3", subject: "Deploy", status: "completed" },
    ]);

    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logs.push(args.join(" "));
    });

    tasksCommandNonInteractive();

    expect(logs[0]).toContain("3 tasks");
    expect(logs.some(l => l.includes("Fix auth bug") && l.includes("[ ]"))).toBe(true);
    expect(logs.some(l => l.includes("Add tests") && l.includes("[>]"))).toBe(true);
    expect(logs.some(l => l.includes("Deploy") && l.includes("[x]"))).toBe(true);
  });

  it("uses singular for 1 task", () => {
    saveTaskSnapshot("test-session", [
      { id: "1", subject: "Only task", status: "pending" },
    ]);

    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logs.push(args.join(" "));
    });

    tasksCommandNonInteractive();
    expect(logs[0]).toContain("1 task");
    expect(logs[0]).not.toContain("tasks");
  });

  it("shows task IDs", () => {
    saveTaskSnapshot("test-session", [
      { id: "7", subject: "Task seven", status: "pending" },
    ]);

    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logs.push(args.join(" "));
    });

    tasksCommandNonInteractive();
    expect(logs.some(l => l.includes("#7"))).toBe(true);
  });

  it("handles corrupted snapshot gracefully", () => {
    const taskDir = path.join(tmpDir, "claude-a11y-hooks", "tasks");
    fs.mkdirSync(taskDir, { recursive: true });
    fs.writeFileSync(path.join(taskDir, "bad.json"), "not json", "utf-8");

    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logs.push(args.join(" "));
    });

    tasksCommandNonInteractive();
    expect(logs.some(l => l.includes("No tasks found"))).toBe(true);
  });

  it("uses most recent snapshot when multiple exist", () => {
    saveTaskSnapshot("old-session", [
      { id: "1", subject: "Old task", status: "pending" },
    ]);

    // Brief pause to ensure different mtime
    saveTaskSnapshot("new-session", [
      { id: "2", subject: "New task", status: "pending" },
    ]);

    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logs.push(args.join(" "));
    });

    tasksCommandNonInteractive();
    expect(logs.some(l => l.includes("New task"))).toBe(true);
  });
});
