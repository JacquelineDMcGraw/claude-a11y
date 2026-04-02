import { loadConfig, setConfigValue } from "../../config/index.js";

/**
 * Toggle code summarization on/off or show status.
 */
export function summarizeCommand(action: string): void {
  if (action === "on") {
    try {
      setConfigValue("summarize.enabled", true);
      console.log("Code summarization enabled.");
    } catch (err) {
      console.error("Failed to enable summarization:", err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    }
  } else if (action === "off") {
    try {
      setConfigValue("summarize.enabled", false);
      console.log("Code summarization disabled.");
    } catch (err) {
      console.error("Failed to disable summarization:", err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    }
  } else if (!action || action === "status") {
    const config = loadConfig();
    console.log(`Code summarization is ${config.summarize.enabled ? "on" : "off"}.`);
  } else {
    console.error(`Unknown summarize action: ${action}. Use "on", "off", or "status".`);
    process.exitCode = 1;
  }
}
