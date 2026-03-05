import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { recordAndSequence, cleanStaleSessions } from "../../../src/hooks/core/sequencer.js";

describe("sequencer", () => {
  let tmpDir: string;
  const origEnv = { ...process.env };

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hooks-seq-"));
    process.env["XDG_STATE_HOME"] = tmpDir;
  });

  afterEach(() => {
    process.env = { ...origEnv };
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("recordAndSequence", () => {
    it("returns index 1 for a single result", () => {
      const info = recordAndSequence("session1", "tu1", "Bash");
      expect(info.index).toBe(1);
      expect(info.batchSize).toBe(1);
    });

    it("returns incrementing indices for multiple results in same session", () => {
      const info1 = recordAndSequence("session1", "tu1", "Bash");
      const info2 = recordAndSequence("session1", "tu2", "Read");
      const info3 = recordAndSequence("session1", "tu3", "Grep");
      expect(info1.index).toBe(1);
      expect(info2.index).toBe(2);
      expect(info3.index).toBe(3);
      expect(info3.batchSize).toBe(3);
    });

    it("is idempotent for same tool_use_id", () => {
      recordAndSequence("session1", "tu1", "Bash");
      recordAndSequence("session1", "tu2", "Read");
      const repeated = recordAndSequence("session1", "tu1", "Bash");
      expect(repeated.index).toBe(1);
      expect(repeated.batchSize).toBe(2);
    });

    it("isolates different sessions", () => {
      recordAndSequence("session1", "tu1", "Bash");
      const info = recordAndSequence("session2", "tu1", "Read");
      expect(info.index).toBe(1);
      expect(info.batchSize).toBe(1);
    });

    it("sanitizes session IDs for file safety", () => {
      const info = recordAndSequence("../../../etc/passwd", "tu1", "Bash");
      expect(info.index).toBe(1);
      // Should not create file outside session dir
      const sessionDir = path.join(tmpDir, "claude-a11y", "hooks", "sessions");
      if (fs.existsSync(sessionDir)) {
        const files = fs.readdirSync(sessionDir);
        for (const file of files) {
          expect(file).not.toContain("..");
        }
      }
    });
  });

  describe("cleanStaleSessions", () => {
    it("does not crash when session dir does not exist", () => {
      expect(() => cleanStaleSessions()).not.toThrow();
    });

    it("removes stale session files", () => {
      const sessionDir = path.join(tmpDir, "claude-a11y", "hooks", "sessions");
      fs.mkdirSync(sessionDir, { recursive: true });

      // Create a "stale" file by backdating mtime
      const stalePath = path.join(sessionDir, "old-session.json");
      fs.writeFileSync(stalePath, '{"entries":[]}');

      // Backdate the file's mtime by 2 hours
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      fs.utimesSync(stalePath, twoHoursAgo, twoHoursAgo);

      // Create a fresh file
      const freshPath = path.join(sessionDir, "fresh-session.json");
      fs.writeFileSync(freshPath, '{"entries":[]}');

      cleanStaleSessions();

      expect(fs.existsSync(stalePath)).toBe(false);
      expect(fs.existsSync(freshPath)).toBe(true);
    });
  });
});
