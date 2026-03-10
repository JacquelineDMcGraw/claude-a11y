/**
 * Event history: JSONL log of hook events per session.
 * Used by the history CLI command for reviewing past announcements.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { getStateDir } from "../config/index.js";
import { acquireLock, releaseLock } from "./file-lock.js";

export interface HistoryEntry {
  timestamp: number;
  eventName: string;
  toolName?: string;
  ttsText: string | null;
  earcon: string | null;
}

function getHistoryDir(): string {
  return path.join(getStateDir(), "history");
}

function sanitizeSessionId(sessionId: string): string {
  return sessionId.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function getHistoryPath(sessionId: string): string {
  return path.join(getHistoryDir(), `${sanitizeSessionId(sessionId)}.jsonl`);
}

/**
 * Append an entry to the history log for a session.
 * Auto-trims when over maxEntries.
 */
export function appendToHistory(
  sessionId: string | undefined,
  entry: HistoryEntry,
  maxEntries: number = 500,
): void {
  if (!sessionId) return;

  const historyPath = getHistoryPath(sessionId);
  const lockPath = historyPath + ".lock";
  const dir = path.dirname(historyPath);
  fs.mkdirSync(dir, { recursive: true });

  const lockAcquired = acquireLock(lockPath);
  try {
    const line = JSON.stringify(entry) + "\n";

    let existingContent: string | null = null;
    try {
      existingContent = fs.readFileSync(historyPath, "utf-8");
    } catch {
      // File doesn't exist yet
    }

    if (existingContent !== null) {
      const lines = existingContent.split("\n").filter((l) => l.trim());
      if (lines.length >= maxEntries) {
        const keep = lines.slice(lines.length - (maxEntries - 1));
        const tmpPath = historyPath + ".tmp";
        try {
          fs.writeFileSync(tmpPath, keep.join("\n") + "\n" + line, "utf-8");
          fs.renameSync(tmpPath, historyPath);
          return;
        } catch {
          // Fall through to simple append
        }
      }
    }

    fs.appendFileSync(historyPath, line, "utf-8");
  } finally {
    if (lockAcquired) releaseLock(lockPath);
  }
}

/**
 * Load all history entries for a session.
 */
export function loadHistory(sessionId: string): HistoryEntry[] {
  try {
    const content = fs.readFileSync(getHistoryPath(sessionId), "utf-8");
    return content
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => {
        try {
          return JSON.parse(l) as HistoryEntry;
        } catch {
          return null;
        }
      })
      .filter((e): e is HistoryEntry => e !== null);
  } catch {
    return [];
  }
}

/**
 * Load the most recent history from any session.
 * Finds the newest .jsonl file in the history directory by mtime.
 */
export function loadMostRecentHistory(): { sessionId: string; entries: HistoryEntry[] } | null {
  try {
    const dir = getHistoryDir();
    if (!fs.existsSync(dir)) return null;

    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".jsonl"));
    if (files.length === 0) return null;

    let newest: { path: string; name: string; mtime: number } | null = null;
    for (const file of files) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (!newest || stat.mtimeMs > newest.mtime) {
        newest = { path: fullPath, name: file, mtime: stat.mtimeMs };
      }
    }

    if (!newest) return null;

    const sessionId = newest.name.replace(/\.jsonl$/, "");
    const content = fs.readFileSync(newest.path, "utf-8");
    const entries = content
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => {
        try {
          return JSON.parse(l) as HistoryEntry;
        } catch {
          return null;
        }
      })
      .filter((e): e is HistoryEntry => e !== null);

    return { sessionId, entries };
  } catch {
    return null;
  }
}
