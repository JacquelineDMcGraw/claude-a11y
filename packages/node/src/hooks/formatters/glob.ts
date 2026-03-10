import type { Formatter, PostToolUseInput } from "./types.js";
import { basename } from "./utils.js";

export const globFormatter: Formatter = {
  id: "glob",
  toolNames: ["Glob"],
  format(input: PostToolUseInput) {
    const pattern = String(input.tool_input["pattern"] || "");
    const response = input.tool_response;

    let fileCount = 0;
    let fileNames: string[] = [];

    if (Array.isArray(response["files"])) {
      fileCount = response["files"].length;
      fileNames = (response["files"] as string[]).slice(0, 5).map(basename);
    } else if (typeof response["output"] === "string") {
      const lines = response["output"].split("\n").filter(Boolean);
      fileCount = lines.length;
      fileNames = lines.slice(0, 5).map(basename);
    } else if (typeof response["content"] === "string") {
      const lines = response["content"].split("\n").filter(Boolean);
      fileCount = lines.length;
      fileNames = lines.slice(0, 5).map(basename);
    }

    const fileListSuffix = fileNames.length > 0
      ? `: ${fileNames.join(", ")}${fileCount > 5 ? `, ... +${fileCount - 5} more` : ""}`
      : "";

    const contextText = `Glob "${pattern}": found ${fileCount} file${fileCount !== 1 ? "s" : ""}${fileListSuffix}`;
    const ttsText = `Found ${fileCount} file${fileCount !== 1 ? "s" : ""} matching ${pattern}.`;

    return { contextText, ttsText };
  },
};
