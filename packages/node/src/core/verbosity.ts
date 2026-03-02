/**
 * Verbosity levels for speech formatting.
 *
 * Wraps formatForSpeech() with configurable detail levels:
 * - minimal:  Code blocks + headings only. Strips all other annotations.
 * - normal:   Default. Everything formatForSpeech() produces.
 * - detailed: Adds line counts for code blocks, richer descriptions.
 */

import { formatForSpeech } from "./speech-formatter.js";

export type VerbosityLevel = "minimal" | "normal" | "detailed";

interface VerbosityFilter {
  format(text: string): string;
}

/**
 * Create a verbosity filter that wraps formatForSpeech().
 */
export function createVerbosityFilter(level: VerbosityLevel): VerbosityFilter {
  return {
    format(text: string): string {
      const speechText = formatForSpeech(text);

      switch (level) {
        case "minimal":
          return stripToMinimal(speechText);
        case "normal":
          return speechText;
        case "detailed":
          return enrichDetailed(speechText, text);
      }
    },
  };
}

// --- Minimal: keep only code block and heading markers ---

const MINIMAL_KEEP_RE =
  /^\[(Python|Javascript|Typescript|Bash|Code|Json|Css|Html|Rust|Go|Java|Ruby|C|Cpp|Shell|Sql|Yaml|Toml|Xml|Markdown|Diff|Plaintext|[A-Z][a-z]+)\]$|^\[End [A-Z].*\]$|^\[(Heading|Subheading)\] /;

function stripToMinimal(speechText: string): string {
  return speechText
    .split("\n")
    .map((line) => {
      // Always keep code block markers and headings
      if (MINIMAL_KEEP_RE.test(line)) return line;
      // Strip other markers: [Quote], [Separator], [Image:...], Bullet:, [Table...], [Row...], [End Table]
      return line
        .replace(/^\[Quote\]\s*/, "")
        .replace(/^\[Separator\]$/, "---")
        .replace(/^\[Table.*\]$/, "")
        .replace(/^\[Header\]\s*/, "")
        .replace(/^\[Row \d+\]\s*/, "")
        .replace(/^\[End Table\]$/, "")
        .replace(/^Bullet:\s*/, "- ")
        .replace(/\s*\(link: [^)]+\)/, "");
    })
    .filter((line) => line.trim().length > 0 || line === "")
    .join("\n");
}

// --- Detailed: add line counts, character counts, richer descriptions ---

function enrichDetailed(speechText: string, originalText: string): string {
  const lines = speechText.split("\n");
  const result: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    // Enrich code block openings with line counts
    const codeMatch = line.match(/^\[([A-Z][a-z]*(?:\w*)?)\]$/);
    if (codeMatch) {
      // Count lines until [End ...]
      const lang = codeMatch[1];
      const endMarker = `[End ${lang}]`;
      let codeLines = 0;
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j] === endMarker) break;
        codeLines++;
      }
      result.push(`[${lang}, ${codeLines} line${codeLines !== 1 ? "s" : ""}]`);
      continue;
    }

    // Enrich table headers with row counts
    const tableMatch = line.match(/^\[Table, (\d+) columns\]$/);
    if (tableMatch) {
      let rowCount = 0;
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j] === "[End Table]") break;
        if (lines[j]?.startsWith("[Row ")) rowCount++;
      }
      result.push(
        `[Table, ${tableMatch[1]} columns, ${rowCount} row${rowCount !== 1 ? "s" : ""}]`
      );
      continue;
    }

    result.push(line);
  }

  return result.join("\n");
}
