/**
 * Cross-process file locking using atomic file creation (O_EXCL).
 * Shared by sequencer, history, progress, digest, and any module
 * needing read-modify-write coordination on the filesystem.
 *
 * Also exports sanitizeSessionId so every module uses the same logic.
 */

import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Sanitize session ID for use in file paths.
 * Prevents path traversal by replacing non-alphanumeric chars.
 */
export function sanitizeSessionId(sessionId: string): string {
  return sessionId.replace(/[^a-zA-Z0-9_-]/g, "_");
}

const LOCK_RETRY_MS = 5;
const LOCK_MAX_WAIT_MS = 200;
const LOCK_STALE_MS = 5000;

/**
 * Attempt to acquire an exclusive file lock.
 * Returns true if the lock was acquired, false if timed out.
 * On timeout the caller should still proceed (best-effort) but
 * must NOT call releaseLock since it doesn't own the lock file.
 */
export function acquireLock(lockPath: string): boolean {
  const dir = path.dirname(lockPath);
  fs.mkdirSync(dir, { recursive: true });

  const deadline = Date.now() + LOCK_MAX_WAIT_MS;
  while (Date.now() < deadline) {
    try {
      fs.writeFileSync(lockPath, String(process.pid), { flag: "wx" });
      return true;
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === "EEXIST") {
        try {
          const stat = fs.statSync(lockPath);
          if (Date.now() - stat.mtimeMs > LOCK_STALE_MS) {
            fs.unlinkSync(lockPath);
            continue;
          }
        } catch {
          continue;
        }
        const waitUntil = Date.now() + LOCK_RETRY_MS;
        while (Date.now() < waitUntil) {
          // busy-wait
        }
        continue;
      }
      throw err;
    }
  }
  return false;
}

export function releaseLock(lockPath: string): void {
  try {
    fs.unlinkSync(lockPath);
  } catch {
    // Already cleaned up
  }
}
