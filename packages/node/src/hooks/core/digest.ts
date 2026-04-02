/**
 * Digest mode: accumulates tool use summaries during a Claude turn,
 * then produces a single summary when Claude stops.
 * File-based accumulation using XDG state dir (same as sequencer).
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { getStateDir } from "../config/index.js";
import { acquireLock, releaseLock, sanitizeSessionId } from "./file-lock.js";
import type { SignificanceLevel } from "./significance.js";

export interface DigestEntry {
  toolName: string;
  ttsText: string;
  contextText: string;
  significance: SignificanceLevel;
  timestamp: number;
}

interface DigestState {
  entries: DigestEntry[];
}

function getDigestDir(): string {
  return path.join(getStateDir(), "digests");
}

function getDigestPath(sessionId: string): string {
  return path.join(getDigestDir(), `${sanitizeSessionId(sessionId)}.json`);
}

function getLastDigestPath(sessionId: string): string {
  return path.join(getDigestDir(), `${sanitizeSessionId(sessionId)}.last.json`);
}

/**
 * Append an entry to the digest buffer for a session.
 */
export function appendToDigest(sessionId: string, entry: DigestEntry): void {
  const digestPath = getDigestPath(sessionId);
  const lockPath = digestPath + ".lock";
  const dir = path.dirname(digestPath);
  fs.mkdirSync(dir, { recursive: true });

  const lockAcquired = acquireLock(lockPath);
  try {
    let state: DigestState = { entries: [] };
    try {
      const raw = fs.readFileSync(digestPath, "utf-8");
      const parsed = JSON.parse(raw) as unknown;
      if (typeof parsed === "object" && parsed !== null && Array.isArray((parsed as DigestState).entries)) {
        state = parsed as DigestState;
      }
    } catch {
      // No existing digest or corrupted — start fresh
    }

    state.entries.push(entry);

    const tmpPath = digestPath + ".tmp";
    fs.writeFileSync(tmpPath, JSON.stringify(state), "utf-8");
    fs.renameSync(tmpPath, digestPath);
  } finally {
    if (lockAcquired) releaseLock(lockPath);
  }
}

/**
 * Flush the digest buffer: returns all entries and clears the file.
 */
export function flushDigest(sessionId: string): DigestEntry[] {
  const digestPath = getDigestPath(sessionId);
  const lockPath = digestPath + ".lock";

  const lockAcquired = acquireLock(lockPath);
  try {
    let entries: DigestEntry[] = [];
    try {
      const raw = fs.readFileSync(digestPath, "utf-8");
      const parsed = JSON.parse(raw) as unknown;
      if (typeof parsed === "object" && parsed !== null && Array.isArray((parsed as DigestState).entries)) {
        entries = (parsed as DigestState).entries;
      }
    } catch {
      return [];
    }

    try {
      fs.unlinkSync(digestPath);
    } catch {
      // Best effort
    }

    return entries;
  } finally {
    if (lockAcquired) releaseLock(lockPath);
  }
}

/**
 * Summarize digest entries into a FormattedOutput.
 * Pure function — no I/O.
 */
export function summarizeDigest(entries: DigestEntry[]): {
  contextText: string;
  ttsText: string;
} {
  if (entries.length === 0) {
    return { contextText: "No activity.", ttsText: "Done." };
  }

  const counts = { noise: 0, routine: 0, notable: 0, important: 0 };
  const toolCounts: Record<string, number> = {};
  const importantItems: string[] = [];
  const notableItems: string[] = [];

  for (const entry of entries) {
    counts[entry.significance]++;
    toolCounts[entry.toolName] = (toolCounts[entry.toolName] || 0) + 1;

    if (entry.significance === "important" && entry.ttsText) {
      importantItems.push(entry.ttsText);
    }
    if (entry.significance === "notable" && entry.ttsText) {
      notableItems.push(entry.ttsText);
    }
  }

  // Build TTS summary (target: under 15 words)
  const ttsParts: string[] = ["Done."];

  // Count edits (Write + notable Edit)
  const editCount = (toolCounts["Edit"] || 0) + (toolCounts["Write"] || 0);
  if (editCount > 0) {
    ttsParts.push(`${editCount} edit${editCount !== 1 ? "s" : ""}`);
  }

  // Mention test results if any
  if (importantItems.length > 0) {
    // Include first important item (usually test failure)
    const first = importantItems[0]!.replace(/^Important:\s*/, "");
    ttsParts.push(first);
  }

  // Count reads/searches
  const readCount = (toolCounts["Read"] || 0) + (toolCounts["Glob"] || 0) + (toolCounts["Grep"] || 0);
  if (readCount > 0) {
    ttsParts.push(`${readCount} read${readCount !== 1 ? "s" : ""}`);
  }

  const ttsText = ttsParts.join(" ");

  // Build contextText (detailed, grouped by significance)
  const contextParts: string[] = ["Session summary:"];

  if (importantItems.length > 0) {
    contextParts.push(`Important: ${importantItems.join("; ")}`);
  }
  if (notableItems.length > 0) {
    contextParts.push(`Notable: ${notableItems.slice(0, 5).join("; ")}${notableItems.length > 5 ? ` (+${notableItems.length - 5} more)` : ""}`);
  }

  // Tool breakdown
  const toolBreakdown = Object.entries(toolCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([tool, count]) => `${tool}: ${count}`)
    .join(", ");
  contextParts.push(`Tools: ${toolBreakdown}`);
  contextParts.push(`Total: ${entries.length} events (${counts.important} important, ${counts.notable} notable, ${counts.routine} routine, ${counts.noise} noise)`);

  const contextText = contextParts.join("\n");

  return { contextText, ttsText };
}

/**
 * Save the last digest summary for replay.
 */
export function saveLastDigest(sessionId: string, ttsText: string): void {
  const lastPath = getLastDigestPath(sessionId);
  const dir = path.dirname(lastPath);
  fs.mkdirSync(dir, { recursive: true });

  const tmpPath = lastPath + ".tmp";
  fs.writeFileSync(tmpPath, JSON.stringify({ ttsText, timestamp: Date.now() }), "utf-8");
  fs.renameSync(tmpPath, lastPath);
}

/**
 * Load the last digest summary for replay.
 */
export function loadLastDigest(sessionId: string): string | null {
  try {
    const raw = fs.readFileSync(getLastDigestPath(sessionId), "utf-8");
    const parsed = JSON.parse(raw) as { ttsText?: string };
    return parsed.ttsText || null;
  } catch {
    return null;
  }
}

/**
 * Load the most recent digest from any session.
 * Finds the newest .last.json file in the digests directory.
 */
export function loadMostRecentDigest(): string | null {
  try {
    const dir = getDigestDir();
    if (!fs.existsSync(dir)) return null;
    const files = fs.readdirSync(dir)
      .filter(f => f.endsWith(".last.json"));

    if (files.length === 0) return null;

    // Find the most recently modified
    let newest: { path: string; mtime: number } | null = null;
    for (const file of files) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (!newest || stat.mtimeMs > newest.mtime) {
        newest = { path: fullPath, mtime: stat.mtimeMs };
      }
    }

    if (!newest) return null;

    const raw = fs.readFileSync(newest.path, "utf-8");
    const parsed = JSON.parse(raw) as { ttsText?: string };
    return parsed.ttsText || null;
  } catch {
    return null;
  }
}
