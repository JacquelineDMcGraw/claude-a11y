import { describe, it, expect } from "vitest";
import { execSync, execFileSync } from "node:child_process";
import { join } from "node:path";

const ROOT = join(__dirname, "..");
const BIN = join(ROOT, "bin", "claude-sr.js");
const FIXTURES = join(__dirname, "fixtures");

/**
 * Helper to run claude-sr with a mock claude binary.
 * Sets CLAUDE_PATH to the mock script so we don't need real claude.
 */
function runWithMock(
  mockName: string,
  args: string[],
  options: { input?: string; timeout?: number } = {}
): { stdout: string; stderr: string; status: number } {
  const mockPath = join(FIXTURES, mockName);
  const env = {
    ...process.env,
    CLAUDE_PATH: mockPath,
    NO_COLOR: "1",
    FORCE_COLOR: "0",
  };

  try {
    const stdout = execFileSync("node", [BIN, ...args], {
      env,
      timeout: options.timeout ?? 10000,
      input: options.input,
      stdio: ["pipe", "pipe", "pipe"],
      cwd: ROOT,
    });
    // execFileSync doesn't give us stderr on success, use execSync for that
    return { stdout: stdout.toString("utf-8"), stderr: "", status: 0 };
  } catch (err: unknown) {
    const e = err as { stdout?: Buffer; stderr?: Buffer; status?: number };
    return {
      stdout: e.stdout?.toString("utf-8") ?? "",
      stderr: e.stderr?.toString("utf-8") ?? "",
      status: e.status ?? 1,
    };
  }
}

/**
 * Run with mock and capture both stdout and stderr properly.
 * Uses a shell command to separate them.
 */
function runWithMockFull(
  mockName: string,
  args: string[]
): { stdout: Buffer; stderr: Buffer; status: number } {
  const mockPath = join(FIXTURES, mockName);
  const argsStr = args.map((a) => `"${a.replace(/"/g, '\\"')}"`).join(" ");
  const cmd = `CLAUDE_PATH="${mockPath}" node "${BIN}" ${argsStr}`;

  try {
    const stdout = execSync(cmd, {
      timeout: 10000,
      stdio: ["pipe", "pipe", "pipe"],
      cwd: ROOT,
      env: {
        ...process.env,
        CLAUDE_PATH: mockPath,
        NO_COLOR: "1",
        FORCE_COLOR: "0",
        PATH: process.env.PATH,
      },
    });
    return { stdout: Buffer.from(stdout), stderr: Buffer.alloc(0), status: 0 };
  } catch (err: unknown) {
    const e = err as { stdout?: Buffer; stderr?: Buffer; status?: number };
    return {
      stdout: e.stdout ? Buffer.from(e.stdout) : Buffer.alloc(0),
      stderr: e.stderr ? Buffer.from(e.stderr) : Buffer.alloc(0),
      status: e.status ?? 1,
    };
  }
}


describe("Integration: One-shot mode", () => {
  it("T-INT-01: produces clean text output", () => {
    const result = runWithMockFull("mock-claude.sh", ["-p", "test"]);
    const stdout = result.stdout.toString("utf-8");

    // Should contain the response text
    expect(stdout).toContain("Hello");
    expect(stdout).toContain("Claude");
    expect(stdout).toContain("project");

    // Should NOT contain any ESC bytes
    const escCount = [...result.stdout].filter((b) => b === 0x1b).length;
    expect(escCount).toBe(0);
  });

  it("T-INT-04: handles error exit codes", () => {
    const result = runWithMockFull("mock-claude-error.sh", ["-p", "test"]);
    expect(result.status).toBe(1);
  });

  it("T-INT-05: sanitizes ANSI from stderr", () => {
    const result = runWithMockFull("mock-claude-error.sh", ["-p", "test"]);
    const stderr = result.stderr.toString("utf-8");

    // stderr should be clean of ESC bytes
    const escCount = [...result.stderr].filter((b) => b === 0x1b).length;
    expect(escCount).toBe(0);
  });

  it("T-INT-06: handles heavy ANSI output", () => {
    const result = runWithMockFull("mock-claude-ansi-heavy.sh", [
      "-p",
      "test",
    ]);
    const stdout = result.stdout.toString("utf-8");

    // Should have text content
    expect(stdout).toContain("Done!");
    expect(stdout).toContain("All done!");
    expect(stdout).toContain("result");

    // Zero ESC bytes
    const escCount = [...result.stdout].filter((b) => b === 0x1b).length;
    expect(escCount).toBe(0);
  });

  it("T-INT-06b: handles large streaming output", () => {
    const result = runWithMockFull("mock-claude-large.sh", ["-p", "test"]);
    const stdout = result.stdout.toString("utf-8");

    // Should contain many lines
    expect(stdout).toContain("Line 1");
    expect(stdout).toContain("Line 100");
    expect(stdout).toContain("Line 200");

    // Zero ESC bytes in stdout
    const escCount = [...result.stdout].filter((b) => b === 0x1b).length;
    expect(escCount).toBe(0);
  });
});


describe("Integration: Help and version", () => {
  it("shows help text", () => {
    const result = runWithMock("mock-claude.sh", ["--help"]);
    expect(result.stdout).toContain("claude-sr");
    expect(result.stdout).toContain("Screen-reader-friendly");
    expect(result.stdout).toContain("REPL COMMANDS");
  });

  it("shows version", () => {
    const result = runWithMock("mock-claude.sh", ["--version"]);
    expect(result.stdout).toContain("claude-accessible v");
  });
});


describe("Integration: Byte-level verification", () => {
  const FORBIDDEN_BYTES = new Set([
    0x1b, // ESC
    0x9b, // CSI (8-bit)
    0x08, // BS
    0x07, // BEL
  ]);

  function scanForForbiddenBytes(
    buffer: Buffer
  ): Array<{ byte: number; offset: number }> {
    const violations: Array<{ byte: number; offset: number }> = [];
    for (let i = 0; i < buffer.length; i++) {
      const byte = buffer[i]!;
      if (FORBIDDEN_BYTES.has(byte)) {
        violations.push({ byte, offset: i });
      }
      // Check for orphan CR (0x0D not followed by 0x0A)
      if (byte === 0x0d && (i + 1 >= buffer.length || buffer[i + 1] !== 0x0a)) {
        violations.push({ byte, offset: i });
      }
    }
    return violations;
  }

  it("stdout contains zero forbidden bytes (basic mock)", () => {
    const result = runWithMockFull("mock-claude.sh", ["-p", "test"]);
    const violations = scanForForbiddenBytes(result.stdout);
    expect(violations).toEqual([]);
  });

  it("stdout contains zero forbidden bytes (ANSI-heavy mock)", () => {
    const result = runWithMockFull("mock-claude-ansi-heavy.sh", [
      "-p",
      "test",
    ]);
    const violations = scanForForbiddenBytes(result.stdout);
    expect(violations).toEqual([]);
  });

  it("stdout contains zero forbidden bytes (large mock)", () => {
    const result = runWithMockFull("mock-claude-large.sh", ["-p", "test"]);
    const violations = scanForForbiddenBytes(result.stdout);
    expect(violations).toEqual([]);
  });

  it("stderr contains zero ESC bytes (error mock)", () => {
    const result = runWithMockFull("mock-claude-error.sh", ["-p", "test"]);
    const escCount = [...result.stderr].filter((b) => b === 0x1b).length;
    expect(escCount).toBe(0);
  });
});
