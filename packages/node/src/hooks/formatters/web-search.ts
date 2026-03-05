import type { Formatter, PostToolUseInput } from "./types.js";

export const webSearchFormatter: Formatter = {
  id: "web-search",
  toolNames: ["WebSearch"],
  format(input: PostToolUseInput) {
    const query = String(input.tool_input["query"] || "");

    const contextText = `Web search for "${query}"`;
    const ttsText = `Searched for ${query}.`;

    return { contextText, ttsText };
  },
};
