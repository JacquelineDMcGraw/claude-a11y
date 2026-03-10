import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { recordToolStart, getToolElapsed, formatElapsed } from "../../../src/hooks/core/progress.js";

describe("progress timing", () => {
  let tmpDir: string;
  const origEnv = { ...process.env };

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hooks-progress-"));
    process.env["XDG_STATE_HOME"] = tmpDir;
  });

  afterEach(() => {
    process.env = { ...origEnv };
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("recordToolStart / getToolElapsed", () => {
    it("records and retrieves elapsed time", () => {
      recordToolStart("session-1", "tu-1", "Bash");
      const elapsed = getToolElapsed("session-1", "tu-1");
      expect(elapsed).not.toBeNull();
      expect(elapsed!).toBeGreaterThanOrEqual(0);
      expect(elapsed!).toBeLessThan(1000); // should be nearly instant
    });

    it("returns null for unknown tool_use_id", () => {
      recordToolStart("session-1", "tu-1", "Bash");
      const elapsed = getToolElapsed("session-1", "tu-999");
      expect(elapsed).toBeNull();
    });

    it("returns null for unknown session", () => {
      const elapsed = getToolElapsed("nonexistent-session", "tu-1");
      expect(elapsed).toBeNull();
    });

    it("handles multiple tool starts in same session", () => {
      recordToolStart("session-1", "tu-1", "Bash");
      recordToolStart("session-1", "tu-2", "Edit");

      const elapsed1 = getToolElapsed("session-1", "tu-1");
      const elapsed2 = getToolElapsed("session-1", "tu-2");
      expect(elapsed1).not.toBeNull();
      expect(elapsed2).not.toBeNull();
    });

    it("creates state directory structure", () => {
      recordToolStart("session-1", "tu-1", "Bash");
      const progressDir = path.join(tmpDir, "claude-a11y", "hooks", "progress");
      expect(fs.existsSync(progressDir)).toBe(true);
    });
  });

  describe("formatElapsed", () => {
    it("formats sub-second as 'under a second'", () => {
      expect(formatElapsed(500)).toBe("under a second");
    });

    it("formats seconds", () => {
      expect(formatElapsed(5000)).toBe("5 seconds");
    });

    it("formats singular second", () => {
      expect(formatElapsed(1000)).toBe("1 second");
    });

    it("formats minutes and seconds", () => {
      expect(formatElapsed(150000)).toBe("2 minutes 30 seconds");
    });

    it("formats exact minutes", () => {
      expect(formatElapsed(120000)).toBe("2 minutes");
    });

    it("formats singular minute", () => {
      expect(formatElapsed(60000)).toBe("1 minute");
    });

    it("formats 1 minute 1 second", () => {
      expect(formatElapsed(61000)).toBe("1 minute 1 second");
    });
  });
});
