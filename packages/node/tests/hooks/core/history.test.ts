import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { appendToHistory, loadHistory, loadMostRecentHistory } from "../../../src/hooks/core/history.js";
import type { HistoryEntry } from "../../../src/hooks/core/history.js";

function makeEntry(overrides: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    timestamp: Date.now(),
    eventName: "PostToolUse",
    toolName: "Bash",
    ttsText: "Command completed.",
    earcon: null,
    ...overrides,
  };
}

describe("event history", () => {
  let tmpDir: string;
  const origEnv = { ...process.env };

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hooks-history-"));
    process.env["XDG_STATE_HOME"] = tmpDir;
  });

  afterEach(() => {
    process.env = { ...origEnv };
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("appends and loads entries", () => {
    const entry = makeEntry({ ttsText: "Hello" });
    appendToHistory("session-1", entry);
    const loaded = loadHistory("session-1");
    expect(loaded).toHaveLength(1);
    expect(loaded[0]!.ttsText).toBe("Hello");
  });

  it("appends multiple entries", () => {
    appendToHistory("session-1", makeEntry({ ttsText: "First" }));
    appendToHistory("session-1", makeEntry({ ttsText: "Second" }));
    appendToHistory("session-1", makeEntry({ ttsText: "Third" }));
    const loaded = loadHistory("session-1");
    expect(loaded).toHaveLength(3);
    expect(loaded[0]!.ttsText).toBe("First");
    expect(loaded[2]!.ttsText).toBe("Third");
  });

  it("returns empty array for unknown session", () => {
    expect(loadHistory("nonexistent")).toEqual([]);
  });

  it("trims when exceeding maxEntries", () => {
    for (let i = 0; i < 10; i++) {
      appendToHistory("session-1", makeEntry({ ttsText: `Entry ${i}` }), 5);
    }
    const loaded = loadHistory("session-1");
    expect(loaded.length).toBeLessThanOrEqual(5);
    // Should have the newest entries
    expect(loaded[loaded.length - 1]!.ttsText).toBe("Entry 9");
  });

  it("does nothing when sessionId is undefined", () => {
    appendToHistory(undefined, makeEntry());
    // No crash, no files created
    const historyDir = path.join(tmpDir, "claude-a11y", "hooks", "history");
    expect(fs.existsSync(historyDir)).toBe(false);
  });

  it("creates directory structure", () => {
    appendToHistory("session-1", makeEntry());
    const historyDir = path.join(tmpDir, "claude-a11y", "hooks", "history");
    expect(fs.existsSync(historyDir)).toBe(true);
  });

  describe("loadMostRecentHistory", () => {
    it("returns null when no history exists", () => {
      expect(loadMostRecentHistory()).toBeNull();
    });

    it("returns the most recent session history", () => {
      appendToHistory("session-old", makeEntry({ ttsText: "Old" }));
      // Wait a tiny bit so mtime differs
      appendToHistory("session-new", makeEntry({ ttsText: "New" }));

      const result = loadMostRecentHistory();
      expect(result).not.toBeNull();
      expect(result!.entries.length).toBeGreaterThan(0);
    });
  });
});
