import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { summarizeCommand } from "../../../src/hooks/cli/commands/summarize.js";
import { loadConfig } from "../../../src/hooks/config/index.js";

describe("summarize CLI command", () => {
  let tmpDir: string;
  const origEnv = { ...process.env };

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hooks-summ-"));
    process.env["CLAUDE_A11Y_HOOKS_CONFIG_DIR"] = tmpDir;
  });

  afterEach(() => {
    process.env = { ...origEnv };
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("enables summarization with 'on'", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    summarizeCommand("on");

    const config = loadConfig();
    expect(config.summarize.enabled).toBe(true);
    expect(spy).toHaveBeenCalledWith("Code summarization enabled.");
  });

  it("disables summarization with 'off'", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    // First enable, then disable
    summarizeCommand("on");
    summarizeCommand("off");

    const config = loadConfig();
    expect(config.summarize.enabled).toBe(false);
    expect(spy).toHaveBeenCalledWith("Code summarization disabled.");
  });

  it("shows status when called without args", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    summarizeCommand("status");
    expect(spy).toHaveBeenCalledWith("Code summarization is off.");

    summarizeCommand("on");
    summarizeCommand("status");
    expect(spy).toHaveBeenCalledWith("Code summarization is on.");
  });
});
