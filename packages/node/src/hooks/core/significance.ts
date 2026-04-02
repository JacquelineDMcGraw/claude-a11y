/**
 * Significance classifier for tool use events.
 * Classifies each tool use as noise/routine/notable/important
 * to support graduated verbosity.
 */

export type SignificanceLevel = "noise" | "routine" | "notable" | "important";

export interface SignificanceResult {
  level: SignificanceLevel;
  reason: string;
}

/** Read-only Bash commands that are noise. */
const NOISE_BASH_PATTERNS = [
  /^\s*ls\b/,
  /^\s*cat\b/,
  /^\s*pwd\s*$/,
  /^\s*echo\b/,
  /^\s*which\b/,
  /^\s*git\s+log\b/,
  /^\s*git\s+status\b/,
  /^\s*git\s+diff\b/,
  /^\s*git\s+show\b/,
  /^\s*git\s+branch\b/,
  /^\s*git\s+remote\b/,
  /^\s*head\b/,
  /^\s*tail\b/,
  /^\s*wc\b/,
  /^\s*file\b/,
  /^\s*stat\b/,
  /^\s*find\b/,
  /^\s*grep\b/,
  /^\s*rg\b/,
];

/** Test runner patterns. */
const TEST_PATTERNS = [
  /\bnpm\s+test\b/,
  /\bnpm\s+run\s+test\b/,
  /\bvitest\b/,
  /\bjest\b/,
  /\bpytest\b/,
  /\bcargo\s+test\b/,
  /\bgo\s+test\b/,
  /\bnpx\s+vitest\b/,
  /\bnpx\s+jest\b/,
];

/** Install patterns. */
const INSTALL_PATTERNS = [
  /\bnpm\s+install\b/,
  /\bnpm\s+i\b/,
  /\bpip\s+install\b/,
  /\byarn\s+add\b/,
  /\bpnpm\s+add\b/,
  /\bbun\s+add\b/,
  /\bcargo\s+add\b/,
];

/**
 * Classify the significance of a tool use event.
 * Rules are evaluated first-match-wins.
 */
export function classifySignificance(
  toolName: string,
  toolInput: Record<string, unknown>,
  toolResponse: Record<string, unknown>,
): SignificanceResult {
  switch (toolName) {
    case "Read":
      return { level: "noise", reason: "file read" };

    case "Glob":
      return { level: "noise", reason: "file search" };

    case "Grep":
      return { level: "noise", reason: "content search" };

    case "Bash":
      return classifyBash(toolInput, toolResponse);

    case "Edit":
      return classifyEdit(toolInput);

    case "Write":
      return { level: "notable", reason: "file write" };

    case "WebFetch":
    case "WebSearch":
      return { level: "routine", reason: "web operation" };

    case "Task":
      return { level: "routine", reason: "subagent task" };

    case "TaskCreate":
    case "TaskUpdate":
      return { level: "routine", reason: "task management" };

    case "TaskList":
    case "TaskGet":
      return { level: "noise", reason: "task read" };

    default:
      return { level: "routine", reason: "unknown tool" };
  }
}

function classifyBash(
  toolInput: Record<string, unknown>,
  toolResponse: Record<string, unknown>,
): SignificanceResult {
  const command = String(toolInput["command"] || "");
  const exitCode = toolResponse["exitCode"] ?? toolResponse["exit_code"];
  const exitNum = typeof exitCode === "number" ? exitCode : parseInt(String(exitCode), 10);
  const failed = !isNaN(exitNum) && exitNum !== 0;

  // Check high-impact patterns first so compound commands like
  // "git diff && npm test" aren't misclassified as noise.
  for (const pattern of TEST_PATTERNS) {
    if (pattern.test(command)) {
      return failed
        ? { level: "important", reason: "test failure" }
        : { level: "routine", reason: "tests passed" };
    }
  }

  for (const pattern of INSTALL_PATTERNS) {
    if (pattern.test(command)) {
      return { level: "notable", reason: "package install" };
    }
  }

  // Noise patterns only if no higher-significance pattern matched.
  // Failed noise commands escalate to notable so the user hears about
  // unexpected errors (e.g. cat on a missing file, ls on a bad path).
  for (const pattern of NOISE_BASH_PATTERNS) {
    if (pattern.test(command)) {
      return failed
        ? { level: "notable", reason: "read-only command failed" }
        : { level: "noise", reason: "read-only command" };
    }
  }

  // General commands
  return failed
    ? { level: "notable", reason: "command failed" }
    : { level: "routine", reason: "command completed" };
}

function classifyEdit(toolInput: Record<string, unknown>): SignificanceResult {
  const oldStr = String(toolInput["old_string"] || "");
  const newStr = String(toolInput["new_string"] || "");

  // Identical
  if (oldStr === newStr) {
    return { level: "noise", reason: "identical edit" };
  }

  // Whitespace-only
  if (oldStr.trim() === newStr.trim()) {
    return { level: "noise", reason: "whitespace-only edit" };
  }

  return { level: "notable", reason: "code edit" };
}
