import type { HookJsonOutput, PostToolUseInput, FormattedOutput, PermissionDecision } from "../formatters/types.js";
import type { HooksConfig } from "../config/types.js";
import type {
  HookEvent,
  PostToolUseEvent,
  NotificationEvent,
  PermissionRequestEvent,
  StopEvent,
  SubagentStartEvent,
  SubagentStopEvent,
  PostToolUseFailureEvent,
  TaskCompletedEvent,
  PreToolUseEvent,
} from "./types.js";
import { formatToolUse } from "../formatters/index.js";
import { setSummarizeOptions } from "../formatters/summarize-options.js";
import { buildHookOutput } from "../output/index.js";
import { recordAndSequence } from "./sequencer.js";
import { classifySignificance } from "./significance.js";
import type { SignificanceLevel } from "./significance.js";
import { applySignificance } from "./apply-significance.js";
import { appendToDigest, flushDigest, summarizeDigest, saveLastDigest } from "./digest.js";
import { recordToolStart, getToolElapsed, formatElapsed } from "./progress.js";

export interface FormatResult {
  hookOutput: HookJsonOutput;
  ttsText: string | null;
  earcon: string | null;
}

/**
 * Select an earcon ID for a PostToolUse event based on tool name and significance.
 * Pure function — no I/O.
 */
function selectPostToolUseEarcon(
  toolName: string,
  significance: { level: SignificanceLevel; reason: string } | undefined,
): string | null {
  if (!significance) return null;

  // Noise-level events are silent
  if (significance.level === "noise") return null;

  // Test results
  if (significance.reason === "tests passed") return "test-pass";
  if (significance.reason === "test failure") return "test-fail";

  // Edit/Write notable events
  if ((toolName === "Edit" || toolName === "Write") && significance.level === "notable") {
    return "edit-complete";
  }

  // Command failures
  if (significance.reason === "command failed") return "error";

  return null;
}

/**
 * Main entry point: parse raw hook input, detect event type, route to handler.
 * Pure function — no I/O.
 */
export function processHookEvent(rawInput: string, config: HooksConfig): FormatResult {
  const event = parseHookEvent(rawInput);

  switch (event.hook_event_name) {
    case "Notification":
      return handleNotification(event as NotificationEvent, config);
    case "PermissionRequest":
      return handlePermissionRequest(event as PermissionRequestEvent, config);
    case "Stop":
      return handleStop(event as StopEvent, config);
    case "SubagentStart":
      return handleSubagentStart(event as SubagentStartEvent, config);
    case "SubagentStop":
      return handleSubagentStop(event as SubagentStopEvent, config);
    case "PostToolUseFailure":
      return handlePostToolUseFailure(event as PostToolUseFailureEvent, config);
    case "TaskCompleted":
      return handleTaskCompleted(event as TaskCompletedEvent, config);
    case "PreToolUse":
      return handlePreToolUse(event as PreToolUseEvent, config);
    case "PostToolUse":
    default:
      return handlePostToolUse(event as PostToolUseEvent, config);
  }
}

/**
 * Backward-compatible wrapper — treats input as PostToolUse.
 */
export function processToolUse(rawInput: string, config: HooksConfig): FormatResult {
  return processHookEvent(rawInput, config);
}

/**
 * Handle PostToolUse events: format the tool use, check silencing, build output.
 */
