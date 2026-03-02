/**
 * Markdown-to-speech formatter built on remark's AST parser.
 *
 * Transforms markdown formatting into screen-reader-friendly audio cues.
 * Sighted users see ```python as a colored code block. Blind users need
 * to HEAR "[Python]" and "[End Python]" instead of "backtick backtick backtick".
 *
 * Uses unified + remark-parse for a proper markdown AST, which handles
 * edge cases that regex can't: nested formatting, code blocks containing
 * markdown-like text, indented fences, etc.
 *
 * Announcement phrasing is controlled by verbosity presets.
 */

// remark ecosystem is ESM-only. When bundled via esbuild, the imports
// resolve at build time and the processor is created synchronously.
// For unbundled use (tests), we fall back to dynamic import via initFormatter().

type UnifiedProcessor = {
  parse(text: string): MdastNode;
};

interface MdastNode {
  type: string;
  children?: MdastNode[];
  value?: string;
  depth?: number;       // heading
  lang?: string | null; // code
  ordered?: boolean;    // list
  start?: number | null;// list
  url?: string;         // link, image
  alt?: string;         // image
  title?: string;       // link, image
}

/**
 * Internal format strings for announcement phrasing.
 * Use {placeholders} for dynamic values. Every key has a sensible default.
 */
interface SpeechFormatOptions {
  /** Template for code block start. {lang} is replaced. Default: "[{lang}]" */
  codeBlockStart?: string;
  /** Template for code block end. {lang} is replaced. Default: "[End {lang}]" */
  codeBlockEnd?: string;
  /** Fallback language name. Default: "Code" */
  codeBlockDefault?: string;
  /** Heading prefix for h1-h2. Default: "[Heading]" */
  headingPrefix?: string;
  /** Heading prefix for h3-h6. Default: "[Subheading]" */
  subheadingPrefix?: string;
  /** Quote line prefix. Default: "[Quote]" */
  quotePrefix?: string;
  /** Table start. {cols} replaced. Default: "[Table, {cols} columns]" */
  tableStart?: string;
  /** Table end. Default: "[End Table]" */
  tableEnd?: string;
  /** Table header row prefix. Default: "[Header]" */
  tableHeader?: string;
  /** Table data row prefix. {n} replaced. Default: "[Row {n}]" */
  tableRow?: string;
  /** Unordered list item prefix. Default: "Bullet:" */
  bulletPrefix?: string;
  /** Thematic break text. Default: "[Separator]" */
  separator?: string;
  /** Image with alt. {alt} replaced. Default: "[Image: {alt}]" */
  imageLabel?: string;
  /** Image without alt. Default: "[Image]" */
  imageLabelNoAlt?: string;
  /** Strikethrough start. Default: "[Strikethrough]" */
  strikethroughStart?: string;
  /** Strikethrough end. Default: "[End Strikethrough]" */
  strikethroughEnd?: string;
}

// Canonical phrasing defaults. These match packages/browser/phrasing.js
// exactly. When bundled by esbuild, the browser phrasing module is resolved
// at build time. For tsc-compiled output (CLI), these inline defaults are
// used directly — no runtime require with a fragile relative path.
const DEFAULT_OPTIONS: Required<SpeechFormatOptions> = {
  codeBlockStart: "[{lang}]",
  codeBlockEnd: "[End {lang}]",
  codeBlockDefault: "Code",
  headingPrefix: "[Heading]",
  subheadingPrefix: "[Subheading]",
  quotePrefix: "[Quote]",
  tableStart: "[Table, {cols} columns]",
  tableEnd: "[End Table]",
  tableHeader: "[Header]",
  tableRow: "[Row {n}]",
  bulletPrefix: "Bullet:",
  separator: "[Separator]",
  imageLabel: "[Image: {alt}]",
  imageLabelNoAlt: "[Image]",
  strikethroughStart: "[Strikethrough]",
  strikethroughEnd: "[End Strikethrough]",
};

function tpl(template: string, vars: Record<string, string | number>): string {
  let result = template;
  for (const key of Object.keys(vars)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, "g"), String(vars[key]));
  }
  return result;
}

let cachedProcessor: UnifiedProcessor | null = null;

function buildProcessor(): UnifiedProcessor | null {
  try {
    // When bundled by esbuild, these requires are resolved at build time.
    /* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */
    const { unified } = require("unified") as any;
    const remarkParse = require("remark-parse") as any;
    const remarkGfm = require("remark-gfm") as any;
    /* eslint-enable */
    const rp = remarkParse.default ?? remarkParse;
    const rg = remarkGfm.default ?? remarkGfm;
    return unified().use(rp).use(rg) as unknown as UnifiedProcessor;
  } catch {
    return null;
  }
}

// Try synchronous init at module load (works when bundled via esbuild)
cachedProcessor = buildProcessor();

/**
 * Initialize the remark parser. No-op if already initialized (e.g. via esbuild bundle).
 * Falls back to dynamic import for test environments that don't bundle.
 */
export async function initFormatter(): Promise<void> {
  if (cachedProcessor) return;
  const { unified } = await import("unified");
  const remarkParse = await import("remark-parse");
  const remarkGfm = await import("remark-gfm");
  cachedProcessor = unified()
    .use(remarkParse.default ?? remarkParse)
    .use(remarkGfm.default ?? remarkGfm) as unknown as UnifiedProcessor;
}

