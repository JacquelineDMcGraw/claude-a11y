import { installHooks, isHooksInstalled } from "../../settings/index.js";
import { cleanStaleSessions } from "../../core/sequencer.js";

/**
 * Setup command: register a11y hooks in Claude Code settings.
 * All output is plain text — no emoji, no spinners, no color-dependent info.
 */
export function setupCommand(): void {
  try {
    const alreadyInstalled = isHooksInstalled();

    const result = installHooks();
    console.log(result);

    if (!alreadyInstalled) {
      console.log("");
      console.log("claude-a11y hooks is now active. Claude Code will pipe tool output");
      console.log("through a11y-hooks for screen-reader-friendly formatting.");
      console.log("");
      console.log("Configure with: claude-a11y-hooks config set <key> <value>");
      console.log("Enable TTS:     claude-a11y-hooks config set tts.enabled true");
      console.log("Uninstall:      claude-a11y-hooks uninstall");
    }
  } catch (err) {
    console.error(
      "Failed to install hooks:",
      err instanceof Error ? err.message : String(err),
    );
    process.exitCode = 1;
  }

  try {
    cleanStaleSessions();
  } catch {
    // Stale session cleanup is opportunistic — never fatal
  }
}
