import { describe, it, expect } from "vitest";
import { buildHookOutput } from "../../../src/hooks/output/index.js";
import type { FormattedOutput } from "../../../src/hooks/formatters/types.js";

const sample: FormattedOutput = {
  contextText: "Ran: ls -la\nExit code: 0\nOutput: 3 lines",
  ttsText: "Ran ls, success, 3 lines of output.",
};

describe("buildHookOutput", () => {
  it("wraps output in hookSpecificOutput", () => {
    const result = buildHookOutput(sample, "normal", "PostToolUse");
    expect(result.hookSpecificOutput).toBeDefined();
    expect(result.hookSpecificOutput!.hookEventName).toBe("PostToolUse");
  });

  it("minimal: only ttsText in additionalContext", () => {
    const result = buildHookOutput(sample, "minimal", "PostToolUse");
    expect(result.hookSpecificOutput!.additionalContext).toBe(sample.ttsText);
  });

  it("normal: ttsText + contextText", () => {
    const result = buildHookOutput(sample, "normal", "PostToolUse");
    expect(result.hookSpecificOutput!.additionalContext).toContain(sample.ttsText);
    expect(result.hookSpecificOutput!.additionalContext).toContain(sample.contextText);
    expect(result.hookSpecificOutput!.additionalContext).not.toContain("---");
  });

  it("full: ttsText + separator + contextText", () => {
    const result = buildHookOutput(sample, "full", "PostToolUse");
    expect(result.hookSpecificOutput!.additionalContext).toContain(sample.ttsText);
    expect(result.hookSpecificOutput!.additionalContext).toContain("---");
    expect(result.hookSpecificOutput!.additionalContext).toContain(sample.contextText);
  });

  it("defaults eventName to PostToolUse", () => {
    const result = buildHookOutput(sample, "normal");
    expect(result.hookSpecificOutput!.hookEventName).toBe("PostToolUse");
  });

  it("includes decision when provided", () => {
    const result = buildHookOutput(sample, "normal", "PermissionRequest", {
      behavior: "allow",
      message: "auto-approved",
    });
    expect(result.hookSpecificOutput!.decision).toEqual({
      behavior: "allow",
      message: "auto-approved",
    });
  });

  it("omits decision when not provided", () => {
    const result = buildHookOutput(sample, "normal", "PostToolUse");
    expect(result.hookSpecificOutput!.decision).toBeUndefined();
  });

  it("works with options object overload", () => {
    const result = buildHookOutput({
      formatted: sample,
      verbosity: "normal",
      eventName: "Notification",
    });
    expect(result.hookSpecificOutput!.hookEventName).toBe("Notification");
    expect(result.hookSpecificOutput!.additionalContext).toContain(sample.ttsText);
  });

  it("handles empty formatted output", () => {
    const empty: FormattedOutput = { contextText: "", ttsText: "" };
    const result = buildHookOutput(empty, "normal", "PostToolUse");
    expect(result.hookSpecificOutput!.additionalContext).toBeUndefined();
  });
});

describe("compact verbosity mode", () => {
  it("suppresses noise-level events entirely", () => {
    const result = buildHookOutput({
      formatted: sample,
      verbosity: "compact",
      eventName: "PostToolUse",
      significanceLevel: "noise",
    });
    expect(result.hookSpecificOutput!.additionalContext).toBeUndefined();
  });

  it("suppresses routine-level events entirely", () => {
    const result = buildHookOutput({
      formatted: sample,
      verbosity: "compact",
      eventName: "PostToolUse",
      significanceLevel: "routine",
    });
    expect(result.hookSpecificOutput!.additionalContext).toBeUndefined();
  });

  it("shows ttsText only for notable-level events", () => {
    const result = buildHookOutput({
      formatted: sample,
      verbosity: "compact",
      eventName: "PostToolUse",
      significanceLevel: "notable",
    });
    expect(result.hookSpecificOutput!.additionalContext).toBe(sample.ttsText);
  });

  it("shows ttsText only for important-level events", () => {
    const result = buildHookOutput({
      formatted: sample,
      verbosity: "compact",
      eventName: "PostToolUse",
      significanceLevel: "important",
    });
    expect(result.hookSpecificOutput!.additionalContext).toBe(sample.ttsText);
  });

  it("shows ttsText when no significance level provided", () => {
    const result = buildHookOutput({
      formatted: sample,
      verbosity: "compact",
      eventName: "PostToolUse",
    });
    // No significance level = not classified as noise/routine, so show ttsText
    expect(result.hookSpecificOutput!.additionalContext).toBe(sample.ttsText);
  });
});
