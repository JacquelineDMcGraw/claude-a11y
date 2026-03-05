import type { BashRecognizer } from "./types.js";

function truncateCommand(cmd: string, max = 80): string {
  if (cmd.length <= max) return cmd;
  return cmd.slice(0, max) + "...";
}

export const genericRecognizer: BashRecognizer = {
  id: "generic",

  matches(): boolean {
    return true; // Always matches — used as fallback
  },

  summarize(command: string, exitCode: string | number, stdout: string) {
    const lineCount = stdout ? stdout.split("\n").filter(Boolean).length : 0;
    const shortCmd = truncateCommand(command);

    return {
      contextText: `Ran: ${command}\nExit code: ${exitCode}\nOutput: ${lineCount} line${lineCount !== 1 ? "s" : ""}`,
      ttsText:
        exitCode === 0 || exitCode === "0"
          ? `Ran ${shortCmd}, success, ${lineCount} line${lineCount !== 1 ? "s" : ""} of output.`
          : `Ran ${shortCmd}, exit code ${exitCode}.`,
    };
  },
};
