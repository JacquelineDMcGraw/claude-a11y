import type { Formatter, PostToolUseInput } from "./types.js";
import { analyzeEdit, extractStructuralChanges, formatStructuralChanges } from "./edit-analysis.js";
import { getSummarizeOptions } from "./summarize-options.js";
import { summarizeCode, formatCodeSummary } from "../core/code-summarizer.js";

export const editFormatter: Formatter = {
  id: "edit",
  toolNames: ["Edit"],
  format(input: PostToolUseInput) {
    const filePath = String(input.tool_input["file_path"] || "unknown file");
    const oldStr = String(input.tool_input["old_string"] || "");
    const newStr = String(input.tool_input["new_string"] || "");
    const replaceAll = input.tool_input["replace_all"] === true;

    const analysis = analyzeEdit(oldStr, newStr, filePath, replaceAll);
    const summarizeOpts = getSummarizeOptions();

    // Try structural change detection for richer descriptions
    const structural = extractStructuralChanges(oldStr, newStr, filePath);
    const structuralFormatted = formatStructuralChanges(structural);

    if (structuralFormatted) {
      return {
        contextText: `Edited ${filePath}: ${structuralFormatted.summary}`,
        ttsText: `Edited ${basename(filePath)}: ${structuralFormatted.ttsSummary}`,
      };
    }

    // For insertions (old_string empty), summarize the new code if enabled
    if (summarizeOpts.enabled && oldStr === "" && newStr) {
      const summary = summarizeCode(newStr, filePath);
      if (summary.declarations.length > 0) {
        const formatted = formatCodeSummary(summary, {
          maxDeclarations: summarizeOpts.maxDeclarations,
          maxTtsNames: summarizeOpts.maxTtsNames,
        });
        const insertInfo = analysis.summary; // "Inserted N lines"
        return {
          contextText: `Edited ${filePath}: ${insertInfo}. ${formatted.contextText.replace("Contains:", "Added:")}`,
          ttsText: `Edited ${basename(filePath)}: ${analysis.ttsSummary} ${formatted.ttsText.replace("Contains", "Added")}`,
        };
      }
    }

    // Fall back to line-count analysis
    const contextText = `Edited ${filePath}: ${analysis.summary}`;
    const ttsText = `Edited ${basename(filePath)}: ${analysis.ttsSummary}`;

    return { contextText, ttsText };
  },
};

function basename(p: string): string {
  const parts = p.split("/");
  return parts[parts.length - 1] || p;
}
