/**
 * Code summarizer — extracts rich declarations from code strings.
 * Pure functions, no I/O, no config dependency.
 */

export interface Declaration {
  kind: "function" | "class" | "interface" | "type" | "enum" | "const" | "variable";
  name: string;
  params?: string;
  returnType?: string;
  exported?: boolean;
  async?: boolean;
  abstract?: boolean;
}

export interface ImportInfo {
  source: string;
}

export interface CodeSummary {
  language: string | null;
  imports: ImportInfo[];
  declarations: Declaration[];
}

// --- Language detection ---

export const LANGUAGE_MAP: Record<string, string> = {
  ".ts": "TypeScript",
  ".tsx": "TypeScript",
  ".js": "JavaScript",
  ".jsx": "JavaScript",
  ".py": "Python",
  ".rs": "Rust",
  ".go": "Go",
  ".java": "Java",
  ".cs": "C#",
  ".rb": "Ruby",
  ".swift": "Swift",
  ".kt": "Kotlin",
  ".c": "C",
  ".cpp": "C++",
  ".h": "C/C++ header",
  ".sh": "Shell",
  ".bash": "Shell",
  ".zsh": "Shell",
};

export function detectLanguage(filePath: string): string | null {
  const dotIdx = filePath.lastIndexOf(".");
  if (dotIdx === -1) return "";
  const ext = filePath.slice(dotIdx).toLowerCase();
  return LANGUAGE_MAP[ext] || null;
}

// --- Language-specific patterns ---

interface LanguagePatterns {
  declarations: Array<{
    kind: Declaration["kind"];
    pattern: RegExp;
    groups: {
      name: number;
      params?: number;
      returnType?: number;
    };
    detectExported?: (line: string) => boolean;
    detectAsync?: (line: string) => boolean;
    detectAbstract?: (line: string) => boolean;
  }>;
  imports: RegExp[];
}

const TS_JS_PATTERNS: LanguagePatterns = {
  declarations: [
    {
      kind: "function",
      pattern: /^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+(\w+)\s*(\([^)]*\))(?:\s*:\s*([^\n{]+))?/,
      groups: { name: 1, params: 2, returnType: 3 },
      detectExported: (line) => line.trimStart().startsWith("export"),
      detectAsync: (line) => /\basync\s+function\b/.test(line),
    },
    {
      kind: "class",
      pattern: /^(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?/,
      groups: { name: 1 },
      detectExported: (line) => line.trimStart().startsWith("export"),
      detectAbstract: (line) => /\babstract\s+class\b/.test(line),
    },
    {
      kind: "interface",
      pattern: /^(?:export\s+)?interface\s+(\w+)/,
      groups: { name: 1 },
      detectExported: (line) => line.trimStart().startsWith("export"),
    },
    {
      kind: "type",
      pattern: /^(?:export\s+)?type\s+(\w+)\s*=/,
      groups: { name: 1 },
      detectExported: (line) => line.trimStart().startsWith("export"),
    },
    {
      kind: "enum",
      pattern: /^(?:export\s+)?enum\s+(\w+)/,
      groups: { name: 1 },
      detectExported: (line) => line.trimStart().startsWith("export"),
    },
    {
      kind: "const",
      pattern: /^(?:export\s+)?const\s+(\w+)(?:\s*:\s*([^=\n]+))?/,
      groups: { name: 1, returnType: 2 },
      detectExported: (line) => line.trimStart().startsWith("export"),
    },
  ],
  imports: [
    /^import\s+.*from\s+["']([^"']+)["']/,
    /^import\s+["']([^"']+)["']/,
  ],
};

const PYTHON_PATTERNS: LanguagePatterns = {
  declarations: [
    {
      kind: "function",
      pattern: /^(?:async\s+)?def\s+(\w+)\s*(\([^)]*\))(?:\s*->\s*(.+?))?:/,
      groups: { name: 1, params: 2, returnType: 3 },
      detectAsync: (line) => line.trimStart().startsWith("async"),
    },
    {
      kind: "class",
      pattern: /^class\s+(\w+)(?:\(([^)]*)\))?:/,
      groups: { name: 1 },
    },
  ],
  imports: [
    /^from\s+(\S+)\s+import\b/,
    /^import\s+(\S+)/,
  ],
};

