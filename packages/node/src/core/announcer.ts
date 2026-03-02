/**
 * Tool activity announcements for screen reader users.
 *
 * Converts tool_use events into human-readable plain-text status lines
 * written to stderr. These let blind users know what Claude is doing
 * (reading files, running commands, etc.) without needing to see the
 * raw tool JSON.
 */

import type { ParsedToolUseEvent, ParsedResultEvent } from "./types.js";

const MAX_COMMAND_LENGTH = 100;

/**
 * Format a tool_use event as a human-readable announcement string.
 */
export function announceToolUse(event: ParsedToolUseEvent): string {
  const { name, input } = event;

  switch (name) {
    case "Read": {
      const filePath = input.file_path as string | undefined;
      return `[Tool] Reading file: ${filePath ?? "unknown"}`;
    }

    case "Write": {
      const filePath = input.file_path as string | undefined;
      return `[Tool] Writing file: ${filePath ?? "unknown"}`;
    }

    case "Edit": {
      const filePath = input.file_path as string | undefined;
      return `[Tool] Editing file: ${filePath ?? "unknown"}`;
    }

    case "Bash": {
      const command = input.command as string | undefined;
      if (!command) return "[Tool] Running command";
      const truncated = command.length > MAX_COMMAND_LENGTH
        ? command.slice(0, MAX_COMMAND_LENGTH) + "..."
        : command;
      return `[Tool] Running command: ${truncated}`;
    }

    case "Grep": {
      const pattern = input.pattern as string | undefined;
      const path = input.path as string | undefined;
      return `[Tool] Searching: "${pattern ?? ""}" in ${path ?? "project"}`;
    }

    case "Glob": {
      const pattern = input.pattern as string | undefined;
      return `[Tool] Finding files: ${pattern ?? ""}`;
    }

    case "Task": {
      const description = input.description as string | undefined;
      const prompt = input.prompt as string | undefined;
      const label = description ?? prompt?.slice(0, 60) ?? "subtask";
      return `[Tool] Starting subagent: ${label}`;
    }

    case "TodoRead": {
      return "[Tool] Reading todo list";
    }

    case "TodoWrite": {
      return "[Tool] Updating todo list";
    }

    case "WebFetch": {
      const url = input.url as string | undefined;
      return `[Tool] Fetching URL: ${url ?? "unknown"}`;
    }

    case "WebSearch": {
      const query = input.query as string | undefined;
      return `[Tool] Web search: ${query ?? ""}`;
    }

    case "NotebookEdit": {
      const nbPath = input.notebook_path as string | undefined;
      return `[Tool] Editing notebook: ${nbPath ?? "unknown"}`;
    }

    default: {
      // MCP tools or unknown tools — just show the name
      return `[Tool] Using ${name}`;
    }
  }
}

/**
 * Format a result event as a completion announcement.
 */
export function announceResult(event: ParsedResultEvent): string {
  if (event.cost > 0) {
    const turnStr = event.turns > 0
      ? `${event.turns} turn${event.turns !== 1 ? "s" : ""}, `
      : "";
    return `[Done] Response complete. (${turnStr}$${event.cost.toFixed(4)} cost)`;
  }

  if (event.turns > 0) {
    return `[Done] Response complete. (${event.turns} turn${event.turns !== 1 ? "s" : ""})`;
  }

  return "[Done] Response complete.";
}

/**
 * Format an error result for announcement.
 */
export function announceError(event: ParsedResultEvent): string {
  if (event.errors && event.errors.length > 0) {
    return `[Error] ${event.errors.join("; ")}`;
  }
  return "[Error] Claude returned an error.";
}

/**
 * Write an announcement to stderr with a newline.
 */
export function writeAnnouncement(text: string): void {
  process.stderr.write(text + "\n");
}
