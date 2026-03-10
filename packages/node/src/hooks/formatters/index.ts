import type { Formatter, PostToolUseInput, FormattedOutput } from "./types.js";
import { fallbackFormatter } from "./fallback.js";
import { bashFormatter } from "./bash.js";
import { editFormatter } from "./edit.js";
import { writeFormatter } from "./write.js";
import { readFormatter } from "./read.js";
import { grepFormatter } from "./grep.js";
import { globFormatter } from "./glob.js";
import { webFetchFormatter } from "./web-fetch.js";
import { webSearchFormatter } from "./web-search.js";
import { taskFormatter } from "./task.js";
import { taskCreateFormatter, taskUpdateFormatter, taskListFormatter, taskGetFormatter } from "./task-tools.js";

export type { Formatter, PostToolUseInput, FormattedOutput, HookJsonOutput } from "./types.js";

const formatterMap = new Map<string, Formatter>();

/**
 * Register a formatter. Throws on tool name conflict (fail fast at startup).
 */
export function registerFormatter(f: Formatter): void {
  for (const name of f.toolNames) {
    const existing = formatterMap.get(name);
    if (existing) {
      throw new Error(
        `Formatter conflict: "${name}" already registered by "${existing.id}", cannot register "${f.id}"`,
      );
    }
    formatterMap.set(name, f);
  }
}

/**
 * Get the formatter for a tool name, or undefined if none registered.
 */
export function getFormatter(toolName: string): Formatter | undefined {
  return formatterMap.get(toolName);
}

/**
 * Format a tool use, with try/catch wrapper for safety.
 * Returns fallback output if the formatter throws.
 */
export function formatToolUse(input: PostToolUseInput): FormattedOutput {
  const formatter = formatterMap.get(input.tool_name) || fallbackFormatter;
  try {
    return formatter.format(input);
  } catch {
    // Buggy formatter falls back gracefully
    return fallbackFormatter.format(input);
  }
}

/**
 * Clear all registered formatters (for testing).
 */
export function clearFormatters(): void {
  formatterMap.clear();
}

/**
 * Register all built-in formatters.
 */
export function registerBuiltinFormatters(): void {
  formatterMap.clear();
  registerFormatter(bashFormatter);
  registerFormatter(editFormatter);
  registerFormatter(writeFormatter);
  registerFormatter(readFormatter);
  registerFormatter(grepFormatter);
  registerFormatter(globFormatter);
  registerFormatter(webFetchFormatter);
  registerFormatter(webSearchFormatter);
  registerFormatter(taskFormatter);
  registerFormatter(taskCreateFormatter);
  registerFormatter(taskUpdateFormatter);
  registerFormatter(taskListFormatter);
  registerFormatter(taskGetFormatter);
}

// Register built-in formatters on module load
registerBuiltinFormatters();
