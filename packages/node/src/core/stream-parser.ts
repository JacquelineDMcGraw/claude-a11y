/**
 * NDJSON stream parser for Claude Code's stream-json output format.
 *
 * Parses one JSON object per line from claude -p --output-format stream-json --verbose,
 * and emits typed ParsedEvent objects.
 */

import type {
  ParsedEvent,
  ParsedInitEvent,
  ParsedTextEvent,
  ParsedTextDeltaEvent,
  ParsedToolUseEvent,
  ParsedToolResultEvent,
  ParsedResultEvent,
  ContentBlock,
  TextBlock,
} from "./types.js";


/**
 * Parse a single line of stream-json output into zero or more ParsedEvents.
 * Returns an array because a single assistant message may contain multiple
 * content blocks (text + tool_use + text).
 */
export function parseStreamLine(line: string): ParsedEvent[] {
  const trimmed = line.trim();
  if (!trimmed) return [];

  let msg: Record<string, unknown>;
  try {
    msg = JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    // Malformed JSON — emit warning but don't crash
    process.stderr.write(`[Warning] Skipping malformed JSON line: ${trimmed.slice(0, 80)}\n`);
    return [];
  }

  const events: ParsedEvent[] = [];
  const type = msg.type as string | undefined;

  switch (type) {
    case "system": {
      if (msg.subtype === "init" && typeof msg.session_id === "string") {
        events.push({
          type: "init",
          sessionId: msg.session_id,
        } satisfies ParsedInitEvent);
      }
      break;
    }

    case "assistant": {
      const message = msg.message as { content?: ContentBlock[] } | undefined;
      if (message?.content && Array.isArray(message.content)) {
        for (const block of message.content) {
          if (!block || typeof block !== "object") continue;

          if (block.type === "text" && typeof (block as TextBlock).text === "string") {
            events.push({
              type: "text",
              text: (block as TextBlock).text,
            } satisfies ParsedTextEvent);
          } else if (block.type === "tool_use") {
            const tu = block as { id?: string; name?: string; input?: Record<string, unknown> };
            events.push({
              type: "tool_use",
              id: tu.id ?? "",
              name: tu.name ?? "unknown",
              input: tu.input ?? {},
            } satisfies ParsedToolUseEvent);
          } else if (block.type === "tool_result") {
            const tr = block as {
              tool_use_id?: string;
              content?: Array<{ type: string; text?: string }>;
              is_error?: boolean;
            };
            const contentText = extractToolResultText(tr.content);
            events.push({
              type: "tool_result",
              toolUseId: tr.tool_use_id ?? "",
              content: contentText,
              isError: tr.is_error ?? false,
            } satisfies ParsedToolResultEvent);
          }
        }
      }
      break;
    }

    case "stream_event": {
      const event = msg.event as {
        delta?: { type?: string; text?: string };
        content_block?: ContentBlock;
      } | undefined;

      if (event?.delta?.type === "text_delta" && typeof event.delta.text === "string") {
        events.push({
          type: "text_delta",
          text: event.delta.text,
        } satisfies ParsedTextDeltaEvent);
      }

      // Also handle content_block_start with tool_use
      if (event?.content_block?.type === "tool_use") {
        const tu = event.content_block as {
          id?: string;
          name?: string;
          input?: Record<string, unknown>;
        };
        events.push({
          type: "tool_use",
          id: tu.id ?? "",
          name: tu.name ?? "unknown",
          input: tu.input ?? {},
        } satisfies ParsedToolUseEvent);
      }
      break;
    }

    case "result": {
      events.push({
        type: "result",
        sessionId: (msg.session_id as string) ?? "",
        cost: (msg.total_cost_usd as number) ?? 0,
        turns: (msg.num_turns as number) ?? 0,
        isError: (msg.is_error as boolean) ?? false,
        errors: (msg.errors as string[]) ?? [],
        durationMs: msg.total_duration_ms as number | undefined,
      } satisfies ParsedResultEvent);
      break;
    }
  }

  return events;
}


/**
 * Extract text content from a tool_result's content array.
 */
function extractToolResultText(
  content: Array<{ type: string; text?: string }> | undefined
): string {
  if (!content || !Array.isArray(content)) return "";
  return content
    .filter((c) => c.type === "text" && typeof c.text === "string")
    .map((c) => c.text!)
    .join("\n");
}


/**
 * Create a line-based stream parser that processes raw Buffer/string chunks
 * from a subprocess stdout and yields ParsedEvents.
 *
 * Handles line buffering (chunks may not align to line boundaries).
 */
export interface StreamParser {
  /** Feed a chunk of data. Returns parsed events from any complete lines. */
  feed(chunk: string | Buffer): ParsedEvent[];
  /** Flush any remaining buffered data. Call when stream ends. */
  flush(): ParsedEvent[];
}

export function createStreamParser(): StreamParser {
  let lineBuffer = "";

  return {
    feed(chunk: string | Buffer): ParsedEvent[] {
      const str = typeof chunk === "string" ? chunk : chunk.toString("utf-8");
      lineBuffer += str;

      const events: ParsedEvent[] = [];
      let newlineIdx: number;

      while ((newlineIdx = lineBuffer.indexOf("\n")) !== -1) {
        const line = lineBuffer.slice(0, newlineIdx);
        lineBuffer = lineBuffer.slice(newlineIdx + 1);
        events.push(...parseStreamLine(line));
      }

      return events;
    },

    flush(): ParsedEvent[] {
      if (!lineBuffer.trim()) {
        lineBuffer = "";
        return [];
      }
      const events = parseStreamLine(lineBuffer);
      lineBuffer = "";
      return events;
    },
  };
}
