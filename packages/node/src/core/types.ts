/**
 * Type definitions for Claude Code stream-json output format.
 */

// --- Content block types ---

export interface TextBlock {
  type: "text";
  text: string;
}

export interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content: Array<TextBlock | unknown>;
  is_error?: boolean;
}

export type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock;

// --- Stream message types ---

export interface SystemInitMessage {
  type: "system";
  subtype: "init";
  session_id: string;
  tools?: unknown[];
  mcp_servers?: unknown[];
}

export interface AssistantMessage {
  type: "assistant";
  message: {
    role: "assistant";
    content: ContentBlock[];
    model?: string;
    stop_reason?: string;
  };
}

export interface UserMessage {
  type: "user";
  message: {
    role: "user";
    content: ContentBlock[];
  };
}

export interface ResultMessage {
  type: "result";
  subtype: "success" | "error_max_turns" | "error_tool" | "error";
  session_id: string;
  total_cost_usd: number;
  total_duration_ms?: number;
  total_duration_api_ms?: number;
  num_turns: number;
  is_error: boolean;
  errors?: string[];
}

export interface StreamEventMessage {
  type: "stream_event";
  event: {
    type?: string;
    delta?: {
      type: "text_delta" | "input_json_delta";
      text?: string;
      partial_json?: string;
    };
    content_block?: ContentBlock;
    index?: number;
  };
}

export type StreamMessage =
  | SystemInitMessage
  | AssistantMessage
  | UserMessage
  | ResultMessage
  | StreamEventMessage;

// --- Parsed event types (output of stream parser) ---

export interface ParsedInitEvent {
  type: "init";
  sessionId: string;
}

export interface ParsedTextEvent {
  type: "text";
  text: string;
}

export interface ParsedTextDeltaEvent {
  type: "text_delta";
  text: string;
}

export interface ParsedToolUseEvent {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ParsedToolResultEvent {
  type: "tool_result";
  toolUseId: string;
  content: string;
  isError: boolean;
}

export interface ParsedResultEvent {
  type: "result";
  sessionId: string;
  cost: number;
  turns: number;
  isError: boolean;
  errors: string[];
  durationMs?: number;
}

export type ParsedEvent =
  | ParsedInitEvent
  | ParsedTextEvent
  | ParsedTextDeltaEvent
  | ParsedToolUseEvent
  | ParsedToolResultEvent
  | ParsedResultEvent;
