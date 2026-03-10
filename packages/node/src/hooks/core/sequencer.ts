import * as fs from "node:fs";
import * as path from "node:path";
import { getStateDir } from "../config/index.js";

const BATCH_WINDOW_MS = 500;
const STALE_SESSION_MS = 60 * 60 * 1000; // 1 hour

export interface SequenceInfo {
  index: number;
  batchSize: number;
}

interface SessionEntry {
  toolUseId: string;
  toolName: string;
  timestamp: number;
}

interface SessionState {
  entries: SessionEntry[];
}

/**
 * Sanitize session ID for use in file paths.
 * Prevents path traversal by replacing non-alphanumeric chars.
 */
function sanitizeSessionId(sessionId: string): string {
  return sessionId.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function getSessionDir(): string {
  return path.join(getStateDir(), "sessions");
}

function getSessionPath(sessionId: string): string {
  return path.join(getSessionDir(), `${sanitizeSessionId(sessionId)}.json`);
}

/**
 * Record a tool use and return its sequence position within the current batch.
 * Results arriving within BATCH_WINDOW_MS of each other are grouped into a batch.
 */
export function recordAndSequence(
  sessionId: string,
  toolUseId: string,
  toolName: string,
): SequenceInfo {
  const sessionPath = getSessionPath(sessionId);
  const lockPath = sessionPath + ".lock";
  const now = Date.now();

  acquireLock(lockPath);
  try {
    const state = readSessionState(sessionPath);

    // Prune entries outside the batch window
    const recentEntries = state.entries.filter(
      (e) => now - e.timestamp < BATCH_WINDOW_MS,
    );

    // Check if this toolUseId is already recorded (idempotent)
    const existing = recentEntries.findIndex((e) => e.toolUseId === toolUseId);
    if (existing >= 0) {
      return {
        index: existing + 1,
        batchSize: recentEntries.length,
      };
    }

    // Add this entry
    const newEntry: SessionEntry = {
      toolUseId,
      toolName,
      timestamp: now,
    };
    recentEntries.push(newEntry);

    // Write updated state
    const newState: SessionState = { entries: recentEntries };
    writeSessionState(sessionPath, newState);

    return {
      index: recentEntries.length,
      batchSize: recentEntries.length,
    };
  } finally {
    releaseLock(lockPath);
  }
}

/**
 * Clean up session files older than 1 hour.
 */
export function cleanStaleSessions(): void {
  const dir = getSessionDir();
  try {
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir);
    const now = Date.now();

    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      const filePath = path.join(dir, file);
      try {
        const stat = fs.statSync(filePath);
        if (now - stat.mtimeMs > STALE_SESSION_MS) {
          fs.unlinkSync(filePath);
        }
      } catch {
        // Skip files that can't be accessed
      }
    }
  } catch {
    // Session dir doesn't exist or can't be read — nothing to clean
  }
}

const LOCK_RETRY_MS = 5;
const LOCK_MAX_WAIT_MS = 200;
const LOCK_STALE_MS = 5000;

function acquireLock(lockPath: string): void {
  const dir = path.dirname(lockPath);
  fs.mkdirSync(dir, { recursive: true });

  const deadline = Date.now() + LOCK_MAX_WAIT_MS;
  while (Date.now() < deadline) {
    try {
      fs.writeFileSync(lockPath, String(process.pid), { flag: "wx" });
      return;
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === "EEXIST") {
        // Break stale locks left by crashed processes
        try {
          const stat = fs.statSync(lockPath);
          if (Date.now() - stat.mtimeMs > LOCK_STALE_MS) {
            fs.unlinkSync(lockPath);
            continue;
          }
        } catch {
          // Lock disappeared between checks — retry will succeed
          continue;
        }
        const waitUntil = Date.now() + LOCK_RETRY_MS;
        while (Date.now() < waitUntil) {
          // busy-wait for a short interval
        }
        continue;
      }
      throw err;
    }
  }
  // Timed out — proceed without lock rather than blocking the hook pipeline
}

function releaseLock(lockPath: string): void {
  try {
    fs.unlinkSync(lockPath);
  } catch {
    // Already cleaned up
  }
}

function readSessionState(sessionPath: string): SessionState {
  try {
    const raw = fs.readFileSync(sessionPath, "utf-8");
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null && Array.isArray((parsed as SessionState).entries)) {
      return parsed as SessionState;
    }
  } catch {
    // File doesn't exist or is corrupt
  }
  return { entries: [] };
}

function writeSessionState(sessionPath: string, state: SessionState): void {
  const dir = path.dirname(sessionPath);
  fs.mkdirSync(dir, { recursive: true });

  const tmpPath = sessionPath + ".tmp";
  fs.writeFileSync(tmpPath, JSON.stringify(state), "utf-8");
  fs.renameSync(tmpPath, sessionPath);
}
