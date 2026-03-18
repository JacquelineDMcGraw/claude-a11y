import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { loadConfig } from "../../../src/hooks/config/index.js";

describe("config phase 4 — summarize", () => {
  let tmpDir: string;
  const origEnv = { ...process.env };

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hooks-cfg4-"));
    process.env["CLAUDE_A11Y_HOOKS_CONFIG_DIR"] = tmpDir;
  });

  afterEach(() => {
    process.env = { ...origEnv };
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("includes summarize defaults", () => {
    const config = loadConfig();
    expect(config.summarize).toEqual({
      enabled: false,
      maxDeclarations: 20,
      maxTtsNames: 3,
    });
  });

  it("merges partial summarize config", () => {
    fs.writeFileSync(
      path.join(tmpDir, "config.json"),
      JSON.stringify({ summarize: { enabled: true } }),
    );
    const config = loadConfig();
    expect(config.summarize.enabled).toBe(true);
    expect(config.summarize.maxDeclarations).toBe(20); // default preserved
    expect(config.summarize.maxTtsNames).toBe(3); // default preserved
  });

  it("validates maxDeclarations > 0", () => {
    fs.writeFileSync(
      path.join(tmpDir, "config.json"),
      JSON.stringify({ summarize: { maxDeclarations: 0 } }),
    );
    const config = loadConfig();
    expect(config.summarize.maxDeclarations).toBe(20); // default

    fs.writeFileSync(
      path.join(tmpDir, "config.json"),
      JSON.stringify({ summarize: { maxDeclarations: -5 } }),
    );
    const config2 = loadConfig();
    expect(config2.summarize.maxDeclarations).toBe(20); // default
  });

  it("validates maxTtsNames > 0", () => {
    fs.writeFileSync(
      path.join(tmpDir, "config.json"),
      JSON.stringify({ summarize: { maxTtsNames: 0 } }),
    );
    const config = loadConfig();
    expect(config.summarize.maxTtsNames).toBe(3); // default

    fs.writeFileSync(
      path.join(tmpDir, "config.json"),
      JSON.stringify({ summarize: { maxTtsNames: -1 } }),
    );
    const config2 = loadConfig();
    expect(config2.summarize.maxTtsNames).toBe(3); // default
  });
});
