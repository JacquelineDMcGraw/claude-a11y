import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { EarconConfig } from "../../../src/hooks/config/types.js";

// Mock child_process.spawn before importing modules
vi.mock("node:child_process", () => ({
  spawn: vi.fn(() => ({
    unref: vi.fn(),
  })),
}));

import { playEarcon } from "../../../src/hooks/earcon/index.js";
import { spawn } from "node:child_process";

function earconConfig(overrides: Partial<EarconConfig> = {}): EarconConfig {
  return {
    enabled: true,
    engine: "auto",
    volume: 0.5,
    overrides: {},
    ...overrides,
  };
}

describe("playEarcon", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does nothing when disabled", () => {
    playEarcon("done", earconConfig({ enabled: false }));
    expect(spawn).not.toHaveBeenCalled();
  });

  it("does nothing for unknown earcon ID", () => {
    playEarcon("nonexistent-id", earconConfig());
    expect(spawn).not.toHaveBeenCalled();
  });

  it("does nothing when earcon is overridden with false", () => {
    playEarcon("done", earconConfig({ overrides: { done: false } }));
    expect(spawn).not.toHaveBeenCalled();
  });

  it("plays macOS system sound on darwin", () => {
    // Force macOS engine
    playEarcon("done", earconConfig({ engine: "afplay" }));
    expect(spawn).toHaveBeenCalledWith(
      "afplay",
      ["-v", "0.5", "--", "/System/Library/Sounds/Hero.aiff"],
      expect.objectContaining({ detached: true, stdio: "ignore" }),
    );
  });

  it("plays Linux sound with canberra-gtk-play", () => {
    playEarcon("done", earconConfig({ engine: "canberra-gtk-play" }));
    expect(spawn).toHaveBeenCalledWith(
      "canberra-gtk-play",
      ["-i", "bell", "--volume", "-6"],
      expect.objectContaining({ detached: true, stdio: "ignore" }),
    );
  });

  it("uses custom override path on macOS", () => {
    playEarcon(
      "test-pass",
      earconConfig({
        engine: "afplay",
        overrides: { "test-pass": "/custom/chime.wav" },
      }),
    );
    expect(spawn).toHaveBeenCalledWith(
      "afplay",
      ["-v", "0.5", "--", "/custom/chime.wav"],
      expect.objectContaining({ detached: true }),
    );
  });

  it("respects volume setting", () => {
    playEarcon("error", earconConfig({ engine: "afplay", volume: 0.8 }));
    expect(spawn).toHaveBeenCalledWith(
      "afplay",
      ["-v", "0.8", "--", "/System/Library/Sounds/Sosumi.aiff"],
      expect.any(Object),
    );
  });

  it("survives spawn error without throwing", () => {
    vi.mocked(spawn).mockImplementation(() => {
      throw new Error("command not found");
    });
    expect(() => playEarcon("done", earconConfig({ engine: "afplay" }))).not.toThrow();
  });
});
