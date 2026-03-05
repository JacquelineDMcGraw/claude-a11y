import type { BashRecognizer } from "./types.js";

export const gitDiffRecognizer: BashRecognizer = {
  id: "git-diff",

  matches(command: string): boolean {
    return /^git\s+diff/.test(command.trim());
  },

  summarize(command: string, exitCode: string | number, stdout: string) {
    // Parse diff stats from the last line (e.g., "3 files changed, 10 insertions(+), 5 deletions(-)")
    const statsMatch = stdout.match(
      /(\d+) files? changed(?:,\s*(\d+) insertions?\(\+\))?(?:,\s*(\d+) deletions?\(-\))?/,
    );

    if (statsMatch) {
      const files = parseInt(statsMatch[1]!, 10);
      const insertions = statsMatch[2] ? parseInt(statsMatch[2], 10) : 0;
      const deletions = statsMatch[3] ? parseInt(statsMatch[3], 10) : 0;

      return {
        contextText: `Ran: ${command}\nDiff: ${files} file${files !== 1 ? "s" : ""} changed, +${insertions} -${deletions}`,
        ttsText: `Git diff: ${files} file${files !== 1 ? "s" : ""} changed, ${insertions} added, ${deletions} removed.`,
      };
    }

    // No stats found — count diff output lines
    const lines = stdout.split("\n").filter(Boolean);
    const addedLines = lines.filter((l) => l.startsWith("+") && !l.startsWith("+++")).length;
    const removedLines = lines.filter((l) => l.startsWith("-") && !l.startsWith("---")).length;

    if (addedLines === 0 && removedLines === 0 && lines.length === 0) {
      return {
        contextText: `Ran: ${command}\nNo differences found.`,
        ttsText: "Git diff: no differences.",
      };
    }

    return {
      contextText: `Ran: ${command}\nDiff: +${addedLines} -${removedLines} lines`,
      ttsText:
        exitCode === 0 || exitCode === "0"
          ? `Git diff: ${addedLines} added, ${removedLines} removed.`
          : `Git diff failed, exit code ${exitCode}.`,
    };
  },
};
