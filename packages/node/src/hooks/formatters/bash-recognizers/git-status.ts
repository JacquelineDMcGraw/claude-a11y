import type { BashRecognizer } from "./types.js";

export const gitStatusRecognizer: BashRecognizer = {
  id: "git-status",

  matches(command: string): boolean {
    return /^git\s+status/.test(command.trim());
  },

  summarize(command: string, exitCode: string | number, stdout: string) {
    const lines = stdout.split("\n").filter(Boolean);
    let modified = 0;
    let staged = 0;
    let untracked = 0;

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("M ") || trimmed.startsWith("MM ") || trimmed.startsWith(" M ")) {
        modified++;
      } else if (
        trimmed.startsWith("A ") ||
        trimmed.startsWith("D ") ||
        trimmed.startsWith("R ") ||
        trimmed.startsWith("C ")
      ) {
        staged++;
      } else if (trimmed.startsWith("?? ") || trimmed.startsWith("Untracked")) {
        untracked++;
      }
    }

    // Also check for verbose git status output patterns
    if (modified === 0 && staged === 0 && untracked === 0) {
      const modifiedMatch = stdout.match(/(\d+) files? changed/);
      if (modifiedMatch) modified = parseInt(modifiedMatch[1]!, 10);

      if (stdout.includes("Changes to be committed")) staged = Math.max(staged, 1);
      if (stdout.includes("Untracked files")) untracked = Math.max(untracked, 1);
      if (stdout.includes("Changes not staged")) modified = Math.max(modified, 1);
    }

    const parts: string[] = [];
    if (staged > 0) parts.push(`${staged} staged`);
    if (modified > 0) parts.push(`${modified} modified`);
    if (untracked > 0) parts.push(`${untracked} untracked`);

    const statusSummary = parts.length > 0 ? parts.join(", ") : "clean";

    return {
      contextText: `Ran: ${command}\nGit status: ${statusSummary}`,
      ttsText:
        exitCode === 0 || exitCode === "0"
          ? `Git status: ${statusSummary}.`
          : `Git status failed, exit code ${exitCode}.`,
    };
  },
};
