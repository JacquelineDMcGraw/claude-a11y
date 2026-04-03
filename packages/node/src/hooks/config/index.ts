import * as fs from "node:fs";
import * as path from "node:path";
import type { HooksConfig } from "./types.js";
import { DEFAULT_CONFIG } from "./defaults.js";

export { DEFAULT_CONFIG } from "./defaults.js";
export type { HooksConfig, Verbosity, TtsConfig, PermissionRule, PermissionsConfig, SilenceConfig, SignificanceConfig, DigestConfig, EarconConfig, ProgressConfig, HistoryConfig, SummarizeConfig } from "./types.js";

const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/**
 * Resolve the config directory following XDG conventions.
 */
export function getConfigDir(): string {
  if (process.env["CLAUDE_A11Y_HOOKS_CONFIG_DIR"]) {
    return process.env["CLAUDE_A11Y_HOOKS_CONFIG_DIR"];
  }
  const xdg = process.env["XDG_CONFIG_HOME"] || path.join(homedir(), ".config");
  return path.join(xdg, "claude-a11y", "hooks");
}

/**
 * Resolve the state directory following XDG conventions (for logs).
 */
export function getStateDir(): string {
  const xdg = process.env["XDG_STATE_HOME"] || path.join(homedir(), ".local", "state");
  return path.join(xdg, "claude-a11y", "hooks");
}

function homedir(): string {
  return process.env["HOME"] || process.env["USERPROFILE"] || "/tmp";
}

function getConfigPath(): string {
  return path.join(getConfigDir(), "config.json");
}

/**
 * Load config, returning defaults on any error.
 */
export function loadConfig(): HooksConfig {
  try {
    const raw = fs.readFileSync(getConfigPath(), "utf-8");
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return structuredClone(DEFAULT_CONFIG) as HooksConfig;
    }
    return mergeConfig(parsed as Record<string, unknown>);
  } catch {
    return structuredClone(DEFAULT_CONFIG) as HooksConfig;
  }
}

/**
 * Deep merge user config over defaults.
 */
function mergeConfig(user: Record<string, unknown>): HooksConfig {
  const base = structuredClone(DEFAULT_CONFIG) as HooksConfig;
  if (isValidVerbosity(user["verbosity"])) {
    base.verbosity = user["verbosity"];
  }
  if (typeof user["tts"] === "object" && user["tts"] !== null && !Array.isArray(user["tts"])) {
    const tts = user["tts"] as Record<string, unknown>;
    if (typeof tts["enabled"] === "boolean") base.tts.enabled = tts["enabled"];
    if (isValidEngine(tts["engine"])) base.tts.engine = tts["engine"];
    if (typeof tts["rate"] === "number" && tts["rate"] > 0) base.tts.rate = tts["rate"];
    if (typeof tts["maxLength"] === "number" && tts["maxLength"] > 0)
      base.tts.maxLength = tts["maxLength"];
  }
  if (typeof user["permissions"] === "object" && user["permissions"] !== null && !Array.isArray(user["permissions"])) {
    const perms = user["permissions"] as Record<string, unknown>;
    if (Array.isArray(perms["rules"])) {
      base.permissions.rules = (perms["rules"] as unknown[]).filter(isValidPermissionRule);
    }
  }
  if (typeof user["silence"] === "object" && user["silence"] !== null && !Array.isArray(user["silence"])) {
    const silence = user["silence"] as Record<string, unknown>;
    if (typeof silence["enabled"] === "boolean") base.silence.enabled = silence["enabled"];
    if (typeof silence["tools"] === "object" && silence["tools"] !== null && !Array.isArray(silence["tools"])) {
      const tools = silence["tools"] as Record<string, unknown>;
      for (const [key, val] of Object.entries(tools)) {
        if (DANGEROUS_KEYS.has(key)) continue;
        if (typeof val === "boolean") {
          base.silence.tools[key] = val;
        }
      }
    }
  }
  if (typeof user["significance"] === "object" && user["significance"] !== null && !Array.isArray(user["significance"])) {
    const sig = user["significance"] as Record<string, unknown>;
    if (typeof sig["enabled"] === "boolean") base.significance.enabled = sig["enabled"];
    if (typeof sig["overrides"] === "object" && sig["overrides"] !== null && !Array.isArray(sig["overrides"])) {
      const overrides = sig["overrides"] as Record<string, unknown>;
      for (const [key, val] of Object.entries(overrides)) {
        if (DANGEROUS_KEYS.has(key)) continue;
        if (isValidSignificanceLevel(val)) {
          base.significance.overrides[key] = val;
        }
      }
    }
  }
  if (typeof user["digest"] === "object" && user["digest"] !== null && !Array.isArray(user["digest"])) {
    const digest = user["digest"] as Record<string, unknown>;
    if (typeof digest["enabled"] === "boolean") base.digest.enabled = digest["enabled"];
  }
  if (typeof user["earcon"] === "object" && user["earcon"] !== null && !Array.isArray(user["earcon"])) {
    const earcon = user["earcon"] as Record<string, unknown>;
    if (typeof earcon["enabled"] === "boolean") base.earcon.enabled = earcon["enabled"];
    if (isValidEarconEngine(earcon["engine"])) base.earcon.engine = earcon["engine"];
    if (typeof earcon["volume"] === "number") base.earcon.volume = Math.max(0, Math.min(1, earcon["volume"]));
    if (typeof earcon["overrides"] === "object" && earcon["overrides"] !== null && !Array.isArray(earcon["overrides"])) {
      const overrides = earcon["overrides"] as Record<string, unknown>;
      for (const [key, val] of Object.entries(overrides)) {
        if (DANGEROUS_KEYS.has(key)) continue;
        if (typeof val === "string" || val === false) {
          base.earcon.overrides[key] = val;
        }
      }
    }
  }
  if (typeof user["progress"] === "object" && user["progress"] !== null && !Array.isArray(user["progress"])) {
    const progress = user["progress"] as Record<string, unknown>;
    if (typeof progress["enabled"] === "boolean") base.progress.enabled = progress["enabled"];
    if (typeof progress["thresholdMs"] === "number" && progress["thresholdMs"] > 0)
      base.progress.thresholdMs = progress["thresholdMs"];
  }
  if (typeof user["history"] === "object" && user["history"] !== null && !Array.isArray(user["history"])) {
    const history = user["history"] as Record<string, unknown>;
    if (typeof history["enabled"] === "boolean") base.history.enabled = history["enabled"];
    if (typeof history["maxEntries"] === "number" && history["maxEntries"] > 0)
      base.history.maxEntries = history["maxEntries"];
  }
  if (typeof user["summarize"] === "object" && user["summarize"] !== null && !Array.isArray(user["summarize"])) {
    const summarize = user["summarize"] as Record<string, unknown>;
    if (typeof summarize["enabled"] === "boolean") base.summarize.enabled = summarize["enabled"];
    if (typeof summarize["maxDeclarations"] === "number" && summarize["maxDeclarations"] > 0)
      base.summarize.maxDeclarations = summarize["maxDeclarations"];
    if (typeof summarize["maxTtsNames"] === "number" && summarize["maxTtsNames"] > 0)
      base.summarize.maxTtsNames = summarize["maxTtsNames"];
  }
  return base;
}

