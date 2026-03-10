/**
 * Semantic diff analysis for Edit operations.
 * Detects renames, insertions, deletions, replacements.
 */

import { summarizeCode, formatDeclaration, type Declaration } from "../core/code-summarizer.js";
import { getSummarizeOptions } from "./summarize-options.js";

export type EditOperation =
  | { type: "rename"; from: string; to: string }
  | { type: "insert"; lineCount: number }
  | { type: "delete"; lineCount: number }
  | { type: "replace"; oldLineCount: number; newLineCount: number }
  | { type: "replace_all"; oldLineCount: number; newLineCount: number }
  | { type: "identical" }
  | { type: "whitespace_only" };

export interface EditAnalysis {
  operation: EditOperation;
  summary: string;
  ttsSummary: string;
}

/**
 * Analyze an edit operation semantically.
 */
export function analyzeEdit(
  oldStr: string,
  newStr: string,
  _filePath: string,
  replaceAll: boolean,
): EditAnalysis {
  // Identical strings
  if (oldStr === newStr) {
    return {
      operation: { type: "identical" },
      summary: "No change (old and new strings are identical)",
      ttsSummary: "No change.",
    };
  }

  // Whitespace-only change
  if (oldStr.trim() === newStr.trim()) {
    return {
      operation: { type: "whitespace_only" },
      summary: "Whitespace-only change",
      ttsSummary: "Whitespace change.",
    };
  }

  const oldLines = oldStr.split("\n");
  const newLines = newStr.split("\n");

  // Pure insertion (old is empty or old is substring prefix/suffix)
  if (oldStr === "") {
    return {
      operation: { type: "insert", lineCount: newLines.length },
      summary: `Inserted ${newLines.length} line${newLines.length !== 1 ? "s" : ""}`,
      ttsSummary: `Inserted ${newLines.length} line${newLines.length !== 1 ? "s" : ""}.`,
    };
  }

  // Pure deletion (new is empty)
  if (newStr === "") {
    return {
      operation: { type: "delete", lineCount: oldLines.length },
      summary: `Deleted ${oldLines.length} line${oldLines.length !== 1 ? "s" : ""}`,
      ttsSummary: `Deleted ${oldLines.length} line${oldLines.length !== 1 ? "s" : ""}.`,
    };
  }

  // Replace all
  if (replaceAll) {
    return {
      operation: { type: "replace_all", oldLineCount: oldLines.length, newLineCount: newLines.length },
      summary: `Replaced all occurrences (${oldLines.length} → ${newLines.length} lines each)`,
      ttsSummary: `Replaced all occurrences.`,
    };
  }

  // Rename detection: if same number of lines and exactly one identifier token differs per line
  const rename = detectRename(oldLines, newLines);
  if (rename) {
    return {
      operation: { type: "rename", from: rename.from, to: rename.to },
      summary: `Renamed ${rename.from} to ${rename.to}`,
      ttsSummary: `Renamed ${rename.from} to ${rename.to}.`,
    };
  }

  // General replacement
  const diff = newLines.length - oldLines.length;
  const diffStr = diff > 0 ? `+${diff}` : String(diff);

  return {
    operation: { type: "replace", oldLineCount: oldLines.length, newLineCount: newLines.length },
    summary: `Replaced ${oldLines.length} line${oldLines.length !== 1 ? "s" : ""} with ${newLines.length} line${newLines.length !== 1 ? "s" : ""} (${diffStr} net)`,
    ttsSummary: `Replaced ${oldLines.length} with ${newLines.length} line${newLines.length !== 1 ? "s" : ""}.`,
  };
}

interface RenameResult {
  from: string;
  to: string;
}

/**
 * Detect if the edit is a simple rename — same structure, one identifier changed.
 */
function detectRename(oldLines: string[], newLines: string[]): RenameResult | null {
  if (oldLines.length !== newLines.length) return null;

  let renamedFrom: string | null = null;
  let renamedTo: string | null = null;

  for (let i = 0; i < oldLines.length; i++) {
    const oldLine = oldLines[i]!;
    const newLine = newLines[i]!;

    if (oldLine === newLine) continue;

    const oldTokens = tokenize(oldLine);
    const newTokens = tokenize(newLine);

    if (oldTokens.length !== newTokens.length) return null;

    let diffCount = 0;
    let diffFrom = "";
    let diffTo = "";

    for (let j = 0; j < oldTokens.length; j++) {
      if (oldTokens[j] !== newTokens[j]) {
        diffCount++;
        diffFrom = oldTokens[j]!;
        diffTo = newTokens[j]!;
      }
    }

    if (diffCount === 0) continue;

    // All differing tokens on this line must be the same rename
    if (diffCount > 1) {
      // Check if all diffs are the same pair
      let allSame = true;
      let pairFrom = "";
      let pairTo = "";
      for (let j = 0; j < oldTokens.length; j++) {
        if (oldTokens[j] !== newTokens[j]) {
          if (pairFrom === "") {
            pairFrom = oldTokens[j]!;
            pairTo = newTokens[j]!;
          } else if (oldTokens[j] !== pairFrom || newTokens[j] !== pairTo) {
            allSame = false;
            break;
          }
        }
      }
      if (!allSame) return null;
      diffFrom = pairFrom;
      diffTo = pairTo;
    }

    // Verify consistency across lines
    if (renamedFrom === null) {
      renamedFrom = diffFrom;
      renamedTo = diffTo;
    } else if (renamedFrom !== diffFrom || renamedTo !== diffTo) {
      return null; // Multiple different renames — not a simple rename
    }
  }

  if (renamedFrom && renamedTo) {
    return { from: renamedFrom, to: renamedTo };
  }
  return null;
}

