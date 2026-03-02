import { describe, it, expect, vi, beforeEach } from "vitest";
import * as path from "node:path";

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  copyFileSync: vi.fn(),
  unlinkSync: vi.fn(),
}));

vi.mock("vscode", () => ({
  env: { appRoot: "/mock/app" },
  window: {
    showErrorMessage: vi.fn(),
    showInformationMessage: vi.fn(),
  },
}));

import * as fs from "node:fs";
import { isInstalled, install, uninstall } from "../../src/vscode/inject/patcher.js";

const mockFs = vi.mocked(fs);

const MARKER_START = "<!-- claude-a11y-start -->";
const MARKER_END = "<!-- claude-a11y-end -->";
const LEGACY_MARKER_START = "<!-- claude-accessible-start -->";
const LEGACY_MARKER_END = "<!-- claude-accessible-end -->";

const WORKBENCH_PATH = path.join(
  "/mock/app",
  "out",
  "vs",
  "code",
  "electron-sandbox",
  "workbench",
  "workbench.html"
);

describe("patcher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("isInstalled()", () => {
    it("returns false when workbench.html is not found", () => {
      mockFs.existsSync.mockReturnValue(false);
      expect(isInstalled()).toBe(false);
    });

    it("returns false when marker is not present", () => {
      mockFs.existsSync.mockImplementation((p: string) =>
        p === WORKBENCH_PATH
      );
      mockFs.readFileSync.mockReturnValue("<html></html>");
      expect(isInstalled()).toBe(false);
    });

    it("returns true when marker is present", () => {
      mockFs.existsSync.mockImplementation((p: string) =>
        p === WORKBENCH_PATH
      );
      mockFs.readFileSync.mockReturnValue(
        `<html>${MARKER_START}<script></script>${MARKER_END}</html>`
      );
      expect(isInstalled()).toBe(true);
    });

    it("returns true when legacy marker is present", () => {
      mockFs.existsSync.mockImplementation((p: string) =>
        p === WORKBENCH_PATH
      );
      mockFs.readFileSync.mockReturnValue(
        `<html>${LEGACY_MARKER_START}<script></script>${LEGACY_MARKER_END}</html>`
      );
      expect(isInstalled()).toBe(true);
    });
  });

  describe("install()", () => {
    const mockContext = {
      extensionPath: "/mock/extension",
      globalState: { get: vi.fn(), update: vi.fn() },
      subscriptions: [],
    } as unknown as import("vscode").ExtensionContext;

    it("returns false when workbench.html is not found", async () => {
      mockFs.existsSync.mockReturnValue(false);
      const result = await install(mockContext);
      expect(result).toBe(false);
    });

    it("returns false when chat-a11y.js is not in extension", async () => {
      mockFs.existsSync.mockImplementation((p: string) => {
        if (p === WORKBENCH_PATH) return true;
        return false;
      });
      const result = await install(mockContext);
      expect(result).toBe(false);
    });

    it("injects script tag and creates backup when both files exist", async () => {
      const scriptPath = path.join("/mock/extension", "media", "chat-a11y.js");
      const baseHtml = "<html><head></head><body></body></html>";

      mockFs.existsSync.mockImplementation((p: string) => {
        if (p === WORKBENCH_PATH) return true;
        if (p === scriptPath) return true;
        if (p === WORKBENCH_PATH + ".ca11y-backup") return false;
        return false;
      });
      mockFs.readFileSync.mockReturnValue(baseHtml);

      const result = await install(mockContext);
      expect(result).toBe(true);
      expect(mockFs.copyFileSync).toHaveBeenCalled();
      expect(mockFs.writeFileSync).toHaveBeenCalled();

      const writtenHtml = mockFs.writeFileSync.mock.calls[0][1] as string;
      expect(writtenHtml).toContain(MARKER_START);
      expect(writtenHtml).toContain("chat-a11y.js");
      expect(writtenHtml).toContain(MARKER_END);
    });

    it("strips legacy markers before injecting new ones", async () => {
      const scriptPath = path.join("/mock/extension", "media", "chat-a11y.js");
      const legacyHtml =
        `<html><head></head><body></body>\n` +
        `${LEGACY_MARKER_START}\n<script src="./chat-a11y.js"></script>\n${LEGACY_MARKER_END}\n` +
        `</html>`;

      mockFs.existsSync.mockImplementation((p: string) => {
        if (p === WORKBENCH_PATH) return true;
        if (p === scriptPath) return true;
        if (p === WORKBENCH_PATH + ".ca11y-backup") return false;
        return false;
      });
      mockFs.readFileSync.mockReturnValue(legacyHtml);

      const result = await install(mockContext);
      expect(result).toBe(true);

      const writtenHtml = mockFs.writeFileSync.mock.calls[0][1] as string;
      expect(writtenHtml).toContain(MARKER_START);
      expect(writtenHtml).toContain(MARKER_END);
      expect(writtenHtml).not.toContain(LEGACY_MARKER_START);
      expect(writtenHtml).not.toContain(LEGACY_MARKER_END);
    });
  });

  describe("uninstall()", () => {
    it("restores from backup when backup exists", async () => {
      mockFs.existsSync.mockImplementation((p: string) => {
        if (p === WORKBENCH_PATH) return true;
        if (p === WORKBENCH_PATH + ".ca11y-backup") return true;
        return false;
      });

      const result = await uninstall();
      expect(result).toBe(true);
      expect(mockFs.copyFileSync).toHaveBeenCalledWith(
        WORKBENCH_PATH + ".ca11y-backup",
        WORKBENCH_PATH
      );
      expect(mockFs.unlinkSync).toHaveBeenCalledWith(
        WORKBENCH_PATH + ".ca11y-backup"
      );
    });

    it("removes markers when no backup exists", async () => {
      const htmlWithMarkers = `<html>${MARKER_START}\n<script></script>\n${MARKER_END}</html>`;

      mockFs.existsSync.mockImplementation((p: string) => {
        if (p === WORKBENCH_PATH) return true;
        return false;
      });
      mockFs.readFileSync.mockReturnValue(htmlWithMarkers);

      const result = await uninstall();
      expect(result).toBe(true);

      const writtenHtml = mockFs.writeFileSync.mock.calls[0][1] as string;
      expect(writtenHtml).not.toContain(MARKER_START);
      expect(writtenHtml).not.toContain(MARKER_END);
    });

    it("removes legacy markers when no backup exists", async () => {
      const htmlWithLegacy =
        `<html>${LEGACY_MARKER_START}\n<script></script>\n${LEGACY_MARKER_END}</html>`;

      mockFs.existsSync.mockImplementation((p: string) => {
        if (p === WORKBENCH_PATH) return true;
        return false;
      });
      mockFs.readFileSync.mockReturnValue(htmlWithLegacy);

      const result = await uninstall();
      expect(result).toBe(true);

      const writtenHtml = mockFs.writeFileSync.mock.calls[0][1] as string;
      expect(writtenHtml).not.toContain(LEGACY_MARKER_START);
      expect(writtenHtml).not.toContain(LEGACY_MARKER_END);
    });

    it("returns false when workbench.html is not found", async () => {
      mockFs.existsSync.mockReturnValue(false);
      const result = await uninstall();
      expect(result).toBe(false);
    });
  });
});