function isValidVerbosity(v: unknown): v is HooksConfig["verbosity"] {
  return v === "compact" || v === "minimal" || v === "normal" || v === "full";
}

function isValidEngine(v: unknown): v is HooksConfig["tts"]["engine"] {
  return v === "auto" || v === "say" || v === "spd-say";
}

function isValidEarconEngine(v: unknown): v is HooksConfig["earcon"]["engine"] {
  return v === "auto" || v === "afplay" || v === "paplay" || v === "canberra-gtk-play";
}

function isValidSignificanceLevel(v: unknown): v is import("../core/significance.js").SignificanceLevel {
  return v === "noise" || v === "routine" || v === "notable" || v === "important";
}

function isValidPermissionRule(v: unknown): v is import("./types.js").PermissionRule {
  if (typeof v !== "object" || v === null) return false;
  const obj = v as Record<string, unknown>;
  if (typeof obj["tool"] !== "string") return false;
  if (obj["action"] !== "allow" && obj["action"] !== "deny") return false;
  if (obj["pattern"] !== undefined && typeof obj["pattern"] !== "string") return false;
  return true;
}

/**
 * Set a config value by dotted key path (e.g., "tts.enabled").
 * Guards against prototype pollution.
 */
const VALID_TOP_LEVEL_KEYS = new Set(Object.keys(DEFAULT_CONFIG));

export function setConfigValue(key: string, value: unknown): void {
  if (!key || key.trim() === "") {
    throw new Error("Config key cannot be empty");
  }
  const parts = key.split(".");
  for (const part of parts) {
    if (DANGEROUS_KEYS.has(part)) {
      throw new Error(`Refusing to set dangerous key: ${part}`);
    }
  }

  const topKey = parts[0]!;
  if (!VALID_TOP_LEVEL_KEYS.has(topKey)) {
    throw new Error(`Unknown config key: "${topKey}". Valid top-level keys: ${[...VALID_TOP_LEVEL_KEYS].join(", ")}`);
  }

  const config = loadConfig();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let target: any = config;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]!;
    if (typeof target[part] !== "object" || target[part] === null) {
      target[part] = {};
    }
    target = target[part];
  }
  const lastKey = parts[parts.length - 1]!;
  target[lastKey] = value;

  // Round-trip validation: mergeConfig silently falls back to defaults for
  // invalid values, so compare the reloaded value against what was set.
  // Use JSON serialization for deep equality (handles objects and arrays).
  const reloaded = mergeConfig(JSON.parse(JSON.stringify(config)) as Record<string, unknown>);
  const actual = getNestedValue(reloaded, parts);
  if (JSON.stringify(actual) !== JSON.stringify(value)) {
    throw new Error(`Invalid value for "${key}": expected "${String(value)}" but config validation resolved to "${String(actual)}"`);
  }

  writeConfig(config);
}

function getNestedValue(obj: unknown, parts: string[]): unknown {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let cur: any = obj;
  for (const part of parts) {
    if (typeof cur !== "object" || cur === null) return undefined;
    cur = cur[part];
  }
  return cur;
}

/**
 * Get a config value by dotted key path.
 */
export function getConfigValue(key: string): unknown {
  const config = loadConfig();
  const parts = key.split(".");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let target: any = config;
  for (const part of parts) {
    if (typeof target !== "object" || target === null) return undefined;
    target = target[part];
  }
  return target;
}

/**
 * Reset config to defaults.
 */
export function resetConfig(): void {
  writeConfig(structuredClone(DEFAULT_CONFIG) as HooksConfig);
}

/**
 * Write config atomically (write-to-temp-then-rename).
 */
function writeConfig(config: HooksConfig): void {
  const configPath = getConfigPath();
  const dir = path.dirname(configPath);
  fs.mkdirSync(dir, { recursive: true });

  const tmpPath = configPath + ".tmp";
  fs.writeFileSync(tmpPath, JSON.stringify(config, null, 2) + "\n", "utf-8");

  // Backup existing config if it exists
  try {
    fs.accessSync(configPath);
    fs.copyFileSync(configPath, configPath + ".bak");
  } catch {
    // No existing config to back up
  }

  fs.renameSync(tmpPath, configPath);
}