const RUST_PATTERNS: LanguagePatterns = {
  declarations: [
    {
      kind: "function",
      pattern: /^(?:pub(?:\(crate\))?\s+)?(?:async\s+)?fn\s+(\w+)\s*(?:<[^>]*>)?\s*(\([^)]*\))(?:\s*->\s*(.+?))?(?:\s*\{|\s*where)?$/,
      groups: { name: 1, params: 2, returnType: 3 },
      detectExported: (line) => line.trimStart().startsWith("pub"),
      detectAsync: (line) => /\basync\s+fn\b/.test(line),
    },
    {
      kind: "class",
      pattern: /^(?:pub(?:\(crate\))?\s+)?struct\s+(\w+)/,
      groups: { name: 1 },
      detectExported: (line) => line.trimStart().startsWith("pub"),
    },
    {
      kind: "enum",
      pattern: /^(?:pub(?:\(crate\))?\s+)?enum\s+(\w+)/,
      groups: { name: 1 },
      detectExported: (line) => line.trimStart().startsWith("pub"),
    },
    {
      kind: "interface",
      pattern: /^(?:pub(?:\(crate\))?\s+)?trait\s+(\w+)/,
      groups: { name: 1 },
      detectExported: (line) => line.trimStart().startsWith("pub"),
    },
  ],
  imports: [
    /^use\s+([^;]+)/,
  ],
};

const GO_PATTERNS: LanguagePatterns = {
  declarations: [
    {
      kind: "function",
      pattern: /^func\s+(?:\(\w+\s+\*?\w+\)\s+)?(\w+)\s*(\([^)]*\))(?:\s+(\S.+?))?(?:\s*\{)?$/,
      groups: { name: 1, params: 2, returnType: 3 },
      detectExported: (line) => {
        const match = /^func\s+(?:\(\w+\s+\*?\w+\)\s+)?(\w+)/.exec(line.trimStart());
        return match !== null && match[1] !== undefined && /^[A-Z]/.test(match[1]);
      },
    },
    {
      kind: "class",
      pattern: /^type\s+(\w+)\s+struct/,
      groups: { name: 1 },
      detectExported: (line) => {
        const match = /^type\s+(\w+)/.exec(line.trimStart());
        return match !== null && match[1] !== undefined && /^[A-Z]/.test(match[1]);
      },
    },
    {
      kind: "interface",
      pattern: /^type\s+(\w+)\s+interface/,
      groups: { name: 1 },
      detectExported: (line) => {
        const match = /^type\s+(\w+)/.exec(line.trimStart());
        return match !== null && match[1] !== undefined && /^[A-Z]/.test(match[1]);
      },
    },
  ],
  imports: [
    /^import\s+\(/,
    /^import\s+"([^"]+)"/,
  ],
};

const JAVA_CS_PATTERNS: LanguagePatterns = {
  declarations: [
    {
      kind: "class",
      pattern: /^(?:public|private|protected|static|abstract|final|\s)*(?:class|interface|enum)\s+(\w+)/,
      groups: { name: 1 },
      detectExported: (line) => /\bpublic\b/.test(line),
      detectAbstract: (line) => /\babstract\b/.test(line),
    },
    {
      kind: "function",
      pattern: /^(?:public|private|protected|static|abstract|final|\s)*(?:\w+(?:<[^>]+>)?)\s+(\w+)\s*(\([^)]*\))/,
      groups: { name: 1, params: 2 },
      detectExported: (line) => /\bpublic\b/.test(line),
    },
  ],
  imports: [
    /^import\s+([\w.]+)/,
    /^using\s+([\w.]+)/,
  ],
};

const SHELL_PATTERNS: LanguagePatterns = {
  declarations: [
    {
      kind: "function",
      pattern: /^(?:function\s+)?(\w+)\s*\(\)/,
      groups: { name: 1 },
    },
    {
      kind: "variable",
      pattern: /^(\w+)=/,
      groups: { name: 1 },
    },
  ],
  imports: [],
};

function getPatternsForLanguage(language: string | null): LanguagePatterns | null {
  switch (language) {
    case "TypeScript":
    case "JavaScript":
      return TS_JS_PATTERNS;
    case "Python":
      return PYTHON_PATTERNS;
    case "Rust":
      return RUST_PATTERNS;
    case "Go":
      return GO_PATTERNS;
    case "Java":
    case "C#":
      return JAVA_CS_PATTERNS;
    case "Shell":
      return SHELL_PATTERNS;
    default:
      return TS_JS_PATTERNS; // fallback to TS/JS patterns for unknown
  }
}

// --- Core functions ---

