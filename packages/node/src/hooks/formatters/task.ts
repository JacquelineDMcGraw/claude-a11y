import type { Formatter, PostToolUseInput } from "./types.js";

export const taskFormatter: Formatter = {
  id: "task",
  toolNames: ["Task"],
  format(input: PostToolUseInput) {
    const subagentType = String(input.tool_input["subagent_type"] || "unknown");
    const description = String(input.tool_input["description"] || "");
    const prompt = String(input.tool_input["prompt"] || "");

    // Extract result preview from response
    const response = input.tool_response;
    const resultText = String(response["result"] || response["output"] || response["content"] || "");
    const resultPreview = resultText
      ? resultText.split("\n").filter(Boolean).slice(0, 2).join(" ").slice(0, 120)
      : "";

    const status = response["status"] ? String(response["status"]) : "completed";
    const briefDesc = description || prompt.slice(0, 80);

    const contextParts = [`Task: ${subagentType} agent.`];
    if (briefDesc) contextParts.push(`Description: ${briefDesc}.`);
    contextParts.push(`Status: ${status}.`);
    if (resultPreview) contextParts.push(`Summary: ${resultPreview}`);

    const contextText = contextParts.join(" ");
    const ttsText = `Launched ${subagentType} agent. Status: ${status}.`;

    return { contextText, ttsText };
  },
};
