import type { Formatter, PostToolUseInput } from "./types.js";

export const webFetchFormatter: Formatter = {
  id: "web-fetch",
  toolNames: ["WebFetch"],
  format(input: PostToolUseInput) {
    const url = String(input.tool_input["url"] || "unknown URL");

    // Truncate URL for TTS
    let shortUrl: string;
    try {
      const parsed = new URL(url);
      shortUrl = parsed.hostname + parsed.pathname.slice(0, 30);
      if (parsed.pathname.length > 30) shortUrl += "...";
    } catch {
      shortUrl = url.slice(0, 50);
    }

    const contextText = `Fetched ${url}`;
    const ttsText = `Fetched ${shortUrl}.`;

    return { contextText, ttsText };
  },
};