/**
 * Format a complete response for screen reader consumption.
 * Parses markdown into an AST and renders it as speech-friendly plain text.
 *
 * Works synchronously when bundled via esbuild (processor created at module load).
 * For unbundled use, call initFormatter() once before first use.
 */
export function formatForSpeech(text: string, options?: Partial<SpeechFormatOptions>): string {
  if (!cachedProcessor) {
    return text;
  }

  const opts = { ...DEFAULT_OPTIONS, ...options };
  const tree = cachedProcessor.parse(text);
  return renderNode(tree, opts).trim();
}

// ---------------------------------------------------------------------------
// AST → speech-friendly text rendering
// ---------------------------------------------------------------------------

function renderNode(node: MdastNode, opts: Required<SpeechFormatOptions>): string {
  switch (node.type) {
    case "root":
      return renderChildren(node, "\n\n", opts);

    case "heading": {
      const label = (node.depth ?? 1) <= 2 ? opts.headingPrefix : opts.subheadingPrefix;
      const text = renderChildren(node, "", opts);
      return `${label} ${text}`;
    }

    case "paragraph":
      return renderChildren(node, "", opts);

    case "text":
      return node.value ?? "";

    case "emphasis":
      return renderChildren(node, "", opts);

    case "strong":
      return renderChildren(node, "", opts);

    case "delete":
      return `${opts.strikethroughStart} ${renderChildren(node, "", opts)} ${opts.strikethroughEnd}`;

    case "inlineCode":
      return node.value ?? "";

    case "code": {
      const lang = node.lang
        ? capitalizeFirst(node.lang)
        : opts.codeBlockDefault;
      const code = node.value ?? "";
      const start = tpl(opts.codeBlockStart, { lang });
      const end = tpl(opts.codeBlockEnd, { lang });
      return `${start}\n${code}\n${end}`;
    }

    case "blockquote": {
      const inner = renderChildren(node, "\n", opts);
      return inner
        .split("\n")
        .map((line) => `${opts.quotePrefix} ${line}`)
        .join("\n");
    }

    case "list":
      return renderList(node, opts);

    case "listItem":
      return renderChildren(node, "\n", opts);

    case "thematicBreak":
      return opts.separator;

    case "link": {
      const linkText = renderChildren(node, "", opts);
      const url = node.url ?? "";
      if (url.startsWith("#") || url.startsWith("./")) {
        return linkText;
      }
      return `${linkText} (link: ${url})`;
    }

    case "image": {
      const alt = node.alt ?? "";
      return alt ? tpl(opts.imageLabel, { alt }) : opts.imageLabelNoAlt;
    }

    case "break":
      return "\n";

    case "html":
      return "";

    case "table":
      return renderTable(node, opts);

    case "tableRow":
      return "";

    case "tableCell":
      return "";

    case "definition":
    case "footnoteDefinition":
    case "footnoteReference":
      return renderChildren(node, "", opts);

    default:
      if (node.children) {
        return renderChildren(node, "", opts);
      }
      return node.value ?? "";
  }
}

function renderChildren(node: MdastNode, sep: string, opts: Required<SpeechFormatOptions>): string {
  if (!node.children) return "";
  return node.children
    .map((child) => renderNode(child, opts))
    .filter((s) => s.length > 0)
    .join(sep);
}

function renderList(node: MdastNode, opts: Required<SpeechFormatOptions>): string {
  if (!node.children) return "";

  const ordered = node.ordered ?? false;
  let counter = node.start ?? 1;

  const items: string[] = [];
  for (const item of node.children) {
    const text = renderChildren(item, "\n", opts);
    if (ordered) {
      items.push(`${counter}. ${text}`);
      counter++;
    } else {
      items.push(`${opts.bulletPrefix} ${text}`);
    }
  }
  return items.join("\n");
}

function renderTable(node: MdastNode, opts: Required<SpeechFormatOptions>): string {
  if (!node.children) return "";

  const rows: string[][] = [];
  for (const row of node.children) {
    if (!row.children) continue;
    const cells: string[] = [];
    for (const cell of row.children) {
      cells.push(renderChildren(cell, " ", opts));
    }
    rows.push(cells);
  }

  if (rows.length === 0) return "";

  const output: string[] = [];
  const headers = rows[0];

  if (headers && headers.length > 0) {
    output.push(tpl(opts.tableStart, { cols: headers.length }));
    output.push(`${opts.tableHeader} ${headers.join(" | ")}`);
  }

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]!;
    if (headers && headers.length > 0) {
      const labeled = row
        .map((cell, j) => {
          const header = headers[j] ?? `Column ${j + 1}`;
          return `${header}: ${cell}`;
        })
        .join(", ");
      output.push(`${tpl(opts.tableRow, { n: i })} ${labeled}`);
    } else {
      output.push(`${tpl(opts.tableRow, { n: i })} ${row.join(" | ")}`);
    }
  }
  output.push(opts.tableEnd);

  return output.join("\n");
}

function capitalizeFirst(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
