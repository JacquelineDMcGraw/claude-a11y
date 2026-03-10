/**
 * Discriminated union of all hook event types supported by Claude Code.
 */

/** Common fields shared by all hook events. */
export interface HookEventBase {
  hook_event_name: string;
  session_id?: string;
  cwd?: string;
  transcript_path?: string;
}

/** PostToolUse event — sent after a tool completes. */
export interface PostToolUseEvent extends HookEventBase {
  hook_event_name: "PostToolUse";
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_response: Record<string, unknown>;
  tool_use_id?: string;
}

/** Notification event — system notification from Claude Code. */
export interface NotificationEvent extends HookEventBase {
  hook_event_name: "Notification";
  message: string;
  title?: string;
  notification_type?: string;
}

/** PermissionRequest event — tool requesting user approval. */
export interface PermissionRequestEvent extends HookEventBase {
  hook_event_name: "PermissionRequest";
  tool_name: string;
  tool_input: Record<string, unknown>;
}

/** Stop event — Claude has finished responding. */
export interface StopEvent extends HookEventBase {
  hook_event_name: "Stop";
  stop_reason?: string;
  last_assistant_message?: string;
}

/** SubagentStart event — a subagent has started. */
export interface SubagentStartEvent extends HookEventBase {
  hook_event_name: "SubagentStart";
  subagent_type?: string;
  description?: string;
}

/** SubagentStop event — a subagent has finished. */
export interface SubagentStopEvent extends HookEventBase {
  hook_event_name: "SubagentStop";
  subagent_type?: string;
  last_assistant_message?: string;
}

/** PostToolUseFailure event — a tool use failed. */
export interface PostToolUseFailureEvent extends HookEventBase {
  hook_event_name: "PostToolUseFailure";
  tool_name: string;
  tool_input: Record<string, unknown>;
  error: string;
}

/** TaskCompleted event — a task has been marked completed. */
export interface TaskCompletedEvent extends HookEventBase {
  hook_event_name: "TaskCompleted";
  task_id?: string;
  task_subject?: string;
}

/** PreToolUse event — sent before a tool executes. */
export interface PreToolUseEvent extends HookEventBase {
  hook_event_name: "PreToolUse";
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_use_id?: string;
}

/** Catch-all for unrecognized event types. */
export interface UnknownEvent extends HookEventBase {
  hook_event_name: string;
}

/** Discriminated union of all supported hook events. */
export type HookEvent =
  | PostToolUseEvent
  | NotificationEvent
  | PermissionRequestEvent
  | StopEvent
  | SubagentStartEvent
  | SubagentStopEvent
  | PostToolUseFailureEvent
  | TaskCompletedEvent
  | PreToolUseEvent
  | UnknownEvent;
