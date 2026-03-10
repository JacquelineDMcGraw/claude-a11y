import { describe, it, expect } from "vitest";
import { applySignificance } from "../../../src/hooks/core/apply-significance.js";
import type { FormattedOutput } from "../../../src/hooks/formatters/types.js";
import type { SignificanceResult } from "../../../src/hooks/core/significance.js";

const formatted: FormattedOutput = {
  contextText: "Read /src/app.ts (42 lines) [TypeScript]. Contains: 3 imports, 2 functions",
  ttsText: "Read app.ts, 42 lines.",
};

describe("applySignificance", () => {
  it("silences ttsText for noise", () => {
    const sig: SignificanceResult = { level: "noise", reason: "file read" };
    const result = applySignificance(formatted, sig);
    expect(result.ttsText).toBe("");
  });

  it("shortens contextText for noise", () => {
    const sig: SignificanceResult = { level: "noise", reason: "file read" };
    const result = applySignificance(formatted, sig);
    // Should keep first line only
    expect(result.contextText).not.toContain("\n");
  });

  it("truncates long contextText for noise", () => {
    const longFormatted: FormattedOutput = {
      contextText: "A".repeat(200),
      ttsText: "Long text.",
    };
    const sig: SignificanceResult = { level: "noise", reason: "long" };
    const result = applySignificance(longFormatted, sig);
    expect(result.contextText.length).toBeLessThanOrEqual(120);
    expect(result.contextText).toContain("...");
  });

  it("handles empty contextText for noise", () => {
    const empty: FormattedOutput = { contextText: "", ttsText: "x" };
    const sig: SignificanceResult = { level: "noise", reason: "empty" };
    const result = applySignificance(empty, sig);
    expect(result.contextText).toBe("");
    expect(result.ttsText).toBe("");
  });

  it("keeps ttsText as-is for routine", () => {
    const sig: SignificanceResult = { level: "routine", reason: "tests passed" };
    const result = applySignificance(formatted, sig);
    expect(result.ttsText).toBe(formatted.ttsText);
    expect(result.contextText).toBe(formatted.contextText);
  });

  it("keeps ttsText as-is for notable", () => {
    const sig: SignificanceResult = { level: "notable", reason: "code edit" };
    const result = applySignificance(formatted, sig);
    expect(result.ttsText).toBe(formatted.ttsText);
    expect(result.contextText).toBe(formatted.contextText);
  });

  it("prefixes ttsText with Important: for important", () => {
    const sig: SignificanceResult = { level: "important", reason: "test failure" };
    const result = applySignificance(formatted, sig);
    expect(result.ttsText).toBe("Important: Read app.ts, 42 lines.");
    expect(result.contextText).toBe(formatted.contextText);
  });

  it("handles empty ttsText for important", () => {
    const empty: FormattedOutput = { contextText: "some context", ttsText: "" };
    const sig: SignificanceResult = { level: "important", reason: "test failure" };
    const result = applySignificance(empty, sig);
    expect(result.ttsText).toBe("");
  });

  it("does not mutate original formatted output", () => {
    const original: FormattedOutput = { contextText: "ctx", ttsText: "tts" };
    const sig: SignificanceResult = { level: "noise", reason: "test" };
    applySignificance(original, sig);
    expect(original.ttsText).toBe("tts");
    expect(original.contextText).toBe("ctx");
  });

  it("preserves extra properties on formatted output for important", () => {
    const extended = { contextText: "ctx", ttsText: "tts", extra: "value" } as FormattedOutput & { extra: string };
    const sig: SignificanceResult = { level: "important", reason: "test failure" };
    const result = applySignificance(extended, sig) as FormattedOutput & { extra?: string };
    expect(result.extra).toBe("value");
    expect(result.ttsText).toBe("Important: tts");
  });

  it("handles multiline contextText for noise (keeps first line)", () => {
    const multi: FormattedOutput = {
      contextText: "First line summary\nSecond line details\nThird line",
      ttsText: "First line.",
    };
    const sig: SignificanceResult = { level: "noise", reason: "test" };
    const result = applySignificance(multi, sig);
    expect(result.contextText).toBe("First line summary");
  });
});
