import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { loadConfig } from "../../../src/hooks/config/index.js";

describe("config phase 3 — earcon, progress, history", () => {
  let tmpDir: string;
  const origEnv = { ...process.env };

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hooks-cfg3-"));
    process.env["CLAUDE_A11Y_HOOKS_CONFIG_DIR"] = tmpDir;
  });

  afterEach(() => {
    process.env = { ...origEnv };
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("includes earcon defaults", () => {
    const config = loadConfig();
    expect(config.earcon).toEqual({
      enabled: false,
      engine: "auto",
      volume: 0.5,
      overrides: {},
    });
  });

  it("includes progress defaults", () => {
    const config = loadConfig();
    expect(config.progress).toEqual({
      enabled: false,
      thresholdMs: 3000,
    });
  });

  it("includes history defaults", () => {
    const config = loadConfig();
    expect(config.history).toEqual({
      enabled: true,
      maxEntries: 500,
    });
  });

  it("merges partial earcon config", () => {
    fs.writeFileSync(
      path.join(tmpDir, "config.json"),
      JSON.stringify({ earcon: { enabled: true, volume: 0.8 } }),
    );
    const config = loadConfig();
    expect(config.earcon.enabled).toBe(true);
    expect(config.earcon.volume).toBe(0.8);
    expect(config.earcon.engine).toBe("auto"); // default preserved
  });

  it("clamps earcon volume to 0-1 range", () => {
    fs.writeFileSync(
      path.join(tmpDir, "config.json"),
      JSON.stringify({ earcon: { volume: 5.0 } }),
    );
    const config = loadConfig();
    expect(config.earcon.volume).toBe(1.0);

    fs.writeFileSync(
      path.join(tmpDir, "config.json"),
      JSON.stringify({ earcon: { volume: -2.0 } }),
    );
    const config2 = loadConfig();
    expect(config2.earcon.volume).toBe(0);
  });

  it("merges earcon overrides with string and false values", () => {
    fs.writeFileSync(
      path.join(tmpDir, "config.json"),
      JSON.stringify({
        earcon: {
          overrides: {
            "test-pass": "/custom/sound.wav",
            "test-fail": false,
            "invalid": 42, // should be ignored
          },
        },
      }),
    );
    const config = loadConfig();
    expect(config.earcon.overrides["test-pass"]).toBe("/custom/sound.wav");
    expect(config.earcon.overrides["test-fail"]).toBe(false);
    expect(config.earcon.overrides["invalid"]).toBeUndefined();
  });

  it("validates progress thresholdMs > 0", () => {
    fs.writeFileSync(
      path.join(tmpDir, "config.json"),
      JSON.stringify({ progress: { thresholdMs: -100 } }),
    );
    const config = loadConfig();
    expect(config.progress.thresholdMs).toBe(3000); // default
  });

  it("validates history maxEntries > 0", () => {
    fs.writeFileSync(
      path.join(tmpDir, "config.json"),
      JSON.stringify({ history: { maxEntries: 0 } }),
    );
    const config = loadConfig();
    expect(config.history.maxEntries).toBe(500); // default
  });

  it("validates earcon engine values", () => {
    fs.writeFileSync(
      path.join(tmpDir, "config.json"),
      JSON.stringify({ earcon: { engine: "invalid-engine" } }),
    );
    const config = loadConfig();
    expect(config.earcon.engine).toBe("auto"); // default
  });
});
