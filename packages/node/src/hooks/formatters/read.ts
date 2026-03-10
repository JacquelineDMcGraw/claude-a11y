import type { Formatter, PostToolUseInput } from "./types.js";
import { getSummarizeOptions } from "./summarize-options.js";
import { summarizeCode, formatCodeSummary, LANGUAGE_MAP } from "../core/code-summarizer.js";
import { basename } from "./utils.js";

interface ContentAnalysis {
  imports: number;
  exports: number;
  classes: number;
  interfaces: number;
  functions: number;
  language: string | null;
}

function getExtension(filePath: string): string {
  const dotIdx = filePath.lastIndexOf(".");
  if (dotIdx === -1) return "";
  return filePath.slice(dotIdx).toLowerCase();
}

function detectLanguageLocal(filePath: string): string | null {
  const ext = getExtension(filePath);
  return LANGUAGE_MAP[ext] || null;
}

function analyzeContent(content: string, filePath: string): ContentAnalysis {
  const language = detectLanguageLocal(filePath);
  const lines = content.split("\n");

  let imports = 0;
  let exports = 0;
  let classes = 0;
  let interfaces = 0;
  let functions = 0;

  for (const line of lines) {
    const trimmed = line.trimStart();

    // Import detection (works for TS/JS/Python/Rust/Go/Java)
    if (
      trimmed.startsWith("import ") ||
      trimmed.startsWith("from ") ||
      trimmed.startsWith("use ") ||
      trimmed.startsWith("require(")
    ) {
      imports++;
    }

    // Export detection (TS/JS/Rust)
    if (trimmed.startsWith("export ") || trimmed.startsWith("pub ")) {
      exports++;
    }

    // Class detection
    if (/^(export\s+)?(abstract\s+)?class\s+\w/.test(trimmed)) {
      classes++;
    }

    // Interface detection (TS/Java/Go)
    if (/^(export\s+)?interface\s+\w/.test(trimmed)) {
      interfaces++;
    }

    // Function detection
    if (
      /^(export\s+)?(async\s+)?function\s+\w/.test(trimmed) ||
      /^def\s+\w/.test(trimmed) ||
      /^(pub\s+)?fn\s+\w/.test(trimmed) ||
      /^func\s+\w/.test(trimmed)
    ) {
      functions++;
    }
  }

  return { imports, exports, classes, interfaces, functions, language };
}

export const readFormatter: Formatter = {
  id: "read",
  toolNames: ["Read"],
  format(input: PostToolUseInput) {
    const filePath = String(input.tool_input["file_path"] || "unknown file");
    const content = String(input.tool_response["content"] || input.tool_response["output"] || "");
    const lineCount = content ? content.split("\n").filter(Boolean).length : 0;

    const analysis = analyzeContent(content, filePath);
    const langSuffix = analysis.language ? ` [${analysis.language}]` : "";
    const lineInfo = `(${lineCount} line${lineCount !== 1 ? "s" : ""})`;
    const baseTts = `Read ${basename(filePath)}, ${lineCount} line${lineCount !== 1 ? "s" : ""}.`;

    // Try code summarization if enabled
    const summarizeOpts = getSummarizeOptions();
    if (summarizeOpts.enabled && content) {
      const summary = summarizeCode(content, filePath);
      if (summary.declarations.length > 0) {
        const formatted = formatCodeSummary(summary, {
          maxDeclarations: summarizeOpts.maxDeclarations,
          maxTtsNames: summarizeOpts.maxTtsNames,
        });
        return {
          contextText: `Read ${filePath} ${lineInfo}${langSuffix}. ${formatted.contextText}`,
          ttsText: `${baseTts} ${formatted.ttsText}`,
        };
      }
    }

    // Fallback: counts-based analysis
    const containsParts: string[] = [];
    if (analysis.imports > 0) containsParts.push(`${analysis.imports} import${analysis.imports !== 1 ? "s" : ""}`);
    if (analysis.exports > 0) containsParts.push(`${analysis.exports} export${analysis.exports !== 1 ? "s" : ""}`);
    if (analysis.classes > 0) containsParts.push(`${analysis.classes} class${analysis.classes !== 1 ? "es" : ""}`);
    if (analysis.interfaces > 0) containsParts.push(`${analysis.interfaces} interface${analysis.interfaces !== 1 ? "s" : ""}`);
    if (analysis.functions > 0) containsParts.push(`${analysis.functions} function${analysis.functions !== 1 ? "s" : ""}`);

    const containsSuffix = containsParts.length > 0 ? `. Contains: ${containsParts.join(", ")}` : "";

    const contextText = `Read ${filePath} ${lineInfo}${langSuffix}${containsSuffix}`;
    const ttsText = baseTts;

    return { contextText, ttsText };
  },
};
