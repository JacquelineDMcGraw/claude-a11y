import { removeHooks } from "../../settings/index.js";
import { cleanStaleSessions } from "../../core/sequencer.js";

/**
 * Uninstall command: remove a11y hooks from Claude Code settings.
 */
export function uninstallCommand(): void {
  try {
    const result = removeHooks();
    console.log(result);
    cleanStaleSessions();
  } catch (err) {
    console.error(
      "Failed to remove hooks:",
      err instanceof Error ? err.message : String(err),
    );
    process.exitCode = 1;
  }
}
