import type { Formatter, PostToolUseInput } from "./types.js";
import { basename } from "./utils.js";

/**
 * Strip regex metacharacters for TTS so the screen reader doesn't
 * spell out "backslash b function backslash s plus".
 * Keeps the literal words/characters that a human would recognize.
 */
function humanizeRegex(pattern: string): string {
  return pattern
    .replace(/\\[bBdDwWsS]/g, " ")
    .replace(/[.*+?^${}()|[\]\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim() || pattern;
}

export const grepFormatter: Formatter = {
  id: "grep",
  toolNames: ["Grep"],
  format(input: PostToolUseInput) {
    const pattern = String(input.tool_input["pattern"] || "");
    const response = input.tool_response;

    let matchCount = 0;
    let fileCount = 0;
    const fileCounts = new Map<string, number>();
    let firstMatch = "";

    if (typeof response["count"] === "number") {
      matchCount = response["count"];
    }
    if (Array.isArray(response["files"])) {
      fileCount = response["files"].length;
      for (const f of response["files"] as string[]) {
        fileCounts.set(f, (fileCounts.get(f) || 0) + 1);
      }
    } else if (typeof response["output"] === "string") {
      const lines = response["output"].split("\n").filter(Boolean);
      matchCount = lines.length;
      for (const l of lines) {
        const file = l.split(":")[0] || "";
        fileCounts.set(file, (fileCounts.get(file) || 0) + 1);
      }
      fileCount = fileCounts.size;
      if (lines[0]) firstMatch = lines[0];
    } else if (typeof response["content"] === "string") {
      const lines = response["content"].split("\n").filter(Boolean);
      matchCount = lines.length;
      for (const l of lines) {
        const file = l.split(":")[0] || "";
        fileCounts.set(file, (fileCounts.get(file) || 0) + 1);
      }
      fileCount = fileCounts.size;
      if (lines[0]) firstMatch = lines[0];
    }

    // Top 3 files by match count
    const topFiles = [...fileCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([file, count]) => `${basename(file)} (${count})`)
      .join(", ");

    const topFilesSuffix = topFiles ? `. Top files: ${topFiles}` : "";
    const firstMatchSuffix = firstMatch ? `. First: ${firstMatch.slice(0, 100)}` : "";

    const contextText = `Grep for "${pattern}": ${matchCount} match${matchCount !== 1 ? "es" : ""} across ${fileCount} file${fileCount !== 1 ? "s" : ""}${topFilesSuffix}${firstMatchSuffix}`;
    const spoken = humanizeRegex(pattern);
    const ttsText =
      matchCount > 0
        ? `Found ${matchCount} match${matchCount !== 1 ? "es" : ""} for ${spoken} in ${fileCount} file${fileCount !== 1 ? "s" : ""}.`
        : `No matches for ${spoken}.`;

    return { contextText, ttsText };
  },
};
