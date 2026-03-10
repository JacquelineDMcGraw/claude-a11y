import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  loadConfig,
  setConfigValue,
  getConfigValue,
  resetConfig,
  getConfigDir,
  DEFAULT_CONFIG,
} from "../../../src/hooks/config/index.js";

describe("config", () => {
  let tmpDir: string;
  const origEnv = { ...process.env };

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hooks-test-"));
    process.env["CLAUDE_A11Y_HOOKS_CONFIG_DIR"] = tmpDir;
  });

  afterEach(() => {
    process.env = { ...origEnv };
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("getConfigDir", () => {
    it("uses CLAUDE_A11Y_HOOKS_CONFIG_DIR when set", () => {
      process.env["CLAUDE_A11Y_HOOKS_CONFIG_DIR"] = "/custom/path";
      expect(getConfigDir()).toBe("/custom/path");
    });

    it("falls back to XDG_CONFIG_HOME", () => {
      delete process.env["CLAUDE_A11Y_HOOKS_CONFIG_DIR"];
      process.env["XDG_CONFIG_HOME"] = "/xdg/config";
      expect(getConfigDir()).toBe("/xdg/config/claude-a11y/hooks");
    });
  });

  describe("loadConfig", () => {
    it("returns defaults when no config file exists", () => {
      const config = loadConfig();
      expect(config).toEqual(DEFAULT_CONFIG);
    });

    it("returns defaults when config is invalid JSON", () => {
      fs.writeFileSync(path.join(tmpDir, "config.json"), "not json");
      const config = loadConfig();
      expect(config).toEqual(DEFAULT_CONFIG);
    });

    it("returns defaults when config is an array", () => {
      fs.writeFileSync(path.join(tmpDir, "config.json"), "[]");
      const config = loadConfig();
      expect(config).toEqual(DEFAULT_CONFIG);
    });

    it("merges partial config over defaults", () => {
      fs.writeFileSync(
        path.join(tmpDir, "config.json"),
        JSON.stringify({ verbosity: "full", tts: { enabled: true } }),
      );
      const config = loadConfig();
      expect(config.verbosity).toBe("full");
      expect(config.tts.enabled).toBe(true);
      expect(config.tts.engine).toBe("auto"); // default preserved
      expect(config.tts.rate).toBe(200); // default preserved
    });

    it("ignores invalid verbosity values", () => {
      fs.writeFileSync(
        path.join(tmpDir, "config.json"),
        JSON.stringify({ verbosity: "invalid" }),
      );
      const config = loadConfig();
      expect(config.verbosity).toBe("normal");
    });

    it("returns a deep clone, not a reference to defaults", () => {
      const a = loadConfig();
      const b = loadConfig();
      a.tts.enabled = true;
      expect(b.tts.enabled).toBe(false);
    });

    it("strips __proto__ from silence.tools", () => {
      fs.writeFileSync(
        path.join(tmpDir, "config.json"),
        JSON.stringify({ silence: { tools: { __proto__: true, Read: true } } }),
      );
      const config = loadConfig();
      expect(config.silence.tools["Read"]).toBe(true);
      expect(Object.keys(config.silence.tools)).not.toContain("__proto__");
      expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
    });

    it("strips __proto__ from significance.overrides", () => {
      fs.writeFileSync(
        path.join(tmpDir, "config.json"),
        JSON.stringify({ significance: { overrides: { __proto__: "noise", Read: "noise" } } }),
      );
      const config = loadConfig();
      expect(config.significance.overrides["Read"]).toBe("noise");
      expect(Object.keys(config.significance.overrides)).not.toContain("__proto__");
      expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
    });

    it("strips __proto__ from earcon.overrides", () => {
      fs.writeFileSync(
        path.join(tmpDir, "config.json"),
        JSON.stringify({ earcon: { overrides: { __proto__: "chime", Edit: "chime" } } }),
      );
      const config = loadConfig();
      expect(config.earcon.overrides["Edit"]).toBe("chime");
      expect(Object.keys(config.earcon.overrides)).not.toContain("__proto__");
      expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
    });
  });

  describe("setConfigValue", () => {
    it("sets a top-level value", () => {
      setConfigValue("verbosity", "full");
      expect(getConfigValue("verbosity")).toBe("full");
    });

    it("sets a nested value", () => {
      setConfigValue("tts.enabled", true);
      expect(getConfigValue("tts.enabled")).toBe(true);
      // Other tts values preserved
      expect(getConfigValue("tts.rate")).toBe(200);
    });

    it("rejects __proto__ key", () => {
      expect(() => setConfigValue("__proto__.polluted", true)).toThrow("dangerous key");
    });

    it("rejects constructor key", () => {
      expect(() => setConfigValue("constructor.polluted", true)).toThrow("dangerous key");
    });

    it("rejects prototype key", () => {
      expect(() => setConfigValue("prototype.polluted", true)).toThrow("dangerous key");
    });

    it("creates backup file on update", () => {
      setConfigValue("verbosity", "minimal");
      setConfigValue("verbosity", "full");
      const bakPath = path.join(tmpDir, "config.json.bak");
      expect(fs.existsSync(bakPath)).toBe(true);
      const bak = JSON.parse(fs.readFileSync(bakPath, "utf-8"));
      expect(bak.verbosity).toBe("minimal");
    });
  });

  describe("getConfigValue", () => {
    it("returns undefined for missing keys", () => {
      expect(getConfigValue("nonexistent")).toBeUndefined();
    });

    it("returns undefined for deep missing keys", () => {
      expect(getConfigValue("tts.nonexistent")).toBeUndefined();
    });
  });

  describe("resetConfig", () => {
    it("resets to defaults", () => {
      setConfigValue("verbosity", "full");
      setConfigValue("tts.enabled", true);
      resetConfig();
      const config = loadConfig();
      expect(config).toEqual(DEFAULT_CONFIG);
    });
  });
});