function handlePostToolUse(event: PostToolUseEvent, config: HooksConfig): FormatResult {
  const input: PostToolUseInput = {
    tool_name: event.tool_name,
    tool_input: event.tool_input,
    tool_response: event.tool_response,
    session_id: event.session_id,
  };

  // Per-tool silencing: return empty output if tool is silenced
  if (isSilenced(event.tool_name, config)) {
    return {
      hookOutput: buildHookOutput({
        formatted: { contextText: "", ttsText: "" },
        verbosity: config.verbosity,
        eventName: "PostToolUse",
      }),
      ttsText: null,
      earcon: null,
    };
  }

  // Set summarize options before formatting so formatters can access them
  setSummarizeOptions({
    enabled: config.summarize?.enabled ?? false,
    maxDeclarations: config.summarize?.maxDeclarations ?? 20,
    maxTtsNames: config.summarize?.maxTtsNames ?? 3,
  });

  let formatted = formatToolUse(input);

  // Apply significance classification
  let significanceLevel: SignificanceLevel | undefined;
  let effectiveSig: { level: SignificanceLevel; reason: string } | undefined;
  if (config.significance?.enabled !== false) {
    const sig = classifySignificance(event.tool_name, event.tool_input, event.tool_response);
    // Check for user overrides
    const overrideLevel = config.significance?.overrides?.[event.tool_name];
    effectiveSig = overrideLevel ? { ...sig, level: overrideLevel } : sig;
    significanceLevel = effectiveSig.level;
    formatted = applySignificance(formatted, effectiveSig);
  }

  // Parallel result sequencing: prepend "Result N of M" when multiple results arrive in a batch
  if (event.session_id && event.tool_use_id) {
    try {
      const seq = recordAndSequence(event.session_id, event.tool_use_id, event.tool_name);
      if (seq.batchSize > 1) {
        formatted.contextText = `[Result ${seq.index} of ${seq.batchSize}] ${formatted.contextText}`;
        if (formatted.ttsText) {
          formatted.ttsText = `Result ${seq.index} of ${seq.batchSize}. ${formatted.ttsText}`;
        }
      }
    } catch {
      // Sequencer failure is non-fatal — continue without sequence info
    }
  }

  // Digest mode: accumulate entries, suppress individual TTS
  if (config.digest?.enabled && event.session_id) {
    try {
      appendToDigest(event.session_id, {
        toolName: event.tool_name,
        ttsText: formatted.ttsText,
        contextText: formatted.contextText,
        significance: significanceLevel || "routine",
        timestamp: Date.now(),
      });
    } catch {
      // Digest accumulation is non-fatal
    }
    // In digest mode: still send contextText to Claude, but suppress individual TTS
    const hookOutput = buildHookOutput({
      formatted: { contextText: formatted.contextText, ttsText: "" },
      verbosity: config.verbosity,
      eventName: "PostToolUse",
      significanceLevel,
    });
    return { hookOutput, ttsText: null, earcon: null };
  }

  // Append progress elapsed time if available
  if (config.progress?.enabled && event.session_id && event.tool_use_id) {
    try {
      const elapsed = getToolElapsed(event.session_id, event.tool_use_id);
      if (elapsed !== null && elapsed >= config.progress.thresholdMs) {
        const elapsedStr = formatElapsed(elapsed);
        formatted.contextText += ` (elapsed: ${elapsedStr})`;
        if (formatted.ttsText) {
          formatted.ttsText += `, took ${elapsedStr}`;
        }
      }
    } catch {
      // Progress lookup is non-fatal
    }
  }

  const hookOutput = buildHookOutput({
    formatted,
    verbosity: config.verbosity,
    eventName: "PostToolUse",
    significanceLevel,
  });
  const ttsText = formatted.ttsText || null;
  const earcon = selectPostToolUseEarcon(event.tool_name, effectiveSig);

  return { hookOutput, ttsText, earcon };
}

/**
 * Handle Notification events. Delegates to notification handler if available.
 */
function handleNotification(event: NotificationEvent, config: HooksConfig): FormatResult {
  // Lazy import to avoid circular deps — handler may not exist yet during Phase 2 build-up
  let formatted: FormattedOutput;
  try {
    // Use dynamic require pattern that works with the handler
    formatted = formatNotificationEvent(event);
  } catch {
    formatted = {
      contextText: `Notification: ${event.title ? event.title + ": " : ""}${event.message}`,
      ttsText: `Notification. ${event.message}`,
    };
  }

  const hookOutput = buildHookOutput({
    formatted,
    verbosity: config.verbosity,
    eventName: "Notification",
  });

  return { hookOutput, ttsText: formatted.ttsText || null, earcon: "notification" };
}

/**
 * Handle PermissionRequest events. Checks auto-rules, formats announcement.
 */
function handlePermissionRequest(
  event: PermissionRequestEvent,
  config: HooksConfig,
): FormatResult {
  let formatted: FormattedOutput;
  let decision: PermissionDecision | undefined;

  try {
    const result = formatPermissionRequestEvent(event, config);
    formatted = result.formatted;
    decision = result.decision;
  } catch {
    formatted = {
      contextText: `Permission requested for ${event.tool_name}. Y to allow, N to deny.`,
      ttsText: `Permission requested for ${event.tool_name}. Y to allow, N to deny.`,
    };
  }

  const hookOutput = buildHookOutput({
    formatted,
    verbosity: config.verbosity,
    eventName: "PermissionRequest",
    decision,
  });

  return { hookOutput, ttsText: formatted.ttsText || null, earcon: "permission" };
}