/** Split a line into identifier and non-identifier tokens. */
function tokenize(line: string): string[] {
  return line.match(/[a-zA-Z_$][a-zA-Z0-9_$]*|[^a-zA-Z_$\s]+|\s+/g) || [];
}

// --- Structural change extraction ---

export interface StructuralChange {
  type: "added" | "removed" | "modified";
  kind: "function" | "class" | "interface" | "type";
  name: string;
  richDeclaration?: Declaration;
}

/** Regex patterns for extracting named declarations. */
const DECLARATION_PATTERNS: Array<{ kind: StructuralChange["kind"]; pattern: RegExp }> = [
  { kind: "function", pattern: /^(?:export\s+)?(?:async\s+)?function\s+(\w+)/m },
  { kind: "function", pattern: /^def\s+(\w+)/m },
  { kind: "function", pattern: /^(?:pub\s+)?fn\s+(\w+)/m },
  { kind: "function", pattern: /^func\s+(\w+)/m },
  { kind: "class", pattern: /^(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/m },
  { kind: "interface", pattern: /^(?:export\s+)?interface\s+(\w+)/m },
  { kind: "type", pattern: /^(?:export\s+)?type\s+(\w+)\s*=/m },
];

interface NamedDeclaration {
  kind: StructuralChange["kind"];
  name: string;
}

/**
 * Extract named declarations from a code string (basic: kind + name only).
 */
export function extractDeclarations(code: string): NamedDeclaration[] {
  const results: NamedDeclaration[] = [];
  const lines = code.split("\n");

  for (const line of lines) {
    const trimmed = line.trimStart();
    for (const { kind, pattern } of DECLARATION_PATTERNS) {
      const match = pattern.exec(trimmed);
      if (match && match[1]) {
        results.push({ kind, name: match[1] });
        break; // only match one pattern per line
      }
    }
  }

  return results;
}

/**
 * Extract rich declarations from a code string using the code summarizer.
 */
export function extractRichDeclarations(code: string, filePath: string): Declaration[] {
  const summary = summarizeCode(code, filePath);
  return summary.declarations;
}

/**
 * Extract structural changes between old and new code strings.
 * Compares declaration name sets to find added/removed/modified items.
 * When filePath is provided and summarization is enabled, stores rich declarations.
 */
export function extractStructuralChanges(oldStr: string, newStr: string, filePath?: string): StructuralChange[] {
  const summarizeOpts = getSummarizeOptions();
  const useRich = summarizeOpts.enabled && filePath;

  const oldDecls = extractDeclarations(oldStr);
  const newDecls = extractDeclarations(newStr);

  // If summarize enabled, also extract rich declarations for formatting
  let richNewDecls: Declaration[] | undefined;
  if (useRich) {
    richNewDecls = extractRichDeclarations(newStr, filePath);
  }

  const oldMap = new Map<string, NamedDeclaration>();
  for (const d of oldDecls) {
    oldMap.set(`${d.kind}:${d.name}`, d);
  }

  const newMap = new Map<string, NamedDeclaration>();
  for (const d of newDecls) {
    newMap.set(`${d.kind}:${d.name}`, d);
  }

  // Build a map of rich declarations by name for enrichment
  const richMap = new Map<string, Declaration>();
  if (richNewDecls) {
    for (const d of richNewDecls) {
      richMap.set(`${d.kind}:${d.name}`, d);
    }
  }

  const changes: StructuralChange[] = [];

  // Added: in new but not in old
  for (const [key, decl] of newMap) {
    if (!oldMap.has(key)) {
      const rich = richMap.get(key);
      changes.push({
        type: "added",
        kind: decl.kind,
        name: decl.name,
        richDeclaration: rich,
      });
    }
  }

  // Removed: in old but not in new
  for (const [key, decl] of oldMap) {
    if (!newMap.has(key)) {
      changes.push({ type: "removed", kind: decl.kind, name: decl.name });
    }
  }

  // Modified: in both, but code differs — only when there are no structural adds/removes
  const noStructuralChanges = changes.length === 0;
  if (oldStr !== newStr && noStructuralChanges) {
    for (const [key, decl] of newMap) {
      if (oldMap.has(key)) {
        const rich = richMap.get(key);
        changes.push({ type: "modified", kind: decl.kind, name: decl.name, richDeclaration: rich });
      }
    }
  }

  return changes;
}

/**
 * Format structural changes into summary strings for edit formatter.
 * Uses rich declarations (params, return types) when available.
 */
export function formatStructuralChanges(changes: StructuralChange[]): {
  summary: string;
  ttsSummary: string;
} | null {
  if (changes.length === 0) return null;

  const parts: string[] = [];
  for (const change of changes) {
    const verb = change.type === "added" ? "Added" : change.type === "removed" ? "Removed" : "Modified";
    // Use rich declaration formatting if available
    if (change.richDeclaration) {
      parts.push(`${verb} ${formatDeclaration(change.richDeclaration)}`);
    } else {
      parts.push(`${verb} ${change.kind} ${change.name}`);
    }
  }

  const summary = parts.join(". ") + ".";

  // TTS: max 2 names, then "+N more" (always brief, no params)
  const ttsParts: string[] = [];
  const maxTts = 2;
  for (let i = 0; i < Math.min(changes.length, maxTts); i++) {
    const c = changes[i]!;
    const verb = c.type === "added" ? "added" : c.type === "removed" ? "removed" : "modified";
    ttsParts.push(`${verb} ${c.name}`);
  }
  const remaining = changes.length - maxTts;
  const ttsResult = remaining > 0
    ? ttsParts.join(", ") + `, +${remaining} more.`
    : ttsParts.join(", ") + ".";

  return { summary, ttsSummary: ttsResult };
}
