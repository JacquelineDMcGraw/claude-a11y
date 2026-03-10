import { describe, it, expect } from "vitest";
import { Readable } from "node:stream";
import { readStdin } from "../../../src/hooks/cli/utils/stdin.js";

function streamFrom(data: string): NodeJS.ReadableStream {
  return Readable.from([Buffer.from(data)]);
}

function emptyStream(): NodeJS.ReadableStream {
  return Readable.from([]);
}

function slowStream(data: string, delayMs: number): NodeJS.ReadableStream {
  return new Readable({
    read() {
      setTimeout(() => {
        this.push(Buffer.from(data));
        this.push(null);
      }, delayMs);
    },
  });
}

describe("readStdin", () => {
  it("reads data from stream", async () => {
    const result = await readStdin(streamFrom('{"test": true}'));
    expect(result).toBe('{"test": true}');
  });

  it("reads empty stream", async () => {
    const result = await readStdin(emptyStream());
    expect(result).toBe("");
  });

  it("rejects on timeout", async () => {
    const stream = slowStream("data", 10000);
    await expect(readStdin(stream, { timeoutMs: 50 })).rejects.toThrow("timed out");
  });

  it("rejects on size limit exceeded", async () => {
    const bigData = "x".repeat(100);
    await expect(readStdin(streamFrom(bigData), { maxBytes: 10 })).rejects.toThrow(
      "byte limit",
    );
  });
});