/**
 * Handle Stop events — Claude has finished responding.
 * If digest mode is enabled, flush and summarize accumulated entries.
 */
function handleStop(event: StopEvent, config: HooksConfig): FormatResult {
  // Digest mode: flush, summarize, and save for replay
  if (config.digest?.enabled && event.session_id) {
    try {
      const entries = flushDigest(event.session_id);
      if (entries.length > 0) {
        const summary = summarizeDigest(entries);
        saveLastDigest(event.session_id, summary.ttsText);

        const hookOutput = buildHookOutput({
          formatted: summary,
          verbosity: config.verbosity,
          eventName: "Stop",
        });
        return { hookOutput, ttsText: summary.ttsText, earcon: "done" };
      }
    } catch {
      // Digest failure is non-fatal — fall through to default
    }
  }

  const formatted: FormattedOutput = {
    contextText: "Claude finished responding.",
    ttsText: "Done.",
  };

  const hookOutput = buildHookOutput({
    formatted,
    verbosity: config.verbosity,
    eventName: "Stop",
  });

  return { hookOutput, ttsText: formatted.ttsText, earcon: "done" };
}

/**
 * Handle SubagentStart events — a subagent has started.
 */
function handleSubagentStart(event: SubagentStartEvent, config: HooksConfig): FormatResult {
  const agentType = event.subagent_type || "unknown";
  const desc = event.description ? `: ${event.description}` : "";

  const formatted: FormattedOutput = {
    contextText: `Starting ${agentType} agent${desc}.`,
    ttsText: `Starting ${agentType} agent.`,
  };

  const hookOutput = buildHookOutput({
    formatted,
    verbosity: config.verbosity,
    eventName: "SubagentStart",
  });

  return { hookOutput, ttsText: formatted.ttsText, earcon: "agent-start" };
}

/**
 * Handle SubagentStop events — a subagent has finished.
 */
function handleSubagentStop(event: SubagentStopEvent, config: HooksConfig): FormatResult {
  const agentType = event.subagent_type || "unknown";

  const formatted: FormattedOutput = {
    contextText: `${agentType} agent done.`,
    ttsText: `${agentType} agent done.`,
  };

  const hookOutput = buildHookOutput({
    formatted,
    verbosity: config.verbosity,
    eventName: "SubagentStop",
  });

  return { hookOutput, ttsText: formatted.ttsText, earcon: "agent-stop" };
}

/**
 * Handle PostToolUseFailure events — always important.
 */
function handlePostToolUseFailure(event: PostToolUseFailureEvent, config: HooksConfig): FormatResult {
  const toolName = event.tool_name || "Unknown";
  const errorMsg = event.error ? `: ${event.error.slice(0, 200)}` : "";

  const formatted: FormattedOutput = {
    contextText: `Tool failure: ${toolName} failed${errorMsg}.`,
    ttsText: `Important: ${toolName} failed.`,
  };

  const hookOutput = buildHookOutput({
    formatted,
    verbosity: config.verbosity,
    eventName: "PostToolUseFailure",
    significanceLevel: "important",
  });

  return { hookOutput, ttsText: formatted.ttsText, earcon: "error" };
}

/**
 * Handle TaskCompleted events.
 */
function handleTaskCompleted(event: TaskCompletedEvent, config: HooksConfig): FormatResult {
  const subject = event.task_subject || `Task ${event.task_id || "unknown"}`;

  const formatted: FormattedOutput = {
    contextText: `Task done: ${subject}.`,
    ttsText: `Task done: ${subject}.`,
  };

  const hookOutput = buildHookOutput({
    formatted,
    verbosity: config.verbosity,
    eventName: "TaskCompleted",
  });

  return { hookOutput, ttsText: formatted.ttsText, earcon: "task-complete" };
}

/**
 * Handle PreToolUse events — record start time for progress tracking.
 * Returns empty output (no context for Claude, no TTS, no earcon).
 */
function handlePreToolUse(event: PreToolUseEvent, config: HooksConfig): FormatResult {
  // Record start time for progress timing
  if (config.progress?.enabled && event.session_id && event.tool_use_id) {
    try {
      recordToolStart(event.session_id, event.tool_use_id, event.tool_name);
    } catch {
      // Progress recording is non-fatal
    }
  }

  const hookOutput = buildHookOutput({
    formatted: { contextText: "", ttsText: "" },
    verbosity: config.verbosity,
    eventName: "PreToolUse",
  });

  return { hookOutput, ttsText: null, earcon: null };
}

