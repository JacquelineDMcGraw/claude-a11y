import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  computeTaskDelta,
  loadTaskSnapshot,
  saveTaskSnapshot,
} from "../../../src/hooks/core/task-tracker.js";
import type { TaskSnapshot } from "../../../src/hooks/core/task-tracker.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hooks-task-test-"));
  process.env["XDG_STATE_HOME"] = tmpDir;
});

afterEach(() => {
  delete process.env["XDG_STATE_HOME"];
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("computeTaskDelta", () => {
  it("detects added tasks", () => {
    const previous: TaskSnapshot[] = [];
    const current: TaskSnapshot[] = [
      { id: "1", subject: "Fix bug", status: "pending" },
      { id: "2", subject: "Add tests", status: "pending" },
    ];
    const delta = computeTaskDelta(previous, current);
    expect(delta.added).toHaveLength(2);
    expect(delta.removed).toHaveLength(0);
    expect(delta.statusChanged).toHaveLength(0);
  });

  it("detects removed tasks", () => {
    const previous: TaskSnapshot[] = [
      { id: "1", subject: "Old task", status: "completed" },
    ];
    const current: TaskSnapshot[] = [];
    const delta = computeTaskDelta(previous, current);
    expect(delta.removed).toHaveLength(1);
    expect(delta.removed[0]!.subject).toBe("Old task");
  });

  it("detects status changes", () => {
    const previous: TaskSnapshot[] = [
      { id: "1", subject: "Fix bug", status: "pending" },
    ];
    const current: TaskSnapshot[] = [
      { id: "1", subject: "Fix bug", status: "completed" },
    ];
    const delta = computeTaskDelta(previous, current);
    expect(delta.statusChanged).toHaveLength(1);
    expect(delta.statusChanged[0]!.oldStatus).toBe("pending");
    expect(delta.statusChanged[0]!.newStatus).toBe("completed");
  });

  it("detects content changes (same status, different subject)", () => {
    const previous: TaskSnapshot[] = [
      { id: "1", subject: "Fix bug", status: "pending" },
    ];
    const current: TaskSnapshot[] = [
      { id: "1", subject: "Fix critical bug", status: "pending" },
    ];
    const delta = computeTaskDelta(previous, current);
    expect(delta.contentChanged).toHaveLength(1);
  });

  it("handles no changes", () => {
    const tasks: TaskSnapshot[] = [
      { id: "1", subject: "Task 1", status: "pending" },
    ];
    const delta = computeTaskDelta(tasks, tasks);
    expect(delta.added).toHaveLength(0);
    expect(delta.removed).toHaveLength(0);
    expect(delta.statusChanged).toHaveLength(0);
    expect(delta.contentChanged).toHaveLength(0);
  });

  it("handles mixed changes", () => {
    const previous: TaskSnapshot[] = [
      { id: "1", subject: "Done task", status: "completed" },
      { id: "2", subject: "In progress", status: "in_progress" },
    ];
    const current: TaskSnapshot[] = [
      { id: "2", subject: "In progress", status: "completed" },
      { id: "3", subject: "New task", status: "pending" },
    ];
    const delta = computeTaskDelta(previous, current);
    expect(delta.added).toHaveLength(1);
    expect(delta.removed).toHaveLength(1);
    expect(delta.statusChanged).toHaveLength(1);
  });

  it("handles empty both", () => {
    const delta = computeTaskDelta([], []);
    expect(delta.added).toHaveLength(0);
    expect(delta.removed).toHaveLength(0);
  });

  it("detects description change as content change", () => {
    const previous: TaskSnapshot[] = [
      { id: "1", subject: "Task", status: "pending", description: "old desc" },
    ];
    const current: TaskSnapshot[] = [
      { id: "1", subject: "Task", status: "pending", description: "new desc" },
    ];
    const delta = computeTaskDelta(previous, current);
    expect(delta.contentChanged).toHaveLength(1);
  });
});

describe("loadTaskSnapshot + saveTaskSnapshot", () => {
  it("saves and loads snapshot", () => {
    const tasks: TaskSnapshot[] = [
      { id: "1", subject: "Test", status: "pending" },
    ];
    saveTaskSnapshot("test-session", tasks);
    const loaded = loadTaskSnapshot("test-session");
    expect(loaded).toHaveLength(1);
    expect(loaded[0]!.subject).toBe("Test");
  });

  it("returns empty for missing session", () => {
    const loaded = loadTaskSnapshot("nonexistent");
    expect(loaded).toHaveLength(0);
  });

  it("overwrites previous snapshot", () => {
    saveTaskSnapshot("test-session", [{ id: "1", subject: "Old", status: "pending" }]);
    saveTaskSnapshot("test-session", [{ id: "2", subject: "New", status: "pending" }]);
    const loaded = loadTaskSnapshot("test-session");
    expect(loaded).toHaveLength(1);
    expect(loaded[0]!.subject).toBe("New");
  });

  it("handles corrupted snapshot file", () => {
    const taskDir = path.join(tmpDir, "claude-a11y-hooks", "tasks");
    fs.mkdirSync(taskDir, { recursive: true });
    fs.writeFileSync(path.join(taskDir, "corrupt.json"), "not json", "utf-8");

    const loaded = loadTaskSnapshot("corrupt");
    expect(loaded).toHaveLength(0);
  });

  it("isolates sessions", () => {
    saveTaskSnapshot("session-a", [{ id: "1", subject: "A", status: "pending" }]);
    saveTaskSnapshot("session-b", [{ id: "2", subject: "B", status: "pending" }]);

    const a = loadTaskSnapshot("session-a");
    const b = loadTaskSnapshot("session-b");
    expect(a[0]!.subject).toBe("A");
    expect(b[0]!.subject).toBe("B");
  });

  it("sanitizes session IDs with special characters", () => {
    const sessionId = "session/with\\special:chars";
    saveTaskSnapshot(sessionId, [{ id: "1", subject: "Test", status: "pending" }]);
    const loaded = loadTaskSnapshot(sessionId);
    expect(loaded).toHaveLength(1);
  });

  it("handles multiple tasks", () => {
    const tasks: TaskSnapshot[] = [
      { id: "1", subject: "Task 1", status: "pending" },
      { id: "2", subject: "Task 2", status: "in_progress" },
      { id: "3", subject: "Task 3", status: "completed" },
    ];
    saveTaskSnapshot("multi", tasks);
    const loaded = loadTaskSnapshot("multi");
    expect(loaded).toHaveLength(3);
  });
});
