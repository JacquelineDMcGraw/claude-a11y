/**
 * @claude-a11y/core
 *
 * Shared speech formatting, sanitization, and accessibility transforms.
 * Used by both the CLI tool and the VS Code extension.
 */

// Speech formatting (remark AST → speech-friendly text)
export { initFormatter, formatForSpeech } from "./speech-formatter.js";

// ANSI sanitization
export { sanitize, createChunkSanitizer } from "./sanitizer.js";
export type { ChunkSanitizer } from "./sanitizer.js";

// Tool activity announcements
export {
  announceToolUse,
  announceResult,
  announceError,
  writeAnnouncement,
} from "./announcer.js";

// Stream parsing (Claude NDJSON)
export { createStreamParser, parseStreamLine } from "./stream-parser.js";
export type { StreamParser } from "./stream-parser.js";

// Verbosity levels
export { createVerbosityFilter } from "./verbosity.js";
export type { VerbosityLevel } from "./verbosity.js";

// Types
export type {
  TextBlock,
  ToolUseBlock,
  ToolResultBlock,
  ContentBlock,
  SystemInitMessage,
  AssistantMessage,
  ResultMessage,
  StreamEventMessage,
  StreamMessage,
  ParsedInitEvent,
  ParsedTextEvent,
  ParsedTextDeltaEvent,
  ParsedToolUseEvent,
  ParsedToolResultEvent,
  ParsedResultEvent,
  ParsedEvent,
} from "./types.js";
