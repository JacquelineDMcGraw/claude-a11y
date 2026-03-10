/**
 * Interactive event history navigator for blind developers.
 * Reads JSONL history from state dir, presents in two modes:
 * - Non-interactive (default): prints last N events with timestamps
 * - Interactive (-i): arrow key navigation with TTS
 */

import * as readline from "node:readline";
import { loadConfig } from "../../config/index.js";
import { speak } from "../../tts/index.js";
import { loadMostRecentHistory } from "../../core/history.js";
import type { HistoryEntry } from "../../core/history.js";

function formatTimestamp(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatEntryLine(entry: HistoryEntry, index: number): string {
  const time = formatTimestamp(entry.timestamp);
  const tool = entry.toolName ? `[${entry.toolName}]` : `[${entry.eventName}]`;
  const text = entry.ttsText || "(no speech)";
  return `${index + 1}. ${time} ${tool} ${text}`;
}

/**
 * Non-interactive mode: prints last N events with timestamps.
 */
export function historyCommandNonInteractive(count: number): void {
  const result = loadMostRecentHistory();

  if (!result || result.entries.length === 0) {
    console.log("No history found. Events appear after Claude uses tools.");
    return;
  }

  const entries = result.entries;
  const start = Math.max(0, entries.length - count);
  const shown = entries.slice(start);

  console.log(`${entries.length} total event${entries.length !== 1 ? "s" : ""} (showing last ${shown.length}):`);
  for (let i = 0; i < shown.length; i++) {
    console.log(formatEntryLine(shown[i]!, start + i));
  }
}

/**
 * Interactive mode: arrow key navigation with TTS announcements.
 */
export function historyCommandInteractive(count: number): void {
  const result = loadMostRecentHistory();
  const config = loadConfig();

  if (!result || result.entries.length === 0) {
    console.log("No history found.");
    return;
  }

  const entries = result.entries;
  const start = Math.max(0, entries.length - count);
  const shown = entries.slice(start);

  if (shown.length === 0) {
    console.log("No history found.");
    return;
  }

  let currentIndex = shown.length - 1; // Start at most recent

  function announceCurrent(): void {
    const entry = shown[currentIndex]!;
    const line = formatEntryLine(entry, start + currentIndex);
    process.stdout.write(`\r\x1b[K${line}`);
    if (config.tts.enabled) {
      const text = entry.ttsText || `${entry.eventName} event`;
      speak(text, config.tts);
    }
  }

  function showHelp(): void {
    console.log("\nUp/Down: navigate | Q: quit");
  }

  if (!process.stdin.isTTY) {
    console.log("Interactive mode requires a TTY. Use non-interactive mode instead.");
    return;
  }

  console.log(`${shown.length} event${shown.length !== 1 ? "s" : ""} (interactive mode):`);
  showHelp();
  announceCurrent();

  readline.emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.resume();

  process.stdin.on("keypress", (_str: string, key: readline.Key) => {
    if (!key) return;

    if (key.name === "q" || (key.ctrl && key.name === "c")) {
      console.log("\n");
      process.stdin.setRawMode(false);
      process.exit(0);
    }

    if (key.name === "up") {
      currentIndex = Math.max(0, currentIndex - 1);
      announceCurrent();
    } else if (key.name === "down") {
      currentIndex = Math.min(shown.length - 1, currentIndex + 1);
      announceCurrent();
    }
  });
}

/**
 * Main history command entry point.
 */
export function historyCommand(interactive: boolean, count: number): void {
  if (interactive) {
    historyCommandInteractive(count);
  } else {
    historyCommandNonInteractive(count);
  }
}
