import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  readSettings,
  writeSettings,
  installHooks,
  removeHooks,
  isHooksInstalled,
} from "../../../src/hooks/settings/index.js";

describe("settings", () => {
  let tmpDir: string;
  let settingsPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hooks-settings-"));
    settingsPath = path.join(tmpDir, "settings.json");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("readSettings", () => {
    it("returns null when file does not exist", () => {
      expect(readSettings(settingsPath)).toBeNull();
    });

    it("reads valid JSON object", () => {
      fs.writeFileSync(settingsPath, JSON.stringify({ foo: "bar" }));
      const result = readSettings(settingsPath);
      expect(result).toEqual({ foo: "bar" });
    });

    it("throws on invalid JSON", () => {
      fs.writeFileSync(settingsPath, "not json");
      expect(() => readSettings(settingsPath)).toThrow();
    });

    it("throws on JSON array", () => {
      fs.writeFileSync(settingsPath, "[]");
      expect(() => readSettings(settingsPath)).toThrow("not a JSON object");
    });
  });

  describe("writeSettings", () => {
    it("creates the file", () => {
      writeSettings({ test: true }, settingsPath);
      const raw = fs.readFileSync(settingsPath, "utf-8");
      expect(JSON.parse(raw)).toEqual({ test: true });
    });

    it("creates backup of existing file", () => {
      writeSettings({ version: 1 }, settingsPath);
      writeSettings({ version: 2 }, settingsPath);
      const bak = JSON.parse(fs.readFileSync(settingsPath + ".bak", "utf-8"));
      expect(bak).toEqual({ version: 1 });
    });
  });

  describe("installHooks", () => {
    it("creates settings with hooks for all event types when no file exists", () => {
      const result = installHooks(settingsPath);
      expect(result).toContain("Installed");
      const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
      expect(settings.hooks.PostToolUse).toHaveLength(1);
      expect(settings.hooks.Notification).toHaveLength(1);
      expect(settings.hooks.PermissionRequest).toHaveLength(1);
      expect(settings.hooks.PostToolUse[0].hooks[0].command).toContain("claude-a11y hooks format");
      expect(settings.hooks.Notification[0].hooks[0].command).toContain("claude-a11y hooks format");
      expect(settings.hooks.PermissionRequest[0].hooks[0].command).toContain("claude-a11y hooks format");
    });

    it("adds hooks to existing settings without hooks", () => {
      writeSettings({ existing: "data" }, settingsPath);
      installHooks(settingsPath);
      const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
      expect(settings.existing).toBe("data");
      expect(settings.hooks.PostToolUse).toHaveLength(1);
      expect(settings.hooks.Notification).toHaveLength(1);
      expect(settings.hooks.PermissionRequest).toHaveLength(1);
    });

    it("preserves existing non-a11y hooks", () => {
      writeSettings(
        {
          hooks: {
            PostToolUse: [
              { matcher: "", hooks: [{ type: "command", command: "other-tool" }] },
            ],
          },
        },
        settingsPath,
      );
      installHooks(settingsPath);
      const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
      expect(settings.hooks.PostToolUse).toHaveLength(2);
    });

    it("updates existing a11y hooks (upgrade path)", () => {
      installHooks(settingsPath);
      const result = installHooks(settingsPath);
      expect(result).toContain("Updated");
      const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
      expect(settings.hooks.PostToolUse).toHaveLength(1);
      expect(settings.hooks.Notification).toHaveLength(1);
      expect(settings.hooks.PermissionRequest).toHaveLength(1);
    });
  });

  describe("removeHooks", () => {
    it("returns message when no settings file", () => {
      const result = removeHooks(settingsPath);
      expect(result).toContain("No settings file");
    });

    it("returns message when no hooks section", () => {
      writeSettings({}, settingsPath);
      const result = removeHooks(settingsPath);
      expect(result).toContain("No hooks found");
    });

    it("removes a11y hooks from all event types and preserves others", () => {
      writeSettings(
        {
          hooks: {
            PostToolUse: [
              { matcher: "", hooks: [{ type: "command", command: "other-tool" }] },
              { matcher: "", hooks: [{ type: "command", command: "claude-a11y hooks format" }] },
            ],
            Notification: [
              { matcher: "", hooks: [{ type: "command", command: "claude-a11y hooks format" }] },
            ],
            PermissionRequest: [
              { matcher: "", hooks: [{ type: "command", command: "claude-a11y hooks format" }] },
            ],
          },
        },
        settingsPath,
      );
      const result = removeHooks(settingsPath);
      expect(result).toContain("Removed 3");
      const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
      expect(settings.hooks.PostToolUse).toHaveLength(1);
      expect(settings.hooks.PostToolUse[0].hooks[0].command).toBe("other-tool");
      expect(settings.hooks.Notification).toHaveLength(0);
      expect(settings.hooks.PermissionRequest).toHaveLength(0);
    });

    it("returns message when no a11y hooks found", () => {
      writeSettings(
        {
          hooks: {
            PostToolUse: [
              { matcher: "", hooks: [{ type: "command", command: "other-tool" }] },
            ],
          },
        },
        settingsPath,
      );
      const result = removeHooks(settingsPath);
      expect(result).toContain("No a11y hooks found");
    });
  });

  describe("isHooksInstalled", () => {
    it("returns false when no settings file", () => {
      expect(isHooksInstalled(settingsPath)).toBe(false);
    });

    it("returns true after install", () => {
      installHooks(settingsPath);
      expect(isHooksInstalled(settingsPath)).toBe(true);
    });

    it("returns false after uninstall", () => {
      installHooks(settingsPath);
      removeHooks(settingsPath);
      expect(isHooksInstalled(settingsPath)).toBe(false);
    });
  });
});