/**
 * Check if a tool is silenced by config. Only applies to PostToolUse.
 */
function isSilenced(toolName: string, config: HooksConfig): boolean {
  const silence = config.silence;
  if (!silence || !silence.enabled) return false;
  return silence.tools[toolName] === true;
}

// --- Notification handler (inline, will be replaced by handler module) ---

function formatNotificationEvent(event: NotificationEvent): FormattedOutput {
  const labelMap: Record<string, string> = {
    permission_prompt: "Permission required",
    idle_prompt: "Session idle",
    error: "Error",
    warning: "Warning",
    info: "Info",
  };

  const label = (event.notification_type && labelMap[event.notification_type]) || "Notification";
  const titlePart = event.title ? `${event.title}: ` : "";

  return {
    contextText: `Notification (${label}): ${titlePart}${event.message}`,
    ttsText: `${label}. ${event.message}`,
  };
}

// --- PermissionRequest handler (inline, will be replaced by handler module) ---

interface PermissionRequestResult {
  formatted: FormattedOutput;
  decision?: PermissionDecision;
}

function formatPermissionRequestEvent(
  event: PermissionRequestEvent,
  config: HooksConfig,
): PermissionRequestResult {
  const toolDetails = describePermissionTool(event);
  const decision = evaluatePermissionRules(event, config);

  if (decision) {
    const actionText = decision.behavior === "allow" ? "Auto-approved" : "Auto-denied";
    const msgPart = decision.message ? ` (${decision.message})` : "";
    return {
      formatted: {
        contextText: `Permission for ${event.tool_name}: ${toolDetails}. ${actionText}${msgPart}.`,
        ttsText: `${actionText} ${event.tool_name}${msgPart}.`,
      },
      decision,
    };
  }

  return {
    formatted: {
      contextText: `Permission requested for ${event.tool_name}: ${toolDetails}. Y to allow, N to deny.`,
      ttsText: `Permission requested for ${event.tool_name}. Y to allow, N to deny.`,
    },
  };
}

function describePermissionTool(event: PermissionRequestEvent): string {
  const input = event.tool_input;
  switch (event.tool_name) {
    case "Edit": {
      const filePath = String(input["file_path"] || "unknown file");
      const oldStr = String(input["old_string"] || "");
      const newStr = String(input["new_string"] || "");
      const oldLines = oldStr.split("\n").length;
      const newLines = newStr.split("\n").length;
      return `edit ${filePath} (${oldLines} → ${newLines} lines)`;
    }
    case "Bash": {
      const cmd = String(input["command"] || "");
      return `run "${cmd.length > 80 ? cmd.slice(0, 80) + "..." : cmd}"`;
    }
    case "Write": {
      const filePath = String(input["file_path"] || "unknown file");
      return `write ${filePath}`;
    }
    case "Read": {
      const filePath = String(input["file_path"] || "unknown file");
      return `read ${filePath}`;
    }
    default:
      return JSON.stringify(input).slice(0, 120);
  }
}

function evaluatePermissionRules(
  event: PermissionRequestEvent,
  config: HooksConfig,
): PermissionDecision | null {
  const rules = config.permissions?.rules;
  if (!rules || rules.length === 0) return null;

  for (const rule of rules) {
    if (rule.tool !== event.tool_name) continue;

    // No pattern means match all uses of this tool
    if (!rule.pattern) {
      return { behavior: rule.action };
    }

    // Pattern matching: check against the relevant field
    const matchField = getMatchField(event);
    if (matchField && matchField.includes(rule.pattern)) {
      return { behavior: rule.action };
    }
  }

  return null;
}

function getMatchField(event: PermissionRequestEvent): string | null {
  const input = event.tool_input;
  switch (event.tool_name) {
    case "Bash":
      return String(input["command"] || "");
    case "Edit":
    case "Write":
    case "Read":
      return String(input["file_path"] || "");
    default:
      return JSON.stringify(input);
  }
}

/**
 * Parse raw stdin JSON into a discriminated HookEvent union.
 * Inputs without hook_event_name default to PostToolUse for backward compat.
 */
