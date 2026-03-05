import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  appendToDigest,
  flushDigest,
  summarizeDigest,
  saveLastDigest,
  loadLastDigest,
  loadMostRecentDigest,
} from "../../../src/hooks/core/digest.js";
import type { DigestEntry } from "../../../src/hooks/core/digest.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hooks-digest-test-"));
  process.env["XDG_STATE_HOME"] = tmpDir;
});

afterEach(() => {
  delete process.env["XDG_STATE_HOME"];
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function makeEntry(overrides: Partial<DigestEntry> = {}): DigestEntry {
  return {
    toolName: "Read",
    ttsText: "Read app.ts, 42 lines.",
    contextText: "Read /src/app.ts (42 lines) [TypeScript]",
    significance: "noise",
    timestamp: Date.now(),
    ...overrides,
  };
}

describe("appendToDigest + flushDigest", () => {
  it("appends and flushes entries", () => {
    appendToDigest("session1", makeEntry({ toolName: "Read" }));
    appendToDigest("session1", makeEntry({ toolName: "Edit", significance: "notable" }));

    const entries = flushDigest("session1");
    expect(entries).toHaveLength(2);
    expect(entries[0]!.toolName).toBe("Read");
    expect(entries[1]!.toolName).toBe("Edit");
  });

  it("flush clears the buffer", () => {
    appendToDigest("session2", makeEntry());
    const first = flushDigest("session2");
    expect(first).toHaveLength(1);

    const second = flushDigest("session2");
    expect(second).toHaveLength(0);
  });

  it("handles missing session gracefully", () => {
    const entries = flushDigest("nonexistent");
    expect(entries).toHaveLength(0);
  });

  it("isolates sessions", () => {
    appendToDigest("sessionA", makeEntry({ toolName: "Read" }));
    appendToDigest("sessionB", makeEntry({ toolName: "Write" }));

    const entriesA = flushDigest("sessionA");
    const entriesB = flushDigest("sessionB");

    expect(entriesA).toHaveLength(1);
    expect(entriesA[0]!.toolName).toBe("Read");
    expect(entriesB).toHaveLength(1);
    expect(entriesB[0]!.toolName).toBe("Write");
  });

  it("handles corrupted digest file", () => {
    const digestDir = path.join(tmpDir, "claude-a11y-hooks", "digests");
    fs.mkdirSync(digestDir, { recursive: true });
    fs.writeFileSync(path.join(digestDir, "corrupt.json"), "not json", "utf-8");

    // Appending to corrupt session should start fresh
    appendToDigest("corrupt", makeEntry());
    const entries = flushDigest("corrupt");
    expect(entries).toHaveLength(1);
  });
});

describe("summarizeDigest", () => {
  it("handles empty entries", () => {
    const result = summarizeDigest([]);
    expect(result.ttsText).toBe("Done.");
    expect(result.contextText).toContain("No activity");
  });

  it("summarizes edits", () => {
    const entries: DigestEntry[] = [
      makeEntry({ toolName: "Edit", significance: "notable", ttsText: "Edited app.ts: added parseConfig." }),
      makeEntry({ toolName: "Write", significance: "notable", ttsText: "Wrote config.ts, 30 lines." }),
      makeEntry({ toolName: "Edit", significance: "notable", ttsText: "Edited index.ts: modified loadSettings." }),
    ];
    const result = summarizeDigest(entries);
    expect(result.ttsText).toContain("3 edits");
    expect(result.ttsText).toContain("Done.");
  });

  it("includes important items in TTS", () => {
    const entries: DigestEntry[] = [
      makeEntry({ toolName: "Bash", significance: "important", ttsText: "Important: 3 tests failed." }),
      makeEntry({ toolName: "Read", significance: "noise" }),
    ];
    const result = summarizeDigest(entries);
    expect(result.ttsText).toContain("3 tests failed");
  });

  it("counts reads/searches", () => {
    const entries: DigestEntry[] = [
      makeEntry({ toolName: "Read", significance: "noise" }),
      makeEntry({ toolName: "Read", significance: "noise" }),
      makeEntry({ toolName: "Glob", significance: "noise" }),
      makeEntry({ toolName: "Grep", significance: "noise" }),
    ];
    const result = summarizeDigest(entries);
    expect(result.ttsText).toContain("4 reads");
  });

  it("builds detailed contextText", () => {
    const entries: DigestEntry[] = [
      makeEntry({ toolName: "Edit", significance: "notable", ttsText: "Edited app.ts." }),
      makeEntry({ toolName: "Read", significance: "noise", ttsText: "" }),
      makeEntry({ toolName: "Bash", significance: "important", ttsText: "Important: test failed." }),
    ];
    const result = summarizeDigest(entries);
    expect(result.contextText).toContain("Session summary");
    expect(result.contextText).toContain("Important:");
    expect(result.contextText).toContain("Notable:");
    expect(result.contextText).toContain("Total: 3 events");
  });

  it("handles single entry", () => {
    const entries: DigestEntry[] = [
      makeEntry({ toolName: "Write", significance: "notable", ttsText: "Wrote config.ts." }),
    ];
    const result = summarizeDigest(entries);
    expect(result.ttsText).toContain("Done.");
    expect(result.ttsText).toContain("1 edit");
  });

  it("uses singular for 1 read", () => {
    const entries: DigestEntry[] = [
      makeEntry({ toolName: "Read", significance: "noise" }),
    ];
    const result = summarizeDigest(entries);
    expect(result.ttsText).toContain("1 read");
    expect(result.ttsText).not.toContain("reads");
  });
});

describe("saveLastDigest + loadLastDigest", () => {
  it("saves and loads digest for replay", () => {
    saveLastDigest("session1", "Done. 3 edits, tests passed, 8 reads.");
    const loaded = loadLastDigest("session1");
    expect(loaded).toBe("Done. 3 edits, tests passed, 8 reads.");
  });

  it("returns null for missing session", () => {
    const loaded = loadLastDigest("nonexistent");
    expect(loaded).toBeNull();
  });

  it("overwrites previous digest", () => {
    saveLastDigest("session1", "First digest.");
    saveLastDigest("session1", "Second digest.");
    const loaded = loadLastDigest("session1");
    expect(loaded).toBe("Second digest.");
  });
});

describe("loadMostRecentDigest", () => {
  it("returns null when no digests exist", () => {
    const result = loadMostRecentDigest();
    expect(result).toBeNull();
  });

  it("returns the most recent digest", () => {
    saveLastDigest("old-session", "Old digest.");
    // Small delay to ensure different mtime
    saveLastDigest("new-session", "New digest.");
    const result = loadMostRecentDigest();
    expect(result).toBe("New digest.");
  });
});
