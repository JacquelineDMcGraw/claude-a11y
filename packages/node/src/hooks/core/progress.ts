/**
 * Progress timing: records tool start times and computes elapsed durations.
 * Uses XDG state dir for file-based storage (same pattern as digest/sequencer).
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { getStateDir } from "../config/index.js";

interface ProgressEntry {
  toolName: string;
  startMs: number;
}

interface ProgressState {
  entries: Record<string, ProgressEntry>;
}

function getProgressDir(): string {
  return path.join(getStateDir(), "progress");
}

function sanitizeSessionId(sessionId: string): string {
  return sessionId.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function getProgressPath(sessionId: string): string {
  return path.join(getProgressDir(), `${sanitizeSessionId(sessionId)}.json`);
}

/**
 * Record the start time of a tool use.
 */
export function recordToolStart(sessionId: string, toolUseId: string, toolName: string): void {
  const progressPath = getProgressPath(sessionId);
  const dir = path.dirname(progressPath);
  fs.mkdirSync(dir, { recursive: true });

  let state: ProgressState = { entries: {} };
  try {
    const raw = fs.readFileSync(progressPath, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      const p = parsed as { entries?: unknown };
      if (typeof p.entries === "object" && p.entries !== null && !Array.isArray(p.entries)) {
        state = parsed as ProgressState;
      }
    }
  } catch {
    // Start fresh
  }

  // Prune entries older than 5 minutes
  const cutoff = Date.now() - 5 * 60 * 1000;
  for (const [id, entry] of Object.entries(state.entries)) {
    if (entry.startMs < cutoff) {
      delete state.entries[id];
    }
  }

  state.entries[toolUseId] = { toolName, startMs: Date.now() };

  const tmpPath = progressPath + ".tmp";
  fs.writeFileSync(tmpPath, JSON.stringify(state), "utf-8");
  fs.renameSync(tmpPath, progressPath);
}

/**
 * Get elapsed milliseconds since a tool started.
 * Returns null if no start was recorded.
 */
export function getToolElapsed(sessionId: string, toolUseId: string): number | null {
  try {
    const raw = fs.readFileSync(getProgressPath(sessionId), "utf-8");
    const state = JSON.parse(raw) as ProgressState;
    const entry = state.entries?.[toolUseId];
    if (!entry) return null;
    return Date.now() - entry.startMs;
  } catch {
    return null;
  }
}

/**
 * Format elapsed milliseconds into a human-readable string.
 */
export function formatElapsed(ms: number): string {
  if (ms < 1000) return "under a second";

  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes === 0) {
    return `${seconds} second${seconds !== 1 ? "s" : ""}`;
  }
  if (seconds === 0) {
    return `${minutes} minute${minutes !== 1 ? "s" : ""}`;
  }
  return `${minutes} minute${minutes !== 1 ? "s" : ""} ${seconds} second${seconds !== 1 ? "s" : ""}`;
}