export function parseHookEvent(raw: string): HookEvent {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return fallbackPostToolUse();
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return fallbackPostToolUse();
  }

  const obj = parsed as Record<string, unknown>;
  const eventName = typeof obj["hook_event_name"] === "string"
    ? obj["hook_event_name"]
    : "PostToolUse";

  const base = {
    hook_event_name: eventName,
    session_id: typeof obj["session_id"] === "string" ? obj["session_id"] : undefined,
    cwd: typeof obj["cwd"] === "string" ? obj["cwd"] : undefined,
    transcript_path: typeof obj["transcript_path"] === "string" ? obj["transcript_path"] : undefined,
  };

  switch (eventName) {
    case "PostToolUse":
      return {
        ...base,
        hook_event_name: "PostToolUse" as const,
        tool_name: typeof obj["tool_name"] === "string" ? obj["tool_name"] : "Unknown",
        tool_input:
          typeof obj["tool_input"] === "object" && obj["tool_input"] !== null
            ? (obj["tool_input"] as Record<string, unknown>)
            : {},
        tool_response:
          typeof obj["tool_response"] === "object" && obj["tool_response"] !== null
            ? (obj["tool_response"] as Record<string, unknown>)
            : {},
        tool_use_id: typeof obj["tool_use_id"] === "string" ? obj["tool_use_id"] : undefined,
      };

    case "Notification":
      return {
        ...base,
        hook_event_name: "Notification" as const,
        message: typeof obj["message"] === "string" ? obj["message"] : "",
        title: typeof obj["title"] === "string" ? obj["title"] : undefined,
        notification_type: typeof obj["notification_type"] === "string"
          ? obj["notification_type"]
          : undefined,
      };

    case "PermissionRequest":
      return {
        ...base,
        hook_event_name: "PermissionRequest" as const,
        tool_name: typeof obj["tool_name"] === "string" ? obj["tool_name"] : "Unknown",
        tool_input:
          typeof obj["tool_input"] === "object" && obj["tool_input"] !== null
            ? (obj["tool_input"] as Record<string, unknown>)
            : {},
      };

    case "Stop":
      return {
        ...base,
        hook_event_name: "Stop" as const,
        stop_reason: typeof obj["stop_reason"] === "string" ? obj["stop_reason"] : undefined,
        last_assistant_message: typeof obj["last_assistant_message"] === "string"
          ? obj["last_assistant_message"]
          : undefined,
      };

    case "SubagentStart":
      return {
        ...base,
        hook_event_name: "SubagentStart" as const,
        subagent_type: typeof obj["subagent_type"] === "string" ? obj["subagent_type"] : undefined,
        description: typeof obj["description"] === "string" ? obj["description"] : undefined,
      };

    case "SubagentStop":
      return {
        ...base,
        hook_event_name: "SubagentStop" as const,
        subagent_type: typeof obj["subagent_type"] === "string" ? obj["subagent_type"] : undefined,
        last_assistant_message: typeof obj["last_assistant_message"] === "string"
          ? obj["last_assistant_message"]
          : undefined,
      };

    case "PostToolUseFailure":
      return {
        ...base,
        hook_event_name: "PostToolUseFailure" as const,
        tool_name: typeof obj["tool_name"] === "string" ? obj["tool_name"] : "Unknown",
        tool_input:
          typeof obj["tool_input"] === "object" && obj["tool_input"] !== null
            ? (obj["tool_input"] as Record<string, unknown>)
            : {},
        error: typeof obj["error"] === "string" ? obj["error"] : "",
      };

    case "TaskCompleted":
      return {
        ...base,
        hook_event_name: "TaskCompleted" as const,
        task_id: typeof obj["task_id"] === "string" ? obj["task_id"] : undefined,
        task_subject: typeof obj["task_subject"] === "string" ? obj["task_subject"] : undefined,
      };

    case "PreToolUse":
      return {
        ...base,
        hook_event_name: "PreToolUse" as const,
        tool_name: typeof obj["tool_name"] === "string" ? obj["tool_name"] : "Unknown",
        tool_input:
          typeof obj["tool_input"] === "object" && obj["tool_input"] !== null
            ? (obj["tool_input"] as Record<string, unknown>)
            : {},
        tool_use_id: typeof obj["tool_use_id"] === "string" ? obj["tool_use_id"] : undefined,
      };

    default:
      return {
        ...base,
        hook_event_name: eventName,
      };
  }
}

function fallbackPostToolUse(): PostToolUseEvent {
  return {
    hook_event_name: "PostToolUse",
    tool_name: "Unknown",
    tool_input: {},
    tool_response: {},
  };
}
