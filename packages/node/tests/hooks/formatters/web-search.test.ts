import { describe, it, expect } from "vitest";
import { webSearchFormatter } from "../../../src/hooks/formatters/web-search.js";
import fixture from "../fixtures/hook-inputs/web-search.json";

describe("webSearchFormatter", () => {
  it("formats web search", () => {
    const result = webSearchFormatter.format(fixture);
    expect(result.contextText).toContain("vitest coverage setup");
    expect(result.ttsText).toContain("vitest coverage setup");
  });
});
