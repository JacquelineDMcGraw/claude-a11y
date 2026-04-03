import type { Formatter, PostToolUseInput } from "./types.js";
import { basename } from "./utils.js";

/**
 * Turn a glob pattern like "**\/*.ts" into a screen-reader-friendly
 * description like "TypeScript files". Falls back to the raw pattern
 * if no human label applies.
 */
function humanizeGlob(pattern: string): string {
  const extMatch = pattern.match(/\.\{([^}]+)\}$/) || pattern.match(/\.(\w+)$/);
  if (!extMatch) return `"${pattern}"`;

  const captured = extMatch[1] ?? extMatch[0];
  const rawExts = captured.split(",").map((e) => e.trim().replace(/^\./, ""));
  const labels = rawExts.map(extLabel).filter(Boolean);
  if (labels.length === 0) return `"${pattern}"`;

  if (labels.length === 1) return labels[0] + " files";
  if (labels.length === 2) return labels[0] + " and " + labels[1] + " files";
  return labels.slice(0, -1).join(", ") + ", and " + labels[labels.length - 1] + " files";
}

function extLabel(ext: string): string {
  const map: Record<string, string> = {
    ts: "TypeScript", tsx: "TypeScript React", js: "JavaScript",
    jsx: "JavaScript React", py: "Python", rs: "Rust", go: "Go",
    rb: "Ruby", java: "Java", kt: "Kotlin", swift: "Swift",
    c: "C", cpp: "C++", h: "C header", cs: "C#",
    css: "CSS", scss: "SCSS", less: "Less",
    html: "HTML", vue: "Vue", svelte: "Svelte",
    json: "JSON", yaml: "YAML", yml: "YAML", toml: "TOML",
    md: "Markdown", txt: "text", sql: "SQL", sh: "shell",
  };
  return map[ext.toLowerCase()] || ext.toUpperCase();
}

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
    const spoken = humanizeGlob(pattern);
    const ttsText = `Found ${fileCount} file${fileCount !== 1 ? "s" : ""} matching ${spoken}.`;

    return { contextText, ttsText };
  },
};
