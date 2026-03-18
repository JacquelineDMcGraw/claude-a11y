// Core pipeline
export { processHookEvent, processToolUse, parseHookEvent } from "./core/pipeline.js";
export type { FormatResult } from "./core/pipeline.js";

// Event types
export type {
  HookEvent,
  HookEventBase,
  PostToolUseEvent,
  NotificationEvent,
  PermissionRequestEvent,
  StopEvent,
  SubagentStartEvent,
  SubagentStopEvent,
  PostToolUseFailureEvent,
  TaskCompletedEvent,
  PreToolUseEvent,
  UnknownEvent,
} from "./core/types.js";

// Significance
export { classifySignificance } from "./core/significance.js";
export { applySignificance } from "./core/apply-significance.js";
export type { SignificanceLevel, SignificanceResult } from "./core/significance.js";

// Digest
export { appendToDigest, flushDigest, summarizeDigest, saveLastDigest, loadLastDigest, loadMostRecentDigest } from "./core/digest.js";
export type { DigestEntry } from "./core/digest.js";

// Task tracking
export { computeTaskDelta, loadTaskSnapshot, saveTaskSnapshot } from "./core/task-tracker.js";
export type { TaskSnapshot, TaskDelta } from "./core/task-tracker.js";

// Earcon
export { playEarcon } from "./earcon/index.js";
export type { EarconId } from "./earcon/sounds.js";

// Progress timing
export { recordToolStart, getToolElapsed, formatElapsed } from "./core/progress.js";

// Event history
export { appendToHistory, loadHistory, loadMostRecentHistory } from "./core/history.js";
export type { HistoryEntry } from "./core/history.js";

// Formatter registry
export {
  registerFormatter,
  getFormatter,
  formatToolUse,
  clearFormatters,
  registerBuiltinFormatters,
} from "./formatters/index.js";

// Structural edit analysis
export { extractStructuralChanges, formatStructuralChanges, extractDeclarations, extractRichDeclarations } from "./formatters/edit-analysis.js";
export type { StructuralChange } from "./formatters/edit-analysis.js";

// Code summarization
export { summarizeCode, formatCodeSummary, formatDeclaration, detectLanguage, LANGUAGE_MAP } from "./core/code-summarizer.js";
export type { Declaration, ImportInfo, CodeSummary } from "./core/code-summarizer.js";
export { setSummarizeOptions, getSummarizeOptions } from "./formatters/summarize-options.js";
export type { SummarizeOptions } from "./formatters/summarize-options.js";

// Types
export type {
  Formatter,
  PostToolUseInput,
  FormattedOutput,
  HookJsonOutput,
  HookInputBase,
  PermissionDecision,
} from "./formatters/types.js";

// Config
export { loadConfig, getConfigValue, setConfigValue, resetConfig } from "./config/index.js";
export type { HooksConfig, Verbosity, TtsConfig, SignificanceConfig, DigestConfig, EarconConfig, ProgressConfig, HistoryConfig, SummarizeConfig } from "./config/types.js";

// Output
export { buildHookOutput } from "./output/index.js";
