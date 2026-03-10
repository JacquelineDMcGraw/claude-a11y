import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TtsConfig } from "../../../src/hooks/config/types.js";

// Mock child_process before importing
vi.mock("node:child_process", () => ({
  spawn: vi.fn(() => ({ unref: vi.fn() })),
  execFileSync: vi.fn(),
}));

import { speak } from "../../../src/hooks/tts/index.js";
import { wpmToSpdRate } from "../../../src/hooks/tts/linux.js";
import { spawn } from "node:child_process";

const defaultTtsConfig: TtsConfig = {
  enabled: true,
  engine: "say",
  rate: 200,
  maxLength: 500,
};

describe("speak", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does nothing when disabled", () => {
    speak("hello", { ...defaultTtsConfig, enabled: false });
    expect(spawn).not.toHaveBeenCalled();
  });

  it("does nothing for empty text", () => {
    speak("", defaultTtsConfig);
    expect(spawn).not.toHaveBeenCalled();
  });

  it("calls say on macOS engine", () => {
    speak("test message", { ...defaultTtsConfig, engine: "say" });
    expect(spawn).toHaveBeenCalledWith(
      "say",
      ["-r", "200", "--", "test message"],
      expect.objectContaining({ detached: true }),
    );
  });

  it("truncates long text", () => {
    const longText = "a".repeat(1000);
    speak(longText, { ...defaultTtsConfig, maxLength: 50 });
    const callArgs = vi.mocked(spawn).mock.calls[0];
    expect(callArgs).toBeDefined();
    // The text argument (after --)
    const textArg = callArgs![1]![3];
    expect(textArg!.length).toBe(50);
  });

  it("strips control characters", () => {
    speak("hello\x00world\x07test", defaultTtsConfig);
    const callArgs = vi.mocked(spawn).mock.calls[0];
    const textArg = callArgs![1]![3];
    expect(textArg).toBe("helloworldtest");
  });

  it("uses -- flag terminator for argument injection prevention", () => {
    speak("--version", defaultTtsConfig);
    const callArgs = vi.mocked(spawn).mock.calls[0];
    // Verify "--" comes before the text
    expect(callArgs![1]![2]).toBe("--");
    expect(callArgs![1]![3]).toBe("--version");
  });
});

describe("wpmToSpdRate", () => {
  it("converts 170 WPM (baseline) to 0 percent", () => {
    expect(wpmToSpdRate(170)).toBe(0);
  });

  it("converts default 200 WPM to a small positive percentage", () => {
    const result = wpmToSpdRate(200);
    expect(result).toBe(18);
    expect(result).toBeGreaterThanOrEqual(-100);
    expect(result).toBeLessThanOrEqual(100);
  });

  it("converts slow speech (85 WPM) to -50 percent", () => {
    expect(wpmToSpdRate(85)).toBe(-50);
  });

  it("converts 340 WPM (double baseline) to 100 percent", () => {
    expect(wpmToSpdRate(340)).toBe(100);
  });

  it("clamps extremely high WPM to 100", () => {
    expect(wpmToSpdRate(1000)).toBe(100);
  });

  it("clamps extremely low WPM to -100", () => {
    expect(wpmToSpdRate(0)).toBe(-100);
  });
});

describe("speak with spd-say engine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("converts WPM rate to spd-say percentage", () => {
    speak("hello", { ...defaultTtsConfig, engine: "spd-say", rate: 200 });
    expect(spawn).toHaveBeenCalledWith(
      "spd-say",
      ["-r", "18", "--", "hello"],
      expect.objectContaining({ detached: true }),
    );
  });

  it("converts high WPM rate for spd-say", () => {
    speak("hello", { ...defaultTtsConfig, engine: "spd-say", rate: 340 });
    expect(spawn).toHaveBeenCalledWith(
      "spd-say",
      ["-r", "100", "--", "hello"],
      expect.objectContaining({ detached: true }),
    );
  });

  it("converts baseline WPM to 0 for spd-say", () => {
    speak("hello", { ...defaultTtsConfig, engine: "spd-say", rate: 170 });
    expect(spawn).toHaveBeenCalledWith(
      "spd-say",
      ["-r", "0", "--", "hello"],
      expect.objectContaining({ detached: true }),
    );
  });
});
