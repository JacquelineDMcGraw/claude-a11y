import * as fs from "node:fs";
import * as path from "node:path";

/**
 * The hook object we register in Claude Code's settings.json.
 */
export interface A11yHook {
  type: "command";
  command: string;
}

export interface HookEntry {
  matcher: string;
  hooks: A11yHook[];
}

const HOOKS_COMMAND_PREFIX = "claude-a11y hooks format";

/** All hook event types claude-a11y registers for. */
const HOOK_EVENT_TYPES = [
  "PreToolUse",
  "PostToolUse",
  "Notification",
  "PermissionRequest",
  "Stop",
  "SubagentStart",
  "SubagentStop",
  "PostToolUseFailure",
  "TaskCompleted",
] as const;

/**
 * Get the path to Claude Code's settings.json.
 */
export function getSettingsPath(): string {
  const home = process.env["HOME"] || process.env["USERPROFILE"] || "/tmp";
  return path.join(home, ".claude", "settings.json");
}

/**
 * Read Claude Code settings. Returns null if file doesn't exist.
 * Throws if file exists but contains invalid JSON.
 */
export function readSettings(settingsPath?: string): Record<string, unknown> | null {
  const p = settingsPath || getSettingsPath();
  try {
    const raw = fs.readFileSync(p, "utf-8");
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error("Settings file is not a JSON object");
    }
    return parsed as Record<string, unknown>;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw err;
  }
}

/**
 * Write settings atomically (write-to-temp-then-rename with .bak backup).
 */
export function writeSettings(
  settings: Record<string, unknown>,
  settingsPath?: string,
): void {
  const p = settingsPath || getSettingsPath();
  const dir = path.dirname(p);
  fs.mkdirSync(dir, { recursive: true });

  const tmpPath = p + ".tmp";
  fs.writeFileSync(tmpPath, JSON.stringify(settings, null, 2) + "\n", "utf-8");

  // Backup existing settings
  try {
    fs.accessSync(p);
    fs.copyFileSync(p, p + ".bak");
  } catch {
    // No existing file to back up
  }

  fs.renameSync(tmpPath, p);
}

/**
 * Build the a11y hook entry for a given event type.
 */
function buildA11yHook(): HookEntry {
  return {
    matcher: "",
    hooks: [
      {
        type: "command",
        command: HOOKS_COMMAND_PREFIX,
      },
    ],
  };
}

/**
 * Structurally detect if a hook entry is an a11y hook.
 * Checks the command prefix, not JSON.stringify substring match.
 */
function isA11yHook(entry: unknown): boolean {
  if (typeof entry !== "object" || entry === null) return false;
  const obj = entry as Record<string, unknown>;
  if (!Array.isArray(obj["hooks"])) return false;
  return (obj["hooks"] as unknown[]).some((h) => {
    if (typeof h !== "object" || h === null) return false;
    const hook = h as Record<string, unknown>;
    return (
      hook["type"] === "command" &&
      typeof hook["command"] === "string" &&
      (hook["command"] as string).startsWith(HOOKS_COMMAND_PREFIX)
    );
  });
}

/**
 * Check if a11y hooks are already installed.
 * Checks PostToolUse for backward compatibility.
 */
export function isHooksInstalled(settingsPath?: string): boolean {
  const settings = readSettings(settingsPath);
  if (!settings) return false;
  const hooks = settings["hooks"] as Record<string, unknown> | undefined;
  if (!hooks) return false;
  const postToolUse = hooks["PostToolUse"] as unknown[] | undefined;
  if (!Array.isArray(postToolUse)) return false;
  return postToolUse.some(isA11yHook);
}

/**
 * Install a11y hooks for all supported event types into Claude Code settings.
 * If hooks exist but differ, replaces them (upgrade path).
 * Returns a description of what was done.
 */
export function installHooks(settingsPath?: string): string {
  const p = settingsPath || getSettingsPath();
  let settings = readSettings(p);

  if (settings === null) {
    settings = {};
  }

  if (!settings["hooks"] || typeof settings["hooks"] !== "object") {
    settings["hooks"] = {};
  }
  const hooks = settings["hooks"] as Record<string, unknown>;

  let updated = false;
  let installed = false;

  for (const eventType of HOOK_EVENT_TYPES) {
    if (!Array.isArray(hooks[eventType])) {
      hooks[eventType] = [];
    }
    const eventHooks = hooks[eventType] as unknown[];

    const existingIdx = eventHooks.findIndex(isA11yHook);
    const newHook = buildA11yHook();

    if (existingIdx >= 0) {
      eventHooks[existingIdx] = newHook;
      updated = true;
    } else {
      eventHooks.push(newHook);
      installed = true;
    }
  }

  writeSettings(settings, p);

  if (updated && !installed) {
    return "Updated existing a11y hooks.";
  }
  return "Installed a11y hooks.";
}

/**
 * Remove a11y hooks from all event types in Claude Code settings.
 * Returns a description of what was done.
 */
export function removeHooks(settingsPath?: string): string {
  const p = settingsPath || getSettingsPath();
  const settings = readSettings(p);

  if (settings === null) {
    return "No settings file found. Nothing to remove.";
  }

  const hooks = settings["hooks"] as Record<string, unknown> | undefined;
  if (!hooks) {
    return "No hooks found in settings. Nothing to remove.";
  }

  let totalRemoved = 0;

  for (const eventType of HOOK_EVENT_TYPES) {
    const eventHooks = hooks[eventType] as unknown[] | undefined;
    if (!Array.isArray(eventHooks)) continue;

    const before = eventHooks.length;
    const filtered = eventHooks.filter((entry) => !isA11yHook(entry));
    totalRemoved += before - filtered.length;
    hooks[eventType] = filtered;
  }

  if (totalRemoved === 0) {
    return "No a11y hooks found. Nothing to remove.";
  }

  writeSettings(settings, p);
  return `Removed ${totalRemoved} a11y hook(s).`;
}
