/**
 * Task delta tracking: detects changes in the task list across
 * TaskCreate/TaskUpdate/TaskList PostToolUse events.
 * File-based snapshots using XDG state dir.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { getStateDir } from "../config/index.js";
import { sanitizeSessionId } from "./file-lock.js";

export interface TaskSnapshot {
  id: string;
  subject: string;
  status: string;
  description?: string;
  blockedBy?: string[];
}

export interface TaskDelta {
  added: TaskSnapshot[];
  removed: TaskSnapshot[];
  statusChanged: Array<{
    task: TaskSnapshot;
    oldStatus: string;
    newStatus: string;
  }>;
  contentChanged: TaskSnapshot[];
}

function getTaskDir(): string {
  return path.join(getStateDir(), "tasks");
}


function getSnapshotPath(sessionId: string): string {
  return path.join(getTaskDir(), `${sanitizeSessionId(sessionId)}.json`);
}

/**
 * Compute delta between previous and current task snapshots.
 * Pure function — no I/O.
 */
export function computeTaskDelta(previous: TaskSnapshot[], current: TaskSnapshot[]): TaskDelta {
  const prevMap = new Map<string, TaskSnapshot>();
  for (const t of previous) {
    prevMap.set(t.id, t);
  }

  const currMap = new Map<string, TaskSnapshot>();
  for (const t of current) {
    currMap.set(t.id, t);
  }

  const added: TaskSnapshot[] = [];
  const removed: TaskSnapshot[] = [];
  const statusChanged: TaskDelta["statusChanged"] = [];
  const contentChanged: TaskSnapshot[] = [];

  // Find added and changed
  for (const [id, curr] of currMap) {
    const prev = prevMap.get(id);
    if (!prev) {
      added.push(curr);
    } else {
      if (prev.status !== curr.status) {
        statusChanged.push({ task: curr, oldStatus: prev.status, newStatus: curr.status });
      } else if (prev.subject !== curr.subject || prev.description !== curr.description) {
        contentChanged.push(curr);
      }
    }
  }

  // Find removed
  for (const [id, prev] of prevMap) {
    if (!currMap.has(id)) {
      removed.push(prev);
    }
  }

  return { added, removed, statusChanged, contentChanged };
}

/**
 * Load the previous task snapshot for a session.
 */
export function loadTaskSnapshot(sessionId: string): TaskSnapshot[] {
  try {
    const raw = fs.readFileSync(getSnapshotPath(sessionId), "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return parsed as TaskSnapshot[];
    }
  } catch {
    // No previous snapshot
  }
  return [];
}

/**
 * Save the current task snapshot for a session.
 */
export function saveTaskSnapshot(sessionId: string, tasks: TaskSnapshot[]): void {
  const snapshotPath = getSnapshotPath(sessionId);
  const dir = path.dirname(snapshotPath);
  fs.mkdirSync(dir, { recursive: true });

  const tmpPath = snapshotPath + ".tmp";
  fs.writeFileSync(tmpPath, JSON.stringify(tasks), "utf-8");
  fs.renameSync(tmpPath, snapshotPath);
}
