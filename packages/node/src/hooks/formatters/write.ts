import type { Formatter, PostToolUseInput } from "./types.js";
import { getSummarizeOptions } from "./summarize-options.js";
import { summarizeCode, formatCodeSummary } from "../core/code-summarizer.js";
import { basename } from "./utils.js";

const FILE_TYPE_MAP: Record<string, string> = {
  ".ts": "TypeScript",
  ".tsx": "TypeScript/React",
  ".js": "JavaScript",
  ".jsx": "JavaScript/React",
  ".py": "Python",
  ".rs": "Rust",
  ".go": "Go",
  ".java": "Java",
  ".json": "JSON",
  ".yaml": "YAML",
  ".yml": "YAML",
  ".toml": "TOML",
  ".md": "Markdown",
  ".css": "CSS",
  ".scss": "SCSS",
  ".html": "HTML",
  ".sql": "SQL",
  ".sh": "Shell",
  ".bash": "Shell",
  ".zsh": "Shell",
};

export const writeFormatter: Formatter = {
  id: "write",
  toolNames: ["Write"],
  format(input: PostToolUseInput) {
    const filePath = String(input.tool_input["file_path"] || "unknown file");
    const content = String(input.tool_input["content"] || "");
    const lineCount = content ? content.split("\n").length : 0;

    const ext = getExtension(filePath);
    const fileType = FILE_TYPE_MAP[ext];
    const typeSuffix = fileType ? ` [${fileType}]` : "";

    const lineInfo = `(${lineCount} line${lineCount !== 1 ? "s" : ""})`;
    const baseTts = `Wrote ${basename(filePath)}, ${lineCount} line${lineCount !== 1 ? "s" : ""}.`;

    // Try code summarization if enabled
    const summarizeOpts = getSummarizeOptions();
    if (summarizeOpts.enabled && content) {
      const summary = summarizeCode(content, filePath);
      if (summary.declarations.length > 0) {
        const formatted = formatCodeSummary(summary, {
          maxDeclarations: summarizeOpts.maxDeclarations,
          maxTtsNames: summarizeOpts.maxTtsNames,
        });
        return {
          contextText: `Wrote ${filePath} ${lineInfo}${typeSuffix}. ${formatted.contextText.replace("Contains:", "Defines:")}`,
          ttsText: `${baseTts} ${formatted.ttsText.replace("Contains", "Defines")}`,
        };
      }
    }

    return {
      contextText: `Wrote ${filePath} ${lineInfo}${typeSuffix}`,
      ttsText: baseTts,
    };
  },
};
function getExtension(filePath: string): string {
  const dotIdx = filePath.lastIndexOf(".");
  if (dotIdx === -1) return "";
  return filePath.slice(dotIdx).toLowerCase();
}
