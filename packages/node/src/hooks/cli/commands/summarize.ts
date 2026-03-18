import { loadConfig, setConfigValue } from "../../config/index.js";

/**
 * Toggle code summarization on/off or show status.
 */
export function summarizeCommand(action: string): void {
  if (action === "on") {
    setConfigValue("summarize.enabled", true);
    console.log("Code summarization enabled.");
  } else if (action === "off") {
    setConfigValue("summarize.enabled", false);
    console.log("Code summarization disabled.");
  } else if (!action || action === "status") {
    const config = loadConfig();
    console.log(`Code summarization is ${config.summarize.enabled ? "on" : "off"}.`);
  } else {
    console.error(`Unknown summarize action: ${action}. Use "on", "off", or "status".`);
    process.exitCode = 1;
  }
}
