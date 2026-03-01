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
 */

// remark ecosystem is ESM-only; we dynamically import at init time.
// Cached after first load so subsequent calls are synchronous-speed.

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

let cachedProcessor: UnifiedProcessor | null = null;

/**
 * Initialize the remark parser. Must be called once before formatForSpeech.
 * Safe to call multiple times (caches after first load).
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
 * MUST call initFormatter() once before first use.
 */
export function formatForSpeech(text: string): string {
  if (!cachedProcessor) {
    // Fallback: if init wasn't called, return text as-is rather than crash
    return text;
  }

  const tree = cachedProcessor.parse(text);
  return renderNode(tree).trim();
}

// ---------------------------------------------------------------------------
// AST → speech-friendly text rendering
// ---------------------------------------------------------------------------

/**
 * Render an mdast node (and its children) into speech-friendly text.
 */
function renderNode(node: MdastNode): string {
  switch (node.type) {
    case "root":
      return renderChildren(node, "\n\n");

    case "heading": {
      const label = (node.depth ?? 1) <= 2 ? "Heading" : "Subheading";
      const text = renderChildren(node, "");
      return `[${label}] ${text}`;
    }

    case "paragraph":
      return renderChildren(node, "");

    case "text":
      return node.value ?? "";

    case "emphasis":
      // *italic* → just the text (strip the asterisks)
      return renderChildren(node, "");

    case "strong":
      // **bold** → just the text
      return renderChildren(node, "");

    case "delete":
      // ~~strikethrough~~ → [Strikethrough] text [End Strikethrough]
      return `[Strikethrough] ${renderChildren(node, "")} [End Strikethrough]`;

    case "inlineCode":
      // `code` → just the text, no backticks
      return node.value ?? "";

    case "code": {
      // ```python\ncode\n``` → [Python]\ncode\n[End Python]
      const lang = node.lang
        ? capitalizeFirst(node.lang)
        : "Code";
      const code = node.value ?? "";
      return `[${lang}]\n${code}\n[End ${lang}]`;
    }

    case "blockquote": {
      const inner = renderChildren(node, "\n");
      // Prefix each line with [Quote]
      return inner
        .split("\n")
        .map((line) => `[Quote] ${line}`)
        .join("\n");
    }

    case "list":
      return renderList(node);

    case "listItem":
      return renderChildren(node, "\n");

    case "thematicBreak":
      return "[Separator]";

    case "link": {
      const linkText = renderChildren(node, "");
      const url = node.url ?? "";
      // For anchor or relative links, just show the text
      if (url.startsWith("#") || url.startsWith("./")) {
        return linkText;
      }
      return `${linkText} (link: ${url})`;
    }

    case "image": {
      const alt = node.alt ?? "";
      return alt ? `[Image: ${alt}]` : "[Image]";
    }

    case "break":
      return "\n";

    case "html":
      // Strip raw HTML — screen readers shouldn't hear tags
      return "";

    case "table":
      return renderTable(node);

    case "tableRow":
      return ""; // Handled by renderTable

    case "tableCell":
      return ""; // Handled by renderTable

    case "definition":
    case "footnoteDefinition":
    case "footnoteReference":
      // Rarely used in Claude output; pass through text content
      return renderChildren(node, "");

    default:
      // Unknown node type — render children if any, or value
      if (node.children) {
        return renderChildren(node, "");
      }
      return node.value ?? "";
  }
}

/**
 * Render all children of a node, joining with the given separator.
 */
function renderChildren(node: MdastNode, sep: string): string {
  if (!node.children) return "";
  return node.children
    .map(renderNode)
    .filter((s) => s.length > 0)
    .join(sep);
}

/**
 * Render a list node with bullet/number prefixes.
 */
function renderList(node: MdastNode): string {
  if (!node.children) return "";

  const ordered = node.ordered ?? false;
  let counter = node.start ?? 1;

  const items: string[] = [];
  for (const item of node.children) {
    const text = renderChildren(item, "\n");
    if (ordered) {
      items.push(`${counter}. ${text}`);
      counter++;
    } else {
      items.push(`Bullet: ${text}`);
    }
  }
  return items.join("\n");
}

/**
 * Render a table in a screen-reader-friendly format.
 * Tables are tricky — screen readers handle HTML tables well but markdown
 * tables in plain text are just a mess of pipes. We announce row by row.
 */
function renderTable(node: MdastNode): string {
  if (!node.children) return "";

  const rows: string[][] = [];
  for (const row of node.children) {
    if (!row.children) continue;
    const cells: string[] = [];
    for (const cell of row.children) {
      cells.push(renderChildren(cell, " "));
    }
    rows.push(cells);
  }

  if (rows.length === 0) return "";

  const output: string[] = [];
  const headers = rows[0];

  // First row is header
  if (headers && headers.length > 0) {
    output.push(`[Table, ${headers.length} columns]`);
    output.push(`[Header] ${headers.join(" | ")}`);
  }

  // Data rows
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]!;
    // If we have headers, label each cell
    if (headers && headers.length > 0) {
      const labeled = row
        .map((cell, j) => {
          const header = headers[j] ?? `Column ${j + 1}`;
          return `${header}: ${cell}`;
        })
        .join(", ");
      output.push(`[Row ${i}] ${labeled}`);
    } else {
      output.push(`[Row ${i}] ${row.join(" | ")}`);
    }
  }
  output.push("[End Table]");

  return output.join("\n");
}

/**
 * Capitalize first letter of a string.
 */
function capitalizeFirst(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
