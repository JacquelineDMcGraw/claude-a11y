import type { FormattedOutput, HookJsonOutput, PermissionDecision } from "../formatters/types.js";
import type { Verbosity } from "../config/types.js";
import type { SignificanceLevel } from "../core/significance.js";

export interface BuildHookOutputOptions {
  formatted: FormattedOutput;
  verbosity: Verbosity;
  eventName: string;
  decision?: PermissionDecision;
  significanceLevel?: SignificanceLevel;
}

/**
 * Build the HookJsonOutput from formatted output and verbosity setting.
 * Wraps everything in the hookSpecificOutput envelope.
 *
 * - minimal: ttsText only in additionalContext
 * - normal:  ttsText + contextText
 * - full:    ttsText + separator + contextText
 */
export function buildHookOutput(opts: BuildHookOutputOptions): HookJsonOutput;
/**
 * @deprecated Use the options-object overload instead.
 * Kept for backward compatibility during migration.
 */
export function buildHookOutput(
  formatted: FormattedOutput,
  verbosity: Verbosity,
  eventName?: string,
  decision?: PermissionDecision,
): HookJsonOutput;
export function buildHookOutput(
  formattedOrOpts: FormattedOutput | BuildHookOutputOptions,
  verbosity?: Verbosity,
  eventName?: string,
  decision?: PermissionDecision,
): HookJsonOutput {
  let formatted: FormattedOutput;
  let verb: Verbosity;
  let evName: string;
  let dec: PermissionDecision | undefined;

  let sigLevel: SignificanceLevel | undefined;

  if ("formatted" in formattedOrOpts) {
    formatted = formattedOrOpts.formatted;
    verb = formattedOrOpts.verbosity;
    evName = formattedOrOpts.eventName;
    dec = formattedOrOpts.decision;
    sigLevel = formattedOrOpts.significanceLevel;
  } else {
    formatted = formattedOrOpts;
    verb = verbosity!;
    evName = eventName || "PostToolUse";
    dec = decision;
  }

  const additionalContext = buildAdditionalContext(formatted, verb, sigLevel);

  const result: HookJsonOutput = {
    hookSpecificOutput: {
      hookEventName: evName,
    },
  };

  if (additionalContext) {
    result.hookSpecificOutput!.additionalContext = additionalContext;
  }

  if (dec) {
    result.hookSpecificOutput!.decision = dec;
  }

  return result;
}

function buildAdditionalContext(
  formatted: FormattedOutput,
  verbosity: Verbosity,
  significanceLevel?: SignificanceLevel,
): string | undefined {
  // Empty formatted output → no additionalContext
  if (!formatted.ttsText && !formatted.contextText) {
    return undefined;
  }

  switch (verbosity) {
    case "compact":
      // Compact mode: suppress noise/routine entirely, notable/important get ttsText only
      if (significanceLevel === "noise" || significanceLevel === "routine") {
        return undefined;
      }
      return formatted.ttsText || undefined;
    case "minimal":
      return formatted.ttsText || undefined;
    case "full": {
      const parts = [formatted.ttsText, formatted.contextText].filter(Boolean);
      return parts.length > 0 ? parts.join("\n---\n") : undefined;
    }
    case "normal":
    default: {
      const parts = [formatted.ttsText, formatted.contextText].filter(Boolean);
      return parts.length > 0 ? parts.join("\n") : undefined;
    }
  }
}
