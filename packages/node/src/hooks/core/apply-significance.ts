/**
 * Applies significance classification to formatted output.
 * Adjusts ttsText and contextText based on significance level.
 */

import type { FormattedOutput } from "../formatters/types.js";
import type { SignificanceResult } from "./significance.js";

/**
 * Adjust formatted output based on significance level.
 *
 * - noise: ttsText silenced, contextText shortened
 * - routine: ttsText kept as-is
 * - notable: ttsText kept as-is
 * - important: ttsText prefixed with "Important:"
 */
export function applySignificance(
  formatted: FormattedOutput,
  significance: SignificanceResult,
): FormattedOutput {
  switch (significance.level) {
    case "noise":
      return {
        contextText: formatted.contextText
          ? shortenContext(formatted.contextText)
          : "",
        ttsText: "",
      };

    case "routine":
      return { ...formatted };

    case "notable":
      return { ...formatted };

    case "important":
      return {
        ...formatted,
        ttsText: formatted.ttsText
          ? `Important: ${formatted.ttsText}`
          : "",
      };

    default:
      return { ...formatted };
  }
}

/**
 * Shorten context text for noise-level events.
 * Keeps only the first line (usually the summary).
 */
function shortenContext(text: string): string {
  const firstLine = text.split("\n")[0] || "";
  return firstLine.length > 120
    ? firstLine.slice(0, 117) + "..."
    : firstLine;
}
