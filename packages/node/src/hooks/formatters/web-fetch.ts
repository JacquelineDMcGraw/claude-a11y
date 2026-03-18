import type { Formatter, PostToolUseInput } from "./types.js";

/**
 * Strip query strings, fragments, and auth info from a URL.
 * Keeps only origin + pathname to avoid leaking tokens/credentials.
 */
function redactUrl(raw: string): string {
  try {
    const parsed = new URL(raw);
    return parsed.origin + parsed.pathname;
  } catch {
    return raw.slice(0, 120);
  }
}

export const webFetchFormatter: Formatter = {
  id: "web-fetch",
  toolNames: ["WebFetch"],
  format(input: PostToolUseInput) {
    const url = String(input.tool_input["url"] || "unknown URL");
    const safeUrl = redactUrl(url);

    let shortUrl: string;
    try {
      const parsed = new URL(url);
      shortUrl = parsed.hostname + parsed.pathname.slice(0, 30);
      if (parsed.pathname.length > 30) shortUrl += "...";
    } catch {
      shortUrl = safeUrl.slice(0, 50);
    }

    const contextText = `Fetched ${safeUrl}`;
    const ttsText = `Fetched ${shortUrl}.`;

    return { contextText, ttsText };
  },
};
