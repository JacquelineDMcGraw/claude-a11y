import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("vscode", () => ({
  workspace: {
    getConfiguration: vi.fn(),
    onDidChangeConfiguration: vi.fn(() => ({ dispose: vi.fn() })),
  },
}));

import * as vscode from "vscode";
import {
  isScreenReaderActive,
  getDetectedScreenReader,
  onScreenReaderStateChanged,
} from "../../src/vscode/screen-reader-detect.js";

const mockGetConfig = vi.mocked(vscode.workspace.getConfiguration);

function setAccessibilitySetting(value: string) {
  mockGetConfig.mockReturnValue({
    get: vi.fn((_key: string, fallback: string) => value ?? fallback),
  } as unknown as vscode.WorkspaceConfiguration);
}

describe("isScreenReaderActive()", () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    for (const key of ["NVDA_LOG", "NVDA", "JAWS_TRACE", "JAWS_HOME", "ORCA_VERSION", "GTK_MODULES", "ACCESSIBILITY_ENABLED", "QT_ACCESSIBILITY", "QT_LINUX_ACCESSIBILITY_ALWAYS_ON"]) {
      delete process.env[key];
    }
  });

  afterEach(() => {
    process.env = { ...origEnv };
  });

  it("returns true when accessibilitySupport is on", () => {
    setAccessibilitySetting("on");
    expect(isScreenReaderActive()).toBe(true);
  });

  it("returns false when accessibilitySupport is off", () => {
    setAccessibilitySetting("off");
    expect(isScreenReaderActive()).toBe(false);
  });

  it("returns true in auto mode with NVDA env var", () => {
    setAccessibilitySetting("auto");
    process.env.NVDA_LOG = "/some/path";
    expect(isScreenReaderActive()).toBe(true);
  });

  it("returns true in auto mode with JAWS env var", () => {
    setAccessibilitySetting("auto");
    process.env.JAWS_TRACE = "1";
    expect(isScreenReaderActive()).toBe(true);
  });

  it("returns true in auto mode with Orca GTK_MODULES", () => {
    setAccessibilitySetting("auto");
    process.env.GTK_MODULES = "gail:atk-bridge";
    expect(isScreenReaderActive()).toBe(true);
  });

  it("returns false in auto mode with no env hints (opt-in for sighted users)", () => {
    setAccessibilitySetting("auto");
    expect(isScreenReaderActive()).toBe(false);
  });
});

describe("getDetectedScreenReader()", () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    for (const key of ["NVDA_LOG", "NVDA", "JAWS_TRACE", "JAWS_HOME", "ORCA_VERSION", "GTK_MODULES"]) {
      delete process.env[key];
    }
  });

  afterEach(() => {
    process.env = { ...origEnv };
  });

  it("detects JAWS from JAWS_TRACE", () => {
    process.env.JAWS_TRACE = "1";
    expect(getDetectedScreenReader()).toBe("JAWS");
  });

  it("detects JAWS from JAWS_HOME", () => {
    process.env.JAWS_HOME = "C:\\Program Files\\JAWS";
    expect(getDetectedScreenReader()).toBe("JAWS");
  });

  it("detects NVDA from NVDA_LOG", () => {
    process.env.NVDA_LOG = "/tmp/nvda.log";
    expect(getDetectedScreenReader()).toBe("NVDA");
  });

  it("detects Orca from ORCA_VERSION", () => {
    process.env.ORCA_VERSION = "45.0";
    expect(getDetectedScreenReader()).toBe("Orca");
  });

  it("detects Orca from GTK_MODULES with atk-bridge", () => {
    process.env.GTK_MODULES = "gail:atk-bridge";
    expect(getDetectedScreenReader()).toBe("Orca");
  });

  it("returns null when no screen reader env vars present", () => {
    expect(getDetectedScreenReader()).toBeNull();
  });
});

describe("onScreenReaderStateChanged()", () => {
  it("registers a configuration change listener", () => {
    const callback = vi.fn();
    const disposable = onScreenReaderStateChanged(callback);
    expect(vscode.workspace.onDidChangeConfiguration).toHaveBeenCalled();
    expect(disposable).toBeDefined();
  });
});
