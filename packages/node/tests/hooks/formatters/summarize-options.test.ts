import { describe, it, expect, beforeEach } from "vitest";
import { setSummarizeOptions, getSummarizeOptions } from "../../../src/hooks/formatters/summarize-options.js";

describe("summarize-options", () => {
  beforeEach(() => {
    // Reset to defaults
    setSummarizeOptions({ enabled: false, maxDeclarations: 20, maxTtsNames: 3 });
  });

  it("returns defaults initially", () => {
    const opts = getSummarizeOptions();
    expect(opts.enabled).toBe(false);
    expect(opts.maxDeclarations).toBe(20);
    expect(opts.maxTtsNames).toBe(3);
  });

  it("reflects set values", () => {
    setSummarizeOptions({ enabled: true, maxDeclarations: 10, maxTtsNames: 5 });
    const opts = getSummarizeOptions();
    expect(opts.enabled).toBe(true);
    expect(opts.maxDeclarations).toBe(10);
    expect(opts.maxTtsNames).toBe(5);
  });

  it("returns a read-only copy", () => {
    setSummarizeOptions({ enabled: true, maxDeclarations: 20, maxTtsNames: 3 });
    const opts = getSummarizeOptions();
    // Verify it's a different reference each set
    setSummarizeOptions({ enabled: false, maxDeclarations: 20, maxTtsNames: 3 });
    const opts2 = getSummarizeOptions();
    expect(opts.enabled).toBe(true); // original unchanged
    expect(opts2.enabled).toBe(false);
  });
});
