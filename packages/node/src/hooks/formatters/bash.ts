import type { Formatter, PostToolUseInput } from "./types.js";
import { findRecognizer } from "./bash-recognizers/index.js";

export const bashFormatter: Formatter = {
  id: "bash",
  toolNames: ["Bash"],
  format(input: PostToolUseInput) {
    const command = String(input.tool_input["command"] || "");
    const exitCode = input.tool_response["exitCode"] ?? input.tool_response["exit_code"] ?? "?";
    const stdout = String(input.tool_response["stdout"] || input.tool_response["output"] || "");

    const recognizer = findRecognizer(command);
    return recognizer.summarize(command, exitCode as string | number, stdout);
  },
};