export function summarizeCode(code: string, filePath: string): CodeSummary {
  const language = detectLanguage(filePath);
  const patterns = getPatternsForLanguage(language);

  if (!code || !patterns) {
    return { language, imports: [], declarations: [] };
  }

  const lines = code.split("\n");
  const imports: ImportInfo[] = [];
  const declarations: Declaration[] = [];
  const seen = new Set<string>(); // deduplicate by kind:name

  for (const line of lines) {
    const trimmed = line.trimStart();

    // Check imports
    for (const importPattern of patterns.imports) {
      const match = importPattern.exec(trimmed);
      if (match) {
        const source = match[1];
        if (source) {
          imports.push({ source });
        }
        break;
      }
    }

    // Check declarations
    for (const declPattern of patterns.declarations) {
      const match = declPattern.pattern.exec(trimmed);
      if (match && match[declPattern.groups.name]) {
        const name = match[declPattern.groups.name]!;
        const key = `${declPattern.kind}:${name}`;
        if (seen.has(key)) break; // deduplicate overloads
        seen.add(key);

        const decl: Declaration = {
          kind: declPattern.kind,
          name,
        };

        // Extract params
        if (declPattern.groups.params) {
          const rawParams = match[declPattern.groups.params];
          if (rawParams) {
            decl.params = truncateString(rawParams.trim(), 80);
          }
        }

        // Extract return type
        if (declPattern.groups.returnType) {
          const rawReturn = match[declPattern.groups.returnType];
          if (rawReturn) {
            decl.returnType = rawReturn.trim().replace(/\s*\{$/, "");
          }
        }

        // Detect modifiers
        if (declPattern.detectExported) {
          decl.exported = declPattern.detectExported(line);
        }
        if (declPattern.detectAsync) {
          decl.async = declPattern.detectAsync(line);
        }
        if (declPattern.detectAbstract) {
          decl.abstract = declPattern.detectAbstract(line);
        }

        declarations.push(decl);
        break; // only match one pattern per line
      }
    }
  }

  return { language, imports, declarations };
}

export function formatDeclaration(decl: Declaration): string {
  const parts: string[] = [];

  if (decl.exported) parts.push("export");
  if (decl.abstract) parts.push("abstract");
  if (decl.async) parts.push("async");
  parts.push(decl.kind);
  parts.push(decl.name);

  let result = parts.join(" ");

  if (decl.params) {
    result += decl.params;
  }

  if (decl.returnType) {
    result += `: ${decl.returnType}`;
  }

  return result;
}

export function formatCodeSummary(
  summary: CodeSummary,
  opts: { maxDeclarations: number; maxTtsNames: number },
): { contextText: string; ttsText: string } {
  if (summary.declarations.length === 0) {
    return { contextText: "", ttsText: "" };
  }

  // --- contextText: rich declaration descriptions ---
  const declParts: string[] = [];
  const limit = Math.min(summary.declarations.length, opts.maxDeclarations);
  for (let i = 0; i < limit; i++) {
    declParts.push(formatDeclaration(summary.declarations[i]!));
  }
  const remaining = summary.declarations.length - limit;

  let contextText = "Contains: " + declParts.join(", ");
  if (remaining > 0) {
    contextText += `, +${remaining} more`;
  }
  contextText += ".";

  // Add import summary
  if (summary.imports.length > 0) {
    const importSources = summary.imports.map((i) => i.source);
    const maxImports = 5;
    const shownImports = importSources.slice(0, maxImports);
    const remainingImports = importSources.length - maxImports;
    let importText = ` ${summary.imports.length} import${summary.imports.length !== 1 ? "s" : ""} from ${shownImports.join(", ")}`;
    if (remainingImports > 0) {
      importText += `, +${remainingImports} more`;
    }
    importText += ".";
    contextText += importText;
  }

  // --- ttsText: brief names only ---
  const ttsLimit = Math.min(summary.declarations.length, opts.maxTtsNames);
  const ttsNames: string[] = [];
  for (let i = 0; i < ttsLimit; i++) {
    ttsNames.push(summary.declarations[i]!.name);
  }
  const ttsRemaining = summary.declarations.length - ttsLimit;

  let ttsText: string;
  if (ttsNames.length === 1) {
    ttsText = `Contains ${ttsNames[0]}`;
  } else if (ttsNames.length === 2) {
    ttsText = `Contains ${ttsNames[0]} and ${ttsNames[1]}`;
  } else {
    const last = ttsNames.pop()!;
    ttsText = `Contains ${ttsNames.join(", ")}, and ${last}`;
  }

  if (ttsRemaining > 0) {
    ttsText += `, +${ttsRemaining} more`;
  }
  ttsText += ".";

  return { contextText, ttsText };
}

function truncateString(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 3) + "...";
}
