/**
 * Interactive task navigator for blind developers.
 * Reads task snapshots from state dir, presents in two modes:
 * - Non-interactive (default): prints each task on one line
 * - Interactive (-i): arrow key navigation with TTS
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline";
import { getStateDir } from "../../config/index.js";
import { loadConfig } from "../../config/index.js";
import { speak } from "../../tts/index.js";
import type { TaskSnapshot } from "../../core/task-tracker.js";

/**
 * Load the most recent task snapshot from any session.
 */
function loadLatestTasks(): TaskSnapshot[] {
  const taskDir = path.join(getStateDir(), "tasks");
  try {
    if (!fs.existsSync(taskDir)) return [];
    const files = fs.readdirSync(taskDir).filter(f => f.endsWith(".json"));
    if (files.length === 0) return [];

    // Find the most recently modified
    let newest: { path: string; mtime: number } | null = null;
    for (const file of files) {
      const fullPath = path.join(taskDir, file);
      const stat = fs.statSync(fullPath);
      if (!newest || stat.mtimeMs > newest.mtime) {
        newest = { path: fullPath, mtime: stat.mtimeMs };
      }
    }

    if (!newest) return [];
    const raw = fs.readFileSync(newest.path, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) return parsed as TaskSnapshot[];
  } catch {
    // Best effort
  }
  return [];
}

function formatTaskLine(task: TaskSnapshot): string {
  const statusIcon = task.status === "completed" ? "[x]"
    : task.status === "in_progress" ? "[>]"
    : "[ ]";
  return `${statusIcon} #${task.id} ${task.subject} (${task.status})`;
}

function formatTaskDetail(task: TaskSnapshot): string {
  const lines: string[] = [
    `Task #${task.id}: ${task.subject}`,
    `Status: ${task.status}`,
  ];
  if (task.description) {
    lines.push(`Description: ${task.description}`);
  }
  if (task.blockedBy && task.blockedBy.length > 0) {
    lines.push(`Blocked by: ${task.blockedBy.join(", ")}`);
  }
  return lines.join("\n");
}

/**
 * Non-interactive mode: prints each task on one line.
 */
export function tasksCommandNonInteractive(): void {
  const tasks = loadLatestTasks();

  if (tasks.length === 0) {
    console.log("No tasks found. Tasks appear after Claude uses TaskCreate/TaskUpdate.");
    return;
  }

  console.log(`${tasks.length} task${tasks.length !== 1 ? "s" : ""}:`);
  for (let i = 0; i < tasks.length; i++) {
    console.log(formatTaskLine(tasks[i]!));
  }
}

/**
 * Interactive mode: arrow key navigation with TTS announcements.
 */
export function tasksCommandInteractive(): void {
  const tasks = loadLatestTasks();
  const config = loadConfig();

  if (tasks.length === 0) {
    console.log("No tasks found.");
    return;
  }

  let currentIndex = 0;
  let inDetail = false;

  function announceCurrentTask(): void {
    const task = tasks[currentIndex]!;
    const line = formatTaskLine(task);
    process.stdout.write(`\r\x1b[K${line}`);
    if (config.tts.enabled) {
      speak(`${task.subject}. ${task.status}.`, config.tts);
    }
  }

  function showDetail(): void {
    const task = tasks[currentIndex]!;
    const detail = formatTaskDetail(task);
    console.log(`\n${detail}`);
    if (config.tts.enabled) {
      speak(detail.replace(/\n/g, ". "), config.tts);
    }
    inDetail = true;
  }

  function showHelp(): void {
    console.log("\nUp/Down: navigate | Right/Enter: details | Left/Esc: back | Q: quit");
  }

  if (!process.stdin.isTTY) {
    console.log("Interactive mode requires a TTY. Use non-interactive mode instead.");
    return;
  }

  console.log(`${tasks.length} task${tasks.length !== 1 ? "s" : ""} (interactive mode):`);
  showHelp();
  announceCurrentTask();

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
      if (inDetail) {
        inDetail = false;
      }
      currentIndex = Math.max(0, currentIndex - 1);
      announceCurrentTask();
    } else if (key.name === "down") {
      if (inDetail) {
        inDetail = false;
      }
      currentIndex = Math.min(tasks.length - 1, currentIndex + 1);
      announceCurrentTask();
    } else if (key.name === "right" || key.name === "return") {
      showDetail();
    } else if (key.name === "left" || key.name === "escape") {
      if (inDetail) {
        inDetail = false;
        announceCurrentTask();
      }
    }
  });
}

/**
 * Main tasks command entry point.
 */
export function tasksCommand(interactive: boolean): void {
  if (interactive) {
    tasksCommandInteractive();
  } else {
    tasksCommandNonInteractive();
  }
}
