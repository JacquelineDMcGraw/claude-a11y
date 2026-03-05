/**
 * Formatters for TaskCreate, TaskUpdate, TaskList, TaskGet tools.
 * TaskCreate and TaskUpdate trigger delta tracking for meaningful announcements.
 * TaskList and TaskGet are informational (noise-level).
 */

import type { Formatter, PostToolUseInput, FormattedOutput } from "./types.js";
import {
  computeTaskDelta,
  loadTaskSnapshot,
  saveTaskSnapshot,
} from "../core/task-tracker.js";
import type { TaskSnapshot } from "../core/task-tracker.js";

/**
 * Extract task snapshots from TaskCreate/TaskUpdate tool response.
 * The response typically includes the current task list state.
 */
function extractTasksFromResponse(response: Record<string, unknown>): TaskSnapshot[] {
  // TaskCreate response includes the created task info
  // TaskUpdate response includes the updated task info
  // We build a single-task snapshot from whatever we can extract
  const tasks: TaskSnapshot[] = [];

  const id = String(response["taskId"] || response["id"] || "");
  const subject = String(response["subject"] || "");
  const status = String(response["status"] || "pending");

  if (id) {
    tasks.push({
      id,
      subject,
      status,
      description: typeof response["description"] === "string" ? response["description"] : undefined,
    });
  }

  // If there's a full task list in the response, use that
  if (Array.isArray(response["tasks"])) {
    for (const t of response["tasks"] as unknown[]) {
      if (typeof t === "object" && t !== null) {
        const task = t as Record<string, unknown>;
        const taskId = String(task["id"] || task["taskId"] || "");
        if (taskId) {
          tasks.push({
            id: taskId,
            subject: String(task["subject"] || ""),
            status: String(task["status"] || "pending"),
            description: typeof task["description"] === "string" ? task["description"] : undefined,
          });
        }
      }
    }
  }

  return tasks;
}

export const taskCreateFormatter: Formatter = {
  id: "task-create",
  toolNames: ["TaskCreate"],
  format(input: PostToolUseInput): FormattedOutput {
    const subject = String(input.tool_input["subject"] || "");
    const id = String(input.tool_response["taskId"] || input.tool_response["id"] || "");

    // Track task state
    if (input.session_id) {
      try {
        const currentTasks = extractTasksFromResponse(input.tool_response);
        if (currentTasks.length > 0) {
          const previous = loadTaskSnapshot(input.session_id);
          saveTaskSnapshot(input.session_id, mergeSnapshots(previous, currentTasks));
        }
      } catch {
        // Tracking failure is non-fatal
      }
    }

    const idPart = id ? ` #${id}` : "";
    const subjectPart = subject ? `: ${subject}` : "";

    return {
      contextText: `Created task${idPart}${subjectPart}.`,
      ttsText: subject ? `New task: ${subject}.` : "New task created.",
    };
  },
};

export const taskUpdateFormatter: Formatter = {
  id: "task-update",
  toolNames: ["TaskUpdate"],
  format(input: PostToolUseInput): FormattedOutput {
    const taskId = String(input.tool_input["taskId"] || "");
    const newStatus = input.tool_input["status"] as string | undefined;
    const subject = String(input.tool_response["subject"] || input.tool_input["subject"] || "");

    // Track task state and compute delta
    if (input.session_id) {
      try {
        const previous = loadTaskSnapshot(input.session_id);
        const currentTasks = extractTasksFromResponse(input.tool_response);
        if (currentTasks.length > 0) {
          const merged = mergeSnapshots(previous, currentTasks);
          const delta = computeTaskDelta(previous, merged);
          saveTaskSnapshot(input.session_id, merged);

          // If we detected a meaningful status change, use that
          if (delta.statusChanged.length > 0) {
            const change = delta.statusChanged[0]!;
            const taskLabel = change.task.subject || `Task ${taskId}`;
            return {
              contextText: `Task ${taskId} status: ${change.oldStatus} → ${change.newStatus}. Subject: ${taskLabel}.`,
              ttsText: `Task ${taskId} ${change.newStatus}.`,
            };
          }
        }
      } catch {
        // Tracking failure is non-fatal
      }
    }

    // Fallback: use direct status from input
    if (newStatus) {
      const taskLabel = subject || `Task ${taskId}`;
      return {
        contextText: `Task ${taskId} set to ${newStatus}. Subject: ${taskLabel}.`,
        ttsText: `Task ${taskId} ${newStatus}.`,
      };
    }

    return {
      contextText: `Updated task ${taskId}.`,
      ttsText: `Task ${taskId} updated.`,
    };
  },
};

export const taskListFormatter: Formatter = {
  id: "task-list",
  toolNames: ["TaskList"],
  format(input: PostToolUseInput): FormattedOutput {
    // Save snapshot for future delta comparison
    if (input.session_id) {
      try {
        const tasks = extractTasksFromResponse(input.tool_response);
        if (tasks.length > 0) {
          saveTaskSnapshot(input.session_id, tasks);
        }
      } catch {
        // Non-fatal
      }
    }

    const tasks = Array.isArray(input.tool_response["tasks"])
      ? (input.tool_response["tasks"] as unknown[]).length
      : 0;

    return {
      contextText: `Listed ${tasks} task${tasks !== 1 ? "s" : ""}.`,
      ttsText: "", // noise — silenced by significance classifier
    };
  },
};

export const taskGetFormatter: Formatter = {
  id: "task-get",
  toolNames: ["TaskGet"],
  format(input: PostToolUseInput): FormattedOutput {
    const taskId = String(input.tool_input["taskId"] || "");
    const subject = String(input.tool_response["subject"] || "");

    return {
      contextText: `Got task ${taskId}${subject ? `: ${subject}` : ""}.`,
      ttsText: "", // noise — silenced by significance classifier
    };
  },
};

/**
 * Merge new tasks into existing snapshot (update existing, add new).
 */
function mergeSnapshots(previous: TaskSnapshot[], updates: TaskSnapshot[]): TaskSnapshot[] {
  const map = new Map<string, TaskSnapshot>();
  for (const t of previous) {
    map.set(t.id, t);
  }
  for (const t of updates) {
    map.set(t.id, t);
  }
  return Array.from(map.values());
}
