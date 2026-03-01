import { describe, it, expect, vi } from "vitest";
import { parseStreamLine, createStreamParser } from "../src/stream-parser.js";

describe("parseStreamLine()", () => {
  it("parses system/init message", () => {
    const events = parseStreamLine(
      '{"type":"system","subtype":"init","session_id":"abc-123"}'
    );
    expect(events).toEqual([
      { type: "init", sessionId: "abc-123" },
    ]);
  });

  it("parses text content in assistant message", () => {
    const events = parseStreamLine(
      '{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Hello world"}]}}'
    );
    expect(events).toEqual([
      { type: "text", text: "Hello world" },
    ]);
  });

  it("parses tool_use block", () => {
    const events = parseStreamLine(
      '{"type":"assistant","message":{"role":"assistant","content":[{"type":"tool_use","name":"Bash","id":"tu_1","input":{"command":"npm test"}}]}}'
    );
    expect(events).toEqual([
      {
        type: "tool_use",
        id: "tu_1",
        name: "Bash",
        input: { command: "npm test" },
      },
    ]);
  });

  it("parses stream_event text delta", () => {
    const events = parseStreamLine(
      '{"type":"stream_event","event":{"delta":{"type":"text_delta","text":"tok"}}}'
    );
    expect(events).toEqual([
      { type: "text_delta", text: "tok" },
    ]);
  });

  it("parses result message", () => {
    const events = parseStreamLine(
      '{"type":"result","subtype":"success","session_id":"abc-123","total_cost_usd":0.005,"num_turns":3,"is_error":false}'
    );
    expect(events).toEqual([
      {
        type: "result",
        sessionId: "abc-123",
        cost: 0.005,
        turns: 3,
        isError: false,
        errors: [],
        durationMs: undefined,
      },
    ]);
  });

  it("parses error result message", () => {
    const events = parseStreamLine(
      '{"type":"result","subtype":"error_max_turns","session_id":"abc","is_error":true,"total_cost_usd":0.01,"num_turns":5,"errors":["Max turns reached"]}'
    );
    expect(events).toEqual([
      {
        type: "result",
        sessionId: "abc",
        cost: 0.01,
        turns: 5,
        isError: true,
        errors: ["Max turns reached"],
        durationMs: undefined,
      },
    ]);
  });

  it("handles malformed JSON line without crashing", () => {
    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const events = parseStreamLine("not json at all");
    expect(events).toEqual([]);
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining("[Warning] Skipping malformed JSON")
    );
    spy.mockRestore();
  });

  it("skips empty lines silently", () => {
    expect(parseStreamLine("")).toEqual([]);
    expect(parseStreamLine("   ")).toEqual([]);
  });

  it("parses multiple content blocks in single assistant message", () => {
    const line = JSON.stringify({
      type: "assistant",
      message: {
        role: "assistant",
        content: [
          { type: "text", text: "Let me check " },
          {
            type: "tool_use",
            name: "Read",
            id: "tu_1",
            input: { file_path: "main.ts" },
          },
          { type: "text", text: "Found the issue." },
        ],
      },
    });
    const events = parseStreamLine(line);
    expect(events).toHaveLength(3);
    expect(events[0]).toEqual({ type: "text", text: "Let me check " });
    expect(events[1]).toEqual({
      type: "tool_use",
      id: "tu_1",
      name: "Read",
      input: { file_path: "main.ts" },
    });
    expect(events[2]).toEqual({ type: "text", text: "Found the issue." });
  });

  it("parses tool_result with text content", () => {
    const line = JSON.stringify({
      type: "assistant",
      message: {
        role: "assistant",
        content: [
          {
            type: "tool_result",
            tool_use_id: "tu_1",
            content: [{ type: "text", text: "file contents here" }],
          },
        ],
      },
    });
    const events = parseStreamLine(line);
    expect(events).toEqual([
      {
        type: "tool_result",
        toolUseId: "tu_1",
        content: "file contents here",
        isError: false,
      },
    ]);
  });

  it("parses tool_result with error", () => {
    const line = JSON.stringify({
      type: "assistant",
      message: {
        role: "assistant",
        content: [
          {
            type: "tool_result",
            tool_use_id: "tu_1",
            content: [{ type: "text", text: "Permission denied" }],
            is_error: true,
          },
        ],
      },
    });
    const events = parseStreamLine(line);
    expect(events[0]).toMatchObject({
      type: "tool_result",
      isError: true,
      content: "Permission denied",
    });
  });

  it("handles assistant message with empty content array", () => {
    const line = JSON.stringify({
      type: "assistant",
      message: { role: "assistant", content: [] },
    });
    expect(parseStreamLine(line)).toEqual([]);
  });

  it("handles result with duration", () => {
    const line = JSON.stringify({
      type: "result",
      subtype: "success",
      session_id: "abc",
      total_cost_usd: 0.003,
      num_turns: 1,
      is_error: false,
      total_duration_ms: 5000,
    });
    const events = parseStreamLine(line);
    expect(events[0]).toMatchObject({
      type: "result",
      durationMs: 5000,
    });
  });

  it("handles unknown message types gracefully", () => {
    const line = JSON.stringify({ type: "unknown_type", data: "foo" });
    expect(parseStreamLine(line)).toEqual([]);
  });

  it("handles very large JSON line without crashing", () => {
    const bigText = "x".repeat(2 * 1024 * 1024); // 2MB
    const line = JSON.stringify({
      type: "assistant",
      message: {
        role: "assistant",
        content: [{ type: "text", text: bigText }],
      },
    });
    const events = parseStreamLine(line);
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe("text");
  });
});


describe("createStreamParser()", () => {
  it("parses complete lines from a single chunk", () => {
    const parser = createStreamParser();
    const events = parser.feed(
      '{"type":"system","subtype":"init","session_id":"s1"}\n'
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "init", sessionId: "s1" });
  });

  it("handles lines split across chunks", () => {
    const parser = createStreamParser();
    const line = '{"type":"system","subtype":"init","session_id":"s1"}';
    const half = Math.floor(line.length / 2);

    const events1 = parser.feed(line.slice(0, half));
    expect(events1).toHaveLength(0);

    const events2 = parser.feed(line.slice(half) + "\n");
    expect(events2).toHaveLength(1);
    expect(events2[0]).toMatchObject({ type: "init" });
  });

  it("handles multiple lines in one chunk", () => {
    const parser = createStreamParser();
    const data =
      '{"type":"system","subtype":"init","session_id":"s1"}\n' +
      '{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"hi"}]}}\n';
    const events = parser.feed(data);
    expect(events).toHaveLength(2);
    expect(events[0]!.type).toBe("init");
    expect(events[1]!.type).toBe("text");
  });

  it("flushes remaining buffered data", () => {
    const parser = createStreamParser();
    parser.feed('{"type":"system","subtype":"init","session_id":"s1"}');
    // No newline yet, so nothing parsed
    const events = parser.flush();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "init" });
  });

  it("handles empty flush", () => {
    const parser = createStreamParser();
    expect(parser.flush()).toEqual([]);
  });

  it("handles Buffer input", () => {
    const parser = createStreamParser();
    const buf = Buffer.from(
      '{"type":"system","subtype":"init","session_id":"buf1"}\n'
    );
    const events = parser.feed(buf);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ sessionId: "buf1" });
  });
});
