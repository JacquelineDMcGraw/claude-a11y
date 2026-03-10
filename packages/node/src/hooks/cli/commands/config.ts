import {
  getConfigValue,
  setConfigValue,
  resetConfig,
  loadConfig,
} from "../../config/index.js";

/**
 * Config get command.
 */
export function configGetCommand(key: string): void {
  const value = getConfigValue(key);
  if (value === undefined) {
    console.log(`Key "${key}" is not set.`);
  } else {
    console.log(typeof value === "object" ? JSON.stringify(value, null, 2) : String(value));
  }
}

/**
 * Config set command.
 */
export function configSetCommand(key: string, rawValue: string): void {
  let value: unknown = rawValue;
  if (rawValue === "true") value = true;
  else if (rawValue === "false") value = false;
  else if (/^-?(?:\d+\.?\d*|\.\d+)$/.test(rawValue)) value = Number(rawValue);

  try {
    setConfigValue(key, value);
    console.log(`Set "${key}" to ${JSON.stringify(value)}.`);
  } catch (err) {
    console.error(
      "Failed to set config:",
      err instanceof Error ? err.message : String(err),
    );
    process.exitCode = 1;
  }
}

/**
 * Config list command: show current config.
 */
export function configListCommand(): void {
  const config = loadConfig();
  console.log(JSON.stringify(config, null, 2));
}

/**
 * Config reset command: restore defaults.
 */
export function configResetCommand(): void {
  resetConfig();
  console.log("Configuration reset to defaults.");
}
