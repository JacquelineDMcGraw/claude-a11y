/**
 * Base hook input from Claude Code's PostToolUse hook.
 */
export interface HookInputBase {
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_response: Record<string, unknown>;
}

/**
 * Full PostToolUse input as received from Claude Code via stdin.
 * Extends the base with optional session metadata.
 */
export interface PostToolUseInput extends HookInputBase {
  session_id?: string;
}

/**
 * Output from a formatter: separated context (for Claude) and TTS (for speech).
 */
export interface FormattedOutput {
  /** Full details for Claude's additionalContext (file paths, line numbers, etc.) */
  contextText: string;
  /** Brief summary for text-to-speech */
  ttsText: string;
}

/**
 * A formatter handles one or more tool types.
 */
export interface Formatter {
  /** Unique identifier for this formatter */
  id: string;
  /** Tool names this formatter handles (e.g., ["Bash"], ["Edit"]) */
  toolNames: string[];
  /** Produce formatted output from hook input */
  format(input: PostToolUseInput): FormattedOutput;
}

/**
 * Decision to auto-allow or auto-deny a permission request.
 */
export interface PermissionDecision {
  behavior: "allow" | "deny";
  message?: string;
}

/**
 * JSON output returned to Claude Code via stdout.
 * Uses the full hookSpecificOutput wrapper spec.
 */
export interface HookJsonOutput {
  hookSpecificOutput?: {
    hookEventName: string;
    additionalContext?: string;
    decision?: PermissionDecision;
  };
}
