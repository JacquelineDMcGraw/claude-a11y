import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { acquireLock, releaseLock, sanitizeSessionId } from "../../../src/hooks/core/file-lock.js";

describe("file-lock", () => {
  let tmpDir: string;
  let lockPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hooks-lock-"));
    lockPath = path.join(tmpDir, "test.lock");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("sanitizeSessionId", () => {
    it("passes through alphanumeric IDs unchanged", () => {
      expect(sanitizeSessionId("abc-123_DEF")).toBe("abc-123_DEF");
    });

    it("replaces path traversal characters", () => {
      expect(sanitizeSessionId("../../etc/passwd")).toBe("______etc_passwd");
    });

    it("replaces spaces and special chars", () => {
      expect(sanitizeSessionId("session with spaces!@#")).toBe("session_with_spaces___");
    });

    it("handles empty string", () => {
      expect(sanitizeSessionId("")).toBe("");
    });
  });

  describe("acquireLock", () => {
    it("acquires a lock on a fresh path", () => {
      const result = acquireLock(lockPath);
      expect(result).toBe(true);
      expect(fs.existsSync(lockPath)).toBe(true);
      releaseLock(lockPath);
    });

    it("lock file contains the current PID", () => {
      acquireLock(lockPath);
      const contents = fs.readFileSync(lockPath, "utf-8");
      expect(contents).toBe(String(process.pid));
      releaseLock(lockPath);
    });

    it("creates parent directories if they don't exist", () => {
      const deepLock = path.join(tmpDir, "a", "b", "c", "test.lock");
      const result = acquireLock(deepLock);
      expect(result).toBe(true);
      expect(fs.existsSync(deepLock)).toBe(true);
      releaseLock(deepLock);
    });

    it("cleans up stale locks older than 5 seconds", () => {
      fs.writeFileSync(lockPath, "99999", { flag: "wx" });
      const past = Date.now() - 10000;
      fs.utimesSync(lockPath, new Date(past), new Date(past));

      const result = acquireLock(lockPath);
      expect(result).toBe(true);
      releaseLock(lockPath);
    });

    it("fails to acquire when lock is held and not stale", () => {
      fs.writeFileSync(lockPath, "99999", { flag: "wx" });

      const result = acquireLock(lockPath);
      expect(result).toBe(false);
      fs.unlinkSync(lockPath);
    });
  });

  describe("releaseLock", () => {
    it("removes the lock file", () => {
      acquireLock(lockPath);
      expect(fs.existsSync(lockPath)).toBe(true);
      releaseLock(lockPath);
      expect(fs.existsSync(lockPath)).toBe(false);
    });

    it("does not throw if lock file already removed", () => {
      expect(() => releaseLock(lockPath)).not.toThrow();
    });

    it("does not throw on nonexistent path", () => {
      expect(() => releaseLock(path.join(tmpDir, "no-such.lock"))).not.toThrow();
    });
  });
});
