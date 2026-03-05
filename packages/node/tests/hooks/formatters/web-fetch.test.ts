import { describe, it, expect } from "vitest";
import { webFetchFormatter } from "../../../src/hooks/formatters/web-fetch.js";
import fixture from "../fixtures/hook-inputs/web-fetch.json";

describe("webFetchFormatter", () => {
  it("formats web fetch", () => {
    const result = webFetchFormatter.format(fixture);
    expect(result.contextText).toContain("https://example.com/api/docs");
    expect(result.ttsText).toContain("example.com");
  });

  it("handles invalid URL gracefully", () => {
    const input = {
      tool_name: "WebFetch",
      tool_input: { url: "not-a-url" },
      tool_response: {},
    };
    const result = webFetchFormatter.format(input);
    expect(result.ttsText).toContain("not-a-url");
  });
});
