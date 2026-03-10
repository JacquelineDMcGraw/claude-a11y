import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { appendToHistory } from "../../../src/hooks/core/history.js";
import { historyCommandNonInteractive } from "../../../src/hooks/cli/commands/history.js";

describe("history CLI (non-interactive)", () => {
  let tmpDir: string;
  const origEnv = { ...process.env };
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hooks-cli-history-"));
    process.env["XDG_STATE_HOME"] = tmpDir;
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = { ...origEnv };
    fs.rmSync(tmpDir, { recursive: true, force: true });
    consoleSpy.mockRestore();
  });

  it("shows 'no history' message when empty", () => {
    historyCommandNonInteractive(20);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("No history found"),
    );
  });

  it("lists events with timestamps", () => {
    appendToHistory("test-session", {
      timestamp: Date.now(),
      eventName: "PostToolUse",
      toolName: "Bash",
      ttsText: "Command completed.",
      earcon: null,
    });
    appendToHistory("test-session", {
      timestamp: Date.now(),
      eventName: "Stop",
      ttsText: "Done.",
      earcon: "done",
    });

    historyCommandNonInteractive(20);
    // First call is the header
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("2 total event"));
    // Entries contain tool names
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("[Bash]"));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("[Stop]"));
  });

  it("respects count parameter", () => {
    for (let i = 0; i < 10; i++) {
      appendToHistory("test-session", {
        timestamp: Date.now(),
        eventName: "PostToolUse",
        toolName: "Read",
        ttsText: `Event ${i}`,
        earcon: null,
      });
    }

    historyCommandNonInteractive(3);
    // Should show "10 total events (showing last 3)"
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("showing last 3"));
  });

  it("handles missing session_id gracefully", () => {
    // appendToHistory with undefined session does nothing
    appendToHistory(undefined, {
      timestamp: Date.now(),
      eventName: "PostToolUse",
      ttsText: "test",
      earcon: null,
    });
    historyCommandNonInteractive(20);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("No history found"));
  });
});
