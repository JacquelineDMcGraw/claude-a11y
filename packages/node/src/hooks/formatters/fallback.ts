import type { Formatter, PostToolUseInput } from "./types.js";

export const fallbackFormatter: Formatter = {
  id: "fallback",
  toolNames: [],
  format(input: PostToolUseInput) {
    const toolName = input.tool_name || "Unknown tool";
    return {
      contextText: `Tool "${toolName}" completed.`,
      ttsText: `${toolName} completed.`,
    };
  },
};
